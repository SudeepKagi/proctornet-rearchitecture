# ADR-0005: Private Object Storage Architecture, Direct Presigned Evidence Uploads, and Authoritative PostgreSQL Metadata Lifecycle

## Status
Accepted

## Date
2026-09-08

## Context & Problem Statement
The ProctorNet examination platform requires persistent storage and lifecycle tracking for visual and acoustic proctoring evidence artifacts (webcam snapshots, screen captures, and ambient audio snippets). Binary media files represent high-bandwidth data (ranging from 200 KB to 10 MB per artifact). 

Proxying media payloads through the core Node.js Express application servers would introduce severe operational hazards:
1. Saturating the single-threaded Node.js event loop with streaming I/O.
2. Exhausting server memory buffers during concurrent candidate snapshot uploads.
3. Starving PostgreSQL database connection pool resources (`DB_POOL_MAX = 10`) while holding open connections during long-running multipart uploads.
4. Exposing candidate media to unauthorized tampering if storage permissions and lifecycle are not strictly governed.

An architecture is required to offload binary media transfers directly to private cloud storage while maintaining complete server authority, strict privacy, tamper-evident immutability, and deterministic data destruction upon retention expiry.

## Decision Drivers
- **Decoupled Data Plane**: Heavy binary data must completely bypass the Node.js API application layer.
- **Server Authority**: The server must authoritatively control object keys, permitted MIME types, byte sizes, and lifecycle progression.
- **Physical vs. Logical Immutability**: S3 presigned PUT URLs represent temporary authorization (not intrinsically single-use). Logical uniqueness and state progression must be authoritatively governed by PostgreSQL.
- **VersionId Pinning**: In version-enabled S3 buckets, staff playback must resolve strictly to the exact payload version verified at confirmation.
- **Zero Public Access**: Buckets must enforce Block Public Access with zero public read/write permissions.
- **Clean Retention & Zero-Byte Purging**: Purge routines must permanently delete all object versions and delete markers from version-enabled buckets.
- **Database Connection Safety**: Asynchronous maintenance sweepers must decouple external S3 network calls from open database transactions using an explicit lease pattern.

## Considered Options
1. **Option A: Proxy Media Uploads Through Express API Server to Local Filesystem / Disk**
   - *Pros*: Simple implementation; straightforward multipart middleware (`multer`).
   - *Cons*: Severe event-loop blocking; disk exhaustion on web servers; horizontal scaling impossible without shared network mounts (NFS/EFS); severe latency degradation.
2. **Option B: Application-Proxied Streaming to S3 via Multi-Part Pipes**
   - *Pros*: Files not written to local disk.
   - *Cons*: Server CPU and memory still tied up streaming network chunks; backend connection limits bound to client upload speeds; high risk of socket timeouts under poor candidate network conditions.
3. **Option C: Direct-to-S3 Presigned PUT Uploads with Authoritative PostgreSQL Metadata & S3 VersionId Pinning (Selected)**
   - *Pros*: Zero binary media traffic on core API servers; direct browser-to-S3 transfer; PostgreSQL row-level locks guarantee upload uniqueness; server pins S3 `VersionId` upon `HeadObject` confirmation; version-aware permanent destruction; decoupled sweeper concurrency.
   - *Cons*: Requires client two-phase handshake (`upload-url` followed by `confirm`); requires S3 bucket CORS configuration.

## Decision Outcome
Chosen option: **Option C (Direct-to-S3 Presigned Uploads with PostgreSQL Metadata Lifecycle)**.

### Architectural Blueprint:
1. **Two-Phase Upload Handshake**:
   - The candidate client requests an upload URL via `POST /attempts/:attemptId/evidence/upload-url`.
   - The backend validates the active attempt, validates MIME and size bounds, inserts an `INITIATED` record into PostgreSQL with a server-generated UUID object key, and returns an AWS SigV4 presigned `PUT` URL (TTL: 300 seconds).
   - The candidate client performs an HTTP `PUT` directly from the browser to S3.
   - The candidate client confirms completion via `POST /attempts/:attemptId/evidence/:evidenceId/confirm`.
2. **Authoritative Confirmation & S3 VersionId Pinning**:
   - The backend checks out a transaction client and acquires an exclusive row lock (`SELECT ... FOR UPDATE`).
   - If already `AVAILABLE`, the endpoint responds idempotently with existing confirmed data.
   - The backend calls S3 `HeadObjectCommand` to authoritatively verify object presence, exact byte size equality (`headResult.ContentLength === declared_byte_size`), and MIME type match.
   - The backend captures `headResult.VersionId` and pins it to `evidence_records.s3_version_id`.
   - The record transitions from `INITIATED` to `AVAILABLE`, and retention expiration is authoritatively calculated.
3. **Staff Playback via Version-Pinned Presigned GET URLs**:
   - Authorized staff (invigilators assigned to the session, owning faculty, administrators) retrieve short-lived (15-minute) presigned `GET` URLs via `GET /attempts/:attemptId/evidence/:evidenceId/url`.
   - The backend explicitly specifies `VersionId: evidence.s3_version_id` in `GetObjectCommand`, ensuring playback always retrieves the validated binary version, even if an unvalidated subsequent PUT occurred on S3 before upload URL expiry.
   - Candidates are strictly denied playback and listing access (`403 Forbidden`).
   - Every playback URL generation transactionally emits an immutable audit log (`EVIDENCE_ACCESSED`).
4. **Version-Aware Destruction**:
   - The development S3 bucket `proctornet-evidence-dev-01` in `ap-south-1` has `Versioning = ENABLED`.
   - Purge and sweeper routines use paginated `ListObjectVersionsCommand` and batched `DeleteObjectsCommand` to delete all versions and delete markers.
   - If any version deletion fails, the record remains in `AVAILABLE` and is retried on subsequent cycles; records are never marked `PURGED` after partial S3 deletion.
5. **Decoupled Sweeper Leases**:
   - Background maintenance sweepers (Orphaned Upload Sweeper and Retention Purge Sweeper) claim bounded batches of 50 rows using `FOR UPDATE SKIP LOCKED` and set a short lease (`claim_expires_at`).
   - S3 network operations are executed completely outside open database transactions, protecting the PostgreSQL connection pool.
   - State finalization (`ABANDONED` or `PURGED`) occurs in a subsequent short transaction.

## Positive Consequences
- **Maximum Scalability**: Binary payloads never touch application server memory, event loops, or network interfaces.
- **Authoritative Integrity**: Physical S3 versioning combined with database `s3_version_id` pinning guarantees that evidence retrieved by invigilators is identical to the payload verified at confirmation.
- **Tenant Isolation & Security**: Private S3 bucket with Block Public Access enabled; short-lived SigV4 signed URLs with zero public object read or list capabilities.
- **Auditability**: Complete forensic traceability with SHA-256 client integrity declarations and immutable audit log records.

## Negative Consequences / Trade-offs
- **Client Complexity**: Candidate web application must perform a two-step upload-and-confirm workflow and handle S3 HTTP errors.
- **S3 Version Listing Cost**: Version-aware purging requires calling `ListObjectVersions` and `DeleteObjects` per key instead of a single unversioned delete command.
- **CORS Dependency**: S3 bucket must maintain a strict CORS configuration allowing `PUT` requests from verified web origins.

## Compliance & Validation
- **Unit Testing**: Object key format, MIME validation, exact size equality, and state machine transitions verified in `evidenceUnit.test.js`.
- **Integration Testing**: End-to-end presigned PUT generation, mock S3 verification, VersionId capture, and idempotent confirmation verified in `evidenceIntegration.test.js`.
- **Consistency Testing**: Consistency Cases A through F, sweeper lease concurrency, paginated S3 version deletion, and partial deletion failure verified in `evidenceConsistency.test.js`.
- **Security Testing**: Candidate playback rejection, unassigned invigilator rejection, size/MIME mismatch handling, and checksum validation verified in `evidenceRbac.test.js` and `evidenceSecurity.test.js`.
