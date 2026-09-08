# ADR-0008: Application Security Hardening, Cryptographic Anti-Tampering, and Defense-in-Depth

## Status
Accepted (Phase 18)

## Date
2026-09-08

## Context & Problem Statement
The Online Examination System operates high-stakes academic examinations where candidate responses and proctoring telemetry directly determine grading, accreditation, and misconduct determinations. The client browser runs in an inherently untrusted execution environment where candidates, browser extensions, proxies, or malware possess full inspection and manipulation capabilities over the Document Object Model (DOM), JavaScript runtime, local storage, and outbound network requests.

Prior to Phase 18, the system relied on:
- Authoritative PostgreSQL transactional business logic and Row-Level/Role-Based Access Control (RBAC).
- Ephemeral Redis caching and rate limiting (ADR-0001).
- Asynchronous RabbitMQ worker queues (ADR-0002).
- Prometheus metrics and immutable audit logging (ADR-0003).
- Server-authoritative proctoring event ingestion (ADR-0004).
- Presigned S3 evidence capture (ADR-0005).
- Authenticated WebSocket realtime control plane (ADR-0006).
- WebRTC SFU media streaming (ADR-0007).

However, high-stakes examination platforms face critical application-level security threats:
1. **Request Tampering & Replay Attacks**: Malicious candidates modifying answer payloads or replaying earlier telemetry in transit.
2. **Prototype Pollution & Null-Byte Injection**: Malicious JSON payloads mutating JavaScript object prototypes or corrupting database/file paths via `\0` bytes.
3. **Cross-Site Scripting (XSS) & Clickjacking**: Malicious code injection or framing of the exam interface.
4. **Cross-Site Request Forgery (CSRF)**: Unauthorized state changes executed via authenticated user browser sessions.
5. **SQL Injection & Identifier Fuzzing**: Injections targeting dynamic query builders, filter parameters, or order clauses.
6. **MIME-Type Spoofing / Polyglot Uploads**: Uploading executable or corrupted files disguised with benign MIME types into S3 evidence storage.

## Decision Drivers
- **Zero Candidate Impersonation or Cross-Attempt Tampering**: Cryptographic signing must guarantee that mutating requests cannot be forged or modified across attempts or candidates.
- **Defense-in-Depth without Breaking Business Logic**: Input sanitization must eliminate structural hazards (prototype pollution, null bytes) without corrupting candidate code submissions, LaTeX formulas, or rich text answers.
- **Fail-Closed Replay Defense in Production**: In production, replay defense must strictly fail closed if Redis is unavailable, while providing resilient bounded fallbacks in local test environments.
- **Authoritative Server Verification**: The browser signing material must never be treated as an absolute trust root; server-side BOLA, session state machines, and database constraints remain the authoritative boundary.
- **Zero Architectural Drift**:
  - PostgreSQL remains the sole authoritative source of truth.
  - Redis remains non-authoritative and ephemeral.
  - RabbitMQ remains asynchronous only.
  - S3 retains Phase 15 evidence scope (no continuous media, no PDF).
  - WebRTC SFU (Phase 17) and WebSocket control plane (Phase 16) remain intact.

## Considered Options

### 1. Request Signing & Anti-Tamper Mechanism
- **Option A (Full Asymmetric Public/Private Key Pairs per Browser)**:
  - Generate WebCrypto ECDSA/RSA key pairs in the browser and register the public key with the backend on session start.
  - *Cons*: High cryptographic overhead, complex key management across browser page reloads/crashes, latency spikes on high-frequency telemetry.
- **Option B (Browser Obfuscated Static HMAC Key)**:
  - Hardcode or distribute a global static HMAC secret to the frontend bundle.
  - *Cons*: Trivial to reverse-engineer; provides zero cross-candidate isolation; insecure against determined attackers.
- **Option C (Server-Derived Attempt-Bound Ephemeral HMAC-SHA256 Token) (Chosen)**:
  - Backend derives an attempt-specific signing key `HMAC-SHA256(server_secret, attempt_id || candidate_id)` and issues it as an `anti_tamper_token` upon authenticated attempt creation or retrieval.
  - Browser signs mutating answer and proctoring requests using WebCrypto `SubtleCrypto` with canonical body digest, timestamp, and UUIDv4 nonce: `X-Payload-Signature: t=...,n=...,s=...`.
  - Backend verifies canonical digest in constant time, enforces a 5-minute maximum drift window, and tracks nonces atomically in Redis with `SET NX EX 300`.

### 2. Production Replay Defense Resiliency
- **Option A (Always Fail Open)**:
  - If Redis is unavailable, allow requests through without nonce verification.
  - *Cons*: In high-stakes production, Redis downtime would allow malicious candidates to replay submitted answers or spam past telemetry.
- **Option B (Strict Production Fail-Closed with Configurable Fallback) (Chosen)**:
  - In `production` (`NODE_ENV === 'production'`), if Redis is unreachable or fails during replay nonce verification, the middleware immediately rejects the request with HTTP `503 Service Unavailable`, `Retry-After: 5`, and error code `ERR_REPLAY_SERVICE_UNAVAILABLE`.
  - In development/test environments, a bounded in-memory LRU cache fallback is permitted (`ALLOW_IN_MEMORY_NONCE_FALLBACK === 'true'`).

### 3. Input Sanitization Strategy
- **Option A (Aggressive Regex HTML/Script Stripping on All Fields)**:
  - Strip all HTML, `<script>`, quotes, and symbols from request bodies.
  - *Cons*: Corrupts candidate programming code (e.g., `<stdio.h>`, `x < y && z > 0`), mathematical comparisons, LaTeX syntax, and valid Markdown answers.
- **Option B (Non-Destructive Structural Hazard Sanitization) (Chosen)**:
  - Recursively traverse object trees to remove prototype pollution keys (`__proto__`, `constructor`, `prototype`) and null-byte (`\0`) characters.
  - Preserve all text content, math symbols, code snippets, and legitimate answer payloads.
  - Rely on framework template escaping (React JSX) and strict Content-Security-Policy to prevent XSS on rendering.

### 4. Binary File Signature (Magic Bytes) Verification
- **Option A (Full S3 Object Download in Backend for Inspection)**:
  - Download the entire evidence file from S3 into backend RAM before confirmation.
  - *Cons*: Severe bandwidth amplification, memory bloat, and latency penalties when confirming 5–10 MB screen or video recordings.
- **Option B (S3 HTTP Range Request for First 16 Bytes) (Chosen)**:
  - Execute an S3 `GetObjectCommand` specifying `Range: bytes=0-15`.
  - Inspect byte signatures against MIME allowlists (JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF...WEBP`, WebM `1A 45 DF A3`, OGG `OggS`, WAV `RIFF...WAVE`).
  - Zero tolerance for mismatches or executable payloads; reject with HTTP 400 and flag security audit violation.

## Decision Outcome
Chosen approach: Comprehensive defense-in-depth security hardening across HTTP headers, CORS, CSRF, input sanitization, dynamic SQL allowlisting, cryptographic request signing, replay defense, and binary evidence validation.

### Key Architectural Implementations:

1. **HTTP Security Headers & CORS**:
   - Helmet mounted with strict Content-Security-Policy (CSP), HTTP Strict Transport Security (`maxAge: 31536000; includeSubDomains; preload`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, and restrictive `Permissions-Policy`.
   - Strict CORS origin validator with exact origin whitelist matching (`CORS_ALLOWED_ORIGINS`), blocking unauthorized reflection and enforcing `credentials: true`.
   - WebSocket server handshake origin validation aligned with the HTTP CORS whitelist.

2. **Anti-CSRF & BOLA Architecture**:
   - REST API relies on explicit `Authorization: Bearer <JWT>` headers for authenticated requests; session cookies use `SameSite=Strict; Secure; HttpOnly`.
   - Authoritative BOLA and attempt ownership validation remains strictly enforced at the service/database layer on every request regardless of cryptographic signatures.

3. **Anti-Tamper Cryptographic Token & Replay Prevention**:
   - Master server secret (`ANTI_TAMPER_SECRET`) never leaves the backend.
   - Attempt token derived per student attempt: `HMAC-SHA256(server_secret, attempt_id + ':' + student_id)`.
   - Client canonicalizes JSON body (recursively sorted keys, no whitespace) and computes SHA-256 body hash.
   - Signature header format: `X-Payload-Signature: t=<ms>,n=<uuidv4>,s=<hmac_hex>`.
   - Signature payload: `${timestamp}.${nonce}.${method}.${url}.${bodySha256}`.
   - Verified in constant time via `crypto.timingSafeEqual`.
   - Drift window: $\pm 300,000$ ms (5 minutes).
   - Atomic replay defense: Redis `SET anti_tamper_nonce:<nonce> 1 NX EX 300`.
   - Production failure: HTTP 503 Fail-Closed. Non-production: in-memory bounded LRU fallback.

4. **Non-Destructive Structural Hazard Sanitization**:
   - Recursive inspection cleans all request bodies, query strings, and path parameters of prototype pollution keys and `\0` null bytes without altering answer text.
   - PostgreSQL error `22P02` (invalid UUID syntax) safely mapped to HTTP 400 Bad Request to prevent unhandled database crash logs during parameter fuzzing.

5. **Dynamic SQL Hardening**:
   - All SQL identifiers (sort columns, directions, table names) validated against compile-time static allowlists.
   - All values strictly bound via PostgreSQL parameterized placeholders (`$1, $2, ...`).

6. **Evidence Magic Bytes Verification**:
   - S3 Range requests (`bytes=0-15`) verify header magic bytes for 6 allowed MIME types before transitioning evidence to `AVAILABLE`.
   - Spoofed files immediately transitioned to `FAILED`, generating `SECURITY_MALFORMED_EVIDENCE` audit events and incrementing Prometheus metrics.

7. **Observability & Audit**:
   - Security metrics registered in Prometheus: `security_tamper_violations_total`, `security_input_sanitizations_total`, `security_cors_rejections_total`, `security_magic_byte_mismatches_total`.
   - Immutable audit logs recorded for tamper violations, replay detections, and malformed evidence uploads.

## Positive Consequences
- Attackers cannot forge or tamper with answer payloads or proctoring events across attempts without possessing the master server secret.
- Tampered or replayed network packets are immediately rejected before reaching business services or database transactions.
- Zero risk of prototype pollution or null-byte filesystem/query vulnerabilities.
- Candidate code, mathematical expressions, and rich text formatting remain completely unaffected and uncorrupted.
- Evidence store is protected against extension spoofing and polyglot binary attacks with minimal bandwidth overhead ($O(1)$ 16-byte Range requests).
- Full observability into attack vectors and anomalies via Prometheus security counters and structured audit logs.

## Negative Consequences / Trade-offs
- Slight computational overhead for WebCrypto HMAC signing on mutating requests in the browser client ($\approx 1\text{ ms}$).
- Redis failure during peak production renders mutating answer/event submissions temporarily unavailable (fail-closed HTTP 503) rather than risking undetected replay or tamper attacks.
- Requires synchronized system clocks between client and server within 5 minutes (standard NTP requirement).

## Compliance & Validation
- Automated security test suites in `backend/tests/security/`:
  - `helmetHeaders.test.js`: Validates all required security headers.
  - `corsPolicy.test.js`: Validates CORS allowlist enforcement, denial of unauthorized origins, and preflight headers.
  - `inputSanitizer.test.js`: Validates prototype pollution prevention, null-byte stripping, and preservation of candidate code/math answers.
  - `sqliFuzzing.test.js`: Fuzzes UUIDs, filter queries, and search endpoints against SQL injection payloads.
  - `antiTamper.test.js`: Validates signature derivation, canonical hashing, missing/invalid signature rejection, timestamp drift, replay prevention, and production fail-closed 503.
  - `evidenceMagicBytes.test.js`: Validates magic byte signatures across all 6 MIME types and rejection of spoofed/corrupt uploads.
  - `owaspMitigations.test.js`: Validates defense-in-depth against OWASP Top 10 vulnerabilities.
- Automated client test suite in `frontend/tests/utils/antiTamperClient.test.js`: Validates Web Crypto API client signing, canonical serialization, and tamper detection.
- Complete backend (`npm test`) and frontend (`npm test`, `npm run build`) regression suites passing with zero errors.
