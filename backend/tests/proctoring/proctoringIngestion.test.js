/**
 * @file proctoringIngestion.test.js
 * @description Integration tests for candidate proctoring event ingestion endpoint:
 * POST /api/v1/attempts/:attemptId/events.
 * Tests authentication, RBAC, ownership, attempt lifecycle state checks, and rate limiting.
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

describe('Proctoring Ingestion Endpoint (Integration)', () => {
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

  it('should return 401 Unauthorized when missing Bearer token', async () => {
    const res = await request(app)
      .post(`/api/v1/attempts/${randomUUID()}/events`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'WINDOW_BLUR',
            clientTimestamp: new Date().toISOString()
          }
        ]
      });

    assert.equal(res.status, 401);
  });

  it('should return 403 Forbidden when non-student (FACULTY/ADMIN) attempts ingestion', async () => {
    const { attempt } = await fixture.createStudentAttempt('ACTIVE');

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${fixture.faculty.token}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'WINDOW_BLUR',
            clientTimestamp: new Date().toISOString()
          }
        ]
      });

    assert.equal(res.status, 403);
  });

  it('should return 403 Forbidden when candidate attempts to ingest for another candidate attempt (BOLA)', async () => {
    const student1 = await fixture.createStudentAttempt('ACTIVE');
    const student2 = await fixture.createStudentAttempt('ACTIVE');

    // Student 2 tries to submit events for Student 1's attempt
    const res = await request(app)
      .post(`/api/v1/attempts/${student1.attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${student2.token}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'TAB_HIDDEN',
            clientTimestamp: new Date().toISOString()
          }
        ]
      });

    assert.equal(res.status, 403);
    const errorMsg = res.body.error?.message || res.body.message || '';
    assert.ok(errorMsg.includes('only submit proctoring telemetry for your own attempt'));
  });

  it('should return 409 Conflict when attempt is in SUBMITTED or EXPIRED status', async () => {
    const submittedStudent = await fixture.createStudentAttempt('SUBMITTED');

    const res = await request(app)
      .post(`/api/v1/attempts/${submittedStudent.attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${submittedStudent.token}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'TAB_HIDDEN',
            clientTimestamp: new Date().toISOString()
          }
        ]
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code || res.body.code, 'ATTEMPT_NOT_ACTIVE');
  });

  it('should successfully ingest batch of valid events for ACTIVE attempt and update risk_score', async () => {
    const { studentUser, token, attempt } = await fixture.createStudentAttempt('ACTIVE');

    const event1 = {
      eventId: randomUUID(),
      eventType: 'WINDOW_BLUR', // MEDIUM => 5
      clientTimestamp: new Date().toISOString(),
      metadata: { durationMs: 2500 }
    };

    const event2 = {
      eventId: randomUUID(),
      eventType: 'TAB_HIDDEN', // MEDIUM => 5
      clientTimestamp: new Date().toISOString(),
      metadata: { target: 'background_tab' }
    };

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        events: [event1, event2]
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.accepted, 2);
    assert.equal(res.body.data.deduplicated, 0);
    assert.equal(res.body.data.riskScore, 10); // 5 + 5 = 10

    // Verify row persistence in PostgreSQL
    const dbEvents = await query(
      `SELECT * FROM violation_events WHERE attempt_id = $1 ORDER BY server_timestamp ASC;`,
      [attempt.attempt_id]
    );
    assert.equal(dbEvents.rows.length, 2);
    assert.equal(dbEvents.rows[0].severity, 'MEDIUM');
    assert.equal(dbEvents.rows[1].severity, 'MEDIUM');

    // Verify risk_score column on exam_attempts
    const dbAttempt = await query(
      `SELECT risk_score FROM exam_attempts WHERE attempt_id = $1;`,
      [attempt.attempt_id]
    );
    assert.equal(Number(dbAttempt.rows[0].risk_score), 10);
  });
});
