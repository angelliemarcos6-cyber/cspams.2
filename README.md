# CSPAMS

Centralized Student Performance Analytics and Monitoring System (CSPAMS) for DepEd SMM&E workflows.

## Implemented System Scope

- Role-based login flow for `monitor` and `school_head`.
- Master data management:
  - Schools
  - Academic Years
  - Sections
- Learner lifecycle tracking:
  - Student records via LRN
  - Status updates (`enrolled`, `at_risk`, `transferee`, `returning`, `dropped_out`, `completer`, `graduated`)
  - Status history logs
- TARGETS-MET style analytics foundation:
  - Performance metrics catalog
  - Student performance records by period
- Governance and accountability:
  - Role normalization via `app/Support/Auth/UserRoleResolver.php`
  - Audit log storage (`audit_logs`) for create/update/delete model actions
- Dashboard widgets:
  - KPI overview
  - Lifecycle status pie chart
  - School submission snapshot table
- Capstone reporting support:
  - Reports Center page with filterable school/performance summary exports (CSV)
  - Bulk CSV export for selected learner and performance records
  - Learner-level status timeline and performance-history relation views
- Expanded monitoring evidence widgets:
  - At-risk watchlist table
  - 6-month status transition trend chart

## Database and Seeders

Migrations and seeders are included for:

- users / sessions / password reset tokens
- schools
- academic_years
- sections
- students
- performance_metrics
- student_performance_records
- student_status_logs
- audit_logs
- roles and permissions seeding
- demo data seeding

## Quick Start

1. Install dependencies:
   `composer install`
2. Configure environment:
   `cp .env.example .env` (or copy manually on Windows)
3. Generate key:
   `php artisan key:generate`
4. Run migrations and seeders:
   `php artisan migrate --seed`
5. Serve app:
   `php artisan serve`

## Frontend API Sync (React Dashboard)

The `frontend/` app now authenticates and reads/writes records from Laravel API endpoints:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/dashboard/records`
- `POST /api/dashboard/records`
- `PUT /api/dashboard/records/{school}`

Synchronization behavior:

- Dashboards auto-refresh every 30 seconds
- Dashboards auto-refresh when tab focus returns or network reconnects
- Manual refresh is available in both monitor and school administrator dashboards

Setup:

1. Copy `frontend/.env.example` to `frontend/.env`
2. Set `VITE_API_BASE_URL` (default: `http://127.0.0.1:8000`)
3. Run:
   - `cd frontend`
   - `npm install`
   - `npm run dev`

## Demo Accounts (after seeding)

- Division Monitor: `monitor@cspams.local` / `password123`
- School Heads:
  - `schoolhead1@cspams.local` / `password123`
  - `schoolhead2@cspams.local` / `password123`
  - `schoolhead3@cspams.local` / `password123`

## Role Convention

Source of truth for role aliases and login-tab metadata:

- `app/Support/Auth/UserRoleResolver.php`
