/**
 * @file verify-resilience-invariants.js
 * @description Automated 8/8 ACID and Resilience Invariant Auditor for ProctorNet Phase 22.
 * Asserts zero data corruption, zero orphan records, strict idempotency non-duplication,
 * monotonic OCC revisions, outbox consistency, and database trigger-level audit immutability.
 *
 * Usage:
 *   node scripts/chaos/verify-resilience-invariants.js
 */

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

/**
 * Executes the full suite of 8 resilience and data-integrity invariant checks.
 *
 * @param {object} [options]
 * @param {pg.Pool} [options.pool] - Optional existing database pool
 * @param {boolean} [options.verbose=true] - Whether to print detailed console output
 * @returns {Promise<{ passed: boolean, checks: Array<{ id: number, name: string, passed: boolean, details: string }>, failures: string[] }>}
 */
export async function verifyResilienceInvariants(options = {}) {
  const verbose = options.verbose !== false;
  const pool = options.pool || new pg.Pool(dbConfig);
  const client = await pool.connect();

  const checks = [];
  const failures = [];

  if (verbose) {
    console.log('\n===============================================================');
    console.log(' PROCTORNET PHASE 22 — DATA INTEGRITY & RESILIENCE AUDIT (8/8)');
    console.log('===============================================================');
  }

  try {
    // -------------------------------------------------------------
    // Invariant 1: Zero Orphan Answers
    // -------------------------------------------------------------
    const orphanAnsRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM answers a
       LEFT JOIN attempt_questions aq ON a.attempt_question_id = aq.attempt_question_id
       WHERE aq.attempt_question_id IS NULL;`
    );
    const orphanAnsCount = orphanAnsRes.rows[0].count;
    const inv1Passed = orphanAnsCount === 0;
    checks.push({
      id: 1,
      name: 'Zero Orphan Answers',
      passed: inv1Passed,
      details: `${orphanAnsCount} orphan answers`
    });
    if (!inv1Passed) failures.push(`[Invariant 1] Found ${orphanAnsCount} orphan answers`);

    // -------------------------------------------------------------
    // Invariant 2: Zero Orphan Attempt Questions
    // -------------------------------------------------------------
    const orphanAqRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM attempt_questions aq
       LEFT JOIN exam_attempts ea ON aq.attempt_id = ea.attempt_id
       WHERE ea.attempt_id IS NULL;`
    );
    const orphanAqCount = orphanAqRes.rows[0].count;
    const inv2Passed = orphanAqCount === 0;
    checks.push({
      id: 2,
      name: 'Zero Orphan Attempt Questions',
      passed: inv2Passed,
      details: `${orphanAqCount} orphan attempt questions`
    });
    if (!inv2Passed) failures.push(`[Invariant 2] Found ${orphanAqCount} orphan attempt questions`);

    // -------------------------------------------------------------
    // Invariant 3: Zero Duplicate Submission Idempotency Records
    // -------------------------------------------------------------
    const dupIdempRes = await client.query(
      `SELECT user_id, idempotency_key, COUNT(*)::int AS count
       FROM submission_idempotency
       GROUP BY user_id, idempotency_key
       HAVING COUNT(*) > 1;`
    );
    const dupIdempCount = dupIdempRes.rows.length;
    const inv3Passed = dupIdempCount === 0;
    checks.push({
      id: 3,
      name: 'Zero Duplicate Submission Idempotency Records',
      passed: inv3Passed,
      details: `${dupIdempCount} duplicate idempotency keys`
    });
    if (!inv3Passed) failures.push(`[Invariant 3] Found ${dupIdempCount} duplicate submission idempotency records`);

    // -------------------------------------------------------------
    // Invariant 4: Monotonic Answer OCC Revisions (No revisions < 1)
    // -------------------------------------------------------------
    const nonMonotonicRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM answers WHERE revision < 1;`
    );
    const nonMonotonicCount = nonMonotonicRes.rows[0].count;
    const inv4Passed = nonMonotonicCount === 0;
    checks.push({
      id: 4,
      name: 'Monotonic Answer OCC Revisions (revisions >= 1)',
      passed: inv4Passed,
      details: `${nonMonotonicCount} non-positive revision records`
    });
    if (!inv4Passed) failures.push(`[Invariant 4] Found ${nonMonotonicCount} non-positive answer revisions`);

    // -------------------------------------------------------------
    // Invariant 5: Zero Duplicate Completed Results
    // -------------------------------------------------------------
    const dupResultsRes = await client.query(
      `SELECT attempt_id, COUNT(*)::int AS count
       FROM results
       GROUP BY attempt_id
       HAVING COUNT(*) > 1;`
    );
    const dupResultsCount = dupResultsRes.rows.length;
    const inv5Passed = dupResultsCount === 0;
    checks.push({
      id: 5,
      name: 'Zero Duplicate Completed Results',
      passed: inv5Passed,
      details: `${dupResultsCount} attempts with duplicate results`
    });
    if (!inv5Passed) failures.push(`[Invariant 5] Found ${dupResultsCount} duplicate result records`);

    // -------------------------------------------------------------
    // Invariant 6: Outbox Consistency for Submitted Attempts
    // Verifies that every attempt submitted through the submission pipeline
    // (having an idempotency record or belonging to chaos tests) has a corresponding outbox event.
    // -------------------------------------------------------------
    let missingOutboxCount = 0;
    if (options.attemptIds && options.attemptIds.length > 0) {
      const missingRes = await client.query(
        `SELECT COUNT(*)::int AS count FROM exam_attempts ea
         LEFT JOIN outbox_events oe ON ea.attempt_id = oe.aggregate_id AND oe.event_type = 'ATTEMPT_SUBMITTED'
         WHERE ea.attempt_id = ANY($1::uuid[]) AND ea.status = 'SUBMITTED' AND oe.event_id IS NULL;`,
        [options.attemptIds]
      );
      missingOutboxCount = missingRes.rows[0].count;
    } else {
      const missingRes = await client.query(
        `SELECT COUNT(*)::int AS count FROM submission_idempotency si
         JOIN exam_attempts ea ON si.attempt_id = ea.attempt_id
         LEFT JOIN outbox_events oe ON si.attempt_id = oe.aggregate_id AND oe.event_type = 'ATTEMPT_SUBMITTED'
         WHERE ea.status = 'SUBMITTED' AND oe.event_id IS NULL;`
      );
      missingOutboxCount = missingRes.rows[0].count;
    }
    const inv6Passed = missingOutboxCount === 0;
    checks.push({
      id: 6,
      name: 'Outbox Event Consistency for Submitted Attempts',
      passed: inv6Passed,
      details: `${missingOutboxCount} submitted pipeline attempts without outbox events`
    });
    if (!inv6Passed) failures.push(`[Invariant 6] Found ${missingOutboxCount} submitted attempts missing outbox events`);

    // -------------------------------------------------------------
    // Invariant 7: Outbox Status Integrity
    // -------------------------------------------------------------
    const invalidOutboxStatusRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM outbox_events
       WHERE status NOT IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'DEAD_LETTER');`
    );
    const invalidOutboxStatusCount = invalidOutboxStatusRes.rows[0].count;
    const inv7Passed = invalidOutboxStatusCount === 0;
    checks.push({
      id: 7,
      name: 'Outbox Status Lifecycle Integrity',
      passed: inv7Passed,
      details: `${invalidOutboxStatusCount} events with invalid status`
    });
    if (!inv7Passed) failures.push(`[Invariant 7] Found ${invalidOutboxStatusCount} outbox events with invalid status`);

    // -------------------------------------------------------------
    // Invariant 8: Audit Log Immutability (Independent Trigger Invariant)
    // Note per Phase 22 specification: The audit-log immutability check
    // is an independent invariant asserting database-level trigger protection
    // and does not by itself prove post-fault durability of business records.
    // -------------------------------------------------------------
    let inv8Passed = false;
    let inv8Details = '';
    try {
      await client.query('BEGIN');

      // 1. Insert a temporary test audit log entry
      const testAuditId = '00000000-0000-0000-0000-000000000001';
      await client.query(
        `INSERT INTO audit_logs (audit_id, action, resource_type, resource_id, metadata, created_at)
         VALUES ($1, 'RESILIENCE_AUDIT_TEST', 'TEST', 'TEST_RES', '{"test": true}', NOW())
         ON CONFLICT (audit_id) DO NOTHING;`,
        [testAuditId]
      );

      // 2. Attempt an illegal UPDATE to verify SQLSTATE 20000 is raised
      let triggerBlocked = false;
      try {
        await client.query(
          `UPDATE audit_logs SET action = 'MUTATED' WHERE audit_id = $1;`,
          [testAuditId]
        );
      } catch (triggerErr) {
        if (triggerErr.code === '20000' || triggerErr.message.includes('immutable')) {
          triggerBlocked = true;
          inv8Details = `SQLSTATE 20000 trigger correctly raised (${triggerErr.message.trim()})`;
        } else {
          inv8Details = `Unexpected error code: ${triggerErr.code} (${triggerErr.message})`;
        }
      }

      await client.query('ROLLBACK'); // Always rollback the test transaction
      inv8Passed = triggerBlocked;
    } catch (testErr) {
      await client.query('ROLLBACK').catch(() => {});
      inv8Details = `Audit immutability probe failed: ${testErr.message}`;
      inv8Passed = false;
    }

    checks.push({
      id: 8,
      name: 'Audit Log Immutability (SQLSTATE 20000 Trigger Protection)',
      passed: inv8Passed,
      details: inv8Details,
      isIndependentTriggerCheck: true
    });
    if (!inv8Passed) failures.push(`[Invariant 8] Audit log immutability trigger not enforced: ${inv8Details}`);

    // Print summary
    if (verbose) {
      for (const c of checks) {
        const icon = c.passed ? 'PASS' : 'FAIL';
        console.log(`  [${icon}] Invariant ${c.id}: ${c.name} (${c.details})`);
      }
      console.log('---------------------------------------------------------------');
      console.log(`  Result: ${checks.filter(c => c.passed).length}/8 Invariants Passed`);
      console.log('===============================================================\n');
    }

    return {
      passed: failures.length === 0,
      checks,
      failures
    };
  } finally {
    client.release();
    if (!options.pool) await pool.end();
  }
}

// CLI runner if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyResilienceInvariants()
    .then((res) => {
      if (res.passed) {
        console.log('>> [SUCCESS] All 8/8 resilience and ACID invariants verified.');
        process.exit(0);
      } else {
        console.error('>> [FAILURE] Resilience invariant violations detected:');
        for (const f of res.failures) {
          console.error(`   - ${f}`);
        }
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('>> [ERROR] Invariant audit script failed to execute:', err);
      process.exit(1);
    });
}
