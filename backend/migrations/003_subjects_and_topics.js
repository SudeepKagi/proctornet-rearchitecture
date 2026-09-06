/**
 * Migration 003: Subjects and Topics
 */
export async function up(pgm) {
  pgm.sql(`
    -- Subjects table
    CREATE TABLE IF NOT EXISTS subjects (
      subject_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Topics table
    CREATE TABLE IF NOT EXISTS topics (
      topic_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subject_id UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE RESTRICT,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (subject_id, name)
    );
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS topics;
    DROP TABLE IF EXISTS subjects;
  `);
}
