import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { checkDatabaseHealth, closePool, query } from '../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../src/infrastructure/redis/client.js';

describe('Phase 26 Migration 021 Schema Verification', () => {
  let dbAvailable = false;

  before(async () => {
    const health = await checkDatabaseHealth(2000);
    dbAvailable = health.healthy;
  });

  after(async () => {
    await closeRedis();
    await closePool();
  });

  it('should have created all new Phase 26 tables in public schema', async () => {
    if (!dbAvailable) return;

    const res = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN (
        'question_banks',
        'manual_grades',
        'manual_grade_audits',
        'proctor_interventions',
        'exam_analytics_cache'
      )
      ORDER BY table_name;
    `);

    const tableNames = res.rows.map(r => r.table_name);
    assert.deepEqual(tableNames, [
      'exam_analytics_cache',
      'manual_grade_audits',
      'manual_grades',
      'proctor_interventions',
      'question_banks'
    ]);
  });

  it('should have extended questions table with Phase 26 columns and type constraints', async () => {
    if (!dbAvailable) return;

    const colRes = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'questions' AND column_name IN (
        'bank_id', 'difficulty', 'bloom_level', 'tags', 'version', 'parent_question_id', 'status', 'rubric'
      );
    `);

    const cols = colRes.rows.map(r => r.column_name);
    assert.ok(cols.includes('bank_id'));
    assert.ok(cols.includes('difficulty'));
    assert.ok(cols.includes('bloom_level'));
    assert.ok(cols.includes('tags'));
    assert.ok(cols.includes('version'));
    assert.ok(cols.includes('parent_question_id'));
    assert.ok(cols.includes('status'));
    assert.ok(cols.includes('rubric'));

    // Check check constraint on questions allows all question types
    const checkRes = await query(`
      SELECT pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'questions' AND c.conname = 'questions_question_type_check';
    `);

    assert.ok(checkRes.rows.length > 0, 'questions_question_type_check should exist');
    const def = checkRes.rows[0].def;
    assert.match(def, /SHORT_ANSWER/);
    assert.match(def, /ESSAY/);
    assert.match(def, /CODE/);
    assert.match(def, /NUMERIC/);
    assert.match(def, /MCQ/);
    assert.match(def, /TRUE_FALSE/);
  });

  it('should have extended exam_attempts with pause/termination columns and status check', async () => {
    if (!dbAvailable) return;

    const colRes = await query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'exam_attempts' AND column_name IN (
        'paused_at', 'total_paused_ms', 'pause_reason', 'paused_by_user_id', 'termination_reason', 'terminated_by_user_id'
      );
    `);

    const cols = colRes.rows.map(r => r.column_name);
    assert.equal(cols.length, 6, 'Should have all 6 new exam_attempts columns');

    const checkRes = await query(`
      SELECT pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'exam_attempts' AND c.conname = 'exam_attempts_status_check';
    `);

    assert.ok(checkRes.rows.length > 0, 'exam_attempts_status_check should exist');
    const def = checkRes.rows[0].def;
    assert.match(def, /PAUSED/);
    assert.match(def, /ACTIVE/);
    assert.match(def, /READY/);
    assert.match(def, /SUBMITTED/);
    assert.match(def, /TIMED_OUT|EXPIRED/);
    assert.match(def, /TERMINATED/);
  });

  it('should have extended exam_topic_rules with difficulty and bloom_level columns', async () => {
    if (!dbAvailable) return;

    const colRes = await query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'exam_topic_rules' AND column_name IN (
        'difficulty', 'bloom_level'
      );
    `);

    const cols = colRes.rows.map(r => r.column_name);
    assert.ok(cols.includes('difficulty'));
    assert.ok(cols.includes('bloom_level'));
  });

  it('should have valid proctor_interventions type constraints', async () => {
    if (!dbAvailable) return;

    const checkRes = await query(`
      SELECT pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'proctor_interventions' AND c.conname = 'proctor_interventions_type_check';
    `);

    assert.ok(checkRes.rows.length > 0);
    const def = checkRes.rows[0].def;
    assert.match(def, /WARNING_MESSAGE/);
    assert.match(def, /PAUSE/);
    assert.match(def, /RESUME/);
    assert.match(def, /TERMINATE/);
    assert.match(def, /ANNOUNCEMENT/);
  });
});
