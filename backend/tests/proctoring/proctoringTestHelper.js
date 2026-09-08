/**
 * @file proctoringTestHelper.js
 * @description Shared test fixture factory for Phase 14 proctoring integration tests.
 */

import { randomUUID } from 'node:crypto';
import { query } from '../../src/infrastructure/postgres/pool.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import * as examService from '../../src/modules/exams/exams.service.js';
import * as attemptService from '../../src/modules/attempts/attempts.service.js';

export async function setupProctoringFixture() {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // 1. Create Faculty
  const f = await authService.register({
    name: `Faculty Proctoring ${stamp}`,
    email: `faculty_proc_${stamp}@example.com`,
    password: 'Password123!'
  });
  await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [f.userId]);
  await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'STUDENT';`, [f.userId]);
  const fLogin = await authService.login({ email: f.email, password: 'Password123!' });
  const faculty = { userId: f.userId, token: fLogin.accessToken };

  // 2. Create Admin
  const a = await authService.register({
    name: `Admin Proctoring ${stamp}`,
    email: `admin_proc_${stamp}@example.com`,
    password: 'Password123!'
  });
  await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN') ON CONFLICT DO NOTHING;`, [a.userId]);
  await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'STUDENT';`, [a.userId]);
  const aLogin = await authService.login({ email: a.email, password: 'Password123!' });
  const admin = { userId: a.userId, token: aLogin.accessToken };

  // 3. Create Assigned Invigilator
  const inv = await authService.register({
    name: `Invigilator Assigned ${stamp}`,
    email: `inv_proc_${stamp}@example.com`,
    password: 'Password123!'
  });
  await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'INVIGILATOR') ON CONFLICT DO NOTHING;`, [inv.userId]);
  await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'STUDENT';`, [inv.userId]);
  const invLogin = await authService.login({ email: inv.email, password: 'Password123!' });
  const assignedInvigilator = { userId: inv.userId, token: invLogin.accessToken };

  // 4. Create Unassigned Invigilator
  const unassignedInv = await authService.register({
    name: `Invigilator Unassigned ${stamp}`,
    email: `unassigned_inv_proc_${stamp}@example.com`,
    password: 'Password123!'
  });
  await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'INVIGILATOR') ON CONFLICT DO NOTHING;`, [unassignedInv.userId]);
  await query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'STUDENT';`, [unassignedInv.userId]);
  const unassignedInvLogin = await authService.login({ email: unassignedInv.email, password: 'Password123!' });
  const unassignedInvigilator = { userId: unassignedInv.userId, token: unassignedInvLogin.accessToken };

  // 5. Create Subject, Topic, Question, Options
  const subjectRes = await query(
    `INSERT INTO subjects (code, name, description) VALUES ($1, 'CS-PROC', 'Proctoring Tests') RETURNING *;`,
    [`CS-PROC-${stamp}`]
  );
  const subject = subjectRes.rows[0];

  const topicRes = await query(
    `INSERT INTO topics (subject_id, name) VALUES ($1, 'Proctoring Topic') RETURNING *;`,
    [subject.subject_id]
  );
  const topic = topicRes.rows[0];

  const qRes = await query(
    `INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
     VALUES ($1, 'MCQ', 'Proctoring Q1', 2.00) RETURNING *;`,
    [topic.topic_id]
  );
  const question = qRes.rows[0];

  await query(
    `INSERT INTO question_options (question_id, option_text, is_correct, display_order)
     VALUES ($1, 'Wrong', false, 0), ($1, 'Right', true, 1);`,
    [question.question_id]
  );

  // 6. Create & Publish Exam
  const exam = await examService.createExam(
    {
      title: `Proctoring Test Exam ${stamp}`,
      subject_id: subject.subject_id,
      duration_minutes: 60,
      total_marks: 2.00,
      passing_marks: 1.00
    },
    faculty.userId
  );

  await examService.configureTopicRule(
    exam.exam_id,
    {
      topic_id: topic.topic_id,
      difficulty: 'EASY',
      question_count: 1,
      points_per_question: 2.00
    },
    { userId: faculty.userId, roles: ['FACULTY'] }
  );

  await examService.publishExam(exam.exam_id, { userId: faculty.userId, roles: ['FACULTY'] });

  // 7. Create Room & Active Session
  const roomRes = await query(
    `INSERT INTO rooms (name, capacity) VALUES ($1, 50) RETURNING *;`,
    [`Room-Proc-${stamp}`]
  );
  const room = roomRes.rows[0];

  const now = new Date();
  const startTime = new Date(now.getTime() - 5 * 60000);
  const endTime = new Date(now.getTime() + 60 * 60000);

  const sessionRes = await query(
    `INSERT INTO exam_sessions (exam_id, room_id, scheduled_start_time, scheduled_end_time, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE')
     RETURNING *;`,
    [exam.exam_id, room.room_id, startTime.toISOString(), endTime.toISOString()]
  );
  const session = sessionRes.rows[0];

  // Assign invigilator to session
  await query(
    `INSERT INTO session_invigilators (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
    [session.session_id, assignedInvigilator.userId]
  );

  /**
   * Helper to create an enrolled student and active attempt
   */
  async function createStudentAttempt(customStatus = 'ACTIVE') {
    const sStamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const studentReg = await authService.register({
      name: `Student Proc ${sStamp}`,
      email: `student_proc_${sStamp}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [studentReg.userId]);
    const studentUser = { userId: studentReg.userId, roles: ['STUDENT'] };
    const sLogin = await authService.login({ email: studentReg.email, password: 'Password123!' });

    await query(
      `INSERT INTO session_students (session_id, student_id, status) VALUES ($1, $2, 'ASSIGNED') ON CONFLICT DO NOTHING;`,
      [session.session_id, studentReg.userId]
    );

    const attempt = await attemptService.startAttempt(session.session_id, studentUser);

    if (customStatus !== 'ACTIVE') {
      await query(`UPDATE exam_attempts SET status = $1 WHERE attempt_id = $2;`, [customStatus, attempt.attempt_id]);
      attempt.status = customStatus;
    }

    return {
      studentUser,
      token: sLogin.accessToken,
      attempt
    };
  }

  return {
    faculty,
    admin,
    assignedInvigilator,
    unassignedInvigilator,
    exam,
    session,
    createStudentAttempt
  };
}
