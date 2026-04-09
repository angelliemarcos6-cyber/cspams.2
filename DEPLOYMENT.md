# Deployment (Vercel SPA Proxy + Sanctum/Bearer Auth)

This project supports **Sanctum stateful cookie sessions** (httpOnly) and **bearer tokens**. Production correctness depends on a few environment values matching your deployed frontend/backend hosts.

## Checklist

### 1) Set correct URLs

- `APP_URL` = backend base URL (e.g., `https://api.example.com`)
- `FRONTEND_URL` = frontend base URL (e.g., `https://app.example.com`)
- `VITE_API_BASE_URL` = backend base URL from the frontend's perspective (usually same as `APP_URL`)
  - When Vercel rewrites `/api`, `/sanctum`, and `/broadcasting` to Render, keep this as `/` so the browser stays on the Vercel origin.

Notes:

- Even when the browser only talks to `https://your-app.vercel.app/...`, Render should still set `APP_URL`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, and `SANCTUM_STATEFUL_DOMAINS` to the real frontend/backend hosts so Laravel's production checks stay accurate.
- `frontend/vercel.json` currently hardcodes `https://cspams-2.onrender.com`. Update that file if your Render service URL changes.

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
- `SESSION_SAME_SITE=lax` for same-site subdomains or Vercel proxy rewrites (common case)
- `SESSION_SAME_SITE=none` only when the frontend and API are on different "sites" and you truly need cross-site cookies (must be paired with `SESSION_SECURE_COOKIE=true`)

Notes:

- `SESSION_DOMAIN` can usually remain `null` (host-only cookie on the API domain). Only set it when you explicitly need a shared domain cookie.

### 5) Use a direct or session-pooled Neon connection for row locks

This app uses `SELECT ... FOR UPDATE` in a few transactional paths. On Neon, prefer the direct connection string or a session-pooled endpoint. Transaction-pooled pgBouncer connections can break row-level locks between statements.

### 6) Configure frontend realtime envs

If you use Reverb/WebSocket features on Vercel, set these in the Vercel dashboard to the Render backend host:

- `VITE_REVERB_HOST=your-backend.onrender.com`
- `VITE_REVERB_PORT=443`
- `VITE_REVERB_SCHEME=https`

### 7) Clear cached config after env changes

After updating environment values on the server:

- `php artisan optimize:clear`
- `php artisan config:cache`

### 8) Ensure sessions storage exists

If using `SESSION_DRIVER=database`, ensure migrations ran and the `sessions` table exists:

- `php artisan migrate --force`

### 9) Run the queue worker for MFA email

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
