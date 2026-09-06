/**
 * Migration 004: Questions and Question Options
 */
export async function up(pgm) {
  pgm.sql(`
    -- Questions table
    CREATE TABLE IF NOT EXISTS questions (
      question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      topic_id UUID NOT NULL REFERENCES topics(topic_id) ON DELETE RESTRICT,
      question_type VARCHAR(32) NOT NULL CHECK (question_type IN ('MCQ', 'TRUE_FALSE', 'NUMERIC')),
      prompt_text TEXT NOT NULL,
      default_points NUMERIC(6, 2) NOT NULL DEFAULT 1.00 CHECK (default_points > 0),
      correct_numeric_value NUMERIC(12, 4),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Question Options table
    CREATE TABLE IF NOT EXISTS question_options (
      option_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id UUID NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
      option_text TEXT NOT NULL,
      is_correct BOOLEAN NOT NULL DEFAULT FALSE,
      display_order INT NOT NULL CHECK (display_order >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (question_id, display_order)
    );
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS question_options;
    DROP TABLE IF EXISTS questions;
  `);
}
