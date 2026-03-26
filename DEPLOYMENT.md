# Deployment (Cookie-Session SPA Auth)

This project’s SPA uses **Sanctum stateful cookie sessions** (httpOnly). Production correctness depends on a few environment values matching your deployed frontend/backend hosts.

## Checklist

### 1) Set correct URLs

- `APP_URL` = backend base URL (e.g., `https://api.example.com`)
- `FRONTEND_URL` = frontend base URL (e.g., `https://app.example.com`)
- `VITE_API_BASE_URL` = backend base URL from the frontend’s perspective (usually same as `APP_URL`)

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
- `SESSION_LIFETIME=120` (or another short value you’re comfortable with)
- `SESSION_SAME_SITE=lax` for same-site subdomains (common case)
- `SESSION_SAME_SITE=none` only when the frontend and API are on different “sites” and you truly need cross-site cookies (must be paired with `SESSION_SECURE_COOKIE=true`)

Notes:

- `SESSION_DOMAIN` can usually remain `null` (host-only cookie on the API domain). Only set it when you explicitly need a shared domain cookie.

### 5) Clear cached config after env changes

After updating environment values on the server:

- `php artisan optimize:clear`
- `php artisan config:cache`

### 6) Ensure sessions storage exists

If using `SESSION_DRIVER=database`, ensure migrations ran and the `sessions` table exists:

- `php artisan migrate --force`

## Production/Staging boot guard

`app/Providers/AppServiceProvider.php` enforces a safe baseline in `production`/`staging` and will refuse to boot if critical auth/session values are unsafe or inconsistent (debug mode, MFA test knobs, mailer safety, token TTL, password-reset enforcement, secure cookie settings, and cross-origin Sanctum/CORS wiring).

