# Deployment (Cookie-Session SPA Auth)

## Vercel + Render + NeonDB

This is the recommended production stack. Vercel hosts the static React frontend, Render hosts the Laravel API, and NeonDB provides serverless PostgreSQL.

### Architecture overview

```
Browser
  └─ HTTPS ─► Vercel (React SPA, static)
                └─ API calls ─► Render Web Service (Laravel)
                                  └─ NeonDB (PostgreSQL, serverless)
                Render Worker Service (php artisan queue:work)
```

### NeonDB (database)

1. Create a project on [neon.tech](https://neon.tech). Copy the **non-pooled** connection string.
2. On Render, set environment variables for the API service:

```
DB_CONNECTION=pgsql
DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
DB_SSLMODE=require
DB_PGBOUNCER=false
```

> **Pooler (optional):** NeonDB also provides a PgBouncer pooled endpoint (hostname ends in `-pooler`, port 6432). It reduces cold-start latency on serverless connections. If you use it, set `DB_PGBOUNCER=true` alongside the pooled `DATABASE_URL`. Do **not** use the pooled endpoint for migrations or `queue:work` — use the direct non-pooled URL for those.

### Render — API Web Service

**Build command:**
```bash
composer install --no-dev --optimize-autoloader && php artisan migrate --force && php artisan optimize
```

**Start command:**
```bash
php artisan serve --host=0.0.0.0 --port=$PORT
```

**Required environment variables (add in Render dashboard):**

```
APP_ENV=production
APP_KEY=base64:...               # php artisan key:generate --show
APP_DEBUG=false
APP_URL=https://your-app.onrender.com

FRONTEND_URL=https://your-app.vercel.app
VITE_API_BASE_URL=https://your-app.onrender.com

DB_CONNECTION=pgsql
DATABASE_URL=postgresql://...?sslmode=require
DB_SSLMODE=require

# Cross-site cookie auth — Vercel and Render are on different domains
SESSION_DRIVER=database
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=none
SANCTUM_STATEFUL_DOMAINS=your-app.vercel.app
CORS_ALLOWED_ORIGINS=https://your-app.vercel.app

# Render has no persistent disk — use database cache
CACHE_STORE=database

QUEUE_CONNECTION=database

MAIL_MAILER=resend            # or mailgun / smtp
RESEND_KEY=re_...             # get from resend.com
MAIL_FROM_ADDRESS=noreply@yourdomain.com
MAIL_FROM_NAME=CSPAMS

CSPAMS_MONITOR_MFA_ENABLED=true
CSPAMS_MONITOR_MFA_TEST_CODE=   # leave blank in production
CSPAMS_ENFORCE_REQUIRED_PASSWORD_RESET=true
CSPAMS_REQUIRE_SETUP_LINK_FOR_SEEDED_SCHOOL_HEADS=true
```

> **Note:** `SESSION_SAME_SITE=none` **requires** `SESSION_SECURE_COOKIE=true`. Browsers reject `SameSite=None` cookies served over HTTP.

### Render — Background Worker Service

Create a **second** Render service (type: Background Worker) pointing to the same repo.

**Start command:**
```bash
php artisan queue:work --verbose --tries=3 --timeout=90
```

Give it the same environment variables as the web service. Without this worker, MFA code emails and account setup emails are never sent.

### Vercel — Frontend

Add one environment variable in the Vercel project settings:

```
VITE_API_BASE_URL=https://your-app.onrender.com
```

Trigger a redeploy after adding it so the value is baked into the production build.

### First deploy checklist

- [ ] NeonDB project created, connection string copied
- [ ] Render Web Service created with correct build + start commands
- [ ] All environment variables set on Render
- [ ] Render Worker Service created with same env vars
- [ ] `VITE_API_BASE_URL` set on Vercel, frontend redeployed
- [ ] Run smoke test (section below) against the live URLs
- [ ] `php artisan app:check-production-config` exits 0

---

This project's SPA uses **Sanctum stateful cookie sessions** (httpOnly). Production correctness depends on a few environment values matching your deployed frontend/backend hosts.

## Checklist

### 1) Set correct URLs

- `APP_URL` = backend base URL (e.g., `https://api.example.com`)
- `FRONTEND_URL` = frontend base URL (e.g., `https://app.example.com`)
- `VITE_API_BASE_URL` = backend base URL from the frontend's perspective (usually same as `APP_URL`)
  - Required in production builds; the frontend throws on startup if missing.

### 2) Configure Sanctum stateful domains (hosts, not full URLs)

`SANCTUM_STATEFUL_DOMAINS` must include the frontend host (and typically the backend host):

- Example: `SANCTUM_STATEFUL_DOMAINS=app.example.com,api.example.com`

### 3) Configure credentialed CORS (origins, full scheme+host(+port))

`CORS_ALLOWED_ORIGINS` must include the frontend origin:

- Example: `CORS_ALLOWED_ORIGINS=https://app.example.com`

Cookie auth requires `supports_credentials=true` (already set in `config/cors.php`).

### 4) Configure secure session cookies

Recommended production/staging values:

- `SESSION_SECURE_COOKIE=true`
- `SESSION_HTTP_ONLY=true`
- `SESSION_LIFETIME=120` (or another short value you're comfortable with)
- `SESSION_SAME_SITE=lax` for same-site subdomains (common case)
- `SESSION_SAME_SITE=none` only when the frontend and API are on different "sites" and you truly need cross-site cookies (must be paired with `SESSION_SECURE_COOKIE=true`)

Notes:

- `SESSION_DOMAIN` can usually remain `null` (host-only cookie on the API domain). Only set it when you explicitly need a shared domain cookie.

### 5) Clear cached config after env changes

After updating environment values on the server:

- `php artisan optimize:clear`
- `php artisan config:cache`

### 6) Ensure sessions storage exists

If using `SESSION_DRIVER=database`, ensure migrations ran and the `sessions` table exists:

- `php artisan migrate --force`

### 7) Run the queue worker for MFA email

`MonitorMfaCodeNotification` is queued (`ShouldQueue`). Without a running worker the MFA code email is never delivered and monitor sign-in stalls at the MFA step.

**Local / development:**

```bash
php artisan queue:table   # only needed once, before first migrate
php artisan migrate
php artisan queue:work
```

**Production (long-lived process):**

```bash
php artisan queue:work --verbose --tries=3 --timeout=90
```

On Render, Railway, Fly.io, or similar PaaS platforms, run this as a separate worker service so it restarts automatically on failure. Make sure the worker's environment variables match the API server's (same `APP_KEY`, same `QUEUE_CONNECTION`, same DB connection).

## Deploy sequence

Run these in order on every deploy:

```bash
php artisan migrate --force
php artisan app:check-production-config   # exits non-zero if config is unsafe
php artisan optimize
```

The config-check command exits with a non-zero code and prints the list of failing checks if the environment is misconfigured, making it safe to gate deploys on it.

## Production/Staging boot guard

`app/Providers/AppServiceProvider.php` enforces a safe baseline on every request in `production`/`staging` and will refuse to boot if critical auth/session values are unsafe or inconsistent (debug mode, MFA test knobs, mailer safety, token TTL, password-reset enforcement, secure cookie settings). The full cross-origin CORS/Sanctum audit is deferred to the deploy-time `app:check-production-config` command above.

## Smoke test

After deploying, verify these flows manually before announcing the release.

**A — School Head login:**
1. Enter school code → sign in.
2. Refresh the page — confirm session restores.
3. Log out → refresh again — confirm session is gone.

**B — Monitor login with MFA:**
1. Enter monitor email + password → confirm the MFA challenge appears.
2. Confirm the MFA code email actually arrives (requires the queue worker to be running).
3. Complete MFA → refresh — confirm session restores.

**C — Failure paths:**
1. Stop the backend temporarily and attempt login — confirm the frontend shows a timeout/error rather than hanging forever.
2. Attempt logout with the backend unavailable — confirm the UI does not silently fake a clean logout.
