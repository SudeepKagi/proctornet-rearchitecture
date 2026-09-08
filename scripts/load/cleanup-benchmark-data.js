/**
 * @file cleanup-benchmark-data.js
 * @description Targeted cleanup script for benchmark entities created during load testing.
 *
 * Usage:
 *   node scripts/load/cleanup-benchmark-data.js [--dry-run] [--force]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(new URL('../../backend/package.json', import.meta.url));

const pg = require('pg');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');

const NODE_ENV = process.env.NODE_ENV || 'development';
if (NODE_ENV === 'production' && !isForce) {
  console.error('FATAL: Running cleanup-benchmark-data in production requires --force');
  process.exit(1);
}

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'proctornet',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 5
};

const pool = new pg.Pool(dbConfig);

async function run() {
  const client = await pool.connect();
  console.log(`[Cleanup] Initiating benchmark cleanup (${isDryRun ? 'DRY RUN' : 'ACTIVE DELETE'})...`);

  try {
    if (!isDryRun) {
      await client.query('BEGIN');
    }

    // 1. Identify benchmark users
    const usersRes = await client.query(
      `SELECT user_id FROM users WHERE email LIKE 'bench_%' OR name LIKE 'Bench%';`
    );
    const userIds = usersRes.rows.map(r => r.user_id);

    // 2. Identify benchmark exams
    const examsRes = await client.query(
      `SELECT exam_id FROM exams WHERE title LIKE 'Benchmark Exam%';`
    );
    const examIds = examsRes.rows.map(r => r.exam_id);

    // 3. Identify benchmark subjects
    const subjectsRes = await client.query(
      `SELECT subject_id FROM subjects WHERE code LIKE 'BENCH-CS%';`
    );
    const subjectIds = subjectsRes.rows.map(r => r.subject_id);

    // 4. Identify benchmark attempts
    const attemptsRes = await client.query(
      `SELECT attempt_id FROM exam_attempts WHERE student_id = ANY($1::uuid[]);`,
      [userIds]
    );
    const attemptIds = attemptsRes.rows.map(r => r.attempt_id);

    console.log(`[Cleanup] Located: ${userIds.length} users, ${examIds.length} exams, ${subjectIds.length} subjects, ${attemptIds.length} attempts.`);

    if (isDryRun) {
      console.log('[Cleanup] Dry run complete. No rows modified.');
      return;
    }

    // Cascading deletions in strict foreign key order
    let deletedCounts = {};

    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable;');

    // A. Answers
    const answersDel = await client.query(
      `DELETE FROM answers WHERE attempt_question_id IN (
        SELECT attempt_question_id FROM attempt_questions WHERE attempt_id = ANY($1::uuid[])
      );`,
      [attemptIds]
    );
    deletedCounts.answers = answersDel.rowCount;

    // B. Attempt Questions
    const aqDel = await client.query(
      `DELETE FROM attempt_questions WHERE attempt_id = ANY($1::uuid[]);`,
      [attemptIds]
    );
    deletedCounts.attempt_questions = aqDel.rowCount;

    // C. Submission Idempotency
    const idempDel = await client.query(
      `DELETE FROM submission_idempotency WHERE attempt_id = ANY($1::uuid[]);`,
      [attemptIds]
    );
    deletedCounts.submission_idempotency = idempDel.rowCount;

    // D. Results
    const resultsDel = await client.query(
      `DELETE FROM results WHERE attempt_id = ANY($1::uuid[]);`,
      [attemptIds]
    );
    deletedCounts.results = resultsDel.rowCount;

    // D2. Audit Logs
    const auditDel = await client.query(
      `DELETE FROM audit_logs WHERE attempt_id = ANY($1::uuid[]) OR actor_user_id = ANY($2::uuid[]);`,
      [attemptIds, userIds]
    );
    deletedCounts.audit_logs = auditDel.rowCount;

    // E. Outbox Events
    const outboxDel = await client.query(
      `DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[]);`,
      [attemptIds]
    );
    deletedCounts.outbox_events = outboxDel.rowCount;

    // F. Exam Attempts
    const attemptsDel = await client.query(
      `DELETE FROM exam_attempts WHERE attempt_id = ANY($1::uuid[]);`,
      [attemptIds]
    );
    deletedCounts.exam_attempts = attemptsDel.rowCount;

    // G. Session Students & Invigilators
    const sessStudDel = await client.query(
      `DELETE FROM session_students WHERE student_id = ANY($1::uuid[]);`,
      [userIds]
    );
    deletedCounts.session_students = sessStudDel.rowCount;

    const sessInvDel = await client.query(
      `DELETE FROM session_invigilators WHERE user_id = ANY($1::uuid[]);`,
      [userIds]
    );
    deletedCounts.session_invigilators = sessInvDel.rowCount;

    // H. Exam Sessions
    const sessDel = await client.query(
      `DELETE FROM exam_sessions WHERE exam_id = ANY($1::uuid[]);`,
      [examIds]
    );
    deletedCounts.exam_sessions = sessDel.rowCount;

    // I. Rooms
    const roomsDel = await client.query(
      `DELETE FROM rooms WHERE name LIKE 'Bench-Room-%';`
    );
    deletedCounts.rooms = roomsDel.rowCount;

    // J. Exam Topic Rules
    const rulesDel = await client.query(
      `DELETE FROM exam_topic_rules WHERE exam_id = ANY($1::uuid[]);`,
      [examIds]
    );
    deletedCounts.exam_topic_rules = rulesDel.rowCount;

    // K. Exams
    const examsDel = await client.query(
      `DELETE FROM exams WHERE exam_id = ANY($1::uuid[]);`,
      [examIds]
    );
    deletedCounts.exams = examsDel.rowCount;

    // L. Question Options & Questions
    const qoDel = await client.query(
      `DELETE FROM question_options WHERE question_id IN (
        SELECT question_id FROM questions WHERE topic_id IN (
          SELECT topic_id FROM topics WHERE subject_id = ANY($1::uuid[])
        )
      );`,
      [subjectIds]
    );
    deletedCounts.question_options = qoDel.rowCount;

    const qDel = await client.query(
      `DELETE FROM questions WHERE topic_id IN (
        SELECT topic_id FROM topics WHERE subject_id = ANY($1::uuid[])
      );`,
      [subjectIds]
    );
    deletedCounts.questions = qDel.rowCount;

    // M. Topics & Subjects
    const topicsDel = await client.query(
      `DELETE FROM topics WHERE subject_id = ANY($1::uuid[]);`,
      [subjectIds]
    );
    deletedCounts.topics = topicsDel.rowCount;

    const subjectsDel = await client.query(
      `DELETE FROM subjects WHERE subject_id = ANY($1::uuid[]);`,
      [subjectIds]
    );
    deletedCounts.subjects = subjectsDel.rowCount;

    // N. User Profiles, Sessions, Roles, and Users
    const spDel = await client.query(
      `DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[]);`,
      [userIds]
    );
    deletedCounts.student_profiles = spDel.rowCount;

    const usDel = await client.query(
      `DELETE FROM user_sessions WHERE user_id = ANY($1::uuid[]);`,
      [userIds]
    );
    deletedCounts.user_sessions = usDel.rowCount;

    const urDel = await client.query(
      `DELETE FROM user_roles WHERE user_id = ANY($1::uuid[]);`,
      [userIds]
    );
    deletedCounts.user_roles = urDel.rowCount;

    const usersDel = await client.query(
      `DELETE FROM users WHERE user_id = ANY($1::uuid[]);`,
      [userIds]
    );
    deletedCounts.users = usersDel.rowCount;

    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable;');
    await client.query('COMMIT');
    console.log('[Cleanup] Committed database cleanup successfully. Deletion summary:');
    console.table(deletedCounts);

    // Remove local fixture file
    const fixturePath = path.join(__dirname, 'fixtures', 'benchmark-fixtures.json');
    if (fs.existsSync(fixturePath)) {
      fs.unlinkSync(fixturePath);
      console.log(`[Cleanup] Removed fixture file: ${fixturePath}`);
    }

  } catch (err) {
    try {
      await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable;');
    } catch (_) {}
    if (!isDryRun) {
      await client.query('ROLLBACK');
    }
    console.error('[Cleanup] Error executing cleanup. Rolled back.', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
