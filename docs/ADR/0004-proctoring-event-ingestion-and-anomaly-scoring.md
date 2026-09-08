# ADR-0004: Proctoring Event Ingestion, Server-Authoritative Anomaly Scoring, and Flag Lifecycle

## Status
Accepted (Phase 14)

## Date
2026-09-08

## Context & Problem Statement
During proctored online examinations, client telemetry (tab visibility changes, window blurs, fullscreen exits, restricted key combinations, and devtools access) must be tracked to detect potential academic dishonesty. 

Prior architectures often suffer from critical security, privacy, and architectural flaws:
1. **Client-Side Scoring or Severity Injection**: Trusting client-supplied severities or anomaly scores enables malicious candidates to report false benign severities or zero scores.
2. **Privacy Violations**: Unchecked telemetry collection risks sniffing passwords, clipboard text, or invasive unauthorized video/audio surveillance.
3. **Double Counting & Concurrent Race Conditions**: Network retries or rapid concurrent bursts can corrupt anomaly scoring or spawn duplicate proctor flags.
4. **Academic Score Conflation**: Anomaly scores improperly penalizing academic marks prior to human review.

ProctorNet requires a robust, privacy-respecting, server-authoritative proctoring event ingestion pipeline, deterministic anomaly scoring, and staff-reviewed flag lifecycle management.

---

## Decision Drivers
- **Server Authoritative Security**: All event severities and anomaly scores must be strictly assigned by the backend; client attempts to inject severity, risk scores, session IDs, or reviewer IDs must be rejected.
- **Strict Privacy Boundaries**: Only whitelisted behavioral event types and non-sensitive telemetry metadata may be collected. No keystroke text, clipboard contents, passwords, audio, video, or full screen captures are permitted.
- **Idempotency & Concurrency Safety**: Repeated retries or duplicate client submissions must result in zero incremental risk score and zero duplicate flags. Concurrent event streams must be serialized safely using database row-level locking.
- **Separation from Academic Grading**: The proctoring `risk_score` is strictly an anomaly metric ($[0, 100]$) and has zero direct impact on question scoring, grading thresholds, or pass/fail outcomes.
- **Authoritative Hierarchy**: PostgreSQL remains the single source of authoritative truth. Redis provides sliding-window rate limiting (non-authoritative). RabbitMQ via transactional outbox acts as transport only.

---

## Considered Options

### Option 1: Client-Side Scoring & Direct WebSocket Streaming
- Telemetry streamed over WebSockets; client computes local score and sends alerts.
- *Rejected*: Violates server-authoritative invariants, introduces stateful socket management complexity, and allows candidate clients to bypass or suppress anomaly scores.

### Option 2: S3 Evidence Storage & Heavy Media / ML Video Feeds
- Continuous webcam streaming, screenshot capture to S3, and client-side CV inference.
- *Rejected*: Out of scope for Phase 14; introduces massive storage and egress costs, severe privacy concerns, and architectural overhead contrary to lightweight browser telemetry.

### Option 3: Server-Authoritative REST Ingestion with Database-Backed Idempotency and Transactional Outbox (Selected)
- Candidates POST debounced batches of sanitized telemetry events to `POST /api/v1/attempts/:attemptId/events`.
- Strict Zod validation rejects client severity, scores, and unwhitelisted metadata.
- Row-level lock (`SELECT ... FOR UPDATE`) on `exam_attempts` guarantees serialized score computation.
- Database uniqueness on `(attempt_id, client_event_id)` ensures idempotent deduplication via `ON CONFLICT DO NOTHING`.
- Deterministic scoring (`LOW=1, MEDIUM=5, HIGH=15, CRITICAL=40`) clamped to $[0, 100]$.
- Automatic threshold flags (`ELEVATED_RISK >= 50`, `HIGH_RISK >= 80`) and immediate triggers (`DEVTOOLS_DETECTED`, `MULTI_DISPLAY_DETECTED`) generated atomically with transactional outbox events (`PROCTORING_FLAG_RAISED`).

---

## Decision Outcome
**Chosen Option**: Option 3.

### Architecture & Implementation Details:

1. **Migration 016 (`016_proctoring_events_and_flags.js`)**:
   - Adds `risk_score INT NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100)` to `exam_attempts`.
   - Adds `client_event_id UUID` and `client_timestamp TIMESTAMPTZ` to `violation_events` with unique index `(attempt_id, client_event_id)`.
   - Creates `violation_flags` table with statuses `ACTIVE`, `REVIEWED`, `DISMISSED` and severities `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.
   - Uniqueness constraint on `(attempt_id, flag_type)` where `raised_by = 'SYSTEM'` prevents duplicate automatic system flags.

2. **Server-Authoritative Taxonomy & Weights**:
   - `PERIODIC_HEARTBEAT` (LOW: +1)
   - `WINDOW_FOCUS` (LOW: +1)
   - `TAB_VISIBLE` (LOW: +1)
   - `FULLSCREEN_ENTER` (LOW: +1)
   - `WINDOW_BLUR` (MEDIUM: +5)
   - `TAB_HIDDEN` (MEDIUM: +5)
   - `FULLSCREEN_EXIT` (MEDIUM: +5)
   - `COPY_PASTE_ATTEMPT` (MEDIUM: +5)
   - `RESTRICTED_KEY_COMBO` (HIGH: +15)
   - `DISPLAY_CONFIG_CHANGED` (HIGH: +15)
   - `DEVTOOLS_OPEN` (CRITICAL: +40)

3. **Ingestion & Scoring Algorithm**:
   - Acquire row lock on `exam_attempts` via `SELECT risk_score, session_id, student_id FROM exam_attempts WHERE attempt_id = $1 FOR UPDATE`.
   - Insert batch with `ON CONFLICT (attempt_id, client_event_id) DO NOTHING RETURNING client_event_id, severity`.
   - `newRiskScore = min(100, currentRiskScore + sum(weights of newly inserted rows))`.
   - Update `exam_attempts.risk_score = newRiskScore`.
   - Evaluate automatic flags:
     - `newRiskScore >= 50` $\to$ `ELEVATED_RISK` (MEDIUM)
     - `newRiskScore >= 80` $\to$ `HIGH_RISK` (HIGH)
     - `DEVTOOLS_OPEN` in batch $\to$ `DEVTOOLS_DETECTED` (CRITICAL)
     - `DISPLAY_CONFIG_CHANGED` in batch $\to$ `MULTI_DISPLAY_DETECTED` (HIGH)
   - Atomically insert flags and write `PROCTORING_FLAG_RAISED` to `outbox_events`.
   - Trigger asynchronous outbox dispatch post-commit.

4. **Rate Limiting & Fallback**:
   - Key: `v1:ratelimit:proctoring:${studentId}:${attemptId}`.
   - Limit: 60 requests/minute per attempt, max 50 events/request.
   - Fail-open to in-memory sliding log on Redis connection error.

5. **Flag Review Lifecycle & Audit Trail**:
   - Transition `ACTIVE` $\to$ `REVIEWED` or `ACTIVE` $\to$ `DISMISSED` via `PATCH /api/v1/attempts/:attemptId/proctoring/flags/:flagId`.
   - Enforces terminal states (cannot transition from `REVIEWED` or `DISMISSED`).
   - Transactionally logs `PROCTOR_FLAG_CREATED` and `PROCTOR_FLAG_REVIEWED` to `audit_logs`.

---

## Positive Consequences
- **Tamper-Proof Scoring**: Clients cannot forge event severities or reduce risk scores.
- **Privacy Guarantees**: Complete absence of sensitive personal data or keystroke sniffing in telemetry.
- **Zero Double-Counting**: Idempotency key guarantees network retries do not artificially inflate risk scores.
- **Audited Human Review**: Anomaly flags serve solely as alerts for human invigilators and staff reviewers; scores never automatically fail an exam.
- **High Concurrency Resilience**: Row locks prevent race conditions during rapid concurrent burst ingestion.

---

## Negative Consequences / Trade-offs
- `SELECT FOR UPDATE` serializes concurrent ingestion requests for the *same attempt*; however, since each candidate's browser runs a single debounced telemetry stream, contention across distinct attempts is zero.
- Sliding-window Redis rate-limiting adds a minor network hop during ingestion; mitigated by resilient fallback to in-memory store if Redis becomes unreachable.

---

## Compliance & Validation
- **Unit & Property Tests**: Tested in `backend/tests/proctoring/anomalyScoring.test.js` and `backend/tests/proctoring/proctoringValidation.test.js`.
- **Integration Tests**: Ingestion, idempotency, atomicity, concurrency, and RBAC verified in `tests/proctoring/*.test.js`.
- **Frontend Telemetry Tests**: Hook buffering, privacy constraints, and debouncing verified in `frontend/tests/hooks/useProctoringEvents.test.js`.
