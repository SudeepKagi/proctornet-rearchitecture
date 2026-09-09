/**
 * Migration 019: Candidate Onboarding, Document Verification & Per-Student Configuration
 * Implements Phase 24 database schema:
 * - student_identity_documents (government/student ID upload metadata, S3 keys, magic byte verification, document review state machine)
 * - student_configurations (per-student accommodations: extra time multiplier, break allowances, assistive tech, proctoring strictness)
 * - Dedicated lookup, filtering, and review queue indexes
 */

export async function up(pgm) {
  pgm.sql(`
    -- 1. Student Identity Documents Table
    CREATE TABLE IF NOT EXISTS student_identity_documents (
      document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      document_type VARCHAR(32) NOT NULL
        CHECK (document_type IN ('PASSPORT', 'NATIONAL_ID', 'DRIVING_LICENSE', 'STUDENT_ID')),
      document_number_hash VARCHAR(64) NOT NULL,
      document_number_last4 VARCHAR(8) NOT NULL,
      full_name_on_document VARCHAR(255) NOT NULL,
      date_of_birth DATE,
      expiry_date DATE,
      issue_country VARCHAR(64),
      s3_bucket VARCHAR(128) NOT NULL,
      s3_key VARCHAR(512) NOT NULL UNIQUE,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(64) NOT NULL
        CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
      byte_size INT NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
      magic_bytes_verified BOOLEAN NOT NULL DEFAULT FALSE,
      verification_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_UPLOAD'
        CHECK (verification_status IN ('PENDING_UPLOAD', 'PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
      reviewer_notes TEXT,
      reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Per-Student Configuration & Accommodations Table
    CREATE TABLE IF NOT EXISTS student_configurations (
      student_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
      extra_time_multiplier NUMERIC(3, 2) NOT NULL DEFAULT 1.00
        CHECK (extra_time_multiplier >= 1.00 AND extra_time_multiplier <= 3.00),
      break_allowance_minutes INT NOT NULL DEFAULT 0
        CHECK (break_allowance_minutes >= 0 AND break_allowance_minutes <= 120),
      max_breaks_allowed INT NOT NULL DEFAULT 0
        CHECK (max_breaks_allowed >= 0 AND max_breaks_allowed <= 10),
      assistive_technology JSONB NOT NULL DEFAULT '{"screenReader": false, "speechToText": false, "keyboardOnly": false}'::jsonb,
      proctoring_strictness VARCHAR(32) NOT NULL DEFAULT 'STANDARD'
        CHECK (proctoring_strictness IN ('STANDARD', 'RELAXED', 'STRICT', 'MEDICAL_EXEMPTION')),
      created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
      updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Indexes for Optimized Lookup and Review Queuing
    CREATE INDEX IF NOT EXISTS idx_student_docs_user_status ON student_identity_documents(user_id, verification_status);
    CREATE INDEX IF NOT EXISTS idx_student_docs_status_submitted ON student_identity_documents(verification_status, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_student_docs_number_hash ON student_identity_documents(document_number_hash);
    CREATE INDEX IF NOT EXISTS idx_student_config_strictness ON student_configurations(proctoring_strictness);
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_student_config_strictness;
    DROP INDEX IF EXISTS idx_student_docs_number_hash;
    DROP INDEX IF EXISTS idx_student_docs_status_submitted;
    DROP INDEX IF EXISTS idx_student_docs_user_status;

    DROP TABLE IF EXISTS student_configurations;
    DROP TABLE IF EXISTS student_identity_documents;
  `);
}
