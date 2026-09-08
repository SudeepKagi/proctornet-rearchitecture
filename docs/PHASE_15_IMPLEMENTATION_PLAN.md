# Phase 15 — Evidence Storage Implementation Plan

## 1. Executive Summary

Phase 15 establishes the **Evidence Storage Layer (Data Plane)** for the ProctorNet online examination platform. While Phase 14 established the lightweight, server-authoritative Proctoring Control Plane for telemetry and anomaly scoring, Phase 15 introduces secure, direct-to-object-storage persistence and lifecycle management for binary proctoring evidence artifacts (webcam snapshots, screen captures, and ambient audio snippets).

The architecture strictly decouples heavy binary media transfers from the core Node.js application server:
1. **Direct-to-S3 Uploads via Presigned PUT URLs**: Binary evidence payloads bypass the application server and upload directly from the candidate browser to private, encrypted S3 object storage using short-lived AWS Signature Version 4 (SigV4) presigned `PUT` URLs.
2. **Authoritative PostgreSQL Metadata Tracking & State Machine**: S3 presigned `PUT` URLs represent temporary authorization and are **not** intrinsically single-use at the AWS S3 protocol level. Therefore, logical upload uniqueness, state progression, and immutability are authoritatively governed by PostgreSQL (`evidence_records` table).
3. **Atomic Verification & S3 VersionId Pinning**: Evidence is not marked usable (`AVAILABLE`) until the candidate client issues a confirmation request (`POST /confirm`), during which the backend acquires an exclusive row lock (`SELECT ... FOR UPDATE`) and authoritatively verifies object existence, exact byte size, and MIME content type via S3 `HeadObjectCommand`. The backend captures the exact S3 `VersionId` returned by S3 and pins it to `evidence_records.s3_version_id`.
4. **Physical vs. Logical Immutability**: While S3 may physically accept another PUT if an old presigned URL remains unexpired, the logical evidence record in PostgreSQL is immutable once `AVAILABLE`. Staff playback presigned `GET` URLs explicitly pin `VersionId: evidence.s3_version_id`, ensuring invigilators always retrieve the exact binary payload validated during confirmation, rendering any subsequent unvalidated S3 PUT ineffective.
5. **Target Development Infrastructure & S3 Versioning**: The target development environment uses the provisioned bucket `proctornet-evidence-dev-01` in AWS region `ap-south-1`. Because this bucket has **`Versioning = ENABLED`**, evidence purge and cleanup operations are explicitly version-aware, utilizing paginated `ListObjectVersionsCommand` and batched `DeleteObjectsCommand` to permanently delete all object versions and delete markers, guaranteeing deterministic zero-byte destruction.
6. **Strict Private Storage & Audited Retrieval**: S3 buckets enforce Amazon S3 Block Public Access with zero public read/write permissions. Authorized invigilators, faculty, and administrators access evidence via short-lived (15-minute) presigned `GET` URLs generated on-demand, with mandatory centralized audit logging (`EVIDENCE_ACCESSED`). Candidates are strictly denied download and playback access.
7. **Client-Declared Checksum & Format Validation (Integrity Declaration)**: Candidate clients supply a SHA-256 digest computed prior to upload. The backend validates the 64-character hex format and stores it in PostgreSQL for forensic audit and dispute resolution. The backend validates size and MIME via S3 `HeadObjectCommand`; server-side binary payload re-hashing is explicitly out of scope for Phase 15 and deferred to Phase 18.
8. **Decoupled Maintenance Sweepers & Zero Unconsumed Outbox Events**: Maintenance sweepers use an explicit lease/claim pattern (`claim_expires_at`) to decouple database transactions from external S3 network calls, preventing PostgreSQL connection pool starvation. RabbitMQ is not used for evidence events in Phase 15 to prevent unconsumed outbox records.

---

## 2. Authoritative Architecture References

This implementation plan is governed by the authoritative architectural sources in the following strict hierarchy:
1. **Notion Step 13 Final Re-Architecture — Implementation Master**:
   - **Section 13.5**: Security, Resource-Level Access Control (RBAC/ABAC), and Tamper-Proof Cryptographic Verification.
   - **Section 13.7**: Proctoring, Media & Evidence Separation (Control Plane vs. Data Plane vs. Realtime Media Plane).
   - **Section 13.17**: Operational Scalability, Rate Limiting, and Presigned Direct Storage Offload.
2. **`docs/ARCHITECTURE.md` (Section 6)**:
   - *Evidence Storage (Data Plane)*: Visual/audio evidence uploaded directly to S3 using short-lived pre-signed URLs. Metadata references recorded authoritatively in PostgreSQL.
3. **`docs/DEVELOPMENT_PLAN.md` (Phase 15)**:
   - Objectives, major tasks, acceptance criteria, direct-to-S3 uploads, confirmation validation, and signed playback URLs.
4. **Existing Repository Baseline (Phase 14 Complete)**:
   - Migration `016_proctoring_events_and_flags.js`, `exam_attempts`, `violation_events`, `violation_flags`, centralized audit service (`015_audit_immutability.js`), transactional outbox (`013_outbox_and_idempotency.js`), Prometheus metrics registry (`prom-client`), and Redis sliding-window rate limiters.

---

## 3. Current Repository Assumptions & Baseline

1. **Database Schema**:
   - `exam_attempts`: Primary key `attempt_id UUID`, candidate `student_id UUID`, session `session_id UUID`, status enum (`ACTIVE`, `SUBMITTED`, `EXPIRED`), proctoring `risk_score INT`.
   - `exam_sessions`: Primary key `session_id UUID`, associated with `exam_id UUID`.
   - `session_invigilators`: Maps `session_id` to `user_id` for staff assignments.
   - `violation_events`: Migration 009 defined `evidence_object_key TEXT` (nullable) to associate a telemetry violation with an evidence artifact.
   - `violation_flags`: Migration 016 created flag records (`flag_id UUID`).
   - `audit_logs`: Immutable audit trail with row/statement triggers (Migration 015) preventing modification or deletion.
2. **Infrastructure & AWS Development Environment**:
   - AWS Region: `ap-south-1`
   - S3 Bucket: `proctornet-evidence-dev-01`
   - Bucket Configuration: General purpose, Account Regional namespace, ACLs disabled / Bucket owner enforced, Block Public Access = ON, Versioning = ENABLED, Encryption = SSE-S3.
   - Local AWS credentials: Bound via the standard AWS default credential provider chain (environment variables `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` / AWS CLI profile in `~/.aws/credentials`). Zero hardcoded secrets in source or configuration.
   - PostgreSQL 16+ pool with transactional client checkout (`getPool().connect()`).
   - Redis 7+ client (`ioredis`) with graceful fallback to in-memory store.
   - Pino structured logging with W3C trace context correlation (`traceId`, `spanId`, `requestId`).
   - Prometheus metrics registry (`src/infrastructure/metrics/registry.js`).
3. **Dependencies to Introduce in Backend**:
   - `@aws-sdk/client-s3` (AWS SDK v3 modular client for S3 operations: `HeadObjectCommand`, `DeleteObjectCommand`, `DeleteObjectsCommand`, `ListObjectVersionsCommand`).
   - `@aws-sdk/s3-request-presigner` (v3 utility for generating SigV4 presigned `PUT` and `GET` URLs).

---

## 4. Scope

### In-Scope (Phase 15 — Evidence Storage Layer):
* **Database Schema Evolution (Migration 017)**:
  * Create `evidence_records` table linking evidence artifacts to attempts, sessions, students, and optional violations/flags.
  * Store server-pinned `s3_version_id VARCHAR(128)` and worker lease `claim_expires_at TIMESTAMPTZ`.
  * Define lifecycle states: `INITIATED`, `AVAILABLE`, `FAILED`, `ABANDONED`, `PURGED`.
  * Establish indexes for attempt queries, session aggregation, upload expiration cleanup, and retention enforcement.
  * Provide complete, safe `up` and `down` migration functions.
* **S3 Infrastructure & Client Abstraction (`src/infrastructure/storage/`)**:
  * Implement modular storage client wrapper (`s3Storage.js`) supporting AWS S3, MinIO, and LocalStack.
  * Initialize S3 client via validated environment variables (`AWS_REGION`, `S3_BUCKET_NAME`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`).
  * Helper functions:
    * `generatePresignedUploadUrl(bucket, key, contentType, byteSize, expiresInSeconds)`
    * `generatePresignedDownloadUrl(bucket, key, contentType, expiresInSeconds, versionId)`
    * `headEvidenceObject(bucket, key)`
    * `deleteEvidenceObjectVersions(bucket, key)` (paginated, version-aware permanent destruction)
* **Evidence Management Module (`src/modules/evidence/`)**:
  * `evidence.schemas.js`: Strict Zod validation schemas for upload-url requests, confirmation payloads, and query parameters.
  * `evidence.repository.js`: Parameterized PostgreSQL queries supporting transactional row locking (`FOR UPDATE` and `FOR UPDATE SKIP LOCKED`).
  * `evidence.service.js`: Core workflows:
    1. **Initiate upload**: Authenticate, verify active attempt, validate MIME/size, insert `INITIATED` record, mint presigned `PUT` URL.
    2. **Confirm upload**: Authenticate, acquire exclusive row lock (`FOR UPDATE`), verify object via S3 `HeadObject`, pin `s3_version_id`, transition to `AVAILABLE`, cross-link to `violation_events` if applicable. Idempotent on repeated calls.
    3. **Query evidence**: Paginated attempt-level evidence listing and metadata inspection.
    4. **Retrieve playback URL**: Authorize staff assignment, verify `AVAILABLE` status, generate short-lived presigned `GET` URL pinned to `s3_version_id`, emit centralized `EVIDENCE_ACCESSED` audit event.
    5. **Soft-delete / purge**: Authorized faculty/admin purge triggering S3 version-aware binary deletion and marking row `PURGED`.
  * `evidence.controller.js` & `evidence.routes.js`: Express endpoints mounted under `attemptsRouter`.
* **Asynchronous Maintenance Sweepers**:
  * Scheduled, bounded database workers using a safe lease/claim pattern (`claim_expires_at`) that executes external S3 calls outside open PostgreSQL transactions:
    1. **Orphaned Upload Sweeper**: Sweeps unconfirmed `INITIATED` records past TTL, permanently prunes S3 objects/versions, transitions status to `ABANDONED`.
    2. **Retention Purge Sweeper**: Sweeps `AVAILABLE` records past retention expiration, permanently deletes S3 objects/versions, transitions status to `PURGED`, records `EVIDENCE_PURGED` in `audit_logs`.
* **Observability & Audit Trail**:
  * Register Prometheus metrics: `proctornet_evidence_uploads_initiated_total`, `proctornet_evidence_uploads_confirmed_total`, `proctornet_evidence_downloads_total`, `proctornet_evidence_bytes_total`, `proctornet_evidence_storage_latency_seconds`.
  * Audit logging via centralized `recordAuditEvent`: `EVIDENCE_UPLOAD_INITIATED`, `EVIDENCE_UPLOAD_CONFIRMED`, `EVIDENCE_ACCESSED`, `EVIDENCE_PURGED`.
* **Frontend Evidence Integration**:
  * API service client (`frontend/src/api/evidenceApi.js`).
  * Invigilator evidence gallery modal in `SessionMonitorPage.jsx` for viewing candidate snapshots and playback URLs.

---

## 5. Explicit Non-Goals & Phase Boundaries

To maintain strict modularity and prevent scope creep, the following are strictly out of scope for Phase 15:
* **Hardware Media Capture Subsystem (Deferred to Phase 16/17)**:
  * Phase 15 implements the **Evidence Storage Data Plane** only.
  * Browser hardware access APIs (`navigator.mediaDevices.getUserMedia`, `navigator.mediaDevices.getDisplayMedia`), `MediaRecorder`, continuous audio recording loops, canvas snapshot extraction, and webcam/screen permission dialogues are **strictly out of scope** for Phase 15.
  * Media streams, WebRTC publishers, and live proctoring feeds belong to **Phase 17 (WebRTC & SFU)**; signaling triggers belong to **Phase 16 (WebSocket)**.
* **Deep Binary Malware Scanning & Sandboxing (Deferred to Phase 18)**:
  * Heavy antivirus pipelines (e.g., ClamAV daemons, AWS GuardDuty malware scanning for S3, dynamic sandboxing) are **out of scope** for Phase 15 and explicitly deferred to **Phase 18 — Security Hardening**.
  * Phase 15 enforces structural defenses: strict MIME allowlisting, server-controlled extension mapping, exact size validation, client SHA-256 format checking, and browser-safe `inline` Content-Disposition.
* **Real-Time WebSockets (Phase 16)**: No WebSocket server handshakes, candidate socket heartbeats, or Socket.io/Redis pub-sub broadcasting.
* **Continuous Multi-Hour Video Archival**: Phase 15 persists discrete snapshots and audio snippets. Full-length session video archival belongs to Phase 17 SFU integration.
* **Public File Sharing**: No public S3 buckets, unauthenticated CDNs, or permanent URLs.
* **Microservices & Kubernetes**: Monolith architecture preserved.

---

## 6. Evidence Taxonomy

Phase 15 standardizes three discrete, high-value proctoring evidence classes:

| Evidence Type | Source Context | Supported MIME Types | Max Size | Capture Mode | Retention Policy | Association |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`WEBCAM_SNAPSHOT`** | Candidate Video Device | `image/jpeg`, `image/png`, `image/webp` | **5 MB** | Direct PUT / S3 Verify | Configurable default 90 Days | Optional (routine or flag-linked) |
| **`SCREEN_CAPTURE`** | Candidate Display / Window API | `image/jpeg`, `image/png`, `image/webp` | **10 MB** | Direct PUT / S3 Verify | Configurable default 90 Days | Recommended (linked to display/blur flag) |
| **`AUDIO_SNIPPET`** | Candidate Microphone Device | `audio/webm`, `audio/ogg`, `audio/wav` | **5 MB** | Direct PUT / S3 Verify | Configurable default 90 Days | Optional (acoustic telemetry event) |

### Evidence Constraints & Rules:
1. **No Arbitrary Executables or Documents**: Only whitelisted image and audio MIME types are permitted. Submissions of PDFs, binaries, archives, or script files are rejected with `400 Bad Request`.
2. **Pre-allocated Object Keys**: Object keys are generated strictly on the server using UUIDs. The client has zero ability to specify or influence the S3 path, preventing path traversal and key collision attacks.
3. **Bound to Active Attempt**: Evidence upload initiation is permitted only while an exam attempt is in `ACTIVE` status. Initiating uploads for `SUBMITTED`, `EXPIRED`, or non-existent attempts is rejected with `409 Conflict`.
4. **Configurable Retention Policy**: The 90-day retention duration is an **operational default** (`EVIDENCE_RETENTION_DAYS = 90`) and is **not** a statutory legal mandate. Retention expiration is authoritatively computed from the evidence confirmation timestamp:
   $$\text{retention\_expires\_at} = \text{confirmed\_at} + (\text{EVIDENCE\_RETENTION\_DAYS} \times 1\text{ day})$$

---

## 7. Data Model & Database Migration

### Migration 017: `backend/migrations/017_evidence_storage.js`

```javascript
/**
 * Migration 017: Evidence Storage Metadata and Lifecycle
 * Implements Phase 15 database schema for proctoring evidence tracking.
 */
export async function up(pgm) {
  pgm.sql(`
    -- 1. Create evidence_records table
    CREATE TABLE IF NOT EXISTS evidence_records (
      evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id UUID NOT NULL REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
      session_id UUID NOT NULL REFERENCES exam_sessions(session_id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      violation_id UUID REFERENCES violation_events(violation_id) ON DELETE SET NULL,
      flag_id UUID REFERENCES violation_flags(flag_id) ON DELETE SET NULL,
      
      -- Evidence classification
      evidence_type VARCHAR(64) NOT NULL CHECK (evidence_type IN ('WEBCAM_SNAPSHOT', 'SCREEN_CAPTURE', 'AUDIO_SNIPPET')),
      
      -- S3 object storage location & verification metadata
      bucket_name VARCHAR(128) NOT NULL,
      object_key VARCHAR(512) NOT NULL UNIQUE,
      s3_version_id VARCHAR(128), -- Authoritative S3 VersionId pinned at confirmation
      content_type VARCHAR(128) NOT NULL,
      declared_byte_size INT NOT NULL CHECK (declared_byte_size > 0),
      actual_byte_size INT CHECK (actual_byte_size >= 0),
      sha256_checksum VARCHAR(64) CHECK (sha256_checksum IS NULL OR sha256_checksum ~ '^[a-fA-F0-9]{64}$'),
      
      -- Lifecycle state machine
      status VARCHAR(32) NOT NULL DEFAULT 'INITIATED' 
        CHECK (status IN ('INITIATED', 'AVAILABLE', 'FAILED', 'ABANDONED', 'PURGED')),
      
      -- Time-to-live and retention tracking
      upload_expires_at TIMESTAMPTZ NOT NULL,
      confirmed_at TIMESTAMPTZ,
      retention_expires_at TIMESTAMPTZ,
      claim_expires_at TIMESTAMPTZ, -- Concurrency lease for background workers
      
      -- Audit and metadata
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Indexes for efficient lookup, timeline aggregation, and cleanup sweeps
    CREATE INDEX IF NOT EXISTS idx_evidence_records_attempt_status
      ON evidence_records(attempt_id, status);

    CREATE INDEX IF NOT EXISTS idx_evidence_records_session_status
      ON evidence_records(session_id, status);

    CREATE INDEX IF NOT EXISTS idx_evidence_records_violation
      ON evidence_records(violation_id)
      WHERE violation_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_evidence_records_flag
      ON evidence_records(flag_id)
      WHERE flag_id IS NOT NULL;

    -- Index for background retention purge worker (sweep expired available evidence)
    CREATE INDEX IF NOT EXISTS idx_evidence_records_retention_sweep
      ON evidence_records(status, retention_expires_at, claim_expires_at)
      WHERE status = 'AVAILABLE';

    -- Index for background upload timeout worker (sweep unconfirmed abandoned uploads)
    CREATE INDEX IF NOT EXISTS idx_evidence_records_abandoned_sweep
      ON evidence_records(status, upload_expires_at, claim_expires_at)
      WHERE status = 'INITIATED';
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_evidence_records_abandoned_sweep;
    DROP INDEX IF EXISTS idx_evidence_records_retention_sweep;
    DROP INDEX IF EXISTS idx_evidence_records_flag;
    DROP INDEX IF EXISTS idx_evidence_records_violation;
    DROP INDEX IF EXISTS idx_evidence_records_session_status;
    DROP INDEX IF EXISTS idx_evidence_records_attempt_status;
    DROP TABLE IF EXISTS evidence_records;
  `);
}
```

### Architectural Justification of Denormalized Fields:
* `session_id` and `student_id` are denormalized on `evidence_records` to mirror the pattern established in Migration 016 (`violation_flags`).
* **Justification**: Invigilators monitor multi-student sessions in real-time. Denormalizing `session_id` enables $O(1)$ indexed queries (`idx_evidence_records_session_status`) for session-wide evidence summaries without requiring costly multi-table joins on `exam_attempts` during peak exam concurrency.
* **Server-Authoritative Derivation**: Clients can **never** submit `session_id` or `student_id`. During upload initiation, the service loads the authoritative `exam_attempts` record via `SELECT session_id, student_id FROM exam_attempts WHERE attempt_id = $1` and writes these server-verified values directly.

---

## 8. S3 Object Storage Architecture, CORS & Versioning Strategy

### 8.1 S3 Bucket Configuration
The development environment binds to the pre-provisioned AWS S3 bucket:
* **Bucket Name**: `proctornet-evidence-dev-01`
* **AWS Region**: `ap-south-1`
* **Block Public Access**: `ON` (`BlockPublicAcls = true`, `IgnorePublicAcls = true`, `BlockPublicPolicy = true`, `RestrictPublicBuckets = true`).
* **Bucket Owner Enforced**: ACLs disabled.
* **Server-Side Encryption**: `SSE-S3` (`AES256`).
* **Versioning**: **`ENABLED`**.
* **Transport**: TLS 1.3 / HTTPS enforced.

### 8.2 Mandatory S3 Bucket CORS Configuration
Because candidate web browsers upload binary evidence directly to S3 via presigned `PUT` URLs from a browser origin, S3 must respond to browser cross-origin preflight (`OPTIONS`) requests with explicit CORS headers. 

The S3 bucket `proctornet-evidence-dev-01` requires the following CORS configuration:
```json
[
  {
    "AllowedHeaders": [
      "Content-Type",
      "x-amz-*"
    ],
    "AllowedMethods": [
      "PUT"
    ],
    "AllowedOrigins": [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://*.proctornet.internal"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```
* **CORS Security Boundary**: CORS governs browser-side cross-origin access and does **not** grant public read or write access to the bucket. Block Public Access remains fully `ON`. Authorization for every upload and download is strictly gated by SigV4 presigned URL signatures and IAM credentials.
* **No Wildcard Origins**: Wildcard `*` origins are strictly prohibited.

### 8.3 S3 Versioning & Deletion Architecture
Because the bucket has `Versioning = ENABLED`, a standard S3 `DeleteObjectCommand` merely places an S3 **Delete Marker** on the object; the binary payload remains stored in S3 as a noncurrent version, continuing to incur storage costs and remaining retrievable if queried by `VersionId`.

To achieve true data destruction upon retention expiration or administrative purge, ProctorNet selects the **Application-Managed Version Deletion** strategy:
1. When an evidence record is purged or an abandoned upload is cleaned up, the backend invokes `s3Storage.deleteEvidenceObjectVersions(bucket, objectKey)`.
2. **Pagination Handling**: The method queries `ListObjectVersionsCommand` in a loop while `IsTruncated === true`, passing `KeyMarker: data.NextKeyMarker` and `VersionIdMarker: data.NextVersionIdMarker` from the previous response.
3. **Identifier Collection**: It collects all version identifiers from both `Versions` (current and noncurrent object payloads) and `DeleteMarkers` matching `objectKey`.
4. **Batch Deletion**: It splits deletion requests into chunks of at most 1,000 identifiers and calls `DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk, Quiet: true } })`.
5. **Partial Error Validation**: It inspects `DeleteObjectsCommand` responses. If `response.Errors && response.Errors.length > 0`, the method throws an error detailing the failed version IDs. The database record is **not** marked `PURGED`, ensuring that maintenance sweepers retry the operation until all versions and delete markers are confirmed destroyed.

### 8.4 Least-Privilege IAM Policy
The backend IAM role / user policy requires:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ProctorNetEvidenceObjectOperations",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion"
      ],
      "Resource": "arn:aws:s3:::proctornet-evidence-dev-01/evidence/*"
    },
    {
      "Sid": "ProctorNetEvidenceBucketVersionListing",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucketVersions"
      ],
      "Resource": "arn:aws:s3:::proctornet-evidence-dev-01",
      "Condition": {
        "StringLike": {
          "s3:prefix": ["evidence/*"]
        }
      }
    }
  ]
}
```
* **No Administrative Privileges**: Broad `s3:*` or `AmazonS3FullAccess` is strictly forbidden.
* **Scoped Versioning Permissions**: `s3:DeleteObjectVersion` and `s3:ListBucketVersions` are strictly required for version-aware purge workflows.

### 8.5 Object Key Naming Convention
Object keys are generated strictly on the server:
```text
evidence/${sessionId}/${attemptId}/${evidenceType}/${evidenceId}.${extension}
```
* **Collision-Proof**: Hierarchically partitioned using server-verified UUIDs.
* **Deterministic Extension**: Derived strictly from server-sanitized MIME type (`image/jpeg` $\to$ `jpg`, `image/png` $\to$ `png`, `image/webp` $\to$ `webp`, `audio/webm` $\to$ `webm`, `audio/ogg` $\to$ `ogg`, `audio/wav` $\to$ `wav`).
* **Zero PII**: Contains no student usernames, email addresses, or client-specified filenames.

---

## 9. Direct Upload, Verification & Finalization Flow

### 9.1 Sequence Diagram

```
[Candidate Browser]             [Node.js Backend]             [PostgreSQL]              [AWS S3]
        |                               |                          |                       |
        | 1. POST /evidence/upload-url  |                          |                       |
        |------------------------------>|                          |                       |
        |                               | 2. Verify Active Attempt |                       |
        |                               |    & Validate MIME/Size  |                       |
        |                               |------------------------->|                       |
        |                               | 3. INSERT INITIATED row  |                       |
        |                               |<-------------------------|                       |
        |                               | 4. Generate S3 PUT URL   |                       |
        |                               |    (TTL: 300s, SigV4)    |                       |
        | 5. Return uploadUrl & id      |                          |                       |
        |<------------------------------|                          |                       |
        |                                                                                  |
        | 6. Direct HTTP PUT binary to uploadUrl (SigV4 temporary authorization)          |
        |--------------------------------------------------------------------------------->|
        | 7. 200 OK (ETag, S3 creates VersionId A)                                         |
        |<---------------------------------------------------------------------------------|
        |                                                                                  |
        | 8. POST /evidence/:id/confirm |                          |                       |
        |------------------------------>|                          |                       |
        |                               | 9. SELECT FOR UPDATE     |                       |
        |                               |    (Lock evidence row)   |                       |
        |                               |------------------------->|                       |
        |                               | 10. HeadObjectCommand (verify size, MIME, verId) |
        |                               |------------------------------------------------->|
        |                               | 11. S3 ContentLength, ContentType, VersionId A   |
        |                               |<-------------------------------------------------|
        |                               | 12. UPDATE status='AVAILABLE'                    |
        |                               |     s3_version_id = 'VersionId A'                |
        |                               |     actual_byte_size, confirmed_at, retention    |
        |                               |     (Optional: link violation_events key)        |
        |                               |------------------------->|                       |
        |                               | 13. COMMIT Transaction   |                       |
        | 14. 200 OK (Confirmed Data)   |                          |                       |
        |<------------------------------|                          |                       |
```

### 9.2 Authoritative Presigned PUT Semantics, Uniqueness & Version Pinning
1. **Presigned PUT is Temporary Authorization, Not Single-Use**:
   - An AWS S3 presigned PUT URL authorizes any client holding the URL to PUT data to the specified key until `X-Amz-Expires` (300 seconds) elapses.
   - S3 itself does **not** invalidate the signed URL after the first request.
2. **Logical Immutability in PostgreSQL**:
   - The server creates an immutable row with a unique `evidence_id` and unique `object_key` in status `INITIATED`.
   - During confirmation (`POST /confirm`), the backend checks out a transactional database client and executes:
     ```sql
     SELECT * FROM evidence_records WHERE evidence_id = $1 AND attempt_id = $2 FOR UPDATE;
     ```
   - If `status === 'AVAILABLE'`, the confirmation is recognized as an idempotent retry; the server returns the existing confirmed data (`200 OK`) immediately without mutating any fields.
   - If `status === 'INITIATED'`, the server calls S3 `HeadObjectCommand` to verify that:
     1. The object exists in S3 (404 transitions to `FAILED`).
     2. `headResult.ContentLength === declared_byte_size` (exact byte equality; no tolerance window).
     3. `headResult.ContentType` matches the registered MIME type.
   - Upon successful verification, the backend reads `headResult.VersionId` and updates the database row:
     `status = 'AVAILABLE'`,
     `s3_version_id = headResult.VersionId`,
     `actual_byte_size = headResult.ContentLength`,
     `confirmed_at = CURRENT_TIMESTAMP`,
     `retention_expires_at = CURRENT_TIMESTAMP + (INTERVAL '1 day' * EVIDENCE_RETENTION_DAYS)`.
3. **Physical S3 Versioning Defense**:
   - Because the bucket has versioning enabled, if a client executes a second PUT to S3 using the same presigned URL before 300s elapses, S3 will accept it and create a newer VersionId (e.g. `VersionId B`).
   - However, the ProctorNet database record is already finalized and pinned to `s3_version_id = 'VersionId A'`. Subsequent confirmation attempts return the existing confirmed data idempotently and **cannot** update `s3_version_id`.
   - When staff request playback URLs (`GET /url`), the server explicitly specifies `VersionId: evidence.s3_version_id` in `GetObjectCommand`. Staff will **always** download `VersionId A` (the verified version), rendering any late or unauthorized S3 PUT physically irrelevant.

---

## 10. Access, Retrieval & Playback Flow

Staff members (Invigilators, Faculty, Admins) review candidate evidence through short-lived presigned `GET` URLs pinned to the verified S3 Version ID:

```
[Invigilator Console]            [Node.js Backend]            [PostgreSQL]              [AWS S3]
        |                               |                          |                       |
        | 1. GET /evidence/:id/url      |                          |                       |
        |------------------------------>|                          |                       |
        |                               | 2. Authenticate Staff    |                       |
        |                               | 3. Authorize Session     |                       |
        |                               |    Assignment            |                       |
        |                               |------------------------->|                       |
        |                               | 4. SELECT evidence row   |                       |
        |                               |    WHERE status='AVAILABLE'                      |
        |                               |<-------------------------|                       |
        |                               | 5. Generate S3 GET URL   |                       |
        |                               |    (VersionId pinned,    |                       |
        |                               |     TTL: 900s, SigV4)    |                       |
        |                               | 6. Audit: EVIDENCE_ACCESSED                      |
        |                               |------------------------->|                       |
        | 7. Return presigned downloadUrl                          |                       |
        |<------------------------------|                                                  |
        |                                                                                  |
        | 8. Fetch media binary using downloadUrl (pinned VersionId)                       |
        |--------------------------------------------------------------------------------->|
        | 9. Stream media payload (200 OK)                                                 |
        |<---------------------------------------------------------------------------------|
```

### Retrieval Security Controls:
1. **Zero Candidate Access**: Candidates attempting to access evidence playback URLs receive `403 Forbidden`. Candidates have no operational need to inspect proctor review feeds, and denying candidate download access prevents evidence inspection, tampering, or extraction of snapshot media. Confirmation success is communicated via the `/confirm` endpoint response.
2. **Session Assignment Enforcement**: Invigilators must be assigned to the attempt's session (`session_invigilators`). Unassigned staff receive `403 Forbidden`.
3. **Short-Lived Expiry**: Presigned `GET` URLs expire after 15 minutes (`EVIDENCE_PLAYBACK_TTL_SECONDS = 900`). No permanent URLs are stored or exposed.
4. **VersionId Pinning**: Presigned `GET` URLs include the query parameter `versionId=${evidence.s3_version_id}`, ensuring the request resolves directly to the exact object version validated during confirmation.
5. **Content-Disposition**: Presigned URLs specify `ResponseContentDisposition: inline` for safe browser rendering inside image/audio viewer components.
6. **Mandatory Audit Trail**: Every presigned download URL generation transactionally emits an immutable audit event (`EVIDENCE_ACCESSED`) via the Phase 13 centralized audit service (`recordAuditEvent`).

---

## 11. Evidence Lifecycle & State Machine

```
              +---------------+
              |   INITIATED   | <--- Presigned PUT URL generated (Expires in 300s)
              +-------+-------+
                      |
        +-------------+-------------+
        |                           |
[Confirmation Success]      [Confirmation Failed / Size Mismatch]
        |                           |
        v                           v
  +-----------+               +-----------+
  | AVAILABLE |               |  FAILED   |
  +-----+-----+               +-----------+
        |
[Retention Expired / Manual Purge Success]
        |
        v
  +-----------+
  |  PURGED   | (S3 binary & all versions deleted; metadata retained/archived)
  +-----------+
```

### State Definitions & Transitions:
* **`INITIATED`**: Upload URL generated; waiting for candidate binary upload.
  * Transitions to `AVAILABLE` upon successful confirmation handshake and S3 `VersionId` capture.
  * Transitions to `FAILED` if confirmation detects size/MIME mismatch or S3 `HeadObject` returns 404.
  * Transitions to `ABANDONED` if upload window expires without confirmation (`upload_expires_at < NOW() - INTERVAL '15 minutes'`).
* **`AVAILABLE`**: Binary confirmed in S3; authorized staff can request playback URLs.
  * Transitions to `PURGED` only after all S3 object versions and delete markers are successfully destroyed.
  * If S3 deletion fails during a purge attempt, the record **remains `AVAILABLE`**; the sweeper logs a warning and retries on a subsequent tick.
* **`FAILED`**: Verification failed. Terminal state. Partially uploaded S3 objects are pruned. Candidate may re-initiate a fresh upload for an active attempt.
* **`ABANDONED`**: Upload timed out without confirmation. Terminal state. Background sweeper prunes orphaned S3 versions.
* **`PURGED`**: Object and all S3 versions/markers permanently deleted from S3. Metadata row updated to `status = 'PURGED'`. Terminal state.

---

## 12. Access Control & Authorization (RBAC / BOLA)

All endpoints enforce strict Resource-Level Access Control backed by authoritative PostgreSQL queries:

| Role | Initiate Upload | Confirm Upload | List Evidence | Inspect Metadata | Get Playback URL | Delete Evidence |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`STUDENT`** | Own Active Attempt Only | Own Active Attempt Only | Denied (403) | Denied (403) | Denied (403) | Denied (403) |
| **`INVIGILATOR`** | Denied (403) | Denied (403) | Assigned Sessions Only | Assigned Sessions Only | Assigned Sessions Only | Denied (403) |
| **`FACULTY`** | Denied (403) | Denied (403) | Owned Exams/Sessions | Owned Exams/Sessions | Owned Exams/Sessions | Owned Exams/Sessions |
| **`ADMIN`** | Denied (403) | Denied (403) | Global Access | Global Access | Global Access | Global Access |

### BOLA Defenses:
* Candidates cannot provide `sessionId` or `studentId`; both are resolved from the locked `exam_attempts` row.
* Attempt ownership (`attempt.student_id === req.user.userId`) is verified on all candidate endpoints.
* Invigilator assignment is verified against `session_invigilators` for the attempt's session.
* Staff endpoints cross-check that the requested `evidenceId` belongs to the specified `attemptId`.

---

## 13. REST API Specifications

### 13.1 `POST /api/v1/attempts/:attemptId/evidence/upload-url`
* **Role**: `STUDENT` (Own active attempt only).
* **Rate Limit**: 30 requests/minute per attempt via Redis sliding-window limiter.
* **Request Body**:
  ```json
  {
    "evidenceType": "WEBCAM_SNAPSHOT",
    "contentType": "image/jpeg",
    "byteSize": 254820,
    "sha256Checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "violationId": "7f07e691-8f2f-41d1-b771-9369817457ff",
    "flagId": null
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "status": "success",
    "data": {
      "evidenceId": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "uploadUrl": "https://proctornet-evidence-dev-01.s3.ap-south-1.amazonaws.com/evidence/...?...SigV4-params...",
      "objectKey": "evidence/session-uuid/attempt-uuid/WEBCAM_SNAPSHOT/1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d.jpg",
      "expiresIn": 300
    }
  }
  ```

### 13.2 `POST /api/v1/attempts/:attemptId/evidence/:evidenceId/confirm`
* **Role**: `STUDENT` (Own active attempt only).
* **Rate Limit**: 30 requests/minute per attempt.
* **Request Body** (Optional/re-assertion):
  ```json
  {
    "byteSize": 254820,
    "sha256Checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "data": {
      "evidenceId": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "attemptId": "attempt-uuid",
      "evidenceType": "WEBCAM_SNAPSHOT",
      "status": "AVAILABLE",
      "s3VersionId": "v12345abcdef",
      "actualByteSize": 254820,
      "confirmedAt": "2026-09-08T06:30:00.000Z"
    }
  }
  ```

### 13.3 `GET /api/v1/attempts/:attemptId/evidence`
* **Role**: `INVIGILATOR` (assigned), `FACULTY`, `ADMIN`.
* **Query Parameters**: `evidenceType`, `status`, `page`, `limit`.
* **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "data": {
      "attemptId": "attempt-uuid",
      "evidence": [
        {
          "evidenceId": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
          "evidenceType": "WEBCAM_SNAPSHOT",
          "contentType": "image/jpeg",
          "byteSize": 254820,
          "status": "AVAILABLE",
          "s3VersionId": "v12345abcdef",
          "violationId": "7f07e691-8f2f-41d1-b771-9369817457ff",
          "flagId": null,
          "createdAt": "2026-09-08T06:29:45.000Z",
          "confirmedAt": "2026-09-08T06:30:00.000Z"
        }
      ],
      "pagination": { "page": 1, "limit": 50, "total": 1, "totalPages": 1 }
    }
  }
  ```

### 13.4 `GET /api/v1/attempts/:attemptId/evidence/:evidenceId/url`
* **Role**: `INVIGILATOR` (assigned), `FACULTY`, `ADMIN`.
* **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "data": {
      "evidenceId": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "downloadUrl": "https://proctornet-evidence-dev-01.s3.ap-south-1.amazonaws.com/evidence/...?...versionId=v12345abcdef&...SigV4-params...",
      "contentType": "image/jpeg",
      "expiresIn": 900
    }
  }
  ```

### 13.5 `DELETE /api/v1/attempts/:attemptId/evidence/:evidenceId`
* **Role**: `FACULTY` (exam owner), `ADMIN`.
* **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "message": "Evidence artifact successfully purged"
  }
  ```

---

## 14. Asynchronous Maintenance & Cleanup Workers

To protect PostgreSQL connection pool availability (`DB_POOL_MAX = 10`), maintenance sweepers decouple database locking from external S3 network calls using an explicit **lease/claim pattern** (`claim_expires_at`). Database transactions are committed in milliseconds, ensuring no PostgreSQL connections or row locks are held during S3 network I/O:

### 14.1 Orphaned Upload Sweeper (Scheduled Worker)
* **Objective**: Reclaim unconfirmed upload records and clean up partial S3 objects.
* **Execution Sequence**:
  1. **Step 1 — Atomic Lease Claim (Short DB Transaction)**:
     ```sql
     WITH claimed AS (
       SELECT evidence_id
       FROM evidence_records
       WHERE status = 'INITIATED'
         AND upload_expires_at < NOW() - INTERVAL '15 minutes'
         AND (claim_expires_at IS NULL OR claim_expires_at < NOW())
       ORDER BY upload_expires_at ASC
       LIMIT 50
       FOR UPDATE SKIP LOCKED
     )
     UPDATE evidence_records
     SET claim_expires_at = NOW() + INTERVAL '2 minutes'
     WHERE evidence_id IN (SELECT evidence_id FROM claimed)
     RETURNING evidence_id, bucket_name, object_key;
     ```
     *Transaction commits immediately; connection pool client is checked back into pool.*
  2. **Step 2 — External S3 Version Deletion (Zero DB Locks Held)**:
     For each claimed row, the worker calls `s3Storage.deleteEvidenceObjectVersions(bucket_name, object_key)` outside any open database transaction.
     *If S3 returns 404 (object never uploaded), it ignores and proceeds.*
  3. **Step 3 — State Finalization (Short DB Transaction)**:
     In a short transaction, the worker updates the processed rows:
     ```sql
     UPDATE evidence_records
     SET status = 'ABANDONED',
         claim_expires_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE evidence_id = $1 AND status = 'INITIATED';
     ```

### 14.2 Retention Purge Sweeper (Scheduled Worker)
* **Objective**: Permanently purge expired evidence artifacts according to the configurable operational retention policy.
* **Execution Sequence**:
  1. **Step 1 — Atomic Lease Claim (Short DB Transaction)**:
     ```sql
     WITH claimed AS (
       SELECT evidence_id
       FROM evidence_records
       WHERE status = 'AVAILABLE'
         AND retention_expires_at <= NOW()
         AND (claim_expires_at IS NULL OR claim_expires_at < NOW())
       ORDER BY retention_expires_at ASC
       LIMIT 50
       FOR UPDATE SKIP LOCKED
     )
     UPDATE evidence_records
     SET claim_expires_at = NOW() + INTERVAL '2 minutes'
     WHERE evidence_id IN (SELECT evidence_id FROM claimed)
     RETURNING evidence_id, bucket_name, object_key;
     ```
     *Transaction commits immediately; connection is released.*
  2. **Step 2 — External S3 Version Deletion (Zero DB Locks Held)**:
     Outside any database transaction, the worker calls `s3Storage.deleteEvidenceObjectVersions(bucket_name, object_key)`.
     *If S3 version deletion throws an error (e.g. partial failure or network error), the worker logs a warning and does NOT finalize the row. The lease expires after 2 minutes, and the row remains in `AVAILABLE` status to be retried on a subsequent sweep.*
  3. **Step 3 — State Finalization & Audit (Short DB Transaction)**:
     For successfully purged items:
     ```sql
     UPDATE evidence_records
     SET status = 'PURGED',
         claim_expires_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE evidence_id = $1 AND status = 'AVAILABLE';
     ```
     Transactionally records centralized audit log `EVIDENCE_PURGED` with `actor_user_id = NULL` (System), `resource_type = 'evidence'`, and `resource_id = evidence_id`.

### 14.3 Outbox Disposition in Phase 15
* The current RabbitMQ topology (`topology.js`) supports only evaluation queues (`proctornet.evaluation.jobs`).
* There is no active RabbitMQ consumer for evidence lifecycle events in Phase 15.
* **Architectural Rule**: To prevent permanent accumulation of unconsumed outbox records, Phase 15 does **not** write `EVIDENCE_UPLOADED` to `outbox_events`. Outbox event emission for evidence is explicitly deferred to later phases when dedicated downstream consumers (e.g., asynchronous notification or machine learning evaluation) are introduced.

---

## 15. Security, Privacy & Integrity Controls

1. **Client-Declared Checksum & Format Validation (Integrity Declaration)**:
   - The candidate client computes a SHA-256 digest of the binary evidence prior to upload.
   - The backend validates the 64-character hex format (`/^[a-fA-F0-9]{64}$/`) and persists the digest in `evidence_records.sha256_checksum`.
   - The digest serves as an authoritative forensic integrity declaration for post-incident reviews and legal dispute resolution.
   - *Security Boundary Clarification*: The backend verifies byte size and MIME type during confirmation via S3 `HeadObjectCommand`, but does **not** re-hash the binary payload during confirmation. Full binary re-hashing or S3-managed checksum algorithms are deferred to **Phase 18 — Security Hardening**.
2. **Strict MIME Allowlist & Exact Size Bounds**:
   - Hard limits: `WEBCAM_SNAPSHOT` (5MB), `SCREEN_CAPTURE` (10MB), `AUDIO_SNIPPET` (5MB).
   - Only whitelisted image/audio content types allowed (`image/jpeg`, `image/png`, `image/webp`, `audio/webm`, `audio/ogg`, `audio/wav`).
   - S3 object extension mapped strictly by server from validated MIME type.
   - Confirmation enforces **exact byte equality**: `headResult.ContentLength === declared_byte_size`. Zero tolerance windows are permitted.
3. **Private-by-Default S3 Storage**:
   - Bucket `proctornet-evidence-dev-01` enforces Block Public Access = ON.
   - Zero public bucket read/write permissions.
   - S3 presigned URLs require SigV4 authentication with temporary, tightly bounded expiration (Upload: 300s, Playback: 900s).
4. **Credential Management**:
   - Backend utilizes the default AWS SDK credential provider chain (`@aws-sdk/credential-providers`).
   - Credentials resolved via environment variables, IAM instance profiles, or local AWS CLI credentials.
   - Zero secrets stored in Git, configuration files, or logs.
5. **Privacy Safeguards**:
   - Captured evidence is strictly bounded to the active examination window.
   - Zero keystroke logging, clipboard inspection, or password fields captured.
   - Candidates are strictly barred from querying or downloading evidence artifacts.

---

## 16. Observability & Metrics

Reuses Phase 13 Prometheus registry (`src/infrastructure/metrics/registry.js`):

| Metric Name | Type | Labels | Description |
| :--- | :--- | :--- | :--- |
| `proctornet_evidence_uploads_initiated_total` | Counter | `evidence_type` | Total presigned upload URLs minted |
| `proctornet_evidence_uploads_confirmed_total` | Counter | `evidence_type`, `status` | Total uploads confirmed (`success`, `failed`) |
| `proctornet_evidence_downloads_total` | Counter | `evidence_type` | Total presigned download playback URLs minted |
| `proctornet_evidence_bytes_total` | Counter | `evidence_type` | Cumulative bytes of confirmed evidence stored |
| `proctornet_evidence_storage_latency_seconds` | Histogram | `operation` (`head_object`, `delete_object`, `delete_versions`, `presign_put`, `presign_get`) | Latency of S3 client operations |

* **Zero Cardinality Explosion**: Labels are strictly bounded enums. Zero `attemptId`, `evidenceId`, `sessionId`, or `userId` in Prometheus labels.
* **Trace Context**: W3C `traceparent` correlated with S3 operations and audit records.

---

## 17. Object / Database Consistency Matrix & Failure Semantics

The following matrix governs the six core consistency cases between PostgreSQL (authoritative metadata authority) and AWS S3 (binary object storage):

| Scenario | Authoritative System | Detection Mechanism | Repair Mechanism | Retry Semantics | Final Lifecycle State |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Case A**<br>PostgreSQL row exists, S3 object does not | **PostgreSQL** | Upload TTL expires; sweeper detects `status = 'INITIATED'` and `upload_expires_at < NOW() - 15m`. | Sweeper checks S3 via `HeadObject`; finding 404, marks record `ABANDONED`. | Candidate may re-initiate a fresh upload for an active attempt. | `ABANDONED` |
| **Case B**<br>S3 object exists, PostgreSQL row does not | **PostgreSQL** | S3 prefix audit or periodic bucket lifecycle check detects unreferenced key. | S3 lifecycle expiration rule or maintenance script purges unreferenced S3 prefix objects. | None. Object is unreferenced garbage. | Pruned from S3 |
| **Case C**<br>PostgreSQL says `AVAILABLE`, S3 object missing | **PostgreSQL** | Staff requests playback URL (`GET /url`); backend `HeadObject` returns 404 (NoSuchKey). | Returns `404 Not Found (EVIDENCE_OBJECT_NOT_FOUND)`. Logs high-severity alert. Transitions row to `FAILED`. | Non-recoverable for binary; metadata preserved for audit investigation. | `FAILED` |
| **Case D**<br>S3 upload exists, confirmation never occurs | **PostgreSQL** | Sweeper detects `status = 'INITIATED'` past expiration (`upload_expires_at + 15m`). | Sweeper calls `deleteEvidenceObjectVersions` to permanently delete all versions, then marks row `ABANDONED`. | Candidate browser may call `/confirm` upon reconnect if within attempt window. Otherwise abandoned. | `ABANDONED` |
| **Case E**<br>DB deletion requested, S3 deletion fails | **PostgreSQL** | Purge sweeper or delete endpoint catches S3 error or partial version deletion failure. | Record status remains `AVAILABLE` with expired lease (`claim_expires_at = NULL`). Bounded sweeper retries deletion on next tick. | Exponential backoff (up to 5 retries). Row marked `PURGED` only after S3 confirms all versions deleted. | `PURGED` |
| **Case F**<br>S3 deletion succeeds, DB update fails | **PostgreSQL** | Worker catches DB disconnect/timeout immediately after S3 deletion. | Worker retries DB update. Because S3 version deletion is idempotent (deleting non-existent versions returns 200 OK), re-running S3 delete is safe. | Automatic worker retry on next scheduled batch. | `PURGED` |

---

## 18. Testing Strategy

### 18.1 Unit Tests (`backend/tests/evidence/evidenceUnit.test.js`)
* Object key generation format, UUID uniqueness, and deterministic extension mapping.
* Zod schema validation (MIME whitelisting, size envelopes, SHA-256 hex format validation).
* Exact size equality verification (`actual === declared`).
* State machine transition rules.

### 18.2 Integration Tests (`backend/tests/evidence/evidenceIntegration.test.js`)
* Complete upload lifecycle: `POST upload-url` $\to$ S3 mock PUT $\to$ `POST confirm` $\to$ verify `AVAILABLE` in DB.
* S3 `VersionId` capture and persistence in `evidence_records.s3_version_id`.
* Idempotent confirmation retries (duplicate `/confirm` returns existing record without state mutation).
* Playback presigned GET generation verifying `VersionId` query parameter matching pinned version.
* Physical vs logical immutability: mock later PUT to S3 with newer VersionId; verify staff download URL still requests confirmed VersionId.
* Violation linking: Confirmed evidence properly updates `violation_events.evidence_object_key`.

### 18.3 S3 Version-Aware Purge & Sweeper Tests (`backend/tests/evidence/evidenceConsistency.test.js`)
* Pagination in `deleteEvidenceObjectVersions`: mock `IsTruncated: true` with `NextKeyMarker` / `NextVersionIdMarker`; verify all pages deleted.
* Deletion batching: verify batches split into chunks of $\le 1000$ objects.
* Partial failure handling: mock `DeleteObjectsCommand` returning `Errors`; verify method throws and record remains `AVAILABLE`.
* Decoupled worker lease concurrency: verify `claim_expires_at` prevents multiple workers from processing the same row simultaneously without holding database locks during S3 calls.
* Case A: Abandoned upload sweeper transitions timed-out `INITIATED` records to `ABANDONED`.
* Case C: Missing S3 object during playback request marks row `FAILED`.
* Case D: Unconfirmed S3 upload cleaned up and marked `ABANDONED`.
* Retention sweeper: Expired `AVAILABLE` records purged, S3 versions deleted, and marked `PURGED`.

### 18.4 RBAC & BOLA Tests (`backend/tests/evidence/evidenceRbac.test.js`)
* Candidate attempting to upload for another student's attempt $\to$ 403 Forbidden.
* Candidate attempting to access playback download URL $\to$ 403 Forbidden.
* Unassigned invigilator requesting evidence listing or playback URL $\to$ 403 Forbidden.
* Assigned invigilator, faculty, and admin successfully retrieving playback URLs $\to$ 200 OK.
* Centralized audit logging verification: verify `EVIDENCE_ACCESSED` recorded in `audit_logs`.

### 18.5 Security & Failure Tests (`backend/tests/evidence/evidenceSecurity.test.js`)
* S3 `HeadObject` 404 on confirmation $\to$ rejects with 400 and marks `FAILED`.
* S3 `ContentLength` mismatch $\to$ rejects with 400.
* Disallowed MIME type injection (e.g. `application/x-executable`, `application/pdf`) $\to$ 400 Bad Request.
* Oversized upload attempt exceeding limit $\to$ 400 Bad Request.
* Malformed SHA-256 checksum string rejected with 400 Bad Request.
* Path traversal attempt in attemptId/evidenceId $\to$ 400/404 Rejected.

### 18.6 Regression Suite
* Full backend suite (`npm test`): Maintain 545+ tests green.
* Full frontend suite (`npm --prefix frontend test`): Maintain 28+ tests green.
* Phase 12 RabbitMQ integration regression suite.
* Phase 13 Observability & Audit suite.
* Phase 14 Proctoring Events & Anomaly Scoring suite.

---

## 19. Architectural Decision Record Proposal

Phase 15 formalizes:

### **ADR-0005: Private Object Storage Architecture, Direct Presigned Evidence Uploads, and Authoritative PostgreSQL Metadata Lifecycle**
* **Context**: Proctoring evidence snapshots and audio files represent high-bandwidth binary data that would saturate Node.js event-loop performance, consume excessive memory buffers, and cause connection exhaustion if proxied through the Express application server.
* **Decision**: 
  1. Offload binary uploads directly from the browser to private AWS S3 using short-lived SigV4 presigned `PUT` URLs.
  2. Maintain authoritative evidence metadata, state machines, and client-declared checksums exclusively in PostgreSQL (`evidence_records`).
  3. Recognize that S3 presigned PUT URLs are temporary authorizations (not intrinsically single-use); enforce logical upload uniqueness, state progression, and immutability via PostgreSQL row-level locks during confirmation.
  4. Pin the verified S3 `VersionId` at confirmation and pass it to presigned playback `GET` URLs, ensuring physical immutability in version-enabled buckets.
  5. Explicitly handle S3 bucket versioning (`proctornet-evidence-dev-01`, `ap-south-1`) during purge and cleanup operations via paginated, version-aware deletion (`ListObjectVersions` + `DeleteObjects`) to ensure complete zero-byte data destruction.
  6. Restrict retrieval to short-lived presigned `GET` URLs generated on-demand with mandatory centralized audit logging (`EVIDENCE_ACCESSED`).
  7. Decouple background sweeper database transactions from external S3 network calls using a lease/claim pattern (`claim_expires_at`), preventing connection pool starvation.
  8. Defer hardware media capture to Phase 16/17 and deep malware scanning to Phase 18.
* **Consequences**: Zero binary media traffic on core API servers; strong data integrity and tamper-evidence; complete privacy and tenant isolation; reliance on AWS S3 primitives for object lifecycle.

---

## 20. Configuration & Environment Variables

The backend configuration (`src/config/env.js`) will be extended with the following environment variables:

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `AWS_REGION` | String | `'ap-south-1'` | AWS Region for S3 storage |
| `S3_BUCKET_NAME` | String | `'proctornet-evidence-dev-01'` | Name of private S3 evidence bucket |
| `S3_ENDPOINT` | String (URL) | `undefined` | Custom S3 endpoint (for local MinIO / LocalStack) |
| `S3_FORCE_PATH_STYLE` | Boolean | `false` | Set `true` for local MinIO path-style bucket access |
| `EVIDENCE_RETENTION_DAYS` | Number | `90` | Configurable operational retention duration in days |
| `EVIDENCE_UPLOAD_TTL_SECONDS` | Number | `300` | Expiration window for presigned PUT URLs (5 minutes) |
| `EVIDENCE_PLAYBACK_TTL_SECONDS` | Number | `900` | Expiration window for presigned GET playback URLs (15 minutes) |

* **Zero Hardcoded Secrets**: AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`) are resolved dynamically via the default AWS SDK credential provider chain.

---

## 21. Acceptance Criteria for Phase 15 Implementation

1. **Migration 017 Reversible**: `evidence_records` table created with `s3_version_id`, `claim_expires_at`, constraints, and sweep indexes; `up` and `down` migration functions fully defined and tested.
2. **Direct S3 Upload**: Presigned `PUT` URLs generated in $O(1)$ without buffering media in server memory; presigned PUT semantics accurately documented as temporary authorization with PostgreSQL enforcing logical upload uniqueness.
3. **Authoritative Confirmation & S3 VersionId Pinning**: Server calls S3 `HeadObjectCommand` to verify object presence, exact byte size, and MIME; pins authoritative `s3_version_id`; duplicate confirmations handled idempotently.
4. **Immutable Playback**: Presigned download URLs explicitly include pinned `VersionId: evidence.s3_version_id`, guaranteeing playback of the confirmed binary version regardless of any subsequent physical PUT.
5. **Robust S3 Version Deletion**: Purge and cleanup sweepers utilize paginated version listing and chunked multi-object deletion (`ListObjectVersions` + `DeleteObjects`) to permanently destroy all object versions and delete markers from `proctornet-evidence-dev-01`; partial errors prevent status transition to `PURGED`.
6. **Decoupled Sweeper Concurrency**: Sweepers claim batches using `claim_expires_at` and execute S3 operations outside open PostgreSQL transactions, eliminating connection pool starvation risks.
7. **Consistency Cases Handled**: Explicit behavior, retry semantics, and final states implemented for consistency Cases A through F; transient S3 purge failures leave records in `AVAILABLE` for automatic sweeper retry.
8. **Strict RBAC / BOLA**: Candidate access restricted to own active attempt; staff playback restricted to assigned sessions; zero candidate playback access.
9. **Audited Retrieval**: Every generated presigned `GET` URL transactionally emits `EVIDENCE_ACCESSED` in `audit_logs`.
10. **Observability**: Prometheus metrics track uploads, confirmations, downloads, bytes, and S3 latencies with bounded labels.
11. **Test Coverage**: All unit, integration, RBAC, failure, consistency, version pinning, and regression test suites pass with 100% success.
12. **Strict Scope Isolation**: Zero hardware media capture (`getUserMedia`), WebSockets, WebRTC, SFU, or ML/CV implemented.
