/**
 * Migration 014: Results Publication and Visibility
 * Implements Phase 9 Results release policies, scheduled release timestamps,
 * and explicit publication metadata on exams.
 */
export async function up(pgm) {
  pgm.sql(`
    -- Add release policy and publication columns to exams
    ALTER TABLE exams
      ADD COLUMN IF NOT EXISTS results_release_policy VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
      ADD COLUMN IF NOT EXISTS results_release_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS results_published_at TIMESTAMPTZ;

    -- Enforce release policy enum check
    ALTER TABLE exams
      ADD CONSTRAINT check_exam_results_release_policy
      CHECK (results_release_policy IN ('IMMEDIATE', 'SCHEDULED', 'MANUAL'));

    -- Enforce release policy consistency
    ALTER TABLE exams
      ADD CONSTRAINT check_exam_release_policy_consistency
      CHECK (
        (results_release_policy = 'SCHEDULED' AND results_release_at IS NOT NULL)
        OR
        (results_release_policy IN ('IMMEDIATE', 'MANUAL') AND results_release_at IS NULL)
      );
  `);
}

export async function down(pgm) {
  pgm.sql(`
    ALTER TABLE exams
      DROP CONSTRAINT IF EXISTS check_exam_release_policy_consistency,
      DROP CONSTRAINT IF EXISTS check_exam_results_release_policy,
      DROP COLUMN IF EXISTS results_published_at,
      DROP COLUMN IF EXISTS results_release_at,
      DROP COLUMN IF EXISTS results_release_policy;
  `);
}
