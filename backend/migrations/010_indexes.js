/**
 * Migration 010: Query-Driven Indexes and Constraints
 */
export async function up(pgm) {
  pgm.sql(`
    -- User lookups
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    -- Session roster lookups
    CREATE INDEX IF NOT EXISTS idx_session_students_session_student ON session_students(session_id, student_id);
    CREATE INDEX IF NOT EXISTS idx_session_students_student_session ON session_students(student_id, session_id);
    CREATE INDEX IF NOT EXISTS idx_session_invigilators_session_user ON session_invigilators(session_id, user_id);

    -- Exam & Session operational lookups
    CREATE INDEX IF NOT EXISTS idx_topics_subject_id ON topics(subject_id);
    CREATE INDEX IF NOT EXISTS idx_questions_topic_id ON questions(topic_id);
    CREATE INDEX IF NOT EXISTS idx_question_options_question_id ON question_options(question_id);
    CREATE INDEX IF NOT EXISTS idx_exam_sessions_exam_id ON exam_sessions(exam_id);
    CREATE INDEX IF NOT EXISTS idx_exam_sessions_schedule ON exam_sessions(scheduled_start_time, scheduled_end_time);

    -- Attempts & Answers (High concurrency critical path)
    CREATE INDEX IF NOT EXISTS idx_exam_attempts_session_student ON exam_attempts(session_id, student_id);
    CREATE INDEX IF NOT EXISTS idx_exam_attempts_student_status ON exam_attempts(student_id, status);
    CREATE INDEX IF NOT EXISTS idx_attempt_questions_attempt_order ON attempt_questions(attempt_id, display_order);
    CREATE INDEX IF NOT EXISTS idx_attempt_questions_question_id ON attempt_questions(question_id);
    CREATE INDEX IF NOT EXISTS idx_answers_attempt_question_id ON answers(attempt_question_id);

    -- Proctoring violations (Timeline queries)
    CREATE INDEX IF NOT EXISTS idx_violation_events_attempt_timestamp ON violation_events(attempt_id, server_timestamp);

    -- Results lookup
    CREATE INDEX IF NOT EXISTS idx_results_attempt_id ON results(attempt_id);

    -- Audit trails
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_timestamp ON audit_logs(actor_user_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_timestamp ON audit_logs(resource_type, resource_id, timestamp);
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_audit_logs_resource_timestamp;
    DROP INDEX IF EXISTS idx_audit_logs_actor_timestamp;
    DROP INDEX IF EXISTS idx_results_attempt_id;
    DROP INDEX IF EXISTS idx_violation_events_attempt_timestamp;
    DROP INDEX IF EXISTS idx_answers_attempt_question_id;
    DROP INDEX IF EXISTS idx_attempt_questions_question_id;
    DROP INDEX IF EXISTS idx_attempt_questions_attempt_order;
    DROP INDEX IF EXISTS idx_exam_attempts_student_status;
    DROP INDEX IF EXISTS idx_exam_attempts_session_student;
    DROP INDEX IF EXISTS idx_exam_sessions_schedule;
    DROP INDEX IF EXISTS idx_exam_sessions_exam_id;
    DROP INDEX IF EXISTS idx_question_options_question_id;
    DROP INDEX IF EXISTS idx_questions_topic_id;
    DROP INDEX IF EXISTS idx_topics_subject_id;
    DROP INDEX IF EXISTS idx_session_invigilators_session_user;
    DROP INDEX IF EXISTS idx_session_students_student_session;
    DROP INDEX IF EXISTS idx_session_students_session_student;
    DROP INDEX IF EXISTS idx_users_email;
  `);
}
