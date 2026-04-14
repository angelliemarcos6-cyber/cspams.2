# CSPAMS 2.0 - Quick Start Guide

```ts
// NEW 2026 COMPLIANCE UI: BMEF tab replaces TARGETS-MET
// 4-tab layout (School Achievements | Key Performance | BMEF | SMEA)
// Monitor & School Head views updated for DepEd standards
```

> April 2026 compliance UI refactor - TARGETS-MET renamed to BMEF with 4-tab layout.


**TL;DR:** Your new design is **4x simpler** than the old capstone. Stop tracking students. Start tracking compliance + concerns.

---

## ðŸŽ¯ THE BIG PICTURE

| Aspect | Old Design | New Design |
|--------|-----------|-----------|
| **Focus** | Individual learner lifecycle | School compliance + concerns |
| **Database** | 3.5M+ rows (learners, performance) | ~7K rows (submissions, concerns) |
| **Time to Build** | 6-8 months | **2-3 weeks** |
| **Complexity** | Enterprise-grade | Simple & focused |
| **Forms to build** | None (manual process) | **3 forms** (I-META, BMEF, SMEA) |

---

## ðŸ“‹ YOUR TWO CORE JOBS

```
JOB 1: Annual Compliance
â”œâ”€ School head fills 3 forms once per year
â”œâ”€ Monitor reviews & approves or returns
â””â”€ Done!

JOB 2: Welfare Tracking
â”œâ”€ School head flags student concerns (no names, just grade/section)
â”œâ”€ Monitor gets instant alert
â”œâ”€ Monitor & school head chat to resolve
â””â”€ Mark as resolved when done
```

---

## âœ… WHAT'S ALREADY BUILT (Reuse)

- âœ… Role-based authentication (monitor + school head)
- âœ… 6-digit school code login
- âœ… Audit logging
- âœ… Reverb real-time notifications
- âœ… Email delivery (SMTP, Resend)
- âœ… Master data (Schools, Academic Years)

**Don't reinvent the wheel â€“ these work!**

---

## âŒ WHAT TO DELETE

```php
// Delete these models (they're over-engineered):
DELETE: Student.php
DELETE: StudentPerformanceRecord.php
DELETE: StudentStatusLog.php
DELETE: PerformanceMetric.php
DELETE: (any learner-related code)
```

---

## ðŸ†• WHAT TO BUILD (3 New Tables)

```sql
CREATE TABLE welfare_concerns (
  id, school_id, grade_level, section, category, 
  description, status, flagged_at, acknowledged_at, resolved_at
);

CREATE TABLE welfare_concern_attachments (
  id, concern_id, file_path (encrypted), original_filename
);

CREATE TABLE welfare_concern_threads (
  id, concern_id, user_id, message, created_at
);

CREATE TABLE enrollment_records (
  id, school_id, academic_year_id, total_enrolled, dropouts, 
  transferees_in, transferees_out, completers, retention_rate, dropout_rate
);
```

---

## ðŸš€ 8-WEEK ROADMAP

| Week | Phase | Deliverable |
|------|-------|-------------|
| **1** | Cleanup | Delete old models, run new migrations |
| **2** | Backend Core | Models, Controllers, API endpoints working |
| **3-4** | School Head UI | Forms, Dashboard, Enrollment page |
| **5** | Monitor UI | Reviews, Concerns board, Reports |
| **6** | Real-time + Notifications | Reverb, email, in-app alerts |
| **7** | Security | CSRF, rate limits, encryption |
| **8** | Testing & Deploy | E2E tests, staging, go live |

---

## ðŸŽ¬ START HERE (This Week)

### Step 1: Answer These 10 Questions
1. When does this need to go live? (school year date?)
2. How many schools? (50? 100? 200?)
3. Who's the DepEd project owner? (decision maker?)
4. Do you need to migrate old data? (yes/no?)
5. What are the top 3 reports monitors need?
6. Submission deadline date? (e.g., June 30)
7. Concern SLA? (respond within 24h? 48h?)
8. Mobile app or responsive web only?
9. Budget for hosting? (shared hosting ok?)
10. Who will train users?

### Step 2: Get Sign-off
- Show DepEd the **new design** (much simpler!)
- Confirm the 3 forms (I-META, BMEF, SMEA)
- Get buy-in on concern categories

### Step 3: Start Phase 1 (Cleanup)
```bash
# Create migrations
php artisan make:migration create_welfare_concerns_table
php artisan make:migration create_welfare_concern_attachments_table
php artisan make:migration create_welfare_concern_threads_table
php artisan make:migration create_enrollment_records_table

# Run migrations
php artisan migrate

# Delete old models
rm app/Models/Student.php
rm app/Models/StudentPerformanceRecord.php
rm app/Models/StudentStatusLog.php
# (etc.)
```

---

## ðŸ“± WHICH FILE IS WHICH?

You have **3 documents:**

1. **CSPAMS_PROJECT_ANALYSIS.md** (This is your bible)
   - Complete gap analysis
   - New component architecture
   - Implementation roadmap (8 phases)
   - 10 brainstorm topics
   - All questions answered

2. **CSPAMS_DESIGN_COMPARISON.md** (The visual summary)
   - Old vs New side-by-side
   - Database size impact (3.5M â†’ 7K rows)
   - Code cleanup checklist
   - Risk & mitigation
   - Deployment recommendations

3. **CSPAMS_IMPLEMENTATION_GUIDE.md** (Copy-paste ready code)
   - Complete migrations
   - All 4 models with relationships
   - API controllers (ConcernController, EnrollmentController)
   - Form validation (Request classes)
   - React components (TypeScript)
   - Database query service
   - Tests

4. **This file** (CSPAMS_QUICK_START.md)
   - 1-page overview
   - Action items

---

## ðŸŽ¨ FORM FIELDS (I-META Example)

From your uploaded document, I-META has:

**Section I.A â€“ Leadership & Governance**
- 5+ items, each scored 1-5
- Total = average of all items

**Section I.B â€“ Teaching & Learning**
- Similar structure

...and so on. (Full form structure is in the Implementation Guide)

---

## ðŸ—ï¸ FOLDER STRUCTURE (After Cleanup)

```
cspams.2/
â”œâ”€ app/
â”‚  â”œâ”€ Http/Controllers/Api/
â”‚  â”‚  â”œâ”€ SubmissionController.php (existing, refine)
â”‚  â”‚  â”œâ”€ ConcernController.php (NEW)
â”‚  â”‚  â”œâ”€ EnrollmentController.php (NEW)
â”‚  â”‚  â””â”€ DashboardController.php (refine)
â”‚  â”‚
â”‚  â”œâ”€ Models/
â”‚  â”‚  â”œâ”€ IndicatorSubmission.php (refine)
â”‚  â”‚  â”œâ”€ WelfareConcern.php (NEW)
â”‚  â”‚  â”œâ”€ WelfareConcernThread.php (NEW)
â”‚  â”‚  â”œâ”€ WelfareConcernAttachment.php (NEW)
â”‚  â”‚  â”œâ”€ EnrollmentRecord.php (NEW)
â”‚  â”‚  â””â”€ School.php (existing)
â”‚  â”‚
â”‚  â”œâ”€ Services/
â”‚  â”‚  â”œâ”€ SubmissionService.php (existing)
â”‚  â”‚  â”œâ”€ ConcernService.php (NEW)
â”‚  â”‚  â”œâ”€ EnrollmentService.php (NEW)
â”‚  â”‚  â””â”€ DashboardService.php (refine)
â”‚  â”‚
â”‚  â””â”€ Events/
â”‚     â”œâ”€ SubmissionSubmitted.php (existing)
â”‚     â”œâ”€ ConcernFlagged.php (NEW)
â”‚     â””â”€ ConcernResolved.php (NEW)
â”‚
â”œâ”€ frontend/src/
â”‚  â”œâ”€ pages/
â”‚  â”‚  â”œâ”€ school-head/
â”‚  â”‚  â”‚  â”œâ”€ Dashboard.tsx
â”‚  â”‚  â”‚  â”œâ”€ Requirements.tsx (I-META, BMEF, SMEA forms)
â”‚  â”‚  â”‚  â”œâ”€ EnrollmentAndConcerns.tsx
â”‚  â”‚  â”‚  â””â”€ History.tsx
â”‚  â”‚  â”‚
â”‚  â”‚  â”œâ”€ monitor/
â”‚  â”‚  â”‚  â”œâ”€ Dashboard.tsx
â”‚  â”‚  â”‚  â”œâ”€ Reviews.tsx
â”‚  â”‚  â”‚  â”œâ”€ Concerns.tsx
â”‚  â”‚  â”‚  â””â”€ Reports.tsx
â”‚  â”‚  â”‚
â”‚  â”‚  â””â”€ auth/
â”‚  â”‚     â””â”€ Login.tsx
â”‚  â”‚
â”‚  â”œâ”€ components/
â”‚  â”‚  â”œâ”€ modals/
â”‚  â”‚  â”‚  â””â”€ FlagConcernModal.tsx
â”‚  â”‚  â”œâ”€ forms/
â”‚  â”‚  â”‚  â”œâ”€ IMetaForm.tsx
â”‚  â”‚  â”‚  â”œâ”€ TargetsMETForm.tsx
â”‚  â”‚  â”‚  â”œâ”€ SMEAForm.tsx
â”‚  â”‚  â”‚  â””â”€ EnrollmentForm.tsx
â”‚  â”‚  â””â”€ concerns/
â”‚  â”‚     â”œâ”€ ConcernsList.tsx
â”‚  â”‚     â””â”€ ConcernDetail.tsx
â”‚  â”‚
â”‚  â”œâ”€ hooks/
â”‚  â”‚  â”œâ”€ useAuth.ts
â”‚  â”‚  â”œâ”€ useConcerns.ts
â”‚  â”‚  â”œâ”€ useSubmissions.ts
â”‚  â”‚  â””â”€ useEnrollment.ts
â”‚  â”‚
â”‚  â””â”€ types/
â”‚     â”œâ”€ concerns.ts
â”‚     â”œâ”€ submissions.ts
â”‚     â””â”€ enrollment.ts
â”‚
â””â”€ database/migrations/
   â”œâ”€ YYYY_XX_XX_create_welfare_concerns_table.php
   â”œâ”€ YYYY_XX_XX_create_welfare_concern_attachments_table.php
   â”œâ”€ YYYY_XX_XX_create_welfare_concern_threads_table.php
   â””â”€ YYYY_XX_XX_create_enrollment_records_table.php
```

---

## ðŸ’¡ KEY DESIGN DECISIONS

### Decision 1: Form Data Storage
**JSON in DB** (simplest) or Normalized Tables (queryable)?
â†’ **Start with JSON**, migrate if needed

### Decision 2: Draft Auto-Save
**localStorage draft + manual save** (no API overhead)
â†’ **Recommended approach**

### Decision 3: Real-time Notifications
**Reverb + email + polling** (best UX)
â†’ **Implement all three**

### Decision 4: Concern Evidence
**Encrypt files before storage** using Laravel Crypt
â†’ **Privacy-safe**

### Decision 5: Submission Deadlines
**Soft deadline** (warning only, allows late)
â†’ **Plus email reminders** (30d, 7d, 1d before)

---

## ðŸ” SECURITY CHECKLIST

- [ ] CSRF tokens on forms
- [ ] Rate limiting on login (brute force protection)
- [ ] Encrypt concern attachments
- [ ] No student names/LRN in concern descriptions
- [ ] Audit log all submissions + concern changes
- [ ] Token expiry + refresh handling
- [ ] MFA recovery for monitors

---

## ðŸ“Š WHAT AINT INCLUDED (Intentionally)

These are features from the OLD design that are **NOT** in the new scope:

- âŒ Full student roster / LRN database
- âŒ Individual student performance tracking
- âŒ Attendance tracking
- âŒ Grade/assessment recording
- âŒ At-risk algorithm (AI detection)
- âŒ Teacher records
- âŒ National LIS/EBEIS integration
- âŒ Detailed learner lifecycle states

**Why removed?** They're out of scope + add complexity. If DepEd needs them later, they're separate systems.

---

## ðŸŽ“ FORM STRUCTURES (To Be Finalized)

You have uploaded I-META doc. Still need clarification on:

1. **BMEF**: Is this auto-calculated from enrollment + previous targets?
2. **SMEA**: What fields/sections does it have?
3. **Enrollment Form**: Do schools report by grade or school-wide?
4. **Concern Categories**: Are the 8 categories (abuse, financial, dropout, etc.) final?

â†’ **Ask DepEd to confirm these before coding**

---

## ðŸš¢ GO-LIVE CHECKLIST

Before deploying to production:

- [ ] All 3 forms working (I-META, BMEF, SMEA)
- [ ] School head can submit + monitor can review
- [ ] Concerns workflow complete (flag â†’ acknowledge â†’ resolve)
- [ ] Notifications working (email + real-time)
- [ ] Dashboard shows accurate KPIs
- [ ] CSV export working for monitors
- [ ] E2E tests passing
- [ ] Load test passed (100 concurrent users)
- [ ] Security audit done
- [ ] User manual written
- [ ] Training video created
- [ ] Staging deployment stable for 48h
- [ ] Backup/restore tested
- [ ] Uptime monitoring configured
- [ ] Support plan ready

---

## ðŸ’¬ NEXT STEPS FOR YOU

### **This week:**
1. Read the 3 documents (start with QUICK_START, then PROJECT_ANALYSIS)
2. Answer the 10 brainstorm questions
3. Schedule sync with DepEd (confirm design)

### **Next week:**
1. Start Phase 1 (cleanup, migrations)
2. Set up GitHub project board (track progress)
3. Begin form structure documentation

### **Within 2 weeks:**
1. Phase 2 (backend API core)
2. Phase 3 (frontend auth + layout)

### **Within 4-5 weeks:**
1. All phases complete
2. Staging deployment ready

### **Within 6 weeks:**
1. Production ready for DepEd Santiago City

---

## ðŸ†˜ IF YOU GET STUCK

**Problem:** "I don't know how to structure the I-META form"
â†’ See: CSPAMS_IMPLEMENTATION_GUIDE.md, Section 4 (Form Validation) + copy the Request class pattern

**Problem:** "Real-time notifications seem complex"
â†’ See: CSPAMS_PROJECT_ANALYSIS.md, Part 5, Decision 4 (Real-time Notifications) + the Events code in Implementation Guide

**Problem:** "How do I delete all the old student models?"
â†’ See: CSPAMS_DESIGN_COMPARISON.md, Code Cleanup Checklist

**Problem:** "What should I deploy to first?"
â†’ See: CSPAMS_DESIGN_COMPARISON.md, Deployment Recommendations

---

## ðŸ“ž QUESTIONS TO ASK DEPED

Before you code anything, **confirm these with DepEd Santiago City:**

1. **Go-live date?** (e.g., June 1, 2025?)
2. **Number of schools?** (25? 50? 100?)
3. **Number of monitors?** (5? 10?)
4. **Submission deadline date?** (e.g., June 30 each year?)
5. **Top 3 reports monitors need?**
6. **Concern response SLA?** (acknowledge within 24h?)
7. **Forms final?** (Can I-META/BMEF/SMEA change mid-year?)
8. **Mobile needed?** (Or responsive web only?)
9. **Historical data migration?** (Keep old system's data?)
10. **Training plan?** (You'll train? Or provide docs?)

---

## ðŸ“ˆ SUCCESS METRICS

### By Week 3:
- [ ] Migrations running
- [ ] Models created
- [ ] API endpoints testable in Postman

### By Week 6:
- [ ] School head can fill & submit all 3 forms
- [ ] Monitor can review & approve/return
- [ ] Concerns flagging + workflow working
- [ ] Dashboard showing real data

### By Week 8 (Launch):
- [ ] 95%+ schools submit by deadline
- [ ] Monitor responds to concerns within 24h
- [ ] 99.5% uptime
- [ ] <2 support tickets per day

---

## ðŸŽ BONUS: Copy-Paste Starters

All code in the Implementation Guide is production-ready. Just:

1. Copy migrations into `database/migrations/`
2. Copy models into `app/Models/`
3. Copy controllers into `app/Http/Controllers/Api/`
4. Copy React components into `frontend/src/components/`
5. Adjust table names/fields to your naming convention
6. Run tests

---

## ðŸ“š Document Map

```
CSPAMS_QUICK_START.md (You are here)
â”œâ”€ Overview + action items
â”‚
â”œâ”€ CSPAMS_PROJECT_ANALYSIS.md
â”‚  â”œâ”€ Gap analysis (what's in repo vs what you need)
â”‚  â”œâ”€ New database schema
â”‚  â”œâ”€ Component architecture
â”‚  â”œâ”€ 8-phase implementation roadmap
â”‚  â”œâ”€ 10 brainstorm topics
â”‚  â””â”€ 10 questions to answer
â”‚
â”œâ”€ CSPAMS_DESIGN_COMPARISON.md
â”‚  â”œâ”€ Old vs New side-by-side
â”‚  â”œâ”€ Database size impact
â”‚  â”œâ”€ Feature comparison table
â”‚  â”œâ”€ Code cleanup checklist
â”‚  â”œâ”€ Risk & mitigation
â”‚  â””â”€ Deployment recommendations
â”‚
â””â”€ CSPAMS_IMPLEMENTATION_GUIDE.md
   â”œâ”€ Copy-paste migrations
   â”œâ”€ All 4 models (full code)
   â”œâ”€ API controllers
   â”œâ”€ Form validation
   â”œâ”€ React components (TypeScript)
   â”œâ”€ Database queries
   â”œâ”€ Notification events
   â””â”€ Test examples
```

---

## ðŸ FINAL WORDS

Your new design is **pragmatic & achievable**. Instead of building a learner management system, you're building a compliance tracker + concern flagging system. That's much more doable in the real world.

**The repo you have is 80% done** with authentication, audit logging, and notifications. You just need to delete the learner tracking stuff and add the 3 new tables + forms.

**2-3 weeks of focused work** and you'll have a working system ready for DepEd Santiago City.

**Go get it!** ðŸš€

---

**Last Updated:** April 11, 2026  
**Project:** CSPAMS 2.0 Redesign  
**Status:** Ready for Kickoff


