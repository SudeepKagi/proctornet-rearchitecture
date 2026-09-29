# ADR-0017: Candidate Portal Gate, Profile Versioning, and Server-Authoritative Exam Entry Clearance

## Status
Accepted

## Date
2026-09-29

## Context & Problem Statement

Prior to this architectural enhancement, the candidate portal had several security, consistency, and UX gaps:
1. **Unversioned Profile Updates & Concurrent Modification Hazards:** Candidate profile modifications lacked optimistic concurrency control (OCC). Concurrent updates risked silent overwrites without detection.
2. **Biometric Face Photo Re-enrollment Security Gaps:** Candidates could not securely update their biometric reference face photograph without administrative intervention. Furthermore, updating reference photos during an active exam attempt or immediately prior to a scheduled session created high risk for proxy test-taking and spoofing attacks.
3. **Navigational Distractions During Live Examinations:** Live exam attempts shared navigation elements and layouts with standard dashboard views, creating cognitive distractions and escape paths for test-takers.
4. **Disjointed Pre-Exam Gate & Screen Capture Prompts:** The pre-exam readiness check and live exam execution lacked a server-authoritative clearance record. Candidates had to grant screen-sharing permissions twice (once during readiness testing and again when entering the exam room), degrading the test-taking experience and opening race conditions between verification and attempt initiation.

## Decision Drivers

- **Server-Authoritative Admittance:** Exam attempts must never be created or resumed without strictly verified, unexpired, and server-cleared prerequisites.
- **Optimistic Concurrency Control (OCC):** Prevent concurrent write collisions on student profile records and provide actionable HTTP 409 reload prompts.
- **Biometric Reference Face Immutability & Auditability:** Retain version history of all biometric templates while guaranteeing at most one active template per student via partial unique database indexes.
- **Zero Double-Prompt UX:** Screen sharing permission acquired during readiness must survive client-side route transitions and hand off seamlessly to the exam environment without prompt interruption.
- **Distraction-Free Exam Isolation:** Live exam taking must be strictly quarantined in a dedicated layout (`ExamLayout`) devoid of navigation bars, sidebar links, or external anchors.

## Decision Outcome

We have implemented the following architectural framework:

### 1. Profile Versioning & Optimistic Concurrency Control (OCC)
- Added `version INTEGER NOT NULL DEFAULT 1` to `users` and `student_profiles`.
- All candidate profile updates (`PATCH /api/v1/candidate/profile`) enforce `expected_version` validation. If the database version does not match `expected_version`, the server rejects the request with HTTP 409 Conflict (`CONCURRENT_MODIFICATION_DETECTED`).
- The frontend tracks form dirtiness and presents a conflict reload prompt if a 409 is encountered.
- Student-editable fields are strictly bounded to `name` and `phone`. Read-only properties (`email`, `enrollment_number`, `department`, `semester`, and `accommodations`) are protected against unauthorized modification.

### 2. Biometric Photo Re-enrollment & Security Guards
- Added `version`, `is_active`, and `superseded_at` columns to `face_biometrics` along with partial unique index:
  ```sql
  CREATE UNIQUE INDEX idx_face_biometrics_user_active
    ON face_biometrics(user_id)
    WHERE is_active = TRUE;
  ```
- Re-enrollment is executed inside a single atomic database transaction (`reEnrollFaceBiometricTransaction`). Previous active biometric rows are marked superseded, and new templates are inserted with `is_active = TRUE` and incremented `version`.
- Security Guards:
  - Re-enrollment is blocked with HTTP 409 Conflict if the candidate has an active exam attempt (`ACTIVE` or `PAUSED`).
  - Re-enrollment is blocked with HTTP 409 Conflict if the candidate has an upcoming scheduled exam session within the lockout window (configurable via `BIOMETRIC_PHOTO_LOCKOUT_HOURS`, default 24 hours).

### 3. Role-Based Navigation & Layout Separation
- `Navbar` component is strictly config-driven and role-based (`ROLE_NAV_ITEMS`). It renders `null` until authentication is resolved.
- For students, the navbar provides direct desktop links to `Dashboard` (`/candidate`), `My Exams` (`/candidate/exams`), and `Results` (`/candidate/results`).
- The avatar dropdown houses profile navigation (`/candidate/profile`), verification status badges (`VERIFIED`, `PENDING_REVIEW`, `REJECTED`), display density controls, and sign out.
- Implemented `ExamLayout` as a dedicated, distraction-free container wrapping `/candidate/attempts/:attemptId` without navigation headers, sidebars, or escape links.

### 4. Server-Authoritative Exam Entry Clearance Gate
- Created `exam_entry_clearances` table:
  ```sql
  CREATE TABLE exam_entry_clearances (
    clearance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES exam_sessions(session_id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    screen_share_at TIMESTAMPTZ,
    liveness_passed BOOLEAN NOT NULL DEFAULT FALSE,
    face_verified_at TIMESTAMPTZ,
    face_score NUMERIC(5, 4),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX idx_exam_entry_clearance_unconsumed
    ON exam_entry_clearances(session_id, student_id)
    WHERE consumed_at IS NULL;
  ```
- 3-Step Candidate Readiness Stepper:
  1. **Screen Share:** Candidate authorizes full-screen sharing (`displaySurface: 'monitor'`). Client posts to `/api/v1/sessions/:id/clearance/screen-share` which updates `screen_share_at` and sets TTL.
  2. **Biometric Face Verification:** Live webcam snapshot is compared against the enrolled biometric reference photo. On match, server marks `liveness_passed = TRUE`, `face_verified_at = CURRENT_TIMESTAMP`, and records `face_score`.
  3. **Honor Code & Attempt Launch:** Candidate accepts the academic integrity honor code and launches the attempt.
- Atomic Attempt Start & Clearance Consumption:
  - `startAttempt()` locks the unconsumed clearance record via `SELECT ... FOR UPDATE`.
  - Verifies `screen_share_at IS NOT NULL`, `liveness_passed = TRUE`, `face_verified_at IS NOT NULL` (unless medically exempted), and `expires_at > serverNow`.
  - If invalid, expired, or missing, throws HTTP 403 `ForbiddenError('Exam entry clearance required', 'ENTRY_CLEARANCE_REQUIRED')`.
  - Atomically marks `consumed_at = CURRENT_TIMESTAMP` in the same transaction that inserts the new attempt.
- Crash Recovery & Resumption:
  - If resuming an active attempt after network crash or disconnection, the student is required only to re-establish screen sharing (`SCREEN_SHARE_REQUIRED`).
- Persistent Screen Sharing Context (`ScreenStreamContext`):
  - Screen share `MediaStream` is held above the router in `ScreenStreamProvider`.
  - The stream acquired during readiness check-in seamlessly passes into `ExamTakingPage` without prompting the user for screen sharing a second time.
  - Video track `onended` events trigger a mandatory blocking overlay and emit `SCREEN_CAPTURE_INTERRUPTED` proctoring telemetry.

## Consequences

### Positive
- Strict server-side enforcement prevents unverified students or proxy test-takers from initializing exam attempts.
- No possibility of race conditions or double attempts through partial unique indexes and `FOR UPDATE` transaction locks.
- Streamlined student onboarding and check-in without redundant browser permission prompts.
- Full auditability of reference photo updates and clearance consumptions in `audit_logs`.

### Negative / Trade-offs
- Students who lose internet connection and refresh the browser must re-authorize screen sharing to regain exam entry.
- 24-hour lockout window prevents last-minute photo changes before exams, requiring faculty/admin manual intervention if a candidate's appearance or credentials change urgently.
