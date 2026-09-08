/**
 * @file proctoringIdempotency.test.js
 * @description Integration tests for client event idempotency, deduplication, and zero double-scoring.
 * Conforms strictly to Phase 14 specifications.
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

describe('Proctoring Event Idempotency & Deduplication (Integration)', () => {
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

  it('should guarantee exactly-once business effect when duplicate events are retried', async () => {
    const { token, attempt } = await fixture.createStudentAttempt('ACTIVE');

    const event1 = {
      eventId: randomUUID(),
      eventType: 'WINDOW_BLUR', // +5
      clientTimestamp: new Date().toISOString()
    };
    const event2 = {
      eventId: randomUUID(),
      eventType: 'COPY_PASTE_ATTEMPT', // +15
      clientTimestamp: new Date().toISOString()
    };

    // 1. Initial Ingestion
    const firstRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({ events: [event1, event2] });

    assert.equal(firstRes.status, 200);
    assert.equal(firstRes.body.data.accepted, 2);
    assert.equal(firstRes.body.data.deduplicated, 0);
    assert.equal(firstRes.body.data.riskScore, 20); // 5 + 15 = 20

    // 2. Retry identical batch
    const retryRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({ events: [event1, event2] });

    assert.equal(retryRes.status, 200);
    assert.equal(retryRes.body.data.accepted, 0);
    assert.equal(retryRes.body.data.deduplicated, 2);
    assert.equal(retryRes.body.data.riskScore, 20); // Remains 20, zero double-increment

    // Verify row count in database remains exactly 2
    const countRes = await query(
      `SELECT COUNT(*)::int AS count FROM violation_events WHERE attempt_id = $1;`,
      [attempt.attempt_id]
    );
    assert.equal(countRes.rows[0].count, 2);

    // Verify attempt risk_score in database remains exactly 20
    const attemptRes = await query(
      `SELECT risk_score FROM exam_attempts WHERE attempt_id = $1;`,
      [attempt.attempt_id]
    );
    assert.equal(Number(attemptRes.rows[0].risk_score), 20);
  });

  it('should handle partially overlapping batches with new and duplicate events', async () => {
    const { token, attempt } = await fixture.createStudentAttempt('ACTIVE');

    const sharedEvent = {
      eventId: randomUUID(),
      eventType: 'TAB_HIDDEN', // +5
      clientTimestamp: new Date().toISOString()
    };

    const newEvent = {
      eventId: randomUUID(),
      eventType: 'FULLSCREEN_EXIT', // +5
      clientTimestamp: new Date().toISOString()
    };

    // First request with sharedEvent
    await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({ events: [sharedEvent] });

    // Second request with sharedEvent + newEvent
    const secondRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({ events: [sharedEvent, newEvent] });

    assert.equal(secondRes.status, 200);
    assert.equal(secondRes.body.data.accepted, 1);
    assert.equal(secondRes.body.data.deduplicated, 1);
    assert.equal(secondRes.body.data.riskScore, 10); // 5 + 5 = 10
  });
});
