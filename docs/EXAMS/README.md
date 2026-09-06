# ProctorNet — Exams, Sessions & Assignments Architecture

## 1. Overview & Architectural Hierarchy

Phase 5 of ProctorNet establishes the authoritative domain workflow for **Exam Authoring, Blueprint Rules, Publishing, Session Scheduling, Candidate Rostering, and Invigilator Assignments**.

The core architectural hierarchy follows the Master Development Plan:

$$\text{Exam} \longrightarrow \text{Session} \longrightarrow \text{Attempt}$$

- **Exam (`exams`)**: The academic definition, blueprint, subject binding, marks structure, and frozen question distribution rules.
- **Session (`exam_sessions`)**: An authoritative, time-bounded scheduling window within a physical or virtual room (`rooms`), binding enrolled candidates (`session_students`) and proctors (`session_invigilators`).
- **Attempt (`exam_attempts`)**: Individual candidate test executions during an active session (handled in Phase 6).

---

## 2. Exam Lifecycle & Authoring

### 2.1 State Progression & Deterministic State Machine

Exams strictly follow the Phase 3 domain state machine:

```
[ DRAFT ] ──> [ PUBLISHED ] ──> [ SCHEDULED ] ──> [ LIVE ] ──> [ ENDED ] ──> [ EVALUATED ] ──> [ RESULT_PUBLISHED ]
```

### 2.2 Authoring & Draft Mutations
- **Creation (`POST /api/v1/exams`)**: Faculty or Admins define title, subject, duration in minutes, total marks, and passing marks. Exams initialize in `DRAFT` status with authoritative creator ownership (`created_by`).
- **Domain Invariants**:
  - `passing_marks <= total_marks`
  - `duration_minutes > 0`
  - `total_marks >= 1`
- **Mutability Constraint (`assertExamCanBeMutated`)**: Only exams in `DRAFT` state can have their metadata, time constraints, marks, or topic rules modified. Once published, the exam definition is frozen permanently.

### 2.3 Blueprint & Topic Distribution Rules
- Topic rules (`exam_topic_rules`) define how questions will be assembled:
  - `topic_id`: Must belong to the exam's designated `subject_id`.
  - `question_count`: Positive integer representing required questions from this topic.
  - `points_per_question`: Positive number representing marks allocated per question.

### 2.4 Publishing Verification Contract
Publishing an exam (`POST /api/v1/exams/:id/publish`) executes an atomic PostgreSQL transaction with row locking (`SELECT ... FOR UPDATE`):
1. **State Validation**: Asserts exam is in `DRAFT` state and transitions it to `PUBLISHED`.
2. **Topic Rule Minimum**: Asserts at least one topic rule is configured.
3. **Blueprint Points Balancing**: Asserts $\sum (\text{question\_count} \times \text{points\_per\_question}) = \text{total\_marks}$.
4. **Question Bank Inventory Check**: Verifies that the question bank contains at least `question_count` approved questions for each specified topic.
5. **Contract Freeze**: Updates exam status to `PUBLISHED` and records an immutable audit log entry.

---

## 3. Exam Sessions & Scheduling

### 3.1 Multi-Session Scheduling & Exam Lifecycle Coupling
An exam can be scheduled across multiple sessions (e.g., morning and afternoon batches, or different rooms):
- **First Session Creation**: When the first session is created for a `PUBLISHED` exam, the service transitions the exam from `PUBLISHED` to `SCHEDULED`.
- **Subsequent Session Creation**: When additional sessions are scheduled for an already `SCHEDULED` exam, the exam status remains `SCHEDULED`.
- **Rejection**: Sessions cannot be scheduled for exams in `DRAFT`, `ENDED`, or later terminal states.

### 3.2 Authoritative Server Time Validation
- `scheduled_start_time` and `scheduled_end_time` are enforced against server-side UTC timestamps.
- **Invariants**:
  - `scheduled_end_time > scheduled_start_time`
  - $(\text{scheduled\_end\_time} - \text{scheduled\_start\_time}) \ge \text{exam.duration\_minutes}$ (the session window must be large enough to accommodate the full exam duration).

---

## 4. Candidate Rostering & Room Capacity Management

### 4.1 Transactional Capacity Allocation
To prevent race conditions and overbooking across concurrent enrollment requests:
1. The transaction acquires an exclusive row lock on the designated room (`SELECT capacity FROM rooms WHERE room_id = $1 FOR UPDATE`).
2. The service queries existing enrolled candidate IDs for the session.
3. Incoming candidate IDs are deduplicated:
   $$\text{newlyAddingCount} = | \text{distinctInputIds} \setminus \text{existingEnrolledIds} |$$
4. Capacity invariant check:
   $$\text{existingCount} + \text{newlyAddingCount} \le \text{room.capacity}$$
   If exceeded, the transaction rolls back with `409 ConflictError`.
5. Batch insertion into `session_students` utilizes `ON CONFLICT (session_id, student_id) DO NOTHING`.

### 4.2 Invigilator Assignments
- Sessions require assigned invigilators (`session_invigilators`) with designated roles (`PRIMARY` or `SECONDARY`).
- Assigned users must possess an eligible role (`FACULTY`, `INVIGILATOR`, or `ADMIN`).
- Duplicate assignments gracefully update the invigilator's role via `ON CONFLICT (session_id, user_id) DO UPDATE SET role = EXCLUDED.role`.

---

## 5. Security & Authorization Matrix

| Endpoint | Method | Role Required | Ownership / Scope Rules |
| :--- | :--- | :--- | :--- |
| `/api/v1/exams` | POST | `FACULTY`, `ADMIN` | Automatically assigns `created_by = req.user.userId` |
| `/api/v1/exams` | GET | Authenticated | Faculty see own exams by default; Admins see all |
| `/api/v1/exams/:id` | GET | Authenticated | Public exam info; faculty/admin see full blueprint |
| `/api/v1/exams/:id` | PUT | `FACULTY`, `ADMIN` | Must be exam creator or admin; draft only |
| `/api/v1/exams/:id/rules` | POST | `FACULTY`, `ADMIN` | Must be exam creator or admin; draft only |
| `/api/v1/exams/:id/rules/:ruleId` | DELETE | `FACULTY`, `ADMIN` | Must be exam creator or admin; draft only |
| `/api/v1/exams/:id/publish` | POST | `FACULTY`, `ADMIN` | Must be exam creator or admin; blueprint verified |
| `/api/v1/sessions` | POST | `FACULTY`, `ADMIN` | Must be exam creator or admin |
| `/api/v1/sessions` | GET | Authenticated | Filterable by `exam_id`, `room_id`, `status` |
| `/api/v1/sessions/:id` | GET | Authenticated | Students must be in session roster; Faculty/Admin unrestricted |
| `/api/v1/sessions/:id` | PUT | `FACULTY`, `ADMIN` | Must be exam creator or admin; scheduled only |
| `/api/v1/sessions/:id/students` | POST | `FACULTY`, `ADMIN` | Must be exam creator or admin; room capacity enforced |
| `/api/v1/sessions/:id/students/:studentId` | DELETE | `FACULTY`, `ADMIN` | Must be exam creator or admin |
| `/api/v1/sessions/:id/invigilators` | POST | `FACULTY`, `ADMIN` | Must be exam creator or admin; user role verified |
| `/api/v1/sessions/:id/invigilators/:userId` | DELETE | `FACULTY`, `ADMIN` | Must be exam creator or admin |
| `/api/v1/sessions/rooms` | GET | Authenticated | List all physical/virtual rooms |
| `/api/v1/sessions/rooms` | POST | `FACULTY`, `ADMIN` | Create new physical/virtual room |

---

## 6. Audit Event Types

All state changes and assignment actions record immutable audit logs in `audit_logs`:
- `EXAM_CREATED`
- `EXAM_UPDATED`
- `EXAM_TOPIC_RULE_CONFIGURED`
- `EXAM_TOPIC_RULE_DELETED`
- `EXAM_PUBLISHED`
- `SESSION_CREATED`
- `SESSION_UPDATED`
- `SESSION_STUDENTS_ASSIGNED`
- `SESSION_STUDENT_REMOVED`
- `SESSION_INVIGILATOR_ASSIGNED`
- `SESSION_INVIGILATOR_REMOVED`
- `ROOM_CREATED`
