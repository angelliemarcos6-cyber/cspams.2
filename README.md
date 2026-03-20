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
  - Filterable school and performance summary previews
  - CSV exports (summary and selected records)
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

- `monitor` can sign in using email or name.
- `school_head` signs in using a **6-digit school code**.
- If a school head account is marked `must_reset_password`, sign-in is blocked until password reset is completed via:
  - `POST /api/auth/reset-required-password`
- SPA login supports the reset-required flow in-page (current password + new password + confirmation).
- Sign-out behavior:
  - local session is cleared immediately for fast UI exit
  - token revoke call is sent in the background (`POST /api/auth/logout`)
  - auth state is synchronized across tabs/windows via browser storage events

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
  - Login: `monitor@cspams.local`
  - Password: value of `CSPAMS_DEMO_PASSWORD` from `.env` (recommended for local/dev)
- School Head login:
  - Login: assigned 6-digit `school_code` (example: `900001`, `900002`, `900003`)
  - Password: value of `CSPAMS_DEMO_PASSWORD` from `.env` (recommended for local/dev)

For Santiago school accounts seeded by `SantiagoCitySchoolAccountsSeeder`, users are marked with `must_reset_password = true` and must complete `/api/auth/reset-required-password` before dashboard access. Their temporary password is `CSPAMS_SEED_TEMP_PASSWORD` (default: `Csp@123456`).

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

Queue tables are included in migrations (`jobs`, `job_batches`, `failed_jobs`) and reminder emails are queued via `SchoolSubmissionReminderNotification`.

## Email Delivery (Verification Codes & Setup Links)

This project sends emails for:

- Monitor login MFA codes
- Monitor account-action confirmation codes (suspend/lock/archive)
- School Head setup links

If `.env` uses `MAIL_MAILER=log`, **no real emails are sent**. Messages are written to `storage/logs/laravel.log`, and the frontend will show a `logged` delivery hint.

To send real emails, configure one of the supported mailers:

- SMTP (simple and widely supported)
  - `MAIL_MAILER=smtp`
  - `MAIL_HOST=...`
  - `MAIL_PORT=587` (STARTTLS) or `MAIL_PORT=465` (implicit TLS)
  - `MAIL_SCHEME=` (leave empty) for port `587`, or set `MAIL_SCHEME=smtps` for port `465`
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
- [USER_MANUAL.md](USER_MANUAL.md)
