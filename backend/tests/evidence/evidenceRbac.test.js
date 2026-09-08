/**
 * @file evidenceRbac.test.js
 * @description RBAC, BOLA, and audit trail verification for Phase 15 Evidence Storage.
 * Validates role-based permissions for Student, Invigilator, Faculty, and Admin,
 * ensuring strict isolation and preventing cross-student/cross-session tampering.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { app } from '../../src/app.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { closeRabbitMQ } from '../../src/infrastructure/rabbitmq/client.js';
import { setupProctoringFixture, setupMockS3, resetMockS3 } from './evidenceTestHelper.js';
import * as authService from '../../src/modules/auth/auth.service.js';

describe('Phase 15 Evidence Storage — RBAC & BOLA Tests', () => {
  let fixture;

  before(async () => {
    fixture = await setupProctoringFixture();
    setupMockS3();
  });

  after(async () => {
    resetMockS3();
    await new Promise((r) => setTimeout(r, 200));
    await closeRabbitMQ();
    await closeRedis();
    await closePool();
  });

  it('1. Candidate cannot initiate upload for another student attempt (BOLA)', async () => {
    const studentA = await fixture.createStudentAttempt('ACTIVE');
    const studentB = await fixture.createStudentAttempt('ACTIVE');

    // Student A tries to upload to Student B's attempt
    const res = await request(app)
      .post(`/api/v1/attempts/${studentB.attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 102400
      });

    assert.equal(res.status, 403);
    assert.match(res.body.error?.message, /Forbidden/i);
  });

  it('2. Candidate cannot confirm upload for another student evidence (BOLA)', async () => {
    const studentA = await fixture.createStudentAttempt('ACTIVE');
    const studentB = await fixture.createStudentAttempt('ACTIVE');

    // Student A creates an upload record
    const initRes = await request(app)
      .post(`/api/v1/attempts/${studentA.attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 102400
      });
    const evidenceId = initRes.body.data.evidenceId;

    // Student B tries to confirm Student A's evidence
    const confirmRes = await request(app)
      .post(`/api/v1/attempts/${studentA.attempt.attempt_id}/evidence/${evidenceId}/confirm`)
      .set('Authorization', `Bearer ${studentB.token}`)
      .send({});

    assert.equal(confirmRes.status, 403);
    assert.match(confirmRes.body.error?.message, /Forbidden/i);
  });

  it('3. Candidate is strictly denied list, playback URL, and delete access', async () => {
    const student = await fixture.createStudentAttempt('ACTIVE');

    // Candidate lists evidence -> 403
    const listRes = await request(app)
      .get(`/api/v1/attempts/${student.attempt.attempt_id}/evidence`)
      .set('Authorization', `Bearer ${student.token}`);
    assert.equal(listRes.status, 403);

    // Candidate requests playback URL -> 403
    const urlRes = await request(app)
      .get(`/api/v1/attempts/${student.attempt.attempt_id}/evidence/${randomUUID()}/url`)
      .set('Authorization', `Bearer ${student.token}`);
    assert.equal(urlRes.status, 403);

    // Candidate deletes evidence -> 403
    const delRes = await request(app)
      .delete(`/api/v1/attempts/${student.attempt.attempt_id}/evidence/${randomUUID()}`)
      .set('Authorization', `Bearer ${student.token}`);
    assert.equal(delRes.status, 403);
  });

  it('4. Unassigned invigilator is denied list and playback access', async () => {
    const student = await fixture.createStudentAttempt('ACTIVE');

    // List
    const listRes = await request(app)
      .get(`/api/v1/attempts/${student.attempt.attempt_id}/evidence`)
      .set('Authorization', `Bearer ${fixture.unassignedInvigilator.token}`);
    assert.equal(listRes.status, 403);

    // Playback
    const urlRes = await request(app)
      .get(`/api/v1/attempts/${student.attempt.attempt_id}/evidence/${randomUUID()}/url`)
      .set('Authorization', `Bearer ${fixture.unassignedInvigilator.token}`);
    assert.equal(urlRes.status, 403);
  });

  it('5. Assigned invigilator is permitted list and playback, but strictly denied delete', async () => {
    const student = await fixture.createStudentAttempt('ACTIVE');

    const initRes = await request(app)
      .post(`/api/v1/attempts/${student.attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 102400
      });
    const evidenceId = initRes.body.data.evidenceId;

    await request(app)
      .post(`/api/v1/attempts/${student.attempt.attempt_id}/evidence/${evidenceId}/confirm`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({});

    // List -> 200 OK
    const listRes = await request(app)
      .get(`/api/v1/attempts/${student.attempt.attempt_id}/evidence`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`);
    assert.equal(listRes.status, 200);

    // Playback -> 200 OK
    const urlRes = await request(app)
      .get(`/api/v1/attempts/${student.attempt.attempt_id}/evidence/${evidenceId}/url`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`);
    assert.equal(urlRes.status, 200);

    // Delete -> 403 Forbidden
    const delRes = await request(app)
      .delete(`/api/v1/attempts/${student.attempt.attempt_id}/evidence/${evidenceId}`)
      .set('Authorization', `Bearer ${fixture.assignedInvigilator.token}`);
    assert.equal(delRes.status, 403);
  });

  it('6. Non-owning faculty is denied purge access; owning faculty and admin are permitted', async () => {
    const student = await fixture.createStudentAttempt('ACTIVE');

    // Create a second non-owning faculty user
    const otherFacultyReg = await authService.register({
      name: 'Other Faculty',
      email: `other_faculty_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY');`, [otherFacultyReg.userId]);
    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'STUDENT';`, [otherFacultyReg.userId]);
    const otherLogin = await authService.login({ email: otherFacultyReg.email, password: 'Password123!' });

    const initRes = await request(app)
      .post(`/api/v1/attempts/${student.attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 102400
      });
    const evidenceId = initRes.body.data.evidenceId;

    await request(app)
      .post(`/api/v1/attempts/${student.attempt.attempt_id}/evidence/${evidenceId}/confirm`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({});

    // Non-owning faculty tries to delete -> 403 Forbidden
    const otherDel = await request(app)
      .delete(`/api/v1/attempts/${student.attempt.attempt_id}/evidence/${evidenceId}`)
      .set('Authorization', `Bearer ${otherLogin.accessToken}`);
    assert.equal(otherDel.status, 403);

    // Owning faculty deletes -> 200 OK
    const ownerDel = await request(app)
      .delete(`/api/v1/attempts/${student.attempt.attempt_id}/evidence/${evidenceId}`)
      .set('Authorization', `Bearer ${fixture.faculty.token}`);
    assert.equal(ownerDel.status, 200);

    // Create another evidence record for Admin delete test
    const init2 = await request(app)
      .post(`/api/v1/attempts/${student.attempt.attempt_id}/evidence/upload-url`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 102400
      });
    await request(app)
      .post(`/api/v1/attempts/${student.attempt.attempt_id}/evidence/${init2.body.data.evidenceId}/confirm`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({});

    // Admin deletes -> 200 OK
    const adminDel = await request(app)
      .delete(`/api/v1/attempts/${student.attempt.attempt_id}/evidence/${init2.body.data.evidenceId}`)
      .set('Authorization', `Bearer ${fixture.admin.token}`);
    assert.equal(adminDel.status, 200);
  });
});
