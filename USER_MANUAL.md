# CSPAMS End-User Manual

**System:** Centralized Student Performance Analytics and Monitoring System (CSPAMS)  
**Audience:** Division Monitor and School Head users  
**Coverage:** Login, dashboards, school records, student records, and indicator compliance workflow

---

## 1) What CSPAMS is for

CSPAMS is the division-school workspace for:

- School profile and compliance monitoring
- Student data management (LRN, status movement, section/teacher tags)
- TARGETS-MET / I-META indicator submission and review
- Unified monitor and school-head workflow history

---

## 2) Before you start

Prepare the following:

- Browser: Chrome, Edge, or Firefox
- CSPAMS URL from your administrator
- Correct account role
- Account credentials from your admin

Role login identity:

- School Head: **School Code** + Password
- Division Monitor: **Email/Username** + Password

---

## 3) Open the system

1. Open browser.
2. Go to CSPAMS URL (example: `http://127.0.0.1:8000/admin`).
3. Wait for the sign-in page.

---

## 4) Sign in

1. Select the correct workflow tab:
   - School Head Workflow
   - Monitor Workflow
2. Enter your credentials.
3. Click sign in.

If login fails, verify:

- Correct role tab
- Correct school code (School Head accounts)
- Correct password

If your account is marked for reset, complete required password reset through the admin/API reset flow before dashboard access.

---

## 5) Role scope and access

### School Head scope

- Can view and edit only their assigned school data
- Can create/update/delete student records for their school
- Can create and submit indicator compliance packages
- Can see review notes/history from monitor actions

### Division Monitor scope

- Can view division-wide school, student, and indicator data
- Can review/validate/return indicator submissions
- Can maintain division school records (CRUD)

---

## 6) Main navigation

Key workspace sections:

- Overview
- Requirements
- Compliance Records
- School Records

Inside Compliance Records:

- Student Records
- Indicator Compliance Queue

Use top/side navigators to switch sections directly.

---

## 7) Student Records (School Head)

Use Student Records to manage learner profiles:

- LRN
- Name, sex, birth date
- Status (enrolled, returning, transferee, at_risk, dropped_out, on_hold, completer, graduated)
- Risk level
- Section and teacher tags

Operations:

- Create record
- Update record
- Delete record
- Search/filter by name, LRN, status, and school filters (monitor side)

---

## 8) Indicator compliance workflow

School Head:

1. Select academic year and reporting period
2. Encode indicators using typed inputs:
   - Number
   - Currency
   - Yes/No
   - Enum
   - Yearly matrix
   - Text
3. Save draft package
4. Submit to monitor

Division Monitor:

1. Review package
2. Validate or return with notes
3. Track package history

---

## 9) Reports and exports

Reports Center supports:

- School Summary: CSV, Excel, PDF
- Performance Summary: CSV, Excel, PDF

Apply filters first (academic year, period, school), then export.

---

## 10) Security reminders

- Do not share passwords.
- Change temporary passwords immediately.
- Use unique strong passwords.
- Log out after each session, especially on shared devices.
- Report suspected account misuse immediately.

---

## 11) Support request format

When escalating issues, include:

- Full name
- Role
- School code/school name
- Date/time of issue
- Exact module/page
- Exact error message
- Screenshot or screen recording
