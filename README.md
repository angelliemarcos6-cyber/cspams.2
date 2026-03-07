# CSPAMS

Centralized Student Performance Analytics and Monitoring System (CSPAMS) for DepEd SMM&E workflows.

## Implemented Scope

- Role-based login (`monitor`, `school_head`) with custom Filament auth page.
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

## Digital SF-1 / SF-5 Workflow (API)

Implemented API workflow for auto-generated forms, submission, validation, and history:

- `GET /api/forms/sf1`
- `POST /api/forms/sf1/generate`
- `POST /api/forms/sf1/{submission}/submit`
- `POST /api/forms/sf1/{submission}/validate`
- `GET /api/forms/sf1/{submission}/history`
- `GET /api/forms/sf5`
- `POST /api/forms/sf5/generate`
- `POST /api/forms/sf5/{submission}/submit`
- `POST /api/forms/sf5/{submission}/validate`
- `GET /api/forms/sf5/{submission}/history`

Role flow:

- `school_head`: generate + submit own-school forms
- `monitor`: division-wide visibility + validate/return

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
- sf1_submissions
- sf5_submissions
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
3. Generate app key:
   - `php artisan key:generate`
4. Run migrations and seeders:
   - `php artisan migrate --seed`
5. Serve backend:
   - `php artisan serve`

Frontend (new terminal):

1. `cd frontend`
2. `npm install`
3. `npm run dev`

## Demo Accounts

After seeding:

- Division Monitor: `monitor@cspams.local` / `password123`
- School Heads:
  - `schoolhead1@cspams.local` / `password123`
  - `schoolhead2@cspams.local` / `password123`
  - `schoolhead3@cspams.local` / `password123`

## Additional Docs

- [CAPSTONE_COMPLETION_GUIDE.md](C:/Users/Angie/Documents/New%20project/cspams.2/CAPSTONE_COMPLETION_GUIDE.md)
- [USER_MANUAL.md](C:/Users/Angie/Documents/New%20project/cspams.2/USER_MANUAL.md)
