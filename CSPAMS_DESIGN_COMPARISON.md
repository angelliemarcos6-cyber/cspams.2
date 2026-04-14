# CSPAMS: Old Capstone vs. New Design Side-by-Side

```ts
// NEW 2026 COMPLIANCE UI: BMEF tab replaces TARGETS-MET
// 4-tab layout (School Achievements | Key Performance | BMEF | SMEA)
// Monitor & School Head views updated for DepEd standards
```

> April 2026 compliance UI refactor - TARGETS-MET renamed to BMEF with 4-tab layout.


## SCOPE COMPARISON

### âŒ OLD CAPSTONE DESIGN (Over-engineered)
```
CORE JOBS (too many):
â”œâ”€ Full learner lifecycle tracking (enrollement â†’ graduation)
â”œâ”€ Individual student performance monitoring
â”œâ”€ At-risk student detection & alerts (AI-driven)
â”œâ”€ Teacher records & assignment tracking
â”œâ”€ Detailed attendance tracking
â”œâ”€ Grade/assessment recording
â”œâ”€ Learner status transitions (15+ states)
â””â”€ National LIS/EBEIS integration

DATABASE:
â”œâ”€ students table (10,000+ records per school)
â”œâ”€ student_status_logs (100K+ rows per year)
â”œâ”€ student_performance_records (50K+ rows)
â”œâ”€ teachers table
â”œâ”€ classes/sections with full student rosters
â”œâ”€ performance_metrics (detailed metrics catalog)
â””â”€ 20+ related tables

MONITORING:
â”œâ”€ Per-student dashboard (risk scores, trends)
â”œâ”€ Detailed attendance reports
â”œâ”€ Individual grade analysis
â”œâ”€ LRN tracking (national sync)
â””â”€ Complex at-risk watchlists

TIME TO IMPLEMENT: 6-8 months
DEPLOYMENT: Enterprise-grade, heavy infrastructure
MAINTENANCE: High (many moving parts)
```

---

### âœ… NEW DESIGN (Laser-focused)
```
CORE JOBS (exactly 2):
â”œâ”€ Annual Compliance (3 packages: I-META, BMEF, SMEA)
â””â”€ School Welfare Tracking (flag student concerns, monitor responds)

DATABASE:
â”œâ”€ schools (with 6-digit codes)
â”œâ”€ academic_years
â”œâ”€ indicator_submissions (one per package per school per year)
â”œâ”€ enrollment_records (school-level numbers only)
â”œâ”€ welfare_concerns (flagged issues, not student records)
â””â”€ welfare_concern_threads (monitor â†” school_head communication)

MONITORING:
â”œâ”€ Compliance dashboard (% schools submitted)
â”œâ”€ Enrollment snapshot (division-wide numbers)
â”œâ”€ Concerns board (open issues, categorized)
â””â”€ Simple reports (CSV exports)

TIME TO IMPLEMENT: 2-3 weeks
DEPLOYMENT: Lightweight, works on any shared hosting
MAINTENANCE: Low (simple architecture)
```

---

## WORKFLOW COMPARISON

### OLD WORKFLOW (Complex)
```
School Head:
1. View comprehensive student roster (LRN, names, grades, status)
2. Mark individual students as at-risk based on performance
3. Update student status (enrolled â†’ dropping-out â†’ dropped-out)
4. Submit per-student data monthly

Monitor:
1. View all students across division
2. Analyze individual student trends
3. Generate complex performance reports
4. Identify at-risk cohorts automatically
5. Track status transitions

Data Model: Learner-centric (individual records)
```

### NEW WORKFLOW (Simple)
```
School Head:
1. Fill 3 forms once per year (I-META, BMEF, SMEA)
2. Submit enrollment numbers (total, dropouts, transferees)
3. Flag specific concerns when they arise (abuse, dropout risk, etc.)
4. Wait for monitor feedback

Monitor:
1. Review submissions in queue
2. Return for revision or approve
3. See all flagged concerns across division
4. Acknowledge & resolve concerns
5. Export KPI reports for DepEd

Data Model: Compliance-centric + Concern-flagging
```

---

## DATABASE SIZE IMPACT

### OLD SYSTEM (per school, per year)
```
Schools: 100
Students per school: 800
Years of data: 5

students: 400,000 rows
student_status_logs: 2,000,000 rows (multiple transitions per student)
student_performance_records: 1,000,000 rows (monthly records)
teachers: 5,000 rows
classes: 1,000 rows
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
TOTAL: ~3.5M rows

DB size: ~2-3 GB (with indices)
Daily backup: 50-100 MB
API response times: Can be slow (complex JOINs)
```

### NEW SYSTEM (per school, per year)
```
Schools: 100
Years of data: 5

indicator_submissions: 300 rows (100 schools Ã— 3 packages)
enrollment_records: 500 rows (100 schools Ã— 5 years)
welfare_concerns: ~2,000 rows (est. 20 per school per year)
welfare_concern_attachments: ~1,000 rows
welfare_concern_threads: ~3,000 rows
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
TOTAL: ~6.8K rows

DB size: ~50-100 MB
Daily backup: 1-2 MB
API response times: Sub-second
```

---

## DEVELOPER TIME COMMITMENT

### PHASE BREAKDOWN

```
PHASE 1: CLEANUP & SIMPLIFICATION
Time: 2-3 days
â”œâ”€ Mark old models for deprecation
â”œâ”€ Create new migrations
â”œâ”€ Update seeders
â””â”€ Test clean schema

PHASE 2: BACKEND CORE API
Time: 3-4 days
â”œâ”€ Controllers: Submission, Concern, Enrollment, Dashboard
â”œâ”€ Services: Submission, Concern, Enrollment, Report
â”œâ”€ Models: IndicatorSubmission, WelfareConcern, EnrollmentRecord
â”œâ”€ Validation rules
â”œâ”€ Notification events
â””â”€ API testing (Postman)

PHASE 3: FRONTEND AUTH & LAYOUT
Time: 2 days
â”œâ”€ Login page (unified)
â”œâ”€ Role-based layouts (School Head / Monitor)
â”œâ”€ Sidebar navigation
â”œâ”€ Auth context & guards
â””â”€ Settings page

PHASE 4: SCHOOL HEAD FEATURES
Time: 4-5 days
â”œâ”€ Requirements page (I-META, BMEF, SMEA forms)
â”œâ”€ Form builder & validation
â”œâ”€ Enrollment & Concerns page
â”œâ”€ Flag New Concern modal
â”œâ”€ Dashboard (3 cards + progress bar)
â””â”€ History/Activity feed

PHASE 5: MONITOR FEATURES
Time: 4-5 days
â”œâ”€ Reviews page (pending submissions queue)
â”œâ”€ Review modal (view + comment + approve/return)
â”œâ”€ Concerns board (division-wide)
â”œâ”€ Reports page (CSV export + charts)
â””â”€ Dashboard (4 KPI cards + breakdown)

PHASE 6: REAL-TIME & NOTIFICATIONS
Time: 2 days
â”œâ”€ Reverb listeners
â”œâ”€ Email queue
â”œâ”€ Notification center (toast + bell)
â””â”€ Multi-browser sync

PHASE 7: SECURITY HARDENING
Time: 2 days
â”œâ”€ CSRF tokens
â”œâ”€ Rate limiting
â”œâ”€ Attachment encryption
â”œâ”€ Audit logging
â””â”€ Auth edge cases (token expiry, MFA, etc.)

PHASE 8: TESTING & DEPLOYMENT
Time: 2-3 days
â”œâ”€ Unit tests
â”œâ”€ Integration tests
â”œâ”€ E2E tests
â”œâ”€ Staging deployment
â”œâ”€ Load testing
â””â”€ Production deployment

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
TOTAL: 4-5 WEEKS (solo dev)
       2-3 WEEKS (2-person team)
```

---

## FEATURES SIDE-BY-SIDE

| Feature | Old Capstone | New Design | Status |
|---------|--------------|-----------|--------|
| **Role-based Auth** | âœ… Monitor + School Head | âœ… Monitor + School Head | Reuse existing |
| **School Code Login** | âœ… 6-digit | âœ… 6-digit | Reuse existing |
| **Student Roster** | âœ… Full LRN tracking | âŒ REMOVED | Delete models |
| **Per-Student Status** | âœ… (15+ states) | âŒ REMOVED | Delete code |
| **Performance Tracking** | âœ… Grade/metric recording | âŒ REMOVED | Delete models |
| **I-META Submission** | âŒ Manual process | âœ… Digital form | Build new |
| **BMEF Submission** | âŒ Manual process | âœ… Auto-calculated from enrollment | Build new |
| **SMEA Submission** | âŒ Manual process | âœ… Digital form | Build new |
| **Enrollment Numbers** | âš ï¸ Derived from student roster | âœ… Direct input form | Simplify |
| **Welfare Concerns** | âŒ Not in scope | âœ… Flagging + workflow | Build new |
| **Bulk Import** | âœ… User data | âœ… Schools + school heads | Refactor |
| **Audit Logging** | âœ… Full audit trail | âœ… Full audit trail | Reuse existing |
| **Notifications** | âœ… Reverb + email | âœ… Reverb + email | Reuse & refine |
| **Reports/Exports** | âœ… Complex analytics | âœ… Simple KPI reports | Simplify |
| **Dashboard Analytics** | âœ… Per-learner insights | âœ… Division-wide KPIs | Redesign |
| **MFA** | âœ… TOTP for monitor | âœ… TOTP for monitor | Reuse existing |

---

## ARCHITECTURAL CHANGES

### OLD ARCHITECTURE (Monolithic)
```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚         CSPAMS MONOLITH              â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Auth Service                         â”‚
â”‚ Learner Management Service           â”‚
â”‚ Performance Tracking Service         â”‚
â”‚ At-Risk Detection Service (AI)       â”‚
â”‚ Reporting Service (complex)          â”‚
â”‚ Audit Service                        â”‚
â”‚ Notification Service                 â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚          LARGE DATABASE              â”‚
â”‚  (3.5M rows, complex schema)         â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚   React Frontend (many pages)        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### NEW ARCHITECTURE (Focused)
```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚         CSPAMS FOCUSED               â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Auth Service (reuse)                 â”‚
â”‚ Submission Service (new)             â”‚
â”‚ Concern Service (new)                â”‚
â”‚ Enrollment Service (new)             â”‚
â”‚ Reporting Service (simplified)       â”‚
â”‚ Audit Service (reuse)                â”‚
â”‚ Notification Service (reuse)         â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚       LIGHTWEIGHT DATABASE           â”‚
â”‚   (~7K rows, simple schema)          â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  React Frontend (8-10 pages)         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## CODE CLEANUP CHECKLIST

### MODELS TO REMOVE
```sql
DELETE FROM models/
â”œâ”€ Student.php
â”œâ”€ StudentPerformanceRecord.php
â”œâ”€ StudentStatusLog.php
â”œâ”€ PerformanceMetric.php
â”œâ”€ Teacher.php (if exists)
â””â”€ (any learner lifecycle related)

DELETE FROM migrations/
â”œâ”€ create_students_table
â”œâ”€ create_student_performance_records_table
â”œâ”€ create_student_status_logs_table
â”œâ”€ create_performance_metrics_table
â””â”€ (any student-related migrations)
```

### FILAMENT RESOURCES TO REMOVE
```php
DELETE FROM app/Filament/Resources/
â”œâ”€ StudentResource.php
â”œâ”€ StudentPerformanceRecordResource.php
â”œâ”€ StudentStatusLogResource.php
â”œâ”€ PerformanceMetricResource.php
â”œâ”€ TeacherResource.php
â””â”€ (keep: SchoolResource, UserResource, AcademicYearResource, IndicatorSubmissionResource)
```

### API ROUTES TO REMOVE
```
DELETE FROM routes/api.php:
â”œâ”€ /api/students/*
â”œâ”€ /api/performance/*
â”œâ”€ /api/status-logs/*
â”œâ”€ /api/teachers/*
â””â”€ (keep: /api/submissions/*, /api/concerns/*, /api/enrollment/*, /api/auth/*, /api/dashboard/*)
```

### FRONTEND COMPONENTS TO REMOVE
```
DELETE from frontend/src/:
â”œâ”€ pages/LearnerRoster.tsx
â”œâ”€ pages/StudentPerformance.tsx
â”œâ”€ pages/AtRiskWatchlist.tsx
â”œâ”€ pages/TeacherManagement.tsx
â”œâ”€ components/StudentTable.tsx
â”œâ”€ components/PerformanceChart.tsx
â””â”€ hooks/useStudentData.ts
```

---

## RISK & MITIGATION

### RISK 1: Data Migration (if keeping historical records)

**Risk:** What happens to existing student records?

**Mitigation:**
```
Option A: Archive to separate schema (read-only)
â”œâ”€ Create archive_students, archive_performance tables
â”œâ”€ Keep old data accessible but not active
â””â”€ Export to JSON for historical reference

Option B: Delete (clean slate)
â”œâ”€ Backup full database
â”œâ”€ Delete all student records
â”œâ”€ Start fresh with new design
â””â”€ Only keep schools + accounts
```

---

### RISK 2: Form Structure Changes Mid-Year

**Risk:** DepEd asks to add fields to I-META in June.

**Mitigation:**
```
Solution 1: Allow form flexibility
â”œâ”€ Store form_data as JSON (no fixed columns)
â”œâ”€ Add new fields to next year's form_data schema
â””â”€ Old year's submissions stay as-is

Solution 2: Version forms
â”œâ”€ indicator_submissions.form_version (v1, v2, v3)
â”œâ”€ Each version has different schema
â””â”€ Monitor can view with version-aware renderer
```

---

### RISK 3: School Heads Don't Submit

**Risk:** Only 30% of schools submit forms by deadline.

**Mitigation:**
```
1. Automated reminders (30d, 7d, 1d before)
2. Monitor dashboard highlights overdue submissions
3. Escalation email to school principals
4. DepEd can freeze school from other systems until submitted
```

---

### RISK 4: Concern Spam / Abuse

**Risk:** School heads flag thousands of concerns per day.

**Mitigation:**
```
1. Rate limiting (max 10 concerns per school per day)
2. Concern moderation queue (monitor reviews before visibility)
3. Analytics (flag schools with unusual concern patterns)
4. Reporting (show concern submission frequency to DepEd)
```

---

## DEPLOYMENT RECOMMENDATIONS

### DEVELOPMENT (Local)
```bash
# Quick start with SQLite
php artisan migrate:fresh --seed
php artisan serve
cd frontend && npm run dev
```

### STAGING (Test Before Production)
```
Server: Linux VM (2GB RAM, 20GB disk)
Database: MySQL 8.0
Frontend: Nginx reverse proxy
Backend: Laravel with Supervisor + Queue worker
Reverb: WebSocket for real-time
Backups: Daily, retained 7 days
```

### PRODUCTION (DepEd Santiago City)
```
Server: Linux VM or shared hosting (4GB RAM, 50GB disk)
Database: MySQL 8.0 with replication (optional)
Frontend: Nginx with SSL/TLS
Backend: Laravel with Supervisor + Queue worker + Reverb
Backups: Daily, retained 30 days, encrypted offsite
Monitoring: Error tracking (Sentry), uptime monitoring
Email: SMTP + Resend API for transactional
CDN: Cloudflare (optional, for static assets)
```

---

## SUCCESS METRICS

**Launch Readiness (âœ… When to Deploy):**

- [ ] All 3 form types (I-META, BMEF, SMEA) working end-to-end
- [ ] School heads can submit + monitor can review
- [ ] Concerns workflow complete (flag â†’ acknowledge â†’ resolve)
- [ ] Notifications working (email + real-time)
- [ ] Division dashboard shows accurate KPIs
- [ ] CSV export working for monitors
- [ ] Security audit passed (CSRF, rate limits, encryption)
- [ ] E2E tests passing (happy path scenarios)
- [ ] Load test passed (100 concurrent users)
- [ ] User manual written + training video created
- [ ] Staging deployment stable for 48 hours

**Post-Launch Metrics:**

- **Submission Rate:** Target 95%+ schools submit by deadline
- **Response Time:** Monitor acknowledges concern within 24 hours
- **Uptime:** 99.5% availability
- **Support Tickets:** <2 per day in first month

---

## FINAL CHECKLIST BEFORE CODING

- [ ] **Answer all 10 brainstorm questions** (in Part 10 of main analysis)
- [ ] **Get sign-off from DepEd** on new design
- [ ] **Finalize form structures** (I-META, BMEF, SMEA fields)
- [ ] **Define concern categories** (with DepEd validation)
- [ ] **Set submission deadlines** (date per academic year)
- [ ] **Assign project owner** (who approves decisions?)
- [ ] **Set up GitHub project board** (track Phase 1-8 progress)
- [ ] **Reserve server/hosting** (staging + production)
- [ ] **Configure mail service** (SMTP or Resend API)
- [ ] **Draft user manual** (will be refined during dev)

---

## NEXT IMMEDIATE STEPS

1. **This week:**
   - Review this analysis
   - Answer the 10 brainstorm questions
   - Schedule sync with DepEd (confirm new design)

2. **Next week:**
   - Start Phase 1 (cleanup, new migrations)
   - Set up GitHub project board
   - Begin form structure documentation

3. **Within 2 weeks:**
   - Phase 2 (backend API core)
   - Phase 3 (frontend auth + layout)

4. **Within 4-5 weeks:**
   - All phases complete
   - Staging deployment ready

5. **Within 6 weeks:**
   - Production ready for DepEd Santiago City

---

**Document Generated:** April 11, 2026  
**Project:** CSPAMS 2.0 Redesign  
**Status:** Ready for Implementation Kickoff


