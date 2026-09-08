/**
 * @file proctoringRbac.test.js
 * @description Integration tests for RBAC, BOLA/BFLA defenses, timeline queries, and session proctoring summary:
 * GET /api/v1/attempts/:attemptId/events
 * GET /api/v1/sessions/:sessionId/proctoring/summary
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

describe('Proctoring RBAC & Query Endpoints (Integration)', () => {
  let fixture;
  let testStudent;

  before(async () => {
    fixture = await setupProctoringFixture();
    testStudent = await fixture.createStudentAttempt('ACTIVE');

    // Seed 2 events for testStudent
    await request(app)
      .post(`/api/v1/attempts/${testStudent.attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${testStudent.token}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'WINDOW_BLUR',
            clientTimestamp: new Date().toISOString()
          },
          {
            eventId: randomUUID(),
            eventType: 'TAB_HIDDEN',
            clientTimestamp: new Date().toISOString()
          }
        ]
      });
  });

  after(async () => {
    await new Promise((r) => setTimeout(r, 200));
    await closeRabbitMQ();
    await closeRedis();
    await closePool();
  });

  it('should forbid candidates from inspecting violation timelines (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/attempts/${testStudent.attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${testStudent.token}`);

    assert.equal(res.status, 403);
    const errorMsg = res.body.error?.message || res.body.message || '';
    assert.ok(errorMsg.includes('not permitted to inspect proctoring'));
  });

  it('should forbid candidates from querying session proctoring summaries (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${fixture.session.session_id}/proctoring/summary`)
      .set('Authorization', `Bearer ${testStudent.token}`);

    assert.equal(res.status, 403);
  });

  it('should allow assigned invigilator to query attempt timeline and receive paginated events', async () => {
    const res = await request(app)
      .get(`/api/v1/attempts/${testStudent.attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.attemptId, testStudent.attempt.attempt_id);
    assert.equal(res.body.data.events.length, 2);
    assert.equal(res.body.data.riskScore, 10);
    assert.equal(res.body.data.pagination.total, 2);
  });

  it('should forbid unassigned invigilator from querying attempt timeline (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/attempts/${testStudent.attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${fixture.unassignedInvigilator.token}`);

    assert.equal(res.status, 403);
    const errorMsg = res.body.error?.message || res.body.message || '';
    assert.ok(errorMsg.includes('not assigned to this proctoring session'));
  });

  it('should forbid unassigned invigilator from querying session proctoring summary (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${fixture.session.session_id}/proctoring/summary`)
      .set('Authorization', `Bearer ${fixture.unassignedInvigilator.token}`);

    assert.equal(res.status, 403);
  });

  it('should allow assigned invigilator to query session proctoring summary and view roster risk scores', async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${fixture.session.session_id}/proctoring/summary`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.sessionId, fixture.session.session_id);
    assert.ok(res.body.data.candidates.length >= 1);

    const candidate = res.body.data.candidates.find((c) => c.studentId === testStudent.studentUser.userId);
    assert.ok(candidate);
    assert.equal(candidate.riskScore, 10);
    assert.equal(candidate.violationCount, 2);
    assert.ok(candidate.latestViolation);
  });

  it('should allow Faculty and Admin to query proctoring timeline and session summaries globally', async () => {
    // Faculty
    const facTimeline = await request(app)
      .get(`/api/v1/attempts/${testStudent.attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${fixture.faculty.token}`);
    assert.equal(facTimeline.status, 200);

    const facSummary = await request(app)
      .get(`/api/v1/sessions/${fixture.session.session_id}/proctoring/summary`)
      .set('Authorization', `Bearer ${fixture.faculty.token}`);
    assert.equal(facSummary.status, 200);

    // Admin
    const adminTimeline = await request(app)
      .get(`/api/v1/attempts/${testStudent.attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${fixture.admin.token}`);
    assert.equal(adminTimeline.status, 200);

    const adminSummary = await request(app)
      .get(`/api/v1/sessions/${fixture.session.session_id}/proctoring/summary`)
      .set('Authorization', `Bearer ${fixture.admin.token}`);
    assert.equal(adminSummary.status, 200);
  });
});
