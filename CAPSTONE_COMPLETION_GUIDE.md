# CSPAMS Capstone Completion Guide

This guide aligns the codebase with a finishable, defensible capstone scope.

## 1) Current State (Implemented)

- Laravel 11 + Filament 3 admin foundation
- Custom role-aware login (`monitor`, `school_head`)
- Core school data modules (Schools, Academic Years, Sections, Students)
- Learner status lifecycle with status logs
- Performance metric and encoding modules
- Dashboard widgets for monitoring and intervention visibility
- Reports Center with CSV exports and summary previews
- API sync endpoints for dashboard records
- Digital SF-1/SF-5 API workflow:
  - auto-generation from current records
  - submit for validation
  - monitor validation/return
  - full submission history trail
- Indicator compliance API workflow:
  - school-level indicator package encoding
  - submit to monitor
  - monitor validation/return
  - full submission history trail

## 2) Recommended Defense Scope

Focus on one complete workflow chain:

1. Role-based login and scoped access
2. School/learner encoding and status transitions
3. KPI computation and dashboard monitoring
4. SF-1/SF-5 generation, submission, validation, and history
5. Indicator compliance submission and monitor review
6. Export/report outputs for decision support

## 3) Role Matrix (Operational)

- `monitor`
  - Division-wide visibility
  - Validate/return SF submissions
  - Manage global master-data modules
- `school_head`
  - Encode own-school records
  - Generate and submit SF-1/SF-5
  - View own-school dashboards and reports

## 4) Data Model Checklist

Core entities:

- `schools`
- `academic_years`
- `sections`
- `students`
- `performance_metrics`
- `student_performance_records`
- `student_status_logs`
- `audit_logs`

New digital forms workflow entities:

- `sf1_submissions`
- `sf5_submissions`
- `indicator_submissions`
- `indicator_submission_items`
- `form_submission_histories`

## 5) Suggested Final Sprint Priorities

1. Stabilization
   - Resolve all merge conflicts
   - Ensure all migrations and tests pass
2. Form completion
   - Add Filament UI pages/resources for SF-1/SF-5 (currently API-complete)
   - Add printable templates if required by panel reviewers
3. Reporting polish
   - Add PDF/Excel export if required by adviser rubric
4. QA and evidence
   - Record end-to-end demo scripts
   - Capture before/after workflow metrics

## 6) Defense Evidence Pack

Prepare:

- Architecture diagram
- ERD
- Use-case diagram
- Role-permission matrix
- Test evidence (feature tests and manual UAT)
- Demo script for:
  - school head submits SF form
  - monitor validates/returns
  - history and audit proof

## 7) Practical Next Build Targets

- Filament SF-1/SF-5 resources with status badges and history relation tables
- Notification channel for returned/validated forms
- PDF/Excel outputs aligned to division templates
- Additional feature tests for edge cases and authorization
