# Phase 23 Implementation Plan: Complete User & Account Administration

> **Authoritative Architectural Precedence:**  
> 1. Notion Step 13 Final Re-Architecture (`docs/ARCHITECTURE.md` & Implementation Master)  
> 2. `docs/DEVELOPMENT_PLAN.md` (Phase 23 Specification & Master Timeline)  
> 3. Business Requirements Directive: User Account Onboarding Model  
> 4. Existing Merged Repository & Database Schema (Phases 1–22)  
> 5. Existing Finalized Phase-Specific Plans & ADRs  
> 6. Existing Tests and Operational Documentation  

---

## 1. Executive Summary & Core Onboarding Model

Phase 23 delivers the institutional administration control plane and onboarding lifecycle for ProctorNet.

### 1.1 Strict Account Creation Authority
1. **Admin-Only Account Creation**:
   - **ONLY administrators (`ADMIN` role)** can create `STUDENT` and `FACULTY` accounts.
   - Students **CANNOT** self-register or create Student accounts.
   - Faculty **CANNOT** self-register or create Faculty accounts.
   - **Zero Public Self-Registration**: There is no public registration flow for Student or Faculty roles. The platform does not expose self-service account registration for candidate or academic roles.
   - Organization configuration enforces `allowSelfRegistration = false` by default. Even if an organization setting exists for future extensibility, it **strictly must not permit** Student or Faculty account creation in Phase 23.
2. **Creation Modalities**:
   - **Manual Single Account Creation**: Admin inputs bare minimum identifiers (USN, Name, Email for Students; Employee ID, Name, Email for Faculty). Server generates a cryptographically secure temporary password.
   - **Bulk Excel (.xlsx / .xls) / CSV Import**: Admin uploads an Excel roster containing identifiers and emails. Server performs duplicate detection, creates accounts, and returns a controlled, one-time credentials export.

---

## 2. Account State vs. Verification State Model

ProctorNet maintains a strict two-dimensional orthogonal model for user accounts. **Zero new account states are introduced.**

```
+-----------------------------------------------------------------------------------+
| DIMENSION 1: Authoritative Account Lifecycle State (Durable System State)         |
| [ ACTIVE ]             [ LOCKED ]            [ SUSPENDED ]          [ DISABLED ]  |
+-----------------------------------------------------------------------------------+
                                          X
+-----------------------------------------------------------------------------------+
| DIMENSION 2: Identity & Onboarding Verification Status (Academic Eligibility Gate)|
| [ UNVERIFIED ]         [ PENDING ]           [ VERIFIED ]           [ REJECTED ]  |
+-----------------------------------------------------------------------------------+
                                          X
+-----------------------------------------------------------------------------------+
| DIMENSION 3: Credential Governance Flag                                           |
| [ must_change_password = TRUE ]       |      [ must_change_password = FALSE ]     |
+-----------------------------------------------------------------------------------+
```

### 2.1 Authoritative Account States (Dimension 1)
- **`ACTIVE`**: Normal operational system state. Account is valid and can authenticate.
- **`LOCKED`**: Temporary automated authentication lockout triggered by $\ge 5$ consecutive failed password attempts. Automatically clears upon cooldown (15 minutes), manual admin unlock, or password reset.
- **`SUSPENDED`**: Persistent, reversible administrative hold. All active sessions are immediately revoked. Authentication is blocked.
- **`DISABLED`**: Persistent terminal administrative deactivation. All active sessions are immediately revoked. Authentication is blocked.

### 2.2 Verification & Onboarding States (Dimension 2)
- **`UNVERIFIED`**: Initial state upon admin creation. Account exists, but the user has not completed onboarding.
- **`PENDING`**: User has authenticated with temporary credentials, changed their password, completed required profile details, and submitted onboarding. Awaiting administrative review.
- **`VERIFIED`**: Administrator has reviewed and approved the onboarding submission. Normal dashboard and operational examination/authoring capabilities are unlocked.
- **`REJECTED`**: Administrator has reviewed and rejected the onboarding submission with mandatory review notes. Normal dashboard remains blocked; user is prompted to correct profile and resubmit.

---

## 3. End-to-End User Onboarding Lifecycles

### 3.1 Student / Candidate Lifecycle

```
[ ADMIN ACTION ]
Admin creates Student (USN, Name, Email)
  │
  ├─> DB: status=ACTIVE, verification_status=UNVERIFIED, must_change_password=TRUE
  └─> One-Time Credentials Displayed to Admin (Temporary Password)
        │
        ▼
[ STUDENT FIRST LOGIN ]
Student enters Email + Temporary Password
  │
  ├─> Backend verifies temporary password
  ├─> Backend detects must_change_password = TRUE
  ├─> Server-side Gate: Blocks /api/v1/candidate/dashboard, /api/v1/exams, /api/v1/sessions
  └─> Frontend routes student strictly to /onboarding/password-change
        │
        ▼
[ PASSWORD CHANGE ]
Student submits new password conforming to security policy
  │
  ├─> Backend hashes new password (bcrypt), sets must_change_password = FALSE
  └─> Frontend routes student to /onboarding/student-profile
        │
        ▼
[ PROFILE & IDENTITY ONBOARDING ]
Student completes required academic details:
- Department (e.g., Computer Science)
- Semester (e.g., 5)
- Phone number
- Identity acknowledgement / baseline metadata
  │
  ├─> Student clicks "Submit Onboarding"
  ├─> Backend validates profile data, updates student_profiles
  ├─> Backend transitions verification_status = PENDING
  └─> Emits immutable audit event USER_ONBOARDING_SUBMITTED
        │
        ▼
[ VERIFICATION PENDING GATE ]
Student dashboard access remains BLOCKED server-side and client-side
Student is presented with "Verification Pending" screen
  │
  ▼
[ ADMIN VERIFICATION QUEUE ]
Admin reviews pending student in /admin/verifications
  │
  ├──> [ REJECT ] (with mandatory review notes)
  │      ├─> DB: verification_status = REJECTED, verification_notes = "..."
  │      ├─> Audit event: ADMIN_VERIFICATION_REJECTED
  │      └─> Student sees "Verification Rejected" with notes and "Resubmit" button
  │
  └──> [ APPROVE ]
         ├─> DB: verification_status = VERIFIED, verification_notes = "..."
         ├─> Audit event: ADMIN_VERIFICATION_APPROVED
         └─> Student unlocks full Candidate Portal & Examination Dashboard!
```

### 3.2 Faculty / Instructor Lifecycle

```
[ ADMIN ACTION ]
Admin creates Faculty (Employee ID, Name, Email)
  │
  ├─> DB: status=ACTIVE, verification_status=UNVERIFIED, must_change_password=TRUE
  └─> One-Time Credentials Displayed to Admin (Temporary Password)
        │
        ▼
[ FACULTY FIRST LOGIN ]
Faculty enters Email + Temporary Password
  │
  ├─> Backend detects must_change_password = TRUE
  ├─> Server-side Gate: Blocks /api/v1/faculty/* operational authoring routes
  └─> Frontend routes faculty strictly to /onboarding/password-change
        │
        ▼
[ PASSWORD CHANGE ]
Faculty submits new password
  │
  ├─> Backend updates password hash, sets must_change_password = FALSE
  └─> Frontend routes faculty to /onboarding/faculty-profile
        │
        ▼
[ BASIC FACULTY DETAILS ONBOARDING ]
Faculty completes required academic information:
- Department (e.g., Information Science)
- Designation (e.g., Associate Professor)
- Phone number
*(Note: Zero student ID-document or biometric face onboarding for Faculty)*
  │
  ├─> Faculty clicks "Submit Profile"
  ├─> Backend updates faculty_profiles, sets verification_status = PENDING
  └─> Emits audit event USER_ONBOARDING_SUBMITTED
        │
        ▼
[ VERIFICATION PENDING GATE ]
Faculty dashboard access remains BLOCKED server-side and client-side
Faculty is presented with "Verification Pending" screen
  │
  ▼
[ ADMIN VERIFICATION QUEUE ]
Admin reviews and verifies Faculty credentials
  │
  ├──> [ REJECT ]: verification_status = REJECTED (Access remains blocked)
  │
  └──> [ APPROVE ]: verification_status = VERIFIED
         └─> Faculty unlocks full Faculty Portal (Authoring, Sessions, Grading)!
```

---

## 4. Server-Side Dashboard Access Gating

Access gating is **strictly enforced server-side** on API routes and cannot be bypassed by client-side tampering, direct URL manipulation, or replaying JWTs.

### 4.1 Authoritative Access Predicates
For any protected domain endpoint (e.g., `/api/v1/exams/*`, `/api/v1/sessions/*`, `/api/v1/attempts/*`, `/api/v1/faculty/*`, `/api/v1/candidate/*`):

```
FUNCTION CheckAccessGate(user, requestedRoute):
    // 1. Account Lifecycle Check
    IF user.status != 'ACTIVE':
        THROW 403 Forbidden ("ACCOUNT_NOT_ACTIVE: Account is " + user.status)

    // 2. Forced Password Change Gate
    IF user.must_change_password == TRUE:
        IF requestedRoute NOT IN ['/api/v1/users/me/first-login/change-password',
                                  '/api/v1/users/me/onboarding-status',
                                  '/api/v1/auth/logout']:
            THROW 403 Forbidden ("PASSWORD_CHANGE_REQUIRED: Complete first-login password change")

    // 3. Verification Gate for STUDENT and FACULTY roles
    IF 'STUDENT' IN user.roles OR 'FACULTY' IN user.roles:
        IF user.verification_status != 'VERIFIED':
            IF requestedRoute NOT IN ['/api/v1/users/me/onboarding-status',
                                      '/api/v1/users/me/onboarding',
                                      '/api/v1/users/me/first-login/change-password',
                                      '/api/v1/auth/logout',
                                      '/api/v1/auth/me']:
                IF user.verification_status == 'UNVERIFIED':
                    THROW 403 Forbidden ("ONBOARDING_REQUIRED: Complete profile onboarding")
                ELSE IF user.verification_status == 'PENDING':
                    THROW 403 Forbidden ("VERIFICATION_PENDING: Account pending administrator approval")
                ELSE IF user.verification_status == 'REJECTED':
                    THROW 403 Forbidden ("VERIFICATION_REJECTED: Account onboarding was rejected")

    // Access Granted: proceed to route handler
    RETURN ALLOW
```

### 4.2 Middleware Implementation
A dedicated middleware `requireVerifiedActiveUser` executes after `authenticate` and `requireRole`:
- Directly verifies current PostgreSQL state to eliminate stale JWT claims.
- Protects all operational candidate and faculty routes.

---

## 5. Phase Boundaries: Identity, Documents & Biometrics

| Onboarding Step / Capability | Phase 23 (This Phase) | Phase 24 | Phase 25 |
| :--- | :---: | :---: | :---: |
| **Account Creation & Role Assignment** | **Authoritative (Admin only)** | — | — |
| **Temporary Credential Generation** | **Authoritative (One-time)** | — | — |
| **Forced First-Login Password Change** | **Authoritative Gate** | — | — |
| **Student Profile Academic Completion** | **Authoritative (Dept, Sem, Phone)** | — | — |
| **Faculty Profile Academic Completion** | **Authoritative (Dept, Desig, Phone)** | — | — |
| **Onboarding State Machine (`UNVERIFIED` $\to$ `PENDING`)**| **Authoritative Gate** | — | — |
| **Server-Side Operational Dashboard Gating** | **Authoritative Enforcement** | — | — |
| **Admin Verification Queue (`PENDING` Review)** | **Authoritative Review** | — | — |
| **Student Government ID Document Upload** | — | **Authoritative (S3 PUT)** | — |
| **Magic-Byte Document Validation & OCR** | — | **Authoritative Engine** | — |
| **Side-by-Side Admin Document Review Drawer** | — | **Authoritative UI** | — |
| **Per-Student Exam Accommodations** | — | **Authoritative Config** | — |
| **Webcam Reference Face Enrollment** | — | — | **Authoritative Capture** |
| **Facial Embedding Storage & Matching** | — | — | **Authoritative Matching** |
| **Active Liveness & Anti-Spoofing Challenge** | — | — | **Authoritative Challenge** |

*Invariant*: In Phase 23, Student and Faculty accounts complete their academic profile onboarding and enter the `PENDING` queue. Admin reviews the submitted profile information and approves or rejects with documented notes. In Phase 24 and Phase 25, document and face assets attach to this exact verification contract without changing the underlying state machine.

> [!IMPORTANT]
> **Definitive Phase 24 & Phase 25 Boundary Invariant**:
> Actual Government ID processing remains in Phase 24, and actual face enrollment / biometric matching / liveness remains in Phase 25.
> Phase 23 MUST provide the onboarding state machine, UI/API contract, and verification gate required to attach those capabilities later.
> **DO NOT implement in Phase 23**: OCR, ID document storage, biometric embeddings, face matching, liveness, anti-spoofing.


---

## 6. Bulk Excel (.xlsx) Account Ingestion

The administrative portal provides a dedicated Excel file importer supporting Microsoft Excel workbooks (`.xlsx` and `.xls`) as well as standard CSV files.

### 6.1 Expected File Formats

#### Student Import Format (`students.xlsx`):
| Column Header | Required | Format / Validation | Example |
| :--- | :---: | :--- | :--- |
| `USN` or `EnrollmentNumber` | **YES** | String (alphanumeric, 4–32 chars, unique) | `1MS21CS042` |
| `Name` | **YES** | Full Name (2–128 chars) | `Aditi Sharma` |
| `Email` | **YES** | Valid institutional email address (unique) | `aditi.sharma@university.edu` |
| `Phone` | NO | Phone number format | `+919876543210` |

#### Faculty Import Format (`faculty.xlsx`):
| Column Header | Required | Format / Validation | Example |
| :--- | :---: | :--- | :--- |
| `EmployeeID` or `FacultyID` | **YES** | String (alphanumeric, 4–32 chars, unique) | `FAC-CS-104` |
| `Name` | **YES** | Full Name (2–128 chars) | `Dr. Rajesh Kumar` |
| `Email` | **YES** | Valid institutional email address (unique) | `rajesh.kumar@university.edu` |
| `Phone` | NO | Phone number format | `+919876543211` |

*Rule:* Password columns are **strictly forbidden** in Excel imports. The server generates secure temporary credentials.

### 6.2 Ingestion Workflow & Boundaries

```
[ ADMIN EXCEL UPLOAD ]
Admin uploads .xlsx file via /admin/users/bulk-import
  │
  ├─> Backend parses workbook using 'xlsx' (SheetJS)
  ├─> Validates headers and row formats
  ├─> In-memory and DB duplicate detection (Email, USN, Employee ID)
  │
  ▼
[ PREVIEW & VALIDATION REPORT ]
Backend returns parsing analysis:
- Total rows detected
- Valid rows preview
- Row-by-row error list (e.g. Row 7: Invalid email syntax; Row 14: Duplicate USN)
  │
  ▼
[ ADMIN CONFIRMATION ]
Admin chooses import mode:
- Mode A: 'Atomic' (rollback entire batch if any row is invalid)
- Mode B: 'Resilient Partial' (import all valid rows, skip invalid rows)
  │
  ▼
[ BATCH EXECUTION (PostgreSQL Transaction) ]
For each valid row:
- Generate cryptographically secure 16-character temporary password
- Hash password using bcrypt (10 rounds)
- Insert users: status = 'ACTIVE', verification_status = 'UNVERIFIED', must_change_password = TRUE
- Insert user_roles: role = 'STUDENT' or 'FACULTY'
- Insert student_profiles or faculty_profiles: bare identifier (department/semester NULL)
  │
  ▼
[ ONE-TIME CREDENTIALS EXPORT ]
Backend emits audit log USER_BULK_IMPORT
Backend returns one-time credentials manifest
Admin UI presents "Download Credentials Manifest (.xlsx / .csv)" button
Plaintext temporary passwords are NEVER stored and NEVER appear again.
```

> [!IMPORTANT]
> **Bulk Credential Transaction Safety Invariants**:
> - Temporary passwords are generated **only for rows that are actually committed** in the database transaction.
> - Never expose credentials for rolled-back rows.
> - Credentials manifest must correspond exactly to successfully created accounts.
> - Plaintext passwords remain strictly runtime-only and are never persisted in the database.
> - Plaintext passwords are never placed into normal audit logs.
> - Atomic import rollback results in zero credentials being issued for rolled-back accounts.


---

## 7. Database Architecture & Migrations

### 7.1 Migration: `018_user_administration.js`

1. **Alter `student_profiles` to Allow Initial Minimal Admin Provisioning**:
   ```sql
   -- Allow department and semester to be NULL during initial admin creation
   -- Completed by student during first-login onboarding
   ALTER TABLE student_profiles ALTER COLUMN department DROP NOT NULL;
   ALTER TABLE student_profiles ALTER COLUMN semester DROP NOT NULL;
   ```
2. **Alter `faculty_profiles` to Allow Initial Minimal Admin Provisioning**:
   ```sql
   -- Allow department and designation to be NULL during initial admin creation
   -- Completed by faculty during first-login onboarding
   ALTER TABLE faculty_profiles ALTER COLUMN department DROP NOT NULL;
   ALTER TABLE faculty_profiles ALTER COLUMN designation DROP NOT NULL;
   ```
3. **Update `users.status` Check Constraint**:
   ```sql
   DO $$
   DECLARE r RECORD;
   BEGIN
     FOR r IN (
       SELECT conname FROM pg_constraint
       WHERE conrelid = 'users'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status%'
     ) LOOP
       EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(r.conname);
     END LOOP;
   END $$;

   ALTER TABLE users ADD CONSTRAINT users_status_check
     CHECK (status IN ('ACTIVE', 'LOCKED', 'SUSPENDED', 'DISABLED'));
   ```
4. **Update `user_roles.role` Check Constraint**:
   ```sql
   DO $$
   DECLARE r RECORD;
   BEGIN
     FOR r IN (
       SELECT conname FROM pg_constraint
       WHERE conrelid = 'user_roles'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%role%'
     ) LOOP
       EXECUTE 'ALTER TABLE user_roles DROP CONSTRAINT ' || quote_ident(r.conname);
     END LOOP;
   END $$;

   ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
     CHECK (role IN ('STUDENT', 'FACULTY', 'INVIGILATOR', 'ADMIN', 'DEVELOPER'));
   ```
5. **Add Columns to `users` Table**:
   ```sql
   ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS status_reason TEXT;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED'
     CHECK (verification_status IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'));
   ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_notes TEXT;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_updated_at TIMESTAMPTZ;
   ```
6. **Create Table `organization_settings`**:
   ```sql
   CREATE TABLE IF NOT EXISTS organization_settings (
     setting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     institution_name VARCHAR(255) NOT NULL DEFAULT 'ProctorNet University',
     support_email VARCHAR(255) NOT NULL DEFAULT 'admin@proctornet.edu',
     allowed_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
     password_policy JSONB NOT NULL DEFAULT '{"minLength": 8, "requireUppercase": true, "requireLowercase": true, "requireNumber": true, "requireSpecial": true, "maxFailedAttempts": 5, "lockoutDurationMinutes": 15}'::jsonb,
     session_policy JSONB NOT NULL DEFAULT '{"accessTokenTtlMinutes": 15, "refreshTokenTtlDays": 7, "enforceSingleActiveSession": false}'::jsonb,
     feature_flags JSONB NOT NULL DEFAULT '{"allowSelfRegistration": false, "requireVerificationBeforeExam": true}'::jsonb,
     updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
   );

   INSERT INTO organization_settings (institution_name, support_email, feature_flags)
   SELECT 'ProctorNet University', 'admin@proctornet.edu', '{"allowSelfRegistration": false, "requireVerificationBeforeExam": true}'::jsonb
   WHERE NOT EXISTS (SELECT 1 FROM organization_settings);
   ```
7. **Performance Indexes**:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
   CREATE INDEX IF NOT EXISTS idx_users_verification_status ON users(verification_status);
   CREATE INDEX IF NOT EXISTS idx_users_created_at_desc ON users(created_at DESC);
   CREATE INDEX IF NOT EXISTS idx_users_name_lower ON users (LOWER(name));
   CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
   CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
   ```

---

## 8. Backend API Surface

### 8.1 Administrative Endpoints (`/api/v1/admin/`)

| Method | Route | Description | Auth / Guards | Audit Event |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/users` | List users with search, role/status/verification filters, pagination | `ADMIN` | — |
| `POST` | `/api/v1/admin/users` | Create single user (USN/Name/Email or EmpID/Name/Email) | `ADMIN` | `USER_CREATED` |
| `GET` | `/api/v1/admin/users/:id` | Fetch complete user record, profile, status, sessions | `ADMIN` | — |
| `PATCH` | `/api/v1/admin/users/:id` | Update profile fields | `ADMIN` | `USER_UPDATED` |
| `PATCH` | `/api/v1/admin/users/:id/status` | Transition account state (`ACTIVE`, `SUSPENDED`, `DISABLED`) | `ADMIN` + Last-Admin Guard | `USER_STATUS_<STATE>` |
| `POST` | `/api/v1/admin/users/:id/unlock` | Clear account lockout | `ADMIN` | `USER_UNLOCKED` |
| `POST` | `/api/v1/admin/users/:id/reset-password` | Issue temporary password, force reset, revoke sessions | `ADMIN` | `USER_PASSWORD_RESET` |
| `POST` | `/api/v1/admin/users/:id/roles` | Assign additional authoritative role | `ADMIN` | `USER_ROLE_ASSIGNED` |
| `DELETE` | `/api/v1/admin/users/:id/roles/:role` | Revoke authoritative role | `ADMIN` + Last-Admin Guard | `USER_ROLE_REVOKED` |
| `POST` | `/api/v1/admin/users/:id/revoke-sessions` | Revoke all active sessions | `ADMIN` | `USER_SESSIONS_REVOKED` |
| `GET` | `/api/v1/admin/verifications` | Query verification queue (`status=PENDING` default) | `ADMIN` | — |
| `PATCH` | `/api/v1/admin/users/:id/verification` | Review verification (`VERIFIED` / `REJECTED` with mandatory notes) | `ADMIN` | `ADMIN_VERIFICATION_<DECISION>` |
| `POST` | `/api/v1/admin/users/bulk-import/preview` | Preview & validate Excel/CSV file without persisting | `ADMIN` | — |
| `POST` | `/api/v1/admin/users/bulk-import` | Execute bulk Excel/CSV import | `ADMIN` | `USER_BULK_IMPORT` |
| `GET` | `/api/v1/admin/organization` | Fetch institutional settings & feature flags | `ADMIN` | — |
| `PUT` | `/api/v1/admin/organization` | Update institutional settings & feature flags | `ADMIN` | `ORGANIZATION_SETTINGS_UPDATED` |
| `GET` | `/api/v1/admin/audit` | Query administrative audit logs | `ADMIN` / `DEVELOPER` (Read) | — |

---

### 8.2 User Self-Service & Onboarding Endpoints (`/api/v1/users/me/`)

All self-service routes require valid authentication and scope strictly to the authenticated `req.user.userId`.

| Method | Route | Description | Allowed State | Audit Event |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users/me/onboarding-status` | Check account status, verification status, `mustChangePassword`, review notes | Authenticated (`ACTIVE`) | — |
| `POST` | `/api/v1/users/me/first-login/change-password` | Change temporary password to permanent credential | `must_change_password = TRUE` | `AUTH_PASSWORD_CHANGED` |
| `POST` | `/api/v1/users/me/onboarding` | Submit academic profile details (transitions `UNVERIFIED` $\to$ `PENDING`) | `must_change_password = FALSE`, `UNVERIFIED` or `REJECTED` | `USER_ONBOARDING_SUBMITTED` |

#### Payload Schemas:

##### `POST /api/v1/users/me/first-login/change-password`
```json
{
  "currentPassword": "TempPassword123!",
  "newPassword": "SecurePermanentPassword2026!"
}
```
*Action*: Verifies current temporary password, validates new password against complexity rules, updates `password_hash`, sets `must_change_password = FALSE`.

##### `POST /api/v1/users/me/onboarding` (Student)
```json
{
  "department": "Computer Science & Engineering",
  "semester": 5,
  "phone": "+919876543210",
  "metadata": {
    "identityAcknowledgement": true
  }
}
```
*Action*: Updates `student_profiles`, sets `verification_status = 'PENDING'`, logs `USER_ONBOARDING_SUBMITTED`.

##### `POST /api/v1/users/me/onboarding` (Faculty)
```json
{
  "department": "Information Science",
  "designation": "Associate Professor",
  "phone": "+919876543211",
  "metadata": {}
}
```
*Action*: Updates `faculty_profiles`, sets `verification_status = 'PENDING'`, logs `USER_ONBOARDING_SUBMITTED`.

---

## 9. Frontend Architecture & User Experience

### 9.1 Administrator Portal (`/admin/`)

1. **Create User (`/admin/users/create`)**:
   - Radio toggle: Student vs Faculty.
   - For **Student**: USN / Enrollment Number, Name, Email. (Phone optional).
   - For **Faculty**: Employee ID, Name, Email. (Phone optional).
   - *Zero full profile fields required from Admin.*
   - Success modal displays username/USN, email, and generated temporary password with a prominent "Copy to Clipboard" button and security warning.
2. **Bulk Excel Import (`/admin/users/bulk-import`)**:
   - Drag-and-drop zone accepting `.xlsx`, `.xls`, `.csv`.
   - Links to download official Student and Faculty Excel templates.
   - Parse & Preview grid displaying valid and invalid rows before commitment.
   - Import mode toggle (`Atomic` vs `Resilient Partial`).
   - Summary results card and "Download Credentials Manifest (.xlsx / .csv)" button.
3. **Verification Queue (`/admin/verifications`)**:
   - Filterable table of accounts with status `PENDING` (and filter options for `UNVERIFIED`, `REJECTED`, `VERIFIED`).
   - Displays user details, role, identifier (USN or Employee ID), submitted department/semester/designation, submission timestamp.
   - Action buttons: "Approve Verification" and "Reject Verification".
   - Approval/Rejection modal requiring mandatory reviewer notes.
4. **User Management (`/admin/users`)**:
   - Full registry with filter pills for Role, Status (`ACTIVE`, `LOCKED`, `SUSPENDED`, `DISABLED`), and Verification (`UNVERIFIED`, `PENDING`, `VERIFIED`, `REJECTED`).
5. **User Detail (`/admin/users/:id`)**:
   - Comprehensive profile, role, status management, credential reset, session revocation, and verification override card.
6. **Organization Settings (`/admin/organization`)**:
   - Displays institutional profile and policies with `allowSelfRegistration = false` locked or clearly disabled.
7. **Administrative Audit Viewer (`/admin/audit`)**:
   - Searchable, filterable audit log viewer.

---

### 9.2 Candidate & Faculty Onboarding Views

1. **Forced Password Change Screen (`/onboarding/password-change`)**:
   - Displayed immediately if `mustChangePassword === true`.
   - Cannot navigate away; blocks access to all portals.
   - Real-time password complexity checklist.
2. **Student Profile Completion Screen (`/onboarding/student-profile`)**:
   - Pre-fills read-only USN, Name, and Email.
   - Prompts for Department, Semester (1–12), and Phone.
   - Submits onboarding and routes to Verification Pending screen.
3. **Faculty Profile Completion Screen (`/onboarding/faculty-profile`)**:
   - Pre-fills read-only Employee ID, Name, and Email.
   - Prompts for Department, Designation, and Phone.
   - Submits onboarding and routes to Verification Pending screen.
4. **Verification Pending Screen (`/onboarding/verification-pending`)**:
   - Clear institutional messaging: "Your academic onboarding has been submitted and is currently pending administrative verification."
   - Displays submitted details for review.
   - "Refresh Status" button.
   - Automatic redirect to portal once `verification_status === 'VERIFIED'`.
5. **Verification Rejected Screen (`/onboarding/verification-rejected`)**:
   - Displays rejection reason provided by admin review notes.
   - "Update & Resubmit Profile" button returning user to profile completion form.

---

## 10. Multi-Level Testing & Security Strategy

### Level 1: Domain & Validation Unit Tests
- `userStateMachine.test.js`: Validates allowed transitions across account states and verification states.
- `userInvariants.test.js`: Validates last-admin protection and self-target guards.
- `excelParser.test.js`: Validates `.xlsx` and `.csv` parsing, header variations, missing columns, malformed emails, and duplicate detection.

### Level 2: Repository & Service Integration Tests
- `userRepository.test.js`: Minimal provisioning queries (inserting user with USN/Employee ID only, leaving department/semester NULL).
- `userService.test.js`: Transactional user creation, temporary password generation, session revocation, and audit logging.
- `onboardingService.test.js`: Profile submission updating `student_profiles`/`faculty_profiles` and transitioning verification state to `PENDING`.
- `adminVerificationService.test.js`: Approval and rejection logic with mandatory review notes and audit records.

### Level 3: API Integration & 20 Mandatory Security Tests

The test suite in `backend/tests/integration/userAdminSecurity.test.js` explicitly proves:

1. **Student Account Creation Blocked**: Student cannot create another Student or Faculty account (`403 Forbidden`).
2. **Faculty Account Creation Blocked**: Faculty cannot create another Student or Faculty account (`403 Forbidden`).
3. **Invigilator Account Creation Blocked**: Invigilator receives `403 Forbidden` on user creation routes.
4. **Developer Account Creation Blocked**: Developer receives `403 Forbidden` on user creation routes.
5. **Admin Authority Enforced**: Only `ADMIN` role can execute user creation and bulk import.
6. **Unverified Student Dashboard Access Blocked**: Unverified student receives `403 Forbidden` (`ONBOARDING_REQUIRED`) on `/api/v1/exams`, `/api/v1/sessions`, `/api/v1/attempts`.
7. **Unverified Faculty Dashboard Access Blocked**: Unverified faculty receives `403 Forbidden` on `/api/v1/faculty/*` authoring routes.
8. **Pending Student Blocked from Dashboard**: Student with `verification_status = 'PENDING'` receives `403 Forbidden` (`VERIFICATION_PENDING`) on operational exam routes.
9. **Pending Faculty Blocked from Dashboard**: Faculty with `verification_status = 'PENDING'` receives `403 Forbidden` on operational authoring routes.
10. **Rejected Student Blocked from Dashboard**: Student with `verification_status = 'REJECTED'` receives `403 Forbidden` (`VERIFICATION_REJECTED`) on operational exam routes.
11. **Rejected Faculty Blocked from Dashboard**: Faculty with `verification_status = 'REJECTED'` receives `403 Forbidden` on operational authoring routes.
12. **Verified Student Access Granted**: Student with `status = 'ACTIVE'` and `verification_status = 'VERIFIED'` successfully accesses candidate portal and exam sessions.
13. **Verified Faculty Access Granted**: Faculty with `status = 'ACTIVE'` and `verification_status = 'VERIFIED'` successfully accesses faculty portal and exam authoring.
14. **Temporary Password Requires Change**: User with `must_change_password = TRUE` is rejected with `403 Forbidden` on all routes except password change and onboarding status.
15. **Temporary Password Invalidated After Change**: Once password is changed, the temporary password cannot authenticate again.
16. **Password Hash Never Exposed**: Responses for single user, user list, and audit logs omit `password_hash`.
17. **Plaintext Temporary Password Not Persisted**: Verifying `users` table contains only bcrypt hash, never plaintext credentials.
18. **Data Scoping & Privilege Isolation**: Candidate onboarding metadata is strictly inaccessible to Developer and unauthorized roles.
19. **Admin Verification Decisions Audited**: Approving or rejecting verification writes an immutable audit record containing actor ID, target user, decision, and review notes.
20. **Direct API Access Bypasses Prevented**: Direct curl/supertest requests using valid JWT tokens fail server-side if verification status is not `VERIFIED`.

### Level 4: Frontend Component & Journey Tests
- `CreateUserPage.test.jsx`: Tests minimal USN/Name/Email creation and temporary password modal copy.
- `BulkImportPage.test.jsx`: Tests Excel file upload, preview parsing, summary KPIs, and credentials export.
- `OnboardingFlow.test.jsx`: Tests student first-login redirect $\to$ password change $\to$ profile completion $\to$ verification pending screen.
- `AdminVerificationPage.test.jsx`: Tests review queue table, approve button, reject modal with notes.

### Level 5: Full Regression Pre-Commit Sweep
- Full backend (`npm test` in `backend/`) and frontend (`npm test` in `frontend/`) regression test suites pass with zero regressions across Phases 1–22.

---

## 11. Deliverables Inventory

### Backend:
- `backend/migrations/018_user_administration.js`: Schema migration for nullable initial profiles, updated check constraints, new user columns, indexes, and `organization_settings`.
- `backend/src/domain/user/userStates.js`, `userRoles.js`, `userStateMachine.js`, `userInvariants.js`
- `backend/src/modules/users/user.repository.js`, `user.service.js`, `user.controller.js`, `user.schemas.js`, `user.routes.js`
- `backend/src/modules/users/excelParser.service.js`: Excel (`.xlsx`, `.xls`) and CSV ingestion engine.
- `backend/src/modules/users/orgSettings.repository.js`, `orgSettings.service.js`
- `backend/src/middleware/verificationGate.js`: Server-side gating middleware enforcing verification and password-change boundaries.
- Updates to `backend/src/routes/index.js`, `backend/src/modules/auth/auth.service.js`, `backend/src/domain/index.js`

### Frontend:
- `frontend/src/api/adminUsersApi.js` & `frontend/src/api/onboardingApi.js`
- `frontend/src/pages/admin/UserManagementPage.jsx`, `CreateUserPage.jsx`, `UserDetailPage.jsx`, `BulkImportPage.jsx`, `AdminVerificationPage.jsx`, `OrganizationSettingsPage.jsx`, `AdminAuditPage.jsx`
- `frontend/src/pages/onboarding/FirstLoginPasswordPage.jsx`, `StudentOnboardingPage.jsx`, `FacultyOnboardingPage.jsx`, `VerificationPendingPage.jsx`, `VerificationRejectedPage.jsx`
- `frontend/src/components/admin/UserTable.jsx`, `UserFilters.jsx`, `StatusChangeModal.jsx`, `ResetPasswordModal.jsx`, `RoleManagementCard.jsx`, `AuditDetailModal.jsx`, `VerificationReviewModal.jsx`
- Updates to `frontend/src/App.jsx` and `frontend/src/components/layout/Navbar.jsx`

---

## 12. Definition of Done (DoD)

Phase 23 executes through the strict development lifecycle:
$$\text{PLAN} \longrightarrow \text{REVIEW PLAN} \longrightarrow \text{APPROVE PLAN} \longrightarrow \text{IMPLEMENT} \longrightarrow \text{TEST} \longrightarrow \text{CODE REVIEW} \longrightarrow \text{COMMIT} \longrightarrow \text{PR} \longrightarrow \text{REVIEW PR} \longrightarrow \text{MERGE} \longrightarrow \text{MARK COMPLETE}$$

- **Zero Self-Registration**: Proved that Student and Faculty accounts can only be created by an Administrator.
- **Minimal Admin Provisioning**: Proved that Admin inputs only basic identifiers (USN or Employee ID, Name, Email) and receives a one-time temporary password.
- **Complete Onboarding Gating**: Proved that Student and Faculty users complete first-login password change and academic profile onboarding, and are strictly blocked server-side from operational dashboards until verified by an Admin.
- **Excel Bulk Import Operational**: Proved that `.xlsx` workbooks with 500+ records parse cleanly and create accounts in atomic or resilient modes.
- **Admin Verification Queue Functional**: Proved that Admins can review pending accounts, approve or reject with mandatory review notes, and audit all decisions.
- **Zero Backend-Only Features**: All admin and onboarding flows function end-to-end in the React frontend.
- **All 20 Security Tests Passing**: 100% green status across all test suites.
