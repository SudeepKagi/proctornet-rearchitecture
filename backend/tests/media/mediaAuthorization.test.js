/**
 * @file mediaAuthorization.test.js
 * @description Integration & BOLA authorization tests for Phase 17 media signaling.
 * Verifies that:
 * - STUDENT can only publish (direction: 'send') and only if they own an ACTIVE attempt in the session.
 * - STUDENT is strictly prohibited from consuming (direction: 'recv').
 * - INVIGILATOR can only consume (direction: 'recv') and only if assigned to the session.
 * - INVIGILATOR is strictly prohibited from publishing (direction: 'send').
 * - FACULTY can only consume (direction: 'recv') and only if they created the exam.
 * - ADMIN can only consume (direction: 'recv') with global visibility.
 * - ADMIN is prohibited from publishing.
 * - Anonymous / no-role participants are rejected.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import { authorizeParticipant } from '../../src/infrastructure/media/mediaSignaling.js';

describe('Phase 17 — Media BOLA Authorization Integration Tests', () => {
  let facultyUser;
  let invigilatorUser;
  let studentUser;
  let otherStudentUser;
  let adminUser;
  let testSessionId;
  let testExamId;
  let testAttemptId;

  before(async () => {
    // 1. Create Faculty
    const fac = await authService.register({
      name: 'Media Faculty',
      email: `media_fac_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [fac.userId]);
    facultyUser = { userId: fac.userId, roles: ['FACULTY'] };

    // 2. Create Invigilator
    const inv = await authService.register({
      name: 'Media Invigilator',
      email: `media_inv_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'INVIGILATOR') ON CONFLICT DO NOTHING;`, [inv.userId]);
    invigilatorUser = { userId: inv.userId, roles: ['INVIGILATOR'] };

    // 3. Create Student
    const stu = await authService.register({
      name: 'Media Student',
      email: `media_stu_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    studentUser = { userId: stu.userId, roles: ['STUDENT'] };

    // 4. Create Other Student
    const otherStu = await authService.register({
      name: 'Other Student',
      email: `other_stu_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    otherStudentUser = { userId: otherStu.userId, roles: ['STUDENT'] };

    // 5. Create Admin
    const adm = await authService.register({
      name: 'Media Admin',
      email: `media_adm_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN') ON CONFLICT DO NOTHING;`, [adm.userId]);
    adminUser = { userId: adm.userId, roles: ['ADMIN'] };

    // 6. Create Exam and Session fixtures
    const examRes = await query(`
      INSERT INTO exams (title, description, created_by, status, duration_minutes, total_marks, passing_marks)
      VALUES ('Media Auth Exam', 'Exam for media testing', $1, 'PUBLISHED', 60, 100, 40)
      RETURNING exam_id;
    `, [fac.userId]);
    testExamId = examRes.rows[0].exam_id;

    const sessionRes = await query(`
      INSERT INTO exam_sessions (exam_id, scheduled_start_time, scheduled_end_time, status)
      VALUES ($1, NOW() - INTERVAL '5 minutes', NOW() + INTERVAL '1 hour', 'ACTIVE')
      RETURNING session_id;
    `, [testExamId]);
    testSessionId = sessionRes.rows[0].session_id;


    // 7. Assign Invigilator to Session
    await query(`
      INSERT INTO session_invigilators (session_id, user_id)
      VALUES ($1, $2);
    `, [testSessionId, inv.userId]);

    // 8. Create ACTIVE Attempt for studentUser
    const attemptRes = await query(`
      INSERT INTO exam_attempts (session_id, student_id, status, started_at, expires_at)
      VALUES ($1, $2, 'ACTIVE', NOW(), NOW() + INTERVAL '1 hour')
      RETURNING attempt_id;
    `, [testSessionId, stu.userId]);
    testAttemptId = attemptRes.rows[0].attempt_id;

  });

  after(async () => {
    // Cleanup fixtures
    if (testAttemptId) {
      await query(`DELETE FROM exam_attempts WHERE attempt_id = $1`, [testAttemptId]);
    }
    if (testSessionId) {
      await query(`DELETE FROM session_invigilators WHERE session_id = $1`, [testSessionId]);
      await query(`DELETE FROM exam_sessions WHERE session_id = $1`, [testSessionId]);
    }
    if (testExamId) {
      await query(`DELETE FROM exams WHERE exam_id = $1`, [testExamId]);
    }
    await closePool();
    await closeRedis();
  });

  describe('Student Authorization Rules', () => {
    it('authorizes student to publish (direction: send) if they own an ACTIVE attempt', async () => {
      const res = await authorizeParticipant({
        sessionId: testSessionId,
        userId: studentUser.userId,
        roles: studentUser.roles,
        direction: 'send'
      });
      assert.equal(res.authorized, true);
      assert.equal(res.attemptId, testAttemptId);
    });

    it('rejects student attempting to consume (direction: recv)', async () => {
      const res = await authorizeParticipant({
        sessionId: testSessionId,
        userId: studentUser.userId,
        roles: studentUser.roles,
        direction: 'recv'
      });
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'CANDIDATE_CANNOT_CONSUME');
    });

    it('rejects student attempting to publish with no active attempt in the session', async () => {
      const res = await authorizeParticipant({
        sessionId: testSessionId,
        userId: otherStudentUser.userId,
        roles: otherStudentUser.roles,
        direction: 'send'
      });
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'NO_ACTIVE_ATTEMPT_IN_SESSION');
    });
  });

  describe('Invigilator Authorization Rules', () => {
    it('authorizes assigned invigilator to consume (direction: recv)', async () => {
      const res = await authorizeParticipant({
        sessionId: testSessionId,
        userId: invigilatorUser.userId,
        roles: invigilatorUser.roles,
        direction: 'recv'
      });
      assert.equal(res.authorized, true);
    });

    it('rejects invigilator attempting to publish (direction: send)', async () => {
      const res = await authorizeParticipant({
        sessionId: testSessionId,
        userId: invigilatorUser.userId,
        roles: invigilatorUser.roles,
        direction: 'send'
      });
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'INVIGILATOR_CANNOT_PUBLISH');
    });

    it('rejects unassigned invigilator from consuming', async () => {
      const fakeSessionId = randomUUID();
      const res = await authorizeParticipant({
        sessionId: fakeSessionId,
        userId: invigilatorUser.userId,
        roles: invigilatorUser.roles,
        direction: 'recv'
      });
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'INVIGILATOR_NOT_ASSIGNED_TO_SESSION');
    });

  });

  describe('Faculty Authorization Rules', () => {
    it('authorizes exam creator faculty to consume (direction: recv)', async () => {
      const res = await authorizeParticipant({
        sessionId: testSessionId,
        userId: facultyUser.userId,
        roles: facultyUser.roles,
        direction: 'recv'
      });
      assert.equal(res.authorized, true);
    });

    it('rejects faculty attempting to publish (direction: send)', async () => {
      const res = await authorizeParticipant({
        sessionId: testSessionId,
        userId: facultyUser.userId,
        roles: facultyUser.roles,
        direction: 'send'
      });
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'FACULTY_CANNOT_PUBLISH');
    });
  });

  describe('Admin and Role Validation Rules', () => {
    it('authorizes admin to consume (direction: recv) globally', async () => {
      const res = await authorizeParticipant({
        sessionId: testSessionId,
        userId: adminUser.userId,
        roles: adminUser.roles,
        direction: 'recv'
      });
      assert.equal(res.authorized, true);
    });

    it('rejects admin attempting to publish (direction: send)', async () => {
      const res = await authorizeParticipant({
        sessionId: testSessionId,
        userId: adminUser.userId,
        roles: adminUser.roles,
        direction: 'send'
      });
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'ADMIN_CANNOT_PUBLISH');
    });

    it('rejects participant with empty roles', async () => {
      const res = await authorizeParticipant({
        sessionId: testSessionId,
        userId: randomUUID(),
        roles: [],
        direction: 'recv'
      });
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'NO_ROLES');
    });
  });
});
