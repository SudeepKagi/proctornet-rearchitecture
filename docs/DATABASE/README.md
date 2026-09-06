# ProctorNet Database & Migration Architecture

> **Authoritative Baseline Reference**: Derived directly from `13.5 Final Database Architecture — ProctorNet`.  
> PostgreSQL is the single authoritative source of truth for all business-critical state.

---

## 1. Database Conventions & Standards

- **Naming Strategy**:
  - Tables: `snake_case`, pluralized (e.g., `users`, `exam_attempts`, `violation_events`).
  - Columns: `snake_case`, with semantic foreign keys ending in `_id` (e.g., `user_id`, `session_id`, `attempt_id`).
  - Primary Keys: Non-sequential UUIDs (`gen_random_uuid()` / `UUIDv4`) for all major business entities.
- **Timestamps**:
  - Authoritative timestamps are stored with timezone (`TIMESTAMPTZ`) in UTC.
  - Standard entity audit timestamps: `created_at`, `updated_at`.
- **Soft Deletion & Integrity**:
  - Hard deletion of user accounts or exam attempts is prohibited. Status columns (`ACTIVE`, `LOCKED`, `DISABLED`, `TERMINATED`) govern lifecycle visibility.
  - Restrictive foreign key deletion (`ON DELETE RESTRICT`) is enforced on historical/audit-critical relationships.

---

## 2. Migration Toolchain & Workflow

ProctorNet uses `node-pg-migrate` executed through native Node.js ES Modules.

### Migration Commands
```bash
# Run all pending migrations forward
npm run db:migrate

# Roll back the most recent migration batch
npm run db:rollback

# Create a new migration file
npm run db:create <migration-name>
```

### Programmatic Runner
The migration runner is configured in [src/infrastructure/postgres/migrate.js](../../backend/src/infrastructure/postgres/migrate.js), which integrates directly with the validated environment configuration (`DATABASE_URL` or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`).

---

## 3. Schema Overview (All 22 Tables)

```
+---------------------------------------------------------------------------------------------------+
|                                      ProctorNet Entity Map                                        |
+---------------------------------------------------------------------------------------------------+
|  [Users & Identity]       [Exam Content]            [Scheduling]           [Attempts & Answers]   |
|  - users                  - subjects                - rooms                - exam_attempts        |
|  - user_roles             - topics                  - exam_sessions        - attempt_questions    |
|  - student_profiles       - questions               - session_students     - answers              |
|  - faculty_profiles       - question_options        - session_invigilators                        |
|                           - source_documents                               [Proctoring & Audit]   |
|                           - question_gen_jobs       [Exams]                - violation_events     |
|                                                     - exams                - results              |
|                                                     - exam_topic_rules     - audit_logs           |
+---------------------------------------------------------------------------------------------------+
```

### Table Specifications

#### Group A: Users & Access
1. **`users`**: Base identity store. Columns: `user_id` (UUID PK), `name`, `email` (UNIQUE), `phone`, `password_hash`, `status` (`ACTIVE`, `LOCKED`, `DISABLED`), `created_at`, `updated_at`.
2. **`user_roles`**: Multi-role assignment (e.g., faculty can also be invigilator). Columns: `user_id` (FK), `role` (`STUDENT`, `FACULTY`, `INVIGILATOR`, `ADMIN`), `created_at`. PK: `(user_id, role)`.
3. **`student_profiles`**: Academic student metadata. Columns: `user_id` (UUID PK/FK), `enrollment_number` (UNIQUE), `department`, `semester`, `metadata` (JSONB), `created_at`, `updated_at`.
4. **`faculty_profiles`**: Academic staff metadata. Columns: `user_id` (UUID PK/FK), `employee_id` (UNIQUE), `department`, `designation`, `metadata` (JSONB), `created_at`, `updated_at`.

#### Group B: Exam Content & Question Bank
5. **`subjects`**: Course/subject catalog. Columns: `subject_id` (UUID PK), `code` (UNIQUE), `name`, `description`, `created_at`, `updated_at`.
6. **`topics`**: Granular topics within subjects. Columns: `topic_id` (UUID PK), `subject_id` (FK), `name`, `description`, `created_at`, `updated_at`. Unique: `(subject_id, name)`.
7. **`questions`**: Reusable question repository. Columns: `question_id` (UUID PK), `topic_id` (FK), `question_type` (`MCQ`, `TRUE_FALSE`, `NUMERIC`), `prompt_text`, `default_points`, `correct_numeric_value`, `metadata` (JSONB), `created_at`, `updated_at`.
8. **`question_options`**: Options for MCQ / TRUE_FALSE questions. Columns: `option_id` (UUID PK), `question_id` (FK), `option_text`, `is_correct` (BOOLEAN), `display_order` (INT), `created_at`. Unique: `(question_id, display_order)`.
9. **`source_documents`**: Reference content / syllabus files for generation workflows. Columns: `document_id` (UUID PK), `title`, `source_type`, `file_object_key`, `metadata` (JSONB), `created_at`, `updated_at`.
10. **`question_generation_jobs`**: Asynchronous question authoring tasks. Columns: `job_id` (UUID PK), `document_id` (FK nullable), `topic_id` (FK nullable), `status` (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`), `metadata` (JSONB), `created_at`, `updated_at`.

#### Group C: Exams & Scheduling
11. **`exams`**: Exam template definition. Columns: `exam_id` (UUID PK), `title`, `description`, `duration_minutes`, `total_marks`, `passing_marks`, `status` (`DRAFT`, `PUBLISHED`, `SCHEDULED`, `LIVE`, `ENDED`, `EVALUATED`, `RESULT_PUBLISHED`), `created_at`, `updated_at`.
12. **`exam_topic_rules`**: Blueprint rules mapping questions from topics to exams. Columns: `rule_id` (UUID PK), `exam_id` (FK), `topic_id` (FK), `question_count`, `points_per_question`, `created_at`. Unique: `(exam_id, topic_id)`.
13. **`rooms`**: Physical exam halls / capacity boundaries. Columns: `room_id` (UUID PK), `name` (UNIQUE), `capacity` (INT), `building`, `metadata` (JSONB), `created_at`, `updated_at`.
14. **`exam_sessions`**: Scheduled physical/virtual exam event. Columns: `session_id` (UUID PK), `exam_id` (FK), `room_id` (FK nullable), `scheduled_start_time`, `scheduled_end_time`, `status` (`SCHEDULED`, `ACTIVE`, `CONCLUDED`, `CANCELLED`), `created_at`, `updated_at`. Check: `scheduled_end_time > scheduled_start_time`.
15. **`session_students`**: Candidate roster assigned to an exam session. Columns: `session_id` (FK), `student_id` (FK), `status` (`ASSIGNED`, `PRESENT`, `ABSENT`, `DISQUALIFIED`), `created_at`. PK / Unique: `(session_id, student_id)`.
16. **`session_invigilators`**: Assigned proctor / invigilator roster. Columns: `session_id` (FK), `user_id` (FK), `role` (`PRIMARY`, `SECONDARY`), `created_at`. PK / Unique: `(session_id, user_id)`.

#### Group D: Attempts & Answers (High-Concurrency Critical Path)
17. **`exam_attempts`**: Individual student test attempt instance. Columns: `attempt_id` (UUID PK), `session_id` (FK), `student_id` (FK), `status` (`READY`, `ACTIVE`, `SUBMITTED`, `TERMINATED`, `EXPIRED`), `started_at`, `expires_at` (NOT NULL), `submitted_at`, `created_at`, `updated_at`. Mandatory Unique: `(session_id, student_id)`.
18. **`attempt_questions`**: Persisted, deterministic student question mapping and randomized order. Columns: `attempt_question_id` (UUID PK), `attempt_id` (FK), `question_id` (FK), `display_order` (INT), `created_at`. Mandatory Unique: `(attempt_id, display_order)` and `(attempt_id, question_id)`.
19. **`answers`**: Student submitted answer state with revision sequence. Columns: `answer_id` (UUID PK), `attempt_question_id` (FK), `answer_value` (JSONB), `revision` (INT, default 1), `saved_at`, `created_at`, `updated_at`. Mandatory Unique: `(attempt_question_id)`. Unanswered questions are represented by the absence of a row.

#### Group E: Proctoring, Results & Audit
20. **`violation_events`**: Immutable candidate violation telemetry logs. Columns: `violation_id` (UUID PK), `attempt_id` (FK), `event_type` (VARCHAR), `severity` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), `server_timestamp`, `evidence_object_key` (TEXT nullable), `metadata` (JSONB), `created_at`.
21. **`results`**: Evaluated attempt scores and summary metrics. Columns: `result_id` (UUID PK), `attempt_id` (FK), `score`, `correct_count`, `wrong_count`, `unanswered_count`, `evaluated_at`, `created_at`. Mandatory Unique: `(attempt_id)`.
22. **`audit_logs`**: Tamper-evident administrative action log. Columns: `audit_id` (UUID PK), `actor_user_id` (FK nullable), `action`, `resource_type`, `resource_id`, `attempt_id` (FK nullable), `timestamp`, `request_id`, `metadata` (JSONB), `created_at`.

---

## 4. Constraint Strategy

| Constraint Type | Tables Enforced | Invariant Protected |
| :--- | :--- | :--- |
| **Primary Key (UUID)** | All 22 tables | Unique non-sequential entity identification |
| **Unique Constraint** | `users(email)` | Single account per email address |
| **Unique Constraint** | `session_students(session_id, student_id)` | Prevents duplicate student scheduling in a session |
| **Unique Constraint** | `exam_attempts(session_id, student_id)` | Prevents multiple attempts for same candidate in a session |
| **Unique Constraint** | `attempt_questions(attempt_id, display_order)` | Guarantees deterministic, collision-free question sequence |
| **Unique Constraint** | `attempt_questions(attempt_id, question_id)` | Prevents duplicate question assignment in single attempt |
| **Unique Constraint** | `answers(attempt_question_id)` | Exactly one current answer state per attempt question |
| **Unique Constraint** | `results(attempt_id)` | Exactly one final result record per attempt |
| **Check Constraints** | `status`, `role`, `question_type`, `severity` | Strictly restricts domain values to approved finite-state sets |
| **Check Constraints** | `session_times` | `scheduled_end_time > scheduled_start_time` |

---

## 5. Query-Driven Indexing Strategy

```sql
-- User Lookups
CREATE INDEX idx_users_email ON users(email);

-- Session Rosters
CREATE INDEX idx_session_students_session_student ON session_students(session_id, student_id);
CREATE INDEX idx_session_students_student_session ON session_students(student_id, session_id);
CREATE INDEX idx_session_invigilators_session_user ON session_invigilators(session_id, user_id);

-- Operational Lookups
CREATE INDEX idx_topics_subject_id ON topics(subject_id);
CREATE INDEX idx_questions_topic_id ON questions(topic_id);
CREATE INDEX idx_question_options_question_id ON question_options(question_id);
CREATE INDEX idx_exam_sessions_exam_id ON exam_sessions(exam_id);
CREATE INDEX idx_exam_sessions_schedule ON exam_sessions(scheduled_start_time, scheduled_end_time);

-- High-Concurrency Attempts & Autosave Critical Path
CREATE INDEX idx_exam_attempts_session_student ON exam_attempts(session_id, student_id);
CREATE INDEX idx_exam_attempts_student_status ON exam_attempts(student_id, status);
CREATE INDEX idx_attempt_questions_attempt_order ON attempt_questions(attempt_id, display_order);
CREATE INDEX idx_attempt_questions_question_id ON attempt_questions(question_id);
CREATE INDEX idx_answers_attempt_question_id ON answers(attempt_question_id);

-- Proctoring Violation Timeline
CREATE INDEX idx_violation_events_attempt_timestamp ON violation_events(attempt_id, server_timestamp);

-- Results Lookup
CREATE INDEX idx_results_attempt_id ON results(attempt_id);

-- Audit Trails
CREATE INDEX idx_audit_logs_actor_timestamp ON audit_logs(actor_user_id, timestamp);
CREATE INDEX idx_audit_logs_resource_timestamp ON audit_logs(resource_type, resource_id, timestamp);
```
