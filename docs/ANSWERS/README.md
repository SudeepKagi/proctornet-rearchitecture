# Phase 7 — Answers, Autosave & Concurrency

## 1. Overview

The **Answers & Concurrency** module (`backend/src/modules/answers/`) provides the durable persistence, optimistic concurrency control (OCC), revision sequence tracking, retry idempotency, clear-answer deletion, and atomic batch autosave subsystem for candidate exam delivery in ProctorNet.

---

## 2. Core Architectural Invariants

### 2.1 Optimistic Concurrency Control (OCC) & Revision Tracking
Answer persistence uses the existing `answers` table (`attempt_question_id`, `answer_value`, `revision`, `saved_at`).

- **Unanswered Question State**:
  - Absence of a row in the `answers` table indicates an unanswered question.
  - The client **MUST** provide `expected_revision = 0`.
  - The first committed save creates a new row with `revision = 1`.
  - Supplying any non-zero `expected_revision` on an unanswered question immediately returns `409 Conflict` (`STALE_REVISION_CONFLICT`).
- **Answered Question State ($K \ge 1$)**:
  - The client **MUST** provide `expected_revision = K`.
  - A successful save updates the row and increments `revision = K + 1`.
  - Supplying a mismatched `expected_revision` (except as an idempotent retry) returns `409 Conflict` (`STALE_REVISION_CONFLICT`).

### 2.2 Revision-Aware Payload-Based Retry Handling
- When a save request arrives with `expected_revision = K - 1` and an `answer_value` identical to the currently committed answer payload at revision $K$:
  - The server recognizes it as a network retry of the immediately previous committed save.
  - The server returns the existing record at revision $K$ with `200 OK` without incrementing the revision.
- If `expected_revision < K` arrives with a *different* payload, the server rejects it with `409 Conflict` (`STALE_REVISION_CONFLICT`).

> [!NOTE]
> Phase 7 implements revision-aware payload-based retry handling. Strong request-identity idempotency using persisted idempotency keys is not required by the current schema/architecture.

### 2.3 Clear-Answer Semantics with OCC
- An answer is cleared via `DELETE /api/v1/attempts/:attemptId/answers/:attemptQuestionId` with `{ "expected_revision": K }`.
- If the current row revision is $K$ and `expected_revision = K`: the server executes `DELETE FROM answers WHERE attempt_question_id = $1 AND revision = $2`, returning `200 OK` with `{ "cleared": true }`.
- If `expected_revision != K`: returns `409 Conflict` (`STALE_REVISION_CONFLICT`).
- If no row exists:
  - If `expected_revision === 0`: returns `200 OK` with `{ "cleared": true }` (idempotent no-op).
  - If `expected_revision > 0`: returns `409 Conflict` (`STALE_REVISION_CONFLICT`).
- Following deletion, the question returns to the unanswered state; the next save MUST provide `expected_revision = 0` to create `revision = 1`.

### 2.4 Atomic Batch Autosave
- `POST /api/v1/attempts/:attemptId/answers/batch` persists multiple answers in a **single PostgreSQL transaction**.
- **Duplicate Question Rejection**: The batch MUST NOT contain duplicate `attempt_question_id` values. Duplicate questions are rejected with `400 Bad Request` (`BAD_REQUEST`), resulting in zero database modifications.
- **Deterministic Order**: Items are sorted deterministically by `attempt_question_id` to maintain a predictable execution order.
- **All-or-Nothing Atomicity**: If any single answer in the batch fails validation or encounters an OCC conflict, the entire transaction executes `ROLLBACK`, leaving zero partial updates committed.

### 2.5 Authoritative Server Timing & Attempt-Level Row Locking
- PostgreSQL `CURRENT_TIMESTAMP` is the authoritative source for `saved_at` and `server_time`. Client timestamps (`client_timestamp`) are strictly excluded from write DTOs.
- All answer writes acquire an exclusive row lock on the attempt (`SELECT ... FROM exam_attempts WHERE attempt_id = $1 FOR UPDATE`).
- If `CURRENT_TIMESTAMP >= expires_at`:
  1. The attempt is transitioned from `ACTIVE` to `EXPIRED`.
  2. An `ATTEMPT_EXPIRED` audit log entry is persisted.
  3. The transaction commits the expiration.
  4. The answer write/clear is rejected with `409 Conflict` (`ATTEMPT_EXPIRED`).

### 2.6 Question-Type Semantic Validation
- **MCQ / TRUE_FALSE**: Validates that `selected_option_id` is a valid UUID that belongs to the target question in `question_options`. Foreign options return `422 Unprocessable Entity` (`UNPROCESSABLE_ENTITY`).
- **NUMERIC**: Validates that `numeric_value` is a finite numeric value (rejecting null, NaN, Infinity, strings) with `422 Unprocessable Entity` (`UNPROCESSABLE_ENTITY`).
- Zero solution leakage: `is_correct` and `correct_numeric_value` are never exposed in answer routes.

---

## 3. API Reference

### 1. `PUT /api/v1/attempts/:attemptId/answers/:attemptQuestionId`
- **Role**: `STUDENT` (Attempt Owner only)
- **Request Body**:
  ```json
  {
    "answer_value": {
      "selected_option_id": "c7a8b9d0-1234-4567-89ab-cdef01234567"
    },
    "expected_revision": 0
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "answer_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "attempt_question_id": "d2a1b3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "answer_value": {
        "selected_option_id": "c7a8b9d0-1234-4567-89ab-cdef01234567"
      },
      "revision": 1,
      "saved_at": "2026-09-07T05:10:00.123Z",
      "server_time": "2026-09-07T05:10:00.123Z"
    }
  }
  ```

### 2. `DELETE /api/v1/attempts/:attemptId/answers/:attemptQuestionId`
- **Role**: `STUDENT` (Attempt Owner only)
- **Request Body**:
  ```json
  {
    "expected_revision": 1
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "attempt_question_id": "d2a1b3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "cleared": true,
      "server_time": "2026-09-07T05:10:00.123Z"
    }
  }
  ```

### 3. `POST /api/v1/attempts/:attemptId/answers/batch`
- **Role**: `STUDENT` (Attempt Owner only)
- **Request Body**:
  ```json
  {
    "answers": [
      {
        "attempt_question_id": "d2a1b3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
        "answer_value": { "selected_option_id": "c7a8b9d0-1234-4567-89ab-cdef01234567" },
        "expected_revision": 0
      },
      {
        "attempt_question_id": "e3b2c4d5-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
        "answer_value": { "numeric_value": 42.5 },
        "expected_revision": 1
      }
    ]
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "saved_count": 2,
      "server_time": "2026-09-07T05:10:00.123Z",
      "answers": [
        {
          "answer_id": "f47ac10b-...",
          "attempt_question_id": "d2a1b3c4-...",
          "answer_value": { "selected_option_id": "c7a8b9d0-..." },
          "revision": 1,
          "saved_at": "2026-09-07T05:10:00.123Z"
        },
        {
          "answer_id": "a1b2c3d4-...",
          "attempt_question_id": "e3b2c4d5-...",
          "answer_value": { "numeric_value": 42.5 },
          "revision": 2,
          "saved_at": "2026-09-07T05:10:00.123Z"
        }
      ]
    }
  }
  ```

### 4. `GET /api/v1/attempts/:attemptId/answers`
- **Role**: `STUDENT` (Owner), `FACULTY` (Exam Creator), `INVIGILATOR` (Assigned), `ADMIN`
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "attempt_id": "c1f7b76e-...",
      "status": "ACTIVE",
      "server_time": "2026-09-07T05:10:00.123Z",
      "answered_count": 2,
      "answers": [
        {
          "answer_id": "f47ac10b-...",
          "attempt_question_id": "d2a1b3c4-...",
          "answer_value": { "selected_option_id": "c7a8b9d0-..." },
          "revision": 1,
          "saved_at": "2026-09-07T05:10:00.123Z"
        }
      ]
    }
  }
  ```
