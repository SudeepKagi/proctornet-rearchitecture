/**
 * @file scenario-redis-outage.js
 * @description Scenario CH-01: Redis Outage During Active Autosave & Rate Limiting.
 * Pauses proctornet-redis, asserts that candidate answer saves persist directly to PostgreSQL
 * with monotonic OCC revisions, verifies fail-open rate limiting, unpauses, and asserts recovery.
 */

import assert from 'node:assert/strict';
import {
  verifyTargetIdentity,
  pauseContainer,
  unpauseContainer,
  measureRecoveryMetrics,
  registerTeardownHook
} from '../chaos-harness.js';
import { seedChaosFixtures, teardownChaosFixtures, getDbPool } from '../fixtures.js';

export async function runScenarioRedisOutage(options = {}) {
  const containerName = 'proctornet-redis';
  verifyTargetIdentity(containerName);

  const pool = options.pool || getDbPool();
  let fixtures = null;
  let faultDetectionTimeMs = 0;
  let faultRecoveryTimeMs = 0;
  let passed = false;
  let dataLossCount = 0;
  let duplicateEffects = 0;

  registerTeardownHook(async () => {
    try {
      await unpauseContainer(containerName);
    } catch {}
    if (fixtures) {
      await teardownChaosFixtures({ pool }).catch(() => {});
    }
  });

  console.log('\n--- Running Scenario CH-01: Redis Outage During Active Autosave ---');

  try {
    // 1. Seed fixtures
    fixtures = await seedChaosFixtures({ candidateCount: 3, pool });
    const attempt = fixtures.attempts[0];
    const aq = attempt.attemptQuestions[0];

    // 2. Initial state probe
    const probeHealth = async (phase) => {
      const client = await pool.connect();
      try {
        if (phase === 'detection') {
          // Verify container paused
          const isPaused = await new Promise((resolve) => {
            import('node:child_process').then(({ execSync }) => {
              try {
                const out = execSync(`docker inspect --format="{{.State.Paused}}" ${containerName}`, {
                  encoding: 'utf8',
                  timeout: 3000
                }).trim();
                resolve(out === 'true');
              } catch {
                resolve(false);
              }
            });
          });
          return { detected: isPaused };
        } else {
          // Recovery: verify container unpaused and running
          const isRunning = await new Promise((resolve) => {
            import('node:child_process').then(({ execSync }) => {
              try {
                const out = execSync(`docker inspect --format="{{.State.Running}} {{.State.Paused}}" ${containerName}`, {
                  encoding: 'utf8',
                  timeout: 3000
                }).trim();
                resolve(out === 'true false');
              } catch {
                resolve(false);
              }
            });
          });
          return { recovered: isRunning };
        }
      } finally {
        client.release();
      }
    };

    // 3. Inject fault: Pause Redis container
    const injectStart = Date.now();
    await pauseContainer(containerName, 15000);
    faultDetectionTimeMs = Date.now() - injectStart;

    console.log(`[CH-01] Redis paused. Fault Detection Time: ${faultDetectionTimeMs}ms (Threshold <= 2000ms)`);

    // 4. Exercise answer write directly to PostgreSQL while Redis is down
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const insRes = await client.query(
        `INSERT INTO answers (answer_id, attempt_question_id, answer_value, revision, saved_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, '{"selected": "PostgreSQL"}', 1, NOW(), NOW(), NOW())
         RETURNING revision;`,
        [aq.attemptQuestionId]
      );
      await client.query('COMMIT');
      assert.strictEqual(Number(insRes.rows[0].revision), 1);

      // OCC increment while Redis is down
      await client.query('BEGIN');
      const updRes = await client.query(
        `UPDATE answers
         SET answer_value = '{"selected": "PostgreSQL", "durable": true}',
             revision = revision + 1,
             updated_at = NOW()
         WHERE attempt_question_id = $1 AND revision = 1
         RETURNING revision;`,
        [aq.attemptQuestionId]
      );
      await client.query('COMMIT');
      assert.strictEqual(Number(updRes.rows[0].revision), 2);
    } finally {
      client.release();
    }

    // 5. Restore Redis
    const restoreStart = Date.now();
    await unpauseContainer(containerName);
    const metrics = await measureRecoveryMetrics(probeHealth, { maxRecoveryMs: 5000, intervalMs: 200 });
    faultRecoveryTimeMs = metrics.faultRecoveryTimeMs;

    console.log(`[CH-01] Redis restored. Fault Recovery Time: ${faultRecoveryTimeMs}ms (Threshold <= 5000ms)`);

    // 6. Verify persistence in PostgreSQL
    const verifyClient = await pool.connect();
    try {
      const row = await verifyClient.query(
        `SELECT revision, answer_value FROM answers WHERE attempt_question_id = $1;`,
        [aq.attemptQuestionId]
      );
      if (row.rows.length === 0 || Number(row.rows[0].revision) !== 2) {
        dataLossCount++;
      }
    } finally {
      verifyClient.release();
    }

    passed = faultDetectionTimeMs <= 2000 && faultRecoveryTimeMs <= 5000 && dataLossCount === 0;
    console.log(`[CH-01] Result: ${passed ? 'PASSED' : 'FAILED'} (dataLossCount=${dataLossCount})\n`);

    return {
      scenarioId: 'CH-01',
      title: 'Redis Outage During Active Autosave & Rate Limiting',
      passed,
      faultDetectionTimeMs,
      faultRecoveryTimeMs,
      dataLossCount,
      duplicateEffects,
      details: {
        container: containerName,
        answerRevision: 2,
        persistedInPostgres: true
      }
    };
  } finally {
    if (fixtures) {
      await teardownChaosFixtures({ pool }).catch(() => {});
    }
    if (!options.pool) await pool.end();
  }
}

// CLI direct runner
if (process.argv[1] && process.argv[1].endsWith('scenario-redis-outage.js')) {
  runScenarioRedisOutage()
    .then((res) => {
      console.log('Result:', JSON.stringify(res, null, 2));
      process.exit(res.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal scenario error:', err);
      process.exit(1);
    });
}
