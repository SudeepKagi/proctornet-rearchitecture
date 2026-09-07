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
  closeRabbitMQ
} from '../../src/infrastructure/rabbitmq/client.js';
import { assertTopology, TOPOLOGY } from '../../src/infrastructure/rabbitmq/topology.js';
import { RabbitMQEventTransport } from '../../src/modules/outbox/outbox.transport.js';
import { OutboxDispatcher } from '../../src/modules/outbox/outbox.dispatcher.js';
import * as outboxRepo from '../../src/modules/outbox/outbox.repository.js';
import { handleEvaluationMessage } from '../../src/modules/evaluation/evaluation.consumer.js';

describe('RabbitMQ & Outbox Resilience (Integration)', { timeout: 30000 }, () => {
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
});
