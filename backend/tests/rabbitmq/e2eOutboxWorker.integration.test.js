import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import {
  getRabbitMQConnection,
  createConfirmChannel,
  closeRabbitMQ
} from '../../src/infrastructure/rabbitmq/client.js';
import { assertTopology, TOPOLOGY } from '../../src/infrastructure/rabbitmq/topology.js';
import { RabbitMQEventTransport } from '../../src/modules/outbox/outbox.transport.js';
import { OutboxDispatcher } from '../../src/modules/outbox/outbox.dispatcher.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import * as examService from '../../src/modules/exams/exams.service.js';
import * as sessionService from '../../src/modules/sessions/sessions.service.js';
import * as attemptService from '../../src/modules/attempts/attempts.service.js';
import * as answersService from '../../src/modules/answers/answers.service.js';
import * as submissionsService from '../../src/modules/submissions/submissions.service.js';
import {
  startEvaluationConsumer,
  stopEvaluationConsumer
} from '../../src/modules/evaluation/evaluation.consumer.js';

describe('End-to-End Outbox -> RabbitMQ -> Worker Pipeline (Integration)', { timeout: 30000 }, () => {
  let connection;
  let adminChannel;
  let facultyUser;
  let studentUser;
  let attempt;

  before(async () => {
    connection = await getRabbitMQConnection();
    adminChannel = await createConfirmChannel(connection);
    await assertTopology(adminChannel);

    // Purge test queues
    await adminChannel.purgeQueue(TOPOLOGY.QUEUES.JOBS);
    await adminChannel.purgeQueue(TOPOLOGY.QUEUES.RETRY_1);
    await adminChannel.purgeQueue(TOPOLOGY.QUEUES.RETRY_2);
    await adminChannel.purgeQueue(TOPOLOGY.QUEUES.DLQ);

    // 1. Create Faculty & Student
    const faculty = await authService.register({
      name: 'Faculty E2E Test',
      email: `faculty_e2e_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [faculty.userId]);
    facultyUser = { userId: faculty.userId, roles: ['FACULTY'] };

    const student = await authService.register({
      name: 'Student E2E Test',
      email: `student_e2e_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    studentUser = { userId: student.userId, roles: ['STUDENT'] };

    // 2. Create Subject, Topic, Question
    const subRes = await query(
      `INSERT INTO subjects (name, code) VALUES ($1, $2) RETURNING *;`,
      [`E2E Subject ${Date.now()}`, `E2E_${Date.now().toString().slice(-4)}`]
    );
    const subject = subRes.rows[0];

    const topRes = await query(
      `INSERT INTO topics (subject_id, name) VALUES ($1, $2) RETURNING *;`,
      [subject.subject_id, 'E2E Questions']
    );
    const topic = topRes.rows[0];

    const qRes = await query(
      `INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
       VALUES ($1, 'MCQ', 'What is 3 + 3?', 5.00) RETURNING *;`,
      [topic.topic_id]
    );
    const q = qRes.rows[0];

    const optCorrect = await query(
      `INSERT INTO question_options (question_id, option_text, is_correct, display_order) VALUES ($1, '6', true, 0) RETURNING *;`,
      [q.question_id]
    );

    // 3. Create Exam & Rules
    const exam = await examService.createExam(
      {
        subject_id: subject.subject_id,
        title: 'E2E Pipeline Exam',
        duration_minutes: 60,
        total_marks: 5.00,
        passing_marks: 2.50
      },
      facultyUser.userId
    );

    await examService.configureTopicRule(
      exam.exam_id,
      {
        topic_id: topic.topic_id,
        question_count: 1,
        points_per_question: 5.00
      },
      facultyUser
    );

    await examService.publishExam(exam.exam_id, facultyUser);

    // 4. Create Session & Room
    const roomRes = await query(`INSERT INTO rooms (name, capacity) VALUES ($1, 50) RETURNING *;`, [`Room E2E ${Date.now()}`]);
    const room = roomRes.rows[0];

    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60000);
    const end = new Date(now.getTime() + 60 * 60000);

    const session = await sessionService.createSession(
      {
        exam_id: exam.exam_id,
        room_id: room.room_id,
        scheduled_start_time: start.toISOString(),
        scheduled_end_time: end.toISOString()
      },
      facultyUser
    );

    await sessionService.assignStudents(session.session_id, [studentUser.userId], facultyUser);

    // 5. Start Attempt and answer question
    attempt = await attemptService.startAttempt(session.session_id, studentUser);

    const aqRes = await query(
      `SELECT aq.attempt_question_id FROM attempt_questions aq WHERE aq.attempt_id = $1;`,
      [attempt.attempt_id]
    );
    const attemptQuestionId = aqRes.rows[0].attempt_question_id;

    await answersService.saveAnswer(
      attempt.attempt_id,
      attemptQuestionId,
      { answer_value: { selected_option_id: optCorrect.rows[0].option_id }, expected_revision: 0 },
      studentUser
    );
  });

  after(async () => {
    await stopEvaluationConsumer();
    if (adminChannel) {
      await adminChannel.close().catch(() => {});
    }
    await closeRabbitMQ();
    await closeRedis();
    await closePool();
  });

  it('should submit attempt, dispatch outbox event through RabbitMQ, and evaluate with PostgreSQL result insertion', async () => {
    // 1. Start evaluation consumer before dispatch
    await startEvaluationConsumer();

    // 2. Configure RabbitMQ transport and dispatcher
    const transport = new RabbitMQEventTransport({
      getConfirmChannel: () => createConfirmChannel(connection)
    });
    const dispatcher = new OutboxDispatcher(transport, { batchSize: 5 });

    // 3. Submit Attempt via submissionsService (which commits attempt SUBMITTED + inserts outbox event)
    const idempotencyKey = randomUUID();
    const submissionResult = await submissionsService.submitAttempt(
      attempt.attempt_id,
      idempotencyKey,
      {},
      studentUser
    );
    assert.equal(submissionResult.status, 'SUBMITTED');

    // 4. Ensure outbox event is dispatched (via automatic triggerOutboxDispatch or dispatcher)
    let outboxCheck = null;
    for (let i = 0; i < 40; i++) {
      const check = await query(
        `SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'ATTEMPT_SUBMITTED';`,
        [attempt.attempt_id]
      );
      if (check.rows.length > 0 && check.rows[0].status === 'PUBLISHED') {
        outboxCheck = check;
        break;
      }
      await dispatcher.dispatchPendingEvents();
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(outboxCheck, 'Expected outbox event to be marked PUBLISHED');
    assert.equal(outboxCheck.rows[0].status, 'PUBLISHED');

    // 5. Poll for worker evaluation completion in PostgreSQL results table (max 10s)
    let evaluatedResult = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const res = await query(`SELECT * FROM results WHERE attempt_id = $1;`, [attempt.attempt_id]);
      if (res.rows.length > 0) {
        evaluatedResult = res.rows[0];
        break;
      }
    }

    assert.ok(evaluatedResult, 'Expected result row to be created in PostgreSQL results table');
    assert.equal(evaluatedResult.attempt_id, attempt.attempt_id);
    assert.equal(Number(evaluatedResult.score), 5.00);
  });
});
