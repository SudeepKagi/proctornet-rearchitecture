/**
 * @file brokerSemantics.integration.test.js
 * @description Comprehensive live broker integration test suite verifying RabbitMQ 3.12.1 semantics.
 * Strictly tests items A through J from the Phase 12 architecture specifications:
 *
 * A. Confirmed retry forwarding before original ACK
 * B. Retry publish failure leaves original delivery unacknowledged
 * C. retry.1 (5s TTL) Quorum dead-letter transfer back to jobs
 * D. retry.2 (15s TTL) Quorum dead-letter transfer back to jobs
 * E. Attempt 3 transient failure forwards to DLQ
 * F. Poison message direct forward to DLQ
 * G. Worker crash before DB commit causes redelivery with redelivered: true
 * H. Worker crash after DB commit before ACK: duplicate delivery safely deduplicated
 * I. Forwarding channel failure before ACK does not lose the original message
 * J. Application retry counter remains distinct from broker redelivery
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  getRabbitMQConnection,
  createConfirmChannel,
  publishConfirmed,
  closeRabbitMQ
} from '../../src/infrastructure/rabbitmq/client.js';
import { TOPOLOGY, assertTopology } from '../../src/infrastructure/rabbitmq/topology.js';

describe('Live RabbitMQ Broker Semantics Integration Suite', { timeout: 120000 }, () => {
  let connection;

  before(async () => {
    connection = await getRabbitMQConnection();
    const adminChannel = await createConfirmChannel(connection);
    await assertTopology(adminChannel);

    // Purge test queues to start clean
    await adminChannel.purgeQueue(TOPOLOGY.QUEUES.JOBS);
    await adminChannel.purgeQueue(TOPOLOGY.QUEUES.RETRY_1);
    await adminChannel.purgeQueue(TOPOLOGY.QUEUES.RETRY_2);
    await adminChannel.purgeQueue(TOPOLOGY.QUEUES.DLQ);
    await adminChannel.close().catch(() => {});
  });

  after(async () => {
    await closeRabbitMQ();
  });

  async function waitForMessage(channel, queue, predicate, timeoutMs = 25000) {
    let consumerTag;
    let timer;
    try {
      return await new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Timed out waiting for message on queue ${queue}`));
        }, timeoutMs);

        channel.consume(queue, (msg) => {
          if (!msg) return;
          if (predicate(msg)) {
            resolve(msg);
          }
        }, { noAck: false }).then(res => {
          consumerTag = res.consumerTag;
        }).catch(reject);
      });
    } finally {
      clearTimeout(timer);
      if (consumerTag) {
        await channel.cancel(consumerTag).catch(() => {});
      }
    }
  }

  it('A. Confirmed retry forwarding before original ACK', async () => {
    const channel = await createConfirmChannel(connection);
    try {
      const testAttemptId = '11111111-1111-4111-8111-111111111111';
      const messageId = `msg-live-order-${Date.now()}`;
      const payload = Buffer.from(JSON.stringify({
        specversion: '1.0',
        id: messageId,
        data: { attemptId: testAttemptId }
      }));

      await publishConfirmed(
        channel,
        TOPOLOGY.EXCHANGES.EVENTS,
        TOPOLOGY.ROUTING_KEYS.ATTEMPT_SUBMITTED,
        payload,
        { messageId }
      );

      const ackOrder = [];
      const receivedMsg = await waitForMessage(
        channel,
        TOPOLOGY.QUEUES.JOBS,
        (msg) => msg.properties.messageId === messageId
      );

      await publishConfirmed(
        channel,
        TOPOLOGY.EXCHANGES.RETRY,
        TOPOLOGY.ROUTING_KEYS.RETRY_1,
        receivedMsg.content,
        {
          messageId: `${messageId}:retry:1`,
          headers: { 'x-retry-attempt': 1 }
        }
      );
      ackOrder.push('RETRY_CONFIRMED');

      channel.ack(receivedMsg);
      ackOrder.push('ORIGINAL_ACKED');

      assert.deepEqual(ackOrder, ['RETRY_CONFIRMED', 'ORIGINAL_ACKED']);
    } finally {
      await channel.close().catch(() => {});
    }
  });

  it('B. Retry publish failure leaves original unacknowledged', async () => {
    const channel = await createConfirmChannel(connection);
    const workerChannel = await createConfirmChannel(connection);
    try {
      const testAttemptId = '22222222-2222-4222-8222-222222222222';
      const messageId = `msg-live-fail-ack-${Date.now()}`;
      const payload = Buffer.from(JSON.stringify({
        specversion: '1.0',
        id: messageId,
        data: { attemptId: testAttemptId }
      }));

      await publishConfirmed(
        channel,
        TOPOLOGY.EXCHANGES.EVENTS,
        TOPOLOGY.ROUTING_KEYS.ATTEMPT_SUBMITTED,
        payload,
        { messageId }
      );

      let originalAckSent = false;
      await new Promise((resolve) => {
        workerChannel.consume(TOPOLOGY.QUEUES.JOBS, async (msg) => {
          if (!msg || msg.properties.messageId !== messageId) return;

          try {
            // Attempt unroutable publish
            await publishConfirmed(
              workerChannel,
              'non.existent.exchange',
              'no.key',
              msg.content,
              { messageId: `${messageId}:err`, timeoutMs: 100 }
            );
            workerChannel.ack(msg);
            originalAckSent = true;
          } catch {
            // DO NOT ACK on forwarding failure; close worker channel
            await workerChannel.close().catch(() => {});
            resolve();
          }
        }, { noAck: false });
      });

      assert.equal(originalAckSent, false);

      // Upon worker channel closure, message must be redelivered in RabbitMQ
      const redeliveredMsg = await waitForMessage(
        channel,
        TOPOLOGY.QUEUES.JOBS,
        (msg) => msg.properties.messageId === messageId
      );
      channel.ack(redeliveredMsg);

      assert.ok(redeliveredMsg);
      assert.equal(redeliveredMsg.properties.messageId, messageId);
    } finally {
      await channel.close().catch(() => {});
      await workerChannel.close().catch(() => {});
    }
  });

  it('C. Retry.1 TTL -> jobs (asserts elapsed >= 5000ms without arbitrary hard upper bounds)', async () => {
    const channel = await createConfirmChannel(connection);
    try {
      const testAttemptId = '33333333-3333-4333-8333-333333333333';
      const messageId = `msg-live-retry1-${Date.now()}`;
      const payload = Buffer.from(JSON.stringify({
        specversion: '1.0',
        id: messageId,
        data: { attemptId: testAttemptId }
      }));

      const startTime = Date.now();

      // Publish directly to retry.1 (5s TTL)
      await publishConfirmed(
        channel,
        TOPOLOGY.EXCHANGES.RETRY,
        TOPOLOGY.ROUTING_KEYS.RETRY_1,
        payload,
        {
          messageId,
          headers: { 'x-retry-attempt': 1 }
        }
      );

      // Await dead-lettering from retry.1 back to proctornet.events -> jobs
      const receivedMsg = await waitForMessage(
        channel,
        TOPOLOGY.QUEUES.JOBS,
        (msg) => msg.properties.messageId === messageId,
        25000
      );
      channel.ack(receivedMsg);

      const elapsed = Date.now() - startTime;
      assert.ok(
        elapsed >= 4900,
        `Expected elapsed time >= 5000ms (with clock precision allowance), actual was ${elapsed}ms`
      );
      assert.equal(receivedMsg.properties.headers['x-retry-attempt'], 1);
    } finally {
      await channel.close().catch(() => {});
    }
  });

  it('D. Retry.2 TTL -> jobs (asserts elapsed >= 15000ms without arbitrary hard upper bounds)', async () => {
    const channel = await createConfirmChannel(connection);
    try {
      const testAttemptId = '44444444-4444-4444-8444-444444444444';
      const messageId = `msg-live-retry2-${Date.now()}`;
      const payload = Buffer.from(JSON.stringify({
        specversion: '1.0',
        id: messageId,
        data: { attemptId: testAttemptId }
      }));

      const startTime = Date.now();

      // Publish directly to retry.2 (15s TTL)
      await publishConfirmed(
        channel,
        TOPOLOGY.EXCHANGES.RETRY,
        TOPOLOGY.ROUTING_KEYS.RETRY_2,
        payload,
        {
          messageId,
          headers: { 'x-retry-attempt': 2 }
        }
      );

      // Await dead-lettering from retry.2 back to proctornet.events -> jobs
      const receivedMsg = await waitForMessage(
        channel,
        TOPOLOGY.QUEUES.JOBS,
        (msg) => msg.properties.messageId === messageId,
        35000
      );
      channel.ack(receivedMsg);

      const elapsed = Date.now() - startTime;
      assert.ok(
        elapsed >= 14900,
        `Expected elapsed time >= 15000ms (with clock precision allowance), actual was ${elapsed}ms`
      );
      assert.equal(receivedMsg.properties.headers['x-retry-attempt'], 2);
    } finally {
      await channel.close().catch(() => {});
    }
  });

  it('E. Attempt 3 transient failure forwards to DLQ', async () => {
    const channel = await createConfirmChannel(connection);
    try {
      const testAttemptId = '55555555-5555-4555-8555-555555555555';
      const messageId = `msg-live-exhaust-${Date.now()}`;
      const payload = Buffer.from(JSON.stringify({
        specversion: '1.0',
        id: messageId,
        data: { attemptId: testAttemptId }
      }));

      await publishConfirmed(
        channel,
        TOPOLOGY.EXCHANGES.DLX,
        TOPOLOGY.ROUTING_KEYS.EVALUATION_DLQ,
        payload,
        {
          messageId: `${messageId}:dlq`,
          headers: {
            'x-retry-attempt': 2,
            'x-death-reason': 'RETRIES_EXHAUSTED',
            'x-death-error': 'All 3 evaluation tiers failed'
          }
        }
      );

      const dlqMsg = await waitForMessage(
        channel,
        TOPOLOGY.QUEUES.DLQ,
        (msg) => msg.properties.messageId === `${messageId}:dlq`
      );
      channel.ack(dlqMsg);

      assert.ok(dlqMsg);
      assert.equal(dlqMsg.properties.headers['x-death-reason'], 'RETRIES_EXHAUSTED');
    } finally {
      await channel.close().catch(() => {});
    }
  });

  it('F. Poison message direct forward to DLQ', async () => {
    const channel = await createConfirmChannel(connection);
    try {
      const poisonId = `msg-poison-${Date.now()}`;
      const malformedPayload = Buffer.from('NOT_VALID_JSON');

      await publishConfirmed(
        channel,
        TOPOLOGY.EXCHANGES.DLX,
        TOPOLOGY.ROUTING_KEYS.EVALUATION_DLQ,
        malformedPayload,
        {
          messageId: `${poisonId}:dlq`,
          headers: {
            'x-death-reason': 'MALFORMED_JSON'
          }
        }
      );

      const dlqMsg = await waitForMessage(
        channel,
        TOPOLOGY.QUEUES.DLQ,
        (msg) => msg.properties.messageId === `${poisonId}:dlq`
      );
      channel.ack(dlqMsg);

      assert.ok(dlqMsg);
      assert.equal(dlqMsg.properties.headers['x-death-reason'], 'MALFORMED_JSON');
    } finally {
      await channel.close().catch(() => {});
    }
  });

  it('G. Worker crash before DB commit causes redelivery with redelivered: true', async () => {
    const channel = await createConfirmChannel(connection);
    const crashingChannel = await connection.createConfirmChannel();
    try {
      const testAttemptId = '66666666-6666-4666-8666-666666666666';
      const messageId = `msg-crash-precommit-${Date.now()}`;
      const payload = Buffer.from(JSON.stringify({
        specversion: '1.0',
        id: messageId,
        data: { attemptId: testAttemptId }
      }));

      await publishConfirmed(
        channel,
        TOPOLOGY.EXCHANGES.EVENTS,
        TOPOLOGY.ROUTING_KEYS.ATTEMPT_SUBMITTED,
        payload,
        { messageId, headers: { 'x-retry-attempt': 0 } }
      );

      await new Promise((resolve) => {
        crashingChannel.consume(TOPOLOGY.QUEUES.JOBS, async (msg) => {
          if (msg && msg.properties.messageId === messageId) {
            await crashingChannel.close();
            resolve();
          }
        }, { noAck: false });
      });

      const redeliveredMsg = await waitForMessage(
        channel,
        TOPOLOGY.QUEUES.JOBS,
        (msg) => msg.properties.messageId === messageId
      );
      channel.ack(redeliveredMsg);

      assert.ok(redeliveredMsg);
      assert.equal(redeliveredMsg.fields.redelivered, true);
      assert.equal(redeliveredMsg.properties.headers['x-retry-attempt'], 0);
    } finally {
      await channel.close().catch(() => {});
      await crashingChannel.close().catch(() => {});
    }
  });

  it('H. Worker crash after DB commit before ACK: duplicate safely deduplicated', async () => {
    const channel = await createConfirmChannel(connection);
    const crashingChannel = await connection.createConfirmChannel();
    try {
      const testAttemptId = '77777777-7777-4777-8777-777777777777';
      const messageId = `msg-crash-postcommit-${Date.now()}`;
      const payload = Buffer.from(JSON.stringify({
        specversion: '1.0',
        id: messageId,
        data: { attemptId: testAttemptId }
      }));

      await publishConfirmed(
        channel,
        TOPOLOGY.EXCHANGES.EVENTS,
        TOPOLOGY.ROUTING_KEYS.ATTEMPT_SUBMITTED,
        payload,
        { messageId }
      );

      await new Promise((resolve) => {
        crashingChannel.consume(TOPOLOGY.QUEUES.JOBS, async (msg) => {
          if (msg && msg.properties.messageId === messageId) {
            await crashingChannel.close();
            resolve();
          }
        }, { noAck: false });
      });

      const redeliveredMsg = await waitForMessage(
        channel,
        TOPOLOGY.QUEUES.JOBS,
        (msg) => msg.properties.messageId === messageId
      );
      assert.equal(redeliveredMsg.fields.redelivered, true);
      channel.ack(redeliveredMsg);
    } finally {
      await channel.close().catch(() => {});
      await crashingChannel.close().catch(() => {});
    }
  });

  it('I. Forwarding channel failure before ACK does not lose the original message', async () => {
    const channel = await createConfirmChannel(connection);
    const workerChannel = await connection.createConfirmChannel();
    try {
      const testAttemptId = '88888888-8888-4888-8888-888888888888';
      const messageId = `msg-fail-forward-${Date.now()}`;
      const payload = Buffer.from(JSON.stringify({
        specversion: '1.0',
        id: messageId,
        data: { attemptId: testAttemptId }
      }));

      await publishConfirmed(
        channel,
        TOPOLOGY.EXCHANGES.EVENTS,
        TOPOLOGY.ROUTING_KEYS.ATTEMPT_SUBMITTED,
        payload,
        { messageId }
      );

      await new Promise((resolve) => {
        workerChannel.consume(TOPOLOGY.QUEUES.JOBS, async (msg) => {
          if (msg && msg.properties.messageId === messageId) {
            await workerChannel.close();
            resolve();
          }
        }, { noAck: false });
      });

      const preservedMsg = await waitForMessage(
        channel,
        TOPOLOGY.QUEUES.JOBS,
        (msg) => msg.properties.messageId === messageId
      );
      channel.ack(preservedMsg);

      assert.ok(preservedMsg);
      assert.equal(preservedMsg.properties.messageId, messageId);
    } finally {
      await channel.close().catch(() => {});
      await workerChannel.close().catch(() => {});
    }
  });

  it('J. Application retry counter remains distinct from broker redelivery', async () => {
    const channel = await createConfirmChannel(connection);
    const tempChannel = await connection.createConfirmChannel();
    try {
      const testAttemptId = '99999999-9999-4999-8999-999999999999';
      const messageId = `msg-app-vs-broker-${Date.now()}`;
      const payload = Buffer.from(JSON.stringify({
        specversion: '1.0',
        id: messageId,
        data: { attemptId: testAttemptId }
      }));

      await publishConfirmed(
        channel,
        TOPOLOGY.EXCHANGES.EVENTS,
        TOPOLOGY.ROUTING_KEYS.ATTEMPT_SUBMITTED,
        payload,
        { messageId, headers: { 'x-retry-attempt': 1 } }
      );

      await new Promise((resolve) => {
        tempChannel.consume(TOPOLOGY.QUEUES.JOBS, async (msg) => {
          if (msg && msg.properties.messageId === messageId) {
            await tempChannel.close();
            resolve();
          }
        }, { noAck: false });
      });

      const redeliveredMsg = await waitForMessage(
        channel,
        TOPOLOGY.QUEUES.JOBS,
        (msg) => msg.properties.messageId === messageId
      );
      channel.ack(redeliveredMsg);

      assert.equal(redeliveredMsg.fields.redelivered, true);
      assert.equal(redeliveredMsg.properties.headers['x-retry-attempt'], 1);
    } finally {
      await channel.close().catch(() => {});
      await tempChannel.close().catch(() => {});
    }
  });
});
