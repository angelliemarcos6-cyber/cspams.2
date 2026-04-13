# CSPAMS 2.0 - Project Analysis & Implementation Brainstorm

```ts
// NEW 2026 COMPLIANCE UI: BMEF tab replaces TARGETS-MET
// 4-tab layout (School Achievements | Key Performance | BMEF | SMEA)
// Monitor & School Head views updated for DepEd standards
```

> April 2026 compliance UI refactor - TARGETS-MET renamed to BMEF with 4-tab layout.


**Current Date:** April 11, 2026  
**Project:** Centralized Student Performance Analytics and Monitoring System (CSPAMS)  
**For:** DepEd Division Office Santiago City  

---

## EXECUTIVE SUMMARY

Your **new design** is a radical simplification from the capstone scope. Instead of a comprehensive learner lifecycle management system, you're building a **lightweight compliance + welfare tracking tool** focused on two core workflows:

1. **Annual Compliance** â€“ School heads submit 3 required packages yearly (I-META, BMEF, SMEA)
2. **School Welfare Tracking** â€“ Real-time flagging of student concerns (abuse, dropout risk, attendance, etc.)

**Current Repo Status:** ~274 commits, full learner database (LRN tracking, lifecycle, performance metrics, audit logs). This is **overcomplicated** for the new scope.

---

## PART 1: GAP ANALYSIS â€“ WHAT'S IN THE REPO VS. WHAT YOU NEED

### âœ… ALREADY BUILT (Reuse These)

| Component | Status | Repo Location | Notes |
|-----------|--------|---------------|-------|
| **Role-based auth** | âœ… Done | `app/Models/User.php`, Filament | Monitor + School Head roles exist; school code login works |
| **Sanctum API** | âœ… Done | `routes/api.php` | Token-based auth; good foundation |
| **Dashboard layout** | âœ… Partial | `frontend/src/pages` | Sidebar navigation, KPI cards â€“ reusable |
| **Schools master data** | âœ… Done | `app/Models/School.php` | School CRUD, 6-digit code validation |
| **Academic years** | âœ… Done | `app/Models/AcademicYear.php` | School year model for context |
| **Audit logging** | âœ… Done | `app/Models/AuditLog.php` | Track all CRUD actions |
| **Notifications** | âœ… Partial | Reverb + queue | Real-time + email; needs refinement for concern updates |
| **Reports/exports** | âœ… Partial | `app/Resources` (Filament) | CSV export framework exists; refine for new reports |
| **Email delivery** | âœ… Done | SMTP/Resend integration | Password reset, MFA, setup links â€“ reusable |

### âŒ NEEDS TO BE REMOVED/SIMPLIFIED (Too Complex for New Scope)

| Component | Current State | Action | Why |
|-----------|---------------|--------|-----|
| **Full LRN student database** | `app/Models/Student.php` + 5K+ records | **REMOVE** | New design doesn't track individual LRN; only enrollment numbers |
| **Student performance metrics** | `app/Models/StudentPerformanceRecord.php` | **REMOVE** | Not part of welfare tracking; belongs in separate system |
| **Student status lifecycle** | `app/Models/StudentStatusLog.php` + status codes | **SIMPLIFY** | Only need status labels (enrolled/dropped/etc.) for enrollment form, not full lifecycle |
| **Teacher records** | If present in old capstone | **REMOVE** | Not in new scope |
| **At-risk watchlist AI** | Complex risk-scoring logic | **REMOVE** | Concerns are user-flagged, not algorithm-driven |
| **Detailed learner history** | Granular timeline tracking | **SIMPLIFY** | Keep simple submission history + concern status history |
| **Filament admin panel bloat** | Many resource pages | **REFACTOR** | Keep only: Schools, Monitors, School Heads, Submissions, Concerns |

### ðŸ”¶ NEEDS TO BE BUILT (New Functionality)

| Component | Priority | Effort | Details |
|-----------|----------|--------|---------|
| **Indicator Submission Forms** | ðŸ”´ Critical | 2-3 days | I-META, BMEF, SMEA form builders + validation |
| **Concerns (Welfare Flagging)** | ðŸ”´ Critical | 2 days | Form, state machine (Open â†’ In Progress â†’ Resolved), notifications |
| **Division-wide Reports** | ðŸŸ  High | 1-2 days | KPIs: % schools submitted, at-risk count, enrollment/dropout rates |
| **Simplified Enrollment Form** | ðŸŸ  High | 1 day | School heads enter: Total enrolled, Dropouts, Transferees, Completers |
| **Notification Center** | ðŸŸ  High | 1 day | In-app + email for submission returns, concern updates |
| **Multi-school Sync** | ðŸŸ¡ Medium | 1-2 days | Monitor dashboard aggregates all schools instantly |
| **Attachment Encryption** | ðŸŸ¡ Medium | 1 day | For concern evidence (PDFs/photos) |

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
â”œâ”€ indicator_submissions (exists, refine)
â”‚  â”œâ”€ id
â”‚  â”œâ”€ school_id
â”‚  â”œâ”€ academic_year_id
â”‚  â”œâ”€ submission_type ('I-META', 'BMEF', 'SMEA')
â”‚  â”œâ”€ status ('draft', 'submitted', 'returned', 'approved')
â”‚  â”œâ”€ submitted_at (nullable)
â”‚  â”œâ”€ submitted_by (school_head_id)
â”‚  â”œâ”€ reviewed_by (monitor_id, nullable)
â”‚  â”œâ”€ review_notes (text, nullable)
â”‚  â”œâ”€ form_data (json â€“ stores form fields)
â”‚  â”œâ”€ created_at, updated_at
â”‚
â”œâ”€ enrollment_records (NEW)
â”‚  â”œâ”€ id
â”‚  â”œâ”€ school_id
â”‚  â”œâ”€ academic_year_id
â”‚  â”œâ”€ total_enrolled
â”‚  â”œâ”€ dropouts
â”‚  â”œâ”€ transferees_in
â”‚  â”œâ”€ transferees_out
â”‚  â”œâ”€ completers
â”‚  â”œâ”€ retention_rate (computed)
â”‚  â”œâ”€ submitted_at
â”‚  â”œâ”€ submitted_by (school_head_id)
â”‚  â”œâ”€ created_at, updated_at
â”‚
â”œâ”€ welfare_concerns (NEW â€“ replaces or extends)
â”‚  â”œâ”€ id
â”‚  â”œâ”€ school_id
â”‚  â”œâ”€ flagged_by (school_head_id)
â”‚  â”œâ”€ flagged_at
â”‚  â”œâ”€ grade_level
â”‚  â”œâ”€ section
â”‚  â”œâ”€ category ('abuse', 'financial', 'dropout_risk', 'attendance', 'family', 'health', 'bullying', 'other')
â”‚  â”œâ”€ description (text â€“ NO student name/LRN)
â”‚  â”œâ”€ status ('open', 'in_progress', 'resolved')
â”‚  â”œâ”€ acknowledged_by (monitor_id, nullable)
â”‚  â”œâ”€ acknowledged_at (nullable)
â”‚  â”œâ”€ resolved_by (monitor_id, nullable)
â”‚  â”œâ”€ resolved_at (nullable)
â”‚  â”œâ”€ created_at, updated_at
â”‚
â”œâ”€ welfare_concern_attachments (NEW)
â”‚  â”œâ”€ id
â”‚  â”œâ”€ concern_id
â”‚  â”œâ”€ file_path (encrypted)
â”‚  â”œâ”€ original_filename
â”‚  â”œâ”€ file_type (PDF/JPG/PNG)
â”‚  â”œâ”€ uploaded_by (school_head_id)
â”‚  â”œâ”€ created_at
â”‚
â”œâ”€ welfare_concern_threads (NEW)
â”‚  â”œâ”€ id
â”‚  â”œâ”€ concern_id
â”‚  â”œâ”€ user_id (monitor or school_head)
â”‚  â”œâ”€ message (text)
â”‚  â”œâ”€ created_at
â”‚
â”œâ”€ submission_history (exists, refine)
â”‚  â””â”€ Already covers I-META/BMEF/SMEA history
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
â”œâ”€ layouts/
â”‚  â”œâ”€ SchoolHeadLayout.tsx         (sidebar: Dashboard, Requirements, Enrollment & Concerns, History, Settings)
â”‚  â””â”€ DivisionMonitorLayout.tsx     (sidebar: Dashboard, Schools, Reviews, Reports, Concerns, System)
â”‚
â”œâ”€ pages/
â”‚  â”œâ”€ auth/
â”‚  â”‚  â”œâ”€ LoginPage.tsx             (unified login form, role selector)
â”‚  â”‚  â”œâ”€ ForgotPasswordPage.tsx
â”‚  â”‚  â””â”€ MFAPage.tsx
â”‚  â”‚
â”‚  â”œâ”€ school-head/
â”‚  â”‚  â”œâ”€ Dashboard.tsx             (3 cards: Requirements Due, Enrollment Snapshot, Open Concerns)
â”‚  â”‚  â”œâ”€ Requirements/
â”‚  â”‚  â”‚  â”œâ”€ RequirementsPage.tsx   (tabs: I-META | BMEF | SMEA)
â”‚  â”‚  â”‚  â”œâ”€ I_METAForm.tsx         (form builder from document)
â”‚  â”‚  â”‚  â”œâ”€ TARGETSMETForm.tsx
â”‚  â”‚  â”‚  â”œâ”€ SMEAForm.tsx
â”‚  â”‚  â”‚  â””â”€ SubmissionHistory.tsx
â”‚  â”‚  â”œâ”€ EnrollmentAndConcerns/
â”‚  â”‚  â”‚  â”œâ”€ EnrollmentTab.tsx      (form: total, dropouts, transferees)
â”‚  â”‚  â”‚  â””â”€ ConcernsTab.tsx        (list: my school's flagged concerns)
â”‚  â”‚  â”œâ”€ FlagConcernModal.tsx      (reusable modal to flag new concern)
â”‚  â”‚  â”œâ”€ ConcernDetail.tsx         (view + thread messages)
â”‚  â”‚  â””â”€ Settings.tsx
â”‚  â”‚
â”‚  â”œâ”€ monitor/
â”‚  â”‚  â”œâ”€ Dashboard.tsx             (4 KPI cards, compliance pie, pending queue, concerns list)
â”‚  â”‚  â”œâ”€ Schools/
â”‚  â”‚  â”‚  â”œâ”€ SchoolsList.tsx        (searchable table)
â”‚  â”‚  â”‚  â””â”€ SchoolDetail.tsx       (view school data + quick actions)
â”‚  â”‚  â”œâ”€ Reviews/
â”‚  â”‚  â”‚  â”œâ”€ ReviewsQueue.tsx       (pending submissions table)
â”‚  â”‚  â”‚  â”œâ”€ SubmissionReview.tsx   (open package, add notes, return/approve)
â”‚  â”‚  â”‚  â””â”€ ReviewHistory.tsx
â”‚  â”‚  â”œâ”€ Concerns/
â”‚  â”‚  â”‚  â”œâ”€ ConcernsBoard.tsx      (division-wide, sortable by urgency)
â”‚  â”‚  â”‚  â”œâ”€ ConcernDetail.tsx      (view + thread + acknowledge/resolve buttons)
â”‚  â”‚  â”‚  â””â”€ ConcernStats.tsx       (counts by category)
â”‚  â”‚  â”œâ”€ Reports/
â”‚  â”‚  â”‚  â”œâ”€ ReportsPage.tsx        (export options)
â”‚  â”‚  â”‚  â””â”€ ReportBuilder.tsx
â”‚  â”‚  â””â”€ System/
â”‚  â”‚     â”œâ”€ AuditLog.tsx
â”‚  â”‚     â””â”€ Settings.tsx
â”‚  â”‚
â”‚  â””â”€ NotFound.tsx
â”‚
â”œâ”€ components/
â”‚  â”œâ”€ shared/
â”‚  â”‚  â”œâ”€ Sidebar.tsx              (role-aware, collapse/expand)
â”‚  â”‚  â”œâ”€ Header.tsx               (school year banner, user menu)
â”‚  â”‚  â”œâ”€ ProgressBar.tsx          (5-step submission flow)
â”‚  â”‚  â”œâ”€ KPICard.tsx              (reusable metric card)
â”‚  â”‚  â”œâ”€ StatusBadge.tsx          (Draft/Submitted/Returned/Approved)
â”‚  â”‚  â”œâ”€ LoadingSpinner.tsx
â”‚  â”‚  â””â”€ ErrorBoundary.tsx
â”‚  â”‚
â”‚  â”œâ”€ forms/
â”‚  â”‚  â”œâ”€ IndicatorForm.tsx        (base form for I-META/BMEF/SMEA)
â”‚  â”‚  â”œâ”€ EnrollmentForm.tsx
â”‚  â”‚  â”œâ”€ ConcernForm.tsx
â”‚  â”‚  â””â”€ FormField.tsx            (input, select, textarea wrapper)
â”‚  â”‚
â”‚  â””â”€ tables/
â”‚     â”œâ”€ SubmissionsTable.tsx
â”‚     â”œâ”€ ConcernsTable.tsx
â”‚     â””â”€ DataTable.tsx            (generic, sortable, filterable)
â”‚
â”œâ”€ hooks/
â”‚  â”œâ”€ useAuth.ts                  (auth context + login/logout)
â”‚  â”œâ”€ useSubmissions.ts           (CRUD for indicator submissions)
â”‚  â”œâ”€ useConcerns.ts              (CRUD + state changes for concerns)
â”‚  â”œâ”€ useEnrollment.ts
â”‚  â”œâ”€ useDashboard.ts
â”‚  â””â”€ useFetch.ts                 (wrapper for API calls with error handling)
â”‚
â”œâ”€ services/
â”‚  â”œâ”€ api.ts                      (Axios instance, interceptors)
â”‚  â”œâ”€ auth.service.ts
â”‚  â”œâ”€ submissions.service.ts
â”‚  â”œâ”€ concerns.service.ts
â”‚  â””â”€ reports.service.ts
â”‚
â”œâ”€ context/
â”‚  â”œâ”€ AuthContext.tsx             (user, role, permissions)
â”‚  â”œâ”€ NotificationContext.tsx     (toast messages, in-app alerts)
â”‚  â””â”€ SchoolContext.tsx           (current school, academic year)
â”‚
â”œâ”€ types/
â”‚  â”œâ”€ index.ts                    (all TypeScript interfaces)
â”‚  â””â”€ api.ts                      (request/response types)
â”‚
â””â”€ utils/
   â”œâ”€ formatters.ts               (date, number, status labels)
   â”œâ”€ validators.ts
   â””â”€ storage.ts                  (localStorage for drafts)
```

---

## PART 4: FORMS â€“ THE HEART OF THE SYSTEM

### I-META Form Structure (from uploaded document)

Your I-META document is a **multi-section quality assurance self-evaluation**:

**Sections to Digitize:**
1. School Identification (school name, address, school code, principal name)
2. I.A â€“ Leadership & Governance (score 1-5 per item)
3. I.B â€“ Teaching & Learning (score 1-5)
4. I.C â€“ Learning Environment (score 1-5)
5. I.D â€“ Curriculum & Instruction (score 1-5)
6. I.E â€“ Assessment (score 1-5)
7. II â€“ Institutional Capacity (ratings)
8. III â€“ Financial Management (yes/no items)
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

**BMEF** is KPI-based (auto-calculated from enrollment data + previous targets).

**SMEA** needs to be reviewed in the uploaded doc.

---

## PART 5: KEY DESIGN DECISIONS & QUESTIONS FOR BRAINSTORM

### ðŸ¤” **Decision 1: Form Data Storage**

**Option A: Flatten JSON in DB**
```json
// In indicator_submissions.form_data
{
  "schoolIdentification": { ... },
  "sectionIA": { ... },
  ...
}
```
âœ… Simple; âŒ Hard to query/report on individual fields

**Option B: Normalized Sub-tables**
```
Create tables: form_section_ia, form_section_ib, etc.
Link to submission via submission_id
```
âœ… Queryable; âŒ More migrations

**RECOMMENDATION:** Start with **Option A (JSON)** for speed. If reporting needs are heavy, migrate to Option B later.

---

### ðŸ¤” **Decision 2: Draft Auto-Save**

School heads may draft forms over multiple sessions.

**Option A: Auto-save on every keystroke (frontend â†’ backend)**
```javascript
// Every 3 seconds while typing
debounce(() => {
  api.put(`/api/submissions/indicator/${id}`, formData);
}, 3000)
```
âœ… Never lose work; âŒ Heavy API traffic

**Option B: Save on blur or interval (every 30 sec)**
âœ… Balance; âŒ Could lose recent edits

**Option C: localStorage + manual save button**
âœ… No API overhead; âŒ Loss on browser crash

**RECOMMENDATION:** Use **Option C (localStorage draft)** + **manual Save button** + one-click "Load Draft" to reload from localStorage. Lighter and clearer UX.

---

### ðŸ¤” **Decision 3: Concern Evidence Encryption**

**Option A: Use Laravel's built-in Crypt**
```php
// In model
protected $casts = [
  'file_path' => 'encrypted',
];
```
âœ… Simple; âŒ All data encrypted at rest (slower)

**Option B: Encrypt file content before storage**
```php
$encrypted = Crypt::encrypt(file_get_contents($file));
Storage::disk('local')->put('concerns/' . $uuid, $encrypted);
```
âœ… Only sensitive files encrypted; âŒ More code

**Option C: Use S3 with server-side encryption**
âœ… Scalable; âŒ Costs money

**RECOMMENDATION:** Start with **Option B** (encrypt individual files). Use Laravel's `Storage` facade + `Crypt` class.

---

### ðŸ¤” **Decision 4: Real-time Notifications**

**Current Stack:** Reverb + Laravel Reverb (WebSocket)

**Option A: Use existing Reverb**
```php
// In ReviewSubmissionAction
broadcast(new SubmissionReviewed($submission))->toOthers();
```
âœ… Already set up; âŒ Requires Reverb running in production

**Option B: Fallback to polling + email**
```javascript
// Frontend polls /api/submissions/status every 30 seconds
setInterval(() => fetch('/api/submissions/status'), 30000);
```
âœ… No extra service; âŒ Delay in updates

**Option C: Hybrid (Reverb + email + polling fallback)**
âœ… Best UX; âŒ Most complex

**RECOMMENDATION:** Implement **Option C** â€“ Reverb for real-time, email for offline, polling as fallback.

---

### ðŸ¤” **Decision 5: Bulk School Data Seeding**

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

- [ ] Build Requirements page (tabs: I-META, BMEF, SMEA)
  - [ ] Form builder for each indicator type
  - [ ] Draft save to localStorage
  - [ ] Submit workflow (validation â†’ API call â†’ status update)
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
- A) Monitor bulk imports school heads via CSV â†’ auto-generates accounts â†’ sends setup links via email
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
3. Map old fields â†’ new schema
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

What if DepEd changes the I-META/BMEF/SMEA form structure mid-year?

**Options:**
- A) Form is fixed per academic year (no changes)
- B) Form has versions (v1, v2, v3)
- C) Admin can edit form fields via CMS

**Recommendation:** **A** initially. If needed, implement **B** (versions in DB).

---

### **Topic 9: Concern Resolution Workflow**

Current: Open â†’ In Progress â†’ Resolved

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
â”œâ”€ app/
â”‚  â”œâ”€ Actions/                    (business logic)
â”‚  â”‚  â”œâ”€ SubmitIndicatorAction.php
â”‚  â”‚  â”œâ”€ ApproveSubmissionAction.php
â”‚  â”‚  â”œâ”€ FlagConcernAction.php
â”‚  â”‚  â””â”€ ResolveConcernAction.php
â”‚  â”œâ”€ Console/
â”‚  â”‚  â””â”€ Commands/
â”‚  â”‚     â”œâ”€ SendSubmissionReminders.php
â”‚  â”‚     â””â”€ CleanupStaleSubmissions.php
â”‚  â”œâ”€ Events/
â”‚  â”‚  â”œâ”€ SubmissionSubmitted.php
â”‚  â”‚  â”œâ”€ SubmissionReviewed.php
â”‚  â”‚  â”œâ”€ ConcernFlagged.php
â”‚  â”‚  â””â”€ ConcernResolved.php
â”‚  â”œâ”€ Http/
â”‚  â”‚  â”œâ”€ Controllers/
â”‚  â”‚  â”‚  â”œâ”€ Api/
â”‚  â”‚  â”‚  â”‚  â”œâ”€ SubmissionController.php
â”‚  â”‚  â”‚  â”‚  â”œâ”€ ConcernController.php
â”‚  â”‚  â”‚  â”‚  â”œâ”€ EnrollmentController.php
â”‚  â”‚  â”‚  â”‚  â”œâ”€ DashboardController.php
â”‚  â”‚  â”‚  â”‚  â””â”€ ReportController.php
â”‚  â”‚  â”‚  â””â”€ Auth/
â”‚  â”‚  â”œâ”€ Requests/
â”‚  â”‚  â”‚  â”œâ”€ StoreIndicatorSubmissionRequest.php
â”‚  â”‚  â”‚  â”œâ”€ ReviewSubmissionRequest.php
â”‚  â”‚  â”‚  â”œâ”€ FlagConcernRequest.php
â”‚  â”‚  â”‚  â””â”€ UpdateEnrollmentRequest.php
â”‚  â”‚  â””â”€ Resources/
â”‚  â”‚     â””â”€ (Filament admin resources)
â”‚  â”œâ”€ Models/
â”‚  â”‚  â”œâ”€ User.php
â”‚  â”‚  â”œâ”€ School.php
â”‚  â”‚  â”œâ”€ AcademicYear.php
â”‚  â”‚  â”œâ”€ IndicatorSubmission.php         (refine)
â”‚  â”‚  â”œâ”€ EnrollmentRecord.php            (new)
â”‚  â”‚  â”œâ”€ WelfareConcern.php              (new)
â”‚  â”‚  â”œâ”€ WelfareConcernAttachment.php    (new)
â”‚  â”‚  â”œâ”€ WelfareConcernThread.php        (new)
â”‚  â”‚  â””â”€ AuditLog.php
â”‚  â”œâ”€ Notifications/
â”‚  â”‚  â”œâ”€ SubmissionSubmittedNotification.php
â”‚  â”‚  â”œâ”€ SubmissionReturnedNotification.php
â”‚  â”‚  â”œâ”€ SubmissionApprovedNotification.php
â”‚  â”‚  â”œâ”€ ConcernFlaggedNotification.php
â”‚  â”‚  â””â”€ ConcernResolvedNotification.php
â”‚  â”œâ”€ Services/
â”‚  â”‚  â”œâ”€ SubmissionService.php
â”‚  â”‚  â”œâ”€ ConcernService.php
â”‚  â”‚  â”œâ”€ EnrollmentService.php
â”‚  â”‚  â””â”€ ReportService.php
â”‚  â””â”€ Traits/
â”‚     â”œâ”€ HasSchoolScope.php              (all queries scoped to school)
â”‚     â””â”€ Auditable.php
â”‚
â”œâ”€ database/
â”‚  â”œâ”€ migrations/
â”‚  â”‚  â”œâ”€ 2025_XX_XX_create_schools_table.php
â”‚  â”‚  â”œâ”€ 2025_XX_XX_create_indicator_submissions_table.php
â”‚  â”‚  â”œâ”€ 2025_XX_XX_create_enrollment_records_table.php
â”‚  â”‚  â”œâ”€ 2025_XX_XX_create_welfare_concerns_table.php (new)
â”‚  â”‚  â””â”€ (others)
â”‚  â””â”€ seeders/
â”‚     â”œâ”€ DatabaseSeeder.php
â”‚     â”œâ”€ SchoolSeeder.php
â”‚     â”œâ”€ UserSeeder.php
â”‚     â””â”€ SantiagoCitySchoolAccountsSeeder.php
â”‚
â”œâ”€ frontend/
â”‚  â”œâ”€ src/
â”‚  â”‚  â”œâ”€ pages/          (as described in component tree)
â”‚  â”‚  â”œâ”€ components/
â”‚  â”‚  â”œâ”€ hooks/
â”‚  â”‚  â”œâ”€ services/
â”‚  â”‚  â”œâ”€ context/
â”‚  â”‚  â”œâ”€ types/
â”‚  â”‚  â”œâ”€ utils/
â”‚  â”‚  â””â”€ App.tsx
â”‚  â””â”€ vite.config.ts
â”‚
â”œâ”€ routes/
â”‚  â”œâ”€ api.php            (API endpoints)
â”‚  â””â”€ web.php            (Filament, auth)
â”‚
â”œâ”€ storage/
â”‚  â””â”€ concerns/          (encrypted attachment storage)
â”‚
â””â”€ docker-compose.yml
```

---

## PART 9: QUICK WIN CHECKLIST

These are things you can do **right now** to unblock development:

- [ ] **Create the 3 new tables** (EnrollmentRecord, WelfareConcern, Attachments) via migrations
- [ ] **Define TypeScript types** for all API responses (in `frontend/src/types`)
- [ ] **Write API route signatures** (in `routes/api.php`) â€“ don't implement yet, just structure
- [ ] **Create Filament resource stubs** for new models
- [ ] **Draft form JSON schema** for I-META (what fields, types, validation rules)
- [ ] **Set up test database** (SQLite in-memory for fast testing)
- [ ] **Write E2E scenario outline** (user story â†’ steps â†’ expected behavior)

---

## PART 10: QUESTIONS FOR YOU

I need answers to these to refine the roadmap:

1. **Who owns DepEd Santiago City's IT?** Will they help with deployment/support?

2. **Budget for tools:** Do you have hosting costs allocated? (Server, DB, email service)

3. **Timeline:** When does this need to go live? School year 2025-2026 starts when?

4. **User volume:** Estimate # of schools (~50? 100? 200?) and # of monitors (5? 10?)?

5. **Historical data:** Do you need to import data from an old system, or start fresh?

6. **Forms:** Are I-META, BMEF, SMEA forms **fixed structure**, or do they change?

7. **Reporting:** What are the top 3 reports monitors MUST have?

8. **SLA:** What's the response time guarantee for concern acknowledgment? (24h? 48h?)

9. **Audit:** How long to retain data? (5 years? Forever?)

10. **Training:** Will you train users or provide documentation?

---

## SUMMARY TABLE: WHAT TO BUILD FIRST

| Priority | Feature | Timeline | Depends On |
|----------|---------|----------|-----------|
| ðŸ”´ P0 | Auth (login by school code / email) | Day 1 | Backend setup |
| ðŸ”´ P0 | School Head Dashboard | Day 2-3 | Auth |
| ðŸ”´ P0 | Requirements page (form builder) | Day 4-6 | Backend models, forms validation |
| ðŸ”´ P0 | Monitor Dashboard | Day 6-7 | API aggregation |
| ðŸ”´ P0 | Monitor Reviews page | Day 8-9 | Submission workflow |
| ðŸŸ  P1 | Concerns flagging + workflow | Day 9-11 | Backend concerns table |
| ðŸŸ  P1 | Notifications | Day 12-13 | Reverb setup |
| ðŸŸ  P1 | Reports & export | Day 14-15 | ReportService |
| ðŸŸ¡ P2 | Enrollment tracking | Day 16 | Enrollment table |
| ðŸŸ¡ P2 | Security hardening | Day 17-18 | All features |

---

**Next Steps:** Review this analysis, answer the 10 questions above, and let's dive into **Phase 1: Cleanup** or whichever phase makes sense to start first!


