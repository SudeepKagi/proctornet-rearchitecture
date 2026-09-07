/**
 * Migration 013: Transactional Outbox & Submission Idempotency
 * Conforms to Step 13.5 and Step 13.7 architectural specifications.
 */
export async function up(pgm) {
  pgm.sql(`
    -- Transactional Outbox Events table
    CREATE TABLE IF NOT EXISTS outbox_events (
      event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      aggregate_type VARCHAR(64) NOT NULL,
      aggregate_id UUID NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'PENDING' 
        CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED')),
      retry_count INT NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
      max_retries INT NOT NULL DEFAULT 5 CHECK (max_retries >= 0),
      next_retry_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_events_pending_claim 
      ON outbox_events (status, next_retry_at, created_at) 
      WHERE status IN ('PENDING', 'FAILED');

    CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate 
      ON outbox_events (aggregate_type, aggregate_id);

    CREATE INDEX IF NOT EXISTS idx_outbox_events_stale_processing 
      ON outbox_events (status, updated_at) 
      WHERE status = 'PROCESSING';

    -- Submission Idempotency table
    CREATE TABLE IF NOT EXISTS submission_idempotency (
      attempt_id UUID PRIMARY KEY REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
      idempotency_key VARCHAR(255) NOT NULL,
      user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      request_fingerprint VARCHAR(64) NOT NULL,
      response_status INT NOT NULL DEFAULT 200,
      response_payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_submission_idempotency_user_key 
      ON submission_idempotency (user_id, idempotency_key);
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS submission_idempotency;
    DROP TABLE IF EXISTS outbox_events;
  `);
}
