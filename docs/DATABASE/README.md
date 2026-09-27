# ProctorNet Database & Migration Architecture

> **Authoritative Baseline Reference**: Derived from ProctorNet Institutional Re-Architecture.  
> PostgreSQL is the single authoritative source of truth for all business-critical state, transactions, and audit records.

---

## 1. Database Conventions & Standards

- **Naming Strategy**:
  - Tables: `snake_case`, pluralized (e.g., `users`, `exam_attempts`, `violation_events`, `departments`).
  - Columns: `snake_case`, with semantic foreign keys ending in `_id` (e.g., `user_id`, `session_id`, `attempt_id`, `department_id`).
  - Primary Keys: Non-sequential UUIDs (`gen_random_uuid()` / `UUIDv4`) for all major business entities.
- **Timestamps**:
  - Authoritative timestamps are stored with timezone (`TIMESTAMPTZ`) in UTC.
  - Standard entity audit timestamps: `created_at`, `updated_at`.
- **Soft Deletion & Lifecycle Management**:
  - Hard deletion of user accounts or exam attempts is prohibited. Status columns (`ACTIVE`, `LOCKED`, `DISABLED`, `TERMINATED`) govern lifecycle visibility.
  - Restrictive foreign key deletion (`ON DELETE RESTRICT`) is enforced on historical/audit-critical relationships.
- **Transactional Durability**:
  - Business actions commit to PostgreSQL before returning an HTTP `200 OK` response to the client.

---

## 2. Migration Toolchain & Workflow

ProctorNet uses `node-pg-migrate` executed through native Node.js ES Modules.

### Migration Commands
```bash
# Run all pending migrations forward
npm --prefix backend run db:migrate

# Roll back the most recent migration batch
npm --prefix backend run db:rollback

# Create a new migration file
npm --prefix backend run db:create <migration-name>
```

### Migration History
The database schema is evolved via 25 sequential migrations:
- `001_core_initial_schema.js`: Base users, subjects, topics, questions, exams, sessions, attempts, answers, results, and audit logs.
- `002` through `020`: Realtime signaling, outbox events, student documents, face embeddings, manual grading queues, and session incidents.
- `021_examination_and_invigilation_extensions.js`: Multi-stream SFU tracking, live intervention logging, and evaluation pipeline extensions.
- `022_add_developer_role.js`: Authoritative `DEVELOPER` role added to role enum constraints.
- `023_candidate_face_enrollment_schema.js`: Biometric face embedding vector and identity card metadata storage.
- `024_drop_orphaned_legacy_tables.js`: Purge of obsolete tables (`question_generation_jobs`, `source_documents`, `exam_topic_rules`).
- `025_canonical_departments.js`: Canonical `departments` master catalog (17 disciplines) with foreign key linking to `exams(department_id)`.

---

## 3. Schema Architecture & Entity Model

```
+---------------------------------------------------------------------------------------------------+
|                                      ProctorNet Entity Map                                        |
+---------------------------------------------------------------------------------------------------+
|  [Users & Identity]       [Academic & Questions]    [Scheduling]           [Attempts & Answers]   |
|  - users                  - departments             - rooms                - exam_attempts        |
|  - user_roles             - subjects                - exam_sessions        - attempt_questions    |
|  - student_profiles       - topics                  - session_students     - answers              |
|  - faculty_profiles       - questions               - session_invigilators                        |
|  - student_documents      - question_options                               [Evaluation]           |
|  - student_face_embeddings- exams                   [Proctoring & Audit]   - results              |
|                           - exam_questions          - violation_events     - manual_grading_queue |
|                                                     - proctoring_flags     - manual_grades        |
|                                                     - session_incidents                           |
|                                                     - candidate_interventions                     |
|                                                     - outbox_events                               |
|                                                     - audit_logs                                  |
+---------------------------------------------------------------------------------------------------+
```

### Active Entity Groups

#### Group A: Users, Roles & Academic Identity
1. **`users`**: Base identity store. Columns: `user_id` (UUID PK), `name`, `email` (UNIQUE), `phone`, `password_hash`, `status` (`ACTIVE`, `LOCKED`, `DISABLED`), `created_at`, `updated_at`.
2. **`user_roles`**: Role assignment mapping users to one or more of the 5 institutional roles: `ADMIN`, `DEVELOPER`, `FACULTY`, `INVIGILATOR`, `STUDENT`. PK: `(user_id, role)`.
3. **`student_profiles`**: Academic student metadata. Columns: `user_id` (UUID PK/FK), `enrollment_number` (UNIQUE USN), `department`, `semester`, `metadata` (JSONB), `created_at`, `updated_at`.
4. **`faculty_profiles`**: Academic staff metadata. Columns: `user_id` (UUID PK/FK), `employee_id` (UNIQUE), `department`, `designation`, `metadata` (JSONB), `created_at`, `updated_at`.
5. **`student_documents`**: Verification documents (ID cards, marksheets) uploaded during onboarding for administrative verification.
6. **`student_face_embeddings`**: 128-dimensional biometric face embeddings for pre-exam facial recognition and identity verification.

#### Group B: Curriculum, Questions & Examinations
7. **`departments`**: Canonical institutional disciplines (e.g., `CSE`, `ECE`, `MECH`, `CIVIL`, `AIML`, `ISE`). Columns: `department_id` (UUID PK), `code` (VARCHAR UNIQUE), `name` (VARCHAR), `created_at`, `updated_at`.
8. **`subjects`**: Course catalog. Columns: `subject_id` (UUID PK), `code` (UNIQUE), `name`, `description`, `created_at`, `updated_at`.
9. **`topics`**: Topic taxonomy within subjects. Columns: `topic_id` (UUID PK), `subject_id` (FK), `name`, `description`, `created_at`, `updated_at`.
10. **`questions`**: Reusable question repository. Columns: `question_id` (UUID PK), `topic_id` (FK), `question_type` (`MCQ`, `TRUE_FALSE`, `NUMERIC`, `SHORT_ANSWER`, `CODING`), `prompt_text`, `default_points`, `correct_numeric_value`, `metadata` (JSONB), `created_at`, `updated_at`.
11. **`question_options`**: Options for MCQ / TRUE_FALSE questions with display order.
12. **`exams`**: Exam template definition. Columns: `exam_id` (UUID PK), `title`, `description`, `department_id` (FK nullable to `departments`), `duration_minutes`, `total_marks`, `passing_marks`, `status` (`DRAFT`, `PUBLISHED`, `SCHEDULED`, `LIVE`, `ENDED`, `EVALUATED`, `RESULT_PUBLISHED`), `created_at`, `updated_at`.
13. **`exam_questions`**: Direct question-to-exam blueprint composition with points allocation and ordering.

#### Group C: Scheduling & Proctoring Assignments
14. **`rooms`**: Physical exam halls / capacity boundaries. Columns: `room_id` (UUID PK), `name` (UNIQUE), `capacity` (INT), `building`, `metadata` (JSONB), `created_at`, `updated_at`.
15. **`exam_sessions`**: Scheduled physical/virtual exam event. Columns: `session_id` (UUID PK), `exam_id` (FK), `room_id` (FK nullable), `scheduled_start_time`, `scheduled_end_time`, `status` (`SCHEDULED`, `ACTIVE`, `CONCLUDED`, `CANCELLED`), `created_at`, `updated_at`.
16. **`session_students`**: Candidate roster assigned to an exam session. Columns: `session_id` (FK), `student_id` (FK), `status` (`ASSIGNED`, `PRESENT`, `ABSENT`, `DISQUALIFIED`), `created_at`.
17. **`session_invigilators`**: Dual invigilation roster assigning either dedicated staff (`INVIGILATOR`) or course faculty (`FACULTY`) to supervise a session.

#### Group D: Attempts & Answers (High-Concurrency Critical Path)
18. **`exam_attempts`**: Individual student exam attempt instance. Columns: `attempt_id` (UUID PK), `session_id` (FK), `student_id` (FK), `status` (`READY`, `ACTIVE`, `SUBMITTED`, `TERMINATED`, `EXPIRED`), `started_at`, `expires_at` (NOT NULL), `submitted_at`, `created_at`, `updated_at`. Unique: `(session_id, student_id)`.
19. **`attempt_questions`**: Deterministic student question mapping and randomized order. Columns: `attempt_question_id` (UUID PK), `attempt_id` (FK), `question_id` (FK), `display_order` (INT), `created_at`. Unique: `(attempt_id, display_order)` and `(attempt_id, question_id)`.
20. **`answers`**: Student submitted answer state with monotonic revision sequence. Columns: `answer_id` (UUID PK), `attempt_question_id` (FK), `answer_value` (JSONB), `revision` (INT, default 1), `saved_at`, `created_at`, `updated_at`. Unique: `(attempt_question_id)`.

#### Group E: Evaluation & Manual Grading
21. **`results`**: Evaluated attempt scores and summary metrics. Columns: `result_id` (UUID PK), `attempt_id` (FK), `score`, `correct_count`, `wrong_count`, `unanswered_count`, `evaluated_at`, `published_at`, `created_at`. Unique: `(attempt_id)`.
22. **`manual_grading_queue`**: Subjective questions awaiting faculty evaluation.
23. **`manual_grades`**: Assigned points and instructor feedback for manual assessments.

#### Group F: Proctoring Telemetry, Interventions & Audit
24. **`violation_events`**: Immutable candidate violation telemetry logs (tab switch, multi-face detection, window blur).
25. **`proctoring_flags`**: Server-authoritative anomaly flags with risk weighting.
26. **`session_incidents`**: Invigilator incident logs recorded during active proctoring sessions.
27. **`candidate_interventions`**: Realtime intervention actions executed by proctors (warning, pause, resume, termination).
28. **`outbox_events`**: Transactional outbox table ensuring reliable, at-least-once message dispatch to RabbitMQ.
29. **`audit_logs`**: Tamper-evident administrative action log protected by the `prevent_audit_log_mutation()` PostgreSQL trigger.

---

## 4. Key Relational Constraints & Invariants

| Constraint Type | Tables Enforced | Invariant Protected |
| :--- | :--- | :--- |
| **Primary Key (UUID)** | All tables | Non-sequential unique entity identification |
| **Unique Constraint** | `users(email)` | Exactly one account per institutional email address |
| **Unique Constraint** | `departments(code)` | Canonical discipline code uniqueness |
| **Unique Constraint** | `session_students(session_id, student_id)` | Prevents duplicate student scheduling in a session |
| **Unique Constraint** | `exam_attempts(session_id, student_id)` | Strictly one attempt per candidate per exam session |
| **Unique Constraint** | `attempt_questions(attempt_id, display_order)` | Guarantees collision-free question sequence order |
| **Unique Constraint** | `attempt_questions(attempt_id, question_id)` | Prevents duplicate question presentation in an attempt |
| **Unique Constraint** | `answers(attempt_question_id)` | Exactly one current answer state per question with monotonic OCC revision tracking |
| **Unique Constraint** | `results(attempt_id)` | Exactly one final result record per attempt |
| **Trigger Constraint** | `audit_logs` | `prevent_audit_log_mutation()` raises SQLSTATE 20000 on `UPDATE` or `DELETE` |
| **Check Constraint** | `session_times` | `scheduled_end_time > scheduled_start_time` |
| **Foreign Key (RESTRICT)**| `exams(department_id)` | Prevents accidental deletion of active academic departments |

---

## 5. Query-Driven Indexing Strategy

```sql
-- User Lookups
CREATE INDEX idx_users_email ON users(email);

-- Canonical Department Filter
CREATE INDEX idx_exams_department_id ON exams(department_id);

-- Session Rosters
CREATE INDEX idx_session_students_session_student ON session_students(session_id, student_id);
CREATE INDEX idx_session_students_student_session ON session_students(student_id, session_id);
CREATE INDEX idx_session_invigilators_session_user ON session_invigilators(session_id, user_id);

-- High-Concurrency Attempts & Autosave Critical Path
CREATE INDEX idx_exam_attempts_session_student ON exam_attempts(session_id, student_id);
CREATE INDEX idx_exam_attempts_student_status ON exam_attempts(student_id, status);
CREATE INDEX idx_attempt_questions_attempt_order ON attempt_questions(attempt_id, display_order);
CREATE INDEX idx_attempt_questions_question_id ON attempt_questions(question_id);
CREATE INDEX idx_answers_attempt_question_id ON answers(attempt_question_id);

-- Proctoring Violation Timeline & Anomaly Flags
CREATE INDEX idx_violation_events_attempt_timestamp ON violation_events(attempt_id, server_timestamp);
CREATE INDEX idx_proctoring_flags_attempt_id ON proctoring_flags(attempt_id);

-- Transactional Outbox Relay Poller
CREATE INDEX idx_outbox_events_status_created ON outbox_events(status, created_at) WHERE status = 'PENDING';

-- Audit Trails
CREATE INDEX idx_audit_logs_actor_timestamp ON audit_logs(actor_user_id, timestamp);
CREATE INDEX idx_audit_logs_resource_timestamp ON audit_logs(resource_type, resource_id, timestamp);
```
