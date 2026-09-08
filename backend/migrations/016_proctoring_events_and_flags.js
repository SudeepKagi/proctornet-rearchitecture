/**
 * Migration 016: Proctoring Events Extension, Violation Flags, and Risk Score
 * Implements Phase 14 database schema evolution for the Proctoring Control Plane.
 */
export async function up(pgm) {
  pgm.sql(`
    -- 1. Add authoritative proctoring risk score to exam_attempts
    -- (Proctoring anomaly risk only; strictly separate from academic marks/results)
    ALTER TABLE exam_attempts
      ADD COLUMN IF NOT EXISTS risk_score INT NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100);

    -- 2. Extend violation_events for client correlation & idempotency
    ALTER TABLE violation_events
      ADD COLUMN IF NOT EXISTS client_event_id UUID,
      ADD COLUMN IF NOT EXISTS client_timestamp TIMESTAMPTZ;

    -- Standard unique index (PostgreSQL standard semantics permit multiple NULLs while matching ON CONFLICT without predicate mismatch)
    CREATE UNIQUE INDEX IF NOT EXISTS uq_violation_events_attempt_client_event
      ON violation_events(attempt_id, client_event_id);

    -- Query optimization index for attempt timeline scans
    CREATE INDEX IF NOT EXISTS idx_violation_events_attempt_severity_time
      ON violation_events(attempt_id, severity, server_timestamp DESC);

    -- 3. Create violation_flags table
    CREATE TABLE IF NOT EXISTS violation_flags (
      flag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id UUID NOT NULL REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
      session_id UUID NOT NULL REFERENCES exam_sessions(session_id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      flag_type VARCHAR(64) NOT NULL,
      severity VARCHAR(32) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVIEWED', 'DISMISSED')),
      score_delta INT NOT NULL DEFAULT 0, -- Anomaly risk_score_delta; NO academic impact
      raised_by VARCHAR(32) NOT NULL DEFAULT 'SYSTEM' CHECK (raised_by IN ('SYSTEM', 'PROCTOR')),
      reviewer_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_violation_flags_session_status
      ON violation_flags(session_id, status);

    CREATE INDEX IF NOT EXISTS idx_violation_flags_attempt
      ON violation_flags(attempt_id);

    -- Prevent duplicate automated system flags of the same type for the same attempt
    CREATE UNIQUE INDEX IF NOT EXISTS uq_violation_flags_attempt_flag_type
      ON violation_flags(attempt_id, flag_type)
      WHERE raised_by = 'SYSTEM';
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP INDEX IF EXISTS uq_violation_flags_attempt_flag_type;
    DROP INDEX IF EXISTS idx_violation_flags_attempt;
    DROP INDEX IF EXISTS idx_violation_flags_session_status;
    DROP TABLE IF EXISTS violation_flags;
    DROP INDEX IF EXISTS idx_violation_events_attempt_severity_time;
    DROP INDEX IF EXISTS uq_violation_events_attempt_client_event;
    ALTER TABLE violation_events
      DROP COLUMN IF EXISTS client_timestamp,
      DROP COLUMN IF EXISTS client_event_id;
    ALTER TABLE exam_attempts
      DROP COLUMN IF EXISTS risk_score;
  `);
}
