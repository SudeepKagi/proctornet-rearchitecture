/**
 * Migration 001: Extensions
 * Enables pgcrypto for gen_random_uuid() support in PostgreSQL.
 */
export async function up(pgm) {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  `);
}

export async function down(pgm) {
  pgm.sql(`
    -- Extension drop omitted intentionally to avoid breaking dependent objects
  `);
}
