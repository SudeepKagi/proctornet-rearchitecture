/**
 * Migration 022: Faculty Portal Enhancements
 * Adds targeting fields to exams and exam_sessions, and enhances topics for faculty topic-based question pools.
 */
export async function up(pgm) {
  pgm.sql(`
    -- Add targeting and scheduling columns to exams
    ALTER TABLE exams
      ADD COLUMN IF NOT EXISTS target_semester INT CHECK (target_semester >= 1 AND target_semester <= 12),
      ADD COLUMN IF NOT EXISTS target_department VARCHAR(128),
      ADD COLUMN IF NOT EXISTS scheduled_start_time TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS scheduled_end_time TIMESTAMPTZ;

    -- Add targeting columns to exam_sessions for direct session filtering
    ALTER TABLE exam_sessions
      ADD COLUMN IF NOT EXISTS target_semester INT CHECK (target_semester >= 1 AND target_semester <= 12),
      ADD COLUMN IF NOT EXISTS target_department VARCHAR(128);

    -- Make subject_id in topics optional so faculty can create custom topic pools
    ALTER TABLE topics
      ALTER COLUMN subject_id DROP NOT NULL;

    -- Add ownership and sharing to topics
    ALTER TABLE topics
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false;

    -- Indexes for efficient audience targeting and querying
    CREATE INDEX IF NOT EXISTS idx_exams_targeting ON exams (target_semester, target_department);
    CREATE INDEX IF NOT EXISTS idx_exam_sessions_targeting ON exam_sessions (target_semester, target_department);
    CREATE INDEX IF NOT EXISTS idx_topics_created_by ON topics (created_by);
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_topics_created_by;
    DROP INDEX IF EXISTS idx_exam_sessions_targeting;
    DROP INDEX IF EXISTS idx_exams_targeting;

    ALTER TABLE topics
      DROP COLUMN IF EXISTS is_shared,
      DROP COLUMN IF EXISTS created_by;

    ALTER TABLE exam_sessions
      DROP COLUMN IF EXISTS target_department,
      DROP COLUMN IF EXISTS target_semester;

    ALTER TABLE exams
      DROP COLUMN IF EXISTS scheduled_end_time,
      DROP COLUMN IF EXISTS scheduled_start_time,
      DROP COLUMN IF EXISTS target_department,
      DROP COLUMN IF EXISTS target_semester;
  `);
}
