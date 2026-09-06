/**
 * Migration 009: Violation Events, Results, Audit Logs
 */
export async function up(pgm) {
  pgm.sql(`
    -- Violation Events table
    CREATE TABLE IF NOT EXISTS violation_events (
      violation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id UUID NOT NULL REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
      event_type VARCHAR(64) NOT NULL,
      severity VARCHAR(32) NOT NULL DEFAULT 'LOW' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      server_timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      evidence_object_key TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Results table (One final result per attempt)
    CREATE TABLE IF NOT EXISTS results (
      result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id UUID NOT NULL REFERENCES exam_attempts(attempt_id) ON DELETE RESTRICT,
      score NUMERIC(6, 2) NOT NULL CHECK (score >= 0),
      correct_count INT NOT NULL CHECK (correct_count >= 0),
      wrong_count INT NOT NULL CHECK (wrong_count >= 0),
      unanswered_count INT NOT NULL CHECK (unanswered_count >= 0),
      evaluated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_attempt_result UNIQUE (attempt_id)
    );

    -- Audit Logs table (Immutable security and operational trail)
    CREATE TABLE IF NOT EXISTS audit_logs (
      audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
      action VARCHAR(128) NOT NULL,
      resource_type VARCHAR(128) NOT NULL,
      resource_id VARCHAR(128) NOT NULL,
      attempt_id UUID REFERENCES exam_attempts(attempt_id) ON DELETE SET NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      request_id VARCHAR(128),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS audit_logs;
    DROP TABLE IF EXISTS results;
    DROP TABLE IF EXISTS violation_events;
  `);
}
