/**
 * Migration 018: Complete User & Account Administration
 * Implements Phase 23 database schema:
 * - 4-state account lifecycle ('ACTIVE', 'LOCKED', 'SUSPENDED', 'DISABLED')
 * - 5 authoritative roles ('STUDENT', 'FACULTY', 'INVIGILATOR', 'ADMIN', 'DEVELOPER')
 * - Verification status ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED')
 * - Credential governance ('must_change_password')
 * - Minimal initial profile provisioning (nullable dept/semester/designation)
 * - Institutional configuration table ('organization_settings')
 */

export async function up(pgm) {
  pgm.sql(`
    -- 1. Allow minimal initial provisioning for student_profiles
    ALTER TABLE student_profiles ALTER COLUMN department DROP NOT NULL;
    ALTER TABLE student_profiles ALTER COLUMN semester DROP NOT NULL;

    -- 2. Allow minimal initial provisioning for faculty_profiles
    ALTER TABLE faculty_profiles ALTER COLUMN department DROP NOT NULL;
    ALTER TABLE faculty_profiles ALTER COLUMN designation DROP NOT NULL;

    -- 3. Update users.status check constraint to support 4 authoritative states
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN (
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'users'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status%'
      ) LOOP
        EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(r.conname);
      END LOOP;
    END $$;

    ALTER TABLE users ADD CONSTRAINT users_status_check
      CHECK (status IN ('ACTIVE', 'LOCKED', 'SUSPENDED', 'DISABLED'));

    -- 4. Update user_roles.role check constraint to support 5 authoritative roles
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN (
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'user_roles'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%role%'
      ) LOOP
        EXECUTE 'ALTER TABLE user_roles DROP CONSTRAINT ' || quote_ident(r.conname);
      END LOOP;
    END $$;

    ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
      CHECK (role IN ('STUDENT', 'FACULTY', 'INVIGILATOR', 'ADMIN', 'DEVELOPER'));

    -- 5. Add credential governance and verification tracking columns to users
    ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED'
      CHECK (verification_status IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'));
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_notes TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_updated_at TIMESTAMPTZ;

    -- 6. Create organization_settings table
    CREATE TABLE IF NOT EXISTS organization_settings (
      setting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      institution_name VARCHAR(255) NOT NULL DEFAULT 'ProctorNet University',
      support_email VARCHAR(255) NOT NULL DEFAULT 'admin@proctornet.edu',
      allowed_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      password_policy JSONB NOT NULL DEFAULT '{"minLength": 8, "requireUppercase": true, "requireLowercase": true, "requireNumber": true, "requireSpecial": true, "maxFailedAttempts": 5, "lockoutDurationMinutes": 15}'::jsonb,
      session_policy JSONB NOT NULL DEFAULT '{"accessTokenTtlMinutes": 15, "refreshTokenTtlDays": 7, "enforceSingleActiveSession": false}'::jsonb,
      feature_flags JSONB NOT NULL DEFAULT '{"allowSelfRegistration": false, "requireVerificationBeforeExam": true}'::jsonb,
      updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Seed default institutional configuration if table is empty
    INSERT INTO organization_settings (institution_name, support_email, feature_flags)
    SELECT 'ProctorNet University', 'admin@proctornet.edu', '{"allowSelfRegistration": false, "requireVerificationBeforeExam": true}'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM organization_settings);

    -- 7. Performance and filtering indexes
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_users_verification_status ON users(verification_status);
    CREATE INDEX IF NOT EXISTS idx_users_created_at_desc ON users(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_users_name_lower ON users (LOWER(name));
    CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
    CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_user_roles_role;
    DROP INDEX IF EXISTS idx_users_email_lower;
    DROP INDEX IF EXISTS idx_users_name_lower;
    DROP INDEX IF EXISTS idx_users_created_at_desc;
    DROP INDEX IF EXISTS idx_users_verification_status;
    DROP INDEX IF EXISTS idx_users_status;

    DROP TABLE IF EXISTS organization_settings;

    ALTER TABLE users DROP COLUMN IF EXISTS verification_updated_at;
    ALTER TABLE users DROP COLUMN IF EXISTS verification_notes;
    ALTER TABLE users DROP COLUMN IF EXISTS verification_status;
    ALTER TABLE users DROP COLUMN IF EXISTS status_updated_at;
    ALTER TABLE users DROP COLUMN IF EXISTS status_reason;
    ALTER TABLE users DROP COLUMN IF EXISTS must_change_password;

    -- Revert role check constraint
    ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
    ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
      CHECK (role IN ('STUDENT', 'FACULTY', 'INVIGILATOR', 'ADMIN'));

    -- Revert status check constraint
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
    ALTER TABLE users ADD CONSTRAINT users_status_check
      CHECK (status IN ('ACTIVE', 'LOCKED', 'DISABLED'));

    ALTER TABLE faculty_profiles ALTER COLUMN designation SET NOT NULL;
    ALTER TABLE faculty_profiles ALTER COLUMN department SET NOT NULL;
    ALTER TABLE student_profiles ALTER COLUMN semester SET NOT NULL;
    ALTER TABLE student_profiles ALTER COLUMN department SET NOT NULL;
  `);
}
