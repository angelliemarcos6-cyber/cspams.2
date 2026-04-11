# CSPAMS 2.0 - Project Analysis & Implementation Brainstorm

**Current Date:** April 11, 2026  
**Project:** Centralized Student Performance Analytics and Monitoring System (CSPAMS)  
**For:** DepEd Division Office Santiago City  

---

## EXECUTIVE SUMMARY

Your **new design** is a radical simplification from the capstone scope. Instead of a comprehensive learner lifecycle management system, you're building a **lightweight compliance + welfare tracking tool** focused on two core workflows:

1. **Annual Compliance** – School heads submit 3 required packages yearly (I-META, TARGETS-MET, SMEA)
2. **School Welfare Tracking** – Real-time flagging of student concerns (abuse, dropout risk, attendance, etc.)

**Current Repo Status:** ~274 commits, full learner database (LRN tracking, lifecycle, performance metrics, audit logs). This is **overcomplicated** for the new scope.

---

## PART 1: GAP ANALYSIS – WHAT'S IN THE REPO VS. WHAT YOU NEED

### ✅ ALREADY BUILT (Reuse These)

| Component | Status | Repo Location | Notes |
|-----------|--------|---------------|-------|
| **Role-based auth** | ✅ Done | `app/Models/User.php`, Filament | Monitor + School Head roles exist; school code login works |
| **Sanctum API** | ✅ Done | `routes/api.php` | Token-based auth; good foundation |
| **Dashboard layout** | ✅ Partial | `frontend/src/pages` | Sidebar navigation, KPI cards – reusable |
| **Schools master data** | ✅ Done | `app/Models/School.php` | School CRUD, 6-digit code validation |
| **Academic years** | ✅ Done | `app/Models/AcademicYear.php` | School year model for context |
| **Audit logging** | ✅ Done | `app/Models/AuditLog.php` | Track all CRUD actions |
| **Notifications** | ✅ Partial | Reverb + queue | Real-time + email; needs refinement for concern updates |
| **Reports/exports** | ✅ Partial | `app/Resources` (Filament) | CSV export framework exists; refine for new reports |
| **Email delivery** | ✅ Done | SMTP/Resend integration | Password reset, MFA, setup links – reusable |

### ❌ NEEDS TO BE REMOVED/SIMPLIFIED (Too Complex for New Scope)

| Component | Current State | Action | Why |
|-----------|---------------|--------|-----|
| **Full LRN student database** | `app/Models/Student.php` + 5K+ records | **REMOVE** | New design doesn't track individual LRN; only enrollment numbers |
| **Student performance metrics** | `app/Models/StudentPerformanceRecord.php` | **REMOVE** | Not part of welfare tracking; belongs in separate system |
| **Student status lifecycle** | `app/Models/StudentStatusLog.php` + status codes | **SIMPLIFY** | Only need status labels (enrolled/dropped/etc.) for enrollment form, not full lifecycle |
| **Teacher records** | If present in old capstone | **REMOVE** | Not in new scope |
| **At-risk watchlist AI** | Complex risk-scoring logic | **REMOVE** | Concerns are user-flagged, not algorithm-driven |
| **Detailed learner history** | Granular timeline tracking | **SIMPLIFY** | Keep simple submission history + concern status history |
| **Filament admin panel bloat** | Many resource pages | **REFACTOR** | Keep only: Schools, Monitors, School Heads, Submissions, Concerns |

### 🔶 NEEDS TO BE BUILT (New Functionality)

| Component | Priority | Effort | Details |
|-----------|----------|--------|---------|
| **Indicator Submission Forms** | 🔴 Critical | 2-3 days | I-META, TARGETS-MET, SMEA form builders + validation |
| **Concerns (Welfare Flagging)** | 🔴 Critical | 2 days | Form, state machine (Open → In Progress → Resolved), notifications |
| **Division-wide Reports** | 🟠 High | 1-2 days | KPIs: % schools submitted, at-risk count, enrollment/dropout rates |
| **Simplified Enrollment Form** | 🟠 High | 1 day | School heads enter: Total enrolled, Dropouts, Transferees, Completers |
| **Notification Center** | 🟠 High | 1 day | In-app + email for submission returns, concern updates |
| **Multi-school Sync** | 🟡 Medium | 1-2 days | Monitor dashboard aggregates all schools instantly |
| **Attachment Encryption** | 🟡 Medium | 1 day | For concern evidence (PDFs/photos) |

---

## PART 2: NEW INFORMATION ARCHITECTURE

### Database Changes (Migrations Needed)

#### **REMOVE These Tables**
```sql
-- student_performance_records
-- student_status_logs
-- performance_metrics
-- teacher-related tables (if any)
-- full student details (keep minimal)
```

#### **CREATE/MODIFY These Tables**

```
Tables to Create:
├─ indicator_submissions (exists, refine)
│  ├─ id
│  ├─ school_id
│  ├─ academic_year_id
│  ├─ submission_type ('I-META', 'TARGETS-MET', 'SMEA')
│  ├─ status ('draft', 'submitted', 'returned', 'approved')
│  ├─ submitted_at (nullable)
│  ├─ submitted_by (school_head_id)
│  ├─ reviewed_by (monitor_id, nullable)
│  ├─ review_notes (text, nullable)
│  ├─ form_data (json – stores form fields)
│  ├─ created_at, updated_at
│
├─ enrollment_records (NEW)
│  ├─ id
│  ├─ school_id
│  ├─ academic_year_id
│  ├─ total_enrolled
│  ├─ dropouts
│  ├─ transferees_in
│  ├─ transferees_out
│  ├─ completers
│  ├─ retention_rate (computed)
│  ├─ submitted_at
│  ├─ submitted_by (school_head_id)
│  ├─ created_at, updated_at
│
├─ welfare_concerns (NEW – replaces or extends)
│  ├─ id
│  ├─ school_id
│  ├─ flagged_by (school_head_id)
│  ├─ flagged_at
│  ├─ grade_level
│  ├─ section
│  ├─ category ('abuse', 'financial', 'dropout_risk', 'attendance', 'family', 'health', 'bullying', 'other')
│  ├─ description (text – NO student name/LRN)
│  ├─ status ('open', 'in_progress', 'resolved')
│  ├─ acknowledged_by (monitor_id, nullable)
│  ├─ acknowledged_at (nullable)
│  ├─ resolved_by (monitor_id, nullable)
│  ├─ resolved_at (nullable)
│  ├─ created_at, updated_at
│
├─ welfare_concern_attachments (NEW)
│  ├─ id
│  ├─ concern_id
│  ├─ file_path (encrypted)
│  ├─ original_filename
│  ├─ file_type (PDF/JPG/PNG)
│  ├─ uploaded_by (school_head_id)
│  ├─ created_at
│
├─ welfare_concern_threads (NEW)
│  ├─ id
│  ├─ concern_id
│  ├─ user_id (monitor or school_head)
│  ├─ message (text)
│  ├─ created_at
│
├─ submission_history (exists, refine)
│  └─ Already covers I-META/TARGETS-MET/SMEA history
```

### API Endpoints (Refined)

**School Head Endpoints:**

```
POST   /api/submissions/indicator
GET    /api/submissions/indicator/{id}
PUT    /api/submissions/indicator/{id}  (draft only)
POST   /api/submissions/indicator/{id}/submit
GET    /api/submissions/history
POST   /api/submissions/enrollment
GET    /api/enrollment/current
PUT    /api/enrollment/{id}
POST   /api/concerns/flag
GET    /api/concerns/my-school
PUT    /api/concerns/{id}/status  (view only, monitor updates)
GET    /api/concerns/{id}/thread
POST   /api/concerns/{id}/thread  (add message)
```

**Monitor Endpoints (All Above + Division-wide):**

```
GET    /api/submissions/indicator?school=&status=&type=
POST   /api/submissions/indicator/{id}/review
GET    /api/dashboard/overview
GET    /api/dashboard/compliance-breakdown
GET    /api/dashboard/pending-reviews
GET    /api/dashboard/at-risk-schools
GET    /api/concerns/all
PUT    /api/concerns/{id}/acknowledge
POST   /api/concerns/{id}/resolve
GET    /api/reports/export?format=csv&type=compliance|enrollment|concerns
```

---

## PART 3: FRONTEND COMPONENT ARCHITECTURE

### React Component Tree (Simplified)

```
frontend/src/
├─ layouts/
│  ├─ SchoolHeadLayout.tsx         (sidebar: Dashboard, Requirements, Enrollment & Concerns, History, Settings)
│  └─ DivisionMonitorLayout.tsx     (sidebar: Dashboard, Schools, Reviews, Reports, Concerns, System)
│
├─ pages/
│  ├─ auth/
│  │  ├─ LoginPage.tsx             (unified login form, role selector)
│  │  ├─ ForgotPasswordPage.tsx
│  │  └─ MFAPage.tsx
│  │
│  ├─ school-head/
│  │  ├─ Dashboard.tsx             (3 cards: Requirements Due, Enrollment Snapshot, Open Concerns)
│  │  ├─ Requirements/
│  │  │  ├─ RequirementsPage.tsx   (tabs: I-META | TARGETS-MET | SMEA)
│  │  │  ├─ I_METAForm.tsx         (form builder from document)
│  │  │  ├─ TARGETSMETForm.tsx
│  │  │  ├─ SMEAForm.tsx
│  │  │  └─ SubmissionHistory.tsx
│  │  ├─ EnrollmentAndConcerns/
│  │  │  ├─ EnrollmentTab.tsx      (form: total, dropouts, transferees)
│  │  │  └─ ConcernsTab.tsx        (list: my school's flagged concerns)
│  │  ├─ FlagConcernModal.tsx      (reusable modal to flag new concern)
│  │  ├─ ConcernDetail.tsx         (view + thread messages)
│  │  └─ Settings.tsx
│  │
│  ├─ monitor/
│  │  ├─ Dashboard.tsx             (4 KPI cards, compliance pie, pending queue, concerns list)
│  │  ├─ Schools/
│  │  │  ├─ SchoolsList.tsx        (searchable table)
│  │  │  └─ SchoolDetail.tsx       (view school data + quick actions)
│  │  ├─ Reviews/
│  │  │  ├─ ReviewsQueue.tsx       (pending submissions table)
│  │  │  ├─ SubmissionReview.tsx   (open package, add notes, return/approve)
│  │  │  └─ ReviewHistory.tsx
│  │  ├─ Concerns/
│  │  │  ├─ ConcernsBoard.tsx      (division-wide, sortable by urgency)
│  │  │  ├─ ConcernDetail.tsx      (view + thread + acknowledge/resolve buttons)
│  │  │  └─ ConcernStats.tsx       (counts by category)
│  │  ├─ Reports/
│  │  │  ├─ ReportsPage.tsx        (export options)
│  │  │  └─ ReportBuilder.tsx
│  │  └─ System/
│  │     ├─ AuditLog.tsx
│  │     └─ Settings.tsx
│  │
│  └─ NotFound.tsx
│
├─ components/
│  ├─ shared/
│  │  ├─ Sidebar.tsx              (role-aware, collapse/expand)
│  │  ├─ Header.tsx               (school year banner, user menu)
│  │  ├─ ProgressBar.tsx          (5-step submission flow)
│  │  ├─ KPICard.tsx              (reusable metric card)
│  │  ├─ StatusBadge.tsx          (Draft/Submitted/Returned/Approved)
│  │  ├─ LoadingSpinner.tsx
│  │  └─ ErrorBoundary.tsx
│  │
│  ├─ forms/
│  │  ├─ IndicatorForm.tsx        (base form for I-META/TARGETS-MET/SMEA)
│  │  ├─ EnrollmentForm.tsx
│  │  ├─ ConcernForm.tsx
│  │  └─ FormField.tsx            (input, select, textarea wrapper)
│  │
│  └─ tables/
│     ├─ SubmissionsTable.tsx
│     ├─ ConcernsTable.tsx
│     └─ DataTable.tsx            (generic, sortable, filterable)
│
├─ hooks/
│  ├─ useAuth.ts                  (auth context + login/logout)
│  ├─ useSubmissions.ts           (CRUD for indicator submissions)
│  ├─ useConcerns.ts              (CRUD + state changes for concerns)
│  ├─ useEnrollment.ts
│  ├─ useDashboard.ts
│  └─ useFetch.ts                 (wrapper for API calls with error handling)
│
├─ services/
│  ├─ api.ts                      (Axios instance, interceptors)
│  ├─ auth.service.ts
│  ├─ submissions.service.ts
│  ├─ concerns.service.ts
│  └─ reports.service.ts
│
├─ context/
│  ├─ AuthContext.tsx             (user, role, permissions)
│  ├─ NotificationContext.tsx     (toast messages, in-app alerts)
│  └─ SchoolContext.tsx           (current school, academic year)
│
├─ types/
│  ├─ index.ts                    (all TypeScript interfaces)
│  └─ api.ts                      (request/response types)
│
└─ utils/
   ├─ formatters.ts               (date, number, status labels)
   ├─ validators.ts
   └─ storage.ts                  (localStorage for drafts)
```

---

## PART 4: FORMS – THE HEART OF THE SYSTEM

### I-META Form Structure (from uploaded document)

Your I-META document is a **multi-section quality assurance self-evaluation**:

**Sections to Digitize:**
1. School Identification (school name, address, school code, principal name)
2. I.A – Leadership & Governance (score 1-5 per item)
3. I.B – Teaching & Learning (score 1-5)
4. I.C – Learning Environment (score 1-5)
5. I.D – Curriculum & Instruction (score 1-5)
6. I.E – Assessment (score 1-5)
7. II – Institutional Capacity (ratings)
8. III – Financial Management (yes/no items)
9. Overall School Rating (auto-calculated from averages)

**Form Builder Approach:**

```typescript
// types/forms.ts
export interface IMetaSubmission {
  schoolId: string;
  academicYearId: string;
  sections: {
    schoolIdentification: SchoolIdentificationData;
    sectionIA: GovernanceData;
    sectionIB: TeachingLearningData;
    sectionIC: LearningEnvironmentData;
    sectionID: CurriculumInstructionData;
    sectionIE: AssessmentData;
    sectionII: InstitutionalCapacityData;
    sectionIII: FinancialManagementData;
  };
  overallRating?: number; // auto-calculated
  submittedAt?: string;
  reviewNotes?: string;
}

// Form validation rules
// - All required fields must be filled
// - Scores must be 1-5
// - Overall rating auto-calculates average
// - Pre-fill from previous year where applicable
```

**TARGETS-MET** is KPI-based (auto-calculated from enrollment data + previous targets).

**SMEA** needs to be reviewed in the uploaded doc.

---

## PART 5: KEY DESIGN DECISIONS & QUESTIONS FOR BRAINSTORM

### 🤔 **Decision 1: Form Data Storage**

**Option A: Flatten JSON in DB**
```json
// In indicator_submissions.form_data
{
  "schoolIdentification": { ... },
  "sectionIA": { ... },
  ...
}
```
✅ Simple; ❌ Hard to query/report on individual fields

**Option B: Normalized Sub-tables**
```
Create tables: form_section_ia, form_section_ib, etc.
Link to submission via submission_id
```
✅ Queryable; ❌ More migrations

**RECOMMENDATION:** Start with **Option A (JSON)** for speed. If reporting needs are heavy, migrate to Option B later.

---

### 🤔 **Decision 2: Draft Auto-Save**

School heads may draft forms over multiple sessions.

**Option A: Auto-save on every keystroke (frontend → backend)**
```javascript
// Every 3 seconds while typing
debounce(() => {
  api.put(`/api/submissions/indicator/${id}`, formData);
}, 3000)
```
✅ Never lose work; ❌ Heavy API traffic

**Option B: Save on blur or interval (every 30 sec)**
✅ Balance; ❌ Could lose recent edits

**Option C: localStorage + manual save button**
✅ No API overhead; ❌ Loss on browser crash

**RECOMMENDATION:** Use **Option C (localStorage draft)** + **manual Save button** + one-click "Load Draft" to reload from localStorage. Lighter and clearer UX.

---

### 🤔 **Decision 3: Concern Evidence Encryption**

**Option A: Use Laravel's built-in Crypt**
```php
// In model
protected $casts = [
  'file_path' => 'encrypted',
];
```
✅ Simple; ❌ All data encrypted at rest (slower)

**Option B: Encrypt file content before storage**
```php
$encrypted = Crypt::encrypt(file_get_contents($file));
Storage::disk('local')->put('concerns/' . $uuid, $encrypted);
```
✅ Only sensitive files encrypted; ❌ More code

**Option C: Use S3 with server-side encryption**
✅ Scalable; ❌ Costs money

**RECOMMENDATION:** Start with **Option B** (encrypt individual files). Use Laravel's `Storage` facade + `Crypt` class.

---

### 🤔 **Decision 4: Real-time Notifications**

**Current Stack:** Reverb + Laravel Reverb (WebSocket)

**Option A: Use existing Reverb**
```php
// In ReviewSubmissionAction
broadcast(new SubmissionReviewed($submission))->toOthers();
```
✅ Already set up; ❌ Requires Reverb running in production

**Option B: Fallback to polling + email**
```javascript
// Frontend polls /api/submissions/status every 30 seconds
setInterval(() => fetch('/api/submissions/status'), 30000);
```
✅ No extra service; ❌ Delay in updates

**Option C: Hybrid (Reverb + email + polling fallback)**
✅ Best UX; ❌ Most complex

**RECOMMENDATION:** Implement **Option C** – Reverb for real-time, email for offline, polling as fallback.

---

### 🤔 **Decision 5: Bulk School Data Seeding**

Your repo has a `SantiagoCitySchoolAccountsSeeder`. Should you:

**Option A: Keep it, update for new DB schema**
```php
// app/Database/Seeders/SantiagoCitySchoolAccountsSeeder
// Creates ~100 schools + 100 school head accounts
```

**Option B: Use a CSV import endpoint instead**
```
POST /api/admin/schools/import-csv
```

**RECOMMENDATION:** Keep **Option A** for local dev speed, add **Option B** for production onboarding.

---

## PART 6: IMPLEMENTATION ROADMAP

### **Phase 1: Cleanup & Simplification (2-3 days)**

- [ ] Audit which tables/models are used in new design
- [ ] Mark old capstone models for removal (student, performance, teacher, etc.)
- [ ] Create new migrations: `welfare_concerns`, `enrollment_records`
- [ ] Update seeders to remove old data
- [ ] Write migration rollback tests

**Deliverable:** Clean DB schema matching new design.

---

### **Phase 2: Backend Core (3-4 days)**

- [ ] Create models: `WelfareConcern`, `EnrollmentRecord`, `IndicatorSubmission` (refine existing)
- [ ] Write API controllers: `SubmissionController`, `ConcernController`, `EnrollmentController`
- [ ] Add relationships and scopes (school-aware queries)
- [ ] Write validation rules (form field validation)
- [ ] Create notification events: `SubmissionReviewed`, `ConcernFlagged`, `ConcernAcknowledged`
- [ ] Test all endpoints with Postman/Insomnia

**Deliverable:** Full API working with proper auth/scoping.

---

### **Phase 3: Frontend Auth & Layout (2 days)**

- [ ] Refactor login page (unified, role selector)
- [ ] Build `SchoolHeadLayout` + `DivisionMonitorLayout`
- [ ] Implement role-based route guards
- [ ] Create sidebar navigation with collapse
- [ ] Set up context providers: `AuthContext`, `SchoolContext`

**Deliverable:** Clean navigation, role-based views.

---

### **Phase 4: School Head Features (4-5 days)**

- [ ] Build Requirements page (tabs: I-META, TARGETS-MET, SMEA)
  - [ ] Form builder for each indicator type
  - [ ] Draft save to localStorage
  - [ ] Submit workflow (validation → API call → status update)
- [ ] Build Enrollment & Concerns page
  - [ ] Enrollment form
  - [ ] Concerns list + detail view
  - [ ] Flag New Concern modal
- [ ] Build History/Activity feed
- [ ] Dashboard integration (3 cards + progress bar)

**Deliverable:** School head can submit all 3 packages + flag concerns.

---

### **Phase 5: Monitor Features (4-5 days)**

- [ ] Build Reviews page (queue of submissions)
- [ ] Build Review modal (view package + add notes + return/approve)
- [ ] Build Concerns board (all division concerns, sortable)
- [ ] Build Reports page (CSV export + charts)
- [ ] Dashboard integration (4 KPI cards + breakdown chart)

**Deliverable:** Monitor can review submissions + manage concerns + export reports.

---

### **Phase 6: Real-time & Notifications (2 days)**

- [ ] Set up Reverb listeners on frontend
- [ ] Implement email notification queue
- [ ] Build notification center (in-app toast + bell icon)
- [ ] Test multi-browser sync (one user changes status, others see it instantly)

**Deliverable:** Real-time updates working end-to-end.

---

### **Phase 7: Security & Hardening (2 days)**

- [ ] Implement CSRF tokens on forms
- [ ] Rate limiting on API endpoints
- [ ] Encrypt concern attachments
- [ ] Audit logging for all CRUD actions
- [ ] Test auth edge cases (token expiry, multi-tab logout, MFA recovery)

**Deliverable:** Production-ready security.

---

### **Phase 8: Testing & Deployment (2-3 days)**

- [ ] Write unit tests (models, services)
- [ ] Write integration tests (API endpoints)
- [ ] Write E2E tests (Cypress/Playwright)
- [ ] Deploy to staging
- [ ] Load test (simulate 100 concurrent school heads)
- [ ] Deploy to production

**Deliverable:** Live system ready for DepEd Santiago City.

---

## PART 7: SPECIFIC BRAINSTORM TOPICS

### **Topic 1: User Onboarding**

Q: How do new school heads get accounts?

**Current approach:** Monitor creates account + sends setup link.

**Options:**
- A) Monitor bulk imports school heads via CSV → auto-generates accounts → sends setup links via email
- B) School heads self-register with school code + verification PIN
- C) DepEd admin portal handles all account creation centrally

**Recommendation:** **A** (current approach is fine) + build a Filament resource for monitor to bulk import CSV.

---

### **Topic 2: Submission Deadlines**

Q: Should CSPAMS enforce submission deadlines?

**Options:**
- A) Soft deadline (visual warning in UI, allows late submission)
- B) Hard deadline (blocks submission after date)
- C) Admin override (monitor can approve late submissions)

**Current brainstorm:** Soft deadline + email reminders at 30 days, 7 days, 1 day before due date.

---

### **Topic 3: Concern Categories Taxonomy**

Your brainstorm mentions:
- Child Protection/Abuse
- Financial Difficulty
- Dropout Risk
- Irregular Attendance
- Family Situation
- Health/Medical
- Bullying
- Others

**Should you:**
- A) Hardcode as enum
- B) Store in `categories` table (admin-editable)
- C) Mix (hardcoded core + custom via table)

**Recommendation:** **B** (table), so DepEd can add categories without code changes.

---

### **Topic 4: Division-wide Reporting & Analytics**

Monitor wants to see:
- % schools submitted all 3 packages
- Enrollment trends (year-over-year)
- Dropout rates by school/section
- Concerns by category (heatmap?)
- At-risk schools (high dropout + open concerns)

**How to build:**
1. Create read-only views/caches for aggregated data
2. Use Laravel Query Builder to generate reports
3. Frontend charts (Recharts) for visualizations
4. CSV export for Excel

**Do you want interactive dashboards or static PDF reports?**

---

### **Topic 5: Mobile-Friendly?**

Your brainstorm doesn't mention mobile. But school heads might need to flag concerns on-the-go.

**Options:**
- A) Responsive web only (works on mobile browser)
- B) Build native mobile app
- C) Progressive Web App (PWA)

**Recommendation:** **A** (responsive web) initially. If needed later, wrap with React Native.

---

### **Topic 6: Data Migration from Old System**

If Santiago City has an old system with historical data, how do you migrate?

**Plan:**
1. Export old data to CSV
2. Create `DataMigrationImporter` command
3. Map old fields → new schema
4. Test with sample data
5. Run in staging first

---

### **Topic 7: School Code Assignment**

Current logic: 6-digit school code assigned during school creation.

**Questions:**
- Are these codes pre-assigned by DepEd (hardcoded in seed)?
- Or should monitor assign them?
- What if a code is reused / duplicated in old system?

**Recommendation:** Treat school code as **unique natural key**. Monitor can't change once created.

---

### **Topic 8: Form Versioning**

What if DepEd changes the I-META/TARGETS-MET/SMEA form structure mid-year?

**Options:**
- A) Form is fixed per academic year (no changes)
- B) Form has versions (v1, v2, v3)
- C) Admin can edit form fields via CMS

**Recommendation:** **A** initially. If needed, implement **B** (versions in DB).

---

### **Topic 9: Concern Resolution Workflow**

Current: Open → In Progress → Resolved

**Should you add:**
- Status: "Escalated to DepEd HQ"?
- SLA tracking (e.g., "this concern has been open for 30 days")?
- Assignee field (specific person handling the concern)?

**Recommendation:** Keep simple for now. If needed, add later.

---

### **Topic 10: Compliance Reminder Emails**

School heads forget to submit. Should CSPAMS auto-send reminders?

**Current brainstorm:** Email at 30, 7, 1 day before deadline.

**Implementation:**
```bash
# app/Console/Kernel.php
$schedule->call(SendSubmissionReminders::class)->dailyAt('8:00am');

# app/Actions/SendSubmissionReminders.php
foreach (School::all() as $school) {
  if (!$school->hasSubmittedAllThisYear()) {
    Notification::send($school->schoolHead, new SubmissionReminder($school));
  }
}
```

---

## PART 8: PROPOSED PROJECT STRUCTURE

### Repo Layout (After Cleanup)

```
cspams.2/
├─ app/
│  ├─ Actions/                    (business logic)
│  │  ├─ SubmitIndicatorAction.php
│  │  ├─ ApproveSubmissionAction.php
│  │  ├─ FlagConcernAction.php
│  │  └─ ResolveConcernAction.php
│  ├─ Console/
│  │  └─ Commands/
│  │     ├─ SendSubmissionReminders.php
│  │     └─ CleanupStaleSubmissions.php
│  ├─ Events/
│  │  ├─ SubmissionSubmitted.php
│  │  ├─ SubmissionReviewed.php
│  │  ├─ ConcernFlagged.php
│  │  └─ ConcernResolved.php
│  ├─ Http/
│  │  ├─ Controllers/
│  │  │  ├─ Api/
│  │  │  │  ├─ SubmissionController.php
│  │  │  │  ├─ ConcernController.php
│  │  │  │  ├─ EnrollmentController.php
│  │  │  │  ├─ DashboardController.php
│  │  │  │  └─ ReportController.php
│  │  │  └─ Auth/
│  │  ├─ Requests/
│  │  │  ├─ StoreIndicatorSubmissionRequest.php
│  │  │  ├─ ReviewSubmissionRequest.php
│  │  │  ├─ FlagConcernRequest.php
│  │  │  └─ UpdateEnrollmentRequest.php
│  │  └─ Resources/
│  │     └─ (Filament admin resources)
│  ├─ Models/
│  │  ├─ User.php
│  │  ├─ School.php
│  │  ├─ AcademicYear.php
│  │  ├─ IndicatorSubmission.php         (refine)
│  │  ├─ EnrollmentRecord.php            (new)
│  │  ├─ WelfareConcern.php              (new)
│  │  ├─ WelfareConcernAttachment.php    (new)
│  │  ├─ WelfareConcernThread.php        (new)
│  │  └─ AuditLog.php
│  ├─ Notifications/
│  │  ├─ SubmissionSubmittedNotification.php
│  │  ├─ SubmissionReturnedNotification.php
│  │  ├─ SubmissionApprovedNotification.php
│  │  ├─ ConcernFlaggedNotification.php
│  │  └─ ConcernResolvedNotification.php
│  ├─ Services/
│  │  ├─ SubmissionService.php
│  │  ├─ ConcernService.php
│  │  ├─ EnrollmentService.php
│  │  └─ ReportService.php
│  └─ Traits/
│     ├─ HasSchoolScope.php              (all queries scoped to school)
│     └─ Auditable.php
│
├─ database/
│  ├─ migrations/
│  │  ├─ 2025_XX_XX_create_schools_table.php
│  │  ├─ 2025_XX_XX_create_indicator_submissions_table.php
│  │  ├─ 2025_XX_XX_create_enrollment_records_table.php
│  │  ├─ 2025_XX_XX_create_welfare_concerns_table.php (new)
│  │  └─ (others)
│  └─ seeders/
│     ├─ DatabaseSeeder.php
│     ├─ SchoolSeeder.php
│     ├─ UserSeeder.php
│     └─ SantiagoCitySchoolAccountsSeeder.php
│
├─ frontend/
│  ├─ src/
│  │  ├─ pages/          (as described in component tree)
│  │  ├─ components/
│  │  ├─ hooks/
│  │  ├─ services/
│  │  ├─ context/
│  │  ├─ types/
│  │  ├─ utils/
│  │  └─ App.tsx
│  └─ vite.config.ts
│
├─ routes/
│  ├─ api.php            (API endpoints)
│  └─ web.php            (Filament, auth)
│
├─ storage/
│  └─ concerns/          (encrypted attachment storage)
│
└─ docker-compose.yml
```

---

## PART 9: QUICK WIN CHECKLIST

These are things you can do **right now** to unblock development:

- [ ] **Create the 3 new tables** (EnrollmentRecord, WelfareConcern, Attachments) via migrations
- [ ] **Define TypeScript types** for all API responses (in `frontend/src/types`)
- [ ] **Write API route signatures** (in `routes/api.php`) – don't implement yet, just structure
- [ ] **Create Filament resource stubs** for new models
- [ ] **Draft form JSON schema** for I-META (what fields, types, validation rules)
- [ ] **Set up test database** (SQLite in-memory for fast testing)
- [ ] **Write E2E scenario outline** (user story → steps → expected behavior)

---

## PART 10: QUESTIONS FOR YOU

I need answers to these to refine the roadmap:

1. **Who owns DepEd Santiago City's IT?** Will they help with deployment/support?

2. **Budget for tools:** Do you have hosting costs allocated? (Server, DB, email service)

3. **Timeline:** When does this need to go live? School year 2025-2026 starts when?

4. **User volume:** Estimate # of schools (~50? 100? 200?) and # of monitors (5? 10?)?

5. **Historical data:** Do you need to import data from an old system, or start fresh?

6. **Forms:** Are I-META, TARGETS-MET, SMEA forms **fixed structure**, or do they change?

7. **Reporting:** What are the top 3 reports monitors MUST have?

8. **SLA:** What's the response time guarantee for concern acknowledgment? (24h? 48h?)

9. **Audit:** How long to retain data? (5 years? Forever?)

10. **Training:** Will you train users or provide documentation?

---

## SUMMARY TABLE: WHAT TO BUILD FIRST

| Priority | Feature | Timeline | Depends On |
|----------|---------|----------|-----------|
| 🔴 P0 | Auth (login by school code / email) | Day 1 | Backend setup |
| 🔴 P0 | School Head Dashboard | Day 2-3 | Auth |
| 🔴 P0 | Requirements page (form builder) | Day 4-6 | Backend models, forms validation |
| 🔴 P0 | Monitor Dashboard | Day 6-7 | API aggregation |
| 🔴 P0 | Monitor Reviews page | Day 8-9 | Submission workflow |
| 🟠 P1 | Concerns flagging + workflow | Day 9-11 | Backend concerns table |
| 🟠 P1 | Notifications | Day 12-13 | Reverb setup |
| 🟠 P1 | Reports & export | Day 14-15 | ReportService |
| 🟡 P2 | Enrollment tracking | Day 16 | Enrollment table |
| 🟡 P2 | Security hardening | Day 17-18 | All features |

---

**Next Steps:** Review this analysis, answer the 10 questions above, and let's dive into **Phase 1: Cleanup** or whichever phase makes sense to start first!
