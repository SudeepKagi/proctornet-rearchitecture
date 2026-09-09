# Phase 24: Candidate Onboarding, Document Verification & Per-Student Configuration — Implementation Plan

> **Authoritative Specification & Design Blueprint**  
> **Status**: IMPLEMENTED & VERIFIED (STOP at PR Review Gate)  
> **Repository Branch**: `feature/phase-24-candidate-onboarding`  
> **Authoritative Architecture Hierarchy**:  
> 1. Notion Step 13 Final Re-Architecture (13.5 State Decoupling, 13.7 Private S3 Storage, 13.17 Audit Immutability)  
> 2. `docs/DEVELOPMENT_PLAN.md`  
> 3. Existing Merged Repository (`main`)  
> 4. Existing Finalized Phase Plans & Documentation  
> 5. Existing Tests & Verification Artifacts  

---

## 1. Executive Summary

Phase 24 establishes the **Government ID Document Onboarding**, **Private S3 Document Storage & Validation Pipeline**, **Administrative Document Review & Preview Console**, and **Per-Student Accommodations & Configuration Engine** across the ProctorNet modular monolith.

Building upon the Phase 23 account provisioning and onboarding gate, Phase 24 enables candidates to securely submit government-issued identity documents (Passport, National ID, Driver's License, or Student ID), validates file signatures and MIME types against actual binary bytes, securely transfers binaries directly to private Amazon S3 storage via short-lived presigned PUT URLs, and provides platform administrators with an inspection console with side-by-side document preview and mandatory rejection reasoning.

Furthermore, Phase 24 introduces individualized per-student accommodations (time multipliers e.g. 1.25x, 1.5x, custom break allowances, assistive technology flags, and proctoring strictness overrides), which automatically and authoritatively scale examination attempt durations in the Phase 6 engine without client-side tampering risk.

---

## 2. Phase Boundaries

Phase 24 owns:
1. Candidate government/student identity-document onboarding.
2. Candidate-entered identity document metadata capture.
3. Private S3 object storage integration reusing Phase 15 storage primitives.
4. Short-lived presigned upload URLs (300s TTL).
5. Server-side upload confirmation and magic-byte signature validation (JPEG, PNG, PDF).
6. S3 abandoned / invalid upload lifecycle and synchronous cleanup.
7. Document lifecycle state machine (`PENDING_UPLOAD`, `PENDING`, `APPROVED`, `REJECTED`, `SUPERSEDED`).
8. Document replacement/resubmission after rejection.
9. Administrative document review queue and inspection console.
10. Secure short-lived presigned document preview (300s TTL).
11. Mandatory rejection notes.
12. Strict role authorization boundaries (Admin review only; Faculty/Invigilator/Developer zero government ID access).
13. Per-student accommodation/configuration (`student_configurations`).
14. Server-authoritative exam duration scaling based on approved configuration.
15. Student and Admin frontend flows and React-to-API wiring.
16. Sensitive metadata logging redaction and immutable audit logging.

---

## 3. Explicit Phase 23 Dependency

Phase 23 is the foundational prerequisite already merged into `main` (PR #21, commit `379598c`):
- Admin-only account creation for all 5 authoritative roles (`ADMIN`, `DEVELOPER`, `FACULTY`, `INVIGILATOR`, `STUDENT`).
- Disabled public self-registration (`POST /api/v1/auth/register` returns 403 `SELF_REGISTRATION_DISABLED`).
- 4-state account lifecycle: `ACTIVE`, `LOCKED`, `SUSPENDED`, `DISABLED`.
- Initial credential governance: 16-character temporary passwords and forced first-login password change (`must_change_password=TRUE`).
- Academic profile completion (`student_profiles`: department, semester, USN / enrollment number).
- Verification state machine (`UNVERIFIED`, `PENDING`, `VERIFIED`, `REJECTED`) and server-side route gate (`requireVerifiedActiveUser`).
- Institutional settings (`organization_settings`) with locked `allowSelfRegistration = false`.

Phase 24 builds directly on top of these provisions without duplicating or redefining them.

---

## 4. Explicit Phase 25 Non-Scope

Phase 25 owns biometric face identity and anti-spoofing. The following capabilities are **STRICTLY NON-SCOPE** for Phase 24:
- **NO Face Enrollment**: Biometric reference templates, embeddings vectors, and facial landmarks belong exclusively to Phase 25.
- **NO Face Matching / Verification**: Cosine similarity against ID photos or reference images belongs to Phase 25.
- **NO Passive / Active Liveness Detection**: Real-time video challenge-response (blinking, head turns) belongs to Phase 25.
- **NO Anti-Spoofing / Presentation Attack Mitigation**: Belongs to Phase 25.
- **NO Optical Character Recognition (OCR)**: No external third-party paid OCR services.
- **NO Biometric Reference Storage**: No facial vector tables or AI scoring models.
- **NO Universal Identity Assurance Claims**: An approved government ID is an administrative verification record, not a biometric verification.

---

## 5. Architecture Overview

The system architecture follows the modular monolith pattern with PostgreSQL as the authoritative state authority, S3 as private object storage, REST API as the authoritative transport, and React SPA for candidate and admin user experiences.

```
Candidate Browser             Backend (Express Monolith)           Private S3 Vault
      │                                   │                               │
      │ 1. Request Presigned PUT          │                               │
      ├──────────────────────────────────>│                               │
      │    (Validate metadata, insert     │                               │
      │     doc as PENDING_UPLOAD)        │                               │
      │<──────────────────────────────────┤                               │
      │    Returns presignedUrl (300s)    │                               │
      │                                   │                               │
      │ 2. Direct Binary PUT              │                               │
      ├───────────────────────────────────┼──────────────────────────────>│
      │    (SigV4, ContentLength <= 10MB) │                               │
      │                                   │                               │
      │ 3. Confirm Document Upload        │                               │
      ├──────────────────────────────────>│                               │
      │                                   │ 4. Authoritative Validation   │
      │                                   ├──────────────────────────────>│
      │                                   │    HeadObject + Range Header  │
      │                                   │<──────────────────────────────┤
      │                                   │    Verify Magic Bytes         │
      │                                   │                               │
      │                                   │ 5. DB Atomic Transition       │
      │                                   │    doc: PENDING_UPLOAD->PENDING│
      │                                   │    user: UNVERIFIED->PENDING  │
      │<──────────────────────────────────┤                               │
      │    Confirmed (200 OK)             │                               │
```

---

## 6. SVG Architecture Diagram

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 620" width="100%" height="100%" style="background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <defs>
    <linearGradient id="primaryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <linearGradient id="surfaceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#047857"/>
    </linearGradient>
    <linearGradient id="warningGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#b45309"/>
    </linearGradient>
    <filter id="dropShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.4"/>
    </filter>
  </defs>

  <!-- Title -->
  <text x="480" y="38" text-anchor="middle" fill="#f8fafc" font-size="20" font-weight="700" letter-spacing="0.5">
    ProctorNet Phase 24: Document Onboarding &amp; Per-Student Configuration Architecture
  </text>
  <text x="480" y="60" text-anchor="middle" fill="#94a3b8" font-size="12">
    Direct S3 Presigned Upload Pipeline, Magic Byte Validation, Admin Review Queue &amp; Accommodation Engine
  </text>

  <!-- Section 1: Candidate Upload Journey -->
  <g transform="translate(30, 85)" filter="url(#dropShadow)">
    <rect width="270" height="495" rx="8" fill="url(#surfaceGrad)" stroke="#334155" stroke-width="1.5"/>
    <rect width="270" height="32" rx="8" fill="#1e293b"/>
    <text x="135" y="21" text-anchor="middle" fill="#60a5fa" font-size="13" font-weight="600">
      1. Candidate Document Onboarding
    </text>

    <g transform="translate(15, 48)">
      <rect width="240" height="74" rx="6" fill="#0f172a" stroke="#1e293b"/>
      <text x="12" y="22" fill="#f8fafc" font-size="12" font-weight="600">1. Metadata &amp; Presign Request</text>
      <text x="12" y="40" fill="#94a3b8" font-size="10">POST /api/v1/candidate/identity/document-url</text>
      <text x="12" y="55" fill="#64748b" font-size="10">Payload: docType, number, name, file info</text>
      <circle cx="225" cy="20" r="8" fill="#3b82f6"/>
      <text x="225" y="24" text-anchor="middle" fill="#fff" font-size="9" font-weight="700">1</text>
    </g>

    <g transform="translate(15, 134)">
      <rect width="240" height="74" rx="6" fill="#0f172a" stroke="#1e293b"/>
      <text x="12" y="22" fill="#f8fafc" font-size="12" font-weight="600">2. Direct Binary Transfer (S3)</text>
      <text x="12" y="40" fill="#94a3b8" font-size="10">PUT {presignedUploadUrl}</text>
      <text x="12" y="55" fill="#64748b" font-size="10">Direct to private S3 (SigV4, 300s TTL)</text>
      <circle cx="225" cy="20" r="8" fill="#3b82f6"/>
      <text x="225" y="24" text-anchor="middle" fill="#fff" font-size="9" font-weight="700">2</text>
    </g>

    <g transform="translate(15, 220)">
      <rect width="240" height="74" rx="6" fill="#0f172a" stroke="#1e293b"/>
      <text x="12" y="22" fill="#f8fafc" font-size="12" font-weight="600">3. Confirmation &amp; Validation</text>
      <text x="12" y="40" fill="#94a3b8" font-size="10">POST /api/v1/candidate/identity/confirm-document</text>
      <text x="12" y="55" fill="#64748b" font-size="10">Triggers magic byte &amp; size checks</text>
      <circle cx="225" cy="20" r="8" fill="#3b82f6"/>
      <text x="225" y="24" text-anchor="middle" fill="#fff" font-size="9" font-weight="700">3</text>
    </g>

    <g transform="translate(15, 306)">
      <rect width="240" height="74" rx="6" fill="#0f172a" stroke="#1e293b"/>
      <text x="12" y="22" fill="#f8fafc" font-size="12" font-weight="600">4. Verification State Tracking</text>
      <text x="12" y="40" fill="#94a3b8" font-size="10">GET /api/v1/candidate/identity/status</text>
      <text x="12" y="55" fill="#64748b" font-size="10">Displays PENDING, APPROVED, or REJECTED</text>
      <circle cx="225" cy="20" r="8" fill="#3b82f6"/>
      <text x="225" y="24" text-anchor="middle" fill="#fff" font-size="9" font-weight="700">4</text>
    </g>

    <g transform="translate(15, 392)">
      <rect width="240" height="74" rx="6" fill="#0f172a" stroke="#1e293b"/>
      <text x="12" y="22" fill="#f8fafc" font-size="12" font-weight="600">5. Resubmission on Rejection</text>
      <text x="12" y="40" fill="#94a3b8" font-size="10">Replaces SUPERSEDED document</text>
      <text x="12" y="55" fill="#64748b" font-size="10">Transitions back to PENDING review</text>
      <circle cx="225" cy="20" r="8" fill="#3b82f6"/>
      <text x="225" y="24" text-anchor="middle" fill="#fff" font-size="9" font-weight="700">5</text>
    </g>
  </g>

  <!-- Section 2: Core Platform & State Machine -->
  <g transform="translate(345, 85)" filter="url(#dropShadow)">
    <rect width="270" height="495" rx="8" fill="url(#surfaceGrad)" stroke="#334155" stroke-width="1.5"/>
    <rect width="270" height="32" rx="8" fill="#1e293b"/>
    <text x="135" y="21" text-anchor="middle" fill="#34d399" font-size="13" font-weight="600">
      2. Authoritative PostgreSQL Core
    </text>

    <!-- Table 1 -->
    <g transform="translate(15, 48)">
      <rect width="240" height="120" rx="6" fill="#0f172a" stroke="#059669" stroke-width="1.2"/>
      <text x="12" y="22" fill="#34d399" font-size="11" font-weight="700">student_identity_documents</text>
      <text x="12" y="40" fill="#cbd5e1" font-size="10">• document_id (UUID PK)</text>
      <text x="12" y="55" fill="#cbd5e1" font-size="10">• user_id (FK users) + doc_type</text>
      <text x="12" y="70" fill="#cbd5e1" font-size="10">• s3_bucket + s3_key (Opaque)</text>
      <text x="12" y="85" fill="#cbd5e1" font-size="10">• magic_bytes_verified (BOOLEAN)</text>
      <text x="12" y="100" fill="#cbd5e1" font-size="10">• verification_status + reviewer_notes</text>
    </g>

    <!-- Table 2 -->
    <g transform="translate(15, 180)">
      <rect width="240" height="120" rx="6" fill="#0f172a" stroke="#059669" stroke-width="1.2"/>
      <text x="12" y="22" fill="#34d399" font-size="11" font-weight="700">student_configurations</text>
      <text x="12" y="40" fill="#cbd5e1" font-size="10">• student_id (UUID PK FK users)</text>
      <text x="12" y="55" fill="#cbd5e1" font-size="10">• extra_time_multiplier (1.00x - 3.00x)</text>
      <text x="12" y="70" fill="#cbd5e1" font-size="10">• break_allowance_minutes + max_breaks</text>
      <text x="12" y="85" fill="#cbd5e1" font-size="10">• assistive_technology (JSONB)</text>
      <text x="12" y="100" fill="#cbd5e1" font-size="10">• proctoring_strictness (STANDARD...)</text>
    </g>

    <!-- Security & Storage Invariants -->
    <g transform="translate(15, 312)">
      <rect width="240" height="155" rx="6" fill="#0f172a" stroke="#1e293b"/>
      <text x="12" y="20" fill="#f8fafc" font-size="11" font-weight="600">Storage &amp; Validation Engine</text>
      <text x="12" y="38" fill="#94a3b8" font-size="10">✓ JPEG: FF D8 FF</text>
      <text x="12" y="52" fill="#94a3b8" font-size="10">✓ PNG: 89 50 4E 47 0D 0A 1A 0A</text>
      <text x="12" y="66" fill="#94a3b8" font-size="10">✓ PDF: %PDF (25 50 44 46)</text>
      <text x="12" y="80" fill="#94a3b8" font-size="10">✓ Max file size: 10 MB</text>
      <text x="12" y="98" fill="#e2e8f0" font-size="10" font-weight="600">Attempt Duration Engine (Phase 6):</text>
      <text x="12" y="112" fill="#38bdf8" font-size="10">effectiveDuration =</text>
      <text x="12" y="126" fill="#38bdf8" font-size="10">  round(exam.duration * multiplier)</text>
      <text x="12" y="142" fill="#64748b" font-size="9">Server-authoritative calculation</text>
    </g>
  </g>

  <!-- Section 3: Admin Review & Configuration Console -->
  <g transform="translate(660, 85)" filter="url(#dropShadow)">
    <rect width="270" height="495" rx="8" fill="url(#surfaceGrad)" stroke="#334155" stroke-width="1.5"/>
    <rect width="270" height="32" rx="8" fill="#1e293b"/>
    <text x="135" y="21" text-anchor="middle" fill="#fbbf24" font-size="13" font-weight="600">
      3. Admin Review &amp; Configuration
    </text>

    <!-- Admin Workflows -->
    <g transform="translate(15, 48)">
      <rect width="240" height="85" rx="6" fill="#0f172a" stroke="#1e293b"/>
      <text x="12" y="20" fill="#f8fafc" font-size="11" font-weight="600">Identity Verification Queue</text>
      <text x="12" y="36" fill="#94a3b8" font-size="10">GET /api/v1/admin/verifications</text>
      <text x="12" y="50" fill="#64748b" font-size="10">Filters by role, status, document presence</text>
      <text x="12" y="66" fill="#64748b" font-size="10">Shows candidate USN, name, dept</text>
    </g>

    <g transform="translate(15, 145)">
      <rect width="240" height="85" rx="6" fill="#0f172a" stroke="#1e293b"/>
      <text x="12" y="20" fill="#f8fafc" font-size="11" font-weight="600">Secure Document Preview</text>
      <text x="12" y="36" fill="#94a3b8" font-size="10">GET /api/v1/admin/students/:id/document-preview</text>
      <text x="12" y="50" fill="#64748b" font-size="10">Generates short-lived GET URL (300s TTL)</text>
      <text x="12" y="66" fill="#64748b" font-size="10">Audited access; inline browser rendering</text>
    </g>

    <g transform="translate(15, 242)">
      <rect width="240" height="85" rx="6" fill="#0f172a" stroke="#1e293b"/>
      <text x="12" y="20" fill="#f8fafc" font-size="11" font-weight="600">Review Decision &amp; Audit</text>
      <text x="12" y="36" fill="#94a3b8" font-size="10">PATCH /api/v1/admin/students/:id/verification</text>
      <text x="12" y="50" fill="#64748b" font-size="10">APPROVED: transitions user to VERIFIED</text>
      <text x="12" y="66" fill="#64748b" font-size="10">REJECTED: requires mandatory notes</text>
    </g>

    <g transform="translate(15, 339)">
      <rect width="240" height="127" rx="6" fill="#0f172a" stroke="#1e293b"/>
      <text x="12" y="20" fill="#f8fafc" font-size="11" font-weight="600">Per-Student Accommodations</text>
      <text x="12" y="36" fill="#94a3b8" font-size="10">GET/PUT /api/v1/admin/students/:id/configuration</text>
      <text x="12" y="52" fill="#64748b" font-size="10">• Time Multiplier (e.g. 1.5x for dyslexia)</text>
      <text x="12" y="66" fill="#64748b" font-size="10">• Rest Breaks (e.g. 15 min / 2 breaks)</text>
      <text x="12" y="80" fill="#64748b" font-size="10">• Assistive Tech (screen readers)</text>
      <text x="12" y="94" fill="#64748b" font-size="10">• Medical Proctoring Exemption</text>
      <text x="12" y="110" fill="#10b981" font-size="9" font-weight="600">Immutable Audit: STUDENT_CONFIGURATION_UPDATED</text>
    </g>
  </g>

  <!-- Connectors / Directional Flow -->
  <path d="M 300 135 L 345 135" stroke="#3b82f6" stroke-width="2" stroke-dasharray="4"/>
  <path d="M 300 255 L 345 255" stroke="#10b981" stroke-width="2"/>
  <path d="M 615 285 L 660 285" stroke="#fbbf24" stroke-width="2"/>
</svg>

---

## 7. Data Flow

### A. Candidate Document Submission
1. Candidate navigates to `/onboarding/document-upload`.
2. Candidate fills in document metadata (Type, Number, Legal Name, Expiry, Country) and selects file.
3. Client validates format (JPEG/PNG/PDF) and size ($\le 10$ MB).
4. Client calls `POST /api/v1/candidate/identity/document-url`.
5. Backend hashes document number (SHA-256), records last 4 digits, drops plaintext from persistence, inserts document record with status `PENDING_UPLOAD`, and generates presigned PUT URL (300s TTL) using opaque key `identity-documents/${documentId}/${randomHex}.${ext}`.
6. Client transfers binary directly to S3 via HTTP PUT `{presignedUploadUrl}`.
7. Client calls `POST /api/v1/candidate/identity/confirm-document`.
8. Backend verifies S3 object via `headEvidenceObject` (existence, length $\le 10$ MB) and `getEvidenceObjectHeader` (magic byte signature).
9. If valid: Backend atomically transitions document to `PENDING` and `users.verification_status` to `PENDING`. Emits `STUDENT_IDENTITY_DOCUMENT_SUBMITTED` audit log.
10. If invalid: Backend immediately calls S3 delete, purges/marks invalid, and rejects confirmation with 400.

### B. Admin Document Review
1. Admin accesses `/admin/verifications` queue.
2. Admin opens candidate dossier (`GET /api/v1/admin/students/:id/verification`).
3. Admin requests document preview (`GET /api/v1/admin/students/:id/document-preview`).
4. Backend generates short-lived presigned GET URL (300s TTL, inline disposition) and logs `ADMIN_IDENTITY_DOCUMENT_PREVIEWED`.
5. Admin inspects document in side-by-side modal.
6. Admin approves or rejects:
   - **Approve**: Calls `PATCH /api/v1/admin/students/:id/verification` with `decision: 'APPROVED'`. Document becomes `APPROVED`, user becomes `VERIFIED`. Emits `ADMIN_VERIFICATION_APPROVED`.
   - **Reject**: Enforces mandatory `reviewNotes`. Document becomes `REJECTED`, user becomes `REJECTED`. Emits `ADMIN_VERIFICATION_REJECTED`.

### C. Admin Accommodation Management
1. Admin opens `/admin/students/:id/configuration`.
2. Admin configures extra time multiplier (1.00x–3.00x), break allowances, assistive tech flags, and proctoring strictness.
3. Client calls `PUT /api/v1/admin/students/:id/configuration`.
4. Backend validates domain invariants, upserts `student_configurations`, and logs `STUDENT_CONFIGURATION_UPDATED`.

### D. Exam Attempt Duration Scaling
1. Student starts exam attempt (`POST /api/v1/sessions/:id/attempts`).
2. Attempt initialization transaction queries `student_configurations` for candidate.
3. If approved multiplier exists (e.g. 1.50):
   `effectiveDurationMinutes = Math.round(exam.duration_minutes * multiplier)`.
4. Authoritative expiration is set to `LEAST(serverNow + effectiveDurationMs, scheduledEndTime)`.
5. Student cannot alter or submit duration values; scaling is 100% server-authoritative.

---

## 8. Database Schema & Migration Strategy

### Migration `019_student_documents_and_configurations.js`

```sql
-- 1. Student Identity Documents Table
CREATE TABLE IF NOT EXISTS student_identity_documents (
  document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  document_type VARCHAR(32) NOT NULL
    CHECK (document_type IN ('PASSPORT', 'NATIONAL_ID', 'DRIVING_LICENSE', 'STUDENT_ID')),
  document_number_hash VARCHAR(64) NOT NULL,
  document_number_last4 VARCHAR(8) NOT NULL,
  full_name_on_document VARCHAR(255) NOT NULL,
  date_of_birth DATE,
  expiry_date DATE,
  issue_country VARCHAR(64),
  s3_bucket VARCHAR(128) NOT NULL,
  s3_key VARCHAR(512) NOT NULL UNIQUE,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(64) NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
  byte_size INT NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  magic_bytes_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_UPLOAD'
    CHECK (verification_status IN ('PENDING_UPLOAD', 'PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
  reviewer_notes TEXT,
  reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Per-Student Configuration & Accommodations Table (Strict Authoritative Scope)
CREATE TABLE IF NOT EXISTS student_configurations (
  student_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  extra_time_multiplier NUMERIC(3, 2) NOT NULL DEFAULT 1.00
    CHECK (extra_time_multiplier >= 1.00 AND extra_time_multiplier <= 3.00),
  break_allowance_minutes INT NOT NULL DEFAULT 0
    CHECK (break_allowance_minutes >= 0 AND break_allowance_minutes <= 120),
  max_breaks_allowed INT NOT NULL DEFAULT 0
    CHECK (max_breaks_allowed >= 0 AND max_breaks_allowed <= 10),
  assistive_technology JSONB NOT NULL DEFAULT '{"screenReader": false, "speechToText": false, "keyboardOnly": false}'::jsonb,
  proctoring_strictness VARCHAR(32) NOT NULL DEFAULT 'STANDARD'
    CHECK (proctoring_strictness IN ('STANDARD', 'RELAXED', 'STRICT', 'MEDICAL_EXEMPTION')),
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Indexes for Optimized Lookup and Review Queuing
CREATE INDEX IF NOT EXISTS idx_student_docs_user_status ON student_identity_documents(user_id, verification_status);
CREATE INDEX IF NOT EXISTS idx_student_docs_status_submitted ON student_identity_documents(verification_status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_docs_number_hash ON student_identity_documents(document_number_hash);
CREATE INDEX IF NOT EXISTS idx_student_config_strictness ON student_configurations(proctoring_strictness);
```

---

## 9. State Machines & Separation of Verification States

### A. Clear Decoupling of Two Verification Concepts

1. **`users.verification_status`**: Candidate's overall account onboarding / verification gate.
   - States: `UNVERIFIED`, `PENDING`, `VERIFIED`, `REJECTED`.
   - Controls access to student exam dashboard and session entry (`requireVerifiedActiveUser`).
2. **`student_identity_documents.verification_status`**: Specific document lifecycle.
   - States: `PENDING_UPLOAD`, `PENDING`, `APPROVED`, `REJECTED`, `SUPERSEDED`.
   - Tracks a specific submitted document attempt.

### B. State Transition Consistency & Synchronization Rules

| Trigger Event | `student_identity_documents.verification_status` | `users.verification_status` | Atomic Transaction Consistency Rule |
|---|---|---|---|
| Initiate Presign | `PENDING_UPLOAD` | Remains unchanged | Document row created; user gate unaffected. |
| Confirmation Validated | `PENDING_UPLOAD` $\to$ `PENDING` | `UNVERIFIED` / `REJECTED` $\to$ `PENDING` | Atomically synchronized in DB transaction. |
| Admin Approves | `PENDING` $\to$ `APPROVED` | `PENDING` $\to$ `VERIFIED` | Atomically updated. `reviewed_by` and `reviewed_at` persisted. |
| Admin Rejects | `PENDING` $\to$ `REJECTED` | `PENDING` $\to$ `REJECTED` | Atomically updated with mandatory `reviewer_notes`. |
| Candidate Resubmits | Old doc: `REJECTED` $\to$ `SUPERSEDED`<br>New doc: `PENDING_UPLOAD` | Remains `REJECTED` until confirmation | **SUPERSEDED NEVER makes user VERIFIED.** User remains `REJECTED` until new upload is confirmed, then transitions to `PENDING`. |

### C. Forbidden State Transitions
- `APPROVED` $\to$ `REJECTED`: Forbidden (400 Conflict).
- `APPROVED` $\to$ `PENDING`: Forbidden.
- `SUPERSEDED` $\to$ `APPROVED` / `REJECTED`: Forbidden (inactive document).
- Document status NEVER modifies `users.status` (`ACTIVE`, `LOCKED`, `SUSPENDED`, `DISABLED`).

---

## 10. S3 Storage Architecture & Design

Reusing the established Phase 15 S3 storage infrastructure ([`backend/src/infrastructure/storage/s3Storage.js`](file:///c:/Projects/Online%20Examination%20System/backend/src/infrastructure/storage/s3Storage.js)):

1. **Private Bucket**: `config.AWS_S3_BUCKET` has public read blocked. No public bucket policies.
2. **Opaque Object Keys**:
   ```
   identity-documents/${documentId}/${randomHex16}.${ext}
   ```
   - **No `studentId` in the object key**: Prevents candidate ID exposure in S3 access logs, URLs, or storage metrics.
   - **No sequential user IDs or unmasked document numbers**: Purely cryptographically random UUID and hex nonce.
3. **Presigned PUT URL**:
   - Generated via `generatePresignedUploadUrl()`.
   - Explicit `ContentLength` constraint ($\le 10$ MB).
   - Scoped TTL: 300 seconds.
4. **Presigned GET URL**:
   - Generated via `generatePresignedDownloadUrl()`.
   - Inline disposition: `ResponseContentDisposition: 'inline'`.
   - Scoped TTL: 300 seconds.
   - Audited access.
5. **No Credential Leakage**: AWS IAM access keys are never transmitted to the browser.
6. **No Storage State Authority**: PostgreSQL is the single source of truth. S3 contains binary objects only.

---

## 11. Abandoned & Invalid Upload Cleanup Strategy

An S3 object alone **NEVER** constitutes a submitted or valid document.

### A. Failure Scenarios & Handling

| Scenario | Detection Point | Handling & S3 Cleanup Action | PostgreSQL State |
|---|---|---|---|
| Candidate never uploads | S3 / Presign Expiry | Presigned URL expires after 300 seconds. S3 has no object. | Row remains `PENDING_UPLOAD`. Marked `SUPERSEDED` when candidate initiates new upload. |
| Uploads empty file (0 bytes) | `confirm-document` via `headEvidenceObject` | Immediate synchronous S3 deletion via `deleteEvidenceObjectVersions`. | Returns 400 `INVALID_UPLOAD`. Document marked `REJECTED` or purged. |
| Uploads oversized file (> 10MB) | S3 PUT rejection or `headEvidenceObject` | S3 PUT rejected by policy or deleted immediately on confirmation check. | Returns 400 `FILE_TOO_LARGE`. Document marked `REJECTED`. |
| Wrong MIME type / corrupt file | `getEvidenceObjectHeader` (Range 16B) | Immediate synchronous S3 deletion via `deleteEvidenceObjectVersions`. | Returns 400 `INVALID_MAGIC_BYTES`. Document marked `REJECTED`. |
| Uploads binary but never calls confirm | Abandoned flow | Object remains in S3 unconfirmed. | Document row remains `PENDING_UPLOAD`. Does not advance candidate onboarding gate. |
| Candidate initiates new upload while `PENDING_UPLOAD` exists | `POST /document-url` | Prior unconfirmed `PENDING_UPLOAD` record is marked `SUPERSEDED`. Key scheduled for cleanup. | Clean state for new upload. |

### B. S3 Lifecycle Rule & Cleanup Invariants
- **Synchronous Deletion**: The backend immediately executes S3 deletion upon any failed confirmation attempt (empty, oversized, magic byte mismatch).
- **Asynchronous Garbage Collection**: S3 Lifecycle configuration rule: Objects under prefix `identity-documents/` older than 24 hours that are unconfirmed can be automatically expired by S3 bucket lifecycle rules.
- **Resilience**: If DB update succeeds but S3 cleanup fails during error handling, an error log with correlation ID is emitted; the orphan object is collected by the S3 24h lifecycle expiration rule.

---

## 12. Magic-Byte Signature Validation

Validation does not trust client file extensions or browser-declared MIME types. The backend fetches the first 16 bytes using an HTTP Range request (`bytes=0-15`) via `getEvidenceObjectHeader`:

| Format | Declared MIME Type | Expected Binary File Signatures (Magic Bytes) | Offset |
|---|---|---|---|
| **JPEG** | `image/jpeg` | `FF D8 FF` | Byte 0 |
| **PNG** | `image/png` | `89 50 4E 47 0D 0A 1A 0A` | Byte 0 |
| **PDF** | `application/pdf` | `25 50 44 46` (`%PDF`) | Byte 0 |

Any file whose leading bytes fail to match the authoritative signature for its declared format is immediately rejected with 400 `INVALID_FILE_SIGNATURE` and deleted from S3.

---

## 13. Security & Privacy Boundaries

1. **Private S3 Objects**: Public read access is blocked. No direct public URLs.
2. **Short-Lived URLs**: All presigned upload and preview URLs expire in 300 seconds.
3. **No IDOR**: Candidate endpoints verify `req.user.userId === studentId`. Accessing another candidate's document or config returns 403 Forbidden.
4. **Document Number Protection**: Plaintext document numbers are **NEVER** stored in the database and **NEVER** logged. A SHA-256 hash is stored for duplicate detection, and only the last 4 characters are stored for administrative verification.
5. **No Long-Lived Signed URLs in Client State**: Presigned URLs must not be stored in `localStorage`, `sessionStorage`, or IndexedDB.

---

## 14. Role Authorization Matrix & Access Control Policy

### A. Detailed Capability Matrix

| Capability | ADMIN | STUDENT | FACULTY | INVIGILATOR | DEVELOPER |
|---|:---:|:---:|:---:|:---:|:---:|
| Own identity status (`GET /candidate/identity/status`) | ❌ (403) | **ALLOW** | ❌ (403) | ❌ (403) | ❌ (403) |
| Own document upload presign (`POST /candidate/identity/document-url`) | ❌ (403) | **ALLOW** | ❌ (403) | ❌ (403) | ❌ (403) |
| Own document confirm (`POST /candidate/identity/confirm-document`) | ❌ (403) | **ALLOW** | ❌ (403) | ❌ (403) | ❌ (403) |
| Own profile & accommodation summary (`GET /candidate/profile`) | ❌ (403) | **ALLOW** | ❌ (403) | ❌ (403) | ❌ (403) |
| Identity verification queue (`GET /admin/verifications`) | **ALLOW** | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |
| Candidate verification dossier (`GET /admin/students/:id/verification`) | **ALLOW** | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |
| Secure document preview (`GET /admin/students/:id/document-preview`) | **ALLOW** | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |
| Approve / reject verification (`PATCH /admin/students/:id/verification`) | **ALLOW** | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |
| Manage student configuration (`GET/PUT /admin/students/:id/configuration`) | **ALLOW** | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |
| View already-resolved, exam-scoped accommodation in session | **ALLOW** | **ALLOW** | **ALLOW** (Session only) | **ALLOW** (Session only) | ❌ (403) |
| Access raw government-ID document binary | **ALLOW** (Admin preview) | **ALLOW** (Own file) | **DENY** | **DENY** | **DENY** |

### B. Precise Role Boundary Specifications

1. **ADMIN**:
   - Full document review, metadata inspection, short-lived preview generation (300s TTL).
   - Approve or reject identity documents with mandatory notes.
   - Manage per-student configurations and view audit logs.
2. **STUDENT**:
   - Access own onboarding, upload own document, view own status, view approved accommodation summary.
   - Strictly forbidden from accessing another candidate's document or configuration (IDOR prevention).
   - Strictly forbidden from calling admin review or self-adjusting accommodations.
3. **FACULTY**:
   - **NO raw government-ID access**.
   - **NO document preview**.
   - **NO document approval/rejection**.
   - **NO per-student configuration administration**.
   - **NO unrestricted access to student identity records**.
   - May consume ONLY already-resolved, exam-scoped accommodation information (such as effective attempt duration) within existing session workflows.
4. **INVIGILATOR**:
   - **NO government-ID document access**.
   - **NO configuration administration**.
   - Only consumes resolved operational data required for active session invigilation.
5. **DEVELOPER**:
   - **NO raw government-ID documents**.
   - **NO unrestricted identity metadata**.
   - **NO biometric data**.
   - Technical control plane and system telemetry only.

---

## 15. API Contracts & Specifications

### Candidate Endpoints (`/api/v1/candidate`)

#### 1. `GET /api/v1/candidate/identity/status`
- **Auth**: `STUDENT`.
- **Response `200 OK`**:
```json
{
  "hasSubmittedDocument": true,
  "document": {
    "documentId": "c3a1b2c4-...",
    "documentType": "PASSPORT",
    "documentNumberLast4": "4819",
    "fullNameOnDocument": "Jane Doe",
    "verificationStatus": "PENDING",
    "submittedAt": "2026-09-09T05:10:00Z",
    "reviewerNotes": null
  },
  "overallVerificationStatus": "PENDING"
}
```

#### 2. `POST /api/v1/candidate/identity/document-url`
- **Auth**: `STUDENT`.
- **Request Body**:
```json
{
  "documentType": "PASSPORT",
  "documentNumber": "A12345678",
  "fullNameOnDocument": "Jane Doe",
  "dateOfBirth": "2002-05-14",
  "expiryDate": "2032-05-13",
  "issueCountry": "IN",
  "fileName": "passport.jpg",
  "mimeType": "image/jpeg",
  "byteSize": 2450120
}
```
- **Response `201 Created`**:
```json
{
  "documentId": "c3a1b2c4-...",
  "uploadUrl": "https://s3.amazonaws.com/vault/identity-documents/...?X-Amz-Signature=...",
  "expiresInSeconds": 300
}
```

#### 3. `POST /api/v1/candidate/identity/confirm-document`
- **Auth**: `STUDENT`.
- **Request Body**: `{ "documentId": "c3a1b2c4-..." }`
- **Response `200 OK`**:
```json
{
  "message": "Document confirmed and submitted for verification",
  "verificationStatus": "PENDING"
}
```

#### 4. `GET /api/v1/candidate/profile`
- **Auth**: `STUDENT`.
- **Response `200 OK`**: Returns academic profile (department, semester, USN) and approved accommodation summary (`extraTimeMultiplier`, `breakAllowanceMinutes`).

#### 5. `PATCH /api/v1/candidate/profile`
- **Auth**: `STUDENT`.
- **Request Body**: `{ "department": "Computer Science", "semester": 5, "phone": "+1 555-0199" }`

---

### Admin Endpoints (`/api/v1/admin`)

#### 1. `GET /api/v1/admin/verifications`
- **Auth**: `ADMIN`.
- **Query**: `page`, `limit`, `status` (`PENDING`, `VERIFIED`, `REJECTED`), `role` (`STUDENT`, `FACULTY`), `search`.
- **Response `200 OK`**: Paginated verification queue.

#### 2. `GET /api/v1/admin/students/:id/verification`
- **Auth**: `ADMIN`.
- **Response `200 OK`**: Student dossier, active identity document metadata, and review history.

#### 3. `GET /api/v1/admin/students/:id/document-preview`
- **Auth**: `ADMIN`.
- **Response `200 OK`**:
```json
{
  "previewUrl": "https://s3.amazonaws.com/vault/identity-documents/...?X-Amz-Signature=...",
  "mimeType": "image/jpeg",
  "fileName": "passport.jpg",
  "expiresInSeconds": 300
}
```
- **Audit**: Emits `ADMIN_IDENTITY_DOCUMENT_PREVIEWED`.

#### 4. `PATCH /api/v1/admin/students/:id/verification`
- **Auth**: `ADMIN`.
- **Request Body**: `{ "decision": "APPROVED" | "REJECTED", "reviewNotes": "Official seal legible" }`
- **Rule**: `reviewNotes` is mandatory when `decision === 'REJECTED'`.

#### 5. `GET /api/v1/admin/students/:id/configuration`
- **Auth**: `ADMIN`.
- **Response `200 OK`**: Returns per-student accommodations (`extraTimeMultiplier`, `breakAllowanceMinutes`, `maxBreaksAllowed`, `assistiveTechnology`, `proctoringStrictness`).

#### 6. `PUT /api/v1/admin/students/:id/configuration`
- **Auth**: `ADMIN`.
- **Request Body**:
```json
{
  "extraTimeMultiplier": 1.50,
  "breakAllowanceMinutes": 15,
  "maxBreaksAllowed": 2,
  "assistiveTechnology": {
    "screenReader": true,
    "speechToText": false,
    "keyboardOnly": false
  },
  "proctoringStrictness": "RELAXED"
}
```
- **Audit**: Emits `STUDENT_CONFIGURATION_UPDATED`.

---

## 16. Candidate Frontend Flow & Screens

1. **`CandidateDocumentUploadPage.jsx`** (`/onboarding/document-upload`):
   - Document type selector (Passport, National ID, Driver's License, Student ID).
   - Form fields: Legal name, document number, country, expiration.
   - Drag-and-drop zone with client-side format and size checks.
   - Progress bar during direct S3 binary upload.
   - Automatic confirmation trigger and redirect to pending status.
2. **`VerificationPendingPage.jsx`** (`/onboarding/pending`):
   - Displays document badge, masked number, submission timestamp, and "Under Administrative Review" status.
3. **`VerificationRejectedPage.jsx`** (`/onboarding/rejected`):
   - Displays reviewer rejection notes and "Re-upload Identity Document" action button.

---

## 17. Admin Frontend Flow & Screens

1. **`AdminVerificationPage.jsx`** (`/admin/verifications`):
   - Verification queue with document presence badge, type tag, submission date.
   - Action: "Inspect Document".
2. **`StudentVerificationDetailModal.jsx`**:
   - Side-by-side inspection: Candidate academic profile vs. rendered document (image or PDF via short-lived presigned URL).
   - Approve button $\to$ transitions candidate to `VERIFIED`.
   - Reject button $\to$ enforces mandatory review notes field.
3. **`StudentConfigurationPage.jsx`** (`/admin/students/:id/configuration`):
   - Accommodations control panel: Time Multiplier slider (1.0x to 3.0x), break allowances, assistive tech checkboxes, proctoring strictness selector.

---

## 18. Per-Student Configuration & Accommodations Engine

The `student_configurations` table provides typed, domain-validated candidate accommodations:
- `extra_time_multiplier`: Range `1.00` to `3.00` (default `1.00`).
- `break_allowance_minutes`: Range `0` to `120` (default `0`).
- `max_breaks_allowed`: Range `0` to `10` (default `0`).
- `assistive_technology`: JSONB flags (`screenReader`, `speechToText`, `keyboardOnly`).
- `proctoring_strictness`: `STANDARD`, `RELAXED`, `STRICT`, `MEDICAL_EXEMPTION`.

Mutations are strictly Admin-only. Students can view read-only approved summaries. Speculative non-authoritative fields (`manual_retry_allowance`, `academic_standing`, `accommodation_notes`) are strictly excluded.

---

## 19. Attempt Duration Integration (Phase 6 Engine Scaling)

In [`backend/src/modules/attempts/attempts.service.js`](file:///c:/Projects/Online%20Examination%20System/backend/src/modules/attempts/attempts.service.js#L281-L285):
```javascript
// Phase 24 Authoritative Accommodation Scaling:
const studentConfig = await studentConfigRepo.findConfigurationByStudentId(user.userId, client);
const multiplier = (studentConfig && Number(studentConfig.extra_time_multiplier) >= 1.00 && Number(studentConfig.extra_time_multiplier) <= 3.00)
  ? Number(studentConfig.extra_time_multiplier)
  : 1.00;

const effectiveDurationMinutes = Math.round(Number(exam.duration_minutes) * multiplier);
const examDurationMs = effectiveDurationMinutes * 60 * 1000;
const durationEnd = new Date(serverNow.getTime() + examDurationMs);
const expiresAt = durationEnd < endTime ? durationEnd : endTime;
```
- **Tamper-Proof Invariant**: Read directly from PostgreSQL inside the attempt initialization transaction.
- **Client Payload Irrelevant**: Clients cannot supply or override time multipliers.
- **Session Bounded**: Duration cannot exceed the scheduled session `endTime`.

---

## 20. Audit Events & Immutability

The following events are recorded in `audit_logs`:
- `STUDENT_IDENTITY_DOCUMENT_SUBMITTED`
- `STUDENT_IDENTITY_DOCUMENT_SUPERSEDED`
- `ADMIN_IDENTITY_DOCUMENT_PREVIEWED`
- `ADMIN_VERIFICATION_APPROVED`
- `ADMIN_VERIFICATION_REJECTED`
- `STUDENT_CONFIGURATION_UPDATED`

Audit records maintain context (actor, target, timestamp, decision, reason) without storing raw document binaries, secrets, or unmasked document numbers.

---

## 21. Sensitive Identity Metadata Logging & Redaction Policy

### A. Redaction Boundary Invariants
The following sensitive identity fields **MUST NOT** appear in normal application logs, debug logs, request/response logs, analytics events, telemetry attributes, tracing attributes, metrics labels, developer-facing technical views, or generic audit JSON:
- Full legal name on document
- Date of birth
- Document number (plaintext is NEVER persisted and NEVER logged)
- Document number hash
- S3 bucket and object keys
- Presigned upload and download URLs
- Reviewer internal notes

### B. Display Restrictions
- Only the masked document number (`documentNumberLast4`) is rendered to candidate and admin screens.
- Direct error messages returned to unauthorized callers are sanitized to generic `FORBIDDEN` or `BAD_REQUEST` without leaking file paths or metadata.

---

## 22. Data Retention & Cleanup Policy

1. **Submitted & Approved Documents**: Retained throughout the student's active institutional enrollment for accreditation and audit compliance.
2. **Rejected Documents**: Retained for audit trails for 90 days following final resolution or superseding submission, after which binary objects are purged.
3. **Superseded Documents**: Marked `SUPERSEDED` in PostgreSQL; active pointers update to the new submission.
4. **Abandoned Unconfirmed Uploads**: S3 Lifecycle expiration rules automatically purge unconfirmed objects under prefix `identity-documents/` after 24 hours. Failed confirmations trigger immediate synchronous S3 deletion.

---

## 23. Test Strategy (Levels 1–5)

- **Level 1 (Domain & Invariants)**:
  - `studentDocumentInvariants.test.js`: State transitions (`PENDING_UPLOAD` $\to$ `PENDING` $\to$ `APPROVED`/`REJECTED` $\to$ `SUPERSEDED`), mandatory notes on rejection, document type enums.
  - `studentConfigInvariants.test.js`: Multiplier range (1.00–3.00), break limit bounds.
  - `documentMagicBytes.test.js`: Magic bytes validation for JPEG, PNG, PDF; corrupt file rejection.
- **Level 2 (Repository & Integration)**:
  - `studentDocumentRepository.test.js`: Document CRUD, status transitions, hashing.
  - `studentConfigRepository.test.js`: Configuration upsert and student lookups.
  - `candidateIdentityService.test.js`: Presign flow, upload confirmation, magic byte check, resubmission.
- **Level 3 (Security & Authorization)**:
  - `studentIdentitySecurity.test.js`:
    - IDOR check: Student cannot access another student's document or config.
    - Role check: Faculty denied document preview and configuration administration.
    - Role check: Invigilator and Developer denied document preview.
    - Privilege escalation check: Student cannot approve/reject or edit accommodations.
    - Exam duration scaling check: Attempt duration authoritatively scales with multiplier.
    - Upload check: Magic byte mismatch rejected, file > 10MB rejected, empty file rejected.
    - Rejection note check: Rejection without notes rejected.
- **Level 4 (Frontend)**:
  - `candidateIdentityApiContract.test.js`: Verifies client helpers match exact backend endpoints.
  - `CandidateIdentityPages.test.jsx`: Component tests for candidate upload page, rejection resubmission, and admin inspection modal.
- **Level 5 (Full Regression)**:
  - `npm test -- --run` in `frontend`
  - `npm run build` in `frontend`
  - Full backend test suite regression

---

## 24. IDOR & Tamper-Resistance Test Matrix

| Test Case | Actor | Action | Expected Result | Invariant Verified |
|---|---|---|---|---|
| IDOR Document Read | Student A | Request Student B's document status | 403 Forbidden | Ownership isolation |
| IDOR Preview URL | Student A | Request presigned preview for Student B's doc | 403 Forbidden | Storage security |
| IDOR Configuration Read | Student A | Request Student B's configuration | 403 Forbidden | Privacy boundary |
| Role Violation: Faculty Preview | Faculty | Request document preview URL | 403 Forbidden | Faculty access boundary |
| Role Violation: Faculty Config | Faculty | Update student configuration | 403 Forbidden | Faculty access boundary |
| Role Violation: Invigilator Preview | Invigilator | Request document preview URL | 403 Forbidden | Invigilator boundary |
| Role Violation: Developer Preview | Developer | Request document preview URL | 403 Forbidden | Developer boundary |
| Student Self-Approval | Student | Call `PATCH /admin/students/:id/verification` | 403 Forbidden | Admin privilege |
| Accommodation Tampering | Student | Submit `{ extraTimeMultiplier: 2.5 }` in attempt start | Ignored | Server-authoritative scaling |
| Corrupt Magic Bytes | Student | Upload text file renamed to `.jpg` | 400 Invalid File Signature | Binary signature enforcement |
| Rejection Without Notes | Admin | Reject document with empty `reviewNotes` | 400 Bad Request | Mandatory review feedback |

---

## 25. Failure, Retry & Idempotency Behavior

1. **Presign Request Retry**: Idempotent. Re-requesting presigned upload URL supersedes previous unconfirmed `PENDING_UPLOAD` row.
2. **Confirmation Retry**: If already `PENDING`, confirmation returns 200 OK with current status without duplicate S3 operations.
3. **Direct S3 Upload Failure**: If network fails during S3 binary PUT, client retries PUT to the same URL within its 300-second window.
4. **S3 Deletion Failure on Invalid File**: If S3 deletion fails during confirmation error path, an error log is emitted and 24h S3 lifecycle expiration guarantees eventual cleanup.

---

## 26. Rollback Considerations

1. **Migration Rollback**:
   - `down` function in `019_student_documents_and_configurations.js` drops `student_identity_documents` and `student_configurations` tables cleanly.
2. **Code Rollback**:
   - Routes can be deactivated without affecting Phase 23 account administration.
   - Attempt duration calculation defaults safely to `1.00x` if `student_configurations` is missing.

---

## 27. Migration Strategy & Execution Plan

1. Migration `019_student_documents_and_configurations.js` executes via Knex:
   `npm run db:migrate` in `backend`.
2. Schema changes are purely additive; zero downtime or breaking changes to existing tables.
3. Existing users remain in their current `users.verification_status` without disruption.

---

## 28. Observability & Telemetry Requirements

1. **Prometheus Metrics**:
   - `evidenceStorageLatencySeconds` records S3 presign and HeadObject operations.
   - Verification queue gauge tracks pending document review backlog.
2. **Structured Logs**:
   - Redaction filters ensure no document numbers, hashes, or presigned URLs appear in logs.
   - Correlation IDs (`x-request-id`) link upload, confirmation, and admin review logs.

---

## 29. Risk Register & Mitigations

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| Malicious candidate uploads disguised executable | High | Low | Binary magic byte validation (`FF D8 FF`, `89 50 4E 47`, `%PDF`) + strict MIME check. |
| Large file exhausting S3 storage / bandwidth | Medium | Low | Strict 10MB limit enforced client-side and verified via S3 `headEvidenceObject`. |
| IDOR between candidates | Critical | Low | Ownership check (`req.user.userId === studentId`) on every candidate route + Level 3 security tests. |
| Faculty over-permissioning | High | Medium | Explicit route middleware denying `FACULTY` access to all government ID preview & config routes. |
| Attempt duration manipulation | High | Low | Multiplier queried server-side from PostgreSQL within attempt creation transaction; client payloads ignored. |

---

## 30. Architectural Decisions & Discrepancy Reconciliation (ADR Assessment)

- **ADR Required?**: **NO**.
- **Assessment**: The design complies 100% with authoritative architecture:
  - Notion Step 13.5 (State Decoupling & Security Boundaries)
  - Notion Step 13.7 (Private S3 Object Storage & Audit Immutability)
  - Phase 15 S3 storage abstractions
  - Phase 23 user administration foundation
- **Reconciliations Clarified**:
  - Faculty access is strictly confined to exam-scoped consumption in active sessions; raw government ID documents and student configuration management are restricted to platform Administrators.
  - Decoupled `users.verification_status` from `student_identity_documents.verification_status`.
  - Removed speculative configuration fields (`manual_retry_allowance`, `academic_standing`, `accommodation_notes`) to adhere strictly to authoritative accommodation scope.
  - S3 object key refined to opaque `identity-documents/${documentId}/${randomHex}.${ext}` without exposing `studentId`.

---

## 31. Exact Files to Create

1. `backend/migrations/019_student_documents_and_configurations.js`
2. `backend/src/domain/student/studentDocumentStates.js`
3. `backend/src/domain/student/studentDocumentInvariants.js`
4. `backend/src/domain/student/studentConfigInvariants.js`
5. `backend/src/modules/candidate/candidateIdentity.schemas.js`
6. `backend/src/modules/candidate/candidateIdentity.repository.js`
7. `backend/src/modules/candidate/candidateIdentity.service.js`
8. `backend/src/modules/candidate/candidateIdentity.controller.js`
9. `backend/src/modules/candidate/candidateIdentity.routes.js`
10. `backend/src/modules/candidate/studentConfig.repository.js`
11. `backend/src/modules/candidate/studentConfig.service.js`
12. `backend/src/modules/candidate/studentConfig.controller.js`
13. `backend/tests/unit/domain/studentDocumentInvariants.test.js`
14. `backend/tests/unit/domain/studentConfigInvariants.test.js`
15. `backend/tests/unit/domain/documentMagicBytes.test.js`
16. `backend/tests/integration/studentDocument.test.js`
17. `backend/tests/integration/studentIdentitySecurity.test.js`
18. `frontend/src/api/candidateIdentityApi.js`
19. `frontend/src/pages/onboarding/CandidateDocumentUploadPage.jsx`
20. `frontend/src/pages/admin/StudentConfigurationPage.jsx`
21. `frontend/src/components/admin/StudentVerificationDetailModal.jsx`
22. `frontend/tests/api/candidateIdentityApiContract.test.js`
23. `frontend/tests/pages/CandidateIdentityPages.test.jsx`

---

## 32. Exact Files to Modify

1. `backend/src/routes/index.js` (Mount `/api/v1/candidate` identity router)
2. `backend/src/modules/users/user.routes.js` (Add admin verification dossier, document preview, and student configuration endpoints)
3. `backend/src/modules/users/user.controller.js` (Add review, preview, and configuration controller handlers)
4. `backend/src/modules/attempts/attempts.service.js` (Scale attempt duration by `extra_time_multiplier` during attempt creation)
5. `frontend/src/App.jsx` (Register `/onboarding/document-upload` and `/admin/students/:id/configuration` routes)
6. `frontend/src/routes/VerifiedRoute.jsx` (Enforce document submission state in onboarding progression)
7. `frontend/src/pages/admin/AdminVerificationPage.jsx` (Integrate document preview and inspection modal)
8. `frontend/src/api/adminUsersApi.js` (Add client methods for verification dossier, document preview, and student configuration)
9. `docs/DEVELOPMENT_PLAN.md` (Update roadmap status for Phase 24)

---

## 33. Exact Migrations Required

- `backend/migrations/019_student_documents_and_configurations.js`:
  - `student_identity_documents` table
  - `student_configurations` table
  - Indexes and check constraints

---

## 34. Exact Routes & APIs

### Candidate Routes (`/api/v1/candidate`):
- `GET /api/v1/candidate/identity/status`
- `POST /api/v1/candidate/identity/document-url`
- `POST /api/v1/candidate/identity/confirm-document`
- `GET /api/v1/candidate/profile`
- `PATCH /api/v1/candidate/profile`

### Admin Routes (`/api/v1/admin`):
- `GET /api/v1/admin/verifications`
- `GET /api/v1/admin/students/:id/verification`
- `GET /api/v1/admin/students/:id/document-preview`
- `PATCH /api/v1/admin/students/:id/verification`
- `GET /api/v1/admin/students/:id/configuration`
- `PUT /api/v1/admin/students/:id/configuration`

---

## 35. Exact Frontend Screens & Routes

- `/onboarding/document-upload` (`CandidateDocumentUploadPage`)
- `/onboarding/pending` (`VerificationPendingPage` - updated with document badge)
- `/onboarding/rejected` (`VerificationRejectedPage` - updated with resubmission action)
- `/admin/verifications` (`AdminVerificationPage` - updated with preview modal)
- `/admin/students/:id/configuration` (`StudentConfigurationPage`)

---

## 36. Exact Test Suites

1. `backend/tests/unit/domain/studentDocumentInvariants.test.js`
2. `backend/tests/unit/domain/studentConfigInvariants.test.js`
3. `backend/tests/unit/domain/documentMagicBytes.test.js`
4. `backend/tests/integration/studentDocument.test.js`
5. `backend/tests/integration/studentIdentitySecurity.test.js`
6. `frontend/tests/api/candidateIdentityApiContract.test.js`
7. `frontend/tests/pages/CandidateIdentityPages.test.jsx`

---

## 37. Definitive Phase 24 / Phase 25 Boundary Matrix

| Capability | Phase 24 (Approved Scope) | Phase 25 (Strict Non-Scope) |
|---|:---:|:---:|
| Government ID Document Upload | **YES** | NO |
| S3 Direct Presigned Storage | **YES** | NO |
| Magic Byte File Validation | **YES** | NO |
| Admin Document Review & Preview | **YES** | NO |
| Per-Student Accommodations | **YES** | NO |
| Exam Duration Scaling | **YES** | NO |
| Facial Biometric Enrollment | **NO** | **YES** |
| Facial Embeddings Vectors | **NO** | **YES** |
| Cosine Similarity Matching | **NO** | **YES** |
| Passive / Active Liveness Detection | **NO** | **YES** |
| Anti-Spoofing & Presentation Attack Detection | **NO** | **YES** |
| OCR Text Extraction | **NO** | **NO** (No paid OCR dependency) |

---

## 38. Final Implementation Readiness Checklist

- [x] Phase 23 PR #21 verified merged into `main`.
- [x] Working tree is clean on `main`.
- [x] No code changes or branch creation executed during planning.
- [x] Speculative fields (`manual_retry_allowance`, `academic_standing`, `accommodation_notes`) removed from all layers.
- [x] S3 object key refined to opaque `identity-documents/${documentId}/${randomHex}.${ext}` without exposing `studentId`.
- [x] S3 storage design reuses Phase 15 abstractions without duplication.
- [x] Magic byte validation strictly specified for JPEG, PNG, PDF.
- [x] Faculty access boundary strictly defined (no raw ID access, no preview, no configuration).
- [x] S3 invalid and abandoned upload cleanup lifecycle fully detailed.
- [x] Sensitive identity metadata logging boundaries and redactions fully defined.
- [x] User-level and document-level verification states explicitly decoupled.
- [x] Attempt duration scaling is server-authoritative and tamper-proof.
- [x] Role authorization matrix defined across all 5 roles.
- [x] SVG architecture diagram included (no Mermaid, no ASCII).
- [x] Zero biometric or Phase 25 features included.
- [x] STOP at plan gate enforced. Awaiting explicit user command: `APPROVE PLAN`.
