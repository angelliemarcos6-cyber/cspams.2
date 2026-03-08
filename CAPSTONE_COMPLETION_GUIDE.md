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
4. Indicator compliance submission and monitor review
5. Export/report outputs for decision support

## 3) Role Matrix (Operational)

- `monitor`
  - Division-wide visibility
  - Validate/return indicator submissions
  - Manage global master-data modules
- `school_head`
  - Encode own-school records
  - Submit indicator compliance packages
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

Compliance workflow entities:

- `indicator_submissions`
- `indicator_submission_items`
- `form_submission_histories`

## 5) Suggested Final Sprint Priorities

1. Stabilization
   - Resolve all merge conflicts
   - Ensure all migrations and tests pass
2. Reporting polish
   - Add PDF/Excel export if required by adviser rubric
3. QA and evidence
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
  - school head submits indicator package
  - monitor validates/returns
  - history and audit proof

## 7) Practical Next Build Targets

- Notification channel for returned/validated indicator submissions
- PDF/Excel outputs aligned to division templates
- Additional feature tests for edge cases and authorization
