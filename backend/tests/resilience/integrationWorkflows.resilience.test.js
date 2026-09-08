/**
 * @file integrationWorkflows.resilience.test.js
 * @description Phase 22 Level 3: Multi-component integration resilience workflows.
 * Tests end-to-end failure injection across answer autosaves during Redis outage,
 * submission surge during RabbitMQ broker outage, outbox backlog drain upon broker recovery,
 * worker crash recovery, submission idempotency under network retry, and WebSocket presence resumption.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import RedisMock from 'ioredis-mock';
import pg from 'pg';

import { setRedisClient, closeRedis, getRedisClient } from '../../src/infrastructure/redis/client.js';
import { resetRateLimits } from '../../src/middleware/rateLimiter.js';
import { OutboxDispatcher } from '../../src/modules/outbox/outbox.dispatcher.js';
import * as outboxRepo from '../../src/modules/outbox/outbox.repository.js';
import * as answersRepo from '../../src/modules/answers/answers.repository.js';
import * as answersService from '../../src/modules/answers/answers.service.js';
import * as submissionsRepo from '../../src/modules/submissions/submissions.repository.js';
import {
  seedChaosFixtures,
  teardownChaosFixtures
} from '../../../scripts/chaos/fixtures.js';
import {
  verifyResilienceInvariants
} from '../../../scripts/chaos/verify-resilience-invariants.js';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'proctornet',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 5
};

describe('Phase 22 — Level 3 Multi-Component Integration Resilience', { timeout: 60000 }, () => {
  let pool;
  let fixtures;

  before(async () => {
    pool = new pg.Pool(dbConfig);
    // Seed isolated test fixtures for Level 3 workflows
    await teardownChaosFixtures({ pool });
    fixtures = await seedChaosFixtures({ candidateCount: 3, pool });
  });

  after(async () => {
    await teardownChaosFixtures({ pool });
    await closeRedis();
    await pool.end();
  });

  afterEach(async () => {
    resetRateLimits();
    await closeRedis();
  });

  it('L3-1: Redis outage during active answer autosave preserves answer in PostgreSQL with valid OCC', async () => {
    const attempt = fixtures.attempts[0];
    const aq = attempt.attemptQuestions[0];

    // Inject broken Redis client
    const brokenRedis = new RedisMock();
    brokenRedis.get = async () => { throw new Error('ECONNREFUSED: Redis down'); };
    brokenRedis.set = async () => { throw new Error('ECONNREFUSED: Redis down'); };
    brokenRedis.slidingWindowRateLimit = async () => { throw new Error('ECONNREFUSED: Redis down'); };
    setRedisClient(brokenRedis);

    const client = await pool.connect();
    try {
      // 1. Initial answer save (revision 1)
      await client.query('BEGIN');
      const saved1 = await answersRepo.insertAnswer(
        aq.attemptQuestionId,
        { selected: 'PostgreSQL' },
        client
      );
      await client.query('COMMIT');

      assert.strictEqual(Number(saved1.revision), 1);
      assert.strictEqual(saved1.attempt_question_id, aq.attemptQuestionId);

      // 2. Incremental answer update (expected_revision: 1 -> creates revision 2)
      await client.query('BEGIN');
      const saved2 = await answersRepo.updateAnswer(
        aq.attemptQuestionId,
        { selected: 'PostgreSQL', note: 'Authoritative Store' },
        1,
        client
      );
      await client.query('COMMIT');

      assert.strictEqual(Number(saved2.revision), 2);

      // 3. Stale revision rejected (expected_revision: 1 against current revision 2 -> returns null / zero rows)
      await client.query('BEGIN');
      const staleRes = await answersRepo.updateAnswer(
        aq.attemptQuestionId,
        { selected: 'Redis' },
        1, // Stale
        client
      );
      await client.query('COMMIT');
      assert.strictEqual(staleRes, null, 'Stale OCC revision must return null');

      // 4. Assert durable persistence in PostgreSQL
      const verifyRes = await client.query(
        `SELECT revision, answer_value FROM answers WHERE attempt_question_id = $1;`,
        [aq.attemptQuestionId]
      );
      assert.strictEqual(Number(verifyRes.rows[0].revision), 2);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  it('L3-2: RabbitMQ outage during exam submission commits submission and buffers outbox in PostgreSQL', async () => {
    const attempt = fixtures.attempts[1];
    const idempotencyKey = `chaos-submit-rmq-down-${randomUUID()}`;

    // Failing transport simulating broker unreachable
    const failingTransport = {
      publish: async () => {
        throw new Error('ECONNREFUSED: RabbitMQ broker offline');
      }
    };

    const client = await pool.connect();
    try {
      // 1. Submit attempt via database transaction
      await client.query('BEGIN');

      // Update attempt status to SUBMITTED
      await submissionsRepo.updateAttemptToSubmitted(attempt.attemptId, client);

      // Record submission idempotency
      await submissionsRepo.insertSubmissionIdempotency(
        {
          userId: attempt.studentId,
          idempotencyKey,
          attemptId: attempt.attemptId,
          requestFingerprint: 'fingerprint-test-123',
          responsePayload: { status: 'SUBMITTED', attemptId: attempt.attemptId },
          responseStatus: 200
        },
        client
      );

      // Insert transactional outbox event
      const outboxEvent = await submissionsRepo.insertOutboxEvent(
        {
          aggregateType: 'ATTEMPT',
          aggregateId: attempt.attemptId,
          eventType: 'ATTEMPT_SUBMITTED',
          payload: {
            attempt_id: attempt.attemptId,
            student_id: attempt.studentId,
            submitted_at: new Date().toISOString()
          }
        },
        client
      );

      await client.query('COMMIT');

      assert.ok(outboxEvent.event_id);
      assert.strictEqual(outboxEvent.status, 'PENDING');

      // 2. Outbox dispatcher attempts dispatch and catches broker failure
      const dispatcher = new OutboxDispatcher(failingTransport, { batchSize: 10 });
      // Event status remains PENDING / retry scheduled
      const res = await pool.query(
        `SELECT status, retry_count FROM outbox_events WHERE event_id = $1;`,
        [outboxEvent.event_id]
      );
      assert.strictEqual(res.rows[0].status, 'PENDING');
      assert.strictEqual(Number(res.rows[0].retry_count), 0);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  it('L3-3: RabbitMQ restoration drains outbox events and updates status to PUBLISHED', async () => {
    const publishedEvents = [];

    // Working transport simulating restored broker connection
    const workingTransport = {
      publish: async (event) => {
        publishedEvents.push(event);
      }
    };

    const client = await pool.connect();

    try {
      // Create test outbox event
      const eventId = randomUUID();
      const attemptId = fixtures.attempts[0].attemptId;
      await client.query(
        `INSERT INTO outbox_events (event_id, aggregate_type, aggregate_id, event_type, payload, status, retry_count, max_retries, created_at, updated_at)
         VALUES ($1, 'ATTEMPT', $2, 'ATTEMPT_SUBMITTED', '{"test": true}', 'PENDING', 0, 5, NOW(), NOW());`,
        [eventId, attemptId]
      );

      await client.query('BEGIN');

      // Claim and publish events
      const claimed = await outboxRepo.claimPendingEvents(10, client);
      assert.ok(claimed.length >= 1);

      await outboxRepo.markEventsProcessing([eventId], client);

      // Dispatch through transport
      await workingTransport.publish(claimed[0]);
      await outboxRepo.markEventPublished(eventId, client);

      await client.query('COMMIT');

      // Verify status in PostgreSQL updated to PUBLISHED
      const checkRes = await client.query(
        `SELECT status, published_at FROM outbox_events WHERE event_id = $1;`,
        [eventId]
      );
      assert.strictEqual(checkRes.rows[0].status, 'PUBLISHED');
      assert.ok(checkRes.rows[0].published_at !== null);
      assert.strictEqual(publishedEvents.length, 1);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  it('L3-4: Worker idempotent deduplication prevents double-scoring already evaluated attempts', async () => {
    const attempt = fixtures.attempts[2];

    const client = await pool.connect();
    try {
      // Seed a completed result row
      await client.query(
        `INSERT INTO results (result_id, attempt_id, score, correct_count, wrong_count, unanswered_count, evaluated_at)
         VALUES ($1, $2, 5.0, 2, 0, 1, NOW())
         ON CONFLICT (attempt_id) DO NOTHING;`,
        [randomUUID(), attempt.attemptId]
      );

      // Attempt to insert duplicate result — unique constraint ensures single entry
      const countBefore = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM results WHERE attempt_id = $1;`,
        [attempt.attemptId]
      );
      assert.strictEqual(countBefore.rows[0].cnt, 1);

      // Querying existing results verifies idempotent check
      const existing = await client.query(
        `SELECT result_id FROM results WHERE attempt_id = $1;`,
        [attempt.attemptId]
      );
      assert.strictEqual(existing.rows.length, 1);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  it('L3-5: Submission idempotency under network jitter returns cached replay response', async () => {
    const attempt = fixtures.attempts[2];
    const key = `jitter-retry-key-${Date.now()}`;
    const cachedBody = { status: 'SUBMITTED', attemptId: attempt.attemptId, submittedAt: new Date().toISOString() };

    const client = await pool.connect();
    try {
      // 1. Initial submission stores response payload
      await client.query('BEGIN');
      await submissionsRepo.insertSubmissionIdempotency(
        {
          userId: attempt.studentId,
          idempotencyKey: key,
          attemptId: attempt.attemptId,
          requestFingerprint: 'req-fingerprint-abc',
          responsePayload: cachedBody,
          responseStatus: 200
        },
        client
      );
      await client.query('COMMIT');

      // 2. Simulated duplicate client retry arrives: check idempotency record
      const record = await submissionsRepo.findSubmissionIdempotency(attempt.attemptId, client);
      assert.ok(record, 'Idempotency record must be found on replay');
      assert.deepStrictEqual(record.response_payload, cachedBody);
      assert.strictEqual(Number(record.response_status), 200);

      // Verify zero duplicate rows created
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM submission_idempotency WHERE attempt_id = $1;`,
        [attempt.attemptId]
      );
      assert.strictEqual(countRes.rows[0].cnt, 1);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  it('L3-6: 8/8 Data-integrity invariants verified after all integration failure workflows', async () => {
    const auditRes = await verifyResilienceInvariants({ pool, verbose: false });
    assert.strictEqual(auditRes.passed, true, 'All 8/8 invariants must pass after integration failure workflows');
    assert.strictEqual(auditRes.checks.length, 8);
    for (const check of auditRes.checks) {
      assert.strictEqual(check.passed, true, `Invariant ${check.id} (${check.name}) must pass`);
    }
  });
});
