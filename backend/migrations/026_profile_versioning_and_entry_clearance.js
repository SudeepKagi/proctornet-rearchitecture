/**
 * Migration 026: Candidate Profile Versioning, Biometric Template Versioning & Exam Entry Clearance
 * 
 * Implements:
 * 1. OCC version column on users and student_profiles.
 * 2. Allow PENDING_REVIEW on users.verification_status.
 * 3. Versioned face_biometrics with single active template invariant (partial unique index).
 * 4. exam_entry_clearances table with partial unique index for single unconsumed clearance per (session_id, student_id).
 */

export async function up(pgm) {
  pgm.sql(`
    -- 1. Add version column for OCC concurrency control
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

    ALTER TABLE student_profiles
      ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

    -- Update verification_status check constraint to include PENDING_REVIEW
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_verification_status_check;
    ALTER TABLE users ADD CONSTRAINT users_verification_status_check
      CHECK (verification_status IN ('UNVERIFIED', 'PENDING', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED'));

    -- 2. Enhance face_biometrics for non-destructive versioned reference templates
    ALTER TABLE face_biometrics
      ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

    -- Normalize existing face_biometrics rows so at most one active template exists per user
    WITH ranked_biometrics AS (
      SELECT
        biometric_id,
        user_id,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rank_order
      FROM face_biometrics
    )
    UPDATE face_biometrics fb
    SET
      is_active = (rb.rank_order = 1 AND fb.enrollment_status = 'ENROLLED'),
      superseded_at = CASE WHEN (rb.rank_order > 1 OR fb.enrollment_status != 'ENROLLED') THEN CURRENT_TIMESTAMP ELSE NULL END
    FROM ranked_biometrics rb
    WHERE fb.biometric_id = rb.biometric_id;

    -- Partial unique index ensuring exactly one active biometric template per user
    CREATE UNIQUE INDEX IF NOT EXISTS idx_face_biometrics_user_active
      ON face_biometrics(user_id)
      WHERE is_active = TRUE;

    -- Index for querying template versions by user
    CREATE INDEX IF NOT EXISTS idx_face_biometrics_user_version
      ON face_biometrics(user_id, version DESC);

    -- 3. Exam Entry Clearances Gate Table
    CREATE TABLE IF NOT EXISTS exam_entry_clearances (
      clearance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES exam_sessions(session_id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      screen_share_at TIMESTAMPTZ,
      liveness_passed BOOLEAN NOT NULL DEFAULT FALSE,
      face_verified_at TIMESTAMPTZ,
      face_score NUMERIC(5, 4),
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Partial unique index: at most one unconsumed clearance per (session_id, student_id)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_entry_clearance_unconsumed
      ON exam_entry_clearances(session_id, student_id)
      WHERE consumed_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_exam_entry_clearance_lookup
      ON exam_entry_clearances(session_id, student_id, expires_at);
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_exam_entry_clearance_lookup;
    DROP INDEX IF EXISTS idx_exam_entry_clearance_unconsumed;
    DROP TABLE IF EXISTS exam_entry_clearances;

    DROP INDEX IF EXISTS idx_face_biometrics_user_version;
    DROP INDEX IF EXISTS idx_face_biometrics_user_active;

    ALTER TABLE face_biometrics
      DROP COLUMN IF EXISTS superseded_at,
      DROP COLUMN IF EXISTS is_active,
      DROP COLUMN IF EXISTS version;

    -- Revert check constraint
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_verification_status_check;
    ALTER TABLE users ADD CONSTRAINT users_verification_status_check
      CHECK (verification_status IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'));

    ALTER TABLE student_profiles
      DROP COLUMN IF EXISTS version;

    ALTER TABLE users
      DROP COLUMN IF EXISTS version;
  `);
}
