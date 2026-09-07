/**
 * @file outbox.service.js
 * @description Outbox Service lifecycle management, singleton dispatcher initialization, and dispatch triggering.
 * Conforms to Step 13.5 and Step 13.17 specifications.
 */

import { OutboxDispatcher } from './outbox.dispatcher.js';
import { InProcessEventTransport } from './outbox.transport.js';
import { evaluationWorker } from '../evaluation/evaluation.worker.js';
import { logger } from '../../utils/logger.js';

// Initialize singleton transport and dispatcher
const inProcessTransport = new InProcessEventTransport(evaluationWorker);
export const outboxDispatcher = new OutboxDispatcher(inProcessTransport, {
  batchSize: 20,
  staleMinutes: 5
});

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
