/**
 * Migration 029: Account Flow and Photo Approval Enhancements
 *
 * 1. Makes users.name nullable with default '' to support administrative user creation
 *    with only email + identifier (USN or Employee ID).
 * 2. Adds pending photo verification columns to student_profiles to route photo updates
 *    through administrator approval review without silently swapping the trusted reference.
 */

export async function up(pgm) {
  pgm.sql(`
    -- 1. Allow minimal user provisioning without name at creation time
    ALTER TABLE users ALTER COLUMN name DROP NOT NULL;
    ALTER TABLE users ALTER COLUMN name SET DEFAULT '';

    -- 2. Add pending photo verification columns to student_profiles
    ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS pending_face_photo_url TEXT;
    ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS pending_college_id_url TEXT;
    ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS photo_review_status VARCHAR(32) DEFAULT 'APPROVED';

    -- 3. Ensure check constraint for photo review status
    ALTER TABLE student_profiles DROP CONSTRAINT IF EXISTS check_student_photo_review_status;
    ALTER TABLE student_profiles ADD CONSTRAINT check_student_photo_review_status
      CHECK (photo_review_status IN ('NONE', 'PENDING', 'APPROVED', 'REJECTED'));
  `);
}

export async function down(pgm) {
  pgm.sql(`
    ALTER TABLE student_profiles DROP CONSTRAINT IF EXISTS check_student_photo_review_status;
    ALTER TABLE student_profiles DROP COLUMN IF EXISTS photo_review_status;
    ALTER TABLE student_profiles DROP COLUMN IF EXISTS pending_college_id_url;
    ALTER TABLE student_profiles DROP COLUMN IF EXISTS pending_face_photo_url;
    ALTER TABLE users ALTER COLUMN name DROP DEFAULT;
    UPDATE users SET name = 'User' WHERE name IS NULL OR name = '';
    ALTER TABLE users ALTER COLUMN name SET NOT NULL;
  `);
}
