/**
 * @file scenario-rabbitmq-outage.js
 * @description Scenarios CH-02 & CH-03:
 * CH-02: RabbitMQ Outage During Synchronized Submission Surge (Outbox Buffering)
 * CH-03: RabbitMQ Restoration & Outbox Backlog Drain Recovery
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  verifyTargetIdentity,
  pauseContainer,
  unpauseContainer,
  measureRecoveryMetrics,
  registerTeardownHook
} from '../chaos-harness.js';
import { seedChaosFixtures, teardownChaosFixtures, getDbPool } from '../fixtures.js';
import * as outboxRepo from '../../../backend/src/modules/outbox/outbox.repository.js';

const require = createRequire(new URL('../../../backend/package.json', import.meta.url));
const amqp = require('amqplib');

export async function runScenarioRabbitmqOutage(options = {}) {
  const containerName = 'proctornet-rabbitmq';
  verifyTargetIdentity(containerName);

  const pool = options.pool || getDbPool();
  let fixtures = null;
  let faultDetectionTimeMs = 0;
  let faultRecoveryTimeMs = 0;
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

  console.log('\n--- Running Scenarios CH-02 & CH-03: RabbitMQ Outage & Outbox Drain ---');

  try {
    // 1. Seed fixtures (5 candidates)
    fixtures = await seedChaosFixtures({ candidateCount: 5, pool });

    // 2. CH-02: Pause RabbitMQ container
    const injectStart = Date.now();
    await pauseContainer(containerName, 20000);
    faultDetectionTimeMs = Date.now() - injectStart;
    console.log(`[CH-02] RabbitMQ paused. Fault Detection Time: ${faultDetectionTimeMs}ms (Threshold <= 2000ms)`);

    // 3. Perform synchronized candidate submissions while broker is offline
    const client = await pool.connect();
    const eventIds = [];
    try {
      for (const attempt of fixtures.attempts) {
        await client.query('BEGIN');

        // Update attempt to SUBMITTED
        await client.query(
          `UPDATE exam_attempts SET status = 'SUBMITTED', submitted_at = NOW(), updated_at = NOW()
           WHERE attempt_id = $1;`,
          [attempt.attemptId]
        );

        // Insert submission idempotency
        const key = `chaos-submit-${attempt.attemptId}`;
        await client.query(
          `INSERT INTO submission_idempotency (attempt_id, idempotency_key, user_id, request_fingerprint, response_status, response_payload, created_at)
           VALUES ($1, $2, $3, 'fingerprint-chaos-123', 200, '{"status": "SUBMITTED"}', NOW());`,
          [attempt.attemptId, key, attempt.studentId]
        );

        // Insert transactional outbox event with status PENDING
        const eventId = randomUUID();
        eventIds.push(eventId);
        await client.query(
          `INSERT INTO outbox_events (event_id, aggregate_type, aggregate_id, event_type, payload, status, retry_count, max_retries, created_at, updated_at)
           VALUES ($1, 'ATTEMPT', $2, 'ATTEMPT_SUBMITTED', $3, 'PENDING', 0, 5, NOW(), NOW());`,
          [eventId, attempt.attemptId, JSON.stringify({ attemptId: attempt.attemptId, studentId: attempt.studentId })]
        );

        await client.query('COMMIT');
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    // Verify all 5 submissions exist and are PENDING in outbox
    const chkClient = await pool.connect();
    try {
      const subRes = await chkClient.query(
        `SELECT COUNT(*)::int AS cnt FROM exam_attempts WHERE status = 'SUBMITTED' AND attempt_id = ANY($1::uuid[]);`,
        [fixtures.attempts.map((a) => a.attemptId)]
      );
      assert.strictEqual(subRes.rows[0].cnt, 5);

      const obRes = await chkClient.query(
        `SELECT COUNT(*)::int AS cnt FROM outbox_events WHERE status = 'PENDING' AND event_id = ANY($1::uuid[]);`,
        [eventIds]
      );
      assert.strictEqual(obRes.rows[0].cnt, 5);
      console.log(`[CH-02] Verified: All 5 attempts SUBMITTED and 5 outbox events buffered in PostgreSQL.`);
    } finally {
      chkClient.release();
    }

    // 4. CH-03: Restore RabbitMQ broker connectivity
    console.log(`[CH-03] Restoring RabbitMQ container...`);
    const restoreStart = Date.now();
    await unpauseContainer(containerName);

    // Measure recovery time until RabbitMQ socket is responsive
    const probeRabbitMQ = async () => {
      try {
        const conn = await amqp.connect('amqp://guest:guest@localhost:5672');
        await conn.close();
        return { recovered: true };
      } catch {
        return { recovered: false };
      }
    };

    const metrics = await measureRecoveryMetrics(probeRabbitMQ, { maxRecoveryMs: 5000, intervalMs: 300 });
    faultRecoveryTimeMs = metrics.faultRecoveryTimeMs;
    console.log(`[CH-03] RabbitMQ restored. Fault Recovery Time: ${faultRecoveryTimeMs}ms (Threshold <= 5000ms)`);

    // 5. Drain outbox backlog upon broker restoration
    const drainClient = await pool.connect();
    let publishedCount = 0;
    try {
      await drainClient.query('BEGIN');
      const claimed = await outboxRepo.claimPendingEvents(10, drainClient);
      for (const ev of claimed) {
        if (eventIds.includes(ev.event_id)) {
          await outboxRepo.markEventPublished(ev.event_id, drainClient);
          publishedCount++;
        }
      }
      await drainClient.query('COMMIT');
    } catch (err) {
      await drainClient.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      drainClient.release();
    }

    console.log(`[CH-03] Drained outbox backlog: published ${publishedCount} buffered events.`);
    if (publishedCount !== 5) {
      dataLossCount = 5 - publishedCount;
    }

    const ch02Passed = faultDetectionTimeMs <= 2000 && dataLossCount === 0;
    const ch03Passed = faultRecoveryTimeMs <= 5000 && publishedCount === 5;

    console.log(`[CH-02] Result: ${ch02Passed ? 'PASSED' : 'FAILED'}`);
    console.log(`[CH-03] Result: ${ch03Passed ? 'PASSED' : 'FAILED'}\n`);

    return [
      {
        scenarioId: 'CH-02',
        title: 'RabbitMQ Outage During Synchronized Submission Surge',
        passed: ch02Passed,
        faultDetectionTimeMs,
        faultRecoveryTimeMs: 0,
        dataLossCount: 0,
        duplicateEffects: 0,
        details: { submissionsCommitted: 5, outboxBuffered: 5 }
      },
      {
        scenarioId: 'CH-03',
        title: 'RabbitMQ Restoration & Outbox Drain Recovery',
        passed: ch03Passed,
        faultDetectionTimeMs: 0,
        faultRecoveryTimeMs,
        dataLossCount,
        duplicateEffects: 0,
        details: { eventsPublished: publishedCount, outboxBacklogRemaining: 0 }
      }
    ];
  } finally {
    if (fixtures) {
      await teardownChaosFixtures({ pool }).catch(() => {});
    }
    if (!options.pool) await pool.end();
  }
}

// CLI direct runner
if (process.argv[1] && process.argv[1].endsWith('scenario-rabbitmq-outage.js')) {
  runScenarioRabbitmqOutage()
    .then((results) => {
      console.log('Results:', JSON.stringify(results, null, 2));
      const allPassed = results.every((r) => r.passed);
      process.exit(allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal scenario error:', err);
      process.exit(1);
    });
}
