/**
 * @file realtimeInterventions.test.js
 * @description Targeted tests for Phase 26 Workstream F: Server-authoritative Realtime Interventions, Room Announcements, 1:1 Messages, Remote Pause/Resume/Terminate, Race-safety, and Idempotency.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPool, query } from '../../src/infrastructure/postgres/pool.js';
import * as interventionsService from '../../src/modules/interventions/interventions.service.js';

describe('Phase 26 Workstream F: Realtime Interventions, State Transitions & Race Safety', () => {
  let invigilatorUser, unassignedInvigilator, adminUser, studentUser;
  let testExamId, testSessionId, testAttemptId;

  before(async () => {
    const tag = Date.now() + Math.floor(Math.random() * 1000);

    // 1. Create Users
    const invRes = await query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ('Invigilator Alpha', $1, 'hash') RETURNING user_id;
    `, [`inv.alpha.${tag}@example.com`]);
    invigilatorUser = invRes.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'INVIGILATOR')`, [invigilatorUser]);

    const unassignedRes = await query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ('Invigilator Beta', $1, 'hash') RETURNING user_id;
    `, [`inv.beta.${tag}@example.com`]);
    unassignedInvigilator = unassignedRes.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'INVIGILATOR')`, [unassignedInvigilator]);

    const admRes = await query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ('Admin Inv', $1, 'hash') RETURNING user_id;
    `, [`admin.inv.${tag}@example.com`]);
    adminUser = admRes.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN')`, [adminUser]);

    const stuRes = await query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ('Student Candidate', $1, 'hash') RETURNING user_id;
    `, [`candidate.${tag}@example.com`]);
    studentUser = stuRes.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT')`, [studentUser]);

    // 2. Exam, Session, Invigilator Assignment & Attempt
    const examRes = await query(`
      INSERT INTO exams (title, description, duration_minutes, total_marks, passing_marks, created_by, status)
      VALUES ('Live Exam Interventions', 'Realtime Interventions Test', 60, 100, 40, $1, 'PUBLISHED')
      RETURNING exam_id;
    `, [invigilatorUser]);
    testExamId = examRes.rows[0].exam_id;

    const sessRes = await query(`
      INSERT INTO exam_sessions (exam_id, scheduled_start_time, scheduled_end_time, status)
      VALUES ($1, NOW() - INTERVAL '10 minutes', NOW() + INTERVAL '50 minutes', 'ACTIVE')
      RETURNING session_id;
    `, [testExamId]);
    testSessionId = sessRes.rows[0].session_id;

    // Assign invigilatorUser to session
    await query(`
      INSERT INTO session_invigilators (session_id, user_id, role)
      VALUES ($1, $2, 'PRIMARY');
    `, [testSessionId, invigilatorUser]);

    // Enroll student
    await query(`
      INSERT INTO session_students (session_id, student_id)
      VALUES ($1, $2);
    `, [testSessionId, studentUser]);

    // Create active attempt
    const attRes = await query(`
      INSERT INTO exam_attempts (session_id, student_id, status, started_at, expires_at)
      VALUES ($1, $2, 'ACTIVE', NOW() - INTERVAL '5 minutes', NOW() + INTERVAL '55 minutes')
      RETURNING attempt_id;
    `, [testSessionId, studentUser]);
    testAttemptId = attRes.rows[0].attempt_id;
  });

  after(async () => {
    if (testExamId) {
      await query(`DELETE FROM proctor_interventions WHERE session_id = $1;`, [testSessionId]);
      await query(`DELETE FROM exam_attempts WHERE session_id = $1;`, [testSessionId]);
      await query(`DELETE FROM session_students WHERE session_id = $1;`, [testSessionId]);
      await query(`DELETE FROM session_invigilators WHERE session_id = $1;`, [testSessionId]);
      await query(`DELETE FROM exam_sessions WHERE session_id = $1;`, [testSessionId]);
      await query(`DELETE FROM exams WHERE exam_id = $1;`, [testExamId]);
    }
    const pool = getPool();
    await pool.end();
  });

  describe('Session Announcements & 1:1 Candidate Messaging', () => {
    test('should allow assigned invigilator to broadcast room announcement', async () => {
      const announcement = await interventionsService.broadcastAnnouncement({
        sessionId: testSessionId,
        message: '15 minutes remaining. Please review your answers.',
        user: { userId: invigilatorUser, name: 'Invigilator Alpha', roles: ['INVIGILATOR'] }
      });

      assert.ok(announcement);
      assert.strictEqual(announcement.type, 'ANNOUNCEMENT');
      assert.strictEqual(announcement.message, '15 minutes remaining. Please review your answers.');
      assert.strictEqual(announcement.session_id, testSessionId);
    });

    test('should reject unassigned invigilator from broadcasting announcement', async () => {
      await assert.rejects(
        () => interventionsService.broadcastAnnouncement({
          sessionId: testSessionId,
          message: 'Unauthorized announcement',
          user: { userId: unassignedInvigilator, roles: ['INVIGILATOR'] }
        }),
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });

    test('should allow invigilator to send direct warning message to candidate', async () => {
      const warning = await interventionsService.sendCandidateMessage({
        attemptId: testAttemptId,
        message: 'Multiple faces detected in camera feed. Maintain single-occupant environment.',
        reason: 'PROCTORING_ANOMALY',
        isWarning: true,
        user: { userId: invigilatorUser, name: 'Invigilator Alpha', roles: ['INVIGILATOR'] }
      });

      assert.ok(warning);
      assert.strictEqual(warning.type, 'WARNING_MESSAGE');
      assert.strictEqual(warning.attempt_id, testAttemptId);
      assert.strictEqual(warning.reason, 'PROCTORING_ANOMALY');
    });
  });

  describe('Remote Pause & Resume Lifecycle with Authoritative Timer Synchronization', () => {
    test('should remotely pause active attempt with mandatory rationale and freeze timer', async () => {
      const pauseResult = await interventionsService.pauseCandidateAttempt({
        attemptId: testAttemptId,
        reason: 'Investigating secondary device reflection',
        user: { userId: invigilatorUser, roles: ['INVIGILATOR'] }
      });

      assert.strictEqual(pauseResult.status, 'PAUSED');
      assert.ok(pauseResult.pausedAt);

      // Verify PostgreSQL authoritative state
      const attCheck = await query(`SELECT status, paused_at, pause_reason FROM exam_attempts WHERE attempt_id = $1`, [testAttemptId]);
      assert.strictEqual(attCheck.rows[0].status, 'PAUSED');
      assert.ok(attCheck.rows[0].paused_at);
      assert.strictEqual(attCheck.rows[0].pause_reason, 'Investigating secondary device reflection');
    });

    test('should handle duplicate pause idempotently', async () => {
      const dupPause = await interventionsService.pauseCandidateAttempt({
        attemptId: testAttemptId,
        reason: 'Duplicate pause request',
        user: { userId: invigilatorUser, roles: ['INVIGILATOR'] }
      });

      assert.strictEqual(dupPause.status, 'PAUSED');
      assert.strictEqual(dupPause.alreadyPaused, true);
    });

    test('should remotely resume paused attempt, extend expires_at and accumulate total_paused_ms', async () => {
      // Simulate 1.5 seconds pause delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      const resumeResult = await interventionsService.resumeCandidateAttempt({
        attemptId: testAttemptId,
        reason: 'Inspection completed, clear to proceed',
        extensionSeconds: 60,
        user: { userId: invigilatorUser, roles: ['INVIGILATOR'] }
      });

      assert.strictEqual(resumeResult.status, 'ACTIVE');
      assert.ok(resumeResult.expiresAt);
      assert.ok(resumeResult.totalPausedMs >= 1000, `Expected paused ms >= 1000, got ${resumeResult.totalPausedMs}`);

      // Verify PostgreSQL state
      const attCheck = await query(`SELECT status, paused_at, total_paused_ms FROM exam_attempts WHERE attempt_id = $1`, [testAttemptId]);
      assert.strictEqual(attCheck.rows[0].status, 'ACTIVE');
      assert.strictEqual(attCheck.rows[0].paused_at, null);
      assert.ok(Number(attCheck.rows[0].total_paused_ms) >= 1000);
    });
  });

  describe('Emergency Termination & Concurrency Race Protection', () => {
    test('should support idempotency keys: replay existing intervention without duplicates', async () => {
      const ikey = 'idempotent-key-test-1234';

      const res1 = await interventionsService.sendCandidateMessage({
        attemptId: testAttemptId,
        message: 'Idempotency test message',
        user: { userId: invigilatorUser, roles: ['INVIGILATOR'] },
        idempotencyKey: ikey
      });

      const res2 = await interventionsService.sendCandidateMessage({
        attemptId: testAttemptId,
        message: 'Idempotency test message',
        user: { userId: invigilatorUser, roles: ['INVIGILATOR'] },
        idempotencyKey: ikey
      });

      assert.strictEqual(res1.intervention_id, res2.intervention_id);
      assert.strictEqual(res2.idempotentReplay, true);
    });

    test('should reject PAUSE vs SUBMIT race: cannot pause an already submitted attempt', async () => {
      const stu2Res = await query(`
        INSERT INTO users (name, email, password_hash)
        VALUES ('Student Submitted', 'student.sub.${Date.now()}@example.com', 'hash')
        RETURNING user_id;
      `);
      const student2 = stu2Res.rows[0].user_id;
      await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT')`, [student2]);
      await query(`INSERT INTO session_students (session_id, student_id) VALUES ($1, $2)`, [testSessionId, student2]);

      // Create another attempt and submit it
      const subAtt = (await query(`
        INSERT INTO exam_attempts (session_id, student_id, status, started_at, submitted_at, expires_at)
        VALUES ($1, $2, 'SUBMITTED', NOW() - INTERVAL '30 minutes', NOW(), NOW() + INTERVAL '30 minutes')
        RETURNING attempt_id;
      `, [testSessionId, student2])).rows[0].attempt_id;

      await assert.rejects(
        () => interventionsService.pauseCandidateAttempt({
          attemptId: subAtt,
          reason: 'Attempting to pause submitted exam',
          user: { userId: invigilatorUser, roles: ['INVIGILATOR'] }
        }),
        (err) => {
          assert.strictEqual(err.statusCode, 409);
          return true;
        }
      );

      // Clean up subAtt
      await query(`DELETE FROM exam_attempts WHERE attempt_id = $1`, [subAtt]);
      await query(`DELETE FROM session_students WHERE session_id = $1 AND student_id = $2`, [testSessionId, student2]);
    });

    test('should emergency terminate active attempt and lock against any further state change', async () => {
      const termResult = await interventionsService.terminateCandidateAttempt({
        attemptId: testAttemptId,
        reason: 'Confirmed academic dishonesty: unauthorized external communication',
        user: { userId: invigilatorUser, roles: ['INVIGILATOR'] }
      });

      assert.strictEqual(termResult.status, 'TERMINATED');
      assert.ok(termResult.terminatedAt);

      // Verify PostgreSQL state
      const attCheck = await query(`SELECT status, termination_reason FROM exam_attempts WHERE attempt_id = $1`, [testAttemptId]);
      assert.strictEqual(attCheck.rows[0].status, 'TERMINATED');
      assert.strictEqual(attCheck.rows[0].termination_reason, 'Confirmed academic dishonesty: unauthorized external communication');

      // Attempting to resume terminated attempt must fail with 409 Conflict
      await assert.rejects(
        () => interventionsService.resumeCandidateAttempt({
          attemptId: testAttemptId,
          reason: 'Cannot resume terminated exam',
          user: { userId: invigilatorUser, roles: ['INVIGILATOR'] }
        }),
        (err) => {
          assert.strictEqual(err.statusCode, 409);
          return true;
        }
      );
    });

    test('should retrieve session and attempt intervention history', async () => {
      const sessionHistory = await interventionsService.getSessionInterventions(testSessionId, { userId: invigilatorUser, roles: ['INVIGILATOR'] });
      assert.ok(sessionHistory.length >= 3);

      const attemptHistory = await interventionsService.getAttemptInterventions(testAttemptId, { userId: studentUser, roles: ['STUDENT'] });
      assert.ok(attemptHistory.length >= 2);
    });
  });
});
