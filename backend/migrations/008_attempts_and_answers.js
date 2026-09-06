/**
 * Migration 008: Exam Attempts, Attempt Questions, Answers
 */
export async function up(pgm) {
  pgm.sql(`
    -- Exam Attempts table
    CREATE TABLE IF NOT EXISTS exam_attempts (
      attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES exam_sessions(session_id) ON DELETE RESTRICT,
      student_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      status VARCHAR(32) NOT NULL DEFAULT 'READY' CHECK (status IN ('READY', 'ACTIVE', 'SUBMITTED', 'TERMINATED', 'EXPIRED')),
      started_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      submitted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_session_student_attempt UNIQUE (session_id, student_id)
    );

    -- Attempt Questions mapping table (Persisted stable question ordering)
    CREATE TABLE IF NOT EXISTS attempt_questions (
      attempt_question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id UUID NOT NULL REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
      question_id UUID NOT NULL REFERENCES questions(question_id) ON DELETE RESTRICT,
      display_order INT NOT NULL CHECK (display_order >= 1),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_attempt_display_order UNIQUE (attempt_id, display_order),
      CONSTRAINT unique_attempt_question UNIQUE (attempt_id, question_id)
    );

    -- Answers table (Revision-tracked, optimistic concurrency, unanswered = absence of row)
    CREATE TABLE IF NOT EXISTS answers (
      answer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_question_id UUID NOT NULL REFERENCES attempt_questions(attempt_question_id) ON DELETE CASCADE,
      answer_value JSONB NOT NULL,
      revision INT NOT NULL DEFAULT 1 CHECK (revision >= 1),
      saved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_attempt_question_answer UNIQUE (attempt_question_id)
    );
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS answers;
    DROP TABLE IF EXISTS attempt_questions;
    DROP TABLE IF EXISTS exam_attempts;
  `);
}
