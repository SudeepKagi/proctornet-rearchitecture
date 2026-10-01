# ProctorNet Rebuild Plan: Full Role Simplification, Account Flow Rebuild & Plain UX

**Status:** Authoritative Master Plan (Phase 1 Complete — Implementation Ready)  
**Date:** October 2026  
**Document Version:** 1.0.0  

---

## 1. Executive Summary & Architectural Invariants

This plan establishes the comprehensive blueprint for simplifying ProctorNet to **exactly four roles**, rebuilding the account creation and verification lifecycle around administrative identity ownership, eliminating legacy question pool complexities in favor of an integrated single-screen exam creator (with inline AI generation from PDF), hardening exam-entry security and live invigilation evidence, and executing a repo-wide Plain English UI/UX overhaul.

### Core Non-Negotiable Invariants:
1. **Exactly Four Roles:** `STUDENT`, `FACULTY` (UI label: **Teacher**), `DEVELOPER`, `ADMIN`. The standalone `INVIGILATOR` role and portal are completely eliminated and folded into the Teacher portal.
2. **Database Role Enum Stability:** The underlying database enum remains `FACULTY` across PostgreSQL, user roles, and internal logic to avoid destructive migration risks across hundreds of files. Every UI-facing label, header, badge, and navigation item is renamed to **Teacher**.
3. **Admin Identity Authority:** Accounts are provisioned exclusively by administrators with minimal seed facts:
   - Student: USN + institutional email
   - Teacher: Employee ID + institutional email
   - Name, phone, and profile particulars are collected during the user's mandatory first-login setup.
4. **Immutable Academic Facts for Students:** Once enrolled and approved, a student's `department_id` and `semester` are strictly read-only for the student, editable only by an institutional administrator.
5. **Human-in-the-Loop Photo Updates:** Enrolled face photos serve as biometric verification ground truth. Any post-enrollment photo change submitted in settings routes to an administrator approval queue and does not become active until approved.
6. **Unified Exam Creator:** No question pools, question banks, or topic blueprints. An exam is authored in one place: title, description, schedule, branch + semester target, and inline questions (authored manually or generated from uploaded PDF via `extractTextFromPdf()` and `generateMCQsFromText()`).
7. **Enforced Exam Security & Live Evidence:** Fullscreen exit triggers an active blocking overlay, escalation count, and captures a live evidence screenshot to be streamed directly to the Teacher's monitoring dashboard.

---

## 2. Database Migrations Needed

### 2.1 Existing Schema State (Migration `028_simplify_schema.js`)
Migration 028 has already:
- Dropped 17 obsolete tables: `question_banks`, `topics`, `subjects`, `rooms`, `session_invigilators`, `student_configurations`, `organization_settings`, `liveness_challenges`, `biometric_verifications`, `face_biometrics`, `manual_grades`, `manual_grade_audits`, `exam_analytics_cache`, `student_identity_documents`, `submission_idempotency`, `outbox_events`, `exam_entry_clearances`.
- Simplified `user_roles` to a primary key on `user_id` and constrained roles to `('STUDENT', 'FACULTY', 'ADMIN', 'DEVELOPER')`.
- Added `exam_id` UUID directly to `questions` and `subject_name` to `exams`.
- Added `department_id` FK to `student_profiles` and `faculty_profiles`.

### 2.2 New Migration: `029_account_flow_and_photo_approval.js`
This migration introduces the schema adjustments required for the admin-only seed creation flow and secure post-enrollment photo change reviews:

```javascript
/**
 * Migration 029: Admin Account Flow and Photo Approval Enhancements
 */
export async function up(pgm) {
  pgm.sql(`
    -- 1. Allow minimal user provisioning without name at creation time
    ALTER TABLE users ALTER COLUMN name DROP NOT NULL;
    ALTER TABLE users ALTER COLUMN name SET DEFAULT '';

    -- 2. Add pending photo verification columns to student_profiles
    ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS pending_face_photo_url TEXT;
    ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS pending_college_id_url TEXT;
    ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS photo_review_status VARCHAR(32) DEFAULT 'APPROVED';

    -- 3. Ensure check constraint for photo review status
    ALTER TABLE student_profiles DROP CONSTRAINT IF EXISTS check_student_photo_review_status;
    ALTER TABLE student_profiles ADD CONSTRAINT check_student_photo_review_status
      CHECK (photo_review_status IN ('NONE', 'PENDING', 'APPROVED', 'REJECTED'));
  `);
}

export async function down(pgm) {
  pgm.sql(`
    ALTER TABLE student_profiles DROP CONSTRAINT IF EXISTS check_student_photo_review_status;
    ALTER TABLE student_profiles DROP COLUMN IF EXISTS photo_review_status;
    ALTER TABLE student_profiles DROP COLUMN IF EXISTS pending_college_id_url;
    ALTER TABLE student_profiles DROP COLUMN IF EXISTS pending_face_photo_url;
    ALTER TABLE users ALTER COLUMN name DROP DEFAULT;
    UPDATE users SET name = 'User' WHERE name IS NULL OR name = '';
    ALTER TABLE users ALTER COLUMN name SET NOT NULL;
  `);
}
```

---

## 3. Files to Delete & Rationale

| # | File Path | Rationale |
|---|-----------|-----------|
| 1 | `frontend/src/pages/invigilator/InvigilatorDashboardPage.jsx` | Standalone `INVIGILATOR` portal eliminated. Monitoring is folded into Teacher portal. |
| 2 | `frontend/src/pages/candidate/CandidateFaceEnrollmentPage.jsx` | Legacy stand-alone face page. Replaced by unified `StudentSetupPage.jsx`. |
| 3 | `backend/src/modules/questions/questions.routes.js` | Standalone question pool/bank API removed. Questions are managed inline via exam endpoints. |
| 4 | `backend/src/modules/questions/questions.controller.js` | Legacy controller for stand-alone question banks removed. |
| 5 | `backend/src/modules/questions/questions.service.js` | Replaced by direct exam questions management in `faculty.service.js`. |
| 6 | `backend/src/modules/questions/questions.repository.js` | Direct question queries integrated into `exams.repository.js` and `faculty.service.js`. |
| 7 | `backend/src/modules/questions/README.md` | Obsolete documentation for deleted question bank module. |
| 8 | `backend/src/modules/questions/index.js` | Obsolete module entry point. |

---

## 4. Files to Edit & Specific Changes (Before → After)

### 4.1 Backend Domain & Auth Modules

#### `backend/src/domain/user/userRoles.js`
- **Before:** Allowed roles: `['STUDENT', 'FACULTY', 'INVIGILATOR', 'ADMIN', 'DEVELOPER']`.
- **After:** Allowed roles strictly: `['STUDENT', 'FACULTY', 'ADMIN', 'DEVELOPER']`. Remove `INVIGILATOR` from `ROLES`, `ROLE_HIERARCHY`, and role validator.

#### `backend/src/modules/users/user.schemas.js`
- **Before:** `createUserSchema` requires `name` (min 2 chars), `email`, `role` (enum of 4), `identifier`, and optional `phone`.
- **After:**
  - `createUserSchema`: Only accepts `email`, `role` (`z.enum(['STUDENT', 'FACULTY'])`), and `identifier` (USN for Student, Employee ID for Faculty).
  - Removes `name` and `phone` from creation requirement.
  - Adds validation that `role` cannot be `ADMIN` or `DEVELOPER` in this standard creation endpoint.

#### `backend/src/modules/users/user.service.js`
- **Before:** `createSingleUser` requires `name` and optionally `phone`.
- **After:**
  - `createSingleUser`: `name` defaults to `''` or identifier until first-login setup.
  - Generates secure 16-character temporary password.
  - Audits `USER_CREATED` with role and identifier.

#### `backend/src/modules/users/user.repository.js`
- **Before:** `createMinimalUser` executes `INSERT INTO student_profiles (user_id, enrollment_number, metadata)` which fails because `metadata` column was dropped in migration 028.
- **After:**
  - Fixes query to `INSERT INTO student_profiles (user_id, enrollment_number) VALUES ($1, $2);`.
  - Fixes query to `INSERT INTO faculty_profiles (user_id, employee_id) VALUES ($1, $2);`.
  - Fixes default `name` insertion for nullable/empty initial users.

#### `backend/src/modules/users/user.routes.js`
- **Before:** `POST /api/v1/admin/users` validates full user payload.
- **After:** Validates simplified schema (`email`, `role: STUDENT|FACULTY`, `identifier`).

### 4.2 Student Profile, Onboarding & Identity Modules

#### `backend/src/modules/student/student.schemas.js`
- **Before:** `updateStudentProfileSchema` allows students to pass `departmentId` and `semester`.
- **After:**
  - `updateStudentProfileSchema` strictly allows `name` (spelling adjustments) and `phone`.
  - Explicitly strips/rejects `departmentId`, `department`, and `semester` (read-only for students).
  - `studentPhotoUpdateSchema`: validates incoming multipart or base64 face photo upload for re-verification.

#### `backend/src/modules/student/student.repository.js` & `student.service.js`
- **Before:** `updateStudentProfile` updates `student_profiles.department_id` and `student_profiles.semester` without authorization check, and immediately overwrites `face_photo_url`.
- **After:**
  - `updateStudentProfile`: Does NOT modify `department_id` or `semester`.
  - `requestPhotoUpdate(userId, photoUrl)`: Saves to `pending_face_photo_url`, sets `photo_review_status = 'PENDING'`, and updates `verification_status = 'PENDING'`. Active `face_photo_url` remains unchanged until admin approves.
  - `approvePhotoUpdate(userId)`: Copies `pending_face_photo_url` to `face_photo_url`, clears pending column, sets `photo_review_status = 'APPROVED'` and `verification_status = 'VERIFIED'`.

#### `backend/src/modules/student/student.routes.js`
- **Before:** Routes `/profile`, `/setup`, `/verify-identity`.
- **After:**
  - Mounts `POST /photo-update` (multipart or JSON) for student photo re-enrollment requests.
  - Ensures `/profile` PATCH uses the hardened schema where department and semester are read-only.

### 4.3 Teacher / Faculty Portal & Exam Authoring

#### `backend/src/modules/faculty/faculty.routes.js`
- **Before:** Includes question pool endpoints:
  - `GET /question-pools`
  - `POST /question-pools`
  - `GET /question-pools/:topicId/questions`
  - `POST /question-pools/generate-from-pdf`
  - `POST /question-pools/:topicId/save-questions`
- **After:**
  - Deletes all question pool routes.
  - Keeps only unified exam endpoints:
    - `GET /dashboard/stats`
    - `GET /exams`
    - `GET /exams/:examId`
    - `POST /exams` (and `/exams/schedule`)
    - `PUT /exams/:examId`
    - `PUT /exams/:examId/cancel`
    - `GET /exams/:examId/analytics-summary`
    - `POST /exams/generate-from-pdf` (handles PDF file upload + text extraction + MCQ generation).

#### `backend/src/modules/faculty/faculty.controller.js`
- **Before:** Contains handlers for question pools (`listQuestionPoolsHandler`, `createQuestionPoolHandler`, etc.).
- **After:**
  - Removes question pool handlers.
  - Retains `generateMCQsFromPdfHandler` which connects uploaded PDF buffer to `llmService.extractTextFromPdf()` and `llmService.generateMCQsFromText()`.

#### `backend/src/modules/faculty/faculty.service.js`
- **Before:** Contains legacy backward-compatibility shims returning dummy arrays for question pools.
- **After:**
  - Removes all question pool methods.
  - `scheduleExam`: Validates required `target_semester` (1-8), canonical `department_id` (from `departments` table), title, schedule window, and inline `questions` array.
  - Auto-assigns students matching `semester` and `department_id` into `session_students`.
  - Auto-assigns creator faculty as supervisor for session.

#### `backend/src/modules/onboarding/onboarding.service.js` (or `user.service.js`)
- **Before:** Teacher onboarding permitted free-text department name and free-text designation.
- **After:**
  - Requires `departmentId` matching canonical `departments.department_id`.
  - Requires `designation` selected from allowed standard options: `'Professor'`, `'Associate Professor'`, `'Assistant Professor'`, `'Lecturer'`, `'Teaching Assistant'`.

### 4.4 Proctoring, Telemetry & Real-Time Monitoring

#### `frontend/src/hooks/useProctoringEvents.js`
- **Before:** Enqueues `FULLSCREEN_EXIT` and `DEVTOOLS_OPEN` solely into client buffer without local UI feedback.
- **After:**
  - Emits local custom event `proctornet:fullscreen-violation` on `FULLSCREEN_EXIT` with warning counter.
  - DevTools listener accurately documented as shortcut-based (`F12`, `Ctrl+Shift+I/J`, `Cmd+Opt+I`).
  - Includes helper to capture canvas snapshot from active video stream and submit via `evidenceApi.requestUploadUrl`.

#### `frontend/src/pages/candidate/ExamTakingPage.jsx`
- **Before:** Ignores `FULLSCREEN_EXIT` events visually, allowing candidates to leave fullscreen and continue test without interruption.
- **After:**
  - Introduces **Fullscreen Enforcement Modal / Barrier**: When candidate exits fullscreen, the exam UI is blurred/blocked, displaying an urgent alert:
    *"Fullscreen Mode Required: You have exited fullscreen mode (Violation #{count}). Return to fullscreen immediately to continue your examination."*
  - Provides a single primary button: *"Return to Fullscreen"*.
  - When violation occurs, automatically captures webcam snapshot and triggers background evidence upload.

#### `frontend/src/pages/invigilator/SessionMonitorPage.jsx`
- **Before:** Imports `useRealtime` but never initializes subscriptions. UI updates only on manual refresh.
- **After:**
  - Initialized with `useRealtime()` subscribing to `exam:session:${sessionId}`.
  - Listens for:
    - `proctoring:flag_raised` → Appends new flag to candidate row and plays subtle visual alert.
    - `proctoring:risk_score_updated` → Updates risk badge in real time.
    - `proctoring:evidence_uploaded` → Flashes evidence badge and updates `EvidenceModal` list live.
  - Changes all headings and breadcrumbs to **"Teacher Live Exam Monitoring"**.

#### `frontend/src/components/invigilator/EvidenceModal.jsx`
- **Before:** Relies on manual modal reopening to fetch new evidence.
- **After:**
  - Displays captured evidence snapshots (webcam and screen) with clear violation event tags (`FULLSCREEN_EXIT`, `BROWSER_FOCUS_LOST`).
  - Supports live refresh and high-resolution lightbox inspection.

### 4.5 Frontend User Experience & Plain English Overhaul

#### `frontend/src/pages/admin/CreateUserPage.jsx`
- **Before:** Asks for Full Name, Institutional Email, Role (Student, Faculty, Developer, Admin), USN/Employee ID, and Phone.
- **After:**
  - Role selector restricted to **Student** or **Teacher** only. (Admins/Developers are provisioned via dedicated infrastructure scripts).
  - Student form inputs: **Institutional Email** and **USN / University Seat Number** only.
  - Teacher form inputs: **Institutional Email** and **Employee ID** only.
  - Name and Phone fields completely removed from this screen.
  - Displays generated temporary password in a secure modal with copy-to-clipboard action.

#### `frontend/src/pages/candidate/CandidateDashboardPage.jsx`
- **Before:** Cluttered with 4 KPI cards (Total Assigned, Upcoming, Completed, Pass Rate), enrollment banners, and debug stats.
- **After:**
  - Stripped down strictly to **three functions**:
    1. **Upcoming Assigned Exams:** List of exams scheduled for the student's branch & semester, with date/time, duration, and a clear *"Enter Exam"* / *"View Details"* action.
    2. **Exam Results:** Table of completed exams with score, pass/fail status, and *"View Result"* action.
    3. **Attend Exam:** Prominent live card when an assigned exam is currently in progress with *"Enter Exam"* button.
  - All extraneous marketing, fake metrics, and secondary widgets removed.

#### `frontend/src/pages/candidate/CandidateProfilePage.jsx`
- **Before:** Student can edit their department and semester.
- **After:**
  - **Branch** and **Semester** are displayed as **Read-Only** (Badge: *"Managed by Administrator"*).
  - **Editable Profile Settings:** Student can update Name spelling, Phone number, and Password.
  - **Photo Update:** Re-uploading face photo shows notice: *"Photo updates require administrator verification before taking effect."* Submits to review queue; existing approved photo remains active until reviewed.

#### `frontend/src/pages/onboarding/StudentSetupPage.jsx`
- **Before:** Complex verification page.
- **After:**
  - Clear 4-step first-login onboarding:
    1. Full Name
    2. Branch (dropdown populated from canonical `/api/v1/student/departments`)
    3. Semester (dropdown 1 through 8)
    4. Face Photo & College ID Card upload (College ID only; all passport/driver's license options removed).
  - Submits to `POST /api/v1/student/setup` and transitions user to `PENDING` review state.

#### `frontend/src/pages/onboarding/FacultyOnboardingPage.jsx`
- **Before:** Free text designation and hardcoded departments list.
- **After:**
  - Title: **"Teacher Setup"**.
  - Designation: Dropdown (`Professor`, `Associate Professor`, `Assistant Professor`, `Lecturer`, `Teaching Assistant`).
  - Branch: Dropdown populated from canonical `/api/v1/student/departments`.
  - Submits to pending approval queue.

#### `frontend/src/pages/faculty/CreateExamPage.jsx`
- **Before:** Separate question pools and blueprints.
- **After:**
  - All-in-one exam author:
    1. Exam Details: Title, Subject Name, Duration, Total Marks, Passing Marks.
    2. Targeting: Branch dropdown (canonical departments) and Target Semester (1-8).
    3. Schedule: Date and Start Time.
    4. Inline Question Authoring:
       - **Manual MCQ:** Prompt text, 4 options, select correct radio.
       - **AI Generation from PDF:** Upload PDF document, select question count and difficulty, click *"Generate Questions"*, preview generated questions, edit or approve inline, and save directly to exam.

#### `frontend/src/components/layout/Navbar.jsx` & `frontend/src/routes/roleNavigation.js`
- **Before:** References "Faculty", standalone invigilator routes, and extra candidate links.
- **After:**
  - Renames all UI labels from "Faculty" to **"Teacher"**.
  - Student Nav items: **"My Exams"** (`/candidate/exams`), **"Results"** (`/candidate/results`), and **"Profile Settings"** (`/candidate/profile`).
  - Teacher Nav items: **"Dashboard"** (`/faculty`), **"Exams"** (`/faculty/exams`), **"Create Exam"** (`/faculty/exams/create`).
  - Removes all references to `INVIGILATOR` in role navigation.

---

## 5. New Files to Create

| # | File Path | Content & Purpose |
|---|-----------|-------------------|
| 1 | `docs/REBUILD_PLAN.md` | This authoritative master plan document. |
| 2 | `backend/migrations/029_account_flow_and_photo_approval.js` | Database migration for nullable `users.name` and student pending photo review columns. |
| 3 | `backend/tests/modules/adminAccountFlow.test.js` | Integration test suite for admin minimal creation, temporary password generation, student first login setup, and student department/semester read-only enforcement. |
| 4 | `backend/tests/modules/examSecurityAndEvidence.test.js` | Integration test suite for fullscreen violation telemetry ingestion, realtime websocket alerts to teacher, and live evidence upload/retrieval. |

---

## 6. Complete API Routes Delta

### 6.1 Removed Routes
- `GET /api/v1/faculty/question-pools`
- `POST /api/v1/faculty/question-pools`
- `GET /api/v1/faculty/question-pools/:topicId/questions`
- `POST /api/v1/faculty/question-pools/:topicId/save-questions`
- `POST /api/v1/faculty/question-pools/generate-from-pdf` (consolidated into `/api/v1/faculty/exams/generate-from-pdf`)
- `GET /api/v1/invigilator/dashboard`
- `GET /api/v1/invigilator/sessions`

### 6.2 Added Routes
- `POST /api/v1/student/photo-update`: Authenticated student endpoint to submit a new face photo for admin review.
- `GET /api/v1/admin/verifications/pending-photos`: Admin endpoint to view students requesting photo changes.
- `POST /api/v1/admin/verifications/photos/:studentId/decision`: Admin endpoint to approve or reject a photo change.

### 6.3 Changed Routes
- `POST /api/v1/admin/users`:
  - **Before:** Required `name`, `email`, `role`, `identifier`, `phone`.
  - **After:** Requires only `email`, `role` (`STUDENT` or `FACULTY`), and `identifier` (USN or Employee ID).
- `PATCH /api/v1/student/profile` (and alias `/api/v1/candidate/profile`):
  - **Before:** Accepted `departmentId`, `department`, `semester`, `name`, `phone`.
  - **After:** Rejects changes to `departmentId` and `semester` (400 Bad Request if attempted). Only accepts `name` and `phone`.
- `POST /api/v1/faculty/exams/generate-from-pdf`:
  - **Before:** Orphaned / dead code endpoint.
  - **After:** Authoritative endpoint accepting multipart PDF and returning structured MCQs for inline insertion into exam creation form.

---

## 7. Test Impact & Verification Matrix

### 7.1 Existing Tests Broken by Schema & Module Renames
1. `backend/tests/modules/candidateProfileAndBiometrics.test.js`
   - **Cause:** Imports from deleted file `src/modules/candidate/candidateIdentity.service.js`.
   - **Fix:** Update imports to `src/modules/student/student.service.js` and test that `departmentId`/`semester` are read-only while `name`/`phone` can be updated.
2. `backend/tests/modules/examEntryClearance.test.js`
   - **Cause:** Imports from deleted file `src/modules/sessions/examClearance.repository.js`.
   - **Fix:** Update test to mock and verify the in-memory/simplified `examClearance.service.js`.

### 7.2 Existing Tests Passing & Verified
- `tests/modules/schedulingDepartment.test.js` (6 tests) — Verifies canonical departments and semester targeting.
- `tests/modules/autosaveOcc.test.js` (6 tests) — Verifies optimistic concurrency on student answer saves.
- `tests/domain/resultsReleasePolicy.test.js` (9 tests) — Verifies exam result release logic.
- `tests/domain/userStateMachine.test.js` (11 tests) — Verifies user lifecycle states (`ACTIVE`, `SUSPENDED`, etc.).
- `tests/domain/examStateMachine.test.js` (8 tests) — Verifies exam states (`DRAFT`, `SCHEDULED`, `LIVE`, `ENDED`, `CANCELLED`).
- `tests/domain/attemptStateMachine.test.js` (10 tests) — Verifies attempt states.
- `tests/infrastructure/sfuSchemas.test.js` (8 tests) — Verifies SFU WebRTC validation schemas.
- `tests/modules/biometricsFailClosed.test.js` (8 tests) — Verifies fail-closed biometric behavior.
- `tests/middleware/authRbac.test.js` (8 tests) — Verifies role gating.

### 7.3 New Tests to Write
1. `backend/tests/modules/adminAccountFlow.test.js`:
   - Admin creates Student with ONLY email + USN (no name/phone provided).
   - Admin creates Teacher with ONLY email + Employee ID.
   - Verification that temporary password is generated and valid.
   - First-login password change and mandatory profile setup.
   - Student attempt to change `department` or `semester` via profile PATCH is rejected with 400.
   - Student photo update moves to `pending_face_photo_url` with status `PENDING`, leaving original photo intact until admin approval.
2. `backend/tests/modules/examSecurityAndEvidence.test.js`:
   - Fullscreen exit event enqueued with high severity and warning count.
   - Realtime websocket emission of `proctoring:flag_raised` on threshold crossing.
   - Evidence upload URL generation, confirmation, and retrieval by teacher during live session.

---

## 8. Item-by-Item Implementation Roadmap & Evidence Plan

### Item 1: Database Migration `029`
- Write and run migration `029_account_flow_and_photo_approval.js`.
- **Evidence:** Migration execution output, `pgmigrations` table query, column inspection of `users` and `student_profiles`.

### Item 2: Admin Account Creation API & UI Rebuild
- Update `user.schemas.js`, `user.service.js`, `user.repository.js`, and `CreateUserPage.jsx`.
- Restrict to Student (USN + email) and Teacher (Employee ID + email).
- Remove name and phone from account creation form.
- Verify temp password generation.
- **Evidence:** Real API call creating student and teacher accounts, UI screenshot/DOM inspection of `CreateUserPage`.

### Item 3: First-Login & Onboarding Rebuild
- Update `StudentSetupPage.jsx` and `FacultyOnboardingPage.jsx`.
- Student: name, branch dropdown from canonical `departments`, semester (1-8), face photo, College ID only.
- Teacher: designation dropdown + branch dropdown from canonical `departments`.
- **Evidence:** API responses for student and teacher setup, verification of pending queue in database.

### Item 4: Student Profile Invariant & Photo Re-Verification
- Harden `student.schemas.js`, `student.service.js`, and `CandidateProfilePage.jsx`.
- Verify `department_id` and `semester` are strictly read-only for students.
- Wire photo re-upload through admin approval review.
- **Evidence:** API call attempting to patch department (expecting 400), API call requesting photo update (verifying `pending_face_photo_url`).

### Item 5: Remove Question Pools & Wire All-in-One Exam Creator
- Delete question bank routes and legacy files.
- Wire `CreateExamPage.jsx` with schedule, branch/semester targeting, inline MCQs, and PDF AI generation.
- **Evidence:** API call to `/exams/generate-from-pdf` returning generated MCQs, API call creating exam with inline questions.

### Item 6: Exam Security & Live Evidence Hardening
- Audit and harden `useProctoringEvents.js` and `ExamTakingPage.jsx` with Fullscreen Enforcement overlay.
- Connect live websocket events to `SessionMonitorPage.jsx`.
- **Evidence:** Automated test verifying violation escalation, client-side rendering verification of fullscreen blocker.

### Item 7: Role Simplification & Plain English UX Pass
- Remove `INVIGILATOR` references across codebase and delete `InvigilatorDashboardPage.jsx`.
- Rename all "Faculty" labels to "Teacher".
- Simplify `CandidateDashboardPage.jsx` down to the exact 3 core elements.
- Compile production frontend build (`npm run build`).
- Run all backend test suites (`npm test`).
- **Evidence:** 100% test pass output, 0-error build output.
