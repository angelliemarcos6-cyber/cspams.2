# CSPAMS End-User Manual

**System:** Centralized Student Performance Analytics and Monitoring System (CSPAMS)  
<<<<<<< ours
**Audience:** Division Monitor and School Head users  
**Coverage:** Login, dashboards, school records, student records, and indicator compliance workflow
=======
**Audience:** School Monitor and School Administrator (School Head) users  
**Module coverage in this version:** Login and Section Management

---

## Table of Contents

1. [What CSPAMS is for](#1-what-cspams-is-for)
2. [Before you start](#2-before-you-start)
3. [How to open the system](#3-how-to-open-the-system)
4. [How to sign in](#4-how-to-sign-in)
5. [Main screen and navigation](#5-main-screen-and-navigation)
6. [Section Management (Create, Edit, Delete)](#6-section-management-create-edit-delete)
7. [Common problems and fixes](#7-common-problems-and-fixes)
8. [Data entry best practices](#8-data-entry-best-practices)
9. [Security reminders](#9-security-reminders)
10. [Support request format](#10-support-request-format)
>>>>>>> theirs

---

## 1) What CSPAMS is for

<<<<<<< ours
CSPAMS is the division-school workspace for:

- School profile and compliance monitoring
- Student data management (LRN, status movement, section/teacher tags)
- TARGETS-MET / I-META indicator submission and review
- Unified monitor and school-head workflow history
=======
CSPAMS helps schools manage and monitor student performance data in one system.  
In the current implementation, users can:

- sign in with a role-based login,
- access the admin panel,
- manage section records (add, edit, delete, filter).
>>>>>>> theirs

---

## 2) Before you start

Prepare the following:

<<<<<<< ours
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
=======
- A working internet connection (or campus network access, if hosted internally)
- Your **DepEd email account**
- Your assigned password
- Correct role assignment from the system administrator

> If you are unsure about your role, ask your school/division system administrator first.

---

## 3) How to open the system

1. Open a web browser (Chrome, Edge, or Firefox).
2. Enter the CSPAMS URL given by your administrator.
3. Open the admin panel page (usually `/admin`).
   - Example: `http://127.0.0.1:8000/admin`
4. Wait for the CSPAMS login page to load.

---

## 4) How to sign in

### Step 1: Select your role tab

At the top of the login form, choose one tab:

- **School Monitor**
- **School Administrator**

> Important: You must select the tab that matches your account role.

### Step 2: Enter your login details

- **DepEd Email**: use your official `@deped.gov.ph` account
- **Password**: enter your assigned password

### Step 3: Click Sign In

Click the sign-in button for your selected role.

### Step 4: If login fails

If you see this message:  
**“This account does not match the selected role tab.”**

Do this:

1. Sign in again
2. Select the correct role tab first
3. Re-enter your credentials

### Forgot Password link

Click **Forgot your password?** to see guidance based on your selected role.

---

## 5) Main screen and navigation

After successful login, you will enter the Filament admin panel.

### Basic layout

- **Left sidebar**: modules/resources
- **Main content area**: table or form page
- **Header actions**: usually contains **Create** button on list pages

### Typical navigation flow

1. Open a module from the left sidebar
2. Review the list/table
3. Use Create/Edit/Delete actions as needed

---

## 6) Section Management (Create, Edit, Delete)

Use this module to manage class section records.

## 6.1 Open Section Management

1. Login successfully
2. In the left sidebar, click **Sections** (under School Management, if grouped)

## 6.2 Create a new section

1. Click **Create**
2. Fill in required fields:
   - School (if visible to your role)
   - Academic Year
   - Section Name
   - Grade Level
   - Maximum Students (optional)
3. Click **Create** / **Save**
4. Confirm the record appears in the table

## 6.3 Edit a section

1. In the section table, locate the record
2. Click **Edit**
3. Update needed fields
4. Click **Save**

## 6.4 Delete a section

1. In the section table, click **Delete** on a row
2. Confirm deletion in the prompt

> Use delete carefully. If your deployment uses soft delete, admins may recover records; otherwise deletion may be permanent.

## 6.5 Bulk delete (if available)

1. Select multiple rows using checkboxes
2. Choose bulk action: **Delete selected**
3. Confirm the action

## 6.6 Filter and sort

- Use **Academic Year** filter to narrow results
- Click column headers to sort records

## 6.7 Role-based view notes

Depending on your assigned role:

- some fields (like School) may be hidden or auto-filled,
- you may only see records from your assigned school.

---

## 7) Common problems and fixes

## 7.1 Wrong role selected at login

**Symptom:** Role mismatch error after sign in.  
**Fix:** Choose the correct tab (School Monitor or School Administrator), then log in again.

## 7.2 Email is rejected

**Symptom:** Validation error on email field.  
**Fix:** Use a valid DepEd email ending in `@deped.gov.ph`.

## 7.3 Cannot see expected records

**Symptom:** Missing rows in table.  
**Fix:**

1. Check active filters (especially Academic Year)
2. Confirm your role and school assignment with admin

## 7.4 Session/login keeps failing

Try these:

1. Refresh browser and sign in again
2. Clear browser cache/cookies
3. Try another browser
4. Contact administrator to verify account status

---

## 8) Data entry best practices

To keep reports accurate:

- Use consistent section naming format
- Confirm Academic Year before saving
- Double-check spelling and grade level values
- Avoid duplicate section entries
- Review records before final submission

---

## 9) Security reminders

- Never share your password
- Always log out after use
- Avoid saving credentials on public/shared computers
- Report suspicious access immediately

---

## 10) Support request format

When reporting issues, send this information:

- Full Name:
- Role (Monitor/Administrator):
- School:
- Date and Time of issue:
- Page/module where issue occurred:
- Error message (exact text):
- Screenshot attached (Yes/No):

>>>>>>> theirs
