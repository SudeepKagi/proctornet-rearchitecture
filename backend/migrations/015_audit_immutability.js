/**
 * Migration 015: Audit Immutability Triggers and Indexes
 * Implements Phase 13 append-only immutability for audit_logs.
 * Strictly blocks UPDATE, DELETE, and TRUNCATE with SQLSTATE 20000.
 */
export async function up(pgm) {
  pgm.sql(`
    -- Immutability enforcement function
    CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'Audit logs are immutable. UPDATE, DELETE, and TRUNCATE operations are strictly prohibited.'
      USING ERRCODE = '20000';
    END;
    $$ LANGUAGE plpgsql;

    -- 1. Row-level protection against UPDATE and DELETE
    DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
    CREATE TRIGGER trg_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_mutation();

    -- 2. Statement-level protection against TRUNCATE
    DROP TRIGGER IF EXISTS trg_audit_logs_truncate ON audit_logs;
    CREATE TRIGGER trg_audit_logs_truncate
    BEFORE TRUNCATE ON audit_logs
    FOR EACH STATEMENT
    EXECUTE FUNCTION prevent_audit_log_mutation();

    -- Additional query-driven indexes for global temporal scanning and action filtering
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action_timestamp ON audit_logs(action, timestamp DESC);
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_audit_logs_truncate ON audit_logs;
    DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
    DROP FUNCTION IF EXISTS prevent_audit_log_mutation();
    DROP INDEX IF EXISTS idx_audit_logs_action_timestamp;
    DROP INDEX IF EXISTS idx_audit_logs_timestamp;
  `);
}
