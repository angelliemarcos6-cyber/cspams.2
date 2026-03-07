# CSPAMS End-User Manual

**System:** Centralized Student Performance Analytics and Monitoring System (CSPAMS)  
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

---

## 1) What CSPAMS is for

CSPAMS helps schools manage and monitor student performance data in one system.  
In the current implementation, users can:

- sign in with a role-based login,
- access the admin panel,
- manage section records (add, edit, delete, filter).

---

## 2) Before you start

Prepare the following:

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

