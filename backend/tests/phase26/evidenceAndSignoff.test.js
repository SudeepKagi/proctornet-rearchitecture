/**
 * @file evidenceAndSignoff.test.js
 * @description Targeted tests for Phase 26 Workstream H: Secure Evidence Inspection, Violation Timeline, Incident Reporting, and Session Sign-Off.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPool, query } from '../../src/infrastructure/postgres/pool.js';
import * as interventionsService from '../../src/modules/interventions/interventions.service.js';
import * as evidenceService from '../../src/modules/evidence/evidence.service.js';
import * as proctoringService from '../../src/modules/proctoring/proctoring.service.js';

describe('Phase 26 Workstream H: Evidence Inspection, Incident Reporting & Session Sign-Off', () => {
  let invigilatorUser, unassignedInvigilator, studentUser;
  let testExamId, testSessionId, testAttemptId, testEvidenceId;

  before(async () => {
    const tag = Date.now() + Math.floor(Math.random() * 1000);

    // 1. Create Users
    const invRes = await query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ('Invigilator Signoff', $1, 'hash') RETURNING user_id;
    `, [`inv.signoff.${tag}@example.com`]);
    invigilatorUser = invRes.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'INVIGILATOR')`, [invigilatorUser]);

    const unassignedRes = await query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ('Invigilator Unassigned', $1, 'hash') RETURNING user_id;
    `, [`inv.unassigned.${tag}@example.com`]);
    unassignedInvigilator = unassignedRes.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'INVIGILATOR')`, [unassignedInvigilator]);

    const stuRes = await query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ('Student Signoff', $1, 'hash') RETURNING user_id;
    `, [`stu.signoff.${tag}@example.com`]);
    studentUser = stuRes.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT')`, [studentUser]);

    // 2. Create Exam, Session, Invigilator mapping
    const examRes = await query(`
      INSERT INTO exams (title, description, duration_minutes, total_marks, passing_marks, created_by, status)
      VALUES ('Signoff Exam Test', 'Evidence and Signoff Test', 60, 100, 40, $1, 'PUBLISHED')
      RETURNING exam_id;
    `, [invigilatorUser]);
    testExamId = examRes.rows[0].exam_id;

    const sessRes = await query(`
      INSERT INTO exam_sessions (exam_id, scheduled_start_time, scheduled_end_time, status)
      VALUES ($1, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 hour', 'ACTIVE')
      RETURNING session_id;
    `, [testExamId]);
    testSessionId = sessRes.rows[0].session_id;

    await query(`
      INSERT INTO session_invigilators (session_id, user_id, role)
      VALUES ($1, $2, 'PRIMARY');
    `, [testSessionId, invigilatorUser]);

    await query(`
      INSERT INTO session_students (session_id, student_id)
      VALUES ($1, $2);
    `, [testSessionId, studentUser]);

    // 3. Attempt
    const attRes = await query(`
      INSERT INTO exam_attempts (session_id, student_id, status, started_at, submitted_at, expires_at)
      VALUES ($1, $2, 'SUBMITTED', NOW() - INTERVAL '40 minutes', NOW() - INTERVAL '5 minutes', NOW() + INTERVAL '20 minutes')
      RETURNING attempt_id;
    `, [testSessionId, studentUser]);
    testAttemptId = attRes.rows[0].attempt_id;

    // 4. Evidence Record in AVAILABLE status
    const evRes = await query(`
      INSERT INTO evidence_records (
        attempt_id, session_id, student_id, evidence_type, content_type, declared_byte_size, actual_byte_size,
        bucket_name, object_key, status, s3_version_id, upload_expires_at, confirmed_at, retention_expires_at
      )
      VALUES (
        $1, $2, $3, 'WEBCAM_SNAPSHOT', 'image/jpeg', 20480, 20480,
        'proctornet-evidence-private', $4, 'AVAILABLE', 'v123', NOW() + INTERVAL '1 hour', NOW(), NOW() + INTERVAL '90 days'
      )
      RETURNING evidence_id;
    `, [testAttemptId, testSessionId, studentUser, `test/snapshot_${tag}.jpg`]);
    testEvidenceId = evRes.rows[0].evidence_id;

    // 5. Proctoring Event
    await query(`
      INSERT INTO violation_events (
        attempt_id, event_type, severity, metadata, client_timestamp, server_timestamp
      )
      VALUES (
        $1, 'MULTIPLE_FACES_DETECTED', 'HIGH', '{"faceCount": 2}', NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '20 minutes'
      );
    `, [testAttemptId]);
  });

  after(async () => {
    if (testExamId) {
      await query(`DELETE FROM violation_flags WHERE session_id = $1;`, [testSessionId]);
      await query(`DELETE FROM violation_events WHERE attempt_id = $1;`, [testAttemptId]);
      await query(`DELETE FROM evidence_records WHERE attempt_id = $1;`, [testAttemptId]);
    }
    const pool = getPool();
    await pool.end();
  });

  describe('Evidence Inspection & Violation Timeline', () => {
    test('should allow assigned staff to list evidence for attempt', async () => {
      const result = await evidenceService.listEvidence(
        testAttemptId,
        { userId: invigilatorUser, roles: ['INVIGILATOR'] },
        { page: 1, limit: 10 }
      );

      assert.strictEqual(result.attemptId, testAttemptId);
      assert.strictEqual(result.evidence.length, 1);
      assert.strictEqual(result.evidence[0].evidenceId, testEvidenceId);
      assert.strictEqual(result.evidence[0].evidenceType, 'WEBCAM_SNAPSHOT');
    });

    test('should reject unassigned invigilator from inspecting evidence', async () => {
      await assert.rejects(
        () => evidenceService.listEvidence(
          testAttemptId,
          { userId: unassignedInvigilator, roles: ['INVIGILATOR'] },
          { page: 1, limit: 10 }
        ),
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });

    test('should retrieve attempt violation timeline with events', async () => {
      const timeline = await proctoringService.getAttemptTimeline(
        testAttemptId,
        { userId: invigilatorUser, roles: ['INVIGILATOR'] },
        {}
      );

      assert.ok(timeline);
      assert.strictEqual(timeline.attemptId, testAttemptId);
      assert.ok(timeline.events.length >= 1);
      assert.strictEqual(timeline.events[0].eventType, 'MULTIPLE_FACES_DETECTED');
    });
  });

  describe('Post-Session Incident Reporting', () => {
    test('should allow assigned invigilator to file formal incident report', async () => {
      const incident = await interventionsService.reportSessionIncident({
        sessionId: testSessionId,
        attemptId: testAttemptId,
        incidentType: 'COLLUSION',
        severity: 'HIGH',
        description: 'Candidate was observed communicating with second individual off-camera during section 2.',
        evidenceIds: [testEvidenceId],
        actionTaken: 'Intervention warning issued; attempt flagged for academic board review.',
        user: { userId: invigilatorUser, name: 'Invigilator Signoff', roles: ['INVIGILATOR'] }
      });

      assert.ok(incident);
      assert.strictEqual(incident.flag_type, 'COLLUSION');
      assert.strictEqual(incident.severity, 'HIGH');
      assert.strictEqual(incident.raised_by, 'PROCTOR');
      assert.strictEqual(incident.details.description, 'Candidate was observed communicating with second individual off-camera during section 2.');
      assert.deepStrictEqual(incident.details.evidenceIds, [testEvidenceId]);
    });

    test('should list incident reports filed for the session', async () => {
      const incidents = await interventionsService.getSessionIncidents(
        testSessionId,
        { userId: invigilatorUser, roles: ['INVIGILATOR'] }
      );

      assert.ok(incidents.length >= 1);
      assert.strictEqual(incidents[0].flag_type, 'COLLUSION');
      assert.ok(incidents[0].candidate_email.startsWith('stu.signoff.'));
    });

    test('should reject unassigned invigilator from filing incident reports', async () => {
      await assert.rejects(
        () => interventionsService.reportSessionIncident({
          sessionId: testSessionId,
          attemptId: testAttemptId,
          incidentType: 'COLLUSION',
          severity: 'HIGH',
          description: 'Unauthorized report',
          actionTaken: 'None',
          user: { userId: unassignedInvigilator, roles: ['INVIGILATOR'] }
        }),
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });
  });

  describe('Session Sign-Off & Closure', () => {
    test('should allow assigned invigilator to sign off session and conclude it', async () => {
      const signOffResult = await interventionsService.signOffSession({
        sessionId: testSessionId,
        checklist: {
          hardwareVerified: true,
          roomChecked: true,
          allAttemptsFinalized: true,
          incidentsLogged: true
        },
        notes: 'Session completed smoothly with one reported collusion incident.',
        signature: 'Invigilator Signoff',
        user: { userId: invigilatorUser, name: 'Invigilator Signoff', roles: ['INVIGILATOR'] }
      });

      assert.ok(signOffResult);
      assert.strictEqual(signOffResult.status, 'CONCLUDED');
      assert.strictEqual(signOffResult.signature, 'Invigilator Signoff');
      assert.strictEqual(signOffResult.summary.enrolledCount, 1);
      assert.strictEqual(signOffResult.summary.submittedCount, 1);
      assert.strictEqual(signOffResult.summary.incidentCount, 1);

      // Verify PostgreSQL exam_sessions state
      const sessCheck = await query(`SELECT status FROM exam_sessions WHERE session_id = $1`, [testSessionId]);
      assert.strictEqual(sessCheck.rows[0].status, 'CONCLUDED');
    });

    test('should retrieve session sign-off status and audit history', async () => {
      const status = await interventionsService.getSessionSignOffStatus(
        testSessionId,
        { userId: invigilatorUser, roles: ['INVIGILATOR'] }
      );

      assert.strictEqual(status.isSignedOff, true);
      assert.ok(status.signOff);
      assert.strictEqual(status.signOff.signature, 'Invigilator Signoff');
      assert.strictEqual(status.summary.submittedCount, 1);
    });

    test('should reject unassigned invigilator from querying session sign-off', async () => {
      await assert.rejects(
        () => interventionsService.getSessionSignOffStatus(
          testSessionId,
          { userId: unassignedInvigilator, roles: ['INVIGILATOR'] }
        ),
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });
  });
});
