# Phase 14 — Proctoring Events Implementation Plan

## 1. Objectives

Phase 14 establishes the **Proctoring Control Plane** for the ProctorNet examination platform. It introduces:
1. Resilient, low-latency, rate-limited ingestion of client-side violation and telemetry events during active examinations.
2. Authoritative PostgreSQL persistence and tamper-evident event storage with client-specified idempotency keys.
3. Server-authoritative event normalization and deterministic anomaly risk scoring (0–100) with automated threshold flag generation for invigilator dashboards.
4. Comprehensive invigilator and faculty querying endpoints for candidate attempt violation timelines, flag lifecycle management, and session-level telemetry summaries.
5. Client-side event detection listeners (tab switch, window blur, restricted keyboard shortcuts, full-screen exit, multi-display) debounced and dispatched without blocking the student examination workspace.

---

## 2. Scope

### In-Scope:
* **Database Schema Evolution (Migration 016)**:
  * Extend `exam_attempts` with `risk_score INT NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100)` for $O(1)$ server-authoritative risk state tracking. (Explicitly proctoring anomaly risk; zero impact on academic exam evaluation).
  * Extend `violation_events` with `client_event_id` (UUID) for deterministic deduplication, and `client_timestamp` (TIMESTAMPTZ).
  * Standard unique constraint on `(attempt_id, client_event_id)` to guarantee idempotent batch ingestion without predicate mismatch.
  * Create `violation_flags` table for persistent, stateful anomaly flags (`ACTIVE`, `REVIEWED`, `DISMISSED`) raised automatically by heuristic scoring or manually by invigilators.
  * Query-driven indexes for attempt timeline queries, severity filtering, and session aggregation.
* **Proctoring Ingestion & Control Plane REST API**:
  * `POST /api/v1/attempts/:attemptId/events`: Batch-capable, rate-limited ingestion endpoint for active candidate attempts. Client supplies observed telemetry (`eventId`, `eventType`, `clientTimestamp`, sanitized `metadata`). Server authoritatively derives `severity` and `riskScore`.
  * `GET /api/v1/attempts/:attemptId/events`: Paginated violation timeline query with severity filters for invigilators, faculty, and admins.
  * `GET /api/v1/sessions/:sessionId/proctoring/summary`: Aggregated violation summary, active flags, and candidate risk scores across all students enrolled in a proctoring session.
  * `POST /api/v1/attempts/:attemptId/proctoring/flags`: Invigilator manual flag creation endpoint. Server derives `session_id` and `student_id` from authoritative `exam_attempts`.
  * `PATCH /api/v1/attempts/:attemptId/proctoring/flags/:flagId`: Flag review and lifecycle update endpoint (`ACTIVE -> REVIEWED`, `ACTIVE -> DISMISSED`) with atomic audit log emission.
* **Proctoring Event Taxonomy & Server Normalization**:
  * Standardized event enums: `PERIODIC_HEARTBEAT`, `WINDOW_FOCUS`, `TAB_VISIBLE`, `FULLSCREEN_ENTER`, `WINDOW_BLUR`, `TAB_HIDDEN`, `FULLSCREEN_EXIT`, `COPY_PASTE_ATTEMPT`, `RESTRICTED_KEY_COMBO`, `DISPLAY_CONFIG_CHANGED`, `DEVTOOLS_OPEN`.
  * Server-authoritative severity tiers: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. Clients cannot supply or override severity.
* **Deterministic Anomaly Scoring Model**:
  * Mathematical cumulative risk score (0–100) calculated from server-assigned severity weights (`LOW = 1`, `MEDIUM = 5`, `HIGH = 15`, `CRITICAL = 40`).
  * Clamped to `[0, 100]`. Starts at 0, increments only for genuinely accepted non-duplicate events, never decreases in Phase 14, and never affects academic grading.
  * Row-level locking on `exam_attempts` (`FOR UPDATE`) to prevent lost score updates during concurrent ingestion.
  * Deterministic threshold triggers (`riskScore >= 50` -> `ELEVATED_RISK`, `riskScore >= 80` -> `HIGH_RISK`) raising at most one automatic flag per unique threshold crossing per attempt.
  * Immediate flag triggers for critical single events (`DEVTOOLS_OPEN` -> `CRITICAL`, `DISPLAY_CONFIG_CHANGED` -> `HIGH`).
* **Frontend Telemetry Capture**:
  * Custom React hook `useProctoringEvents` integrated into `ExamTakingPage.jsx`.
  * Event listeners on `document.visibilitychange`, `window.blur/focus`, `fullscreenchange`, keyboard combinations, clipboard attempts, and window resizing.
  * In-memory event buffer with debouncing (every 5–10s or 20 events) and background non-blocking batch flushing.
* **Observability & Audit Integration**:
  * Register Phase 14 Prometheus metrics in Phase 13 registry (`proctornet_proctoring_events_total`, `proctornet_proctoring_ingest_duration_seconds`, `proctornet_proctoring_flags_total`) with strictly bounded labels (zero UUIDs).
  * Structured logging with request and W3C trace correlation.
  * Immutable audit logging for manual proctor flagging (`PROCTOR_FLAG_CREATED`) and review status transitions (`PROCTOR_FLAG_REVIEWED`).

---

## 3. Non-Goals

The following areas are explicitly excluded from Phase 14 and belong to later dedicated phases:
* **WebRTC & SFU Media Plane (Phase 17)**: No live video/audio streaming, Selective Forwarding Unit (SFU) negotiation, peer connection signaling, or media packet handling.
* **Evidence Storage & AWS S3 Uploads (Phase 15)**: No webcam snapshot captures, screen image recording, audio uploads, or S3 pre-signed URL generation.
* **WebSocket Real-Time Control Plane (Phase 16)**: No WebSocket server handshakes or Socket.io/Redis pub-sub broadcasting. Phase 14 provides the authoritative REST control plane.
* **Client Device Lockdown / LockDown Browser Plugins**: No native desktop OS hooking, kernel drivers, or binary extensions.
* **Computer Vision / ML Analysis**: No server-side face recognition, gaze estimation, or background object classification.
* **Automated Examination Termination**: Phase 14 alerts and scores violations, but does NOT automatically abort or invalidate exam attempts without human proctor intervention.

---

## 4. PostgreSQL Authority

PostgreSQL is the sole authoritative store of truth for proctoring events, anomaly scores, and flags.

### Migration 016: `016_proctoring_events_and_flags.js`

```sql
-- 1. Add authoritative proctoring risk score to exam_attempts
-- (Proctoring anomaly risk only; strictly separate from academic marks/results)
ALTER TABLE exam_attempts
  ADD COLUMN IF NOT EXISTS risk_score INT NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100);

-- 2. Extend violation_events for client correlation & idempotency
ALTER TABLE violation_events
  ADD COLUMN IF NOT EXISTS client_event_id UUID,
  ADD COLUMN IF NOT EXISTS client_timestamp TIMESTAMPTZ;

-- Standard unique index (PostgreSQL standard semantics permit multiple NULLs while matching ON CONFLICT without predicate mismatch)
CREATE UNIQUE INDEX IF NOT EXISTS uq_violation_events_attempt_client_event
  ON violation_events(attempt_id, client_event_id);

-- Query optimization index for attempt timeline scans
CREATE INDEX IF NOT EXISTS idx_violation_events_attempt_severity_time
  ON violation_events(attempt_id, severity, server_timestamp DESC);

-- 3. Create violation_flags table
CREATE TABLE IF NOT EXISTS violation_flags (
  flag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES exam_sessions(session_id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  flag_type VARCHAR(64) NOT NULL,
  severity VARCHAR(32) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVIEWED', 'DISMISSED')),
  score_delta INT NOT NULL DEFAULT 0, -- Anomaly risk_score_delta; NO academic impact
  raised_by VARCHAR(32) NOT NULL DEFAULT 'SYSTEM' CHECK (raised_by IN ('SYSTEM', 'PROCTOR')),
  reviewer_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_violation_flags_session_status
  ON violation_flags(session_id, status);

CREATE INDEX IF NOT EXISTS idx_violation_flags_attempt
  ON violation_flags(attempt_id);

-- Prevent duplicate automated system flags of the same type for the same attempt
CREATE UNIQUE INDEX IF NOT EXISTS uq_violation_flags_attempt_flag_type
  ON violation_flags(attempt_id, flag_type)
  WHERE raised_by = 'SYSTEM';
```

### Invariant & Integrity Protections:
1. **Cascade Semantics**: Deletion of a test `exam_attempt` cascades to `violation_events` and `violation_flags`. However, administrative deletion of live academic attempts is blocked by Phase 13 `audit_logs` foreign key immutability.
2. **Server-Derived Denormalization**: In `violation_flags`, `session_id` and `student_id` are denormalized solely for efficient $O(1)$ session-level invigilator dashboard indexing (`idx_violation_flags_session_status`). They are **always derived server-side** from the authoritative `exam_attempts` row during flag creation and can never be client-supplied.
3. **Transaction Boundaries & Concurrency**: Ingestion runs inside a single database transaction (`BEGIN ... COMMIT`). The transaction executes `SELECT risk_score, session_id, student_id FROM exam_attempts WHERE attempt_id = $1 FOR UPDATE` to lock the attempt row, ensuring concurrent ingestions update the risk score deterministically without lost updates.
4. **Immutability of Telemetry**: Ingested `violation_events` are append-only. No application role is granted `UPDATE` operations on `violation_events`.

---

## 5. Redis Boundary

Redis is strictly non-authoritative:
1. **Distributed Rate Limiting**: Redis Lua sliding-window rate limiter enforces candidate ingestion throughput bounds:
   - Key: `v1:ratelimit:proctoring:${studentId}:${attemptId}`
   - Capacity: Max 60 requests per minute per active attempt.
   - Batch Limit: Max 50 events per request batch.
   - Throughput Model: Theoretical ceiling is 3,000 events/min/attempt under worst-case client flooding. Under normal operation, the client debounces flushes to once every 5–10 seconds (max 20 events/batch), generating 6–12 requests/min (~60–240 events/min). The rate limiter acts as an upper DoS barrier to protect PostgreSQL write capacity.
   - Fallback: On Redis outage or timeout, falls back to local in-memory sliding-window rate limiting without blocking student exam execution.
2. **Non-Authoritative Live Anomaly Cache (Optional Acceleration)**:
   - May cache transient calculated session anomaly counters with a 15-second TTL.
   - Authoritative calculation is always derived directly from PostgreSQL queries.
3. **No Queuing in Redis**: Telemetry events are NOT placed in Redis streams or Redis lists; events are written directly to PostgreSQL.

---

## 6. RabbitMQ Boundary

1. **Synchronous Ingestion Invariant**: Candidate event ingestion (`POST /api/v1/attempts/:attemptId/events`) writes directly to PostgreSQL before returning HTTP 200 OK. Candidates receive confirmation of persistence immediately.
2. **Asynchronous Outbox Dispatch**:
   - If an event triggers an automatic anomaly flag (e.g. `DEVTOOLS_OPEN` or threshold breach), the transaction atomically persists an outbox event `PROCTORING_FLAG_RAISED` into `outbox_events` inside the same PostgreSQL transaction.
   - If RabbitMQ is offline, the transaction commits successfully and the outbox dispatcher retries asynchronously. Authoritative proctoring persistence is completely decoupled from message broker availability.
   - The Phase 12 Outbox Dispatcher publishes `PROCTORING_FLAG_RAISED` to RabbitMQ exchange `proctornet.events` with routing key `proctoring.flag_raised` for downstream notifications.

---

## 7. REST API

### A. Candidate Event Ingestion Endpoint
* **Endpoint**: `POST /api/v1/attempts/:attemptId/events`
* **Authentication**: Mandatory Bearer JWT (`authenticate`).
* **Authorization**: Candidate-only (`requireRole('STUDENT')`). Must verify `attempt.student_id === req.user.userId`.
* **State Check**: `attempt.status === 'ACTIVE'`. Rejects with `409 Conflict` (`ATTEMPT_NOT_ACTIVE`) if attempt is `SUBMITTED`, `EXPIRED`, or `TERMINATED`.
* **Rate Limit**: 60 requests/min per attempt via Redis sliding-window rate limiter.
* **Request Schema (`zod`)**:
  ```json
  {
    "events": [
      {
        "eventId": "123e4567-e89b-12d3-a456-426614174000",
        "eventType": "TAB_HIDDEN",
        "clientTimestamp": "2026-09-08T04:15:00.000Z",
        "metadata": {
          "durationMs": 1500,
          "target": "window_blur"
        }
      }
    ]
  }
  ```
  * **Strict Server Authority**: The request schema **MUST NOT** accept `severity`, `riskScore`, `score_delta`, `flag_status`, or `reviewer_user_id`. Any client-supplied severity field is rejected by schema validation or strictly ignored. Severity is derived solely by the server from `EVENT_TAXONOMY`.
  * **Bounds**: Max 50 events per batch. Max metadata payload size 4KB per event. Metadata keys restricted to whitelisted safe telemetry properties (`durationMs`, `target`, `keyCombo`, `displayCount`, `screenState`).
* **Ingestion Transaction Workflow**:
  ```text
  1. Authenticate Bearer JWT.
  2. Authorize attempt ownership (attempt.student_id === req.user.userId).
  3. Validate attempt is ACTIVE (return 409 Conflict if SUBMITTED/EXPIRED).
  4. Validate batch schema via Zod (max 50 events, safe metadata).
  5. BEGIN database transaction.
  6. SELECT risk_score, session_id, student_id FROM exam_attempts WHERE attempt_id = $1 FOR UPDATE (lock attempt row).
  7. For each event: map eventType to server-assigned severity and point weight via EVENT_TAXONOMY.
  8. Batch INSERT INTO violation_events (attempt_id, client_event_id, event_type, severity, client_timestamp, server_timestamp, metadata)
     VALUES (...)
     ON CONFLICT (attempt_id, client_event_id) DO NOTHING
     RETURNING violation_id, event_type, severity;
  9. Identify newly inserted events (inserted_count vs duplicates).
  10. Calculate risk increment: sum(weight(e) for e in newly_inserted_events).
  11. Calculate newRiskScore = min(100, current_risk_score + risk_increment).
  12. UPDATE exam_attempts SET risk_score = newRiskScore, updated_at = CURRENT_TIMESTAMP WHERE attempt_id = $1;
  13. Evaluate threshold crossings and immediate flag rules:
      - If DEVTOOLS_OPEN: raise CRITICAL flag (if not already raised).
      - If DISPLAY_CONFIG_CHANGED: raise HIGH flag (if not already raised).
      - If current_risk_score < 50 and newRiskScore >= 50: raise ELEVATED_RISK flag.
      - If current_risk_score < 80 and newRiskScore >= 80: raise HIGH_RISK flag.
      - Insert flag into violation_flags (with server-derived session_id, student_id).
      - Insert PROCTORING_FLAG_RAISED into outbox_events.
  14. COMMIT database transaction.
  15. setImmediate(() => triggerOutboxDispatch()) (non-blocking).
  16. Return HTTP 200 OK.
  ```
* **Response Schema**:
  ```json
  {
    "success": true,
    "data": {
      "accepted": 3,
      "deduplicated": 0,
      "riskScore": 25,
      "activeFlagsCount": 1
    }
  }
  ```

### B. Attempt Violation Timeline (Invigilator / Faculty / Admin)
* **Endpoint**: `GET /api/v1/attempts/:attemptId/events`
* **Authentication**: Mandatory Bearer JWT (`authenticate`).
* **Authorization**:
  * `STUDENT`: Forbidden (`403`). Candidates cannot inspect their own violation telemetry.
  * `FACULTY` / `ADMIN`: Permitted globally.
  * `INVIGILATOR`: Permitted ONLY if assigned to the session containing `attemptId` in `session_invigilators`.
* **Query Parameters**:
  * `severity`: Optional enum (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
  * `eventType`: Optional event type filter.
  * `page`: Integer >= 1 (default 1).
  * `limit`: Integer 1..100 (default 50).
* **Response Schema**:
  ```json
  {
    "status": "success",
    "data": {
      "attemptId": "uuid",
      "riskScore": 45,
      "events": [
        {
          "violationId": "uuid",
          "eventType": "TAB_HIDDEN",
          "severity": "MEDIUM",
          "clientTimestamp": "2026-09-08T04:15:00.000Z",
          "serverTimestamp": "2026-09-08T04:15:00.150Z",
          "metadata": { "durationMs": 1500 }
        }
      ],
      "flags": [ ... ],
      "pagination": { "page": 1, "limit": 50, "total": 12 }
    }
  }
  ```

### C. Session Proctoring Summary (Invigilator Console)
* **Endpoint**: `GET /api/v1/sessions/:sessionId/proctoring/summary`
* **Authentication**: Mandatory Bearer JWT.
* **Authorization**: `FACULTY`, `ADMIN`, or assigned `INVIGILATOR`.
* **Response Schema**:
  ```json
  {
    "status": "success",
    "data": {
      "sessionId": "uuid",
      "totalStudents": 40,
      "activeAttempts": 35,
      "highRiskAttemptsCount": 3,
      "candidates": [
        {
          "studentId": "uuid",
          "name": "Candidate Name",
          "attemptId": "uuid",
          "status": "ACTIVE",
          "riskScore": 60,
          "violationCount": 8,
          "activeFlagsCount": 1,
          "latestViolation": {
            "eventType": "TAB_HIDDEN",
            "serverTimestamp": "2026-09-08T04:20:00.000Z"
          }
        }
      ]
    }
  }
  ```

### D. Proctor Manual Flag Creation
* **Endpoint**: `POST /api/v1/attempts/:attemptId/proctoring/flags`
* **Authentication**: Mandatory Bearer JWT.
* **Authorization**: Assigned `INVIGILATOR`, `FACULTY`, `ADMIN`.
* **Request Schema**:
  ```json
  {
    "flagType": "SUSPICIOUS_BEHAVIOR",
    "severity": "HIGH",
    "notes": "Candidate repeatedly looking away from screen."
  }
  ```
  * Note: `session_id` and `student_id` are derived server-side from the verified `exam_attempts` record and cannot be supplied by the client.
* **Server Behavior**:
  - Validates attempt exists. Derives `session_id` and `student_id`.
  - Inserts into `violation_flags` with `status = 'ACTIVE'`, `raised_by = 'PROCTOR'`, `reviewer_user_id = req.user.userId`.
  - Atomically records audit log `PROCTOR_FLAG_CREATED` in `audit_logs` using Phase 13 `recordAuditEvent()`.

### E. Proctor Flag Review & Status Update
* **Endpoint**: `PATCH /api/v1/attempts/:attemptId/proctoring/flags/:flagId`
* **Authentication**: Mandatory Bearer JWT.
* **Authorization**: Assigned `INVIGILATOR`, `FACULTY`, `ADMIN`.
* **Request Schema**:
  ```json
  {
    "status": "REVIEWED",
    "notes": "Verified harmless trackpad swipe."
  }
  ```
  * **Allowed Status Transitions**:
    - `ACTIVE -> REVIEWED`
    - `ACTIVE -> DISMISSED`
  * Clients cannot set status back to `ACTIVE`, and cannot alter `flag_type`, `severity`, `attempt_id`, `session_id`, `student_id`, or `raised_by`.
* **Server Behavior**:
  - Selects flag `FOR UPDATE`, verifying `flag.attempt_id === attemptId`.
  - Validates caller authorization for the parent session.
  - Verifies current status is `ACTIVE` (returns 409 Conflict if already in terminal reviewed/dismissed state).
  - Updates `status`, sets `reviewer_user_id = req.user.userId`, appends review notes into `details`, updates `updated_at`.
  - Atomically records audit log `PROCTOR_FLAG_REVIEWED` in `audit_logs`.
  - Returns updated flag object.

---

## 8. Proctoring Event Taxonomy & Deterministic Scoring Model

### A. Authoritative Event Taxonomy & Severity Mapping

The server determines event severity and scoring contribution exclusively from the authoritative `EVENT_TAXONOMY`. The client submits only `eventType`.

| Event Type | Server-Assigned Severity | Point Weight | Description | Automatic Flag Trigger |
| :--- | :---: | :---: | :--- | :--- |
| `PERIODIC_HEARTBEAT` | `LOW` | 1 | Periodic client keep-alive (every 30s) reporting state | Telemetry only (no flag) |
| `WINDOW_FOCUS` | `LOW` | 1 | Window regained foreground focus | Telemetry only |
| `TAB_VISIBLE` | `LOW` | 1 | Examination tab returned to active foreground | Telemetry only |
| `FULLSCREEN_ENTER` | `LOW` | 1 | Candidate re-engaged fullscreen mode | Telemetry only |
| `WINDOW_BLUR` | `MEDIUM` | 5 | Candidate switched focus away from exam window | Cumulative risk score |
| `TAB_HIDDEN` | `MEDIUM` | 5 | Candidate switched to background tab | Cumulative risk score |
| `FULLSCREEN_EXIT` | `MEDIUM` | 5 | Candidate exited enforced fullscreen | Cumulative risk score |
| `COPY_PASTE_ATTEMPT` | `HIGH` | 15 | Copy, cut, paste, or context menu shortcut triggered | Cumulative risk score |
| `RESTRICTED_KEY_COMBO` | `HIGH` | 15 | Blocked shortcuts (Alt+Tab, Win/Cmd, Ctrl+P, F11) | Cumulative risk score |
| `DISPLAY_CONFIG_CHANGED` | `HIGH` | 15 | Secondary display connected or geometry changed | Immediate `HIGH` flag |
| `DEVTOOLS_OPEN` | `CRITICAL` | 40 | Browser Developer Tools opened | Immediate `CRITICAL` flag |

### B. Deterministic Mathematical Scoring Algorithm

```text
1. Weights:
   w(LOW)      = 1
   w(MEDIUM)   = 5
   w(HIGH)     = 15
   w(CRITICAL) = 40

2. Mathematical Formula:
   riskScore = min(
     100,
     sum(w(severity(event)) for each unique accepted, non-duplicate event in attempt)
   )

3. Score Lifecycle & Properties:
   - Initial score: 0.
   - Increases strictly upon insertion of genuine, non-duplicate events.
   - Duplicate events (matched by client_event_id): 0 row insertions, 0 score increment.
   - Score clamping: Hard-clamped to [0, 100].
   - Score permanence: Does not decay or decrease within Phase 14.
   - Academic Independence: Anomaly riskScore is strictly an operational proctoring heuristic and has ZERO relationship to, or impact on, the candidate's academic exam score/evaluation.

4. Deterministic Threshold Rules:
   - Threshold 1: riskScore >= 50 -> Automatically raises flag 'ELEVATED_RISK' (severity: 'MEDIUM', raised_by: 'SYSTEM').
   - Threshold 2: riskScore >= 80 -> Automatically raises flag 'HIGH_RISK' (severity: 'HIGH', raised_by: 'SYSTEM').
   - Idempotency Invariant: Exactly ONE automated flag is created per unique threshold crossing per attempt (enforced via uq_violation_flags_attempt_flag_type). Repeated event batches that keep the score above 50 or 80 will NOT generate redundant duplicate flags.

5. Immediate Event-Type Overrides:
   - DEVTOOLS_OPEN: Immediately generates flag 'DEVTOOLS_DETECTED' (severity: 'CRITICAL', raised_by: 'SYSTEM').
   - DISPLAY_CONFIG_CHANGED: Immediately generates flag 'MULTI_DISPLAY_DETECTED' (severity: 'HIGH', raised_by: 'SYSTEM').
```

---

## 9. Event Ordering & Timestamps

1. **Dual Timestamping Model**:
   - `client_timestamp`: Recorded by candidate's browser runtime at moment of detection. Used solely for calculating client-side interval durations (e.g., duration window was blurred).
   - `server_timestamp`: Authoritative PostgreSQL server clock (`CURRENT_TIMESTAMP`). Used exclusively for timeline ordering, audit trails, and deadline comparisons.
2. **Clock Skew Tolerance**:
   - The server validates that `client_timestamp <= CURRENT_TIMESTAMP + 60 seconds` to guard against future-dated malicious timestamps.
   - All timeline queries are deterministically ordered by `server_timestamp DESC, violation_id DESC`.
3. **Late-Arriving Events**:
   - If an event arrives after an attempt is transitioned to `SUBMITTED`, `EXPIRED`, or `TERMINATED`, ingestion immediately returns `409 Conflict`. Telemetry is only accepted during the active attempt lifecycle.

---

## 10. Idempotency / Deduplication

1. **Client Event UUIDs**: Every generated event in the frontend client is assigned a unique UUIDv4 (`eventId`).
2. **Database Level Deduplication**:
   - Unique index `uq_violation_events_attempt_client_event` on `(attempt_id, client_event_id)` ensures duplicate network requests (e.g., retries during transient network interruption) insert zero rows.
   - Uses `INSERT ... ON CONFLICT (attempt_id, client_event_id) DO NOTHING`.
3. **Deterministic Score Idempotency**:
   - Only rows returned by `RETURNING violation_id, severity` contribute to the risk score increment. Retried duplicate batches result in `accepted = 0`, `deduplicated = N`, and 0 score change.
4. **Idempotent Batch Response**:
   - Returns `{ accepted: X, deduplicated: Y, riskScore: Z, activeFlagsCount: W }` with HTTP 200 OK without errors on retries.

---

## 11. Security

1. **Server-Authoritative Normalization**:
   - Clients have zero control over `severity`, `riskScore`, `score_delta`, `flag_status`, or `reviewer_user_id`.
   - The server strictly enforces that severity is derived from `EVENT_TAXONOMY`.
2. **BOLA / BFLA Protection**:
   - Candidates can only submit telemetry for their own attempt (`attempt.student_id === req.user.userId`).
   - Candidates are forbidden (`403`) from accessing proctoring query endpoints (timeline, summary, flags).
   - Invigilators can only query events and manage flags for sessions to which they are assigned in `session_invigilators`.
   - Denormalized `session_id` and `student_id` in `violation_flags` are derived server-side from the verified `exam_attempts` record.
3. **Payload Bounds & Schema Sanitization**:
   - Ingestion batch strictly bounded to maximum 50 events. Request body limited to 256KB.
   - Metadata key combinations sanitized; free-form strings, typed text, and unwhitelisted keys are rejected.
4. **Rate Limiting**:
   - 60 requests/minute per attempt via Redis sliding window protects the database write path against event flooding.

---

## 12. Privacy

1. **Zero Secret Leakage**:
   - **Clipboard Contents**: Clipboard text is **NEVER** captured. The event records `COPY_PASTE_ATTEMPT` with target element tag name (`input`, `body`), never the copied string.
   - **Keystrokes**: Raw keystroke logging is strictly prohibited. Only explicitly whitelisted restricted control keys (`Alt`, `Meta`, `F11`, `F12`) are recorded. Password and answer typing telemetry are excluded at the schema level.
   - **URLs**: If external navigation occurs, external URLs are never captured. Only internal route names are recorded.
   - **Media**: Zero webcam, screen, or audio recordings are handled in Phase 14 (deferred to Phase 15/17).
2. **Data Retention**:
   - Telemetry follows institutional 180-day retention window aligned with Phase 13.

---

## 13. Observability Integration

1. **Prometheus Metrics (Registered in Phase 13 Registry)**:
   - `proctornet_proctoring_events_total`: Counter tracking ingested events with bounded labels `event_type` and `severity`.
   - `proctornet_proctoring_ingest_duration_seconds`: Histogram measuring ingestion API latency.
   - `proctornet_proctoring_flags_total`: Counter tracking flags raised with bounded labels `flag_type` and `severity`.
   - Route normalization: `/api/v1/attempts/:id/events` (zero UUIDs in labels).
2. **Distributed Tracing & Structured Logging**:
   - W3C `traceparent` propagated to logger child context.
   - Request correlation IDs linked across ingestion, outbox, and audit records.
3. **Audit Trails (Phase 13 Centralized Audit Service)**:
   - `PROCTOR_FLAG_CREATED`: Logged when an invigilator manually creates a flag.
   - `PROCTOR_FLAG_REVIEWED`: Logged when an invigilator reviews or dismisses a flag.
   - Raw candidate telemetry events are stored in `violation_events` and are **NOT** duplicated into `audit_logs`, preventing audit trail bloat.

---

## 14. Failure Semantics

| Scenario | HTTP Status | System Behavior |
| :--- | :---: | :--- |
| **Malformed JSON / Bad Schema** | `400 Bad Request` | Zod validation fails; transaction not opened; 0 rows inserted. |
| **Missing / Expired Bearer Token** | `401 Unauthorized` | Rejected by authentication middleware. |
| **Unauthorized Attempt / Unassigned Session** | `403 Forbidden` | Rejected; student cannot query proctoring data; unassigned invigilator rejected. |
| **Attempt or Flag Not Found** | `404 Not Found` | Target entity does not exist in database. |
| **Attempt Expired or Submitted** | `409 Conflict` | Returns `ATTEMPT_NOT_ACTIVE`; client halts background telemetry. |
| **Network Retry with Duplicate Events** | `200 OK` | `ON CONFLICT DO NOTHING`; returns `deduplicated > 0` with 0 score increment. |
| **Rate Limit Exceeded (>60 req/min)** | `429 Too Many Requests` | Redis limiter blocks request; client keeps events in buffer for next flush. |
| **Redis Outage during Ingestion** | `200 OK` | Rate limiter falls back to in-memory window; events persist safely to PostgreSQL. |
| **PostgreSQL Write Failure** | `500 Internal Server Error` | Transaction rolls back completely; client retains buffered events for next retry. |
| **RabbitMQ Outage on Flag Creation** | `200 OK` | Outbox event committed atomically in DB; dispatcher retries RabbitMQ asynchronously. |

---

## 15. Testing Strategy

1. **Unit Tests**:
   - `proctoringValidation.test.js`:
     * Validates event schemas and metadata boundaries.
     * **Severity Tamper Resistance**: Proves that client-submitted `severity` fields are rejected by schema or ignored, and server `EVENT_TAXONOMY` determines persisted severity.
   - `anomalyScoring.test.js`:
     * Mathematical score calculation: starts at 0, adds exact weights (`LOW=1, MEDIUM=5, HIGH=15, CRITICAL=40`).
     * Clamping verification: score capped at 100.
     * Duplicate events: zero score increment.
     * Threshold crossing: crossing 50 raises `ELEVATED_RISK`, crossing 80 raises `HIGH_RISK`. Exactly one flag per threshold crossing.
2. **Integration Tests**:
   - `proctoringIngestion.test.js`: Single and batch ingestion, active attempt lifecycle check, and rate limit bounds.
   - `proctoringIdempotency.test.js`: Re-submitting identical `client_event_id` in subsequent batches results in single insertion and zero double-scoring.
   - `proctoringRbac.test.js`:
     * Candidate cannot query violation timeline or session summary (403).
     * Invigilator cannot access sessions where not assigned in `session_invigilators`.
     * Faculty and Admin have global access.
   - `proctoringFlags.test.js`:
     * Manual flag creation (`POST`) derives `session_id`/`student_id` server-side and emits `PROCTOR_FLAG_CREATED` in `audit_logs`.
     * Flag status updates (`PATCH`): `ACTIVE -> REVIEWED`, `ACTIVE -> DISMISSED`. Sets `reviewer_user_id` and emits `PROCTOR_FLAG_REVIEWED`.
     * Rejects invalid transitions (e.g. setting status to `ACTIVE`).
   - `proctoringAtomicity.test.js`:
     * Ingestion of a critical event (`DEVTOOLS_OPEN`) atomically commits:
       `violation_events` row + `violation_flags` row + `outbox_events` row (`PROCTORING_FLAG_RAISED`).
     * Rollback verification: simulated database failure rolls back all three writes.
   - `proctoringConcurrency.test.js`:
     * Concurrent ingestion requests on the same attempt execute with row-level locks on `exam_attempts`, producing the exact cumulative risk score without lost updates.
3. **Regression Tests**:
   - Complete backend regression suite (506 tests) and frontend suite (25 tests).
   - Phase 12 RabbitMQ worker tests and Phase 13 Prometheus metrics tests pass without regression.

---

## 16. Acceptance Criteria

1. **Batch Ingestion Contract**: `POST /api/v1/attempts/:attemptId/events` successfully persists up to 50 events in a single PostgreSQL transaction with row-level locking, accurately returning accepted and deduplicated counts, updating `exam_attempts.risk_score`, triggering threshold flags, and leaving zero partial state.
   *(Performance SLO: Ingestion achieves sub-50ms latency under representative production conditions; this is an architectural performance target, not a brittle CI wall-clock assertion).*
2. **Server-Authoritative Severity & Scoring**: Client-provided severity values are rejected or ignored; persisted event severity and risk score increments strictly follow `EVENT_TAXONOMY` with exact weights (`LOW=1, MEDIUM=5, HIGH=15, CRITICAL=40`), clamped to `[0, 100]`.
3. **Idempotency Proof**: Submitting the same batch twice results in zero duplicate rows and zero duplicate risk score increments.
4. **Atomic Critical Flag Enqueueing**: Critical threshold breach or `DEVTOOLS_OPEN` atomically creates records in `violation_flags` and `outbox_events` within the ingestion database transaction.
5. **Flag Lifecycle Management**: `PATCH /api/v1/attempts/:attemptId/proctoring/flags/:flagId` allows assigned invigilators, faculty, and admins to transition flags from `ACTIVE` to `REVIEWED` or `DISMISSED`, setting `reviewer_user_id` and emitting `PROCTOR_FLAG_REVIEWED` to `audit_logs`.
6. **Attempt Lifecycle Enforcement**: Ingestion strictly rejects attempts that are not `ACTIVE` with `409 Conflict`.
7. **RBAC Proof**: Candidates cannot access proctoring query endpoints; invigilators cannot access sessions to which they are not assigned.
8. **Observability Verification**: `GET /metrics` accurately increments `proctornet_proctoring_events_total` with low-cardinality labels and zero UUIDs.
9. **Zero Test Regressions**: 100% of existing backend (506 tests) and frontend (25 tests) test suites pass cleanly.

---

## 17. Files / Modules

```text
[NEW]
- backend/migrations/016_proctoring_events_and_flags.js
- backend/src/modules/proctoring/proctoring.repository.js
- backend/src/modules/proctoring/proctoring.service.js
- backend/src/modules/proctoring/proctoring.controller.js
- backend/src/modules/proctoring/proctoring.routes.js
- backend/src/modules/proctoring/proctoring.schemas.js
- backend/src/modules/proctoring/anomalyScorer.js
- backend/src/modules/proctoring/index.js
- backend/tests/proctoring/proctoringIngestion.test.js
- backend/tests/proctoring/proctoringRbac.test.js
- backend/tests/proctoring/proctoringIdempotency.test.js
- backend/tests/proctoring/anomalyScoring.test.js
- backend/tests/proctoring/proctoringFlags.test.js
- backend/tests/proctoring/proctoringAtomicity.test.js
- backend/tests/proctoring/proctoringConcurrency.test.js
- frontend/src/hooks/useProctoringEvents.js

[MODIFY]
- backend/src/modules/attempts/attempts.routes.js (mount proctoring sub-router)
- backend/src/modules/sessions/sessions.routes.js (mount /:id/proctoring/summary)
- backend/src/infrastructure/metrics/registry.js (register proctoring metrics)
- backend/src/routes/index.js (ensure proctoring router mounted if needed)
- frontend/src/pages/candidate/ExamTakingPage.jsx (integrate useProctoringEvents hook)
- frontend/src/pages/invigilator/SessionMonitorPage.jsx (display candidate risk scores and latest violations)
- docs/DEVELOPMENT_PLAN.md (update Phase 14 status)
- docs/ADR/README.md (index ADR-0004)

[DOCS]
- docs/ADR/0004-proctoring-event-ingestion-and-anomaly-scoring.md
- docs/PHASE_14_IMPLEMENTATION_PLAN.md
```

---

## 18. ADR Requirements

An Architecture Decision Record is required:
* **Proposed Document**: `docs/ADR/0004-proctoring-event-ingestion-and-anomaly-scoring.md`
* **Core Decisions to Document**:
  1. Synchronous PostgreSQL batch ingestion with row-level locking on `exam_attempts` vs asynchronous RabbitMQ control plane buffering.
  2. Server-authoritative severity mapping from `EVENT_TAXONOMY` and rejection of client-provided severity.
  3. Deterministic mathematical anomaly scoring model (`LOW=1, MEDIUM=5, HIGH=15, CRITICAL=40`, clamped to `[0, 100]`) and separation between proctoring anomaly risk and academic grading.
  4. Client-generated UUIDs (`client_event_id`) with standard unique indexing for zero-loss network retry idempotency.
  5. Server-authoritative timeline ordering versus client clock skew handling.
  6. Privacy boundaries: strict ban on keystroke logging, clipboard contents, URLs, and binary media capture.

---

## 19. Risks & Mitigations

1. **High Ingestion Volume during Peak Concurrent Exams**:
   * *Risk*: 10,000 concurrent students generating frequent blur/heartbeat events could strain PostgreSQL write throughput.
   * *Mitigation*: Client-side event debouncing (batching events every 5–10 seconds or up to 20 events), combined with Redis sliding-window rate limiting (60 batches/min/student) and row-level locking.
2. **False Positive Alert Fatigue for Invigilators**:
   * *Risk*: Occasional accidental trackpad swipes or browser notifications trigger excessive alerts.
   * *Mitigation*: Multi-event trigger thresholds (isolated blurs marked `MEDIUM` adding only 5 points; threshold 50 required for automated flag).
3. **Malicious Client Telemetry Flood or Event Spoofing**:
   * *Risk*: A candidate script floods the server with forged events or forged `LOW` severity to bypass detection.
   * *Mitigation*: Enforce authenticated session checks, attempt ownership verification, server-authoritative taxonomy severity lookup (client severity ignored), strict Zod schema validation, and Redis sliding-window rate limiting.
