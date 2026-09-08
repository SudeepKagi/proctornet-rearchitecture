/**
 * @file proctoringFlags.test.js
 * @description Integration tests for manual proctor flag creation and review status lifecycle:
 * POST /api/v1/attempts/:attemptId/proctoring/flags
 * PATCH /api/v1/attempts/:attemptId/proctoring/flags/:flagId
 * Verifies RBAC, state transitions (ACTIVE -> REVIEWED, ACTIVE -> DISMISSED),
 * and transactional audit log generation (PROCTOR_FLAG_CREATED, PROCTOR_FLAG_REVIEWED).
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

describe('Proctoring Flags Lifecycle & Review Endpoints (Integration)', () => {
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

  it('should allow assigned invigilator to manually create flag and record PROCTOR_FLAG_CREATED in audit_logs', async () => {
    const { attempt } = await fixture.createStudentAttempt('ACTIVE');

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/proctoring/flags`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`)
      .send({
        flagType: 'SUSPICIOUS_GLANCE',
        severity: 'HIGH',
        notes: 'Candidate repeatedly glancing away from webcam.'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.flag_type, 'SUSPICIOUS_GLANCE');
    assert.equal(res.body.data.severity, 'HIGH');
    assert.equal(res.body.data.status, 'ACTIVE');
    assert.equal(res.body.data.raised_by, 'PROCTOR');
    assert.equal(res.body.data.session_id, fixture.session.session_id);

    // Verify audit log
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE action = 'PROCTOR_FLAG_CREATED' AND resource_id = $1;`,
      [res.body.data.flag_id]
    );
    assert.equal(auditRes.rows.length, 1);
    assert.equal(auditRes.rows[0].actor_user_id, fixture.assignedInvigilator.userId);
  });

  it('should reject flag creation by candidate (403) or unassigned invigilator (403)', async () => {
    const { token, attempt } = await fixture.createStudentAttempt('ACTIVE');

    // Candidate attempts flag creation
    const candidateRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/proctoring/flags`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        flagType: 'STUDENT_FLAG'
      });
    assert.equal(candidateRes.status, 403);

    // Unassigned invigilator attempts flag creation
    const unassignedRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/proctoring/flags`)
      .set('Authorization', `Bearer ${fixture.unassignedInvigilator.token}`)
      .send({
        flagType: 'INVIGILATOR_FLAG'
      });
    assert.equal(unassignedRes.status, 403);
  });

  it('should allow assigned staff to transition flag ACTIVE -> REVIEWED with audit record', async () => {
    const { attempt } = await fixture.createStudentAttempt('ACTIVE');

    // 1. Create flag
    const createRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/proctoring/flags`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`)
      .send({
        flagType: 'WINDOW_BLUR_EXCESSIVE',
        severity: 'MEDIUM',
        notes: 'Excessive blur events'
      });
    const flagId = createRes.body.data.flag_id;

    // 2. Review flag (ACTIVE -> REVIEWED)
    const reviewRes = await request(app)
      .patch(`/api/v1/attempts/${attempt.attempt_id}/proctoring/flags/${flagId}`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`)
      .send({
        status: 'REVIEWED',
        notes: 'Verified candidate was accepting an OS notification. Harmless.'
      });

    assert.equal(reviewRes.status, 200);
    assert.equal(reviewRes.body.status, 'success');
    assert.equal(reviewRes.body.data.status, 'REVIEWED');
    assert.equal(reviewRes.body.data.reviewer_user_id, fixture.assignedInvigilator.userId);

    // Verify audit log
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE action = 'PROCTOR_FLAG_REVIEWED' AND resource_id = $1;`,
      [flagId]
    );
    assert.equal(auditRes.rows.length, 1);
    assert.equal(auditRes.rows[0].actor_user_id, fixture.assignedInvigilator.userId);
    assert.equal(auditRes.rows[0].metadata.newStatus, 'REVIEWED');
  });

  it('should allow assigned staff to transition flag ACTIVE -> DISMISSED with audit record', async () => {
    const { attempt } = await fixture.createStudentAttempt('ACTIVE');

    // 1. Create flag
    const createRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/proctoring/flags`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`)
      .send({
        flagType: 'ACCIDENTAL_SWIPE',
        severity: 'LOW',
        notes: 'Trackpad gesture'
      });
    const flagId = createRes.body.data.flag_id;

    // 2. Dismiss flag (ACTIVE -> DISMISSED)
    const dismissRes = await request(app)
      .patch(`/api/v1/attempts/${attempt.attempt_id}/proctoring/flags/${flagId}`)
      .set('Authorization', `Bearer ${fixture.faculty.token}`) // Faculty also permitted
      .send({
        status: 'DISMISSED',
        notes: 'Accidental swipe confirmed.'
      });

    assert.equal(dismissRes.status, 200);
    assert.equal(dismissRes.body.data.status, 'DISMISSED');

    // Verify audit log
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE action = 'PROCTOR_FLAG_REVIEWED' AND resource_id = $1;`,
      [flagId]
    );
    assert.ok(auditRes.rows.length >= 1);
  });

  it('should reject status transitions on already reviewed/dismissed flags (409 Conflict)', async () => {
    const { attempt } = await fixture.createStudentAttempt('ACTIVE');

    // Create flag
    const createRes = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/proctoring/flags`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`)
      .send({ flagType: 'TERMINAL_TEST' });
    const flagId = createRes.body.data.flag_id;

    // Transition to REVIEWED
    await request(app)
      .patch(`/api/v1/attempts/${attempt.attempt_id}/proctoring/flags/${flagId}`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`)
      .send({ status: 'REVIEWED' });

    // Try to transition again -> 409 Conflict
    const secondReviewRes = await request(app)
      .patch(`/api/v1/attempts/${attempt.attempt_id}/proctoring/flags/${flagId}`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`)
      .send({ status: 'DISMISSED' });

    assert.equal(secondReviewRes.status, 409);
    assert.equal(secondReviewRes.body.error?.code || secondReviewRes.body.code, 'FLAG_ALREADY_REVIEWED');
  });
});
