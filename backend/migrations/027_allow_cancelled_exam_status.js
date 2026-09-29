/**
 * Migration 027: Allow CANCELLED status on exams table
 */

export async function up(pgm) {
  pgm.sql(`
    ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_status_check;
    ALTER TABLE exams ADD CONSTRAINT exams_status_check
      CHECK (status IN ('DRAFT', 'PUBLISHED', 'SCHEDULED', 'LIVE', 'ENDED', 'EVALUATED', 'RESULT_PUBLISHED', 'CANCELLED'));
  `);
}

export async function down(pgm) {
  pgm.sql(`
    ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_status_check;
    ALTER TABLE exams ADD CONSTRAINT exams_status_check
      CHECK (status IN ('DRAFT', 'PUBLISHED', 'SCHEDULED', 'LIVE', 'ENDED', 'EVALUATED', 'RESULT_PUBLISHED'));
  `);
}
