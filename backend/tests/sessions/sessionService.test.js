/**
 * @file sessionService.test.js
 * @description Unit & integration tests for Exam Sessions, Scheduling, Capacity Locks, and Assignments.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as sessionService from '../../src/modules/sessions/sessions.service.js';
import * as examService from '../../src/modules/exams/exams.service.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import { ExamStatus } from '../../src/domain/exam/examStates.js';
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../../src/utils/errors.js';

describe('Session Service & Scheduling Invariants', () => {
  let facultyUser;
  let adminUser;
  let proctorUser;
  let studentUser1;
  let studentUser2;
  let studentUser3;
  let testSubject;
  let testTopic;
  let testRoomSmall; // capacity 2
  let testRoomLarge; // capacity 50
  let publishedExam;

  before(async () => {
    // 1. Create Users
    const faculty = await authService.register({
      name: 'Dr. Scheduler',
      email: `faculty_sched_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'FACULTY')
      ON CONFLICT DO NOTHING;
    `, [faculty.userId]);
    facultyUser = { userId: faculty.userId, roles: ['FACULTY', 'STUDENT'] };

    const admin = await authService.register({
      name: 'Admin Scheduler',
      email: `admin_sched_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'ADMIN')
      ON CONFLICT DO NOTHING;
    `, [admin.userId]);
    adminUser = { userId: admin.userId, roles: ['ADMIN', 'STUDENT'] };

    const proctor = await authService.register({
      name: 'Proctor Invigilator',
      email: `proctor_sched_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'INVIGILATOR')
      ON CONFLICT DO NOTHING;
    `, [proctor.userId]);
    proctorUser = { userId: proctor.userId, roles: ['INVIGILATOR', 'STUDENT'] };

    const s1 = await authService.register({
      name: 'Student One',
      email: `s1_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    studentUser1 = { userId: s1.userId, roles: ['STUDENT'] };

    const s2 = await authService.register({
      name: 'Student Two',
      email: `s2_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    studentUser2 = { userId: s2.userId, roles: ['STUDENT'] };

    const s3 = await authService.register({
      name: 'Student Three',
      email: `s3_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    studentUser3 = { userId: s3.userId, roles: ['STUDENT'] };

    // 2. Create Rooms
    const r1 = await query(`
      INSERT INTO rooms (name, capacity, building)
      VALUES ($1, $2, $3)
      RETURNING *;
    `, [`Room_Small_${Date.now()}`, 2, 'Science Block']);
    testRoomSmall = r1.rows[0];

    const r2 = await query(`
      INSERT INTO rooms (name, capacity, building)
      VALUES ($1, $2, $3)
      RETURNING *;
    `, [`Room_Large_${Date.now()}`, 50, 'Main Hall']);
    testRoomLarge = r2.rows[0];

    // 3. Create Subject & Topic & Questions
    const subRes = await query(`
      INSERT INTO subjects (code, name, description)
      VALUES ($1, $2, $3)
      RETURNING *;
    `, [`SE_${Date.now()}`, 'Software Engineering', 'Design patterns']);
    testSubject = subRes.rows[0];

    const topRes = await query(`
      INSERT INTO topics (subject_id, name)
      VALUES ($1, $2)
      RETURNING *;
    `, [testSubject.subject_id, 'Design Patterns']);
    testTopic = topRes.rows[0];

    await query(`
      INSERT INTO questions (topic_id, question_type, prompt_text, metadata)
      VALUES
        ($1, 'MCQ', 'What is Factory Pattern?', '{}'),
        ($1, 'MCQ', 'What is Observer Pattern?', '{}');
    `, [testTopic.topic_id]);

    // 4. Create and Publish Exam
    const exam = await examService.createExam(
      {
        title: 'Software Engineering Final',
        subject_id: testSubject.subject_id,
        duration_minutes: 60,
        total_marks: 20,
        passing_marks: 8
      },
      facultyUser.userId
    );

    await examService.configureTopicRule(
      exam.exam_id,
      {
        topic_id: testTopic.topic_id,
        question_count: 2,
        points_per_question: 10
      },
      facultyUser
    );

    publishedExam = await examService.publishExam(exam.exam_id, facultyUser);
  });

  after(async () => {
    try {
      if (testSubject) {
        await query('DELETE FROM session_students WHERE session_id IN (SELECT session_id FROM exam_sessions WHERE exam_id IN (SELECT exam_id FROM exams WHERE subject_id = $1))', [testSubject.subject_id]);
        await query('DELETE FROM session_invigilators WHERE session_id IN (SELECT session_id FROM exam_sessions WHERE exam_id IN (SELECT exam_id FROM exams WHERE subject_id = $1))', [testSubject.subject_id]);
        await query('DELETE FROM exam_sessions WHERE exam_id IN (SELECT exam_id FROM exams WHERE subject_id = $1)', [testSubject.subject_id]);
        await query('DELETE FROM exam_topic_rules WHERE exam_id IN (SELECT exam_id FROM exams WHERE subject_id = $1)', [testSubject.subject_id]);
        await query('DELETE FROM exams WHERE subject_id = $1', [testSubject.subject_id]);
        await query('DELETE FROM questions WHERE topic_id IN (SELECT topic_id FROM topics WHERE subject_id = $1)', [testSubject.subject_id]);
        await query('DELETE FROM topics WHERE subject_id = $1', [testSubject.subject_id]);
        await query('DELETE FROM subjects WHERE subject_id = $1', [testSubject.subject_id]);
      }
      if (testRoomSmall) await query('DELETE FROM rooms WHERE room_id = $1', [testRoomSmall.room_id]);
      if (testRoomLarge) await query('DELETE FROM rooms WHERE room_id = $1', [testRoomLarge.room_id]);
      if (facultyUser) await query('DELETE FROM users WHERE user_id = $1', [facultyUser.userId]);
      if (adminUser) await query('DELETE FROM users WHERE user_id = $1', [adminUser.userId]);
      if (proctorUser) await query('DELETE FROM users WHERE user_id = $1', [proctorUser.userId]);
      if (studentUser1) await query('DELETE FROM users WHERE user_id = $1', [studentUser1.userId]);
      if (studentUser2) await query('DELETE FROM users WHERE user_id = $1', [studentUser2.userId]);
      if (studentUser3) await query('DELETE FROM users WHERE user_id = $1', [studentUser3.userId]);
    } catch {
      // Ignore cleanup error
    } finally {
      await closeRedis();
      await closePool();
    }
  });

  it('createSession — transitions PUBLISHED exam to SCHEDULED on first session creation', async () => {
    const startTime = new Date(Date.now() + 86400000); // tomorrow
    const endTime = new Date(startTime.getTime() + 120 * 60000); // 2 hours window

    const session = await sessionService.createSession(
      {
        exam_id: publishedExam.exam_id,
        room_id: testRoomSmall.room_id,
        scheduled_start_time: startTime.toISOString(),
        scheduled_end_time: endTime.toISOString()
      },
      facultyUser
    );

    assert.ok(session.session_id);
    assert.equal(session.exam_id, publishedExam.exam_id);
    assert.equal(session.status, 'SCHEDULED');

    // Verify exam state transitioned in DB
    const examCheck = await examService.getExamById(publishedExam.exam_id);
    assert.equal(examCheck.status, ExamStatus.SCHEDULED);
  });

  it('createSession — multi-session support: creating second session preserves SCHEDULED status', async () => {
    const startTime = new Date(Date.now() + 172800000); // day after tomorrow
    const endTime = new Date(startTime.getTime() + 120 * 60000);

    const session2 = await sessionService.createSession(
      {
        exam_id: publishedExam.exam_id,
        room_id: testRoomLarge.room_id,
        scheduled_start_time: startTime.toISOString(),
        scheduled_end_time: endTime.toISOString()
      },
      facultyUser
    );

    assert.ok(session2.session_id);
    assert.equal(session2.status, 'SCHEDULED');

    const examCheck = await examService.getExamById(publishedExam.exam_id);
    assert.equal(examCheck.status, ExamStatus.SCHEDULED);
  });

  it('createSession — rejects scheduling if time window is shorter than exam duration', async () => {
    const startTime = new Date(Date.now() + 86400000);
    const endTime = new Date(startTime.getTime() + 30 * 60000); // 30 min window for a 60 min exam

    await assert.rejects(
      async () => {
        await sessionService.createSession(
          {
            exam_id: publishedExam.exam_id,
            room_id: testRoomLarge.room_id,
            scheduled_start_time: startTime.toISOString(),
            scheduled_end_time: endTime.toISOString()
          },
          facultyUser
        );
      },
      (err) => err instanceof BadRequestError && err.message.includes('shorter than the exam duration')
    );
  });

  it('createSession — rejects scheduling draft exam', async () => {
    const draftExam = await examService.createExam(
      {
        title: 'Draft Unscheduled Exam',
        subject_id: testSubject.subject_id,
        duration_minutes: 60,
        total_marks: 20,
        passing_marks: 8
      },
      facultyUser.userId
    );

    const startTime = new Date(Date.now() + 86400000);
    const endTime = new Date(startTime.getTime() + 90 * 60000);

    await assert.rejects(
      async () => {
        await sessionService.createSession(
          {
            exam_id: draftExam.exam_id,
            room_id: testRoomLarge.room_id,
            scheduled_start_time: startTime.toISOString(),
            scheduled_end_time: endTime.toISOString()
          },
          facultyUser
        );
      },
      (err) => err instanceof BadRequestError && err.message.includes('Only \'PUBLISHED\' or \'SCHEDULED\'')
    );
  });

  it('assignStudents & Room Capacity — enforces exact room capacity and rejects overflow', async () => {
    const startTime = new Date(Date.now() + 86400000);
    const endTime = new Date(startTime.getTime() + 90 * 60000);

    // Session in small room (capacity 2)
    const session = await sessionService.createSession(
      {
        exam_id: publishedExam.exam_id,
        room_id: testRoomSmall.room_id,
        scheduled_start_time: startTime.toISOString(),
        scheduled_end_time: endTime.toISOString()
      },
      facultyUser
    );

    // 1. Assign 2 students (fits exactly capacity 2)
    const assignRes = await sessionService.assignStudents(
      session.session_id,
      [studentUser1.userId, studentUser2.userId],
      facultyUser
    );
    assert.equal(assignRes.assigned_count, 2);
    assert.equal(assignRes.total_enrolled, 2);

    // 2. Assigning duplicate student IDs should deduplicate and succeed without consuming excess capacity
    const dedupRes = await sessionService.assignStudents(
      session.session_id,
      [studentUser1.userId],
      facultyUser
    );
    assert.equal(dedupRes.assigned_count, 0); // already enrolled
    assert.equal(dedupRes.total_enrolled, 2);

    // 3. Attempting to assign 3rd student must trigger ConflictError (Room capacity exceeded)
    await assert.rejects(
      async () => {
        await sessionService.assignStudents(
          session.session_id,
          [studentUser3.userId],
          facultyUser
        );
      },
      (err) => err instanceof ConflictError && err.message.includes('Room capacity (2) exceeded')
    );
  });

  it('removeStudent — successfully removes a candidate from session roster', async () => {
    const startTime = new Date(Date.now() + 2 * 86400000);
    const endTime = new Date(startTime.getTime() + 90 * 60000);

    const session = await sessionService.createSession(
      {
        exam_id: publishedExam.exam_id,
        room_id: testRoomSmall.room_id,
        scheduled_start_time: startTime.toISOString(),
        scheduled_end_time: endTime.toISOString()
      },
      facultyUser
    );

    await sessionService.assignStudents(session.session_id, [studentUser1.userId], facultyUser);

    await sessionService.removeStudent(session.session_id, studentUser1.userId, facultyUser);

    // After removal, student is no longer in roster
    const sessionDetails = await sessionService.getSessionById(session.session_id, facultyUser);
    assert.equal(sessionDetails.students.length, 0);
  });

  it('assignInvigilator — assigns faculty/proctor and updates role', async () => {
    const startTime = new Date(Date.now() + 86400000);
    const endTime = new Date(startTime.getTime() + 90 * 60000);

    const session = await sessionService.createSession(
      {
        exam_id: publishedExam.exam_id,
        room_id: testRoomLarge.room_id,
        scheduled_start_time: startTime.toISOString(),
        scheduled_end_time: endTime.toISOString()
      },
      facultyUser
    );

    // 1. Assign proctor as PRIMARY
    const inv1 = await sessionService.assignInvigilator(
      session.session_id,
      { userId: proctorUser.userId, role: 'PRIMARY' },
      facultyUser
    );
    assert.equal(inv1.user_id, proctorUser.userId);
    assert.equal(inv1.role, 'PRIMARY');

    // 2. Update proctor to SECONDARY
    const inv2 = await sessionService.assignInvigilator(
      session.session_id,
      { userId: proctorUser.userId, role: 'SECONDARY' },
      facultyUser
    );
    assert.equal(inv2.role, 'SECONDARY');

    // 3. Reject assigning a student-only user as invigilator
    await assert.rejects(
      async () => {
        await sessionService.assignInvigilator(
          session.session_id,
          { userId: studentUser1.userId, role: 'PRIMARY' },
          facultyUser
        );
      },
      (err) => err instanceof BadRequestError && err.message.includes('must possess FACULTY, INVIGILATOR, or ADMIN role')
    );
  });

  it('removeInvigilator — successfully removes invigilator from session', async () => {
    const startTime = new Date(Date.now() + 3 * 86400000);
    const endTime = new Date(startTime.getTime() + 90 * 60000);

    const session = await sessionService.createSession(
      {
        exam_id: publishedExam.exam_id,
        room_id: testRoomLarge.room_id,
        scheduled_start_time: startTime.toISOString(),
        scheduled_end_time: endTime.toISOString()
      },
      facultyUser
    );

    await sessionService.assignInvigilator(
      session.session_id,
      { userId: proctorUser.userId, role: 'PRIMARY' },
      facultyUser
    );

    await sessionService.removeInvigilator(session.session_id, proctorUser.userId, facultyUser);

    const sessionDetails = await sessionService.getSessionById(session.session_id, facultyUser);
    assert.equal(sessionDetails.invigilators.length, 0);
  });
});
