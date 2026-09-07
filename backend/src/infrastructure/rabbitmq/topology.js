/**
 * RabbitMQ Topology Definitions & Assertions.
 *
 * Implements the approved Phase 12 architecture:
 * - 3 direct exchanges: proctornet.events, proctornet.retry, proctornet.dlx
 * - 4 Quorum Queues (x-queue-type: 'quorum', durable: true):
 *   - proctornet.evaluation.jobs (primary evaluation work queue)
 *   - proctornet.evaluation.retry.1 (5s TTL, at-least-once Quorum DLX back to proctornet.events)
 *   - proctornet.evaluation.retry.2 (15s TTL, at-least-once Quorum DLX back to proctornet.events)
 *   - proctornet.evaluation.dlq (terminal quarantine DLQ)
 */

export const TOPOLOGY = {
  EXCHANGES: {
    EVENTS: 'proctornet.events',
    RETRY: 'proctornet.retry',
    DLX: 'proctornet.dlx'
  },
  QUEUES: {
    JOBS: 'proctornet.evaluation.jobs',
    RETRY_1: 'proctornet.evaluation.retry.1',
    RETRY_2: 'proctornet.evaluation.retry.2',
    DLQ: 'proctornet.evaluation.dlq'
  },
  ROUTING_KEYS: {
    ATTEMPT_SUBMITTED: 'attempt.submitted',
    RETRY_1: 'retry.1',
    RETRY_2: 'retry.2',
    EVALUATION_DLQ: 'evaluation.dlq'
  }
};

/**
 * Asserts the complete RabbitMQ topology on the given channel.
 * All queues are asserted as Quorum Queues with at-least-once dead-lettering.
 *
 * @param {import('amqplib').Channel} channel
 * @returns {Promise<void>}
 */
export async function assertTopology(channel) {
  // 1. Assert Direct Exchanges
  await channel.assertExchange(TOPOLOGY.EXCHANGES.EVENTS, 'direct', {
    durable: true,
    autoDelete: false
  });

  await channel.assertExchange(TOPOLOGY.EXCHANGES.RETRY, 'direct', {
    durable: true,
    autoDelete: false
  });

  await channel.assertExchange(TOPOLOGY.EXCHANGES.DLX, 'direct', {
    durable: true,
    autoDelete: false
  });

  // 2. Assert Quorum Queues
  // Primary Evaluation Work Queue
  await channel.assertQueue(TOPOLOGY.QUEUES.JOBS, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum'
    }
  });

  // Delayed Retry Queue 1 (5s TTL, at-least-once DLX to proctornet.events)
  await channel.assertQueue(TOPOLOGY.QUEUES.RETRY_1, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-message-ttl': 5000,
      'x-dead-letter-exchange': TOPOLOGY.EXCHANGES.EVENTS,
      'x-dead-letter-routing-key': TOPOLOGY.ROUTING_KEYS.ATTEMPT_SUBMITTED,
      'x-dead-letter-strategy': 'at-least-once',
      'x-overflow': 'reject-publish'
    }
  });

  // Delayed Retry Queue 2 (15s TTL, at-least-once DLX to proctornet.events)
  await channel.assertQueue(TOPOLOGY.QUEUES.RETRY_2, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-message-ttl': 15000,
      'x-dead-letter-exchange': TOPOLOGY.EXCHANGES.EVENTS,
      'x-dead-letter-routing-key': TOPOLOGY.ROUTING_KEYS.ATTEMPT_SUBMITTED,
      'x-dead-letter-strategy': 'at-least-once',
      'x-overflow': 'reject-publish'
    }
  });

  // Terminal Dead-Letter Queue (DLQ)
  await channel.assertQueue(TOPOLOGY.QUEUES.DLQ, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum'
    }
  });

  // 3. Assert Bindings
  await channel.bindQueue(
    TOPOLOGY.QUEUES.JOBS,
    TOPOLOGY.EXCHANGES.EVENTS,
    TOPOLOGY.ROUTING_KEYS.ATTEMPT_SUBMITTED
  );

  await channel.bindQueue(
    TOPOLOGY.QUEUES.RETRY_1,
    TOPOLOGY.EXCHANGES.RETRY,
    TOPOLOGY.ROUTING_KEYS.RETRY_1
  );

  await channel.bindQueue(
    TOPOLOGY.QUEUES.RETRY_2,
    TOPOLOGY.EXCHANGES.RETRY,
    TOPOLOGY.ROUTING_KEYS.RETRY_2
  );

  await channel.bindQueue(
    TOPOLOGY.QUEUES.DLQ,
    TOPOLOGY.EXCHANGES.DLX,
    TOPOLOGY.ROUTING_KEYS.EVALUATION_DLQ
  );
}
