/**
 * Migration 005: Source Documents and Question Generation Jobs
 */
export async function up(pgm) {
  pgm.sql(`
    -- Source Documents table
    CREATE TABLE IF NOT EXISTS source_documents (
      document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      source_type VARCHAR(64) NOT NULL,
      file_object_key VARCHAR(512) NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Question Generation Jobs table
    CREATE TABLE IF NOT EXISTS question_generation_jobs (
      job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID REFERENCES source_documents(document_id) ON DELETE SET NULL,
      topic_id UUID REFERENCES topics(topic_id) ON DELETE SET NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS question_generation_jobs;
    DROP TABLE IF EXISTS source_documents;
  `);
}
