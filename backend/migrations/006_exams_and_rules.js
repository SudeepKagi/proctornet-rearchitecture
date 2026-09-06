/**
 * Migration 006: Exams and Exam Topic Rules
 */
export async function up(pgm) {
  pgm.sql(`
    -- Exams table
    CREATE TABLE IF NOT EXISTS exams (
      exam_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
      total_marks NUMERIC(6, 2) NOT NULL CHECK (total_marks >= 0),
      passing_marks NUMERIC(6, 2) NOT NULL CHECK (passing_marks >= 0),
      status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'SCHEDULED', 'LIVE', 'ENDED', 'EVALUATED', 'RESULT_PUBLISHED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Exam Topic Rules table
    CREATE TABLE IF NOT EXISTS exam_topic_rules (
      rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exam_id UUID NOT NULL REFERENCES exams(exam_id) ON DELETE CASCADE,
      topic_id UUID NOT NULL REFERENCES topics(topic_id) ON DELETE RESTRICT,
      question_count INT NOT NULL CHECK (question_count > 0),
      points_per_question NUMERIC(6, 2) NOT NULL CHECK (points_per_question > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (exam_id, topic_id)
    );
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS exam_topic_rules;
    DROP TABLE IF EXISTS exams;
  `);
}
