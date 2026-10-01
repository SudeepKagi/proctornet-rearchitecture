/**
 * Migration 028: Simplify Schema for ProctorNet Overhaul
 *
 * This migration:
 * 1. Drops unused/over-engineered tables (question_banks, rooms, etc.)
 * 2. Removes FK dependencies on subjects/topics from exams and questions
 * 3. Adds exam_id directly to questions (questions belong to exams, not topics)
 * 4. Adds subject_name free-text to exams (replaces subject_id FK)
 * 5. Enforces one role per user
 * 6. Simplifies student_profiles and faculty_profiles
 * 7. Cleans up exam_sessions and exam_attempts columns
 */

export async function up(pgm) {
  pgm.sql(`
    -- ============================================================
    -- STEP 1: Drop FK constraints that reference tables we will drop
    -- ============================================================

    -- exams references subjects(subject_id) and topics(topic_id via pool_id)
    ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_subject_id_fkey;
    ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_pool_id_fkey;

    -- questions references topics(topic_id) and question_banks(bank_id)
    ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_topic_id_fkey;
    ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_bank_id_fkey;
    ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_parent_question_id_fkey;

    -- exam_sessions references rooms(room_id)
    ALTER TABLE exam_sessions DROP CONSTRAINT IF EXISTS exam_sessions_room_id_fkey;

    -- ============================================================
    -- STEP 2: Drop unused tables (CASCADE to handle any remaining FKs)
    -- ============================================================

    DROP TABLE IF EXISTS liveness_challenges CASCADE;
    DROP TABLE IF EXISTS biometric_verifications CASCADE;
    DROP TABLE IF EXISTS face_biometrics CASCADE;
    DROP TABLE IF EXISTS manual_grade_audits CASCADE;
    DROP TABLE IF EXISTS manual_grades CASCADE;
    DROP TABLE IF EXISTS exam_analytics_cache CASCADE;
    DROP TABLE IF EXISTS student_configurations CASCADE;
    DROP TABLE IF EXISTS student_identity_documents CASCADE;
    DROP TABLE IF EXISTS organization_settings CASCADE;
    DROP TABLE IF EXISTS submission_idempotency CASCADE;
    DROP TABLE IF EXISTS outbox_events CASCADE;
    DROP TABLE IF EXISTS exam_entry_clearances CASCADE;
    DROP TABLE IF EXISTS question_banks CASCADE;
    DROP TABLE IF EXISTS rooms CASCADE;
    DROP TABLE IF EXISTS session_invigilators CASCADE;
    -- topics depends on subjects, drop topics first
    DROP TABLE IF EXISTS topics CASCADE;
    DROP TABLE IF EXISTS subjects CASCADE;

    -- ============================================================
    -- STEP 3: Modify user_roles — enforce ONE role per user
    -- ============================================================

    -- Drop existing composite PK
    ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_pkey;

    -- Add simple PK on user_id (one role per user)
    ALTER TABLE user_roles ADD PRIMARY KEY (user_id);

    -- Update role check — remove INVIGILATOR
    ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
    ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
      CHECK (role IN ('STUDENT', 'FACULTY', 'ADMIN', 'DEVELOPER'));

    -- Remove any INVIGILATOR rows (convert to FACULTY)
    UPDATE user_roles SET role = 'FACULTY' WHERE role = 'INVIGILATOR';

    -- ============================================================
    -- STEP 4: Simplify exams table
    -- ============================================================

    -- Add subject_name free-text column (replaces FK to subjects)
    ALTER TABLE exams ADD COLUMN IF NOT EXISTS subject_name VARCHAR(255);

    -- Drop columns we don't need
    ALTER TABLE exams DROP COLUMN IF EXISTS subject_id;
    ALTER TABLE exams DROP COLUMN IF EXISTS pool_id;
    ALTER TABLE exams DROP COLUMN IF EXISTS results_release_policy;
    ALTER TABLE exams DROP COLUMN IF EXISTS results_release_at;
    ALTER TABLE exams DROP COLUMN IF EXISTS results_published_at;
    ALTER TABLE exams DROP COLUMN IF EXISTS target_department;

    -- Drop old constraints that referenced removed columns
    ALTER TABLE exams DROP CONSTRAINT IF EXISTS check_exam_results_release_policy;
    ALTER TABLE exams DROP CONSTRAINT IF EXISTS check_exam_release_policy_consistency;

    -- Simplify status values
    ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_status_check;
    ALTER TABLE exams ADD CONSTRAINT exams_status_check
      CHECK (status IN ('DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED'));

    -- ============================================================
    -- STEP 5: Simplify questions — belong to exams directly
    -- ============================================================

    -- Add exam_id FK to questions
    ALTER TABLE questions ADD COLUMN IF NOT EXISTS exam_id UUID REFERENCES exams(exam_id) ON DELETE CASCADE;

    -- Drop unused columns
    ALTER TABLE questions DROP COLUMN IF EXISTS topic_id;
    ALTER TABLE questions DROP COLUMN IF EXISTS bank_id;
    ALTER TABLE questions DROP COLUMN IF EXISTS difficulty;
    ALTER TABLE questions DROP COLUMN IF EXISTS bloom_level;
    ALTER TABLE questions DROP COLUMN IF EXISTS tags;
    ALTER TABLE questions DROP COLUMN IF EXISTS version;
    ALTER TABLE questions DROP COLUMN IF EXISTS parent_question_id;
    ALTER TABLE questions DROP COLUMN IF EXISTS status;
    ALTER TABLE questions DROP COLUMN IF EXISTS rubric;
    ALTER TABLE questions DROP COLUMN IF EXISTS correct_numeric_value;
    ALTER TABLE questions DROP COLUMN IF EXISTS metadata;

    -- Drop old constraints
    ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_question_type_check;
    ALTER TABLE questions DROP CONSTRAINT IF EXISTS check_question_difficulty;
    ALTER TABLE questions DROP CONSTRAINT IF EXISTS check_question_bloom_level;
    ALTER TABLE questions DROP CONSTRAINT IF EXISTS check_question_status;
    ALTER TABLE questions DROP CONSTRAINT IF EXISTS check_question_version;

    -- Only MCQ type
    ALTER TABLE questions ADD CONSTRAINT questions_question_type_check
      CHECK (question_type IN ('MCQ'));

    -- Drop unused indexes
    DROP INDEX IF EXISTS idx_questions_bank;
    DROP INDEX IF EXISTS idx_questions_difficulty;
    DROP INDEX IF EXISTS idx_questions_bloom;

    -- Add index for exam_id lookup
    CREATE INDEX IF NOT EXISTS idx_questions_exam_id ON questions(exam_id);

    -- ============================================================
    -- STEP 6: Simplify exam_sessions
    -- ============================================================

    ALTER TABLE exam_sessions DROP COLUMN IF EXISTS room_id;
    ALTER TABLE exam_sessions DROP COLUMN IF EXISTS target_department;

    -- ============================================================
    -- STEP 7: Simplify exam_attempts
    -- ============================================================

    ALTER TABLE exam_attempts DROP COLUMN IF EXISTS risk_score;
    ALTER TABLE exam_attempts DROP COLUMN IF EXISTS paused_at;
    ALTER TABLE exam_attempts DROP COLUMN IF EXISTS total_paused_ms;
    ALTER TABLE exam_attempts DROP COLUMN IF EXISTS pause_reason;
    ALTER TABLE exam_attempts DROP COLUMN IF EXISTS paused_by_user_id;
    ALTER TABLE exam_attempts DROP COLUMN IF EXISTS termination_reason;
    ALTER TABLE exam_attempts DROP COLUMN IF EXISTS terminated_by_user_id;

    -- Drop and recreate status check without PAUSED
    ALTER TABLE exam_attempts DROP CONSTRAINT IF EXISTS exam_attempts_status_check;
    ALTER TABLE exam_attempts ADD CONSTRAINT exam_attempts_status_check
      CHECK (status IN ('READY', 'ACTIVE', 'SUBMITTED', 'TERMINATED', 'EXPIRED'));

    -- ============================================================
    -- STEP 8: Simplify student_profiles
    -- ============================================================

    -- Rename existing photo columns to simpler names (they already exist)
    -- enrolled_face_photo_url → face_photo_url
    -- id_document_url → college_id_url
    ALTER TABLE student_profiles RENAME COLUMN enrolled_face_photo_url TO face_photo_url;
    ALTER TABLE student_profiles RENAME COLUMN id_document_url TO college_id_url;

    -- Drop metadata and version columns
    ALTER TABLE student_profiles DROP COLUMN IF EXISTS metadata;
    ALTER TABLE student_profiles DROP COLUMN IF EXISTS version;
    ALTER TABLE student_profiles DROP COLUMN IF EXISTS department;

    -- ============================================================
    -- STEP 9: Simplify faculty_profiles
    -- ============================================================

    ALTER TABLE faculty_profiles DROP COLUMN IF EXISTS metadata;
    ALTER TABLE faculty_profiles DROP COLUMN IF EXISTS department;
  `);
}

export async function down(pgm) {
  // This is a destructive simplification — down migration is intentionally minimal.
  // A full rollback would require recreating all dropped tables which is not practical.
  pgm.sql(`
    -- Revert student_profiles column renames
    ALTER TABLE student_profiles RENAME COLUMN face_photo_url TO enrolled_face_photo_url;
    ALTER TABLE student_profiles RENAME COLUMN college_id_url TO id_document_url;

    -- Re-add dropped columns
    ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
    ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS department VARCHAR(128);
    ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS department VARCHAR(128);

    -- Revert user_roles to composite PK
    ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_pkey;
    ALTER TABLE user_roles ADD PRIMARY KEY (user_id, role);

    -- Revert role check to include INVIGILATOR
    ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
    ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
      CHECK (role IN ('STUDENT', 'FACULTY', 'INVIGILATOR', 'ADMIN', 'DEVELOPER'));
  `);
}
