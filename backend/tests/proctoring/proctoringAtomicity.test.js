/**
 * @file proctoringAtomicity.test.js
 * @description Integration tests for transactional atomicity during critical proctoring flag creation:
 * Verifies that violation_events, violation_flags, exam_attempts.risk_score, and outbox_events
 * are persisted atomically in a single PostgreSQL transaction.
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

describe('Proctoring Critical Flag Transactional Atomicity (Integration)', () => {
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

  it('should atomically commit violation_events, violation_flags, risk_score, and outbox_events on critical event', async () => {
    const { token, attempt } = await fixture.createStudentAttempt('ACTIVE');

    const devtoolsEvent = {
      eventId: randomUUID(),
      eventType: 'DEVTOOLS_OPEN', // CRITICAL => 40
      clientTimestamp: new Date().toISOString(),
      metadata: { target: 'console' }
    };

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({ events: [devtoolsEvent] });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.accepted, 1);
    assert.equal(res.body.data.riskScore, 40);
    assert.equal(res.body.data.activeFlagsCount, 1);

    // 1. Verify violation_events row
    const eventsRes = await query(
      `SELECT * FROM violation_events WHERE attempt_id = $1 AND event_type = 'DEVTOOLS_OPEN';`,
      [attempt.attempt_id]
    );
    assert.equal(eventsRes.rows.length, 1);
    assert.equal(eventsRes.rows[0].severity, 'CRITICAL');

    // 2. Verify violation_flags row
    const flagsRes = await query(
      `SELECT * FROM violation_flags WHERE attempt_id = $1 AND flag_type = 'DEVTOOLS_DETECTED';`,
      [attempt.attempt_id]
    );
    assert.equal(flagsRes.rows.length, 1);
    assert.equal(flagsRes.rows[0].severity, 'CRITICAL');
    assert.equal(flagsRes.rows[0].raised_by, 'SYSTEM');

    // 3. Verify exam_attempts.risk_score
    const attemptRes = await query(
      `SELECT risk_score FROM exam_attempts WHERE attempt_id = $1;`,
      [attempt.attempt_id]
    );
    assert.equal(Number(attemptRes.rows[0].risk_score), 40);

    // 4. Verify outbox_events row
    const outboxRes = await query(
      `SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'PROCTORING_FLAG_RAISED';`,
      [attempt.attempt_id]
    );
    assert.ok(outboxRes.rows.length >= 1);
    const outboxPayload = outboxRes.rows[0].payload;
    assert.equal(outboxPayload.flagType, 'DEVTOOLS_DETECTED');
    assert.equal(outboxPayload.severity, 'CRITICAL');
  });
});
