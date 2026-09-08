# Phase 18 Implementation Plan: Security Hardening & Penetration Defense (Revised)

> **Authoritative Source Precedence:**
> 1. Notion Step 13 Final Re-Architecture (Sections 13.5, 13.7, 13.17 — Security Architecture, Threat Modeling, and State Decoupling)
> 2. `docs/DEVELOPMENT_PLAN.md` (Phase 18 — Security Hardening)
> 3. Existing Merged Repository Baseline (Phases 1–17 Merged on `main`)
> 4. Existing Architecture Decision Records (ADR-0001 through ADR-0007)
> 5. Phase 15/16/17 Architecture Specifications & Deferred Hardening Items

---

## 1. Executive Summary

Phase 18 executes rigorous, system-wide application security hardening, penetration defense, HTTP header protection, strict cross-origin policies, structural input sanitization, database query injection audits, and cryptographic anti-tampering validation for student answer mutations and proctoring telemetry.

Building upon the completed and merged Phase 17 WebRTC SFU media plane, Phase 18 elevates ProctorNet to a tamper-resistant, penetration-tested production fortress. It systematically addresses the OWASP Top 10 vulnerabilities, protects candidate exam integrity against in-transit payload tampering and replay attacks, enforces strict origin domains, guarantees SQL injection immunity across all 12 database repositories, and establishes cryptographic request signatures without introducing premature microservice complexity, false client-trust assumptions, or breaking PostgreSQL authoritative invariants.

---

## 2. Authoritative Source References

The architecture and scope for Phase 18 are derived exclusively from the authoritative hierarchy:

1. **Notion Step 13 Final Re-Architecture**:
   - Section 13.5: *Decoupled State & Service Architecture* (Stateless REST, ephemeral Redis, authoritative PostgreSQL).
   - Section 13.7: *Zero-Trust Client Threat Model & Ephemeral Secrets* (Never trust client execution environment; tamper-resistant transport signatures; rate-limited write surfaces; authoritative server state).
   - Section 13.17: *Defensive Engineering & Auditing* (Immutable audit trails for security anomalies; cryptographic verification of candidate mutations).
2. **`docs/DEVELOPMENT_PLAN.md` (Phase 18 — Security Hardening)**:
   - Configure Helmet for secure HTTP headers (`CSP`, `HSTS`, `X-Content-Type-Options`, `X-Frame-Options`, `Cross-Origin` policies).
   - Enforce strict CORS policies restricted to authorized origin domains.
   - Implement input sanitization and XSS prevention across all incoming payloads.
   - Audit database queries against SQL injection (enforce parameterized queries everywhere).
   - Implement anti-tampering cryptographic validation on answer payloads and client events.
   - Acceptance Criteria: Automated security scans pass with deterministic vulnerability threshold; OWASP Top 10 systematically mitigated.
3. **Phase 15 Implementation Plan & Evidence Specification (`docs/PHASE_15_IMPLEMENTATION_PLAN.md`)**:
   - Authoritative evidence taxonomy: `WEBCAM_SNAPSHOT`, `SCREEN_CAPTURE`, `AUDIO_SNIPPET`.
   - Authoritative MIME types: `image/jpeg`, `image/png`, `image/webp`, `audio/webm`, `audio/ogg`, `audio/wav`.
   - Server-side binary payload integrity validation and file signature/magic byte verification deferred to Phase 18.
4. **Existing Architecture Decision Records**:
   - ADR-0001: Redis non-authoritative caching and rate-limiting resilience.
   - ADR-0002: RabbitMQ asynchronous decoupled processing.
   - ADR-0003: Observability, bounded Prometheus metric labels, and structured audit logs.
   - ADR-0004: Proctoring event ingestion, anomaly scoring, and violation timeline.
   - ADR-0005: S3 private object storage, direct presigned uploads, and PostgreSQL metadata.
   - ADR-0006: WebSocket realtime control plane and Redis Pub/Sub.
   - ADR-0007: WebRTC SFU media plane architecture and mediasoup worker pool.

---

## 3. Existing Repository Baseline

- **Current Git Branch**: `main`.
- **Working Tree Status**: Clean (no uncommitted files, no modified files).
- **Latest Merged Commits**:
  - `85596dc docs(plan): mark Phase 17 complete with PR #18 merge details`
  - `a72240f Merge pull request #18 from SudeepKagi/feature/phase-17-webrtc-sfu`
  - `11b1c5b feat(proctoring): add WebRTC SFU media plane`
- **Current Architecture Inventory**:
  - **HTTP/REST Engine**: Express.js app (`backend/src/app.js`) with baseline `helmet()` and default `cors({ origin: config.CORS_ORIGIN, credentials: true })`.
  - **Database Layer**: PostgreSQL via `pg` connection pool, 12 module repositories using parameterized queries (`$1, $2`).
  - **Cache & Ephemeral Coordination**: Redis client (`cacheService.js`, `redisClient.js`) with circuit breaker.
  - **Asynchronous Transport**: RabbitMQ outbox dispatcher and evaluation workers.
  - **Object Storage**: AWS SDK v3 S3 client for presigned evidence uploads and downloads.
  - **Realtime Control Plane**: WebSocket server (`wsEngine.js`) with Redis Pub/Sub syncing, heartbeat watchdog, and rate limiting.
  - **Media Plane**: mediasoup SFU worker pool with generation fencing, session pinning, and ephemeral TURN credentials (900s TTL).
  - **Test Suite**: 704 backend tests passing; 56 frontend tests passing; clean production frontend build.

---

## 4. Exact Phase 18 Scope

Phase 18 implements seven core security pillars:

1. **Enterprise HTTP Security Headers (Helmet Configuration)**:
   - Customized Content Security Policy (CSP) distinguishing frontend SPA, REST API, WebSockets, and WebRTC media streams.
   - HTTP Strict Transport Security (HSTS) with 1-year duration, subdomains, and preloading.
   - Cross-Origin Resource Policy (CORP), Cross-Origin Opener Policy (COOP), and Cross-Origin Embedder Policy (COEP).
   - Strict `X-Frame-Options: DENY` clickjacking defense, `X-Content-Type-Options: nosniff`, and restricted `Referrer-Policy`.
   - Comprehensive `Permissions-Policy` disabling unused browser hardware features while strictly allowing camera/microphone/display-capture on origin.
2. **Strict Multi-Origin CORS Policy Enforcement**:
   - Environment-driven `CORS_ALLOWED_ORIGINS` whitelist parsing with rejection of wildcard `*` when credentials are true.
   - Dynamic origin verification callback rejecting unlisted browser origins with `403 Forbidden`.
   - Explicit allowed headers, methods, exposed headers (`X-Request-ID`, `Content-Range`, `Retry-After`), and 24-hour preflight caching (`maxAge: 86400`).
3. **Layered Anti-XSS, Schema Validation & Non-Destructive Input Safety**:
   - Context-aware output encoding (React DOM default) as primary defense against XSS.
   - Strict Zod schema validation and structural rejection as secondary defense.
   - Structural input sanitizer stripping prototype pollution keys (`__proto__`, `constructor`, `prototype`) and null bytes (`\0`).
   - Zero destructive stripping of candidate exam answers: programming code, math symbols (`<`, `>`, `&`), URLs, and Markdown text remain intact.
4. **Database Query Injection Audit & Parametric Defense**:
   - Formal audit and verification of all 100+ SQL statements across 12 module repositories.
   - Strict compile-time allowlists for dynamic SQL identifiers (ORDER BY columns, sort directions, dynamic WHERE builders).
   - 100% positional parameter placeholders (`$1, $2, ...`) for all SQL values.
   - Comprehensive SQL injection fuzzing test suite verifying zero raw string concatenation vulnerabilities.
5. **Cryptographic Anti-Tampering & Transport Integrity Validation (HMAC-SHA256)**:
   - Scoped attempt signing material derived via HMAC-SHA256 from server root secret, attempt ID, and student ID.
   - Ephemeral `anti_tamper_token` issued to candidate client upon attempt start/resumption.
   - Request signature protocol via `X-Payload-Signature: t=<timestamp>,nonce=<uuid>,v1=<hmac>` on:
     - Answer autosaves: `PUT /api/v1/attempts/:attemptId/answers/:attemptQuestionId`
     - Answer batch saves: `POST /api/v1/attempts/:attemptId/answers/batch`
     - Answer clearing: `DELETE /api/v1/attempts/:attemptId/answers/:attemptQuestionId`
     - Proctoring telemetry: `POST /api/v1/attempts/:attemptId/events`
   - Replay protection with shared Redis-backed nonce deduplication (`SET v1:antitamper:nonce:... EX 300 NX`) and 5-minute timestamp drift window.
   - Multi-node fail-closed policy in production when Redis is unreachable.
   - Constant-time verification (`crypto.timingSafeEqual`) preventing timing side-channel attacks.
6. **Binary File Signature (Magic Bytes) Verification for Phase 15 Evidence Taxonomy**:
   - Range-read header byte verification during S3 evidence confirmation for the 6 authoritative Phase 15 formats:
     - `image/jpeg` $\to$ `FF D8 FF`
     - `image/png` $\to$ `89 50 4E 47 0D 0A 1A 0A`
     - `image/webp` $\to$ `RIFF....WEBP`
     - `audio/webm` $\to$ `1A 45 DF A3` (EBML)
     - `audio/ogg` $\to$ `4F 67 67 53` (`OggS`)
     - `audio/wav` $\to$ `RIFF....WAVE`
   - Rejects spoofed or disguised executable binaries immediately before marking evidence `AVAILABLE`.
7. **Deterministic Vulnerability Governance & OWASP Top 10 Mitigation**:
   - Deterministic vulnerability policy defining production vs. development scopes, severity thresholds, and documented exception workflows.
   - Automated penetration test suite covering OWASP Top 10 categories (A01 through A10).

---

## 5. Explicit Out-of-Scope Items

To prevent scope leakage into Phase 19 (Containerization & Deployment) or beyond, the following items are **strictly out of scope** for Phase 18:

- **Dockerization & Multi-Stage Builds**: Writing `Dockerfile`, `docker-compose.yml`, or container images (reserved for Phase 19).
- **CI/CD Pipeline Deployment**: Creating GitHub Actions release workflows or Kubernetes manifests (reserved for Phase 19).
- **Hardware-Backed Device Attestation / OS Lockdown Browsers**: TPM enclaves, WebAuthn per-autosave biometric signing, or native OS lockdown shells (e.g. Safe Exam Browser). ProctorNet remains a browser SPA using standard Web Crypto and REST APIs.
- **External Heavy Antivirus Daemons**: Running ClamAV daemons or AWS GuardDuty malware scanning (mitigated natively via S3 magic-byte range verification and strict MIME whitelists).
- **PDF Artifact Validation**: PDF is not an authorized evidence type in Phase 15/18; evidence is strictly limited to webcam, screen, and audio captures.

---

## 6. Architectural Impact

Phase 18 introduces defense-in-depth security layers without altering the modular monolith boundary or shifting the source of truth away from PostgreSQL:

```
                                  [ CLIENT BROWSER ]
                                          |
                      (HTTPS / TLS 1.3 + WSS Media & Signaling)
                                          |
                                          v
      ====================== [ EXPRESS APPLICATION ] ======================
      |                                                                   |
      |  [ Layer 1: Helmet Security Headers (CSP, HSTS, X-Frame-Options) ]|
      |  [ Layer 2: Strict Multi-Origin CORS Whitelist Validator ]       |
      |  [ Layer 3: Rate Limiting & Brute-Force Abuse Protections ]       |
      |  [ Layer 4: Structural Input Sanitizer (Proto Pollution/Nulls) ]  |
      |  [ Layer 5: JWT Authentication & Server-Authoritative Roles ]     |
      |  [ Layer 6: Resource Ownership & BOLA Verification ]              |
      |  [ Layer 7: Anti-Tampering & Replay Defense (Redis Nonces) ]      |
      |                                                                   |
      =====================================================================
                    |                                        |
                    v                                        v
     [ Ephemeral Redis Cluster ]                  [ Authoritative PostgreSQL ]
     - Shared Anti-Replay Nonces (5m TTL)          - 100% Parameterized Queries
     - Fail-Closed in Prod Outages                 - Allowlisted Dynamic Identifiers
     - Rate-Limiting Sliding Windows              - Immutable Audit Logs
     - Session Blacklist Tokens                   - Authoritative Attempt/Session State
```

---

## 7. Component & Plane Interactions

1. **REST Plane**:
   - Inbound requests pass through: Helmet $\to$ CORS $\to$ Body Parser $\to$ Structural Input Sanitizer $\to$ Request ID $\to$ Metrics Middleware $\to$ Router.
   - Protected routes pass through: `authenticate` $\to$ `requireRole` $\to$ `resourceAuthorization` $\to$ `antiTamperMiddleware`.
2. **WebSocket Control Plane**:
   - Connection upgrade validates `Origin` against `CORS_ALLOWED_ORIGINS`.
   - Message payloads bound to `WS_MAX_PAYLOAD_BYTES` (64KB) with per-socket sliding rate limiting.
3. **WebRTC SFU Media Plane**:
   - Media signaling operates over validated WebSockets with generation-fenced worker pinning and 900s ephemeral TURN credentials.
   - Network media transmission (UDP/TCP RTP/RTCP) is governed by ICE server transport, while `<video>` elements are governed by `media-src 'self' blob: mediastream:`.
4. **S3 Evidence Storage**:
   - Presigned upload URLs restricted to validated MIME types.
   - Confirmation verifies exact byte sizes, content types, and binary file signatures (magic bytes) for the 6 allowed formats.

---

## 8. Backend Changes

### 8.1 Configuration (`backend/src/config/env.js`)
- Add `CORS_ALLOWED_ORIGINS`: Comma-separated string of authorized origin URLs, parsed into an array. Rejects `*` if `NODE_ENV === 'production'`. Default: `'http://localhost:3000,http://localhost:5173'`.
- Add `ANTI_TAMPER_SECRET`: Cryptographic secret (minimum 32 characters) used to derive attempt-specific HMAC keys. Defaults to `JWT_ACCESS_SECRET` in development/test.
- Add `ANTI_TAMPER_MAX_DRIFT_MS`: Allowed clock skew tolerance window in milliseconds. Default: `300000` (5 minutes).
- Add `ALLOW_IN_MEMORY_NONCE_FALLBACK`: Boolean flag allowing in-memory LRU fallback when Redis is down. Defaults to `false` in production, `true` in development/test.
- Add `CSP_REPORT_ONLY`: Boolean flag to allow CSP testing in staging environments. Default: `false`.
- Add `SECURITY_MAGIC_BYTES_VERIFICATION`: Boolean flag to toggle binary magic-byte verification on evidence confirmation. Default: `true`.

### 8.2 Application Entrypoint & CSP Design (`backend/src/app.js`)
- Replace generic `app.use(helmet())` with fine-grained configuration:
  - **Content-Security-Policy (CSP)**:
    - `default-src: ["'self'"]`
    - `script-src: ["'self'"]` (prohibits `'unsafe-inline'` and `'unsafe-eval'` in production)
    - `style-src: ["'self'", "'unsafe-inline'"]` (required for styled components and UI libraries)
    - `img-src: ["'self'", "data:", "blob:"]` (local assets and canvas preview thumbnails)
    - `font-src: ["'self'"]`
    - `media-src: ["'self'", "blob:", "mediastream:"]` (required for HTMLMediaElement playback of WebRTC streams and audio clips)
    - `connect-src: ["'self'", "ws:", "wss:", config.AWS_S3_ENDPOINT || `https://${config.AWS_S3_BUCKET}.s3.${config.AWS_REGION}.amazonaws.com`, ...(config.NODE_ENV !== 'production' ? ['http://localhost:4566', 'http://127.0.0.1:4566'] : [])]` (REST API, WebSocket control plane, and scoped S3 presigned uploads; avoids overly broad AWS wildcards)
    - `worker-src: ["'self'", "blob:"]` (worker threads for timer and media processing)
    - `object-src: ["'none'"]`
    - `frame-ancestors: ["'none'"]`
    - `base-uri: ["'self'"]`
    - `form-action: ["'self'"]`
  - `crossOriginOpenerPolicy`: `{ policy: 'same-origin' }`
  - `crossOriginResourcePolicy`: `{ policy: 'same-origin' }`
  - `crossOriginEmbedderPolicy`: `{ policy: 'credentialless' }`
  - `hsts`: `{ maxAge: 31536000, includeSubDomains: true, preload: true }`
  - `frameguard`: `{ action: 'deny' }`
  - `noSniff`: `true`
  - `referrerPolicy`: `{ policy: 'strict-origin-when-cross-origin' }`
- **Dynamic CORS Whitelist Validator**:
  - Matches `req.headers.origin` against `config.CORS_ALLOWED_ORIGINS`.
  - Whitelists non-browser requests (`!origin`).
  - Sets `credentials: true`, explicit methods (`GET,POST,PUT,PATCH,DELETE,OPTIONS`), explicit headers (`Content-Type,Authorization,X-Request-ID,X-Payload-Signature`), exposed headers (`X-Request-ID,Content-Range,Retry-After`), and `maxAge: 86400`.

### 8.3 Structural Input Sanitization (`backend/src/middleware/sanitizeInput.js`)
- **Non-Destructive Design**:
  - Does NOT strip text content, HTML entities, or code from answer values.
  - Deeply traverses `req.body` and `req.query`:
    - **Rejects/Strips Prototype Pollution Keys**: Deletes keys named `__proto__`, `constructor`, `prototype`.
    - **Strips Null Bytes**: Strips `\0` characters from strings to prevent C-string truncation attacks.
    - **Control Characters**: Strips non-printable control characters (`[\x00-\x08\x0B\x0C\x0E-\x1F]`) from query strings and non-answer metadata.
    - **Preserves Legit Text**: Leaves `<script>`, quotes, symbols, math operators (`<`, `>`), and code snippets intact in answer payloads so student programming/math answers are not mutated.
- **Deterministic Ordering**:
  - Middleware ordering: `express.json()` $\to$ `sanitizeInputMiddleware` $\to$ route handlers with Zod schema validation (`schema.parse()`).
  - Structural sanitization removes dangerous prototype-pollution keys and null bytes before schema validation executes, ensuring that schema parsers process structurally clean objects.

### 8.4 Anti-Tampering Engine (`backend/src/utils/antiTamper.js` & `backend/src/middleware/antiTamper.js`)
- **Key Derivation (Server-Side)**:
  ```javascript
  export function deriveAttemptSigningKey(rootSecret, attemptId, studentId, startedAt) {
    return crypto.createHmac('sha256', rootSecret)
      .update(`${attemptId}:${studentId}:${new Date(startedAt).getTime()}`)
      .digest('hex');
  }
  ```
- **Signature Computation**:
  ```javascript
  export function computePayloadSignature(key, timestamp, nonce, method, path, body) {
    const bodySha256 = crypto.createHash('sha256')
      .update(typeof body === 'string' ? body : JSON.stringify(body || {}))
      .digest('hex');
    const stringToSign = `${timestamp}.${nonce}.${method.toUpperCase()}.${path}.${bodySha256}`;
    return crypto.createHmac('sha256', key).update(stringToSign).digest('hex');
  }
  ```
- **Middleware Protocol**:
  1. Parses `X-Payload-Signature: t=<timestamp_ms>,nonce=<uuid>,v1=<signature_hex>`. Returns `400 Bad Request` (`ERR_SIGNATURE_MISSING`) if absent or malformed.
  2. Verifies timestamp freshness: $|t_{\text{server}} - t_{\text{client}}| \le \text{ANTI\_TAMPER\_MAX\_DRIFT\_MS}$ (5 minutes). Rejects with `403 Forbidden` (`ERR_SIGNATURE_EXPIRED`).
  3. **Shared Multi-Node Replay Check (Redis)**:
     - Attempts atomic write: `SET v1:antitamper:nonce:{attemptId}:{nonce} 1 EX 300 NX`.
     - If key already exists $\to$ rejects with `409 Conflict` (`ERR_REPLAY_DETECTED`).
     - **Redis Outage Handling**:
       - In `NODE_ENV === 'production'`: If Redis is down/unreachable, **fails closed** with `503 Service Unavailable` (`ERR_REPLAY_SERVICE_UNAVAILABLE`) and `Retry-After: 5`.
       - In non-production (or if `ALLOW_IN_MEMORY_NONCE_FALLBACK=true`): Falls back to local bounded LRU cache (`max: 10000`, `ttl: 300000ms`) with a logged warning.
  4. Derives candidate signing key using server root secret, `req.user.userId`, route `attemptId`, and attempt `started_at`.
  5. Computes expected signature and compares using `crypto.timingSafeEqual`.
  6. Rejects signature mismatch with `403 Forbidden` (`ERR_SIGNATURE_INVALID`) and emits security audit event `SECURITY_PAYLOAD_TAMPERED`.

### 8.5 Attempt Lifecycle Tokens & Determinism (`backend/src/modules/attempts/attempts.service.js`)
- **Deterministic Derivation**:
  - `anti_tamper_token` is derived strictly from immutable attempt fields: `(attempt_id, student_id, started_at)`.
  - Calling `getAttemptById` upon page refresh, browser reconnect, or network recovery returns the **exact same deterministic token** without rotating or invalidating existing sessions.
- **Lifecycle Invalidation**:
  - *Active Attempt*: Token is valid for signing mutations as long as `attempt.status === 'ACTIVE'` and the PostgreSQL server deadline (`expires_at`) has not elapsed.
  - *Terminal Attempt (`SUBMITTED`, `EXPIRED`, `DISQUALIFIED`)*: Mutating answer and proctoring endpoints verify attempt status in PostgreSQL and reject modifications with `409 Conflict`, permanently rendering the token inert without requiring complex stateful token revocation lists.
  - *Cross-Attempt Isolation*: Each attempt has a unique `attempt_id` and timestamp, ensuring tokens cannot be reused across attempts or candidates.

### 8.6 Route Hardening
- Mount `antiTamperMiddleware` on:
  - `PUT /api/v1/attempts/:attemptId/answers/:attemptQuestionId`
  - `DELETE /api/v1/attempts/:attemptId/answers/:attemptQuestionId`
  - `POST /api/v1/attempts/:attemptId/answers/batch`
  - `POST /api/v1/attempts/:attemptId/events`

### 8.7 Evidence Binary File Signature Verification (`backend/src/modules/evidence/evidence.service.js`)
- During `confirmUpload`, execute an S3 range-read for the first 16 bytes: `GetObjectCommand({ Bucket, Key, Range: 'bytes=0-15' })`.
- Validate magic bytes against declared MIME type:
  - `image/jpeg` $\to$ starts with `FF D8 FF`
  - `image/png` $\to$ starts with `89 50 4E 47 0D 0A 1A 0A`
  - `image/webp` $\to$ bytes 0–3 `RIFF`, bytes 8–11 `WEBP`
  - `audio/webm` $\to$ starts with `1A 45 DF A3` (EBML ID)
  - `audio/ogg` $\to$ starts with `4F 67 67 53` (`OggS`)
  - `audio/wav` $\to$ bytes 0–3 `RIFF`, bytes 8–11 `WAVE`
- If magic bytes do not match, fail confirmation immediately, transition status to `FAILED`, and record audit log `SECURITY_MALFORMED_EVIDENCE`.

---

## 9. Frontend Changes

### 9.1 Anti-Tampering Client Utility (`frontend/src/utils/antiTamperClient.js`)
- Web Crypto API (`window.crypto.subtle`) helper:
  - Computes SHA-256 digest of payload body.
  - Imports `anti_tamper_token` as HMAC-SHA256 key.
  - Constructs `stringToSign = `${t}.${nonce}.${method.toUpperCase()}.${path}.${bodySha256}``.
  - Generates HMAC-SHA256 hex signature.
  - Formats header: `t=${t},nonce=${nonce},v1=${signatureHex}`.

### 9.2 API Client Request Interceptor & Retry Handling (`frontend/src/api/client.js`)
- **Fresh Nonce on Retry**:
  - When retrying timed-out or dropped requests, the client interceptor **MUST generate a fresh timestamp and fresh nonce** before recomputing `X-Payload-Signature`.
  - This ensures that network retries pass anti-tamper freshness checks while existing PostgreSQL OCC and payload equality logic (`isPayloadEqual`) guarantee business idempotency.

### 9.3 Exam Context Integration (`frontend/src/context/ExamContext.jsx`)
- Retains `antiTamperToken` in React state upon attempt start/resumption.
- Automatically supplies token to `saveAnswer`, `clearAnswer`, `batchSaveAnswers`, and `ingestEvents`.

---

## 10. Database Changes

### Database Decision: NO MIGRATION REQUIRED
- **Authoritative Analysis**:
  - Anti-tampering verification is verified in the application/middleware layer.
  - Security anomalies leverage the existing `audit_logs` table (created in Phase 13) with actions `SECURITY_PAYLOAD_TAMPERED`, `SECURITY_REPLAY_DETECTED`, and `SECURITY_MALFORMED_EVIDENCE`.
  - Replay nonces are stored in ephemeral Redis with 300s TTL.
  - The `answers` and `proctoring_events` tables already have all required columns (`revision`, `answer_value`, `metadata`, `client_timestamp`).
  - No database tables, columns, indexes, or constraints need modification.
- **Rollback & Zero Downtime**:
  - Zero schema modifications eliminate migration lock contention, data migration risks, and rollback complexities.

---

## 11. Redis Changes & Multi-Node Replay Architecture

### 11.1 Key Topology
- **Key Pattern**: `v1:antitamper:nonce:{attemptId}:{nonce}`
- **Value**: `'1'`
- **TTL**: 300 seconds (5 minutes).
- **Atomic Command**: `SET key 1 EX 300 NX`.

### 11.2 Multi-Node Routing & Partition Behavior
- **Multi-Node Routing**:
  - All backend nodes share the same Redis cluster/instance.
  - If a signed request with nonce `N` is processed by Node A, the nonce is immediately locked in Redis.
  - If an identical replayed request reaches Node B, Node B checks Redis, encounters the locked key, and rejects with `409 Conflict`.
- **Redis Outage Policy**:
  - **Production Mode (`NODE_ENV === 'production'`)**:
    - Fails closed for signed mutating requests: returns `503 Service Unavailable` (`ERR_REPLAY_SERVICE_UNAVAILABLE`) with `Retry-After: 5`.
    - Per-process in-memory fallback is strictly forbidden in production because it cannot prevent cross-node replays across independent backend containers.
  - **Development / Test Mode (`NODE_ENV !== 'production'`)**:
    - Falls back to an in-memory bounded LRU cache (`max: 10000`, `ttl: 300000ms`) with logged warnings, allowing local offline testing.
- **Redis Recovery**:
  - ioredis client reconnects automatically. As soon as connectivity is restored, health checks flip to healthy and signed mutations immediately resume Redis-backed locking.

---

## 12. RabbitMQ Changes

- **Impact**: Zero schema or topology changes.
- **Continuity**: Phase 18 does not alter RabbitMQ queues, exchanges, or bindings. Outbox workers and asynchronous evaluation continue to operate exactly as defined in ADR-0002.

---

## 13. S3 Changes & Magic Byte Taxonomy

### 13.1 Phase 15 Evidence Taxonomy Alignment
S3 evidence storage is strictly bound to the 6 authoritative MIME types defined in Phase 15 (`evidence.schemas.js`):

| Evidence Type | MIME Type | Extension | Header Magic Bytes | Byte Length |
|---|---|---|---|---|
| `WEBCAM_SNAPSHOT` | `image/jpeg` | `.jpg` | `FF D8 FF` | 3 bytes |
| `WEBCAM_SNAPSHOT`, `SCREEN_CAPTURE` | `image/png` | `.png` | `89 50 4E 47 0D 0A 1A 0A` | 8 bytes |
| `WEBCAM_SNAPSHOT`, `SCREEN_CAPTURE` | `image/webp` | `.webp` | `RIFF` (0-3) + `WEBP` (8-11) | 12 bytes |
| `AUDIO_SNIPPET` | `audio/webm` | `.webm` | `1A 45 DF A3` (EBML Header) | 4 bytes |
| `AUDIO_SNIPPET` | `audio/ogg` | `.ogg` | `4F 67 67 53` (`OggS`) | 4 bytes |
| `AUDIO_SNIPPET` | `audio/wav` | `.wav` | `RIFF` (0-3) + `WAVE` (8-11) | 12 bytes |

*Note: PDF is explicitly excluded. Only the 6 audio/image formats above are accepted.*

---

## 14. WebSocket Changes

- **Upgrade Origin Validation**:
  - `wsEngine.js` HTTP upgrade listener inspects `req.headers.origin` and cross-references it with `config.CORS_ALLOWED_ORIGINS`.
  - Unauthorized origins are rejected with HTTP `403 Forbidden` prior to socket upgrade.
- **Payload Bounds**:
  - Retains Phase 16/17 safeguards: `WS_MAX_PAYLOAD_BYTES` = 64KB, per-socket sliding rate limiting.

---

## 15. WebRTC / SFU Changes

- **Impact**: Zero changes to mediasoup C++ workers, router pipelines, or pipe transports.
- **Continuity**: Ephemeral TURN credentials continue to use the 900-second TTL approved in Phase 17. CSP headers in Helmet explicitly whitelist `mediastream:` and `blob:` in `media-src` to permit local and remote media element rendering.

---

## 16. API Changes

| Method | Endpoint | Security Gate | Response on Failure |
|---|---|---|---|
| `ALL` | `/*` | Helmet & CORS | `403 Forbidden` on unauthorized CORS origin. |
| `ALL` | `/api/v1/*` | Structural Sanitizer | Strips prototype pollution keys and null bytes; rejects malformed inputs via Zod `400`. |
| `POST` | `/api/v1/sessions/:id/attempts` | Auth + Student | Returns ephemeral `anti_tamper_token` in response body. |
| `GET` | `/api/v1/attempts/:attemptId` | Auth + Access | Returns ephemeral `anti_tamper_token` for candidate owner. |
| `PUT` | `/api/v1/attempts/:attemptId/answers/:qId` | Anti-Tamper | `400` if header missing; `403` if expired/invalid signature; `409` if replayed; `503` if Redis down in prod. |
| `DELETE` | `/api/v1/attempts/:attemptId/answers/:qId` | Anti-Tamper | Same as above. |
| `POST` | `/api/v1/attempts/:attemptId/answers/batch` | Anti-Tamper | Same as above. |
| `POST` | `/api/v1/attempts/:attemptId/events` | Anti-Tamper | Same as above. |
| `POST` | `/api/v1/attempts/:attemptId/evidence/:id/confirm` | Magic Bytes | `400 Bad Request` if S3 binary header does not match declared MIME. |

---

## 17. Security Model & Threat Classification

```
+----------------------------------------------------------------------------------------------------+
|                                    THREAT CLASSIFICATION MATRIX                                    |
+----------------------------------------------------------------------------------------------------+
| Threat Class A: In-Transit / Request Modification                                                  |
| - Threat: Intermediary proxy or malicious extension alters answer payload or proctoring telemetry.|
| - Defense: TLS 1.3 link encryption + HMAC-SHA256 signature binding request method, path, timestamp,|
|   nonce, and body hash to candidate's attempt key. Tampered payloads fail signature validation.    |
+----------------------------------------------------------------------------------------------------+
| Threat Class B: Replay Attacks                                                                     |
| - Threat: Eavesdropped or intercepted signed requests re-transmitted at a later time.              |
| - Defense: 5-minute timestamp validity window + atomic Redis nonce deduplication (SET EX 300 NX).  |
+----------------------------------------------------------------------------------------------------+
| Threat Class C: Malicious Client Modification (Untrusted Browser Environment)                      |
| - Threat: Candidate uses DevTools / bots to forge answers, bypass UI timers, or spoof telemetry.   |
| - Boundary: Symmetric HMAC in browser CANNOT prove the client machine is trustworthy.              |
| - Defense: Server-Authoritative Controls:                                                          |
|   1. Authoritative Server Clock (PostgreSQL CURRENT_TIMESTAMP enforces expires_at deadline).       |
|   2. Optimistic Concurrency Control (expected_revision enforces sequence and prevents overwrites).  |
|   3. Question & Option Validation (options verified against question bank in PostgreSQL).          |
|   4. Server-Side Anomaly Scoring (proctoring risk scores computed independently by backend).       |
+----------------------------------------------------------------------------------------------------+
| Threat Class D: Broken Object Level Authorization (BOLA / IDOR)                                   |
| - Threat: Candidate A attempts to modify Candidate B's answers or telemetry.                       |
| - Defense: Independent of HMAC! Enforced by PostgreSQL ownership check: attempt.student_id == user.|
|   Furthermore, backend derives signing key from JWT studentId, making cross-candidate signing      |
|   cryptographically impossible.                                                                    |
+----------------------------------------------------------------------------------------------------+
```

### 17.2 Dedicated CSRF & Cookie Security Architecture
ProctorNet does NOT rely on CORS alone as a CSRF defense. Cross-Site Request Forgery is systematically eliminated via a multi-layered token and header architecture:

1. **Dual-Token State Isolation**:
   - Short-lived Access Tokens (JWT, 15m) are held strictly in browser memory (never in cookies or localStorage) and transmitted exclusively via the `Authorization: Bearer <token>` header.
   - Standard browsers **never** automatically attach custom `Authorization: Bearer` headers to cross-site requests.
   - Refresh Tokens (7d) are stored in `HttpOnly`, `SameSite=Strict`, `Secure` (in production) cookies.
2. **`SameSite=Strict` Cookie Policy**:
   - The refresh token cookie is configured with `SameSite=Strict`. Under this standard, browsers withhold the cookie on **all** cross-site requests, including top-level cross-site navigations, cross-origin forms, and cross-origin `fetch`/`XMLHttpRequest` calls.
   - `/api/v1/auth/refresh` is strictly a POST endpoint. A cross-site attacker cannot forge a refresh request because the browser strips the cookie.
3. **Custom Header & Preflight Enforcement**:
   - All state-changing business endpoints (`/exams`, `/sessions`, `/attempts`, `/answers`, `/proctoring`, `/evidence`) mandate custom headers: `Authorization: Bearer ...`, `Content-Type: application/json`, and `X-Payload-Signature`.
   - The presence of custom headers automatically triggers a browser CORS Preflight (`OPTIONS`) request. If the requesting origin is not explicitly in `CORS_ALLOWED_ORIGINS`, the browser blocks the preflight and the mutating request is never dispatched.
4. **Non-Browser Clients**:
   - Non-browser clients (e.g. mobile apps, automated test suites, cURL) do not use ambient cookie credentials for business APIs and must explicitly pass the `Authorization` and `X-Payload-Signature` headers.
5. **Endpoints Without Anti-Tamper Signatures**:
   - Endpoints not requiring HMAC signatures (e.g. exam creation by faculty, session scheduling, user registration) are fully protected by `Authorization: Bearer <jwt>`, strict JSON `Content-Type`, and CORS preflight enforcement, eliminating CSRF vulnerabilities across the entire API surface.

---

## 18. Authorization & BOLA Implications

- BOLA defense does **NOT** rely on HMAC signatures. BOLA is independently and strictly enforced by PostgreSQL database ownership checks in `answers.service.js`, `proctoring.service.js`, and `evidence.service.js`:
  ```javascript
  if (attempt.student_id !== user.userId) {
    throw new ForbiddenError('Forbidden: You can only access your own attempt');
  }
  ```
- Candidate clients cannot inject `severity` or `riskScore`; Zod schemas reject client-supplied administrative fields with `.strict()`.

---

## 19. Privacy Implications

- **Telemetry Data Minimization**: Metadata schema strictly restricts payload size to 4KB and blacklists sensitive terms (`password`, `keystroke`, `clipboardText`, `token`, `cookie`).
- **Zero Secret Exposure**: The root `ANTI_TAMPER_SECRET` is never transmitted to clients. Clients only receive their derived, ephemeral `anti_tamper_token`.

---

## 20. Observability

### 20.1 Prometheus Metrics (Bounded Cardinality)
| Metric Name | Type | Labels | Description |
|---|---|---|---|
| `security_tamper_violations_total` | Counter | `reason` (`missing_header`, `expired_ts`, `replay_detected`, `signature_mismatch`, `redis_unavailable`) | Total anti-tamper signature failures. |
| `security_input_sanitizations_total` | Counter | `action` (`proto_pollution_stripped`, `null_byte_stripped`) | Total structural sanitizations performed. |
| `security_cors_rejections_total` | Counter | `origin_type` (`unauthorized`, `malformed`) | Total requests rejected by CORS policy. |
| `security_magic_byte_mismatches_total` | Counter | `mime_type` | Total evidence files failing magic byte verification. |

---

## 21. Audit Requirements

Authoritative entries in the PostgreSQL `audit_logs` table:
- `SECURITY_PAYLOAD_TAMPERED`: Logged on signature mismatch. Contains `attemptId`, `method`, `path`, and client IP.
- `SECURITY_REPLAY_DETECTED`: Logged on duplicate nonce reuse within the validity window.
- `SECURITY_MALFORMED_EVIDENCE`: Logged when uploaded evidence fails binary file signature verification.

---

## 22. Failure & Recovery Modes

1. **Redis Outage / Partition (Production)**:
   - Backend fails closed for signed mutations: returns `503 Service Unavailable` (`ERR_REPLAY_SERVICE_UNAVAILABLE`).
   - Read-only endpoints continue operating normally.
   - Once Redis reconnects, signed requests resume immediately.
2. **Client Clock Skew**:
   - Skew $> 5\text{m}$ causes `403 Forbidden` (`ERR_SIGNATURE_EXPIRED`), returning server time.
   - Client adjusts internal clock offset against `server_time` and retries with a fresh timestamp and fresh nonce.

---

## 23. Recovery Behavior

- **Automatic Reconnection**: Redis client reconnects using exponential backoff.
- **Graceful Retries**: Frontend client automatically generates a fresh timestamp and fresh nonce on retry, avoiding replay rejections while preserving business idempotency.

---

## 24. Concurrency & Business Idempotency Interaction

### Core Invariant: EXACTLY-ONCE BUSINESS EFFECT, NOT EXACTLY-ONCE DELIVERY

Anti-tamper transport freshness and PostgreSQL business idempotency are strictly decoupled:

1. **Duplicate HTTP Delivery / Reverse-Proxy Retry (Same Nonce)**:
   - Request has identical `nonce`, timestamp, signature, and body.
   - First request acquires Redis nonce key via `SET NX` and processes.
   - Second request encounters locked nonce in Redis $\to$ rejected with `409 Conflict` (`ERR_REPLAY_DETECTED`). PostgreSQL is not touched.
2. **Frontend Timeout Retry (Fresh Nonce, Identical Business Payload)**:
   - Client timed out waiting for response, generates a **fresh nonce** and **fresh timestamp**, and resends `{ expected_revision: 1, answer_value: { selected_option_id: 'opt-a' } }`.
   - Anti-tamper verifies fresh nonce in Redis $\to$ passes transport gate.
   - Request reaches `answers.service.js`.
   - If the first attempt committed, current revision in PostgreSQL is now 2. The retry sends `expected_revision: 1`.
   - `answers.service.js` checks `isPayloadEqual(existing, incoming)`.
   - Because payloads are identical, it detects an **idempotent retry of an already applied revision** $\to$ returns committed state with `200 OK` without incrementing revision or erroring out.
3. **Concurrent Conflicting Saves (Different Payloads)**:
   - Two different tabs send different answers with fresh nonces.
   - First commits revision 2. Second arrives expecting revision 1 with different payload $\to$ rejected with `409 Conflict` (`ERR_REVISION_CONFLICT`).

---

## 25. Scaling & Capacity Assumptions

- **HMAC-SHA256 Overhead**: $< 0.15\text{ms}$ per request.
- **Input Sanitizer Overhead**: $< 0.3\text{ms}$ for payloads up to 100KB.
- **S3 Range Read Overhead**: $< 15\text{ms}$ to fetch 16 bytes over AWS internal backbone.
- *Status: Design Targets to be empirically validated during load testing.*

---

## 26. Configuration & Environment Variables

```env
# Phase 18 Security Hardening Variables
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
ANTI_TAMPER_SECRET=proctornet-super-secure-anti-tamper-secret-32-chars-minimum
ANTI_TAMPER_MAX_DRIFT_MS=300000
ALLOW_IN_MEMORY_NONCE_FALLBACK=false
CSP_REPORT_ONLY=false
SECURITY_MAGIC_BYTES_VERIFICATION=true
```

---

## 27. Dependency Changes & Deterministic Vulnerability Policy

### 27.1 Zero New Runtime Dependencies
- `helmet` (already installed, `^8.0.0`)
- `cors` (already installed, `^2.8.5`)
- `crypto` (Node.js built-in)
- `zod` (already installed, `^3.24.2`)
- Web Crypto API (`window.crypto.subtle` standard browser API)

### 27.2 Deterministic Vulnerability Policy
1. **Production Scope (`dependencies`)**:
   - Threshold: Zero unmitigated `CRITICAL` and zero unmitigated `HIGH` vulnerabilities.
   - Command: `npm audit --omit=dev --audit-level=high`.
   - Any high or critical vulnerability in production dependencies blocks deployment.
2. **Development Scope (`devDependencies`)**:
   - `CRITICAL` vulnerabilities in dev tools must be addressed.
   - `MODERATE` or `LOW` vulnerabilities that do not affect runtime artifacts do not block build, but are documented.
3. **Documented Exceptions Workflow**:
   - Silent suppression is strictly forbidden.
   - An exception may only be granted if:
     1. In-depth security analysis proves the vulnerable code path is completely unreachable in ProctorNet.
     2. Documented in `docs/SECURITY_AUDIT_EXCEPTIONS.md` with CVE, affected package, reachability proof, upstream tracking issue, and target phase for remediation.
     3. Formally approved by the Architecture / Security Lead.

---

## 28. File-Level Change Plan

### Backend Files to Modify:
1. `backend/src/config/env.js`: Add security env schemas.
2. `backend/src/app.js`: Configure customized Helmet headers, dynamic CORS whitelist, and mount structural input sanitizer.
3. `backend/src/server.js`: Integrate origin check in WebSocket upgrade handler.
4. `backend/src/modules/attempts/attempts.service.js`: Issue `anti_tamper_token` in `startAttempt` and `getAttemptById`.
5. `backend/src/modules/answers/answers.routes.js`: Mount `antiTamperMiddleware` on answer mutation routes.
6. `backend/src/modules/proctoring/proctoring.routes.js`: Mount `antiTamperMiddleware` on `POST /:attemptId/events`.
7. `backend/src/modules/evidence/evidence.service.js`: Add magic byte range verification for 6 allowed formats in `confirmUpload`.
8. `backend/src/infrastructure/metrics/registry.js`: Register Phase 18 security metrics.

### Backend Files to Create [NEW]:
9. `backend/src/middleware/sanitizeInput.js`: Structural input sanitizer stripping prototype pollution and null bytes.
10. `backend/src/utils/antiTamper.js`: Core cryptographic signing, key derivation, and verification functions.
11. `backend/src/middleware/antiTamper.js`: Express middleware enforcing `X-Payload-Signature`, freshness, and Redis-backed replay defense.
12. `backend/tests/security/helmetHeaders.test.js`: Validates CSP, HSTS, X-Frame-Options, CORP, COOP.
13. `backend/tests/security/corsPolicy.test.js`: Validates allowed origins, rejected origins, credentials, and preflight caching.
14. `backend/tests/security/inputSanitizer.test.js`: Tests prototype pollution stripping, null byte removal, and preservation of legitimate code/math in exam answers.
15. `backend/tests/security/sqliFuzzing.test.js`: Fuzzes SQLi vectors against dynamic query identifiers (ORDER BY, sort direction, dynamic WHERE builders).
16. `backend/tests/security/antiTamper.test.js`: Validates HMAC signatures, tamper rejection, clock skew, multi-node Redis replay, and prod fail-closed behavior.
17. `backend/tests/security/owaspMitigations.test.js`: End-to-end regression across OWASP Top 10 vectors.
18. `backend/tests/security/evidenceMagicBytes.test.js`: Validates magic byte verification for JPEG, PNG, WebP, WebM, OGG, WAV.

### Frontend Files to Modify:
19. `frontend/src/api/client.js`: Add request signing interceptor with fresh nonce on retry.
20. `frontend/src/context/ExamContext.jsx`: Retain `anti_tamper_token` and wire into answer saves and telemetry.

### Frontend Files to Create [NEW]:
21. `frontend/src/utils/antiTamperClient.js`: Web Crypto HMAC-SHA256 signature generator.
22. `frontend/tests/utils/antiTamperClient.test.js`: Client-side signature generation unit tests.

---

## 29. Test Strategy

1. **SQL Injection Fuzzing Suite (`sqliFuzzing.test.js`)**:
   - Injects SQL vectors into dynamic identifiers: `?sortBy=created_at;DROP+TABLE+users;--`, `?order=ASC;SELECT+*`, `?limit=10+OR+1=1`.
   - Proves malicious identifier inputs are rejected by allowlists and cannot alter generated SQL.
2. **Input Sanitizer Safety Suite (`inputSanitizer.test.js`)**:
   - Tests structural rejection of `__proto__`, `constructor`, `prototype`.
   - Tests null byte stripping.
   - Verifies legitimate programming code (`<script src="...">`, `<div>`, `x < y && a > b`) in exam answers is preserved verbatim.
3. **Anti-Tampering Suite (`antiTamper.test.js`)**:
   - Valid signature succeeds (`200`).
   - Tampered body fails (`403 Forbidden`).
   - Expired timestamp fails (`403 Forbidden`).
   - Replayed nonce fails (`409 Conflict`).
   - Production Redis outage returns `503 Service Unavailable`.
4. **Magic Bytes Suite (`evidenceMagicBytes.test.js`)**:
   - Verifies JPEG, PNG, WebP, WebM, OGG, WAV headers are accepted.
   - Verifies spoofed files (e.g. `.exe` disguised as `.jpg`) are rejected with `400 Bad Request`.
5. **Full Regression**:
   - Complete backend suite (704 existing + ~50 new tests = ~754 total).
   - Complete frontend suite (56 existing + ~5 new tests = ~61 total).
   - Clean production build.

---

## 30. Integration Testing

- End-to-end flow: Attempt start $\to$ token issuance $\to$ signed answer autosaves $\to$ retry with fresh nonce after timeout $\to$ tamper detection $\to$ submission finalization.

---

## 31. Regression Testing

All existing features from Phases 1–17 must pass without regressions:
- Auth, password reset, account lockout, dual-token refresh rotation.
- Exam authoring, topic rules, question mapping, and shuffling.
- Candidate attempts, timer enforcement, OCC answer revisions, clear answer, and batch autosave.
- Outbox worker dispatch and automated asynchronous grading.
- Proctoring telemetry ingestion, anomaly scoring, and violation flags.
- S3 presigned evidence uploads and downloads.
- Realtime WebSocket control plane events and Redis Pub/Sub syncing.
- WebRTC SFU video/audio streaming, candidate publishing, and staff consumption.

---

## 32. Manual Verification

1. Inspect DevTools Network tab on `/api/v1/auth/login`: Verify `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, and `X-Frame-Options`.
2. Unauthorized cross-origin `fetch` from browser console: Verify CORS rejection.
3. cURL mutating request without `X-Payload-Signature`: Verify `400 Bad Request`.
4. Tampered payload using valid signature: Verify `403 Forbidden` and `SECURITY_PAYLOAD_TAMPERED` audit log.

---

## 33. Performance Targets

- **Security Middleware Overhead**: $< 1.0\text{ms}$ P95 latency impact.
- **HMAC Verification**: $< 0.2\text{ms}$ per signed request.
- **Memory Footprint**: Memory usage remains stable with bounded LRU caches and streaming S3 magic-byte range checks.
- *Status: Design Targets to be empirically validated during load testing.*

---

## 34. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Overly restrictive CSP breaks WebRTC media playback | High | Whitelist `blob:` and `mediastream:` in `media-src`. |
| Client clock drift causes false-positive signature rejections | Medium | Allow 5-minute tolerance window; return server timestamp for client clock synchronization. |
| Redis outage in production blocks exam submissions | Medium | Returns 503 with Retry-After; client retries automatically when Redis recovers. Nonce TTL is only 5 minutes. |
| Input sanitizer alters legitimate programming/math answers | High | Adopt non-destructive structural sanitization; preserve answer text verbatim; rely on React output encoding for XSS defense. |

---

## 35. ADR Requirements

### Proposed Architecture Decision Record:
- **Number**: ADR-0008
- **Title**: Application Security Hardening, Cryptographic Anti-Tampering, and Threat Mitigation
- **Status**: Proposed (to be drafted upon plan approval)
- **Context**: ProctorNet requires defense against in-transit payload tampering, replay attacks, cross-site scripting, and unauthorized cross-origin requests without introducing microservice gateways or heavy external daemons.
- **Decision**: Implement HMAC-SHA256 request signing with ephemeral attempt keys, configure customized Helmet headers, enforce dynamic multi-origin CORS, apply structural input sanitization without mutating legitimate exam answers, enforce shared Redis nonce deduplication with production fail-closed semantics, and verify binary magic bytes for Phase 15 evidence types.
- **Consequences**:
  - *Positive*: Robust defense-in-depth, zero new external runtime dependencies, full OWASP Top 10 mitigation.
  - *Negative*: Requires frontend client to compute HMAC signatures for answer and event mutations.

---

## 36. Implementation Sequence

1. **Step 1: Configuration & Environment Hardening**: Add `CORS_ALLOWED_ORIGINS`, `ANTI_TAMPER_SECRET`, `ALLOW_IN_MEMORY_NONCE_FALLBACK`, etc.
2. **Step 2: Helmet Headers & Strict CORS**: Configure customized Helmet and dynamic CORS whitelist in `app.js`.
3. **Step 3: Structural Input Sanitization**: Implement `sanitizeInput.js` middleware without mutating answer text.
4. **Step 4: SQL Injection Audit & Repository Allowlist Verification**: Audit all 12 repositories and implement SQLi fuzzing test suite.
5. **Step 5: Anti-Tampering Engine (Backend)**: Implement `antiTamper.js` utility and middleware with Redis replay check and prod fail-closed behavior. Mount on answers and events routes.
6. **Step 6: Binary Magic-Bytes Verification (S3)**: Implement 16-byte range read and file signature check in `evidence.service.js` for 6 Phase 15 formats.
7. **Step 7: Frontend Anti-Tampering Integration**: Implement `antiTamperClient.js` with fresh-nonce-on-retry logic.
8. **Step 8: OWASP Top 10 Penetration & Automated Security Scan**: Run `npm audit` against deterministic vulnerability policy and author penetration test suite.
9. **Step 9: Full Regression & Verification**: Run complete backend test suite, frontend test suite, and production build.

---

## 37. Acceptance Criteria

- [ ] Helmet is configured with customized CSP, HSTS, X-Content-Type-Options, X-Frame-Options, and Cross-Origin policies.
- [ ] CORS strictly enforces `CORS_ALLOWED_ORIGINS` whitelist and rejects unauthorized origins and wildcards with credentials.
- [ ] Structural input sanitizer strips prototype pollution keys and null bytes without mutating legitimate code/math in exam answers.
- [ ] Database query audit confirms 100% parameterized queries across all 12 repositories with strict allowlists for dynamic identifiers.
- [ ] Cryptographic anti-tampering validation using HMAC-SHA256 is enforced on all candidate answer mutations and proctoring telemetry.
- [ ] Multi-node replay defense is enforced via shared Redis nonces, with production fail-closed behavior on Redis outage.
- [ ] Fresh nonces on client retries maintain exactly-once business effect without triggering false replay conflicts.
- [ ] Evidence confirmation validates binary file signatures (magic bytes) for all 6 Phase 15 evidence MIME types.
- [ ] Automated security scan adheres to deterministic vulnerability policy with zero unmitigated high/critical production vulnerabilities.
- [ ] OWASP Top 10 vulnerabilities are systematically mitigated and verified by automated penetration tests.
- [ ] 100% of existing regression tests pass across backend and frontend.

---

## 38. Phase 19 Boundary

Phase 18 strictly avoids implementing Phase 19 scope:
- **Phase 18**: Application security hardening, penetration defense, rate limiting, header security, structural data sanitization, anti-tampering cryptographic signatures.
- **Phase 19**: Containerization & Deployment (`Dockerfile`, `docker-compose.yml`, multi-stage builds, non-root users, CI/CD GitHub Actions workflows).

---

## 39. Plan Freeze Checklist

- [x] Authoritative hierarchy followed: Notion Step 13 $\to$ `DEVELOPMENT_PLAN.md` $\to$ Existing repository $\to$ ADRs.
- [x] Repository baseline verified on `main` branch with clean working tree.
- [x] All 8 reviewer findings (2 High, 6 Medium) fully resolved in plan.
- [x] All 39 required plan sections authored comprehensively.
- [x] Zero source code modified during planning.
- [x] Zero dependencies installed during planning.
- [x] Zero database migrations created.
- [x] Zero git branches, commits, pushes, PRs, or merges executed.
- [x] Phase 18 marked strictly as pending.
- [x] Phase 19 boundary explicitly demarcated.
