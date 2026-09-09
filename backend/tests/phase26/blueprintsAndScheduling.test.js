import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { checkDatabaseHealth, closePool, query } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as examsService from '../../src/modules/exams/exams.service.js';
import * as examsRepo from '../../src/modules/exams/exams.repository.js';
import * as sessionsService from '../../src/modules/sessions/sessions.service.js';
import * as sessionsRepo from '../../src/modules/sessions/sessions.repository.js';
import * as questionsService from '../../src/modules/questions/questions.service.js';
import { validateExamBlueprint } from '../../src/modules/exams/blueprintValidator.js';
import { ConflictError } from '../../src/utils/errors.js';

describe('Phase 26 Workstream B: Blueprints, Validation & Multi-Room Scheduling', () => {
  let dbAvailable = false;
  let facultyUser = null;
  let invigilatorUser = null;
  let student1 = null;
  let student2 = null;
  let student3 = null;
  let subjectId = null;
  let topicId = null;
  let roomId = null;
  let examId = null;

  before(async () => {
    const health = await checkDatabaseHealth(2000);
    dbAvailable = health.healthy;
    if (!dbAvailable) return;

    // Create faculty user
    const facRes = await query(`
      INSERT INTO users (email, password_hash, name, status)
      VALUES ('fac_wsb_phase26@test.com', 'hash', 'Faculty WS-B Phase 26', 'ACTIVE')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING user_id;
    `);
    facultyUser = { userId: facRes.rows[0].user_id, roles: ['FACULTY'] };
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [facultyUser.userId]);

    // Create invigilator user
    const invRes = await query(`
      INSERT INTO users (email, password_hash, name, status)
      VALUES ('inv_wsb_phase26@test.com', 'hash', 'Invigilator WS-B Phase 26', 'ACTIVE')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING user_id;
    `);
    invigilatorUser = { userId: invRes.rows[0].user_id, roles: ['INVIGILATOR'] };
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'INVIGILATOR') ON CONFLICT DO NOTHING;`, [invigilatorUser.userId]);

    // Create student users
    const s1 = await query(`
      INSERT INTO users (email, password_hash, name, status)
      VALUES ('student1_wsb@test.com', 'hash', 'Student One WS-B', 'ACTIVE')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING user_id;
    `);
    student1 = s1.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student1]);

    const s2 = await query(`
      INSERT INTO users (email, password_hash, name, status)
      VALUES ('student2_wsb@test.com', 'hash', 'Student Two WS-B', 'ACTIVE')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING user_id;
    `);
    student2 = s2.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student2]);

    const s3 = await query(`
      INSERT INTO users (email, password_hash, name, status)
      VALUES ('student3_wsb@test.com', 'hash', 'Student Three WS-B', 'ACTIVE')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING user_id;
    `);
    student3 = s3.rows[0].user_id;
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING;`, [student3]);

    // Create subject and topic
    const subRes = await query(`
      INSERT INTO subjects (name, code, description)
      VALUES ('Operating Systems WSB', 'OS2602', 'Test Subject')
      RETURNING subject_id;
    `);
    subjectId = subRes.rows[0].subject_id;

    const topRes = await query(`
      INSERT INTO topics (subject_id, name, description)
      VALUES ($1, 'Virtual Memory & Paging', 'Paging, TLB, Page Replacement')
      RETURNING topic_id;
    `, [subjectId]);
    topicId = topRes.rows[0].topic_id;

    // Create a room with capacity 2
    const room = await sessionsRepo.createRoom({
      name: 'Lab 202 - Small Cap Room',
      capacity: 2,
      building: 'Turing Block'
    });
    roomId = room.room_id;
  });

  after(async () => {
    if (dbAvailable) {
      if (examId) {
        await query('DELETE FROM session_students WHERE session_id IN (SELECT session_id FROM exam_sessions WHERE exam_id = $1)', [examId]).catch(() => {});
        await query('DELETE FROM session_invigilators WHERE session_id IN (SELECT session_id FROM exam_sessions WHERE exam_id = $1)', [examId]).catch(() => {});
        await query('DELETE FROM exam_sessions WHERE exam_id = $1', [examId]).catch(() => {});
        await query('DELETE FROM exam_topic_rules WHERE exam_id = $1', [examId]).catch(() => {});
        await query('DELETE FROM exams WHERE exam_id = $1', [examId]).catch(() => {});
      }
      if (topicId) {
        await query('DELETE FROM questions WHERE topic_id = $1', [topicId]).catch(() => {});
        await query('DELETE FROM topics WHERE topic_id = $1', [topicId]).catch(() => {});
      }
      if (subjectId) {
        await query('DELETE FROM subjects WHERE subject_id = $1', [subjectId]).catch(() => {});
      }
      if (roomId) await query('DELETE FROM rooms WHERE room_id = $1', [roomId]).catch(() => {});
    }
    await closeRedis();
    await closePool();
  });

  describe('Blueprint Rule Constraints & Pre-Publishing Validation', () => {
    it('should create a draft exam with blueprint topic rules', async () => {
      if (!dbAvailable) return;

      const exam = await examsService.createExam(
        {
          title: 'OS Midterm Examination 2026',
          description: 'Virtual Memory and CPU Scheduling',
          subject_id: subjectId,
          duration_minutes: 60,
          total_marks: 20,
          passing_marks: 8
        },
        facultyUser.userId
      );
      examId = exam.exam_id;
      assert.ok(examId);

      // Add topic rule requiring 2 HARD questions of Bloom level CREATE, 10 marks each
      const rule = await examsRepo.addOrUpdateTopicRule(examId, {
        topicId,
        questionCount: 2,
        pointsPerQuestion: 10,
        difficulty: 'HARD',
        bloomLevel: 'CREATE'
      });

      assert.equal(rule.difficulty, 'HARD');
      assert.equal(rule.bloom_level, 'CREATE');
      assert.equal(rule.question_count, 2);
    });

    it('should detect insufficient question inventory and block exam publication', async () => {
      if (!dbAvailable) return;

      // Currently 0 questions exist in this topic with HARD + CREATE
      const validation = await validateExamBlueprint(examId);
      assert.equal(validation.isValid, false);
      assert.ok(validation.issues.length > 0);
      assert.match(validation.issues[0], /Insufficient question inventory/);

      // Attempting to publish must fail with ConflictError
      await assert.rejects(
        () => examsService.publishExam(examId, facultyUser),
        (err) => err instanceof ConflictError && err.message.includes('Blueprint validation failed')
      );
    });

    it('should allow exam publication once question inventory satisfies blueprint constraints', async () => {
      if (!dbAvailable) return;

      // Add 2 published HARD + CREATE questions
      await questionsService.createQuestion(facultyUser.userId, 'FACULTY', {
        topic_id: topicId,
        question_type: 'CODE',
        prompt_text: 'Implement inverted page table lookup in C.',
        default_points: 10.0,
        difficulty: 'HARD',
        bloom_level: 'CREATE',
        status: 'PUBLISHED'
      });

      await questionsService.createQuestion(facultyUser.userId, 'FACULTY', {
        topic_id: topicId,
        question_type: 'CODE',
        prompt_text: 'Implement clock page replacement algorithm in C.',
        default_points: 10.0,
        difficulty: 'HARD',
        bloom_level: 'CREATE',
        status: 'PUBLISHED'
      });

      // Now validation must pass
      const validation = await validateExamBlueprint(examId);
      assert.equal(validation.isValid, true);
      assert.equal(validation.issues.length, 0);

      // Publish should succeed
      const published = await examsService.publishExam(examId, facultyUser);
      assert.equal(published.status, 'PUBLISHED');
    });
  });

  describe('Multi-Room Scheduling, Capacity Enforcement & Collision Checks', () => {
    let session1Id = null;
    let session2Id = null;

    it('should schedule Session 1 in room with capacity 2', async () => {
      if (!dbAvailable) return;

      const now = Date.now();
      const startTime = new Date(now + 3600 * 1000).toISOString();
      const endTime = new Date(now + 7200 * 1000).toISOString();

      const session = await sessionsService.createSession(
        {
          exam_id: examId,
          room_id: roomId,
          scheduled_start_time: startTime,
          scheduled_end_time: endTime
        },
        facultyUser
      );

      assert.ok(session.session_id);
      assert.equal(session.room_id, roomId);
      session1Id = session.session_id;
    });

    it('should enforce room capacity when assigning candidates', async () => {
      if (!dbAvailable) return;

      // Assign student 1 and 2 (reaches capacity 2)
      const res = await sessionsService.assignStudents(session1Id, [student1, student2], facultyUser);
      assert.equal(res.total_enrolled, 2);

      // Attempting to add student 3 must fail with ConflictError
      await assert.rejects(
        () => sessionsService.assignStudents(session1Id, [student3], facultyUser),
        (err) => err instanceof ConflictError && err.message.includes('Room capacity')
      );
    });

    it('should assign invigilator to Session 1', async () => {
      if (!dbAvailable) return;

      const assignment = await sessionsService.assignInvigilator(
        session1Id,
        { userId: invigilatorUser.userId, role: 'PRIMARY' },
        facultyUser
      );
      assert.equal(assignment.user_id, invigilatorUser.userId);
      assert.equal(assignment.role, 'PRIMARY');
    });

    it('should detect candidate double-booking collision in overlapping session', async () => {
      if (!dbAvailable) return;

      const now = Date.now();
      // Session 2 overlaps Session 1 (same time window)
      const startTime = new Date(now + 3600 * 1000).toISOString();
      const endTime = new Date(now + 7200 * 1000).toISOString();

      const session2 = await sessionsService.createSession(
        {
          exam_id: examId,
          scheduled_start_time: startTime,
          scheduled_end_time: endTime
        },
        facultyUser
      );
      session2Id = session2.session_id;

      // Attempting to assign student 1 (already enrolled in Session 1 at this time) must fail
      await assert.rejects(
        () => sessionsService.assignStudents(session2Id, [student1], facultyUser),
        (err) => err instanceof ConflictError && err.message.includes('Conflicting overlapping session')
      );
    });

    it('should detect invigilator scheduling conflict in overlapping session', async () => {
      if (!dbAvailable) return;

      // Attempting to assign the same invigilator to overlapping Session 2 must fail
      await assert.rejects(
        () => sessionsService.assignInvigilator(
          session2Id,
          { userId: invigilatorUser.userId, role: 'PRIMARY' },
          facultyUser
        ),
        (err) => err instanceof ConflictError && err.message.includes('Already assigned to an overlapping session')
      );
    });
  });
});
