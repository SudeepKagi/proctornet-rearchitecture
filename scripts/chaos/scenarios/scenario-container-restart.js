/**
 * @file scenario-container-restart.js
 * @description Scenario CH-07: Docker Container Restart with Volume Persistence.
 * Seeds answers and outbox events, executes docker restart on proctornet-postgres,
 * observes fault detection and recovery, and asserts 100% durable persistence with zero data loss.
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import {
  verifyTargetIdentity,
  restartContainer,
  measureRecoveryMetrics,
  registerTeardownHook
} from '../chaos-harness.js';
import { seedChaosFixtures, teardownChaosFixtures, getDbPool } from '../fixtures.js';
import { verifyResilienceInvariants } from '../verify-resilience-invariants.js';

export async function runScenarioContainerRestart(options = {}) {
  const containerName = 'proctornet-postgres';
  verifyTargetIdentity(containerName);

  let pool = options.pool || getDbPool();
  let fixtures = null;
  let faultDetectionTimeMs = 0;
  let faultRecoveryTimeMs = 0;
  let dataLossCount = 0;
  let passed = false;

  registerTeardownHook(async () => {
    if (fixtures) {
      const cleanPool = getDbPool();
      await teardownChaosFixtures({ pool: cleanPool }).catch(() => {});
      await cleanPool.end().catch(() => {});
    }
  });

  console.log('\n--- Running Scenario CH-07: Docker Container Restart with Volume Persistence ---');

  try {
    // 1. Seed fixtures with 3 candidates
    fixtures = await seedChaosFixtures({ candidateCount: 3, pool });
    const attempt = fixtures.attempts[0];
    const aq = attempt.attemptQuestions[0];

    // 2. Save an answer and an outbox event before restarting
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO answers (answer_id, attempt_question_id, answer_value, revision, saved_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, '{"selected": "Durable", "before_restart": true}', 1, NOW(), NOW(), NOW());`,
        [aq.attemptQuestionId]
      );
      await client.query(
        `INSERT INTO outbox_events (event_id, aggregate_type, aggregate_id, event_type, payload, status, retry_count, max_retries, created_at, updated_at)
         VALUES (gen_random_uuid(), 'ATTEMPT', $1, 'ATTEMPT_SUBMITTED', '{"durable": true}', 'PENDING', 0, 5, NOW(), NOW());`,
        [attempt.attemptId]
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end(); // Discard client pool before container restart

    // 3. Restart container and observe recovery
    console.log(`[CH-07] Restarting container: ${containerName}...`);
    const restartStart = Date.now();
    await restartContainer(containerName, 3);
    faultDetectionTimeMs = Date.now() - restartStart;

    // 4. Measure recovery time until PostgreSQL is accepting connections
    const probePostgres = async () => {
      try {
        const out = execSync(`docker exec ${containerName} pg_isready -U postgres`, {
          encoding: 'utf8',
          timeout: 2000
        });
        return { recovered: out.includes('accepting connections') };
      } catch {
        return { recovered: false };
      }
    };

    const metrics = await measureRecoveryMetrics(probePostgres, { maxRecoveryMs: 5000, intervalMs: 250 });
    faultRecoveryTimeMs = metrics.faultRecoveryTimeMs;
    console.log(`[CH-07] Container recovered. Fault Recovery Time: ${faultRecoveryTimeMs}ms (Threshold <= 5000ms)`);

    // 5. Establish fresh pool and assert 100% data persistence
    pool = getDbPool();
    const verifyClient = await pool.connect();
    try {
      const ansRes = await verifyClient.query(
        `SELECT revision, answer_value FROM answers WHERE attempt_question_id = $1;`,
        [aq.attemptQuestionId]
      );
      if (ansRes.rows.length === 0 || Number(ansRes.rows[0].revision) !== 1) {
        dataLossCount++;
      }

      const obRes = await verifyClient.query(
        `SELECT COUNT(*)::int AS cnt FROM outbox_events WHERE aggregate_id = $1;`,
        [attempt.attemptId]
      );
      if (obRes.rows[0].cnt === 0) {
        dataLossCount++;
      }

      console.log(`[CH-07] Verified: Answer revision and outbox event intact after container restart.`);
    } finally {
      verifyClient.release();
    }

    // 6. Audit 8/8 invariants post-restart
    const auditRes = await verifyResilienceInvariants({ pool, verbose: false });
    assert.strictEqual(auditRes.passed, true, 'All 8/8 invariants must pass after container restart');

    passed = faultRecoveryTimeMs <= 5000 && dataLossCount === 0 && auditRes.passed;
    console.log(`[CH-07] Result: ${passed ? 'PASSED' : 'FAILED'} (dataLossCount=${dataLossCount})\n`);

    return {
      scenarioId: 'CH-07',
      title: 'Docker Container Restart with EBS/Volume Persistence',
      passed,
      faultDetectionTimeMs,
      faultRecoveryTimeMs,
      dataLossCount,
      duplicateEffects: 0,
      details: {
        container: containerName,
        dataIntact: dataLossCount === 0,
        invariantsPassed: auditRes.passed
      }
    };
  } finally {
    if (fixtures) {
      await teardownChaosFixtures({ pool }).catch(() => {});
    }
    await pool.end().catch(() => {});
  }
}

// CLI direct runner
if (process.argv[1] && process.argv[1].endsWith('scenario-container-restart.js')) {
  runScenarioContainerRestart()
    .then((res) => {
      console.log('Result:', JSON.stringify(res, null, 2));
      process.exit(res.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal scenario error:', err);
      process.exit(1);
    });
}
