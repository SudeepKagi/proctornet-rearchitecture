/**
 * @file examService.test.js
 * @description Unit & integration tests for Exam authoring, blueprint rules, and publishing lifecycle.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as examService from '../../src/modules/exams/exams.service.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import { ExamStatus } from '../../src/domain/exam/examStates.js';
import { DomainInvariantError, InvalidStateTransitionError } from '../../src/domain/shared/domainErrors.js';
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../../src/utils/errors.js';

describe('Exam Service & Business Invariants', () => {
  let facultyUser;
  let otherFacultyUser;
  let adminUser;
  let testSubject;
  let otherSubject;
  let testTopic1;
  let testTopic2;
  let otherSubjectTopic;

  before(async () => {
    // 1. Create test users
    const faculty = await authService.register({
      name: 'Dr. Exam Creator',
      email: `faculty_exam_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'FACULTY')
      ON CONFLICT DO NOTHING;
    `, [faculty.userId]);
    facultyUser = { userId: faculty.userId, roles: ['FACULTY', 'STUDENT'] };

    const otherFaculty = await authService.register({
      name: 'Dr. Other Faculty',
      email: `other_faculty_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'FACULTY')
      ON CONFLICT DO NOTHING;
    `, [otherFaculty.userId]);
    otherFacultyUser = { userId: otherFaculty.userId, roles: ['FACULTY', 'STUDENT'] };

    const admin = await authService.register({
      name: 'Admin User',
      email: `admin_exam_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'ADMIN')
      ON CONFLICT DO NOTHING;
    `, [admin.userId]);
    adminUser = { userId: admin.userId, roles: ['ADMIN', 'STUDENT'] };

    // 2. Create test subjects & topics
    const subRes1 = await query(`
      INSERT INTO subjects (code, name, description)
      VALUES ($1, $2, $3)
      RETURNING *;
    `, [`CS_${Date.now()}`, 'Computer Networks', 'Fundamentals of networking']);
    testSubject = subRes1.rows[0];

    const subRes2 = await query(`
      INSERT INTO subjects (code, name, description)
      VALUES ($1, $2, $3)
      RETURNING *;
    `, [`MATH_${Date.now()}`, 'Discrete Mathematics', 'Logic and graphs']);
    otherSubject = subRes2.rows[0];

    const topRes1 = await query(`
      INSERT INTO topics (subject_id, name)
      VALUES ($1, $2)
      RETURNING *;
    `, [testSubject.subject_id, 'TCP/IP Architecture']);
    testTopic1 = topRes1.rows[0];

    const topRes2 = await query(`
      INSERT INTO topics (subject_id, name)
      VALUES ($1, $2)
      RETURNING *;
    `, [testSubject.subject_id, 'Routing Algorithms']);
    testTopic2 = topRes2.rows[0];

    const topRes3 = await query(`
      INSERT INTO topics (subject_id, name)
      VALUES ($1, $2)
      RETURNING *;
    `, [otherSubject.subject_id, 'Graph Theory']);
    otherSubjectTopic = topRes3.rows[0];
  });

  after(async () => {
    try {
      if (facultyUser) {
        await query('DELETE FROM exam_topic_rules WHERE exam_id IN (SELECT exam_id FROM exams WHERE created_by = $1)', [facultyUser.userId]);
        await query('DELETE FROM exams WHERE created_by = $1', [facultyUser.userId]);
      }
      if (otherFacultyUser) {
        await query('DELETE FROM exam_topic_rules WHERE exam_id IN (SELECT exam_id FROM exams WHERE created_by = $1)', [otherFacultyUser.userId]);
        await query('DELETE FROM exams WHERE created_by = $1', [otherFacultyUser.userId]);
      }
      if (testSubject) {
        await query('DELETE FROM questions WHERE topic_id IN (SELECT topic_id FROM topics WHERE subject_id = $1)', [testSubject.subject_id]);
        await query('DELETE FROM topics WHERE subject_id = $1', [testSubject.subject_id]);
        await query('DELETE FROM subjects WHERE subject_id = $1', [testSubject.subject_id]);
      }
      if (otherSubject) {
        await query('DELETE FROM questions WHERE topic_id IN (SELECT topic_id FROM topics WHERE subject_id = $1)', [otherSubject.subject_id]);
        await query('DELETE FROM topics WHERE subject_id = $1', [otherSubject.subject_id]);
        await query('DELETE FROM subjects WHERE subject_id = $1', [otherSubject.subject_id]);
      }
      if (facultyUser) await query('DELETE FROM users WHERE user_id = $1', [facultyUser.userId]);
      if (otherFacultyUser) await query('DELETE FROM users WHERE user_id = $1', [otherFacultyUser.userId]);
      if (adminUser) await query('DELETE FROM users WHERE user_id = $1', [adminUser.userId]);
    } catch {
      // Ignore cleanup error
    } finally {
      await closeRedis();
      await closePool();
    }
  });

  it('createExam — successfully creates draft exam with valid payload and owner', async () => {
    const exam = await examService.createExam(
      {
        title: 'Midterm Networking Exam',
        description: 'Comprehensive network protocols exam',
        subject_id: testSubject.subject_id,
        duration_minutes: 90,
        total_marks: 100,
        passing_marks: 40
      },
      facultyUser.userId
    );

    assert.ok(exam.exam_id);
    assert.equal(exam.title, 'Midterm Networking Exam');
    assert.equal(exam.status, ExamStatus.DRAFT);
    assert.equal(exam.created_by, facultyUser.userId);
    assert.equal(exam.duration_minutes, 90);
    assert.equal(Number(exam.total_marks), 100);
    assert.equal(Number(exam.passing_marks), 40);
  });

  it('createExam — rejects creation when subject does not exist', async () => {
    await assert.rejects(
      async () => {
        await examService.createExam(
          {
            title: 'Orphan Exam',
            subject_id: '00000000-0000-0000-0000-000000000000',
            duration_minutes: 60,
            total_marks: 50,
            passing_marks: 20
          },
          facultyUser.userId
        );
      },
      (err) => err instanceof NotFoundError
    );
  });

  it('createExam — enforces domain invariant: passing_marks <= total_marks', async () => {
    await assert.rejects(
      async () => {
        await examService.createExam(
          {
            title: 'Invalid Marks Exam',
            subject_id: testSubject.subject_id,
            duration_minutes: 60,
            total_marks: 50,
            passing_marks: 60 // Invalid: > total_marks
          },
          facultyUser.userId
        );
      },
      (err) => err instanceof DomainInvariantError
    );
  });

  it('getExamById — returns full details with subject metadata and topic rules', async () => {
    const exam = await examService.createExam(
      {
        title: 'Exam for Inspection',
        subject_id: testSubject.subject_id,
        duration_minutes: 60,
        total_marks: 50,
        passing_marks: 20
      },
      facultyUser.userId
    );

    const fetched = await examService.getExamById(exam.exam_id);
    assert.equal(fetched.exam_id, exam.exam_id);
    assert.equal(fetched.subject_name, testSubject.name);
    assert.equal(fetched.creator_name, 'Dr. Exam Creator');
    assert.ok(Array.isArray(fetched.topic_rules));
  });

  it('updateDraftExam — allows creator or admin to modify draft attributes', async () => {
    const exam = await examService.createExam(
      {
        title: 'Draft Exam To Update',
        subject_id: testSubject.subject_id,
        duration_minutes: 60,
        total_marks: 50,
        passing_marks: 20
      },
      facultyUser.userId
    );

    const updated = await examService.updateDraftExam(
      exam.exam_id,
      {
        title: 'Updated Draft Exam Title',
        duration_minutes: 75
      },
      facultyUser
    );

    assert.equal(updated.title, 'Updated Draft Exam Title');
    assert.equal(updated.duration_minutes, 75);
  });

  it('updateDraftExam — forbids non-owner faculty from modifying another faculty exam', async () => {
    const exam = await examService.createExam(
      {
        title: 'Owner Protected Exam',
        subject_id: testSubject.subject_id,
        duration_minutes: 60,
        total_marks: 50,
        passing_marks: 20
      },
      facultyUser.userId
    );

    await assert.rejects(
      async () => {
        await examService.updateDraftExam(
          exam.exam_id,
          { title: 'Hacked Title' },
          otherFacultyUser
        );
      },
      (err) => err instanceof ForbiddenError
    );
  });

  it('configureTopicRule — adds topic rules and rejects topic from mismatched subject', async () => {
    const exam = await examService.createExam(
      {
        title: 'Rule Test Exam',
        subject_id: testSubject.subject_id,
        duration_minutes: 60,
        total_marks: 50,
        passing_marks: 20
      },
      facultyUser.userId
    );

    // Mismatched subject topic rejection
    await assert.rejects(
      async () => {
        await examService.configureTopicRule(
          exam.exam_id,
          {
            topic_id: otherSubjectTopic.topic_id,
            question_count: 5,
            points_per_question: 10
          },
          facultyUser
        );
      },
      (err) => err instanceof BadRequestError
    );

    // Valid topic configuration
    const rule = await examService.configureTopicRule(
      exam.exam_id,
      {
        topic_id: testTopic1.topic_id,
        question_count: 5,
        points_per_question: 10
      },
      facultyUser
    );

    assert.ok(rule.rule_id);
    assert.equal(rule.topic_id, testTopic1.topic_id);
    assert.equal(rule.question_count, 5);
    assert.equal(Number(rule.points_per_question), 10);
  });

  it('publishExam — rejects publishing without topic rules', async () => {
    const exam = await examService.createExam(
      {
        title: 'Empty Rules Exam',
        subject_id: testSubject.subject_id,
        duration_minutes: 60,
        total_marks: 100,
        passing_marks: 40
      },
      facultyUser.userId
    );

    await assert.rejects(
      async () => {
        await examService.publishExam(exam.exam_id, facultyUser);
      },
      (err) => err instanceof BadRequestError && err.message.includes('At least one topic rule')
    );
  });

  it('publishExam — rejects publishing when blueprint total points != total_marks', async () => {
    const exam = await examService.createExam(
      {
        title: 'Mismatched Marks Exam',
        subject_id: testSubject.subject_id,
        duration_minutes: 60,
        total_marks: 100,
        passing_marks: 40
      },
      facultyUser.userId
    );

    // 5 * 10 = 50 != 100
    await examService.configureTopicRule(
      exam.exam_id,
      {
        topic_id: testTopic1.topic_id,
        question_count: 5,
        points_per_question: 10
      },
      facultyUser
    );

    await assert.rejects(
      async () => {
        await examService.publishExam(exam.exam_id, facultyUser);
      },
      (err) => err instanceof BadRequestError && err.message.includes('does not match exam total marks')
    );
  });

  it('publishExam — rejects publishing when question bank has insufficient questions', async () => {
    const exam = await examService.createExam(
      {
        title: 'Insufficient Question Bank Exam',
        subject_id: testSubject.subject_id,
        duration_minutes: 60,
        total_marks: 50,
        passing_marks: 20
      },
      facultyUser.userId
    );

    // Topic 2 has 0 questions
    await examService.configureTopicRule(
      exam.exam_id,
      {
        topic_id: testTopic2.topic_id,
        question_count: 5,
        points_per_question: 10
      },
      facultyUser
    );

    await assert.rejects(
      async () => {
        await examService.publishExam(exam.exam_id, facultyUser);
      },
      (err) => err instanceof ConflictError && err.message.includes('question bank')
    );
  });

  it('publishExam — successfully publishes exam and freezes against further mutation', async () => {
    const exam = await examService.createExam(
      {
        title: 'Ready To Publish Exam',
        subject_id: testSubject.subject_id,
        duration_minutes: 60,
        total_marks: 20,
        passing_marks: 8
      },
      facultyUser.userId
    );

    // Seed 2 questions in testTopic1
    await query(`
      INSERT INTO questions (topic_id, question_type, prompt_text, metadata)
      VALUES
        ($1, 'MCQ', 'What is TCP?', '{"difficulty": "EASY"}'),
        ($1, 'MCQ', 'What is UDP?', '{"difficulty": "EASY"}');
    `, [testTopic1.topic_id]);

    // Rule: 2 questions * 10 points = 20 total_marks
    await examService.configureTopicRule(
      exam.exam_id,
      {
        topic_id: testTopic1.topic_id,
        question_count: 2,
        points_per_question: 10
      },
      facultyUser
    );

    const published = await examService.publishExam(exam.exam_id, facultyUser);
    assert.equal(published.status, ExamStatus.PUBLISHED);

    // Invariant verification: mutating published exam must fail
    await assert.rejects(
      async () => {
        await examService.updateDraftExam(
          exam.exam_id,
          { title: 'Mutate After Publish' },
          facultyUser
        );
      },
      (err) => err instanceof DomainInvariantError
    );

    // Adding topic rules to published exam must fail
    await assert.rejects(
      async () => {
        await examService.configureTopicRule(
          exam.exam_id,
          {
            topic_id: testTopic1.topic_id,
            question_count: 1,
            points_per_question: 10
          },
          facultyUser
        );
      },
      (err) => err instanceof DomainInvariantError
    );
  });
});
