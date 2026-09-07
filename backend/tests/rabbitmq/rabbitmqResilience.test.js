/**
 * @file rabbitmqResilience.test.js
 * @description Resilience and fault-tolerance tests for RabbitMQ & Outbox pipeline.
 * Tests outbox persistence when RabbitMQ is unavailable, exponential backoff,
 * reconnect dispatch recovery, stale PROCESSING recovery, and worker idempotency.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import {
  getRabbitMQConnection,
  createConfirmChannel,
  closeRabbitMQ,
  reconnectRabbitMQ,
  publishConfirmed
} from '../../src/infrastructure/rabbitmq/client.js';
import { assertTopology, TOPOLOGY } from '../../src/infrastructure/rabbitmq/topology.js';
import { RabbitMQEventTransport } from '../../src/modules/outbox/outbox.transport.js';
import { OutboxDispatcher } from '../../src/modules/outbox/outbox.dispatcher.js';
import * as outboxRepo from '../../src/modules/outbox/outbox.repository.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import * as examService from '../../src/modules/exams/exams.service.js';
import * as sessionService from '../../src/modules/sessions/sessions.service.js';
import * as attemptService from '../../src/modules/attempts/attempts.service.js';
import * as answersService from '../../src/modules/answers/answers.service.js';
import * as submissionsService from '../../src/modules/submissions/submissions.service.js';
import {
  handleEvaluationMessage,
  startEvaluationConsumer,
  stopEvaluationConsumer,
  getActiveConsumerInfo,
  resetConsumerState
} from '../../src/modules/evaluation/evaluation.consumer.js';

describe('RabbitMQ & Outbox Resilience (Integration)', { timeout: 60000 }, () => {
  let connection;
  let adminChannel;

  before(async () => {
    connection = await getRabbitMQConnection();
    adminChannel = await createConfirmChannel(connection);
    await assertTopology(adminChannel);

    // Clean up test events
    await query(`DELETE FROM outbox_events WHERE aggregate_type = 'RESILIENCE_TEST';`);
  });

  after(async () => {
    await query(`DELETE FROM outbox_events WHERE aggregate_type = 'RESILIENCE_TEST';`);
    if (adminChannel) {
      await adminChannel.close().catch(() => {});
    }
    await closeRabbitMQ();
    await closeRedis();
    await closePool();
  });

  it('should persist outbox events to PostgreSQL even when transport fails, and mark them FAILED with backoff', async () => {
    const testAttemptId = randomUUID();

    // 1. Insert event into PostgreSQL (simulating submitAttempt transaction)
    const event = await outboxRepo.insertOutboxEvent({
      aggregateType: 'RESILIENCE_TEST',
      aggregateId: testAttemptId,
      eventType: 'ATTEMPT_SUBMITTED',
      payload: { attemptId: testAttemptId },
      maxRetries: 3
    });

    assert.ok(event.event_id);
    assert.equal(event.status, 'PENDING');

    // 2. Simulate transport failure (e.g. RabbitMQ unavailable / socket error)
    const failingTransport = {
      publish: async () => {
        const err = new Error('ECONNREFUSED: RabbitMQ broker unreachable');
        err.code = 'ECONNREFUSED';
        throw err;
      }
    };

    const dispatcher = new OutboxDispatcher(failingTransport, { batchSize: 5 });
    const result = await dispatcher.dispatchPendingEvents();

    assert.ok(result.claimed >= 1);
    assert.ok(result.failed >= 1);

    // 3. Verify event is persisted in PostgreSQL as FAILED with incremented retry count and next_retry_at
    const checkRes = await query(`SELECT * FROM outbox_events WHERE event_id = $1;`, [event.event_id]);
    const updated = checkRes.rows[0];

    assert.equal(updated.status, 'FAILED');
    assert.equal(updated.retry_count, 1);
    assert.ok(updated.next_retry_at);
    assert.ok(new Date(updated.next_retry_at).getTime() > Date.now());
    assert.match(updated.last_error, /ECONNREFUSED/);
  });

  it('should successfully dispatch previously FAILED event once transport becomes available', async () => {
    const testAttemptId = randomUUID();

    // 1. Insert event and mark it FAILED with next_retry_at in the past
    const event = await outboxRepo.insertOutboxEvent({
      aggregateType: 'RESILIENCE_TEST',
      aggregateId: testAttemptId,
      eventType: 'ATTEMPT_SUBMITTED',
      payload: { attemptId: testAttemptId },
      maxRetries: 3
    });

    await query(
      `UPDATE outbox_events
       SET status = 'FAILED', retry_count = 1, next_retry_at = CURRENT_TIMESTAMP - interval '1 minute'
       WHERE event_id = $1;`,
      [event.event_id]
    );

    // 2. Dispatch with real working RabbitMQ transport
    const realTransport = new RabbitMQEventTransport({
      getConfirmChannel: () => createConfirmChannel(connection)
    });
    const dispatcher = new OutboxDispatcher(realTransport, { batchSize: 5 });

    const result = await dispatcher.dispatchPendingEvents();
    assert.ok(result.claimed >= 1);
    assert.ok(result.published >= 1);

    // 3. Verify outbox event is now marked PUBLISHED
    const checkRes = await query(`SELECT * FROM outbox_events WHERE event_id = $1;`, [event.event_id]);
    const updated = checkRes.rows[0];

    assert.equal(updated.status, 'PUBLISHED');
    assert.ok(updated.published_at);
  });

  it('should recover stale PROCESSING events after simulated crash and retry them', async () => {
    const testAttemptId = randomUUID();

    const event = await outboxRepo.insertOutboxEvent({
      aggregateType: 'RESILIENCE_TEST',
      aggregateId: testAttemptId,
      eventType: 'ATTEMPT_SUBMITTED',
      payload: { attemptId: testAttemptId },
      maxRetries: 4
    });

    // Simulate crash where dispatcher was interrupted mid-flight 10 minutes ago
    await query(
      `UPDATE outbox_events
       SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP - interval '10 minutes'
       WHERE event_id = $1;`,
      [event.event_id]
    );

    const realTransport = new RabbitMQEventTransport({
      getConfirmChannel: () => createConfirmChannel(connection)
    });
    const dispatcher = new OutboxDispatcher(realTransport, { staleMinutes: 5 });

    const recovered = await dispatcher.recoverStaleProcessing();
    assert.ok(recovered >= 1);

    const checkRes = await query(`SELECT * FROM outbox_events WHERE event_id = $1;`, [event.event_id]);
    const updated = checkRes.rows[0];

    assert.equal(updated.status, 'FAILED');
    assert.equal(updated.retry_count, 1);
    assert.match(updated.last_error, /Stale processing lock recovered/);
  });

  it('should be completely idempotent when consumer receives duplicate delivery for already-evaluated attempt', async () => {
    const testAttemptId = randomUUID();
    let ackCount = 0;
    let evaluateCount = 0;

    const mockChannel = {
      ack: () => {
        ackCount++;
      }
    };

    const mockRepo = {
      findResultByAttemptId: async (id) => {
        // First check: not found; Second check: already exists
        if (evaluateCount > 0) {
          return { result_id: 'existing-result-id', attempt_id: id };
        }
        return null;
      }
    };

    const mockWorker = {
      evaluate: async () => {
        evaluateCount++;
        return { result_id: 'new-result-id', attempt_id: testAttemptId };
      }
    };

    const envelope = {
      specversion: '1.0',
      type: 'com.proctornet.exam.submitted',
      source: '/outbox/dispatcher',
      id: randomUUID(),
      data: {
        attemptId: testAttemptId
      }
    };

    const amqpMsg = {
      content: Buffer.from(JSON.stringify(envelope)),
      properties: {
        messageId: envelope.id,
        headers: {}
      }
    };

    // First delivery: evaluates and acks
    await handleEvaluationMessage(amqpMsg, mockChannel, mockWorker, mockRepo);
    assert.equal(ackCount, 1);

    // Duplicate redelivery: detects existing result via repo, skips evaluate, acks immediately
    await handleEvaluationMessage(amqpMsg, mockChannel, mockWorker, mockRepo);
    assert.equal(ackCount, 2);
  });

  async function createTestAttempt() {
    const timestamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const faculty = await authService.register({
      name: 'Faculty Res Test',
      email: `faculty_res_${timestamp}@example.com`,
      password: 'Password123!'
    });
    await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING;`, [faculty.userId]);
    const facultyUser = { userId: faculty.userId, roles: ['FACULTY'] };

    const student = await authService.register({
      name: 'Student Res Test',
      email: `student_res_${timestamp}@example.com`,
      password: 'Password123!'
    });
    const studentUser = { userId: student.userId, roles: ['STUDENT'] };

    const subRes = await query(
      `INSERT INTO subjects (name, code) VALUES ($1, $2) RETURNING *;`,
      [`Res Subject ${timestamp}`, `RES_${timestamp.slice(-6)}`]
    );
    const subject = subRes.rows[0];

    const topRes = await query(
      `INSERT INTO topics (subject_id, name) VALUES ($1, $2) RETURNING *;`,
      [subject.subject_id, 'Res Topic']
    );
    const topic = topRes.rows[0];

    const qRes = await query(
      `INSERT INTO questions (topic_id, question_type, prompt_text, default_points)
       VALUES ($1, 'MCQ', 'What is 2 + 2?', 10.00) RETURNING *;`,
      [topic.topic_id]
    );
    const q = qRes.rows[0];

    const optCorrect = await query(
      `INSERT INTO question_options (question_id, option_text, is_correct, display_order) VALUES ($1, '4', true, 0) RETURNING *;`,
      [q.question_id]
    );

    const exam = await examService.createExam(
      {
        subject_id: subject.subject_id,
        title: `Resilience Exam ${timestamp}`,
        duration_minutes: 60,
        total_marks: 10.00,
        passing_marks: 5.00
      },
      facultyUser.userId
    );

    await examService.configureTopicRule(
      exam.exam_id,
      {
        topic_id: topic.topic_id,
        question_count: 1,
        points_per_question: 10.00
      },
      facultyUser
    );

    await examService.publishExam(exam.exam_id, facultyUser);

    const roomRes = await query(`INSERT INTO rooms (name, capacity) VALUES ($1, 50) RETURNING *;`, [`Room Res ${timestamp}`]);
    const room = roomRes.rows[0];

    const now = new Date();
    const session = await sessionService.createSession(
      {
        exam_id: exam.exam_id,
        room_id: room.room_id,
        scheduled_start_time: new Date(now.getTime() - 5 * 60000).toISOString(),
        scheduled_end_time: new Date(now.getTime() + 60 * 60000).toISOString()
      },
      facultyUser
    );

    await sessionService.assignStudents(session.session_id, [studentUser.userId], facultyUser);
    const attempt = await attemptService.startAttempt(session.session_id, studentUser);

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

    await submissionsService.submitAttempt(
      attempt.attempt_id,
      randomUUID(),
      { answers: [] },
      studentUser
    );

    return attempt;
  }

  it('should restore evaluation consumer upon RabbitMQ reconnect and consume new jobs to DB completion', async () => {
    resetConsumerState();

    const conn = await getRabbitMQConnection();
    const purgeChannel = await createConfirmChannel(conn);
    await purgeChannel.purgeQueue(TOPOLOGY.QUEUES.JOBS);
    await purgeChannel.close().catch(() => {});

    // 2. Start consumer
    const consumer = await startEvaluationConsumer();
    assert.ok(consumer);
    assert.ok(consumer.consumerTag);

    const info1 = getActiveConsumerInfo();
    assert.ok(info1.consumerTag);

    // 3. Simulate RabbitMQ connection loss and reconnect
    const newConn = await reconnectRabbitMQ();
    assert.ok(newConn);

    // Allow reconnect hooks to execute and restore consumer
    await new Promise((r) => setTimeout(r, 150));

    // 4. Verify consumer restored on new connection
    const info2 = getActiveConsumerInfo();
    assert.ok(info2.consumerTag);
    assert.notEqual(info2.channel, info1.channel);

    // 5. Submit real attempt
    const attempt = await createTestAttempt();

    // 6. Publish evaluation job directly to exchange
    const testChannel = await createConfirmChannel(newConn);
    const messageId = `msg-reconnect-test-${Date.now()}`;
    const payload = Buffer.from(JSON.stringify({
      specversion: '1.0',
      id: messageId,
      data: { attemptId: attempt.attempt_id }
    }));

    await publishConfirmed(
      testChannel,
      TOPOLOGY.EXCHANGES.EVENTS,
      TOPOLOGY.ROUTING_KEYS.ATTEMPT_SUBMITTED,
      payload,
      { messageId }
    );
    await testChannel.close().catch(() => {});

    // 7. Poll PostgreSQL for result commitment
    let result = null;
    for (let i = 0; i < 40; i++) {
      const res = await query(`SELECT * FROM results WHERE attempt_id = $1;`, [attempt.attempt_id]);
      if (res.rows.length > 0) {
        result = res.rows[0];
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    assert.ok(result, 'Expected result to be committed to PostgreSQL by restored worker');
    assert.equal(result.attempt_id, attempt.attempt_id);
    assert.equal(Number(result.score), 10);

    // 8. Verify repeated reconnect does NOT create multiple duplicate consumers
    await reconnectRabbitMQ();
    await new Promise((r) => setTimeout(r, 100));
    await reconnectRabbitMQ();
    await new Promise((r) => setTimeout(r, 100));

    const info3 = getActiveConsumerInfo();
    assert.ok(info3.consumerTag);

    // Stop consumer
    await stopEvaluationConsumer({ maxDrainMs: 1000 });
  });

  it('should drain in-flight evaluations during stopEvaluationConsumer before closing RabbitMQ', async () => {
    resetConsumerState();

    const conn = await getRabbitMQConnection();
    const purgeChannel = await createConfirmChannel(conn);
    await purgeChannel.purgeQueue(TOPOLOGY.QUEUES.JOBS);
    await purgeChannel.close().catch(() => {});

    // 2. Start consumer
    await startEvaluationConsumer();

    // 3. Create test attempt
    const attempt = await createTestAttempt();

    // 4. Publish job to queue
    const publishChannel = await createConfirmChannel(conn);
    const messageId = `msg-drain-test-${Date.now()}`;
    const payload = Buffer.from(JSON.stringify({
      specversion: '1.0',
      id: messageId,
      data: { attemptId: attempt.attempt_id }
    }));

    await publishConfirmed(
      publishChannel,
      TOPOLOGY.EXCHANGES.EVENTS,
      TOPOLOGY.ROUTING_KEYS.ATTEMPT_SUBMITTED,
      payload,
      { messageId }
    );
    await publishChannel.close().catch(() => {});

    // 5. Initiate graceful stop/drain
    const drainResult = await stopEvaluationConsumer({ maxDrainMs: 5000 });
    assert.equal(drainResult.drained, true);
    assert.equal(drainResult.remainingCount, 0);

    // 6. Verify result was committed to PostgreSQL
    const res = await query(`SELECT * FROM results WHERE attempt_id = $1;`, [attempt.attempt_id]);
    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].attempt_id, attempt.attempt_id);
  });
});
