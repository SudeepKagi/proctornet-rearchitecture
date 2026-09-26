/**
 * Migration 023: Simplify Exam & Question Architecture
 * Replaces complex topic-based random sampling rules with static question assignments.
 * All candidates receive the exact same predetermined questions in identical display order.
 */

export async function up(pgm) {
  pgm.sql(`
    -- 1. Create static exam_questions mapping table
    CREATE TABLE IF NOT EXISTS exam_questions (
      exam_question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exam_id UUID NOT NULL REFERENCES exams(exam_id) ON DELETE CASCADE,
      question_id UUID NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
      display_order INT NOT NULL DEFAULT 1,
      points NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_exam_questions_exam_question UNIQUE (exam_id, question_id),
      CONSTRAINT uq_exam_questions_exam_order UNIQUE (exam_id, display_order)
    );

    CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON exam_questions (exam_id);

    -- 2. Add direct question pool reference to exams (optional quick-pool selection)
    ALTER TABLE exams
      ADD COLUMN IF NOT EXISTS pool_id UUID REFERENCES topics(topic_id) ON DELETE SET NULL;

    -- 3. Migrate existing exam questions from exam_topic_rules if present
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'exam_topic_rules') THEN
        INSERT INTO exam_questions (exam_id, question_id, display_order, points)
        SELECT 
          etr.exam_id, 
          q.question_id, 
          ROW_NUMBER() OVER (PARTITION BY etr.exam_id ORDER BY q.created_at, q.question_id),
          COALESCE(etr.points_per_question, q.default_points, 1.00)
        FROM exam_topic_rules etr
        JOIN questions q ON q.topic_id = etr.topic_id
        ON CONFLICT (exam_id, question_id) DO NOTHING;

        -- Drop the complex topic rules table
        DROP TABLE exam_topic_rules CASCADE;
      END IF;
    END $$;
  `);
}

export async function down(pgm) {
  pgm.sql(`
    -- Recreate exam_topic_rules for rollback
    CREATE TABLE IF NOT EXISTS exam_topic_rules (
      rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exam_id UUID NOT NULL REFERENCES exams(exam_id) ON DELETE CASCADE,
      topic_id UUID NOT NULL REFERENCES topics(topic_id) ON DELETE RESTRICT,
      question_count INT NOT NULL DEFAULT 1 CHECK (question_count > 0),
      points_per_question NUMERIC(6, 2) NOT NULL DEFAULT 1.00 CHECK (points_per_question > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (exam_id, topic_id)
    );

    DROP TABLE IF EXISTS exam_questions CASCADE;
    ALTER TABLE exams DROP COLUMN IF EXISTS pool_id;
  `);
}
