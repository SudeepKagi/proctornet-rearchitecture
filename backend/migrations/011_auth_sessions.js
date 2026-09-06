/**
 * Migration 011: Auth Sessions & Account Lockout Tracking
 * Phase 4 requirement: persistent server-controlled session/refresh state and brute-force tracking.
 */
export async function up(pgm) {
  pgm.sql(`
    -- Add brute-force lockout tracking columns to users
    ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

    -- User Sessions table for server-controlled refresh tokens and revocation
    CREATE TABLE IF NOT EXISTS user_sessions (
      session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      refresh_token_hash VARCHAR(255) NOT NULL UNIQUE,
      user_agent TEXT,
      ip_address VARCHAR(64),
      is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Performance indexes for user session lookups and token verification
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_hash ON user_sessions(refresh_token_hash);
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS user_sessions;
    ALTER TABLE users DROP COLUMN IF EXISTS locked_until;
    ALTER TABLE users DROP COLUMN IF EXISTS failed_login_attempts;
  `);
}
