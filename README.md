# CSPAMS

Centralized Student Performance Analytics and Monitoring System (CSPAMS) for DepEd SMM&E workflows.

## Implemented Scope

- Role-based authentication (`monitor`, `school_head`) with custom Filament auth page and SPA login.
- Master data and learner management:
  - Schools
  - Academic Years
  - Sections
  - Students (LRN-based tracking)
- Learner lifecycle tracking:
  - Status management (`enrolled`, `at_risk`, `transferee`, `returning`, `dropped_out`, `completer`, `graduated`)
  - Status timeline logs
- Performance tracking:
  - Metric catalog
  - Learner performance records by period
- Reports:
  - Student and teacher history panels
  - CSV exports for student and teacher records
  - Indicator workflow and school summary status views
- Governance and security:
  - Spatie role/permission integration
  - Scoped access by role and school
  - Audit logging for create/update/delete model actions
- Dashboard analytics:
  - KPI overview
  - Lifecycle distribution
  - Submission snapshot
  - At-risk watchlist
  - Status transition trend
- API sync layer:
  - Sanctum authentication
  - Dashboard records endpoints with sync metadata and ETag-based conditional refresh

## Authentication and Session Flow

- `monitor` signs in using email.
- `school_head` signs in using a **6-digit school code**.
- SPA authentication uses Sanctum **stateful cookie** sessions (httpOnly). The frontend never stores bearer tokens in browser storage.
- Bearer tokens are issued only for non-browser clients (e.g., API tools) and should be configured as short-lived.
- Password reset by email (monitor + school head):
  - `POST /api/auth/forgot-password` (optional: `role=monitor|school_head`)
  - `POST /api/auth/reset-password` (optional: `role=monitor|school_head`)
- Monitor dashboard School Head account recovery:
  - `POST /api/dashboard/records/{school}/school-head-account/setup-link` (`pending_setup` only)
  - `POST /api/dashboard/records/{school}/school-head-account/setup-link/recover` (`archived` only; requires monitor verification + reason)
  - `POST /api/dashboard/records/{school}/school-head-account/password-reset-link` (active only; requires a reason)
  - One-time links are delivered via email and are **never returned in JSON responses**. In local/dev with `MAIL_MAILER=log|array`, check logs/test inboxes.
- Monitor MFA reset recovery (when `CSPAMS_MONITOR_MFA_ENABLED=true`):
  - `POST /api/auth/mfa/reset/request` (submit request)
  - `POST /api/auth/mfa/reset/complete` (complete with approval token + generates new backup codes)
  - `GET /api/auth/mfa/reset/requests` (list pending requests for approval)
  - `POST /api/auth/mfa/reset/requests/{ticket}/approve` (approve; approval token is emailed to the requester)
  - `POST /api/auth/mfa/backup-codes/regenerate` (authenticated; generates a new set)
- If an account is marked `must_reset_password` and `CSPAMS_ENFORCE_REQUIRED_PASSWORD_RESET=true`, sign-in is blocked until password reset is completed via:
  - `POST /api/auth/reset-required-password` (current password + new password)
- Production/staging always enforce required-password-reset; you may disable it in local/dev for smoother testing.
- SPA login supports the reset-required flow in-page (current password + new password + confirmation).
- Sign-out behavior:
  - frontend calls `POST /api/auth/logout` to invalidate the session, then clears local user state
  - no bearer token is stored in `sessionStorage`/`localStorage`

## School Head Account Lifecycle

School Head accounts follow a monitor-controlled lifecycle. Login is never
allowed until the Division Monitor explicitly activates the account.

1. **Pending Setup** (`pending_setup`)
   - The Division Monitor creates the School Head account.
   - A one-time setup link is emailed to the School Head.
   - The account cannot sign in.
2. **Pending Verification** (`pending_verification`)
   - The School Head completes setup by visiting the link and setting a password.
   - Email is marked verified; `account_status` becomes `pending_verification`.
   - The account still cannot sign in — the Division Monitor must activate it.
   - Login attempts return HTTP 403 with `requiresMonitorApproval: true`.
3. **Active** (`active`)
   - The Division Monitor activates the account from the monitor dashboard:
     `POST /api/dashboard/records/{school}/school-head-account/activate`
   - Activation records `verified_by_user_id`, `verified_at`, and optional `verification_notes`.
   - Only active accounts can sign in.

Recovery / admin actions (monitor dashboard):

| Account State         | Recommended Action                |
|-----------------------|-----------------------------------|
| `pending_setup`       | Reissue setup link                |
| `pending_verification`| Activate account                  |
| `active`              | Send password reset link          |
| `suspended`/`locked`  | Restore via status update         |
| `archived`            | Use the explicit setup-link recovery action |

> **Note:** Password reset links cannot be issued for `pending_setup` or
> `pending_verification` accounts. Use setup link or activation instead.
>
> If the `account_setup_tokens` table is missing at runtime, CSPAMS falls back to
> cache-backed setup-token storage. It only fails if both database and cache-backed
> storage are unavailable, and that failure is logged with an operator-facing message.

## Indicator Compliance Workflow (API)

Implemented API workflow for school-level indicator compliance packages:

- `GET /api/indicators/submissions`
- `POST /api/indicators/submissions`
- `GET /api/indicators/submissions/{submission}`
- `POST /api/indicators/submissions/{submission}/submit`
- `POST /api/indicators/submissions/{submission}/review`
- `GET /api/indicators/submissions/{submission}/history`

Role flow:

- `school_head`: encode indicators for own school and submit to monitor
- `monitor`: division-wide visibility and validate/return indicator submissions

## TARGETS-MET KPI Auto-Calculation

- KPI indicators in TARGETS-MET are auto-calculated server-side from synchronized records (students, sections, teachers, school/resource context).
- Auto-calculated KPI rows are enforced on save/submit; manual payload values for these KPIs are replaced by derived values.
- KPI metric metadata includes `isAutoCalculated` so the frontend can render these rows as read-only.
- Rolling school-year matrix window uses a 5-year range anchored from `2022-2023` and moves forward by school year.
- Historical gaps are backfilled using nearest available values, and target values are derived from previous-year actuals.

## School Code Policy

- School code format is standardized system-wide as **exactly 6 digits**.
- Leading/trailing whitespace is trimmed during login and recovery requests.
- Safe separator noise such as spaces, hyphens, underscores, and periods is collapsed before lookup.
- Alphabetic or ambiguous school-code input is rejected.
- Applied consistently to:
  - monitor CRUD validation
  - bulk import validation
  - API auth and Filament auth resolution for school heads
  - login UI hints and docs/examples
  - demo seed data

## Database and Seeders

Migrations and seeders include:

- users, auth tokens, sessions, password reset tokens
- schools
- academic_years
- sections
- students
- performance_metrics
- student_performance_records
- student_status_logs
- audit_logs
- indicator_submissions
- indicator_submission_items
- form_submission_histories
- roles/permissions and demo data

## Quick Start

Prerequisites:

- PHP 8.2+
- Composer 2.x
- Node.js 18+

1. Install backend dependencies:
   - `composer install`
2. Prepare environment:
   - copy `.env.example` to `.env`
   - set predictable local passwords before seeding (recommended):
     - `CSPAMS_DEMO_PASSWORD=Demo@123456`
     - `CSPAMS_SEED_TEMP_PASSWORD=Csp@123456`
     - `CSPAMS_SYNC_SEEDED_PASSWORDS=true`
3. If using SQLite, create the database file first:
   - Linux/macOS: `mkdir -p database && touch database/database.sqlite`
   - Windows PowerShell: `if (-not (Test-Path database\\database.sqlite)) { New-Item -ItemType File database\\database.sqlite | Out-Null }`
4. Generate app key:
   - `php artisan key:generate`
5. Clear caches and run migrations/seeders:
   - `php artisan optimize:clear`
   - `php artisan migrate:fresh --seed`
6. Serve backend:
   - `php artisan serve`
7. (Recommended for realtime/notifications) start worker and Reverb in separate terminals:
   - `php artisan queue:work --tries=3 --timeout=120`
   - `php artisan reverb:start`

Frontend (new terminal):

1. `cd frontend`
2. copy `.env.example` to `.env`
3. verify frontend API URL:
   - `VITE_API_BASE_URL=http://127.0.0.1:8000`
4. `npm install`
5. `npm run dev`

## Cloudflare Quick Preview (Free, Not Production)

Use this to test the system publicly without a paid Cloudflare plan.

One-click launcher (Windows):

1. Double-click [preview-cloudflare-start.cmd](preview-cloudflare-start.cmd)
2. It will:
   - start Laravel backend (`127.0.0.1:8000`)
   - start Vite frontend (`127.0.0.1:5173`) with API proxy
   - start Cloudflare tunnel and print/open the public `trycloudflare.com` URL
3. To stop everything, double-click [preview-cloudflare-stop.cmd](preview-cloudflare-stop.cmd)
4. To restart everything in one click, double-click [preview-cloudflare-restart.cmd](preview-cloudflare-restart.cmd)

Manual commands (alternative):

1. Install Cloudflare Tunnel client (`cloudflared`) on Windows:
   - `winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements`
2. Start backend:
   - `php artisan serve --host=127.0.0.1 --port=8000`
3. Start frontend with same-origin API (through Vite proxy):
   - `cd frontend`
   - PowerShell:
     - `$env:VITE_API_BASE_URL='/'`
     - `$env:VITE_DEV_BACKEND_URL='http://127.0.0.1:8000'`
   - `npm run dev -- --host 127.0.0.1 --port 5173`
4. Open one public tunnel to the frontend:
   - `& 'C:\Program Files (x86)\cloudflared\cloudflared.exe' tunnel --url http://127.0.0.1:5173 --no-autoupdate`
5. Cloudflared prints a URL like `https://random-name.trycloudflare.com`.
   - Share/use this URL to test from outside your local network.

Notes:

- Keep backend, frontend, and cloudflared terminals running while testing.
- This is an ephemeral preview URL, not a production deployment.
- Realtime websocket features may need extra tunnel/proxy setup; core CRUD and API flows are covered by the proxy setup above.
- Launcher logs are written to `storage/logs/preview/` (`backend.log`, `frontend.log`, `tunnel.log`).

## Demo Accounts

After seeding:

- Division Monitor login:
  - Login: seeded monitor email configured in `database/seeders/DemoDataSeeder.php`
  - Password: value of `CSPAMS_DEMO_PASSWORD` from `.env` (recommended for local/dev)
- School Head login:
  - **Quick demo account (school `900001`)** — seeded as `active`, can log in immediately.
    - Login: `900001`
    - Password: value of `CSPAMS_DEMO_PASSWORD` from `.env`
  - **Other School Head accounts (`900002`, `900003`)** — seeded as `pending_setup`.
    - These accounts must complete the full lifecycle before sign-in is allowed:
      1. Monitor sends / reissues setup link from the dashboard.
      2. School Head completes setup → account becomes `pending_verification`.
      3. Monitor activates account from the dashboard → account becomes `active`.
      4. School Head can now sign in with school code + password.

School Head lifecycle after seeding (for non-demo accounts):

```
pending_setup → (complete setup link) → pending_verification → (monitor activates) → active
```

## Troubleshooting Sign-in on a Fresh Clone (Linux/Windows)

If login fails after cloning:

1. Ensure backend + frontend URLs match:
   - backend: `php artisan serve` (default `http://127.0.0.1:8000`)
   - frontend `.env`: `VITE_API_BASE_URL=http://127.0.0.1:8000`
2. Ensure local dev origin is allowed:
   - `.env` -> `CORS_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173`
3. Rebuild seed data with known passwords:
   - set `CSPAMS_DEMO_PASSWORD` and `CSPAMS_SEED_TEMP_PASSWORD` in `.env`
   - keep `CSPAMS_SYNC_SEEDED_PASSWORDS=true` so existing accounts are reset to known credentials
   - run `php artisan migrate:fresh --seed`
4. Clear stale config cache:
   - `php artisan optimize:clear`
5. If using School Head role, login must be a strict 6-digit school code.

## Realtime and Notifications (Production Baseline)

Use these baseline environment values:

- `BROADCAST_CONNECTION=reverb`
- `QUEUE_CONNECTION=database`
- `MAIL_MAILER=smtp`

Required background services:

1. Reverb server:
   - `php artisan reverb:start`
2. Queue worker:
   - `php artisan queue:work --tries=3 --timeout=120`

Queue tables are included in migrations (`jobs`, `job_batches`, `failed_jobs`). Some email notifications (including monitor MFA codes and submission reminders) are queued, so keep a worker running.

## Email Delivery (Verification Codes & Setup Links)

This project sends emails for:

- Monitor login MFA codes
- Monitor MFA reset approval tokens
- Monitor account-action confirmation codes (suspend/lock/archive)
- Monitor password reset links (forgot-password)
- School Head setup links

If `.env` uses `MAIL_MAILER=log`, **no real emails are sent**. Messages are written to `storage/logs/laravel.log`, and the frontend will show a `logged` delivery hint.

To send real emails, configure one of the supported mailers:

- SMTP (simple and widely supported)
  - `MAIL_MAILER=smtp`
  - `MAIL_HOST=...`
  - `MAIL_PORT=587` (STARTTLS) or `MAIL_PORT=465` (implicit TLS)
  - `MAIL_SCHEME=tls` (or `MAIL_ENCRYPTION=tls`) for port `587`, or set `MAIL_SCHEME=smtps` for port `465`
  - `MAIL_USERNAME=...`
  - `MAIL_PASSWORD=...`
  - `MAIL_FROM_ADDRESS=...`
- Resend (transactional email API)
  - `MAIL_MAILER=resend`
  - `RESEND_KEY=...` (or `RESEND_API_KEY=...`)
  - `MAIL_FROM_ADDRESS=...` (must match your verified Resend domain)

After updating mail settings, clear cached config:

- `php artisan optimize:clear`

Local/dev convenience:

- Set a fixed monitor MFA code with `CSPAMS_MONITOR_MFA_TEST_CODE=123456` (only for local testing).

## Additional Docs

- [CAPSTONE_COMPLETION_GUIDE.md](CAPSTONE_COMPLETION_GUIDE.md)
- [DEPLOYMENT.md](DEPLOYMENT.md)
- [USER_MANUAL.md](USER_MANUAL.md)
