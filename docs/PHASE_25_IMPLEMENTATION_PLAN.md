# Phase 25 Implementation Plan: Biometric Identity — Face Enrollment, Verification & Anti-Spoofing

> **Authoritative Specification & Design Blueprint**
> **Mode**: IMPLEMENTATION COMPLETE — VERIFIED
> **Plan Status**: APPROVED
> **Implementation Status**: COMPLETE
> **Next Gate**: PR & MERGE
> **Feature Branch**: `feature/phase-25-biometric-identity`
>
> **Authoritative Hierarchy**:
> 1. Notion Step 13 Final Re-Architecture (§13.5 State Decoupling, §13.7 Private S3 Storage, §13.17 Audit Immutability)
> 2. `docs/DEVELOPMENT_PLAN.md` (Section 6.2, Lines 808–830, Feature Matrix)
> 3. Current Merged Main Branch (Phases 1–24 complete & merged — established conventions in `s3Storage.js`, `attempts.service.js`, `candidateIdentity.service.js`)
> 4. Existing Finalized Phase Plans (`PHASE_23_IMPLEMENTATION_PLAN.md`, `PHASE_24_IMPLEMENTATION_PLAN.md`)
> 5. Existing Tests & Implementation Conventions

---

## 1. Phase Objective

**Phase 25** establishes the **Biometric Identity Plane** of the ProctorNet platform:

1. **Reference Face Enrollment** — Candidate uploads a raw JPEG/PNG image. Server performs face detection, quality analysis, and **server-side 128-d normalized float-vector embedding extraction**. No embedding is ever supplied or computed by the client.
2. **Pre-Exam Face Verification Gate** — Candidate uploads a raw live selfie. Server extracts the live embedding, computes authoritative cosine similarity against the enrolled reference, and issues the `VERIFIED`/`FAILED` verdict.
3. **Server-Evaluated Liveness / Anti-Spoofing** — Candidate uploads raw webcam frames to a presigned S3 URL. Server downloads and evaluates the actual frames (passive texture + active pose/action analysis). Client-reported motion events are never treated as authoritative liveness proof.
4. **Authoritative Attempt Gating** — `attempts.service.js:startAttempt` is gated on a valid `VERIFIED` or `OVERRIDDEN` biometric verification record, within the existing ACID transaction. Medical exemptions bypass the gate and are immutably audited on every exercise.
5. **Privacy-Preserving Governance** — Separate retention schedules per artifact category; zero raw biometric data in logs or API responses; immutable audit trail for every biometric lifecycle event.

> **CRITICAL INVARIANT — Server-Authoritative Embeddings**
> The client **never** submits a facial embedding vector of any dimension, a liveness score, or trusted motion data. All biometric feature extraction is performed exclusively on the server from raw image/frame media received via the established Phase 15/24 S3 presigned-upload pattern.

---

## 2. Architectural Context

ProctorNet follows a **Modular Monolith** architecture with:
- **PostgreSQL** — Single authoritative source of truth for business and biometric state.
- **Amazon S3** — Private encrypted binary object storage; presigned SigV4 PUT/GET; `generatePresignedUploadUrl` / `headEvidenceObject` / `getEvidenceObjectHeader` / `deleteEvidenceObjectVersions` from `s3Storage.js`.
- **Redis** — Strictly non-authoritative transient cache (rate limiting, TTLs). Not used for biometric verdicts.
- **REST API (`/api/v1`)** — Authoritative command/query interface following the Phase 24 route-naming convention (`/candidate/...`, `/admin/...`).
- **React 19 SPA** — Candidate, faculty, proctor, and admin interfaces.

Phase 25 attaches the biometric identity plane to the Phase 24 foundation (presigned upload lifecycle, `headEvidenceObject` magic-byte verification, `student_configurations`, `requireVerifiedActiveUser`) without modifying migration semantics or existing flows.

---

## 3. Existing Repository Conventions Used

### S3 Presigned Upload Lifecycle (from `candidateIdentity.service.js`)
The established three-step pattern is:
1. `POST /[domain]-url` → server creates a DB record in `PENDING_UPLOAD` state; mints presigned SigV4 PUT URL (300s TTL); returns `{ id, uploadUrl, expiresInSeconds }`.
2. Client uploads binary directly to S3 via the presigned URL.
3. `POST /confirm-[domain]` → server calls `headEvidenceObject` (size, ContentType, VersionId) + `getEvidenceObjectHeader` (16-byte magic check); transitions state; audits.

**Phase 25 follows this exact three-step pattern for both enrollment images and liveness frames.**

### S3 Key Convention (from `candidateIdentity.service.js` line 121)
`identity-documents/${documentId}/${randomHex}.${ext}` — opaque, no PII, no studentId in path.
Phase 25 follows the same pattern.

### `startAttempt` ACID Transaction (from `attempts.service.js`)
`startAttempt` opens a single `BEGIN`/`COMMIT` block, acquires `FOR UPDATE` locks on the roster row and existing attempts, checks `studentConfig.extra_time_multiplier`, then inserts. The biometric gate check will be inserted as step 5a within this same transaction (after roster lock, before timing validation) using a `SELECT ... FOR SHARE` on `biometric_verifications`.

### Audit Pattern (from `candidateIdentity.service.js`)
`recordAuditEvent(auditData)` is imported from `audit.service.js`. All Phase 25 audit events follow this same call signature.

---

## 4. Scope

- [x] Reference face enrollment: presigned S3 upload → server-side detection, quality analysis, embedding extraction → `ENROLLED`.
- [x] Server-side 128-d normalized float-vector embedding extraction. Client never computes or submits an embedding.
- [x] Private S3 storage for reference images with 300s presigned URLs and magic-byte verification.
- [x] Server-side quality pre-flight (pose, sharpness, illumination). Client quality hints are advisory UX-only.
- [x] Pre-exam face verification: client uploads raw live image → server extracts embedding → cosine similarity → `VERIFIED`/`FAILED`.
- [x] Liveness: client uploads raw webcam frames to presigned S3 → server evaluates frames (passive texture + active pose/action) → `PASSED`/`FAILED`. Challenge is single-use.
- [x] Signed liveness verification token (HMAC-SHA256, 300s TTL, bound to `userId`, `sessionId`, `challengeId`).
- [x] `startAttempt` gating — within existing ACID transaction — based on authoritative biometric verification records.
- [x] Medical exemption bypass with mandatory immutable `BIOMETRIC_MEDICAL_EXEMPTION_APPLIED` audit on every exercise.
- [x] 3-attempt lockout and admin override with documented justification.
- [x] Separate retention schedules per artifact category (see §19).
- [x] Schema-level rejection of any request body containing `embedding`, `liveEmbedding`, or `vector` fields.
- [x] Immutable audit logging for all biometric lifecycle events.
- [x] Frontend components and enrollment screen (UX guidance only; no biometric computation in browser).

---

## 5. Non-Scope

- **NO** Government ID Document Capture or Review (Phase 24).
- **NO** Commercial cloud biometric APIs (AWS Rekognition, Azure Face, Face++).
- **NO** Faculty Question Bank Management (Phase 26).
- **NO** Subjective Manual Grading (Phase 26).
- **NO** Continuous In-Exam Gaze/Presence Tracking (Phase 14 / Phase 27).
- **NO** Real-Time Invigilator Interventions (Phase 27).

---

## 6. Architecture & Data Flow

```
+----------------------------------------------------------------------------------------------------+
|                                      Candidate Browser (SPA)                                      |
|  FaceOvalGuide (UX overlay)   LightingIndicator (UX hint)   BiometricGate (challenge UI)          |
|                                                                                                    |
|  Enrollment:  raw JPEG/PNG → presigned PUT → S3  |  POST /enroll-confirm { biometricId }          |
|  Liveness:    raw frames   → presigned PUT → S3  |  POST /verify-liveness { challengeId, nonce,   |
|                                                  |             liveMediaId }                       |
|  Verification: raw JPEG/PNG → presigned PUT → S3 |  POST /verify-face { sessionId, livenessToken, |
|                                                  |             liveImageId }                       |
|  CLIENT NEVER COMPUTES OR TRANSMITS AN EMBEDDING OF ANY KIND.                                     |
+----------------------------------+---------------------------------+------------------------------+
                                   | REST JSON (IDs, tokens)         | SigV4 PUT (binary media)
                                   ▼                                 ▼
+----------------------------------+---------------------------------+------------------------------+
|                              ProctorNet API Monolith                                               |
|                                                                                                    |
|  SERVER-SIDE BIOMETRIC PIPELINE (all extraction here):                                             |
|  Raw image/frame bytes (downloaded from private S3)                                                |
|    → Magic Byte Validation (getEvidenceObjectHeader, first 16 bytes)                               |
|    → Face Detection & Alignment         [faceDetector.js]                                          |
|    → Quality Analysis: Laplacian, illumination, pose  [qualityAnalyzer.js]                        |
|    → Embedding Extraction: 128-d normalized float    [embeddingExtractor.js]                      |
|    → Normalization & Dimension Validation             [vectorMath.js]                              |
|                                                                                                    |
|  LIVENESS PIPELINE (server evaluates actual frames):                                               |
|  Raw frame bytes (downloaded from private S3, bound to challenge record)                           |
|    → Object ownership & challenge binding verification                                             |
|    → Passive texture / micro-motion analysis         [livenessAnalyzer.js]                        |
|    → Active pose/blink/smile analysis per frame      [livenessAnalyzer.js]                        |
|    → Server-clock nonce expiry check                                                               |
|    → HMAC-SHA256 liveness token on PASS                                                            |
|                                                                                                    |
|  POLICY DECISION (exclusively in biometrics.service.js):                                           |
|    → Apply BIOMETRIC_SIMILARITY_THRESHOLD (env var, default 0.8500)                               |
|    → Apply BIOMETRIC_QUALITY_THRESHOLD (env var, default 0.650)                                   |
|    → Record authoritative verdict in PostgreSQL                                                    |
|    → Emit immutable audit event                                                                    |
+----------------------------------+---------------------------------+------------------------------+
                                   | ACID Reads/Writes               | Private S3 Storage
                                   ▼                                 ▼
+----------------------------------+-----------+  +-----------------+------------------------------+
|                        PostgreSQL             |  |              Amazon S3                        |
|  face_biometrics     (128-d embeddings)       |  |  face-biometrics/   (ref images, 90d)          |
|  liveness_challenges (nonces, 8s TTL)         |  |  liveness-frames/   (challenge frames, 48h)    |
|  biometric_verifications (verdicts, retries)  |  |  biometric-live/    (live selfies, 30d)         |
|  audit_logs          (immutable, permanent)   |  |  All: zero public read; SSE-AES256             |
+-----------------------------------------------+  +-----------------------------------------------+
```

---

## 7. Biometric Lifecycle State Machines

### 7.1 Reference Face Enrollment (`face_biometrics.enrollment_status`)

**All transitions are server-driven. No client action alone advances a record.**

| State | Entry Condition | Terminal? | Allowed Transitions | Authority |
|---|---|---|---|---|
| `PENDING_UPLOAD` | POST `/enroll-url` accepted | No | → `PENDING_EXTRACTION`, → `UPLOAD_EXPIRED` | Server on presign |
| `UPLOAD_EXPIRED` | 300s TTL elapsed with no confirm call | Yes (retry allowed) | — | Server on next request |
| `PENDING_EXTRACTION` | POST `/enroll-confirm` accepted; object found in S3 | No | → `ENROLLED`, → `REJECTED` | Server pipeline |
| `ENROLLED` | Server: detection OK, Q ≥ 0.650, extraction success | No | → `SUPERSEDED`, → `REVOKED` | Server or Admin |
| `REJECTED` | Server: magic byte fail, face not detected, or Q < 0.650 | Yes (re-enroll allowed) | — | Server pipeline |
| `SUPERSEDED` | New `ENROLLED` record created for same user | Yes (retained for audit) | — | Server on re-enroll |
| `REVOKED` | Administrative integrity violation action | Yes | — | ADMIN only |

**Idempotency**: A second POST `/enroll-confirm` call for an already-`ENROLLED` record returns `200 OK` without re-running the pipeline.

**Re-enrollment**: Candidate may initiate a new enrollment from `PENDING_UPLOAD` (the existing `ENROLLED` record is superseded only upon the new enrollment reaching `ENROLLED`).

---

### 7.2 Liveness Challenge (`liveness_challenges.status`)

| State | Entry Condition | Terminal? | Allowed Transitions | Authority |
|---|---|---|---|---|
| `PENDING` | POST `/biometrics/liveness-media-url` called and DB record created | No | → `PASSED`, → `FAILED`, → `EXPIRED` | Server |
| `PASSED` | Server: frames valid, actions confirmed, nonce not expired | **Yes** | — | Server |
| `FAILED` | Server: frames invalid, actions mismatch, or spoof detected | **Yes** | — | Server |
| `EXPIRED` | Server clock ≥ `expires_at` at time of evaluation | **Yes** | — | Server clock |

**Invariant**: Any attempt to submit against a `challengeId` in a terminal state (`PASSED`, `FAILED`, `EXPIRED`) returns `409 Conflict`. The nonce column has a `UNIQUE` constraint; re-use is impossible.

**Anti-Replay Reminder**: Random action selection is one component of anti-replay; it is **not** itself proof of liveness. The server evaluates actual frame content independently.

---

### 7.3 Pre-Exam Biometric Verification (`biometric_verifications.final_status`)

| State | Entry Condition | Terminal? | Allowed Transitions | Authority |
|---|---|---|---|---|
| `PENDING` | Liveness challenge issued for this (session, user) | No | → `VERIFIED`, → `FAILED`, → `LOCKED` | Server |
| `VERIFIED` | sim ≥ threshold AND liveness `PASSED`, attempt ≤ 3 | Yes | — | Server |
| `FAILED` | sim < threshold OR liveness `FAILED`, attempt < 3 | No (retry) | → `VERIFIED`, → `LOCKED` | Server |
| `LOCKED` | `attempt_number` = 3 and still unverified | No | → `OVERRIDDEN` | ADMIN only |
| `OVERRIDDEN` | Admin override with documented reason | Yes | — | ADMIN only |
| `EXEMPTED` | startAttempt bypassed via `MEDICAL_EXEMPTION` | Yes | — | Server (automated) |

---

## 8. Database Design

**Migration**: `backend/migrations/020_biometric_face_enrollment_and_verification.js`

### 8.1 `face_biometrics`

| Column | Type | Constraint / Note |
|---|---|---|
| `biometric_id` | UUID PK | `DEFAULT gen_random_uuid()` |
| `user_id` | UUID NOT NULL | FK → `users(user_id)` ON DELETE CASCADE |
| `embedding` | JSONB | **Server-extracted only**; NULL until `ENROLLED`; CHECK `jsonb_typeof(embedding) = 'array'` |
| `embedding_dimension` | INT | CHECK `embedding_dimension = 128`; set by server; **not 512** |
| `enrollment_status` | VARCHAR(32) | CHECK IN ('PENDING_UPLOAD','PENDING_EXTRACTION','ENROLLED','REJECTED','SUPERSEDED','REVOKED','UPLOAD_EXPIRED') |
| `quality_score` | NUMERIC(4,3) | NULL until extraction complete; CHECK 0.000–1.000 |
| `pose_pitch` | NUMERIC(5,2) | NULL until extraction |
| `pose_yaw` | NUMERIC(5,2) | NULL until extraction |
| `pose_roll` | NUMERIC(5,2) | NULL until extraction |
| `sharpness_score` | NUMERIC(7,2) | NULL until extraction |
| `illumination_score` | NUMERIC(4,3) | NULL until extraction |
| `s3_bucket` | VARCHAR(128) NOT NULL | |
| `s3_key` | VARCHAR(512) NOT NULL UNIQUE | `face-biometrics/${biometricId}/${randomHex}.${ext}` |
| `mime_type` | VARCHAR(64) | CHECK IN ('image/jpeg','image/png') |
| `byte_size` | INT | CHECK > 0 AND ≤ 10,485,760 |
| `model_version` | VARCHAR(64) | NOT NULL; set by `embeddingExtractor.js`; stored per-record for auditability |
| `raw_image_purged_at` | TIMESTAMPTZ | NULL until 90-day purge job runs |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT CURRENT_TIMESTAMP |

Index: `CREATE INDEX idx_face_biometrics_user_status ON face_biometrics(user_id, enrollment_status);`

---

### 8.2 `liveness_challenges`

| Column | Type | Constraint / Note |
|---|---|---|
| `challenge_id` | UUID PK | `DEFAULT gen_random_uuid()` |
| `user_id` | UUID NOT NULL | FK → `users(user_id)` ON DELETE CASCADE |
| `session_id` | UUID NOT NULL | FK → `exam_sessions(session_id)` ON DELETE CASCADE |
| `challenge_type` | VARCHAR(32) | CHECK IN ('SEQUENCE','HEAD_TURN','BLINK','SMILE') |
| `expected_actions` | JSONB NOT NULL | e.g. `["HEAD_TURN_LEFT","BLINK"]`; server-selected |
| `nonce` | VARCHAR(64) UNIQUE | 32-byte hex; `crypto.randomBytes(32).toString('hex')` |
| `status` | VARCHAR(32) | CHECK IN ('PENDING','PASSED','FAILED','EXPIRED') DEFAULT 'PENDING' |
| `expires_at` | TIMESTAMPTZ NOT NULL | `NOW() + INTERVAL '8 seconds'` |
| `live_media_s3_bucket` | VARCHAR(128) | NULL until media upload authorized |
| `live_media_s3_key` | VARCHAR(512) | Bound to `challenge_id`; verified server-side before evaluation |
| `live_media_version_id` | VARCHAR(256) | S3 VersionId pinned at `HeadObject` confirmation |
| `live_media_consumed` | BOOLEAN NOT NULL | DEFAULT false; set true when frames downloaded for analysis |
| `passive_texture_score` | NUMERIC(4,3) | NULL until server evaluation |
| `active_action_score` | NUMERIC(4,3) | NULL until server evaluation |
| `verified_at` | TIMESTAMPTZ | NULL until PASSED |
| `frames_purged_at` | TIMESTAMPTZ | NULL until 48h purge job runs |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT CURRENT_TIMESTAMP |

Indexes:
- `CREATE INDEX idx_liveness_challenges_nonce ON liveness_challenges(nonce);`
- `CREATE INDEX idx_liveness_challenges_user_session ON liveness_challenges(user_id, session_id, status);`

---

### 8.3 `biometric_verifications`

| Column | Type | Constraint / Note |
|---|---|---|
| `verification_id` | UUID PK | `DEFAULT gen_random_uuid()` |
| `session_id` | UUID NOT NULL | FK → `exam_sessions(session_id)` ON DELETE CASCADE |
| `user_id` | UUID NOT NULL | FK → `users(user_id)` ON DELETE CASCADE |
| `biometric_reference_id` | UUID | FK → `face_biometrics(biometric_id)` ON DELETE SET NULL |
| `challenge_id` | UUID | FK → `liveness_challenges(challenge_id)` ON DELETE SET NULL |
| `live_image_s3_key` | VARCHAR(512) | Opaque S3 key for live selfie; never returned in API responses |
| `live_image_version_id` | VARCHAR(256) | S3 VersionId pinned at confirmation |
| `similarity_score` | NUMERIC(5,4) | NULL until server extraction; range [-1.0000, 1.0000] |
| `threshold_applied` | NUMERIC(5,4) NOT NULL | DEFAULT 0.8500; stored for auditability |
| `match_verdict` | VARCHAR(32) NOT NULL | CHECK IN ('MATCHED','MISMATCH','INDETERMINATE','EXTRACTION_FAILED') |
| `liveness_verdict` | VARCHAR(32) NOT NULL | CHECK IN ('PASSED','FAILED','EXPIRED','BYPASSED_EXEMPTION') |
| `final_status` | VARCHAR(32) NOT NULL | CHECK IN ('PENDING','VERIFIED','FAILED','LOCKED','OVERRIDDEN','EXEMPTED') |
| `attempt_number` | INT NOT NULL | DEFAULT 1; CHECK ≥ 1 AND ≤ 3 |
| `override_by` | UUID | FK → `users(user_id)` ON DELETE SET NULL |
| `override_reason` | TEXT | Mandatory when `final_status = 'OVERRIDDEN'`; minimum 10 chars |
| `live_image_purged_at` | TIMESTAMPTZ | NULL until 30-day purge job runs |
| `metadata` | JSONB NOT NULL | DEFAULT `'{}'::jsonb`; diagnostic info; **NO embedding vectors** |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT CURRENT_TIMESTAMP |

Indexes:
- `CREATE INDEX idx_biometric_verifications_session_user ON biometric_verifications(session_id, user_id, created_at DESC);`
- `CREATE INDEX idx_biometric_verifications_status ON biometric_verifications(final_status);`

---

## 9. AI/ML Model Contract & Extraction Pipeline

### 9.1 Model Selection Decision

> **MODEL SELECTION: Architectural Implementation Dependency**
>
> The repository does not contain an existing approved production biometric face embedding model. The exact production model artifact (model file, hash, version, runtime) **must be selected and validated before implementation begins**. No model name or unsupported performance claim is declared in this plan.

**ADR Assessment**: Model selection is an **implementation detail within the already-approved server-side AI boundary** (established by this plan in §6 and §10). It does not change the approved architecture. An ADR is **not required** for model selection, because the architecture decision — that all biometric feature extraction is server-authoritative, no commercial cloud, no client-side computation — is already captured in this plan and in the authoritative hierarchy.

However, the following **non-negotiable model contract** applies:

| Contract | Requirement |
|---|---|
| Output dimensions | **Exactly 128** float values per embedding. No alternative (e.g., 512-d) is supported in Phase 25. |
| Server-side execution | Model inference runs exclusively on the ProctorNet API server process. |
| No commercial hosted API | No external biometric cloud service. |
| Version determinism | Model version string is stored per-record in `face_biometrics.model_version`. |
| Model artifact auditability | Model file hash (SHA-256) is recorded in server configuration/deployment manifest. |
| Model integrity validation | Server startup validates the loaded model file against the pinned SHA-256 hash. |
| Normalization | Output embedding is L₂-normalized **by the server** before storage or comparison. |
| No direct trust | Model output is a numerical vector, not a business decision. The policy threshold is applied by `biometrics.service.js`. |

### 9.2 Expected Implementation Interface (Not Implemented Now)

```
// embeddingExtractor.js
// Input:  raw image Buffer + face bounding box from faceDetector.js
// Output: { embedding: number[128], modelVersion: string, inferenceMs: number }
// Throws: EmbeddingExtractionError if face not detectable from bounding box

async function extract(imageBuffer, faceBoundingBox) → { embedding, modelVersion, inferenceMs }
```

```
// faceDetector.js
// Input:  raw image Buffer
// Output: { faceDetected: boolean, boundingBox, landmarks, poseAngles: { pitch, yaw, roll } }

async function detect(imageBuffer) → DetectionResult
```

```
// livenessAnalyzer.js
// Input:  array of frame Buffers + expectedActions + frameTimestampsMs
// Output: { passiveLivenessScore, activeActionScore, observedActions, passedThreshold }

async function analyzeFrames(frames, expectedActions) → LivenessResult
```

### 9.3 AI/ML Module vs. Business Policy Boundary

| Layer | Responsibility |
|---|---|
| `faceDetector.js` | Numerical detection output only: face found?, bounding box, pose angles |
| `qualityAnalyzer.js` | Numerical quality scores only: sharpness, illumination, composite Q |
| `embeddingExtractor.js` | Numerical embedding vector only: 128-d float array + model version |
| `livenessAnalyzer.js` | Numerical liveness scores only: passive score, active action match score |
| `vectorMath.js` | Numerical similarity only: cosine similarity, normalization |
| **`biometrics.service.js`** | **All policy decisions**: apply thresholds; write verdicts to DB; emit audit events; issue/validate HMAC tokens; enforce 3-attempt lockout |

---

## 10. Embedding Vector Contract

- **Dimension**: Exactly **128** finite float values. No alternative accepted.
- **Normalization**: L₂-normalization performed server-side. Formula: $\hat{\mathbf{u}} = \mathbf{u} / \|\mathbf{u}\|_2$.
- **Validation** (by `vectorMath.js` before any storage or comparison):
  - Array length must equal exactly 128.
  - All values must be finite (no `NaN`, no `Infinity`, no `-Infinity`).
  - L₂ norm must be non-zero (zero vector rejected).
  - Dimension mismatch between reference and live embedding is an `INDETERMINATE` verdict.
- **Storage**: `face_biometrics.embedding` (JSONB). Embedding is the server-produced output; it is **never accepted as a client-supplied field**.
- **Model version immutability**: A `biometric_id` record's `model_version` is set at extraction time and never updated. Cross-model-version comparisons are rejected (`INDETERMINATE`) pending a re-enrollment.
- **Schema enforcement**: `biometrics.schemas.js` (Zod) rejects any request body field named `embedding`, `liveEmbedding`, `vector`, `faceVector`, or any alias — returning `400 Bad Request`.

---

## 11. Face Enrollment Flow

> **Invariant**: Client uploads raw binary image only. Server performs all detection, quality assessment, and embedding extraction. Client never computes or transmits an embedding.

1. Candidate navigates to `/candidate/biometrics/enroll`.
2. Browser activates webcam via `useMediaCapture`; `FaceOvalGuide` and `LightingIndicator` provide **advisory UX hints only** (no authoritative computation).
3. Candidate clicks "Capture Photo". Canvas extracts frame as JPEG blob (target: ≥ 640×480).
4. **[REQUEST UPLOAD URL]** Client calls `POST /api/v1/candidate/biometrics/enroll-url`:
   - Body: `{ fileName: string, mimeType: "image/jpeg"|"image/png", byteSize: number }`
   - Server: generates `biometricId = UUID`, `s3Key = face-biometrics/${biometricId}/${randomHex}.${ext}`, inserts `face_biometrics` row with `enrollment_status = 'PENDING_UPLOAD'`, mints 300s presigned SigV4 PUT URL.
   - Response `201`: `{ biometricId, uploadUrl, expiresInSeconds: 300 }`
5. **[S3 UPLOAD]** Client uploads raw binary JPEG/PNG directly to S3 via the presigned PUT URL.
6. **[CONFIRM UPLOAD]** Client calls `POST /api/v1/candidate/biometrics/enroll-confirm`:
   - Body: `{ biometricId: UUID }` — **no embedding, no quality metrics, no other fields**.
   - Server: verifies `doc.user_id === req.user.userId` (IDOR check); verifies status is `PENDING_UPLOAD`.
   - Server calls `headEvidenceObject`: verifies byte size > 0 and ≤ 10 MB.
   - Server calls `getEvidenceObjectHeader`: verifies JPEG/PNG magic bytes.
   - Server transitions record to `PENDING_EXTRACTION`.
   - Response `202`: `{ biometricId, enrollmentStatus: "PENDING_EXTRACTION" }`.
7. **[SERVER PIPELINE]** Asynchronously (or synchronously for v1):
   a. Download raw image buffer from S3.
   b. `faceDetector.js` → detect face, bounding box, pose angles.
   c. `qualityAnalyzer.js` → compute Q, sharpness, illumination, pose scores.
   d. If face not detected or Q < `BIOMETRIC_QUALITY_THRESHOLD`:
      - Delete S3 object via `deleteEvidenceObjectVersions`.
      - Transition `REJECTED`. Audit `BIOMETRIC_ENROLLMENT_REJECTED`.
   e. `embeddingExtractor.js` → extract 128-d vector + model version.
   f. `vectorMath.js` → validate, normalize.
   g. If existing `ENROLLED` record: transition it to `SUPERSEDED`.
   h. Transition current record to `ENROLLED`; persist embedding + quality metrics + model_version.
   i. Audit `BIOMETRIC_FACE_ENROLLED`.
8. **[POLL STATUS]** Client polls `GET /api/v1/candidate/biometrics/status` until `enrollmentStatus` is `ENROLLED` or `REJECTED`.
9. Client displays success or retry UI.

---

## 12. Liveness Media Upload Flow

**Following the Phase 24/15 established presigned-upload pattern.** A dedicated authorization step is required before the client may upload liveness frames.

### 12.1 Liveness Challenge Request
`POST /api/v1/candidate/biometrics/liveness-challenge`
- Auth: `STUDENT` (authenticated via `authenticate` middleware).
- Body: `{ sessionId: UUID }`.
- Server:
  1. Verifies the candidate is on the session roster.
  2. Checks the candidate has an `ENROLLED` biometric record.
  3. Generates `challengeId = UUID`, `nonce = crypto.randomBytes(32).toString('hex')`.
  4. Selects 2-action random sequence from `["HEAD_TURN_LEFT","HEAD_TURN_RIGHT","BLINK","SMILE"]`.
  5. Computes `liveMediaS3Key = liveness-frames/${challengeId}/${randomHex}.bin`.
  6. Inserts `liveness_challenges` row: `status = 'PENDING'`, `expires_at = NOW() + 8s`, `live_media_s3_key`, `live_media_consumed = false`.
  7. Mints 300s presigned SigV4 PUT URL for `liveMediaS3Key`.
  8. Emits audit `LIVENESS_CHALLENGE_ISSUED`.
- Response `200`: `{ challengeId, nonce, expectedActions: string[], expiresInSeconds: 8, liveMediaUploadUrl, expiresInSeconds: 300 }`.

### 12.2 Liveness Frame Upload
- Client uploads a **single binary blob** containing the captured frames (MIME: `video/webm` or `application/octet-stream`) directly to S3 via the presigned PUT URL received above.
- Maximum blob size: **5 MB** (enforced by `headEvidenceObject` size check on the server).
- Maximum clip duration: **12 seconds** (the 8s challenge window + 4s buffer).
- The S3 key was generated by the server; the client uses only the URL, not the key, to upload.

### 12.3 Liveness Verification Request
`POST /api/v1/candidate/biometrics/verify-liveness`
- Auth: `STUDENT`.
- Body: `{ challengeId: UUID, nonce: string }` — **no client-reported motion data, no timestamps, no action verdicts**.
- Server:
  1. Fetches `liveness_challenges` row for `challenge_id`.
  2. **Ownership check**: `challenge.user_id === req.user.userId`. If mismatch → `403 Forbidden`.
  3. **Session check**: `challenge.session_id === req.body.sessionId` (optional session binding field). If mismatch → `403 Forbidden`.
  4. **Nonce check**: `challenge.nonce === req.body.nonce`. If mismatch → `403 Forbidden`.
  5. **Terminal state check**: If `challenge.status ≠ 'PENDING'` → `409 Conflict` (`CHALLENGE_ALREADY_CONSUMED`).
  6. **Expiry check** (server clock): If `NOW() > challenge.expires_at` → transition to `EXPIRED`, audit `LIVENESS_CHALLENGE_EXPIRED`, return `422`.
  7. **Media presence check**: `headEvidenceObject(liveMediaS3Key)` — if object not found, return `422` (upload not completed).
  8. **Magic byte / size check**: validate blob header; reject and delete if invalid.
  9. **Mark as consumed**: Set `live_media_consumed = true` atomically (prevents concurrent double-evaluation).
  10. Download frame blob; run `livenessAnalyzer.js`:
      - Passive: texture gradient, micro-motion variance.
      - Active: pose/EAR/mouth-corner analysis vs. `expected_actions`.
  11. Record `passive_texture_score`, `active_action_score`.
  12. If scores fail thresholds or action mismatch: transition `FAILED`; delete S3 frames; audit `LIVENESS_CHALLENGE_FAILED`; return `422`.
  13. Transition `PASSED`; record `verified_at`; delete S3 frames immediately (frames are ephemeral).
  14. Issue HMAC-SHA256 liveness token: `payload = { userId, sessionId, challengeId, exp: now+300s }`.
  15. Audit `LIVENESS_CHALLENGE_PASSED`.
- Response `200` (pass): `{ passed: true, livenessToken }`.
- Response `422` (fail/expired): `{ passed: false, reason: string }`.

> **Media Lifecycle**: Liveness frame S3 objects are deleted immediately after server evaluation (not after 48 hours). The 48-hour `frames_purged_at` column is for tracking frames that were uploaded but the challenge expired before evaluation, handled by the cleanup job.

---

## 13. Face Verification Flow

> **Invariant**: Client uploads raw binary live selfie image. Server extracts live embedding. No embedding is computed or submitted by client.

1. Candidate completes liveness challenge → receives `livenessToken`.
2. Client captures live selfie frame as JPEG/PNG blob.
3. **[REQUEST UPLOAD URL]** Client calls `POST /api/v1/candidate/biometrics/verify-image-url`:
   - Body: `{ sessionId: UUID, mimeType: "image/jpeg"|"image/png", byteSize: number }`.
   - Server: generates `liveImageId = UUID`, `s3Key = biometric-live/${liveImageId}/${randomHex}.${ext}`, mints 300s presigned PUT URL. Inserts provisional `biometric_verifications` row with `final_status = 'PENDING'`, `live_image_s3_key`.
   - Response `201`: `{ liveImageId, uploadUrl, expiresInSeconds: 300 }`.
4. **[S3 UPLOAD]** Client uploads raw JPEG/PNG to S3 via presigned PUT URL.
5. **[CONFIRM VERIFICATION]** Client calls `POST /api/v1/candidate/biometrics/verify-face`:
   - Body: `{ liveImageId: UUID, livenessToken: string }` — **no `liveEmbedding` or any vector field**.
   - Server:
     a. Validates HMAC-SHA256 `livenessToken` (secret, binding, expiry, `userId`, `sessionId`, `challengeId`). If invalid → `401 Unauthorized`.
     b. IDOR check: `verification.user_id === req.user.userId`.
     c. `headEvidenceObject`: size and magic byte validation on live image.
     d. Downloads live image buffer from S3.
     e. `faceDetector.js` → detect face.
     f. `embeddingExtractor.js` → extract 128-d live embedding (server-side).
     g. `vectorMath.js` → validate + normalize.
     h. Fetches enrolled reference embedding from `face_biometrics WHERE enrollment_status = 'ENROLLED' AND user_id = req.user.userId`.
     i. Validates `reference.model_version === live.model_version`; if mismatch → `INDETERMINATE` verdict → prompt re-enrollment.
     j. `vectorMath.cosineSimilarity(referenceEmbedding, liveEmbedding)` → `score`.
     k. **Policy (biometrics.service.js only)**:
        - If `score ≥ BIOMETRIC_SIMILARITY_THRESHOLD`:
          - Update `biometric_verifications`: `final_status='VERIFIED'`, `match_verdict='MATCHED'`, `liveness_verdict='PASSED'`, `similarity_score`, `threshold_applied`.
          - Audit `BIOMETRIC_VERIFICATION_PASSED`.
          - Response `200`: `{ verified: true, similarityScore, threshold, attemptsRemaining: 3 - attempt_number, finalStatus: 'VERIFIED' }`.
        - If `score < threshold` and `attempt_number < 3`:
          - Increment `attempt_number`. Update `final_status='FAILED'`, `match_verdict='MISMATCH'`.
          - Audit `BIOMETRIC_VERIFICATION_FAILED`.
          - Response `200`: `{ verified: false, attemptsRemaining, finalStatus: 'FAILED' }`.
        - If `score < threshold` and `attempt_number = 3`:
          - Update `final_status='LOCKED'`.
          - Audit `BIOMETRIC_VERIFICATION_LOCKED`.
          - Response `403`: `{ error: 'BIOMETRIC_VERIFICATION_LOCKED', message: 'Maximum attempts exceeded. Contact your exam administrator.' }`.

---

## 14. Medical Exemption Governance

### 14.1 Assignment
- `student_configurations.proctoring_strictness = 'MEDICAL_EXEMPTION'` is a **candidate-level** configuration applying to all exam sessions for that student, unless superseded by session-level override.
- **Who can assign**: `ADMIN` role only, via `PATCH /api/v1/admin/users/:userId/configuration`.
- **Mandatory fields on assignment**: `reason` (minimum 20 characters); `effectiveFrom` (ISO 8601 date); `reviewDate` (ISO 8601 date, future-dated).
- **Expiration**: The configuration does not auto-expire. An `ADMIN` must explicitly revoke or change `proctoring_strictness` back to `'STANDARD'` or `'STRICT'`.

### 14.2 Biometric Controls Bypassed
- `VERIFIED` biometric check in `startAttempt`. The attempt proceeds without a biometric verification record.

### 14.3 Biometric Controls That Remain Mandatory
- `requireVerifiedActiveUser` (identity document approval) — **not bypassed**.
- Standard authentication (`authenticate` middleware) — **not bypassed**.
- Session roster check — **not bypassed**.
- Authoritative timing checks — **not bypassed**.

### 14.4 Immutable Audit on Every Exercise
Every time `startAttempt` bypasses the biometric gate due to `MEDICAL_EXEMPTION`, the following audit event **must** be emitted within the same ACID transaction:

```
BIOMETRIC_MEDICAL_EXEMPTION_APPLIED
{
  actorUserId:      <student user_id>,
  adminGrantedBy:   <user_id who last set proctoring_strictness>,   // from student_configurations
  sessionId:        <session_id>,
  attemptId:        <attempt_id>,                                    // set after insertion
  policyValue:      'MEDICAL_EXEMPTION',
  timestamp:        <server CURRENT_TIMESTAMP>
}
```

---

## 15. API Contract

> **GLOBAL INVARIANT**: No endpoint accepts `embedding`, `liveEmbedding`, `vector`, `faceVector`, `motionDelta`, or client-computed liveness scores as authoritative inputs. Schema validation (`biometrics.schemas.js`) returns `400 Bad Request` for any request body containing these fields.

### 15.1 Candidate Endpoints — `POST /api/v1/candidate/biometrics/...`

Auth on all: `authenticate` + `requireRole('STUDENT')`.

#### `POST /enroll-url`
- Body: `{ fileName: string, mimeType: "image/jpeg"|"image/png", byteSize: number }`
- Response `201`: `{ biometricId: UUID, uploadUrl: string, expiresInSeconds: 300 }`

#### `POST /enroll-confirm`
- Body: `{ biometricId: UUID }` — no other fields accepted.
- Response `202`: `{ biometricId: UUID, enrollmentStatus: "PENDING_EXTRACTION" }`
- Error `404`: biometric record not found.
- Error `403`: IDOR — not the authenticated user's record.
- Error `409`: record not in `PENDING_UPLOAD` state.
- Error `422`: S3 object not found, size invalid, or magic bytes mismatch.

#### `GET /status`
- Response `200`: `{ isEnrolled: boolean, enrollmentStatus: string, qualityScore: number|null, enrolledAt: string|null, modelVersion: string|null }`

#### `POST /liveness-challenge`
- Body: `{ sessionId: UUID }`
- Response `200`: `{ challengeId: UUID, nonce: string, expectedActions: string[], expiresInSeconds: 8, liveMediaUploadUrl: string, liveMediaUploadExpiresInSeconds: 300 }`
- Error `403`: candidate not on session roster.
- Error `409`: candidate not enrolled.

#### `POST /verify-liveness`
- Body: `{ challengeId: UUID, nonce: string }` — no motion data, no timestamps.
- Response `200` (pass): `{ passed: true, livenessToken: string }`
- Response `409`: challenge already consumed or terminal.
- Response `422`: expired, spoof detected, or action mismatch.

#### `POST /verify-image-url`
- Body: `{ sessionId: UUID, mimeType: "image/jpeg"|"image/png", byteSize: number }`
- Response `201`: `{ liveImageId: UUID, uploadUrl: string, expiresInSeconds: 300 }`

#### `POST /verify-face`
- Body: `{ liveImageId: UUID, livenessToken: string }` — **no embedding field**.
- Response `200`: `{ verified: boolean, similarityScore: number, threshold: number, attemptsRemaining: number, finalStatus: string }`
- Response `401`: invalid or expired liveness token.
- Response `403`: IDOR or `BIOMETRIC_VERIFICATION_LOCKED`.
- Response `422`: S3 object not found, face not detected, or extraction failed.

---

### 15.2 Admin Endpoints — `POST|GET /api/v1/admin/biometrics/...`

Auth on all: `authenticate` + `requireRole('ADMIN')`.

Admin responses **do not** expose:
- embedding vectors (any dimension)
- raw image bytes
- presigned URL signatures
- reusable nonces
- any field from `face_biometrics.embedding`

#### `GET /admin/biometrics/sessions/:sessionId`
- Query: `page`, `limit`, `status`
- Response `200`:
```json
{
  "verifications": [
    {
      "verificationId": "uuid",
      "userId": "uuid",
      "attemptNumber": 1,
      "finalStatus": "VERIFIED",
      "livenessVerdict": "PASSED",
      "matchVerdict": "MATCHED",
      "similarityScore": 0.9123,
      "threshold": 0.8500,
      "createdAt": "ISO8601"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 42 }
}
```

#### `POST /admin/biometrics/override`
- Body: `{ sessionId: UUID, studentId: UUID, reason: string }` — `reason` minimum 10 characters.
- Response `200`: `{ success: true, verificationId: UUID, finalStatus: "OVERRIDDEN", overriddenAt: string }`
- Emits audit: `BIOMETRIC_ADMIN_OVERRIDE`.

---

### 15.3 Invigilator & Faculty Access
- **Invigilator**: `GET /api/v1/sessions/:sessionId/roster` returns `biometricStatus: "VERIFIED"|"FAILED"|"LOCKED"|"PENDING"|"OVERRIDDEN"|"EXEMPTED"` badge per candidate. No similarity scores, no embeddings.
- **Faculty**: Aggregate `GET /api/v1/sessions/:sessionId/readiness-summary` → `{ verified: N, pending: N, locked: N }`. No individual biometric data.
- **Developer**: No biometric endpoint access; denied by `requireRole` middleware.

---

## 16. Attempt Gate — Race-Safety & Concurrency

The biometric gate check is inserted within the **existing** `startAttempt` ACID transaction at step 5a (after `FOR UPDATE` lock on `session_students`, before timing checks):

```
BEGIN TRANSACTION  (existing)
  SELECT ... FOR UPDATE → session_students           (existing)
  SELECT ... FOR UPDATE → existing attempt           (existing)

  -- [PHASE 25 INSERTION — Step 5a]
  SELECT student_configurations.proctoring_strictness
    WHERE user_id = $userId
    FOR SHARE;                                        ← prevents concurrent strictness change mid-transaction

  IF proctoring_strictness = 'MEDICAL_EXEMPTION':
    INSERT audit event BIOMETRIC_MEDICAL_EXEMPTION_APPLIED (within transaction)
    → proceed to timing check

  ELSE:
    SELECT * FROM biometric_verifications
      WHERE session_id = $sessionId AND user_id = $userId
      ORDER BY created_at DESC LIMIT 1
      FOR SHARE;                                      ← prevents concurrent status update

    IF final_status IN ('VERIFIED', 'OVERRIDDEN'): proceed
    IF final_status = 'LOCKED': ROLLBACK; throw 403 BIOMETRIC_VERIFICATION_LOCKED
    ELSE: ROLLBACK; throw 403 BIOMETRIC_VERIFICATION_REQUIRED

  -- timing checks, question mapping, attempt insertion  (existing)
COMMIT
```

**Race Conditions Handled**:

| Scenario | Outcome |
|---|---|
| Two simultaneous `startAttempt` calls for same candidate | `FOR UPDATE` on `session_students` serializes them; only one succeeds |
| Two simultaneous failed `/verify-face` calls (attempt counter) | `biometric_verifications` row is updated with `SELECT ... FOR UPDATE` in biometrics.service; second concurrent update sees incremented counter |
| 3rd failure vs. concurrent `startAttempt` | `FOR SHARE` on `biometric_verifications` in `startAttempt` sees the most recent `final_status` including `LOCKED` |
| Admin override concurrent with `startAttempt` | `FOR SHARE` in `startAttempt` sees `OVERRIDDEN` if override committed first; otherwise `LOCKED` (safe, conservative) |
| Admin revokes enrollment during startAttempt | Reference `face_biometrics` row FK `ON DELETE SET NULL` in `biometric_verifications`; `startAttempt` sees no `VERIFIED` record → throws `BIOMETRIC_VERIFICATION_REQUIRED` |

**No stronger consistency is claimed** than PostgreSQL's Read Committed + explicit row-level locking, which is the existing guarantee throughout `attempts.service.js`.

---

## 17. Backend Modules

New components in `backend/src/modules/biometrics/`:

| File | Type | Responsibility |
|---|---|---|
| `faceDetector.js` | NEW | Face detection, bounding box, landmarks, pose angles — numerical output only |
| `embeddingExtractor.js` | NEW | 128-d vector extraction from raw image buffer + model version — numerical output only |
| `livenessAnalyzer.js` | NEW | Passive texture/micro-motion + active pose/blink/smile analysis — numerical output only |
| `vectorMath.js` | NEW | L₂-normalization, dimension validation, cosine similarity |
| `qualityAnalyzer.js` | NEW | Laplacian variance, illumination, pose bounds, composite Q — numerical output only |
| `biometrics.schemas.js` | NEW | Zod schemas; rejects any `embedding`/`liveEmbedding`/`vector` field; all endpoint schemas |
| `biometrics.repository.js` | NEW | PostgreSQL queries for all three biometric tables |
| `biometrics.service.js` | NEW | All business policy: thresholds, verdicts, DB writes, audit events, HMAC tokens, lockout, override, exemption |
| `biometrics.controller.js` | NEW | HTTP handlers; standardized response envelopes |
| `biometrics.routes.js` | NEW | Express router for all biometric endpoints |

Modified:

| File | Type | Change |
|---|---|---|
| `backend/src/routes/index.js` | MODIFY | Mount `v1Router.use('/candidate', candidateRouter)` already exists for Phase 24; biometrics sub-router mounts under same `/candidate` namespace via `biometrics.routes.js`. Also mount `/admin/biometrics`. |
| `backend/src/modules/attempts/attempts.service.js` | MODIFY | Insert biometric gate at step 5a within existing ACID transaction |

---

## 18. Frontend Screens & Components

### 18.1 New Components (`frontend/src/components/biometrics/`)

| Component | Role |
|---|---|
| `FaceOvalGuide.jsx` | Canvas/SVG overlay; advisory UX only; no computation |
| `LightingIndicator.jsx` | Luminance meter; advisory UX only |
| `BiometricGate.jsx` | Multi-step verification widget; 8s countdown; uploads raw frames; no embedding |

### 18.2 Pages

| Page | Type | Route |
|---|---|---|
| `CandidateFaceEnrollmentPage.jsx` | NEW | `/candidate/biometrics/enroll` |
| `PreExamReadinessPage.jsx` | MODIFY | Embeds `BiometricGate` as Step 2; disables "Begin Examination" until Steps 1 and 2 complete |
| `frontend/src/App.jsx` | MODIFY | Register `/candidate/biometrics/enroll` route |
| `frontend/src/api/biometricsApi.js` | NEW | API helpers; no embedding parameters on any function |

---

## 19. Data Retention Policies

> **Immutable audit records are never purged** regardless of artifact deletion schedules.

| Artifact | Retention | Purge Event (audit_logs) | Column Tracking |
|---|---|---|---|
| Raw reference face images (`face-biometrics/` S3) | **90 days** from `created_at` | `BIOMETRIC_RAW_IMAGE_PURGED` | `face_biometrics.raw_image_purged_at` |
| Face embedding templates (PostgreSQL `embedding` column) | Until `REVOKED`; on `REVOKED` column zeroed/nulled. Metadata row retained permanently for audit chain | `BIOMETRIC_TEMPLATE_REVOKED` on revocation | Row retention: permanent; embedding field: nulled on revoke |
| Liveness challenge frames (S3) | **Deleted immediately** after server evaluation (success or failure). Cleanup job handles orphaned objects older than **48 hours** | `LIVENESS_FRAMES_PURGED` | `liveness_challenges.frames_purged_at` |
| Live verification selfies (`biometric-live/` S3) | **30 days** from `created_at` (dispute resolution window) | `BIOMETRIC_LIVE_IMAGE_PURGED` | `biometric_verifications.live_image_purged_at` |
| Challenge metadata (`liveness_challenges` rows) | **Minimum 1 year** post-exam completion | Bulk governance purge | n/a |
| Verification metadata (`biometric_verifications` rows) | **Minimum 1 year** post-exam completion | Bulk governance purge | n/a |
| Audit records (`audit_logs`) | **Permanent** — immutability enforced by PostgreSQL trigger (existing) | Never purged | n/a |

**Embedding Template Lifecycle Clarity**:
- Deleting an S3 reference image does **not** delete the biometric identity (the embedding in PostgreSQL is retained).
- Revoking a biometric template (`REVOKED` status) zeros the `embedding` field and nulls quality metrics but retains the row for audit chain integrity.
- A candidate seeking complete biometric data removal must follow the institutional data governance process, which is out of scope for Phase 25.

---

## 20. Security & Privacy Controls

1. **No client-provided embeddings**: Schema-level enforcement; any request body with `embedding`, `liveEmbedding`, `vector`, `faceVector` → `400 Bad Request`.
2. **No client liveness verdicts trusted**: `motionDelta`, client timestamps, and action assertions from the client are ignored.
3. **IDOR / BOLA defense**: All student endpoints verify `resource.user_id === req.user.userId`. Mismatched `biometricId`, `challengeId`, `liveImageId` → `403 Forbidden`.
4. **S3 media ownership verification**: Server derives/tracks the S3 key internally (not from the client). The client provides only an `id` (UUID); the server looks up the corresponding `s3_key` from the DB row it created.
5. **Log sanitization**: Embedding vectors, raw image buffers, presigned URL signatures, nonce values, and HMAC token values are **excluded** from all Winston/Pino log calls. The logger configuration enforces a `biometricSensitiveFields` redact list.
6. **Embedding non-exposure**: Embedding vectors are never included in any API response, any audit log payload, or any error body.
7. **Anti-tamper token**: Liveness tokens signed with HMAC-SHA256 (`config.ANTI_TAMPER_SECRET`) and validated on receive at `verify-face`.
8. **Admin data minimization**: Admin endpoints return only operational verdicts and audit metadata; no embedding arrays, no raw image bytes, no presigned signatures.
9. **Least privilege**: S3 IAM role grants `PutObject`, `GetObject`, `HeadObject`, `DeleteObject` only to the backend application role. `s3:GetBucketPolicy` and `s3:PutBucketPolicy` are explicitly denied. Public access is blocked at bucket level.
10. **Challenge one-time consumption**: `live_media_consumed` is set atomically before frame download begins. A concurrent second call for the same challenge sees `consumed=true` and is rejected `409`.

---

## 21. Audit Events

All events written to `audit_logs` via `recordAuditEvent()` within the relevant service transaction.

| Event | Trigger | Key Fields (no embedding data) |
|---|---|---|
| `BIOMETRIC_FACE_ENROLLED` | Extraction success → ENROLLED | `userId`, `biometricId`, `qualityScore`, `modelVersion` |
| `BIOMETRIC_ENROLLMENT_REJECTED` | Quality/detection gate fail | `userId`, `biometricId`, `reason` |
| `LIVENESS_CHALLENGE_ISSUED` | Challenge created | `userId`, `sessionId`, `challengeId`, `expectedActions` |
| `LIVENESS_CHALLENGE_PASSED` | Server confirms frames | `userId`, `challengeId`, `passiveScore`, `activeScore` |
| `LIVENESS_CHALLENGE_FAILED` | Server rejects frames | `userId`, `challengeId`, `reason` |
| `LIVENESS_CHALLENGE_EXPIRED` | TTL exceeded | `userId`, `challengeId` |
| `BIOMETRIC_VERIFICATION_ATTEMPTED` | Every `/verify-face` call | `userId`, `sessionId`, `attemptNumber` |
| `BIOMETRIC_VERIFICATION_PASSED` | sim ≥ threshold | `userId`, `sessionId`, `verificationId`, `similarityScore`, `threshold` |
| `BIOMETRIC_VERIFICATION_FAILED` | sim < threshold | `userId`, `sessionId`, `verificationId`, `attemptNumber` |
| `BIOMETRIC_VERIFICATION_LOCKED` | 3rd failure | `userId`, `sessionId`, `verificationId` |
| `BIOMETRIC_ADMIN_OVERRIDE` | Admin grants override | `adminUserId`, `studentUserId`, `sessionId`, `verificationId`, `reason` |
| `BIOMETRIC_MEDICAL_EXEMPTION_APPLIED` | startAttempt bypass | `actorUserId`, `adminGrantedBy`, `sessionId`, `attemptId`, `policyValue` |
| `BIOMETRIC_RAW_IMAGE_PURGED` | 90d purge job | `biometricId`, `s3Key` |
| `LIVENESS_FRAMES_PURGED` | Cleanup job | `challengeId`, `s3Key` |
| `BIOMETRIC_LIVE_IMAGE_PURGED` | 30d purge job | `verificationId`, `s3Key` |
| `BIOMETRIC_TEMPLATE_REVOKED` | Admin revokes enrollment | `adminUserId`, `studentUserId`, `biometricId` |

---

## 22. Performance Targets

> **All values below are ENGINEERING TARGETS** — not guarantees. Biometric similarity thresholds and FAR targets require empirical calibration against the selected model, hardware, capture conditions, and a representative evaluation dataset before they are treated as production policy. Targets will be refined during pre-production testing.

| Target | Value | Notes |
|---|---|---|
| Client pre-flight UX hint | ≤ 100 ms | Advisory only; no authoritative computation |
| S3 presigned PUT upload | ≤ 800 ms (broadband) | Engineering target |
| Server-side embedding extraction + similarity | ≤ 250 ms p95 | Includes S3 fetch, detection, extraction, comparison |
| End-to-end `/verify-face` latency | ≤ 1,500 ms p95 | Full round-trip |
| Liveness challenge window | ≤ 8.0 s | Server clock authoritative |
| Cosine similarity calculation | ≤ 5 ms | Purely mathematical; 128-d |
| Initial similarity threshold | 0.8500 | Starting policy; requires calibration |
| Target FAR | < 0.1% | Requires model-specific calibration and validation |

---

## 23. Test Strategy

### Level 1 — Static & Schema
- Zod schema validation for all biometric payloads.
- **[REQUIRED]** `biometrics.schemas.test.js`: Verify schema rejects request bodies containing `embedding`, `liveEmbedding`, `vector`, `faceVector`, `motionDelta` — returns 400.
- Migration structure: foreign key integrity, index presence, CHECK constraints, DEFAULT values.

### Level 2 — Subsystem Unit Tests
- `vectorMath.test.js`: L₂-norm, normalization, cosine similarity; zero-norm rejection; NaN/Infinity rejection; dimension mismatch rejection.
- `qualityAnalyzer.test.js`: Laplacian variance thresholds, illumination balance, pose bounds, composite Q.
- `faceDetector.test.js`: Face present vs. absent in test image fixtures; pose angle extraction.
- `embeddingExtractor.test.js`: Output is exactly 128 finite floats; model version tagged; deterministic on same input.
- `livenessAnalyzer.test.js`: Passive texture discriminates real frame vs. printed-photo fixture vs. screen-replay fixture; active action matching with mock frame sequences; action mismatch detected.

### Level 3 — API & Service Integration Tests
- `biometrics.service.test.js`:
  - **[REQUIRED — Embedding Injection A]**: Call `enrollFace` service method with `embedding: [...]` in the payload → service ignores it and extracts from raw image; verify DB stores server-derived embedding, not the injected value.
  - **[REQUIRED — Embedding Injection B]**: `verifyFace` service call with `liveEmbedding: [...]` → service ignores it; similarity computed from server-extracted embedding.
  - Enrollment: `enroll-url` → S3 mock → `enroll-confirm` → extraction pipeline → `ENROLLED`/`REJECTED`.
  - Verification: matching image → `VERIFIED`; mismatched image → `FAILED`; 3rd failure → `LOCKED`.
- `biometrics.api.test.js`:
  - **[REQUIRED — Schema Rejection]**: `POST /verify-face` with `liveEmbedding: [...]` → `400 Bad Request`.
  - **[REQUIRED — Schema Rejection]**: `POST /enroll-confirm` with `embedding: [...]` → `400 Bad Request`.
  - RBAC: non-STUDENT cannot access candidate endpoints; non-ADMIN cannot access admin endpoints; DEVELOPER denied all.

### Level 4 — Security & Anti-Forgery Tests
- **[REQUIRED — Nonce Reuse]**: Submit valid frames for challenge → `PASSED`. Submit same `challengeId` + `nonce` again → `409 Conflict`. Verify `status` remains `PASSED`; no new verification row created; `live_media_consumed` = true.
- **[REQUIRED — Expired Nonce Replay]**: Challenge with `expires_at` in the past → `422`. Verify challenge transitions to `EXPIRED`; no verification row created.
- **[REQUIRED — Wrong Action Sequence]**: Frames depicting wrong action sequence → `422 LIVENESS_FAILED`. Verify `liveness_challenges.status = 'FAILED'`.
- **[REQUIRED — Liveness Token Forgery]**: `POST /verify-face` with fabricated HMAC token (wrong secret or tampered payload) → `401 Unauthorized`.
- **[REQUIRED — Liveness Token Expiry]**: Valid token with `exp` in the past → `401 Unauthorized`.
- **[REQUIRED — IDOR — Wrong Candidate Media]**: Candidate A submits `challengeId` belonging to Candidate B → `403 Forbidden`.
- **[REQUIRED — IDOR — Wrong Session Media]**: Submit valid `challengeId` for a different session than the token `sessionId` → `403 Forbidden`.
- **[REQUIRED — Replayed Liveness Frames]**: Same frame blob reuploaded to a new presigned URL, new challenge → passive micro-motion analysis must detect static/replay content.
- **[REQUIRED — Concurrent Attempt Gate]**: Two concurrent `startAttempt` calls for the same (student, session) → only one attempt created; the second returns the existing attempt idempotently.
- **[REQUIRED — 3-Attempt Race]**: Two concurrent `/verify-face` calls on a candidate with 2 failed attempts → `attempt_number` does not exceed 3; exactly one transitions to `LOCKED`.
- **[REQUIRED — Medical Exemption Audit]**: `startAttempt` for a `MEDICAL_EXEMPTION` student → `BIOMETRIC_MEDICAL_EXEMPTION_APPLIED` audit entry created within same transaction; all required fields present.

### Level 5 — Cross-Module Integration
- `attemptBiometricGate.test.js`: `startAttempt` blocks `REQUIRED` (no verification); permits `VERIFIED`; permits `OVERRIDDEN`; blocks `LOCKED` with `403`; permits medical exemption and emits audit log.
- Frontend: `FaceOvalGuide.test.jsx`, `BiometricGate.test.jsx`, `PreExamReadinessPage.test.jsx` (Vitest + RTL): Verify no embedding computation occurs in browser; all API calls send only IDs and tokens, not vectors.

### Level 5 — Privacy Tests
- **[REQUIRED]**: Run server with test logger capturing all log output; perform full enrollment + verification flow; assert no `embedding`, `liveEmbedding`, raw image Buffer, presigned URL query string, or nonce value appears in log output.
- **[REQUIRED]**: API response bodies for all admin endpoints assert absence of `embedding`, `liveEmbedding` fields.

### Level 6 — Full Regression
- Complete backend suite: `npm run test`.
- Complete frontend suite: `npm run test`.
- Production bundle: `npm run build`.

---

## 24. Migration & Rollback

- **Forward**: `020_biometric_face_enrollment_and_verification.js` creates `face_biometrics`, `liveness_challenges`, `biometric_verifications` with indexes and constraints in dependency order.
- **Rollback**: `down()` drops tables in reverse order; idempotent.
- **Backward compatibility**: `BIOMETRIC_GATE_ENFORCED=false` environment flag allows legacy sessions and test fixtures to bypass the biometric gate (default: `true`).

---

## 25. Implementation Sequence

1. **Step 1** — Domain & Vector Math: `vectorMath.js`, `qualityAnalyzer.js`, `biometrics.schemas.js` (with embedding-injection rejection).
2. **Step 2** — ML Pipeline: `faceDetector.js`, `embeddingExtractor.js`, `livenessAnalyzer.js`.
3. **Step 3** — Database Migration: `020_biometric_face_enrollment_and_verification.js`.
4. **Step 4** — Repository & Service: `biometrics.repository.js`, `biometrics.service.js`.
5. **Step 5** — Controller & Routes: `biometrics.controller.js`, `biometrics.routes.js`; update `routes/index.js`.
6. **Step 6** — Attempt Gate: modify `attempts.service.js:startAttempt` (Step 5a insertion with medical exemption audit).
7. **Step 7** — Frontend: `biometricsApi.js`, `FaceOvalGuide`, `LightingIndicator`, `BiometricGate`.
8. **Step 8** — Frontend Pages: `CandidateFaceEnrollmentPage.jsx`, `PreExamReadinessPage.jsx` (Step 2 embed), `App.jsx`.
9. **Step 9** — Testing: Levels 1–6.
10. **Step 10** — Documentation update.

---

## 26. ADR Assessment

| Decision | Already Covered? | ADR Required? |
|---|---|---|
| Modular monolith, no premature microservices | Yes — Notion Step 13, DEVELOPMENT_PLAN.md | No |
| PostgreSQL as authoritative biometric state | Yes — §13.5 | No |
| Private S3 for binary media | Yes — §13.7 / ADR-0005 | No |
| Server-authoritative embedding extraction (no client compute) | Yes — defined explicitly in this plan as application of existing invariant | No |
| No commercial cloud biometric API | Yes — §5 (Non-Scope), consistent with existing non-lock-in policy | No |
| **Server-side ML model binary selection** | **Not pre-selected; implementation dependency** | **No new ADR required**: model selection is an *implementation detail* within the approved server-side AI boundary, not a change to the architecture. The boundary (server-only inference, no commercial API, 128-d output) is defined in this plan and consistent with authoritative sources. ADR would only be required if the model required a new infrastructure component (e.g., a dedicated GPU cluster). |

**Final ADR Verdict**: No new ADR required. The server-side AI boundary is an application of the existing modular monolith + server-authoritative processing invariant.

---

## 27. Definition of Done

Phase 25 is complete when and only when:
1. Reference face enrollment endpoint: accepts S3 uploads; validates magic bytes; runs server-side face detection, quality analysis, and embedding extraction; persists normalized 128-d embedding to PostgreSQL.
2. Enrollment schema rejects any request body containing an embedding or vector field with `400 Bad Request`.
3. Liveness challenge: generates single-use nonces with ≤ 8s TTL; issues presigned PUT URL for frames; evaluates actual submitted frames server-side; issues HMAC-signed token on pass.
4. Pre-exam face verification: client uploads raw image; server extracts live embedding; cosine similarity computed server-side; authoritative `VERIFIED`/`FAILED`/`LOCKED` verdict.
5. Verification schema rejects any `liveEmbedding` or vector field with `400 Bad Request`.
6. `startAttempt` gates on authoritative biometric verification record within ACID transaction; 3-attempt lockout enforced; admin override supported.
7. Medical exemption bypass is immutably audited (every exercise) with all required audit fields.
8. Separate retention policies implemented for all 5 artifact categories; purge events audited.
9. Admin endpoints return only operational verdicts; no embedding, no raw media, no presigned signatures.
10. All Level 1–6 tests pass (green), including all `[REQUIRED]` security/injection/IDOR tests.
11. Frontend production bundle builds cleanly (`npm run build`).
12. Clean git working tree, coherent commit history, PR generated and reviewed.

---

## 28. Final Consistency Audit Checklist

### Code & Plan Integrity
- [x] No source code changed during planning phase.
- [x] No migration files created during planning phase.
- [x] No PR created. No commits made.

### Architectural Consistency
- [x] Client never supplies authoritative embedding — verified in §1, §11, §12, §13, §15, §17.
- [x] Server generates embedding — defined in §9, §11, §13.
- [x] Server evaluates liveness media — defined in §12, §13.
- [x] Liveness challenge is single-use — nonce UNIQUE constraint + `live_media_consumed` flag — §8.2, §12.3, §20.
- [x] S3 media lifecycle complete — presign, upload, ownership verify, evaluate, delete — §12, §19.
- [x] Exact 128-d vector contract — §10; `embedding_dimension = 128` CHECK — §8.1.
- [x] Enrollment states consistent and complete — §7.1.
- [x] Verification states consistent and complete — §7.2, §7.3.
- [x] Medical exemption governed and audited — §14, §21.
- [x] Retention separated by artifact type — §19.
- [x] Admin responses minimize sensitive data — §15.2, §15.3.
- [x] Attempt gate race behavior defined — §16.
- [x] Performance values labeled as engineering targets — §22.
- [x] No `PENDING_REVIEW` state (removed — not used).
- [x] No `embedding_dimension IN (128, 512)` (removed — exactly 128).
- [x] No `motionDelta` as authoritative evidence.
- [x] No unexplained `framesS3Key` — replaced with full lifecycle definition in §12.
- [x] No unrestricted medical bypass — §14 defines governance.
- [x] ADR assessment complete — §26.

### API Consistency
- [x] All endpoints listed in §15 match flows in §11–§13.
- [x] No endpoint accepts embedding, liveEmbedding, vector, faceVector, motionDelta as inputs.
- [x] Admin endpoints enumerate exact response fields — §15.2.
- [x] RBAC defined for all roles including Invigilator, Faculty, Developer — §15.3.

### Test Plan
- [x] All `[REQUIRED]` security tests specified — §23 Levels 3–5.
- [x] Embedding injection covered (schema + service layer) — Level 3.
- [x] Nonce reuse, replay, expiry, action mismatch, token forgery — Level 4.
- [x] S3 IDOR coverage — Level 4.
- [x] Concurrent attempt gate race — Level 4.
- [x] Medical exemption audit test — Level 4.
- [x] Privacy / log-sanitization tests — Level 5.

---

> **PLAN STATUS: READY FOR APPROVAL**
> **IMPLEMENTATION STATUS: NOT STARTED**
> **NEXT GATE: APPROVE PLAN**
