/**
 * @file outbox.service.js
 * @description Outbox Service lifecycle management, singleton dispatcher initialization, and dispatch triggering.
 * Conforms to Step 13.5 and Step 13.17 specifications.
 */

import { config } from '../../config/env.js';
import { OutboxDispatcher } from './outbox.dispatcher.js';
import { InProcessEventTransport, RabbitMQEventTransport } from './outbox.transport.js';
import { evaluationWorker } from '../evaluation/evaluation.worker.js';
import { logger } from '../../utils/logger.js';

let pollerTimer = null;
let staleRecoveryTimer = null;

// Select default transport based on configuration
const defaultTransport = config.RABBITMQ_ENABLED
  ? new RabbitMQEventTransport()
  : new InProcessEventTransport(evaluationWorker);

export const outboxDispatcher = new OutboxDispatcher(defaultTransport, {
  batchSize: 20,
  staleMinutes: 5
});

/**
 * Sets or swaps the active event transport on the outbox dispatcher.
 * @param {import('./outbox.transport.js').EventTransport} transport
 */
export function setOutboxTransport(transport) {
  outboxDispatcher.setTransport(transport);
}

/**
 * Triggers a non-blocking outbox dispatch cycle to process pending/retryable events.
 * @returns {Promise<{ claimed: number, published: number, failed: number }>}
 */
export async function triggerOutboxDispatch() {
  try {
    return await outboxDispatcher.dispatchPendingEvents();
  } catch (err) {
    logger.error({ err }, 'Error during triggered outbox dispatch');
    return { claimed: 0, published: 0, failed: 0 };
  }
}

/**
 * Triggers stale lock recovery for events stuck in PROCESSING status.
 * @returns {Promise<number>}
 */
export async function triggerStaleRecovery() {
  try {
    return await outboxDispatcher.recoverStaleProcessing();
  } catch (err) {
    logger.error({ err }, 'Error during outbox stale recovery');
    return 0;
  }
}

/**
 * Starts the periodic outbox background poller and stale lock recovery timers.
 * @param {number} [intervalMs]
 */
export function startOutboxPoller(intervalMs = config.RABBITMQ_DISPATCH_INTERVAL_MS || 5000) {
  if (pollerTimer) {
    return;
  }

  pollerTimer = setInterval(() => {
    triggerOutboxDispatch().catch((err) => {
      logger.error({ err: err.message }, 'Background outbox poller error');
    });
  }, intervalMs);

  if (typeof pollerTimer.unref === 'function') {
    pollerTimer.unref();
  }

  // Periodic stale processing recovery every 60s
  staleRecoveryTimer = setInterval(() => {
    triggerStaleRecovery().catch((err) => {
      logger.error({ err: err.message }, 'Background outbox stale recovery error');
    });
  }, 60000);

  if (typeof staleRecoveryTimer.unref === 'function') {
    staleRecoveryTimer.unref();
  }

  logger.info({ intervalMs }, 'Outbox poller and stale recovery timers started');
}

/**
 * Stops the periodic outbox background poller cleanly.
 */
export function stopOutboxPoller() {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }

  if (staleRecoveryTimer) {
    clearInterval(staleRecoveryTimer);
    staleRecoveryTimer = null;
  }

  logger.info('Outbox poller stopped');
}
