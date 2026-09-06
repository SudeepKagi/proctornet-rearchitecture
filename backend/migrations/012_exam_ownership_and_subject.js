/**
 * Migration 012: Exam Ownership and Subject Association
 */
export async function up(pgm) {
  pgm.sql(`
    -- Add created_by and subject_id to exams table
    ALTER TABLE exams ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(user_id) ON DELETE RESTRICT;
    ALTER TABLE exams ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(subject_id) ON DELETE RESTRICT;

    -- Indexes for exam ownership, subject filtering, and status lookups
    CREATE INDEX IF NOT EXISTS idx_exams_created_by ON exams(created_by);
    CREATE INDEX IF NOT EXISTS idx_exams_subject_id ON exams(subject_id);
    CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_exams_status;
    DROP INDEX IF EXISTS idx_exams_subject_id;
    DROP INDEX IF EXISTS idx_exams_created_by;
    ALTER TABLE exams DROP COLUMN IF EXISTS subject_id;
    ALTER TABLE exams DROP COLUMN IF EXISTS created_by;
  `);
}
