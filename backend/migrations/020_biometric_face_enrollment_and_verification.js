/**
 * Migration 020: Biometric Identity — Face Enrollment, Verification & Anti-Spoofing
 * Implements Phase 25 database schema:
 * - face_biometrics (reference face embeddings, 128-d contract, quality scores, S3 keys)
 * - liveness_challenges (ephemeral nonces, expected actions, media keys, consumption state)
 * - biometric_verifications (pre-exam verification verdicts, similarity scores, attempt counts, overrides)
 * - Optimized lookup and audit indexes
 */

export async function up(pgm) {
  pgm.sql(`
    -- 1. Reference Face Biometrics Table
    CREATE TABLE IF NOT EXISTS face_biometrics (
      biometric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      embedding JSONB CHECK (embedding IS NULL OR jsonb_typeof(embedding) = 'array'),
      embedding_dimension INT CHECK (embedding_dimension IS NULL OR embedding_dimension = 128),
      enrollment_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_UPLOAD'
        CHECK (enrollment_status IN ('PENDING_UPLOAD', 'PENDING_EXTRACTION', 'ENROLLED', 'REJECTED', 'SUPERSEDED', 'REVOKED', 'UPLOAD_EXPIRED')),
      quality_score NUMERIC(4, 3) CHECK (quality_score IS NULL OR (quality_score >= 0.000 AND quality_score <= 1.000)),
      pose_pitch NUMERIC(5, 2),
      pose_yaw NUMERIC(5, 2),
      pose_roll NUMERIC(5, 2),
      sharpness_score NUMERIC(7, 2),
      illumination_score NUMERIC(4, 3),
      s3_bucket VARCHAR(128) NOT NULL,
      s3_key VARCHAR(512) NOT NULL UNIQUE,
      mime_type VARCHAR(64) NOT NULL
        CHECK (mime_type IN ('image/jpeg', 'image/png')),
      byte_size INT NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
      model_version VARCHAR(64) NOT NULL,
      raw_image_purged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Liveness Challenges Table
    CREATE TABLE IF NOT EXISTS liveness_challenges (
      challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      session_id UUID NOT NULL REFERENCES exam_sessions(session_id) ON DELETE CASCADE,
      challenge_type VARCHAR(32) NOT NULL DEFAULT 'SEQUENCE'
        CHECK (challenge_type IN ('SEQUENCE', 'HEAD_TURN', 'BLINK', 'SMILE')),
      expected_actions JSONB NOT NULL,
      nonce VARCHAR(64) NOT NULL UNIQUE,
      status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PASSED', 'FAILED', 'EXPIRED')),
      expires_at TIMESTAMPTZ NOT NULL,
      live_media_s3_bucket VARCHAR(128),
      live_media_s3_key VARCHAR(512),
      live_media_version_id VARCHAR(256),
      live_media_consumed BOOLEAN NOT NULL DEFAULT FALSE,
      passive_texture_score NUMERIC(4, 3),
      active_action_score NUMERIC(4, 3),
      verified_at TIMESTAMPTZ,
      frames_purged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Biometric Verifications Table
    CREATE TABLE IF NOT EXISTS biometric_verifications (
      verification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES exam_sessions(session_id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      biometric_reference_id UUID REFERENCES face_biometrics(biometric_id) ON DELETE SET NULL,
      challenge_id UUID REFERENCES liveness_challenges(challenge_id) ON DELETE SET NULL,
      live_image_s3_key VARCHAR(512),
      live_image_version_id VARCHAR(256),
      similarity_score NUMERIC(5, 4),
      threshold_applied NUMERIC(5, 4) NOT NULL DEFAULT 0.8500,
      match_verdict VARCHAR(32) NOT NULL DEFAULT 'MISMATCH'
        CHECK (match_verdict IN ('MATCHED', 'MISMATCH', 'INDETERMINATE', 'EXTRACTION_FAILED')),
      liveness_verdict VARCHAR(32) NOT NULL DEFAULT 'FAILED'
        CHECK (liveness_verdict IN ('PASSED', 'FAILED', 'EXPIRED', 'BYPASSED_EXEMPTION')),
      final_status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
        CHECK (final_status IN ('PENDING', 'VERIFIED', 'FAILED', 'LOCKED', 'OVERRIDDEN', 'EXEMPTED')),
      attempt_number INT NOT NULL DEFAULT 1 CHECK (attempt_number >= 1 AND attempt_number <= 3),
      override_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
      override_reason TEXT,
      live_image_purged_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. Indexes for Optimized Lookups & Concurrency
    CREATE INDEX IF NOT EXISTS idx_face_biometrics_user_status ON face_biometrics(user_id, enrollment_status);
    CREATE INDEX IF NOT EXISTS idx_liveness_challenges_nonce ON liveness_challenges(nonce);
    CREATE INDEX IF NOT EXISTS idx_liveness_challenges_user_session ON liveness_challenges(user_id, session_id, status);
    CREATE INDEX IF NOT EXISTS idx_biometric_verifications_session_user ON biometric_verifications(session_id, user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_biometric_verifications_status ON biometric_verifications(final_status);
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_biometric_verifications_status;
    DROP INDEX IF EXISTS idx_biometric_verifications_session_user;
    DROP INDEX IF EXISTS idx_liveness_challenges_user_session;
    DROP INDEX IF EXISTS idx_liveness_challenges_nonce;
    DROP INDEX IF EXISTS idx_face_biometrics_user_status;

    DROP TABLE IF EXISTS biometric_verifications;
    DROP TABLE IF EXISTS liveness_challenges;
    DROP TABLE IF EXISTS face_biometrics;
  `);
}
