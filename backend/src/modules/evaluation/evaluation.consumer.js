/**
 * @file evaluation.consumer.js
 * @description Idempotent RabbitMQ consumer for evaluation jobs with Quorum Queue tiered retry & DLQ routing.
 * Conforms strictly to Phase 12 Model A retry semantics.
 */

import { logger } from '../../utils/logger.js';
import { config } from '../../config/env.js';
import { publishConfirmed, getRabbitMQConnection, createConfirmChannel } from '../../infrastructure/rabbitmq/client.js';
import { TOPOLOGY, assertTopology } from '../../infrastructure/rabbitmq/topology.js';
import { evaluateAttempt } from './evaluation.service.js';
import { evaluationWorker } from './evaluation.worker.js';
import * as evaluationRepo from './evaluation.repository.js';

let activeConsumerTag = null;
let activeConsumerChannel = null;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates whether a string is a valid UUID.
 * @param {string} val
 * @returns {boolean}
 */
export function isValidUuid(val) {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

/**
 * Distinguishes transient failures from permanent poison/data corruption errors.
 * @param {Error} err
 * @returns {boolean}
 */
export function isTransientError(err) {
  if (!err) return false;

  // Explicit flag override
  if (err.isPermanent === true) return false;
  if (err.isTransient === true) return true;

  // Known permanent business errors
  if (err.code === 'ATTEMPT_NOT_FOUND' || err.code === 'INVALID_STATE') {
    return false;
  }

  // Database transient errors
  const transientDbCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', '40P01', '57P01', '08006', '57014'];
  if (transientDbCodes.includes(err.code)) {
    return true;
  }

  // Error message checks
  const message = (err.message || '').toLowerCase();
  if (
    message.includes('timeout') ||
    message.includes('deadlock') ||
    message.includes('connection terminated') ||
    message.includes('pool') ||
    message.includes('econnrefused')
  ) {
    return true;
  }

  // Default non-fatal runtime errors to transient
  return true;
}

/**
 * Routes transient failures through the bounded delayed-retry path using publishConfirmed.
 * @param {import('amqplib').ConfirmChannel} channel
 * @param {object} msg
 * @param {object} envelope
 * @param {Error} err
 */
export async function forwardToRetryPath(channel, msg, envelope, err) {
  const headers = msg.properties?.headers || {};
  const currentAttempt = Number(headers['x-retry-attempt']) || 0;
  const attemptId = envelope.data?.attemptId || envelope.data?.attempt_id;
  const originalMessageId = msg.properties?.messageId || envelope.id || 'unknown';

  if (currentAttempt === 0) {
    // Tier 0 failed -> Forward to Retry Queue 1 (5s delay)
    logger.warn({ attemptId, currentAttempt, nextAttempt: 1 }, 'Transient failure. Forwarding to Retry Queue 1 (5s TTL).');
    await publishConfirmed(
      channel,
      TOPOLOGY.EXCHANGES.RETRY,
      TOPOLOGY.ROUTING_KEYS.RETRY_1,
      msg.content,
      {
        messageId: `${originalMessageId}:retry:1`,
        headers: {
          ...headers,
          'x-retry-attempt': 1,
          'x-last-error': err.message,
          'x-last-failed-at': new Date().toISOString()
        }
      }
    );
  } else if (currentAttempt === 1) {
    // Tier 1 failed -> Forward to Retry Queue 2 (15s delay)
    logger.warn({ attemptId, currentAttempt, nextAttempt: 2 }, 'Transient failure. Forwarding to Retry Queue 2 (15s TTL).');
    await publishConfirmed(
      channel,
      TOPOLOGY.EXCHANGES.RETRY,
      TOPOLOGY.ROUTING_KEYS.RETRY_2,
      msg.content,
      {
        messageId: `${originalMessageId}:retry:2`,
        headers: {
          ...headers,
          'x-retry-attempt': 2,
          'x-last-error': err.message,
          'x-last-failed-at': new Date().toISOString()
        }
      }
    );
  } else {
    // Application retries exhausted (Tier 0, 1, 2 failed) -> Forward to DLQ
    logger.error({ attemptId, currentAttempt }, 'Stage-2 application retries exhausted (3 application tiers failed). Forwarding to DLQ.');
    await forwardToDlq(channel, msg, 'RETRIES_EXHAUSTED', err.message);
  }
}

/**
 * Publishes a poison or exhausted message to the dead-letter exchange using publishConfirmed.
 * @param {import('amqplib').ConfirmChannel} channel
 * @param {object} msg
 * @param {string} reason
 * @param {string} errorMessage
 */
export async function forwardToDlq(channel, msg, reason, errorMessage) {
  const originalMessageId = msg.properties?.messageId || 'unknown';
  const headers = msg.properties?.headers || {};

  await publishConfirmed(
    channel,
    TOPOLOGY.EXCHANGES.DLX,
    TOPOLOGY.ROUTING_KEYS.EVALUATION_DLQ,
    msg.content,
    {
      messageId: `${originalMessageId}:dlq`,
      headers: {
        ...headers,
        'x-death-reason': reason,
        'x-death-error': errorMessage,
        'x-died-at': new Date().toISOString()
      }
    }
  );
}

/**
 * Message handler executing the idempotent evaluation algorithm.
 * Strictly enforces ACK timing:
 * - Successful execution: ACK strictly AFTER PostgreSQL result transaction commits.
 * - Poison message: forward to DLQ, then ACK original.
 * - Transient error: forward to retry queue, then ACK original.
 * - Forwarding failure / timeout: DO NOT ACK original (throw to leave unacknowledged).
 *
 * @param {object} msg
 * @param {import('amqplib').ConfirmChannel} channel
 * @param {object} [worker=evaluationWorker]
 * @param {object} [repo=evaluationRepo]
 */
export async function handleEvaluationMessage(msg, channel, worker = evaluationWorker, repo = evaluationRepo) {
  if (!msg) return;

  // 1. Poison check: JSON parsing
  let envelope;
  try {
    envelope = JSON.parse(msg.content.toString('utf-8'));
  } catch (err) {
    logger.error({ err: err.message }, 'Poison message: malformed JSON. Forwarding to DLQ.');
    try {
      await forwardToDlq(channel, msg, 'MALFORMED_JSON', err.message);
      channel.ack(msg); // ACK original ONLY after confirmed forward
    } catch (forwardErr) {
      logger.error({ forwardErr: forwardErr.message }, 'Failed to forward poison message to DLQ; leaving unacknowledged.');
      throw forwardErr;
    }
    return;
  }

  // 2. Poison check: Schema validation
  const attemptId = envelope?.data?.attemptId || envelope?.data?.attempt_id;
  if (!isValidUuid(attemptId)) {
    logger.error({ envelope }, 'Poison message: missing or invalid attemptId UUID. Forwarding to DLQ.');
    try {
      await forwardToDlq(channel, msg, 'INVALID_ATTEMPT_ID', 'Missing or invalid attemptId UUID');
      channel.ack(msg); // ACK original ONLY after confirmed forward
    } catch (forwardErr) {
      logger.error({ forwardErr: forwardErr.message }, 'Failed to forward poison message to DLQ; leaving unacknowledged.');
      throw forwardErr;
    }
    return;
  }

  // 3. Authoritative PostgreSQL Idempotency Check
  try {
    const existingResult = await repo.findResultByAttemptId(attemptId);
    if (existingResult) {
      logger.info({ attemptId }, 'Attempt already evaluated. Acknowledging duplicate delivery.');
      channel.ack(msg);
      return;
    }
  } catch (repoErr) {
    logger.error({ repoErr: repoErr.message, attemptId }, 'Error checking result idempotency; leaving message unacknowledged');
    throw repoErr;
  }

  // 4. Execution
  try {
    const evaluator = typeof worker?.evaluateAttempt === 'function'
      ? worker.evaluateAttempt.bind(worker)
      : typeof worker?.evaluate === 'function'
      ? worker.evaluate.bind(worker)
      : evaluateAttempt;
    const result = await evaluator(attemptId);
    // CRITICAL INVARIANT: Send ACK strictly AFTER PostgreSQL result transaction commits
    channel.ack(msg);
    logger.info({ attemptId, resultId: result?.result_id || result?.resultId }, 'Evaluation completed and acknowledged.');
  } catch (err) {
    if (isTransientError(err)) {
      // Stage-2 Bounded Delayed Retry Path
      try {
        await forwardToRetryPath(channel, msg, envelope, err);
        // CRITICAL INVARIANT: Original delivery acknowledged ONLY AFTER confirmed forwarding
        channel.ack(msg);
      } catch (forwardErr) {
        logger.error({ forwardErr: forwardErr.message, attemptId }, 'Failed to publish to retry queue; leaving original delivery unacknowledged.');
        // ACK SAFETY & TIMEOUT AMBIGUITY:
        // publishConfirmed succeeds   -> ACK original
        // publishConfirmed fails      -> DO NOT ACK original
        // publishConfirmed times out  -> DO NOT ACK original (Outcome UNKNOWN: timed-out publish may have succeeded; duplicate retry safe via DB idempotency)
        // channel/connection fails    -> DO NOT ACK original
        throw forwardErr;
      }
    } else {
      // Permanent / Non-transient failure (e.g. data corruption, illegal attempt state)
      logger.error({ err: err.message, attemptId }, 'Permanent evaluation failure. Forwarding to DLQ.');
      try {
        await forwardToDlq(channel, msg, 'PERMANENT_ERROR', err.message);
        channel.ack(msg); // ACK original ONLY after confirmed forward
      } catch (forwardErr) {
        logger.error({ forwardErr: forwardErr.message, attemptId }, 'Failed to forward permanent error to DLQ; leaving unacknowledged.');
        throw forwardErr;
      }
    }
  }
}

/**
 * Starts consuming evaluation jobs from proctornet.evaluation.jobs.
 * Asserts topology, applies prefetch bounds, and enables manual acknowledgment.
 * @param {object} [options]
 * @returns {Promise<{ consumerTag: string, channel: import('amqplib').ConfirmChannel }>}
 */
export async function startEvaluationConsumer(options = {}) {
  if (!config.RABBITMQ_ENABLED) {
    logger.info('RabbitMQ is disabled; skipping evaluation consumer startup');
    return null;
  }

  const channel = options.channel || (await createConfirmChannel());
  await assertTopology(channel);

  const prefetch = options.prefetch || config.RABBITMQ_PREFETCH || 10;
  await channel.prefetch(prefetch);

  activeConsumerChannel = channel;

  const { consumerTag } = await channel.consume(
    TOPOLOGY.QUEUES.JOBS,
    (msg) => {
      handleEvaluationMessage(msg, channel).catch((err) => {
        logger.error({ err: err.message }, 'Unhandled error in handleEvaluationMessage');
      });
    },
    { noAck: false }
  );

  activeConsumerTag = consumerTag;
  logger.info({ consumerTag, queue: TOPOLOGY.QUEUES.JOBS, prefetch }, 'Evaluation consumer started');
  return { consumerTag, channel };
}

/**
 * Stops the active evaluation consumer cleanly.
 * @returns {Promise<void>}
 */
export async function stopEvaluationConsumer() {
  if (activeConsumerChannel && activeConsumerTag) {
    try {
      await activeConsumerChannel.cancel(activeConsumerTag);
    } catch {
      // Ignore cancellation error during shutdown
    }
    activeConsumerTag = null;
  }

  if (activeConsumerChannel) {
    try {
      await activeConsumerChannel.close().catch(() => {});
    } catch {
      // Ignore channel close error during shutdown
    }
    activeConsumerChannel = null;
  }
  logger.info('Evaluation consumer stopped');
}
