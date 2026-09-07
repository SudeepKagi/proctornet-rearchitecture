import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOPOLOGY, assertTopology } from '../../src/infrastructure/rabbitmq/topology.js';

describe('RabbitMQ Topology Definitions and Assertion', () => {
  it('should define correct exchange, queue, and routing key constants', () => {
    assert.equal(TOPOLOGY.EXCHANGES.EVENTS, 'proctornet.events');
    assert.equal(TOPOLOGY.EXCHANGES.RETRY, 'proctornet.retry');
    assert.equal(TOPOLOGY.EXCHANGES.DLX, 'proctornet.dlx');

    assert.equal(TOPOLOGY.QUEUES.JOBS, 'proctornet.evaluation.jobs');
    assert.equal(TOPOLOGY.QUEUES.RETRY_1, 'proctornet.evaluation.retry.1');
    assert.equal(TOPOLOGY.QUEUES.RETRY_2, 'proctornet.evaluation.retry.2');
    assert.equal(TOPOLOGY.QUEUES.DLQ, 'proctornet.evaluation.dlq');

    assert.equal(TOPOLOGY.ROUTING_KEYS.ATTEMPT_SUBMITTED, 'attempt.submitted');
    assert.equal(TOPOLOGY.ROUTING_KEYS.RETRY_1, 'retry.1');
    assert.equal(TOPOLOGY.ROUTING_KEYS.RETRY_2, 'retry.2');
    assert.equal(TOPOLOGY.ROUTING_KEYS.EVALUATION_DLQ, 'evaluation.dlq');
  });

  it('should assert the complete topology with Quorum Queues and at-least-once dead-lettering', async () => {
    const assertedExchanges = [];
    const assertedQueues = [];
    const assertedBindings = [];

    const mockChannel = {
      async assertExchange(exchange, type, options) {
        assertedExchanges.push({ exchange, type, options });
      },
      async assertQueue(queue, options) {
        assertedQueues.push({ queue, options });
      },
      async bindQueue(queue, exchange, routingKey) {
        assertedBindings.push({ queue, exchange, routingKey });
      }
    };

    await assertTopology(mockChannel);

    // 1. Verify 3 Exchanges
    assert.equal(assertedExchanges.length, 3);
    assert.deepEqual(assertedExchanges[0], {
      exchange: 'proctornet.events',
      type: 'direct',
      options: { durable: true, autoDelete: false }
    });
    assert.deepEqual(assertedExchanges[1], {
      exchange: 'proctornet.retry',
      type: 'direct',
      options: { durable: true, autoDelete: false }
    });
    assert.deepEqual(assertedExchanges[2], {
      exchange: 'proctornet.dlx',
      type: 'direct',
      options: { durable: true, autoDelete: false }
    });

    // 2. Verify 4 Queues (All Quorum Queues)
    assert.equal(assertedQueues.length, 4);

    // Jobs queue
    const jobsQueue = assertedQueues.find((q) => q.queue === 'proctornet.evaluation.jobs');
    assert.ok(jobsQueue);
    assert.equal(jobsQueue.options.durable, true);
    assert.equal(jobsQueue.options.arguments['x-queue-type'], 'quorum');

    // Retry 1 queue (5s TTL, at-least-once Quorum DLX)
    const retry1Queue = assertedQueues.find((q) => q.queue === 'proctornet.evaluation.retry.1');
    assert.ok(retry1Queue);
    assert.equal(retry1Queue.options.durable, true);
    assert.equal(retry1Queue.options.arguments['x-queue-type'], 'quorum');
    assert.equal(retry1Queue.options.arguments['x-message-ttl'], 5000);
    assert.equal(retry1Queue.options.arguments['x-dead-letter-exchange'], 'proctornet.events');
    assert.equal(retry1Queue.options.arguments['x-dead-letter-routing-key'], 'attempt.submitted');
    assert.equal(retry1Queue.options.arguments['x-dead-letter-strategy'], 'at-least-once');
    assert.equal(retry1Queue.options.arguments['x-overflow'], 'reject-publish');

    // Retry 2 queue (15s TTL, at-least-once Quorum DLX)
    const retry2Queue = assertedQueues.find((q) => q.queue === 'proctornet.evaluation.retry.2');
    assert.ok(retry2Queue);
    assert.equal(retry2Queue.options.durable, true);
    assert.equal(retry2Queue.options.arguments['x-queue-type'], 'quorum');
    assert.equal(retry2Queue.options.arguments['x-message-ttl'], 15000);
    assert.equal(retry2Queue.options.arguments['x-dead-letter-exchange'], 'proctornet.events');
    assert.equal(retry2Queue.options.arguments['x-dead-letter-routing-key'], 'attempt.submitted');
    assert.equal(retry2Queue.options.arguments['x-dead-letter-strategy'], 'at-least-once');
    assert.equal(retry2Queue.options.arguments['x-overflow'], 'reject-publish');

    // DLQ
    const dlq = assertedQueues.find((q) => q.queue === 'proctornet.evaluation.dlq');
    assert.ok(dlq);
    assert.equal(dlq.options.durable, true);
    assert.equal(dlq.options.arguments['x-queue-type'], 'quorum');

    // 3. Verify 4 Bindings
    assert.equal(assertedBindings.length, 4);
    assert.ok(
      assertedBindings.some(
        (b) =>
          b.queue === 'proctornet.evaluation.jobs' &&
          b.exchange === 'proctornet.events' &&
          b.routingKey === 'attempt.submitted'
      )
    );
    assert.ok(
      assertedBindings.some(
        (b) =>
          b.queue === 'proctornet.evaluation.retry.1' &&
          b.exchange === 'proctornet.retry' &&
          b.routingKey === 'retry.1'
      )
    );
    assert.ok(
      assertedBindings.some(
        (b) =>
          b.queue === 'proctornet.evaluation.retry.2' &&
          b.exchange === 'proctornet.retry' &&
          b.routingKey === 'retry.2'
      )
    );
    assert.ok(
      assertedBindings.some(
        (b) =>
          b.queue === 'proctornet.evaluation.dlq' &&
          b.exchange === 'proctornet.dlx' &&
          b.routingKey === 'evaluation.dlq'
      )
    );
  });
});
