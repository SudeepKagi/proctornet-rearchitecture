/**
 * Migration 024: Drop Orphaned Legacy Tables
 * Safely removes unused tables from early prototypes:
 * - question_generation_jobs
 * - source_documents
 * - exam_topic_rules (if still present)
 */

export async function up(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS question_generation_jobs CASCADE;
    DROP TABLE IF EXISTS source_documents CASCADE;
    DROP TABLE IF EXISTS exam_topic_rules CASCADE;
  `);
}

export async function down(pgm) {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS source_documents (
      document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      source_type VARCHAR(64) NOT NULL,
      file_object_key TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS question_generation_jobs (
      job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID REFERENCES source_documents(document_id) ON DELETE SET NULL,
      topic_id UUID REFERENCES topics(topic_id) ON DELETE SET NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
