# CSPAMS 2.0 - MASTER IMPLEMENTATION CHECKLIST

**Use this to track your progress from brainstorm to production.**

---

## 📋 PRE-KICKOFF (This Week)

### Understanding Phase
- [ ] Read CSPAMS_QUICK_START.md (15 min)
- [ ] Read CSPAMS_PROJECT_ANALYSIS.md (45 min)
- [ ] Read CSPAMS_DESIGN_COMPARISON.md (30 min)
- [ ] Skim CSPAMS_IMPLEMENTATION_GUIDE.md (20 min)
- [ ] Review uploaded documents (I-META form structure)

### Clarification & Approval
- [ ] Answer all 10 brainstorm questions (see PROJECT_ANALYSIS, Part 10)
- [ ] Schedule sync with DepEd Santiago City
- [ ] Get sign-off on new design (vs old capstone)
- [ ] Confirm form structures (I-META, TARGETS-MET, SMEA)
- [ ] Confirm concern categories (8 categories final?)
- [ ] Confirm go-live date
- [ ] Confirm number of schools (50? 100? 200?)
- [ ] Confirm number of monitors
- [ ] Confirm submission deadline date
- [ ] Confirm top 3 reports needed
- [ ] Get budget approval for hosting (if needed)

### Repo Setup
- [ ] Create GitHub project board (track 8 phases)
- [ ] Create feature branches for Phase 1-8
- [ ] Set up CI/CD pipeline (if not done)
- [ ] Backup current repo (just in case)
- [ ] Document current schema (before deleting old models)

---

## 🔄 PHASE 1: CLEANUP & SIMPLIFICATION (2-3 Days)

### Database Audit
- [ ] List all existing tables (document)
- [ ] Identify which models to DELETE (Student, StudentPerformance, etc.)
- [ ] Identify which models to KEEP (User, School, AcademicYear, IndicatorSubmission)
- [ ] Identify which models to CREATE (WelfareConcern, EnrollmentRecord)
- [ ] Identify which models to REFINE (IndicatorSubmission)

### Code Deletion
- [ ] Delete Student.php model
- [ ] Delete StudentPerformanceRecord.php model
- [ ] Delete StudentStatusLog.php model
- [ ] Delete PerformanceMetric.php model
- [ ] Delete any teacher-related models
- [ ] Delete old migrations for deleted models (mark as removed in comments)
- [ ] Delete old API routes for deleted endpoints
- [ ] Delete old Filament resources for deleted models
- [ ] Delete old frontend pages (LearnerRoster, StudentPerformance, etc.)
- [ ] Delete old React components (StudentTable, PerformanceChart, etc.)

### New Migrations
- [ ] Create `create_welfare_concerns_table` migration
- [ ] Create `create_welfare_concern_attachments_table` migration
- [ ] Create `create_welfare_concern_threads_table` migration
- [ ] Create `create_enrollment_records_table` migration
- [ ] Run `php artisan migrate:fresh --seed` (test on local)
- [ ] Verify schema is clean (no orphaned columns)
- [ ] Document new schema (save SQL)

### Testing
- [ ] Run `php artisan migrate:fresh --seed` (fresh install)
- [ ] Verify no errors in log
- [ ] Check database – 4 new tables exist
- [ ] Check seeders still work
- [ ] Test login still works

### Deliverable
- ✅ Clean database schema
- ✅ Old code deleted
- ✅ New migrations running
- ✅ Seeders working

---

## 🏗️ PHASE 2: BACKEND CORE API (3-4 Days)

### Models
- [ ] Create WelfareConcern.php model (with relationships, scopes)
- [ ] Create WelfareConcernAttachment.php model
- [ ] Create WelfareConcernThread.php model
- [ ] Create EnrollmentRecord.php model
- [ ] Update IndicatorSubmission.php (if needed)
- [ ] Verify all relationships work
- [ ] Test model queries in tinker

### Controllers
- [ ] Create ConcernController (store, index, show, acknowledge, resolve, threads)
- [ ] Create EnrollmentController (current, store, divisionSummary)
- [ ] Update DashboardController (monitor overview KPIs)
- [ ] Update SubmissionController (refine existing)
- [ ] Test each endpoint with Postman

### Services
- [ ] Create ConcernService (business logic)
- [ ] Create EnrollmentService (business logic)
- [ ] Create DashboardService (KPI aggregation)
- [ ] Test services in unit tests

### Validation
- [ ] Create StoreConcernRequest.php
- [ ] Create UpdateConcernStatusRequest.php
- [ ] Create StoreEnrollmentRequest.php
- [ ] Create UpdateEnrollmentRequest.php
- [ ] Test validation rules

### API Routes
- [ ] Add routes: POST /api/concerns/flag
- [ ] Add routes: GET /api/concerns/my-school
- [ ] Add routes: GET /api/concerns/division (monitor only)
- [ ] Add routes: POST /api/concerns/{id}/acknowledge
- [ ] Add routes: POST /api/concerns/{id}/resolve
- [ ] Add routes: GET /api/enrollment/current
- [ ] Add routes: POST /api/enrollment
- [ ] Add routes: GET /api/dashboard/overview (monitor)
- [ ] Test all routes in Postman

### Notifications
- [ ] Create ConcernFlagged event
- [ ] Create ConcernAcknowledged event
- [ ] Create ConcernResolved event
- [ ] Wire events to controllers
- [ ] Test events broadcast

### Testing
- [ ] Write FeatureTests for ConcernController
- [ ] Write FeatureTests for EnrollmentController
- [ ] Run `php artisan test`
- [ ] Achieve 80%+ code coverage

### Deliverable
- ✅ All 4 models created & tested
- ✅ All controllers working
- ✅ All API endpoints testable in Postman
- ✅ Validation rules working
- ✅ Tests passing

---

## 🎨 PHASE 3: FRONTEND AUTH & LAYOUT (2 Days)

### Authentication
- [ ] Update LoginPage.tsx (unified form + role selector)
- [ ] Verify 6-digit school code login works
- [ ] Verify email + password login works (monitor)
- [ ] Test MFA if enabled
- [ ] Verify password reset flow
- [ ] Verify session persistence

### Context & Hooks
- [ ] Create/update AuthContext (user, role, school_id)
- [ ] Create useAuth hook (login, logout, isAuthenticated)
- [ ] Create useSubmissions hook
- [ ] Create useConcerns hook
- [ ] Create useEnrollment hook
- [ ] Create useDashboard hook

### Layout Components
- [ ] Create SchoolHeadLayout.tsx (sidebar: Dashboard, Requirements, Enrollment & Concerns, History, Settings)
- [ ] Create DivisionMonitorLayout.tsx (sidebar: Dashboard, Schools, Reviews, Reports, Concerns, System)
- [ ] Create Sidebar.tsx (reusable, role-aware)
- [ ] Create Header.tsx (school year banner, user menu)
- [ ] Create ProgressBar.tsx (5-step submission flow)

### Route Guards
- [ ] Create ProtectedRoute component
- [ ] Create RoleBasedRoute component
- [ ] Add guards to all routes
- [ ] Test route access by role

### Styling
- [ ] Verify Tailwind configured
- [ ] Verify dark mode support
- [ ] Test responsive design (mobile, tablet, desktop)
- [ ] Verify accessibility (keyboard navigation)

### Testing
- [ ] Test login/logout flow
- [ ] Test role-based route access
- [ ] Test sidebar navigation
- [ ] Test dark mode toggle

### Deliverable
- ✅ Unified login page working
- ✅ Role-based layouts working
- ✅ Authentication context working
- ✅ Route guards protecting pages

---

## 📝 PHASE 4: SCHOOL HEAD FEATURES (4-5 Days)

### Requirements Page (Forms)
- [ ] Create RequirementsPage.tsx (tabs: I-META | TARGETS-MET | SMEA)
- [ ] Create I_METAForm.tsx (form fields from document)
- [ ] Create TARGETSMETForm.tsx (auto-calculated KPIs)
- [ ] Create SMEAForm.tsx (form fields)
- [ ] Implement form validation rules
- [ ] Implement localStorage draft save
- [ ] Implement "Save as Draft" button
- [ ] Implement "Submit" button (locks draft, sends API)
- [ ] Implement "View Previous Submission" link

### Enrollment & Concerns Page
- [ ] Create EnrollmentAndConcernsPage.tsx (tabbed: Enrollment | Concerns)
- [ ] Create EnrollmentForm.tsx (total, dropouts, transferees, completers)
- [ ] Create EnrollmentTab.tsx (show current + form to update)
- [ ] Create ConcernsTab.tsx (list of my school's concerns + View Detail)
- [ ] Create ConcernDetail.tsx (view + thread messages + status)

### Flag Concern Modal
- [ ] Create FlagConcernModal.tsx (reusable)
- [ ] Fields: grade_level, section, category (dropdown), description, attachments
- [ ] Implement file upload (max 3 files, encrypted)
- [ ] Implement form validation
- [ ] Implement submit to API
- [ ] Show success/error messages

### Dashboard Page
- [ ] Create DashboardPage.tsx (school head view)
- [ ] Add KPI cards: Requirements Due (3 packages + status), Enrollment Snapshot, Open Concerns
- [ ] Add 5-step progress bar (Prepare → Draft → Submit → Review → Approved)
- [ ] Add Recent Activity timeline (last 5 submissions + concern updates)
- [ ] Add "Submit New Package" button (→ Requirements page)
- [ ] Add "Flag New Concern" button (→ Modal)

### History Page
- [ ] Create HistoryPage.tsx
- [ ] Show all past submissions (with status, dates, review notes)
- [ ] Show all past concerns (with status, resolution date)
- [ ] Allow filtering by year, type, status
- [ ] Allow CSV export (own school only)

### Services
- [ ] Create submissions.service.ts
- [ ] Create concerns.service.ts
- [ ] Create enrollment.service.ts
- [ ] Implement API calls with error handling

### Testing
- [ ] Test form filling & localStorage save
- [ ] Test form submission
- [ ] Test concern flagging
- [ ] Test enrollment form
- [ ] Test dashboard displays correct data

### Deliverable
- ✅ School head can fill all 3 forms
- ✅ School head can save drafts
- ✅ School head can submit (with validation)
- ✅ School head can flag concerns
- ✅ Dashboard shows correct KPIs

---

## 👨‍💼 PHASE 5: MONITOR FEATURES (4-5 Days)

### Dashboard Page
- [ ] Create DashboardPage.tsx (monitor view)
- [ ] Add KPI cards: Submission Progress (X of Y), Pending Reviews (count), At-Risk Schools (count), Total Enrollment & Dropout Rate
- [ ] Add Compliance Breakdown pie chart (I-META / TARGETS-MET / SMEA by status)
- [ ] Add Pending Review Queue table (school name, package type, submitted date, action buttons)
- [ ] Add Open Concerns list (sorted by urgency, status counts by category)
- [ ] Add quick export buttons (CSV reports)

### Schools Page
- [ ] Create SchoolsList.tsx (searchable, sortable table)
- [ ] Add filters: status (submitted/pending/overdue), at-risk yes/no
- [ ] Add click to view SchoolDetail.tsx
- [ ] Show quick stats: submissions status, enrollment, open concerns

### Reviews Page
- [ ] Create ReviewsQueuePage.tsx (pending submissions)
- [ ] Show table: School, Package Type, Submitted Date, Status
- [ ] Add action buttons: Review, Return, Approve
- [ ] Clicking "Review" opens SubmissionReviewModal.tsx
- [ ] Modal shows: form fields (read-only), review notes field, return/approve buttons
- [ ] Implement form status update API calls

### Concerns Page
- [ ] Create ConcernsPage.tsx (division-wide)
- [ ] Show board: Open | In Progress | Resolved columns (kanban-style OR table)
- [ ] Add filters: category, school, status
- [ ] Add sorting: date, urgency (days open)
- [ ] Click concern to open detail view
- [ ] Detail shows: description, threads, attachments
- [ ] Monitor can: acknowledge, resolve, add thread messages

### Reports Page
- [ ] Create ReportsPage.tsx
- [ ] Add export buttons:
  - [ ] Compliance Report (CSV – all submissions + status)
  - [ ] Enrollment Report (CSV – all schools enrollment numbers)
  - [ ] Concerns Summary (CSV – all concerns + status)
- [ ] Add date range filters
- [ ] Add school filters
- [ ] Generate & download CSV files

### Filament Admin (Optional Polish)
- [ ] Add WelfareConcern resource
- [ ] Add EnrollmentRecord resource
- [ ] Update IndicatorSubmission resource
- [ ] Add view/edit permissions

### Services
- [ ] Create reports.service.ts (CSV generation)
- [ ] Update dashboard.service.ts (KPI aggregation)

### Testing
- [ ] Test monitor can see all schools
- [ ] Test monitor can review submissions
- [ ] Test monitor can manage concerns
- [ ] Test reports generate correctly

### Deliverable
- ✅ Monitor dashboard shows all KPIs
- ✅ Monitor can review & approve/return submissions
- ✅ Monitor can manage concerns (acknowledge, resolve)
- ✅ Monitor can export reports (CSV)

---

## 🔔 PHASE 6: REAL-TIME & NOTIFICATIONS (2 Days)

### Backend Events
- [ ] Verify Laravel Reverb is running
- [ ] Create notification channels
- [ ] Wire events to notifications:
  - [ ] SubmissionSubmittedNotification (notify monitor)
  - [ ] SubmissionReturnedNotification (notify school head)
  - [ ] SubmissionApprovedNotification (notify school head)
  - [ ] ConcernFlaggedNotification (notify monitor)
  - [ ] ConcernAcknowledgedNotification (notify school head)
  - [ ] ConcernResolvedNotification (notify school head)

### Frontend Listeners
- [ ] Set up Reverb client (Echo)
- [ ] Listen for submission updates
- [ ] Listen for concern updates
- [ ] Refetch data when events arrive

### Notification Center
- [ ] Create NotificationCenter component
- [ ] Add toast notifications (success/error/info)
- [ ] Add bell icon (unread count)
- [ ] Add notification history popup
- [ ] Mark as read functionality

### Email Fallback
- [ ] Ensure email queue is running (`php artisan queue:work`)
- [ ] Configure SMTP (or Resend API)
- [ ] Test email delivery
- [ ] Create email templates:
  - [ ] SubmissionSubmitted email
  - [ ] SubmissionReturned email
  - [ ] SubmissionApproved email
  - [ ] ConcernFlagged email
  - [ ] ConcernAcknowledged email
  - [ ] ConcernResolved email

### Polling Fallback
- [ ] Implement fallback polling (every 30 sec if Reverb fails)
- [ ] Cache recent updates to avoid duplicate requests

### Testing
- [ ] Test Reverb broadcasting works
- [ ] Test email delivery works
- [ ] Test polling fallback works
- [ ] Test notifications appear in UI

### Deliverable
- ✅ Real-time notifications via Reverb
- ✅ Email notifications as fallback
- ✅ Notification center in UI
- ✅ Users see instant updates

---

## 🔐 PHASE 7: SECURITY & HARDENING (2 Days)

### CSRF & CORS
- [ ] Verify CSRF tokens on forms
- [ ] Verify CORS configured correctly
- [ ] Test from different origins (local, staging, production)

### Rate Limiting
- [ ] Implement rate limit on login (10 attempts / 15 minutes)
- [ ] Implement rate limit on API endpoints (100 req/min per user)
- [ ] Implement rate limit on password reset (3 attempts / 1 hour)
- [ ] Test rate limiting works

### Encryption
- [ ] Encrypt concern attachment file paths
- [ ] Encrypt file content before storage
- [ ] Test decryption on retrieval
- [ ] Verify no plaintext attachments in database

### Audit Logging
- [ ] Verify all CRUD actions logged
- [ ] Verify submission status changes logged
- [ ] Verify concern status changes logged
- [ ] Test audit log retrieval

### Token Security
- [ ] Verify token expiry (30 min default)
- [ ] Verify refresh token works
- [ ] Verify logout revokes token
- [ ] Test multi-tab logout sync

### MFA (Monitor)
- [ ] Verify TOTP working
- [ ] Verify backup codes work
- [ ] Verify MFA recovery flow works
- [ ] Test account lockout (5 failed attempts)

### Input Validation
- [ ] Verify all inputs sanitized
- [ ] Test XSS prevention
- [ ] Test SQL injection prevention
- [ ] Test file upload validation

### Secrets Management
- [ ] Verify no secrets in .env.example
- [ ] Verify secrets not logged
- [ ] Test .env loading from file
- [ ] Verify CI/CD doesn't expose secrets

### Testing
- [ ] Run security audit (Laravel sanctum, OWASP)
- [ ] Test all vulnerability scenarios
- [ ] Test recovery from attacks

### Deliverable
- ✅ CSRF tokens protecting forms
- ✅ Rate limiting on all endpoints
- ✅ Concern attachments encrypted
- ✅ Audit logs tracking changes
- ✅ Tokens managing securely
- ✅ Security audit passed

---

## 🧪 PHASE 8: TESTING & DEPLOYMENT (2-3 Days)

### Unit Tests
- [ ] Write tests for all models
- [ ] Write tests for all services
- [ ] Write tests for all helpers/utilities
- [ ] Achieve 80%+ code coverage
- [ ] Run `php artisan test`

### Integration Tests
- [ ] Write tests for API endpoints (full flow)
- [ ] Write tests for database transactions
- [ ] Write tests for event dispatching
- [ ] Test error scenarios (validation failures, auth failures)
- [ ] Run `php artisan test --feature`

### E2E Tests
- [ ] Write scenarios: School head submits all 3 forms
- [ ] Write scenarios: Monitor reviews & approves
- [ ] Write scenarios: School head flags concern
- [ ] Write scenarios: Monitor acknowledges & resolves
- [ ] Use Cypress or Playwright
- [ ] Run on staging environment

### Load Testing
- [ ] Simulate 100 concurrent users
- [ ] Simulate 100 concurrent submissions
- [ ] Measure response times
- [ ] Measure database performance
- [ ] Use Apache JMeter or k6

### Performance Optimization
- [ ] Index database queries
- [ ] Cache frequently accessed data
- [ ] Optimize API response times (target: <200ms)
- [ ] Optimize frontend bundle size
- [ ] Test page load times (target: <2s)

### Staging Deployment
- [ ] Set up staging environment (mirror production)
- [ ] Deploy to staging
- [ ] Verify all features work on staging
- [ ] Run E2E tests on staging
- [ ] Monitor for 48 hours (check logs, errors)
- [ ] Get DepEd to test on staging (if willing)

### Production Deployment
- [ ] Prepare deployment checklist
- [ ] Backup production database
- [ ] Deploy code to production
- [ ] Run migrations on production
- [ ] Verify services running (Reverb, Queue Worker)
- [ ] Monitor uptime & errors (Sentry)
- [ ] Test critical user flows

### Documentation
- [ ] Write User Manual (for school heads + monitors)
- [ ] Write Admin Guide (for DepEd IT)
- [ ] Write API Documentation (for future integration)
- [ ] Create FAQ document
- [ ] Create troubleshooting guide

### User Training
- [ ] Record training video (school head workflow)
- [ ] Record training video (monitor workflow)
- [ ] Schedule training sessions with DepEd
- [ ] Share docs + videos
- [ ] Prepare support email/hotline

### Deliverable
- ✅ 80%+ test coverage
- ✅ E2E tests passing
- ✅ Load test results analyzed
- ✅ Staging deployment stable
- ✅ User manual written
- ✅ Training videos created
- ✅ **LIVE IN PRODUCTION** ✅

---

## 🎯 POST-LAUNCH (Weeks 9-12)

### Day 1
- [ ] Monitor error logs (Sentry)
- [ ] Monitor uptime (Pingdom)
- [ ] Check email delivery
- [ ] Quick response to issues

### Week 1
- [ ] Gather user feedback
- [ ] Fix critical bugs
- [ ] Monitor database performance
- [ ] Track submission rates

### Week 2-4
- [ ] Implement quick-win improvements
- [ ] Fine-tune performance
- [ ] Expand user training (if needed)
- [ ] Plan Phase 2 features (if any)

---

## 📊 SUCCESS METRICS (Go-Live Readiness)

### Must Have ✅
- [ ] All 3 form types (I-META, TARGETS-MET, SMEA) working
- [ ] School heads can submit
- [ ] Monitor can review & approve/return
- [ ] Concerns workflow complete
- [ ] Notifications working
- [ ] Dashboard showing accurate data
- [ ] CSV export working
- [ ] Security audit passed
- [ ] E2E tests passing
- [ ] Staging deployment stable (48h)

### Should Have 🟠
- [ ] User manual written
- [ ] Training videos created
- [ ] Performance benchmarks met (<200ms API, <2s page load)
- [ ] Load test passed (100 concurrent users)
- [ ] Backup/restore tested

### Nice to Have 🟡
- [ ] Mobile app (can defer to Phase 2)
- [ ] Advanced analytics dashboard
- [ ] Bulk import interface
- [ ] Integration with national LIS

---

## 🏁 FINAL CHECKLIST BEFORE GOING LIVE

### Technical
- [ ] Database backups configured
- [ ] Error tracking (Sentry) configured
- [ ] Uptime monitoring configured
- [ ] Email delivery tested
- [ ] Reverb running on production
- [ ] Queue worker running on production
- [ ] SSL/TLS certificate valid
- [ ] CORS configured for production URL

### Operational
- [ ] Support email/hotline ready
- [ ] On-call rotation established
- [ ] Incident response plan ready
- [ ] Rollback plan ready
- [ ] DepEd IT contact list ready

### Training & Documentation
- [ ] User manual reviewed by DepEd
- [ ] Training videos uploaded
- [ ] FAQ document shared
- [ ] Support docs available
- [ ] Admin guide shared with DepEd IT

### Data & Privacy
- [ ] GDPR/Privacy compliance verified
- [ ] Data retention policy defined
- [ ] Backup frequency defined
- [ ] Data deletion procedures documented
- [ ] Audit logs retention defined

---

## 💬 DECISION LOG

Use this section to document decisions made during implementation:

```
Decision 1: Form Data Storage
- Option: JSON in DB (chosen)
- Reason: Faster to implement, can migrate later
- Trade-off: Less queryable initially

Decision 2: Real-time Notifications
- Option: Reverb + Email + Polling (chosen)
- Reason: Best UX, fallbacks if Reverb fails
- Trade-off: More infrastructure

Decision 3: Concern Attachments
- Option: Encrypt individual files (chosen)
- Reason: Privacy-safe, flexible
- Trade-off: More code than whole-table encryption

(Add more as you make decisions...)
```

---

## 📞 CONTACT INFORMATION

**Project Lead:** [Your Name]  
**DepEd Contact:** [Name, Email, Phone]  
**DepEd IT Contact:** [Name, Email, Phone]  
**Hosting Provider:** [Name, Support Email]  
**Emergency Contact:** [Your Phone]  

---

## 📈 TIMELINE TRACKER

| Phase | Start Date | End Date | Status | Notes |
|-------|-----------|----------|--------|-------|
| 1. Cleanup | - | - | ⏳ Not started | |
| 2. Backend | - | - | ⏳ Not started | |
| 3. Frontend Auth | - | - | ⏳ Not started | |
| 4. School Head UI | - | - | ⏳ Not started | |
| 5. Monitor UI | - | - | ⏳ Not started | |
| 6. Real-time | - | - | ⏳ Not started | |
| 7. Security | - | - | ⏳ Not started | |
| 8. Testing & Deploy | - | - | ⏳ Not started | |

---

## ✅ ALL DONE!

When you check all boxes above, your project is ready for production. 🎉

**Total time: 8 weeks (solo) or 4-5 weeks (2-person team)**

Good luck! 🚀
