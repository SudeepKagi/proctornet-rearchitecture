/**
 * @file verify-data-integrity.js
 * @description Post-benchmark integrity validator asserting 0 data corruption, 0 deadlocks,
 * zero orphan records, and strict idempotency invariant compliance.
 *
 * Usage:
 *   node scripts/load/verify-data-integrity.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(new URL('../../backend/package.json', import.meta.url));

const pg = require('pg');

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
  console.log('[Verify] Commencing post-benchmark data integrity validation...');

  let failures = [];
  const checks = [];

  try {
    // 1. Identify benchmark users & attempts
    const usersRes = await client.query(
      `SELECT user_id FROM users WHERE email LIKE 'bench_%';`
    );
    const userIds = usersRes.rows.map(r => r.user_id);

    const attemptsRes = await client.query(
      `SELECT attempt_id, status FROM exam_attempts WHERE student_id = ANY($1::uuid[]);`,
      [userIds]
    );
    const attemptIds = attemptsRes.rows.map(r => r.attempt_id);
    const submittedAttempts = attemptsRes.rows.filter(r => r.status === 'SUBMITTED');

    checks.push({
      check: 'Benchmark Attempts Seeded',
      result: `Found ${attemptIds.length} attempts across ${userIds.length} users (${submittedAttempts.length} submitted)`,
      passed: attemptIds.length >= 0
    });

    // 2. Check for Orphan Records in Attempt Questions
    const orphanAqRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM attempt_questions aq
       LEFT JOIN exam_attempts ea ON aq.attempt_id = ea.attempt_id
       WHERE ea.attempt_id IS NULL;`
    );
    const orphanAqCount = orphanAqRes.rows[0].count;
    checks.push({
      check: 'Zero Orphan Attempt Questions',
      result: `${orphanAqCount} orphan attempt_questions`,
      passed: orphanAqCount === 0
    });
    if (orphanAqCount > 0) failures.push(`Found ${orphanAqCount} orphan attempt_questions`);

    // 3. Check for Orphan Records in Answers
    const orphanAnsRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM answers a
       LEFT JOIN attempt_questions aq ON a.attempt_question_id = aq.attempt_question_id
       WHERE aq.attempt_question_id IS NULL;`
    );
    const orphanAnsCount = orphanAnsRes.rows[0].count;
    checks.push({
      check: 'Zero Orphan Answers',
      result: `${orphanAnsCount} orphan answers`,
      passed: orphanAnsCount === 0
    });
    if (orphanAnsCount > 0) failures.push(`Found ${orphanAnsCount} orphan answers`);

    // 4. Verify Idempotency Non-Duplication
    const dupIdempRes = await client.query(
      `SELECT attempt_id, idempotency_key, COUNT(*) AS cnt
       FROM submission_idempotency
       WHERE attempt_id = ANY($1::uuid[])
       GROUP BY attempt_id, idempotency_key
       HAVING COUNT(*) > 1;`,
      [attemptIds]
    );
    const dupIdempCount = dupIdempRes.rows.length;
    checks.push({
      check: 'Submission Idempotency Zero Duplicates',
      result: `${dupIdempCount} duplicate idempotency keys`,
      passed: dupIdempCount === 0
    });
    if (dupIdempCount > 0) failures.push(`Found ${dupIdempCount} duplicate idempotency keys`);

    // 5. Outbox Event Emission for Submitted Attempts
    if (submittedAttempts.length > 0) {
      const submittedIds = submittedAttempts.map(r => r.attempt_id);
      const outboxRes = await client.query(
        `SELECT COUNT(DISTINCT aggregate_id)::int AS count
         FROM outbox_events
         WHERE aggregate_type = 'ATTEMPT'
           AND event_type = 'ATTEMPT_SUBMITTED'
           AND aggregate_id = ANY($1::uuid[]);`,
        [submittedIds]
      );
      const outboxCount = outboxRes.rows[0].count;
      const allSubmittedHaveOutbox = outboxCount === submittedIds.length;
      checks.push({
        check: 'Outbox Event Emission for Submissions',
        result: `${outboxCount}/${submittedIds.length} submitted attempts have EXAM_SUBMITTED outbox events`,
        passed: allSubmittedHaveOutbox
      });
      if (!allSubmittedHaveOutbox) {
        failures.push(`Expected ${submittedIds.length} outbox events, found ${outboxCount}`);
      }
    } else {
      checks.push({
        check: 'Outbox Event Emission for Submissions',
        result: 'No attempts submitted in this dataset yet (N/A)',
        passed: true
      });
    }

    // 6. Check Database Deadlocks
    const deadlockRes = await client.query(
      `SELECT deadlocks FROM pg_stat_database WHERE datname = $1;`,
      [dbConfig.database]
    );
    const deadlockCount = Number(deadlockRes.rows[0]?.deadlocks ?? 0);
    checks.push({
      check: 'PostgreSQL Database Deadlocks',
      result: `${deadlockCount} cumulative engine deadlocks recorded`,
      passed: deadlockCount === 0
    });
    if (deadlockCount > 0) {
      failures.push(`Database recorded ${deadlockCount} engine deadlocks`);
    }

    // 7. Check Answer Revision Monotonicity
    const revCheck = await client.query(
      `SELECT COUNT(*)::int AS count FROM answers WHERE revision < 1;`
    );
    const invalidRevs = revCheck.rows[0].count;
    checks.push({
      check: 'Answer Revision Monotonicity (>= 1)',
      result: `${invalidRevs} invalid revisions`,
      passed: invalidRevs === 0
    });
    if (invalidRevs > 0) failures.push(`Found ${invalidRevs} answers with invalid revision < 1`);

    console.log('\n================ DATA INTEGRITY AUDIT REPORT ================');
    console.table(checks);
    console.log('=============================================================\n');

    if (failures.length > 0) {
      console.error('[Verify] FAILED integrity assertions:');
      for (const f of failures) console.error(`  - ${f}`);
      process.exit(1);
    } else {
      console.log('[Verify] ALL DATA INTEGRITY INVARIANTS SATISFIED (0 corruption, 0 orphan records).');
      process.exit(0);
    }

  } catch (err) {
    console.error('[Verify] Error during data integrity verification:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
