/**
 * @file proctoringConcurrency.test.js
 * @description Integration tests for concurrent proctoring event ingestion:
 * Verifies that PostgreSQL row-level locks on exam_attempts (SELECT ... FOR UPDATE)
 * serialize concurrent ingestion requests safely without lost updates.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { app } from '../../src/app.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { closeRabbitMQ } from '../../src/infrastructure/rabbitmq/client.js';
import { setupProctoringFixture } from './proctoringTestHelper.js';

describe('Proctoring Ingestion Concurrency & Serialization (Integration)', () => {
  let fixture;

  before(async () => {
    fixture = await setupProctoringFixture();
  });

  after(async () => {
    await new Promise((r) => setTimeout(r, 200));
    await closeRabbitMQ();
    await closeRedis();
    await closePool();
  });

  it('should serialize concurrent ingestion requests on the same attempt without lost score updates', async () => {
    const { token, attempt } = await fixture.createStudentAttempt('ACTIVE');

    // Prepare 4 separate requests, each with a unique WINDOW_BLUR event (+5 points each)
    const requests = Array.from({ length: 4 }, () => {
      const event = {
        eventId: randomUUID(),
        eventType: 'WINDOW_BLUR', // +5
        clientTimestamp: new Date().toISOString()
      };
      return request(app)
        .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
        .set('Authorization', `Bearer ${token}`)
        .send({ events: [event] });
    });

    // Fire all 4 requests concurrently
    const responses = await Promise.all(requests);

    for (const res of responses) {
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.accepted, 1);
    }

    // Verify database row count: exactly 4 events persisted
    const eventsRes = await query(
      `SELECT COUNT(*)::int AS count FROM violation_events WHERE attempt_id = $1;`,
      [attempt.attempt_id]
    );
    assert.equal(eventsRes.rows[0].count, 4);

    // Verify authoritative risk_score: 4 * 5 = 20 (no lost updates!)
    const attemptRes = await query(
      `SELECT risk_score FROM exam_attempts WHERE attempt_id = $1;`,
      [attempt.attempt_id]
    );
    assert.equal(Number(attemptRes.rows[0].risk_score), 20);
  });
});
