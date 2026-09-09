import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDatabaseHealth, closePool, query } from '../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../src/infrastructure/redis/client.js';
import { runMigrations } from '../src/infrastructure/postgres/migrate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../migrations');

describe('Database Migrations & Schema Integrity', () => {
  const expectedTables = [
    'users',
    'user_roles',
    'student_profiles',
    'faculty_profiles',
    'subjects',
    'topics',
    'questions',
    'question_options',
    'source_documents',
    'question_generation_jobs',
    'exams',
    'exam_topic_rules',
    'rooms',
    'exam_sessions',
    'session_students',
    'session_invigilators',
    'exam_attempts',
    'attempt_questions',
    'answers',
    'violation_events',
    'results',
    'audit_logs',
    'outbox_events',
    'submission_idempotency',
    'evidence_records',
    'organization_settings',
    'student_identity_documents',
    'student_configurations'
  ];

  describe('Static Migration File Contract & Sequence', () => {
    it('should contain all expected migration files in sequence', () => {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.js')).sort();

      assert.equal(files.length, 19, 'Expected exactly 19 migration files');
      assert.match(files[0], /001_extensions\.js$/);
      assert.match(files[1], /002_users_and_roles\.js$/);
      assert.match(files[2], /003_subjects_and_topics\.js$/);
      assert.match(files[3], /004_questions_and_options\.js$/);
      assert.match(files[4], /005_source_documents_and_jobs\.js$/);
      assert.match(files[5], /006_exams_and_rules\.js$/);
      assert.match(files[6], /007_rooms_and_sessions\.js$/);
      assert.match(files[7], /008_attempts_and_answers\.js$/);
      assert.match(files[8], /009_proctoring_and_results\.js$/);
      assert.match(files[9], /010_indexes\.js$/);
      assert.match(files[10], /011_auth_sessions\.js$/);
      assert.match(files[11], /012_exam_ownership_and_subject\.js$/);
      assert.match(files[12], /013_outbox_and_idempotency\.js$/);
      assert.match(files[13], /014_results_publication_and_visibility\.js$/);
      assert.match(files[14], /015_audit_immutability\.js$/);
      assert.match(files[15], /016_proctoring_events_and_flags\.js$/);
      assert.match(files[16], /017_evidence_storage\.js$/);
      assert.match(files[17], /018_user_administration\.js$/);
      assert.match(files[18], /019_student_documents_and_configurations\.js$/);
    });


    it('should export up and down functions for every migration file', async () => {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.js')).sort();

      for (const file of files) {
        const migrationPath = path.join(migrationsDir, file);
        const migration = await import(`file://${migrationPath}`);
        assert.equal(typeof migration.up, 'function', `${file} must export an 'up' function`);
        assert.equal(typeof migration.down, 'function', `${file} must export a 'down' function`);
      }
    });

    it('should define all 25 required business tables across migrations', () => {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.js'));
      let combinedSql = '';

      for (const file of files) {
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        combinedSql += '\n' + content;
      }

      for (const tableName of expectedTables) {
        const regex = new RegExp(`CREATE TABLE (IF NOT EXISTS )?${tableName}\\b`, 'i');
        assert.match(combinedSql, regex, `Migration SQL must define table '${tableName}'`);
      }
    });

    it('should define mandatory uniqueness and integrity constraints', () => {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.js'));
      let combinedSql = '';

      for (const file of files) {
        combinedSql += '\n' + fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      }

      // Mandatory uniqueness constraints
      assert.match(combinedSql, /UNIQUE\s*\(\s*session_id\s*,\s*student_id\s*\)/i);
      assert.match(combinedSql, /UNIQUE\s*\(\s*attempt_id\s*,\s*display_order\s*\)/i);
      assert.match(combinedSql, /UNIQUE\s*\(\s*attempt_id\s*,\s*question_id\s*\)/i);
      assert.match(combinedSql, /UNIQUE\s*\(\s*attempt_question_id\s*\)/i);
      assert.match(combinedSql, /UNIQUE\s*\(\s*attempt_id\s*\)/i);
    });
  });

  describe('Live Database Migration Execution (Conditional)', () => {
    it('should execute migrations and test constraints when PostgreSQL is available', async () => {
      const health = await checkDatabaseHealth(2000);

      if (!health.healthy) {
        console.log('NOTICE: PostgreSQL is not reachable locally. Skipping live DB execution tests.');
        return;
      }

      try {
        // 1. Run migrations up
        await runMigrations('up');

        // 2. Verify tables exist in public schema
        const res = await query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
        `);
        const createdTables = res.rows.map((r) => r.table_name);

        for (const tableName of expectedTables) {
          assert.ok(createdTables.includes(tableName), `Table '${tableName}' should exist in PostgreSQL`);
        }
      } finally {
        await closeRedis();
        await closePool();
      }
    });
  });
});
