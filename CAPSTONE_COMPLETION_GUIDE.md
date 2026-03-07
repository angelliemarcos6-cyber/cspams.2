# CSPAMS Capstone Completion Guide

This guide turns the current codebase into a finishable capstone plan.

## 1) What you already have in this repo

- **Laravel 11 + Filament 3 admin foundation**
- **Custom role-aware login page** for `monitor` and `school_head`
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
- **Section management CRUD** with role-based visibility and query scope
- **Reports Center module** with filter-based CSV exports and dashboard evidence widgets

These are solid foundations for an academic capstone because they demonstrate:
- authentication and authorization,
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
- **Section management CRUD** with role-based visibility/query scope

These are solid foundations for an academic capstone because they demonstrate:
- authentication + authorization,
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
- role-based workflows,
- and an initial school management module.

---

## 2) Suggested capstone title and scope

### Suggested title
**CSPAMS: Centralized Student Performance Analytics and Monitoring System**

### Recommended system scope (MVP)
Focus your defense on a complete, coherent flow:
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
1. User authentication (Division Monitor vs School Head)
=======
1. User authentication (Monitor vs School Head)
>>>>>>> theirs
=======
1. User authentication (Monitor vs School Head)
>>>>>>> theirs
=======
1. User authentication (Monitor vs School Head)
>>>>>>> theirs
2. Master data setup (School, Academic Year, Sections, Students)
3. Performance encoding (I-META / TARGETS-MET indicators)
4. Analytics dashboard (trend + summary)
5. Reports export (PDF/Excel)

Keep MVP small but complete.

---

<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
## 3) Proposed roles and permissions (normalized)

The current code supports mixed role labels through aliases in `app/Support/Auth/UserRoleResolver.php`.
For maintainability, keep one canonical naming style in seeders/migrations and map legacy labels using the resolver.

### Recommended canonical roles
- `monitor`
- `school_head`

### Example permission matrix
- **monitor**
  - manage schools, users, and global reports
  - validate division-wide analytics
- **school_head**
  - manage sections/students in assigned school
  - encode performance data and view school analytics
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
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
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs

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
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
- foreign keys and indexes,
=======
- foreign keys + indexes,
>>>>>>> theirs
=======
- foreign keys + indexes,
>>>>>>> theirs
=======
- foreign keys + indexes,
>>>>>>> theirs
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
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
- Chapter 1-5 alignment with actual implemented features
=======
- Chapter 1–5 alignment with actual implemented features
>>>>>>> theirs
=======
- Chapter 1–5 alignment with actual implemented features
>>>>>>> theirs
=======
- Chapter 1–5 alignment with actual implemented features
>>>>>>> theirs
- clear evaluation criteria (accuracy, usability, performance)
- user acceptance test forms

### C) Demo package
- seeded demo accounts per role
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
- scripted end-to-end demo scenario (5-10 minutes)
=======
- scripted end-to-end demo scenario (5–10 minutes)
>>>>>>> theirs
=======
- scripted end-to-end demo scenario (5–10 minutes)
>>>>>>> theirs
=======
- scripted end-to-end demo scenario (5–10 minutes)
>>>>>>> theirs
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

<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
1. Add feature and policy tests for role-based access and scoped data.
2. Extend exports to PDF/Excel formatting matching division templates (CSV exports are now available).
3. Add API endpoints for future mobile/reporting integrations.
4. Add notification rules for at-risk and dropout-status changes.
5. Prepare deployment profile (env hardening, queue workers, backups, monitoring).
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
1. Standardize role names in login/resource checks.
2. Add missing resources: `StudentResource`, `AcademicYearResource`, `SchoolResource`.
3. Create dashboard widgets for key KPIs.
4. Add seeders for users/roles/schools/sections/students.
5. Add feature tests for role access and scoped data.
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs

---

## 10) If you share your source docs

You referenced a DOCX and PPTX in your local Downloads folder.
To align this guide exactly with your adviser requirements, add either:
- exported text/outline from those files, or
- screenshots of the main objectives/chapters,

then this guide can be converted into a fully customized implementation checklist.
