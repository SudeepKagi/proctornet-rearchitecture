/**
 * Migration 017: Evidence Storage Metadata and Lifecycle
 * Implements Phase 15 database schema for proctoring evidence tracking.
 */
export async function up(pgm) {
  pgm.sql(`
    -- 1. Create evidence_records table
    CREATE TABLE IF NOT EXISTS evidence_records (
      evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id UUID NOT NULL REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
      session_id UUID NOT NULL REFERENCES exam_sessions(session_id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      violation_id UUID REFERENCES violation_events(violation_id) ON DELETE SET NULL,
      flag_id UUID REFERENCES violation_flags(flag_id) ON DELETE SET NULL,
      
      -- Evidence classification
      evidence_type VARCHAR(64) NOT NULL CHECK (evidence_type IN ('WEBCAM_SNAPSHOT', 'SCREEN_CAPTURE', 'AUDIO_SNIPPET')),
      
      -- S3 object storage location & verification metadata
      bucket_name VARCHAR(128) NOT NULL,
      object_key VARCHAR(512) NOT NULL UNIQUE,
      s3_version_id VARCHAR(128),
      content_type VARCHAR(128) NOT NULL,
      declared_byte_size INT NOT NULL CHECK (declared_byte_size > 0),
      actual_byte_size INT CHECK (actual_byte_size >= 0),
      sha256_checksum VARCHAR(64) CHECK (sha256_checksum IS NULL OR sha256_checksum ~ '^[a-fA-F0-9]{64}$'),
      
      -- Lifecycle state machine
      status VARCHAR(32) NOT NULL DEFAULT 'INITIATED' 
        CHECK (status IN ('INITIATED', 'AVAILABLE', 'FAILED', 'ABANDONED', 'PURGED')),
      
      -- Time-to-live and retention tracking
      upload_expires_at TIMESTAMPTZ NOT NULL,
      confirmed_at TIMESTAMPTZ,
      retention_expires_at TIMESTAMPTZ,
      claim_expires_at TIMESTAMPTZ,
      
      -- Audit and metadata
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Indexes for efficient lookup, timeline aggregation, and cleanup sweeps
    CREATE INDEX IF NOT EXISTS idx_evidence_records_attempt_status
      ON evidence_records(attempt_id, status);

    CREATE INDEX IF NOT EXISTS idx_evidence_records_session_status
      ON evidence_records(session_id, status);

    CREATE INDEX IF NOT EXISTS idx_evidence_records_violation
      ON evidence_records(violation_id)
      WHERE violation_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_evidence_records_flag
      ON evidence_records(flag_id)
      WHERE flag_id IS NOT NULL;

    -- Index for background retention purge worker (sweep expired available evidence)
    CREATE INDEX IF NOT EXISTS idx_evidence_records_retention_sweep
      ON evidence_records(status, retention_expires_at, claim_expires_at)
      WHERE status = 'AVAILABLE';

    -- Index for background upload timeout worker (sweep unconfirmed abandoned uploads)
    CREATE INDEX IF NOT EXISTS idx_evidence_records_abandoned_sweep
      ON evidence_records(status, upload_expires_at, claim_expires_at)
      WHERE status = 'INITIATED';
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_evidence_records_abandoned_sweep;
    DROP INDEX IF EXISTS idx_evidence_records_retention_sweep;
    DROP INDEX IF EXISTS idx_evidence_records_flag;
    DROP INDEX IF EXISTS idx_evidence_records_violation;
    DROP INDEX IF EXISTS idx_evidence_records_session_status;
    DROP INDEX IF EXISTS idx_evidence_records_attempt_status;
    DROP TABLE IF EXISTS evidence_records;
  `);
}
