# CSPAMS: Old Capstone vs. New Design Side-by-Side

## SCOPE COMPARISON

### ❌ OLD CAPSTONE DESIGN (Over-engineered)
```
CORE JOBS (too many):
├─ Full learner lifecycle tracking (enrollement → graduation)
├─ Individual student performance monitoring
├─ At-risk student detection & alerts (AI-driven)
├─ Teacher records & assignment tracking
├─ Detailed attendance tracking
├─ Grade/assessment recording
├─ Learner status transitions (15+ states)
└─ National LIS/EBEIS integration

DATABASE:
├─ students table (10,000+ records per school)
├─ student_status_logs (100K+ rows per year)
├─ student_performance_records (50K+ rows)
├─ teachers table
├─ classes/sections with full student rosters
├─ performance_metrics (detailed metrics catalog)
└─ 20+ related tables

MONITORING:
├─ Per-student dashboard (risk scores, trends)
├─ Detailed attendance reports
├─ Individual grade analysis
├─ LRN tracking (national sync)
└─ Complex at-risk watchlists

TIME TO IMPLEMENT: 6-8 months
DEPLOYMENT: Enterprise-grade, heavy infrastructure
MAINTENANCE: High (many moving parts)
```

---

### ✅ NEW DESIGN (Laser-focused)
```
CORE JOBS (exactly 2):
├─ Annual Compliance (3 packages: I-META, TARGETS-MET, SMEA)
└─ School Welfare Tracking (flag student concerns, monitor responds)

DATABASE:
├─ schools (with 6-digit codes)
├─ academic_years
├─ indicator_submissions (one per package per school per year)
├─ enrollment_records (school-level numbers only)
├─ welfare_concerns (flagged issues, not student records)
└─ welfare_concern_threads (monitor ↔ school_head communication)

MONITORING:
├─ Compliance dashboard (% schools submitted)
├─ Enrollment snapshot (division-wide numbers)
├─ Concerns board (open issues, categorized)
└─ Simple reports (CSV exports)

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
3. Update student status (enrolled → dropping-out → dropped-out)
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
1. Fill 3 forms once per year (I-META, TARGETS-MET, SMEA)
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
─────────────────────
TOTAL: ~3.5M rows

DB size: ~2-3 GB (with indices)
Daily backup: 50-100 MB
API response times: Can be slow (complex JOINs)
```

### NEW SYSTEM (per school, per year)
```
Schools: 100
Years of data: 5

indicator_submissions: 300 rows (100 schools × 3 packages)
enrollment_records: 500 rows (100 schools × 5 years)
welfare_concerns: ~2,000 rows (est. 20 per school per year)
welfare_concern_attachments: ~1,000 rows
welfare_concern_threads: ~3,000 rows
─────────────────────
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
├─ Mark old models for deprecation
├─ Create new migrations
├─ Update seeders
└─ Test clean schema

PHASE 2: BACKEND CORE API
Time: 3-4 days
├─ Controllers: Submission, Concern, Enrollment, Dashboard
├─ Services: Submission, Concern, Enrollment, Report
├─ Models: IndicatorSubmission, WelfareConcern, EnrollmentRecord
├─ Validation rules
├─ Notification events
└─ API testing (Postman)

PHASE 3: FRONTEND AUTH & LAYOUT
Time: 2 days
├─ Login page (unified)
├─ Role-based layouts (School Head / Monitor)
├─ Sidebar navigation
├─ Auth context & guards
└─ Settings page

PHASE 4: SCHOOL HEAD FEATURES
Time: 4-5 days
├─ Requirements page (I-META, TARGETS-MET, SMEA forms)
├─ Form builder & validation
├─ Enrollment & Concerns page
├─ Flag New Concern modal
├─ Dashboard (3 cards + progress bar)
└─ History/Activity feed

PHASE 5: MONITOR FEATURES
Time: 4-5 days
├─ Reviews page (pending submissions queue)
├─ Review modal (view + comment + approve/return)
├─ Concerns board (division-wide)
├─ Reports page (CSV export + charts)
└─ Dashboard (4 KPI cards + breakdown)

PHASE 6: REAL-TIME & NOTIFICATIONS
Time: 2 days
├─ Reverb listeners
├─ Email queue
├─ Notification center (toast + bell)
└─ Multi-browser sync

PHASE 7: SECURITY HARDENING
Time: 2 days
├─ CSRF tokens
├─ Rate limiting
├─ Attachment encryption
├─ Audit logging
└─ Auth edge cases (token expiry, MFA, etc.)

PHASE 8: TESTING & DEPLOYMENT
Time: 2-3 days
├─ Unit tests
├─ Integration tests
├─ E2E tests
├─ Staging deployment
├─ Load testing
└─ Production deployment

─────────────────────
TOTAL: 4-5 WEEKS (solo dev)
       2-3 WEEKS (2-person team)
```

---

## FEATURES SIDE-BY-SIDE

| Feature | Old Capstone | New Design | Status |
|---------|--------------|-----------|--------|
| **Role-based Auth** | ✅ Monitor + School Head | ✅ Monitor + School Head | Reuse existing |
| **School Code Login** | ✅ 6-digit | ✅ 6-digit | Reuse existing |
| **Student Roster** | ✅ Full LRN tracking | ❌ REMOVED | Delete models |
| **Per-Student Status** | ✅ (15+ states) | ❌ REMOVED | Delete code |
| **Performance Tracking** | ✅ Grade/metric recording | ❌ REMOVED | Delete models |
| **I-META Submission** | ❌ Manual process | ✅ Digital form | Build new |
| **TARGETS-MET Submission** | ❌ Manual process | ✅ Auto-calculated from enrollment | Build new |
| **SMEA Submission** | ❌ Manual process | ✅ Digital form | Build new |
| **Enrollment Numbers** | ⚠️ Derived from student roster | ✅ Direct input form | Simplify |
| **Welfare Concerns** | ❌ Not in scope | ✅ Flagging + workflow | Build new |
| **Bulk Import** | ✅ User data | ✅ Schools + school heads | Refactor |
| **Audit Logging** | ✅ Full audit trail | ✅ Full audit trail | Reuse existing |
| **Notifications** | ✅ Reverb + email | ✅ Reverb + email | Reuse & refine |
| **Reports/Exports** | ✅ Complex analytics | ✅ Simple KPI reports | Simplify |
| **Dashboard Analytics** | ✅ Per-learner insights | ✅ Division-wide KPIs | Redesign |
| **MFA** | ✅ TOTP for monitor | ✅ TOTP for monitor | Reuse existing |

---

## ARCHITECTURAL CHANGES

### OLD ARCHITECTURE (Monolithic)
```
┌──────────────────────────────────────┐
│         CSPAMS MONOLITH              │
├──────────────────────────────────────┤
│ Auth Service                         │
│ Learner Management Service           │
│ Performance Tracking Service         │
│ At-Risk Detection Service (AI)       │
│ Reporting Service (complex)          │
│ Audit Service                        │
│ Notification Service                 │
├──────────────────────────────────────┤
│          LARGE DATABASE              │
│  (3.5M rows, complex schema)         │
├──────────────────────────────────────┤
│   React Frontend (many pages)        │
└──────────────────────────────────────┘
```

### NEW ARCHITECTURE (Focused)
```
┌──────────────────────────────────────┐
│         CSPAMS FOCUSED               │
├──────────────────────────────────────┤
│ Auth Service (reuse)                 │
│ Submission Service (new)             │
│ Concern Service (new)                │
│ Enrollment Service (new)             │
│ Reporting Service (simplified)       │
│ Audit Service (reuse)                │
│ Notification Service (reuse)         │
├──────────────────────────────────────┤
│       LIGHTWEIGHT DATABASE           │
│   (~7K rows, simple schema)          │
├──────────────────────────────────────┤
│  React Frontend (8-10 pages)         │
└──────────────────────────────────────┘
```

---

## CODE CLEANUP CHECKLIST

### MODELS TO REMOVE
```sql
DELETE FROM models/
├─ Student.php
├─ StudentPerformanceRecord.php
├─ StudentStatusLog.php
├─ PerformanceMetric.php
├─ Teacher.php (if exists)
└─ (any learner lifecycle related)

DELETE FROM migrations/
├─ create_students_table
├─ create_student_performance_records_table
├─ create_student_status_logs_table
├─ create_performance_metrics_table
└─ (any student-related migrations)
```

### FILAMENT RESOURCES TO REMOVE
```php
DELETE FROM app/Filament/Resources/
├─ StudentResource.php
├─ StudentPerformanceRecordResource.php
├─ StudentStatusLogResource.php
├─ PerformanceMetricResource.php
├─ TeacherResource.php
└─ (keep: SchoolResource, UserResource, AcademicYearResource, IndicatorSubmissionResource)
```

### API ROUTES TO REMOVE
```
DELETE FROM routes/api.php:
├─ /api/students/*
├─ /api/performance/*
├─ /api/status-logs/*
├─ /api/teachers/*
└─ (keep: /api/submissions/*, /api/concerns/*, /api/enrollment/*, /api/auth/*, /api/dashboard/*)
```

### FRONTEND COMPONENTS TO REMOVE
```
DELETE from frontend/src/:
├─ pages/LearnerRoster.tsx
├─ pages/StudentPerformance.tsx
├─ pages/AtRiskWatchlist.tsx
├─ pages/TeacherManagement.tsx
├─ components/StudentTable.tsx
├─ components/PerformanceChart.tsx
└─ hooks/useStudentData.ts
```

---

## RISK & MITIGATION

### RISK 1: Data Migration (if keeping historical records)

**Risk:** What happens to existing student records?

**Mitigation:**
```
Option A: Archive to separate schema (read-only)
├─ Create archive_students, archive_performance tables
├─ Keep old data accessible but not active
└─ Export to JSON for historical reference

Option B: Delete (clean slate)
├─ Backup full database
├─ Delete all student records
├─ Start fresh with new design
└─ Only keep schools + accounts
```

---

### RISK 2: Form Structure Changes Mid-Year

**Risk:** DepEd asks to add fields to I-META in June.

**Mitigation:**
```
Solution 1: Allow form flexibility
├─ Store form_data as JSON (no fixed columns)
├─ Add new fields to next year's form_data schema
└─ Old year's submissions stay as-is

Solution 2: Version forms
├─ indicator_submissions.form_version (v1, v2, v3)
├─ Each version has different schema
└─ Monitor can view with version-aware renderer
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

**Launch Readiness (✅ When to Deploy):**

- [ ] All 3 form types (I-META, TARGETS-MET, SMEA) working end-to-end
- [ ] School heads can submit + monitor can review
- [ ] Concerns workflow complete (flag → acknowledge → resolve)
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
- [ ] **Finalize form structures** (I-META, TARGETS-MET, SMEA fields)
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
