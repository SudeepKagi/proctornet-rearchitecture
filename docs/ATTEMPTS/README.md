# ProctorNet — Attempts & Question Mapping (Phase 6)

## 1. Overview

Phase 6 implements the authoritative candidate exam attempt model, deterministic question mapping, authoritative server timing, and student attempt lifecycle for ProctorNet.

---

## 2. Core Architecture & Workflow

### 2.1 Attempt Lifecycle
The attempt lifecycle is governed by the pure domain state machine in [`backend/src/domain/attempt/`](../../backend/src/domain/attempt/):

```
                     +---> [SUBMITTED]    (Phase 8)
                     |
[READY] ---> [ACTIVE] +---> [TERMINATED]   (Phase 15 proctor override)
                     |
                     +---> [EXPIRED]      (Authoritative server deadline)
```

- **Atomic Initialization**: When a student initiates an attempt (`POST /api/v1/sessions/:sessionId/attempts`), the attempt is created directly in `ACTIVE` state with `started_at = CURRENT_TIMESTAMP` and authoritative `expires_at = LEAST(CURRENT_TIMESTAMP + duration_minutes, scheduled_end_time)`.
- **Lazy On-Access Expiration**: When reading an attempt past `expires_at`, the system transitions the attempt state from `ACTIVE` to `EXPIRED` in PostgreSQL and emits an `ATTEMPT_EXPIRED` audit log.

---

### 2.2 Hierarchical Lock Ordering (Deadlock Prevention)

To prevent deadlocks under high concurrency, all transactions follow a strict hierarchical lock acquisition order:
1. `exam_sessions` (`FOR SHARE`)
2. `exams` (`FOR SHARE`)
3. `session_students` (`FOR UPDATE`)
4. `exam_attempts` (`FOR UPDATE`)

---

### 2.3 Deterministic Question Mapping

- **Permutation Algorithm**:
  1. For each `exam_topic_rules` entry, eligible questions are retrieved sorted by `(created_at ASC, question_id ASC)`.
  2. A deterministic 32-bit seed is calculated: `seed = MurmurHash3_32(SHA256(sessionId:studentId:topicId))`.
  3. A seeded Fisher-Yates shuffle using Mulberry32 PRNG selects `rule.question_count` questions.
  4. Mappings are assigned strictly contiguous `display_order (1..N)` and stored in `attempt_questions`.
  5. Once inserted, `attempt_questions` is the **permanent immutable record** for the lifetime of that attempt.

---

### 2.4 Defense-in-Depth for Duplicate Attempts

1. **Application Lock**: `SELECT ... FOR UPDATE` on `session_students` and `exam_attempts`.
2. **Storage Constraint**: `CONSTRAINT unique_session_student_attempt UNIQUE (session_id, student_id)`.
3. **Error Recovery**: Catches PostgreSQL `23505` (`unique_violation`), executes `ROLLBACK`, and recovers the already-committed attempt cleanly.

---

### 2.5 Safe Question Projection & BOLA Defense

- When candidates query questions via `GET /api/v1/attempts/:id/questions`, answers (`is_correct`, `correct_numeric_value`) and solution metadata are stripped.
- Candidates can only access their own attempts.
- Faculty exam creators, assigned invigilators, and Admins have oversight inspection access.

---

## 3. Endpoints

| Method | Path | Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/sessions/:id/attempts` | `STUDENT` | Starts attempt or idempotently returns active attempt |
| `POST` | `/api/v1/attempts/start` | `STUDENT` | Alias for starting attempt |
| `GET` | `/api/v1/sessions/:id/my-attempt` | `STUDENT` | Returns student's attempt summary for session |
| `GET` | `/api/v1/attempts/:id` | `STUDENT`, `FACULTY`, `INVIGILATOR`, `ADMIN` | Retrieves attempt metadata and server time remaining |
| `GET` | `/api/v1/attempts/:id/questions` | `STUDENT`, `FACULTY`, `INVIGILATOR`, `ADMIN` | Retrieves sanitized questions in display order |
