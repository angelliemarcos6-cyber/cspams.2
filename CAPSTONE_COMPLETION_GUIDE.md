<<<<<<< ours
﻿# CSPAMS Capstone Completion Guide

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
=======
# CSPAMS Capstone Completion Guide

This guide turns the current codebase into a finishable capstone plan.

## 1) What you already have in this repo

- **Laravel 11 + Filament 3 admin foundation**
- **Custom role-aware login page** for `monitor` and `school_head`
- **Section management CRUD** with role-based visibility/query scope

These are solid foundations for an academic capstone because they demonstrate:
- authentication + authorization,
- role-based workflows,
- and an initial school management module.

---

## 2) Suggested capstone title and scope

### Suggested title
**CSPAMS: Centralized Student Performance Analytics and Monitoring System**

### Recommended system scope (MVP)
Focus your defense on a complete, coherent flow:
1. User authentication (Monitor vs School Head)
2. Master data setup (School, Academic Year, Sections, Students)
3. Performance encoding (I-META / TARGETS-MET indicators)
4. Analytics dashboard (trend + summary)
5. Reports export (PDF/Excel)

Keep MVP small but complete.

---

## 3) Proposed roles and permissions (normalize naming)

The current code uses mixed role labels (`monitor`, `school_head`, `Division Admin`, `School Head`).
For maintainability, standardize to one naming style.

### Recommended canonical roles
- `division_admin`
- `school_monitor`
- `school_head`

### Example permission matrix
- **division_admin**
  - manage schools, users, global reports
- **school_monitor**
  - manage sections/students in assigned school
  - encode and update performance metrics
- **school_head**
  - view analytics/reports
  - approve/acknowledge reports

---

## 4) Database design checklist

Implement/verify these tables and key relations:

- `schools`
- `academic_years`
- `sections` (`school_id`, `academic_year_id`)
- `students` (`school_id`, `section_id`)
- `performance_metrics` (indicator catalog)
- `student_performance_records` (`student_id`, `metric_id`, `period`, `score`)
- `report_snapshots` (optional, for generated report history)

Also ensure:
- foreign keys + indexes,
- soft deletes where needed,
- seeders for demo data.

---

## 5) Module implementation order (recommended)

1. **User & Role Setup**
   - finish role seeders
   - enforce route/resource access

2. **Master Data**
   - Schools
   - Academic Years
   - Sections (already started)
   - Students

3. **Encoding Module**
   - performance metric definitions
   - data entry forms per period/quarter
   - validation rules and locking once submitted

4. **Dashboard Module**
   - school-level summaries
   - grade/section trends
   - pass/fail or risk-level indicators

5. **Reports Module**
   - downloadable summary per school/period
   - print-friendly templates for final demo

6. **Audit & Logs (optional but impressive)**
   - who encoded/edited data and when

---

## 6) Recommended capstone deliverables

Prepare these early (not just code):

### A) Technical documentation
- system architecture diagram
- ERD (entity relationship diagram)
- use case diagram
- user flow per role

### B) Academic documentation
- Chapter 1–5 alignment with actual implemented features
- clear evaluation criteria (accuracy, usability, performance)
- user acceptance test forms

### C) Demo package
- seeded demo accounts per role
- scripted end-to-end demo scenario (5–10 minutes)
- fallback offline screenshots if internet fails

---

## 7) Suggested sprint plan (4 weeks)

### Week 1
- finalize requirements + ERD + role matrix
- build/complete master data modules

### Week 2
- implement performance encoding and validation
- seed realistic sample dataset

### Week 3
- analytics dashboard + charts + report generation
- initial QA and bug fixing

### Week 4
- polish UI/UX, finalize docs, rehearse defense demo
- prepare backup video walkthrough

---

## 8) Defense tips (high impact)

During defense, highlight:
1. **Problem solved**: fragmented monitoring process
2. **Innovation**: centralized, role-based analytics workflow
3. **Evidence**: before-vs-after workflow efficiency
4. **Reliability**: validation, role restrictions, auditability
5. **Scalability**: can support more schools/modules later

---

## 9) Immediate next coding tasks for this repository

1. Standardize role names in login/resource checks.
2. Add missing resources: `StudentResource`, `AcademicYearResource`, `SchoolResource`.
3. Create dashboard widgets for key KPIs.
4. Add seeders for users/roles/schools/sections/students.
5. Add feature tests for role access and scoped data.

---

## 10) If you share your source docs

You referenced a DOCX and PPTX in your local Downloads folder.
To align this guide exactly with your adviser requirements, add either:
- exported text/outline from those files, or
- screenshots of the main objectives/chapters,

then this guide can be converted into a fully customized implementation checklist.
>>>>>>> theirs
