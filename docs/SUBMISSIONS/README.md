# Phase 8 — Submission, Outbox & Evaluation

## 1. Overview

The **Submissions, Outbox & Evaluation** subsystem (`backend/src/modules/submissions/`, `backend/src/modules/outbox/`, `backend/src/modules/evaluation/`) implements candidate-initiated exam submission, durable submission idempotency, atomic state transitions, final dirty-answer persistence with optimistic concurrency control (OCC), the transactional outbox pattern with reliable worker dispatch, and asynchronous objective evaluation in ProctorNet.

---

## 2. Core Architectural Invariants

### 2.1 Durable Submission Idempotency
- **Mandatory Header**: All submission requests require an `Idempotency-Key` HTTP header (UUID v4 or client token $\le 255$ chars). Missing or empty headers return `400 Bad Request` (`MISSING_IDEMPOTENCY_KEY`).
- **Deterministic Fingerprinting**: The server computes a SHA-256 digest (`request_fingerprint`) of the canonical submission payload (sorted `answers` array with `attempt_question_id`, `expected_revision`, and `answer_value`), strictly excluding per-request metadata like `requestId` or client timestamps.
- **Idempotent Replay**: If a submission request arrives with an `Idempotency-Key` and `request_fingerprint` identical to an existing record in `submission_idempotency`, the server returns the cached `200 OK` response payload without enqueuing duplicate outbox events or re-running transitions.
- **Key Reuse Rejection**: If the same `Idempotency-Key` is reused with a different request payload, the server rejects it with `409 Conflict` (`IDEMPOTENCY_KEY_REUSE`).
- **Already Submitted Rejection**: If an attempt has already been submitted and a new request arrives with a different idempotency key, the server rejects it with `409 Conflict` (`ATTEMPT_ALREADY_SUBMITTED`).

### 2.2 Atomic Attempt Finalization
- Attempt submission and expiration are atomic state transitions (`ACTIVE -> SUBMITTED` and `ACTIVE -> EXPIRED`).
- Handled via `finalizeAttempt(client, attempt, targetStatus, reason, actorUserId, requestId)`:
  1. Updates `exam_attempts` (`status = 'SUBMITTED'`, `submitted_at = CURRENT_TIMESTAMP`).
  2. Inserts domain event (`ATTEMPT_SUBMITTED` or `ATTEMPT_EXPIRED`) into `outbox_events`.
  3. Records structured audit log entry in `audit_logs`.
- If an attempt's server deadline has elapsed (`server_now >= expires_at`):
  1. Attempt transitions atomically from `ACTIVE` to `EXPIRED`.
  2. `ATTEMPT_EXPIRED` event is inserted into `outbox_events`.
  3. Transaction commits and returns `409 Conflict` (`ATTEMPT_EXPIRED`).

### 2.3 Final Dirty Answer Persistence (Phase 7 OCC Compatibility)
- `POST /api/v1/attempts/:attemptId/submit` accepts an optional `answers` array in the request body.
- Processed inside the submission transaction under Phase 7 OCC rules:
  - Unanswered question: requires `expected_revision = 0`, inserts answer with `revision = 1`.
  - Answered question: requires `expected_revision = K`, updates answer and increments `revision = K + 1`.
  - If any single answer fails semantic validation or encounters an OCC version conflict (`STALE_REVISION_CONFLICT`), the entire transaction aborts (`ROLLBACK`). The attempt remains `ACTIVE`.

### 2.4 Transactional Outbox Pattern
- **Atomicity**: Outbox events (`outbox_events` table) are committed in the exact same database transaction as the business state transition.
- **Worker Claiming**: `OutboxDispatcher` claims pending events using PostgreSQL `FOR UPDATE SKIP LOCKED`, preventing multiple worker instances from claiming the same event.
- **Lock Isolation**: Events are marked `PROCESSING` and committed immediately to release table locks before handing off to the transport layer.
- **In-Process Reliable Transport**: In Phase 8, `InProcessEventTransport` awaits subscriber completion (`await handler(event)`) before marking outbox events `PUBLISHED`.
- **Exponential Retry Backoff**: On transport or worker failure:
  - Increments `retry_count`.
  - Computes `next_retry_at = NOW() + (2^(retry_count) * 2s)` (2s, 4s, 8s, 16s...).
  - Marks event `FAILED`.
- **Retry Budget Exhaustion**: When `retry_count >= max_retries`, `next_retry_at` is set to `NULL` (permanently dead-lettered/unretryable).
- **Stale Processing Recovery**: Periodic or startup sweep identifies events stuck in `PROCESSING` longer than 5 minutes due to crashed dispatcher processes. The recovery query increments `retry_count` (consuming retry budget), calculates backoff or permanent exhaustion, and resets status to `FAILED`.

### 2.5 Objective Evaluation Engine
- **Supported Question Types**:
  - `MCQ`: Compares `answer_value.selected_option_id` against `question_options.is_correct`. Full points if correct, 0 otherwise.
  - `TRUE_FALSE`: Compares `answer_value.selected_option_id` against `question_options.is_correct`. Full points if correct, 0 otherwise.
  - `NUMERIC`: Evaluates `Math.abs(submitted - expected) < 0.0001` with `.toFixed(8)` float normalization to eliminate IEEE 754 representation jitter. Full points if within tolerance, 0 otherwise.
- **Lock-Free Evaluation**: Questions, options, and candidate answers are read outside of attempt row locks. Grade computation runs in-memory on the Node.js event loop.
- **Short Results Write Transaction**: Result is persisted in `results` table (`attempt_id`, `score`, `total_marks`, `passing_marks`, `is_passed`, `evaluated_at`).
- **Post-Result-Insert Crash Recovery**: Protected by `UNIQUE(results.attempt_id)`. If the worker or dispatcher crashes after inserting results but before marking the outbox event `PUBLISHED`, redelivery safely detects the existing result row and acknowledges completion without duplication.

---

## 3. Database Schema

### 3.1 Migration 013 (`013_outbox_and_idempotency.js`)

#### `outbox_events` Table
```sql
CREATE TABLE outbox_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(64) NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED')),
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_outbox_events_claiming 
ON outbox_events (created_at ASC) 
WHERE status IN ('PENDING', 'FAILED') AND next_retry_at IS NOT NULL;
```

#### `submission_idempotency` Table
```sql
CREATE TABLE submission_idempotency (
  attempt_id UUID PRIMARY KEY REFERENCES exam_attempts(attempt_id) ON DELETE RESTRICT,
  idempotency_key VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  request_fingerprint VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  response_status INT NOT NULL DEFAULT 200,
  response_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_submission_idempotency_key UNIQUE (idempotency_key)
);
```

---

## 4. API Endpoints

### 4.1 Submit Exam Attempt
`POST /api/v1/attempts/:attemptId/submit`

#### Headers
| Header | Type | Required | Description |
|---|---|---|---|
| `Authorization` | String | Yes | `Bearer <access_token>` (Role: `STUDENT`) |
| `Idempotency-Key` | String | Yes | Client-generated UUID or idempotent token ($\le 255$ chars) |
| `Content-Type` | String | Yes | `application/json` |

#### Request Body (Optional)
```json
{
  "answers": [
    {
      "attempt_question_id": "f8a00445-6677-4b47-bcf9-22a30bb031d2",
      "expected_revision": 0,
      "answer_value": {
        "selected_option_id": "b96a928e-5b23-4552-b8e7-fbf9f44dbb88"
      }
    }
  ]
}
```

#### Response: `200 OK`
```json
{
  "success": true,
  "data": {
    "attempt_id": "834f82ec-84f9-4b6a-9bbd-c6a6ee0ebf84",
    "status": "SUBMITTED",
    "submitted_at": "2026-09-07T04:25:32.939Z",
    "server_time": "2026-09-07T04:25:32.938Z",
    "message": "Exam attempt submitted successfully. Objective evaluation initiated."
  }
}
```

#### Error Responses
| Status | Error Code | Condition |
|---|---|---|
| `400 Bad Request` | `MISSING_IDEMPOTENCY_KEY` | `Idempotency-Key` header is omitted or empty |
| `400 Bad Request` | `INVALID_IDEMPOTENCY_KEY` | `Idempotency-Key` header exceeds 255 chars |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing or invalid JWT access token |
| `403 Forbidden` | `FORBIDDEN` | User does not have `STUDENT` role |
| `403 Forbidden` | `FORBIDDEN` | Student does not own the target attempt (BOLA check) |
| `404 Not Found` | `NOT_FOUND` | `attemptId` does not exist |
| `409 Conflict` | `IDEMPOTENCY_KEY_REUSE` | Same `Idempotency-Key` reused with altered request body |
| `409 Conflict` | `ATTEMPT_ALREADY_SUBMITTED` | Attempt is already submitted; new key presented |
| `409 Conflict` | `STALE_REVISION_CONFLICT` | Final dirty answer failed OCC revision expectation |
| `409 Conflict` | `ATTEMPT_EXPIRED` | Attempt submission attempted past server deadline |
| `422 Unprocessable` | `UNPROCESSABLE_ENTITY` | Invalid answer value format or foreign option ID |

---

## 5. Failure & Concurrency Modes

1. **Autosave vs. Submit Race**:
   - If an autosave commits an answer revision bump while submit is pending, submit validates with stale revision and receives `409 STALE_REVISION_CONFLICT`. The attempt remains `ACTIVE`.
   - If submit locks the attempt first and commits `SUBMITTED`, subsequent autosaves immediately fail because the attempt status is no longer `ACTIVE`.
2. **Submit vs. Submit Race**:
   - Concurrent submissions with the same `Idempotency-Key` and payload are serialized by `FOR UPDATE` on `exam_attempts`. The first to lock completes submission and writes idempotency. The second immediately observes the idempotency record and returns the cached payload.
   - Concurrent submissions with differing keys result in one winner (`200 OK`) and one loser (`409 ATTEMPT_ALREADY_SUBMITTED`).
3. **Dispatcher Crash & Stale Processing Lock**:
   - If a node crashes while processing an outbox event, the event remains in `PROCESSING`.
   - On the next recovery run (`recoverStaleProcessing(5)`), events older than 5 minutes have their retry count incremented and are returned to `FAILED` with exponential backoff.
