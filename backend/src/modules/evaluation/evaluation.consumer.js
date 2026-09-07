/**
 * @file evaluation.consumer.js
 * @description Idempotent RabbitMQ consumer for evaluation jobs with Quorum Queue tiered retry & DLQ routing.
 * Conforms strictly to Phase 12 Model A retry semantics.
 */

import { logger } from '../../utils/logger.js';
import { config } from '../../config/env.js';
import {
  publishConfirmed,
  getRabbitMQConnection,
  createConfirmChannel,
  registerReconnectHook
} from '../../infrastructure/rabbitmq/client.js';
import { TOPOLOGY, assertTopology } from '../../infrastructure/rabbitmq/topology.js';
import { evaluateAttempt } from './evaluation.service.js';
import { evaluationWorker } from './evaluation.worker.js';
import * as evaluationRepo from './evaluation.repository.js';

let activeConsumerTag = null;
let activeConsumerChannel = null;
let isShuttingDown = false;
let isRestoring = false;
let unregisterReconnect = null;
const inFlightHandlers = new Set();

/**
 * Returns the current number of in-flight evaluation handlers.
 * @returns {number}
 */
export function getInFlightCount() {
  return inFlightHandlers.size;
}

/**
 * Returns whether the consumer is currently in shutdown mode.
 * @returns {boolean}
 */
export function isConsumerShuttingDown() {
  return isShuttingDown;
}

/**
 * Returns metadata about the active consumer state.
 * @returns {{ consumerTag: string | null, channel: any, inFlightCount: number, isShuttingDown: boolean, isRestoring: boolean }}
 */
export function getActiveConsumerInfo() {
  return {
    consumerTag: activeConsumerTag,
    channel: activeConsumerChannel,
    inFlightCount: inFlightHandlers.size,
    isShuttingDown,
    isRestoring
  };
}

/**
 * Resets consumer state for test isolation and clean restart.
 */
export function resetConsumerState() {
  isShuttingDown = false;
  isRestoring = false;
  activeConsumerTag = null;
  activeConsumerChannel = null;
  inFlightHandlers.clear();
  if (unregisterReconnect) {
    unregisterReconnect();
    unregisterReconnect = null;
  }
}

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

  if (isShuttingDown) {
    logger.warn('Evaluation message skipped because consumer is shutting down');
    return;
  }

  // Track in-flight processing for graceful drain
  let trackResolve;
  const trackingPromise = new Promise((resolve) => {
    trackResolve = resolve;
  });
  inFlightHandlers.add(trackingPromise);

  try {
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
  } finally {
    inFlightHandlers.delete(trackingPromise);
    if (typeof trackResolve === 'function') {
      trackResolve();
    }
  }
}

/**
 * Idempotently restores the evaluation consumer on a given connection or the singleton connection.
 * Guarantees topology assertion, prefetch setting, manual ACK, and cancels any prior active consumer
 * to prevent duplicate consumers.
 *
 * @param {import('amqplib').Connection} [connection]
 * @param {import('amqplib').ConfirmChannel} [customChannel]
 * @returns {Promise<{ consumerTag: string, channel: import('amqplib').ConfirmChannel } | null>}
 */
export async function restoreEvaluationConsumer(connection = null, customChannel = null) {
  if (isShuttingDown) {
    logger.info('System is shutting down; skipping evaluation consumer restoration');
    return null;
  }

  if (isRestoring) {
    logger.info('Evaluation consumer restoration already in progress; skipping duplicate call');
    return null;
  }

  isRestoring = true;
  try {
    // Cleanly cancel and close previous channel to guarantee no duplicate consumers
    if (activeConsumerChannel && activeConsumerChannel !== customChannel) {
      try {
        if (activeConsumerTag) {
          await activeConsumerChannel.cancel(activeConsumerTag).catch(() => {});
        }
        await activeConsumerChannel.close().catch(() => {});
      } catch {
        // Channel may already be closed due to connection loss
      }
      activeConsumerChannel = null;
      activeConsumerTag = null;
    }

    const channel = customChannel || (await createConfirmChannel(connection || (await getRabbitMQConnection())));
    await assertTopology(channel);

    const prefetch = config.RABBITMQ_PREFETCH || 10;
    await channel.prefetch(prefetch);

    activeConsumerChannel = channel;

    channel.once('close', () => {
      if (activeConsumerChannel === channel) {
        activeConsumerChannel = null;
        activeConsumerTag = null;
      }
    });

    const { consumerTag } = await channel.consume(
      TOPOLOGY.QUEUES.JOBS,
      (msg) => {
        if (!msg) {
          activeConsumerTag = null;
          return;
        }
        if (isShuttingDown) {
          logger.warn('Incoming message rejected because evaluation consumer is shutting down');
          return;
        }
        handleEvaluationMessage(msg, channel).catch((err) => {
          logger.error({ err: err.message }, 'Unhandled error in handleEvaluationMessage');
        });
      },
      { noAck: false }
    );

    activeConsumerTag = consumerTag;
    logger.info({ consumerTag, queue: TOPOLOGY.QUEUES.JOBS, prefetch }, 'Evaluation consumer active and ready for jobs');
    return { consumerTag, channel };
  } finally {
    isRestoring = false;
  }
}

/**
 * Starts consuming evaluation jobs from proctornet.evaluation.jobs.
 * Asserts topology, applies prefetch bounds, enables manual acknowledgment,
 * and registers automatic reconnect restoration.
 *
 * @param {object} [options]
 * @returns {Promise<{ consumerTag: string, channel: import('amqplib').ConfirmChannel } | null>}
 */
export async function startEvaluationConsumer(options = {}) {
  if (!config.RABBITMQ_ENABLED) {
    logger.info('RabbitMQ is disabled; skipping evaluation consumer startup');
    return null;
  }

  isShuttingDown = false;

  // Register reconnect hook once to automatically restore consumer after broker reconnect
  if (!unregisterReconnect) {
    unregisterReconnect = registerReconnectHook(async (newConn) => {
      logger.info('RabbitMQ reconnect detected: restoring evaluation consumer...');
      await restoreEvaluationConsumer(newConn);
    });
  }

  return restoreEvaluationConsumer(options.connection || options.channel?.connection, options.channel);
}

/**
 * Stops the active evaluation consumer cleanly and drains in-flight evaluations.
 * Maximum drain time is bounded by maxDrainMs (default: 5000ms).
 *
 * Exact shutdown sequence:
 * 1. Mark isShuttingDown = true to reject incoming deliveries.
 * 2. Unregister reconnect hook to prevent reconnect during teardown.
 * 3. Cancel active consumer tag so RabbitMQ stops routing new deliveries.
 * 4. Await in-flight evaluation handlers up to maxDrainMs (default 5000ms).
 * 5. Close consumer channel only after in-flight handlers finish or timeout expires.
 *
 * @param {object} [options]
 * @param {number} [options.maxDrainMs=5000]
 * @returns {Promise<{ drained: boolean, remainingCount: number }>}
 */
export async function stopEvaluationConsumer(options = {}) {
  const maxDrainMs = options.maxDrainMs ?? 5000;
  isShuttingDown = true;

  if (unregisterReconnect) {
    unregisterReconnect();
    unregisterReconnect = null;
  }

  // 1. Cancel consumer tag so broker stops sending new messages
  if (activeConsumerChannel && activeConsumerTag) {
    try {
      await activeConsumerChannel.cancel(activeConsumerTag);
      logger.info({ consumerTag: activeConsumerTag }, 'Evaluation consumer cancelled; no new deliveries will be accepted');
    } catch (err) {
      logger.warn({ err: err.message }, 'Error cancelling evaluation consumer tag during shutdown');
    }
    activeConsumerTag = null;
  }

  // 2. Drain active in-flight evaluation handlers
  let drained = true;
  if (inFlightHandlers.size > 0) {
    logger.info({ inFlightCount: inFlightHandlers.size, maxDrainMs }, 'Draining active in-flight evaluations...');
    const drainPromise = Promise.all(Array.from(inFlightHandlers));
    let timeoutTimer;
    const timeoutPromise = new Promise((resolve) => {
      timeoutTimer = setTimeout(() => resolve('TIMEOUT'), maxDrainMs);
    });

    const result = await Promise.race([drainPromise, timeoutPromise]);
    if (timeoutTimer) clearTimeout(timeoutTimer);

    if (result === 'TIMEOUT') {
      drained = false;
      logger.warn(
        { remainingInFlight: inFlightHandlers.size, maxDrainMs },
        'Drain timeout reached; proceeding with shutdown while in-flight jobs remain unacknowledged'
      );
    } else {
      logger.info('All in-flight evaluations drained successfully');
    }
  }

  // 3. Close the channel AFTER in-flight handlers finish or timeout
  if (activeConsumerChannel) {
    try {
      await activeConsumerChannel.close().catch(() => {});
    } catch {
      // Channel may already be closed
    }
    activeConsumerChannel = null;
  }

  logger.info({ drained, remainingInFlight: inFlightHandlers.size }, 'Evaluation consumer stopped');
  return { drained, remainingCount: inFlightHandlers.size };
}
