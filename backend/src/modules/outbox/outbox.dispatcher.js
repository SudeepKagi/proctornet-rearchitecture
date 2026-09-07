/**
 * @file outbox.dispatcher.js
 * @description Outbox Dispatcher engine: safely claims pending events using FOR UPDATE SKIP LOCKED,
 * hands off to the transport layer, orchestrates exponential retry backoff, and recovers stale processing locks.
 * Conforms to Step 13.5 and Phase 8 specifications.
 */

import { getPool } from '../../infrastructure/postgres/pool.js';
import { logger } from '../../utils/logger.js';
import * as outboxRepo from './outbox.repository.js';
import { outboxBacklogTotal, outboxDispatchDuration } from '../../infrastructure/metrics/registry.js';

export class OutboxDispatcher {
  /**
   * @param {import('./outbox.transport.js').EventTransport} eventTransport
   * @param {object} [options={}]
   * @param {number} [options.batchSize=20]
   * @param {number} [options.staleMinutes=5]
   */
  constructor(eventTransport, options = {}) {
    this.eventTransport = eventTransport;
    this.batchSize = options.batchSize || 20;
    this.staleMinutes = options.staleMinutes || 5;
    this.isDispatching = false;
  }

  /**
   * Sets or updates the event transport.
   * @param {import('./outbox.transport.js').EventTransport} transport
   */
  setTransport(transport) {
    this.eventTransport = transport;
  }

  /**
   * Claims a batch of pending/retryable events and dispatches them through the transport.
   * Execution is guarded against concurrent overlapping execution within the same instance.
   *
   * @returns {Promise<{ claimed: number, published: number, failed: number }>}
   */
  async dispatchPendingEvents() {
    if (this.isDispatching) {
      return { claimed: 0, published: 0, failed: 0 };
    }

    const dispatchStart = process.hrtime.bigint();
    this.isDispatching = true;
    const pool = getPool();
    const client = await pool.connect();
    let claimedEvents = [];

    try {
      // 1. Short claim transaction with FOR UPDATE SKIP LOCKED
      await client.query('BEGIN');

      claimedEvents = await outboxRepo.claimPendingEvents(this.batchSize, client);

      if (claimedEvents.length === 0) {
        await client.query('ROLLBACK');
        this.updateBacklogMetrics().catch(() => {});
        return { claimed: 0, published: 0, failed: 0 };
      }

      const eventIds = claimedEvents.map((e) => e.event_id);
      await outboxRepo.markEventsProcessing(eventIds, client);

      // Commit immediately to release row locks before transport publication
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error({ err }, 'Error during outbox claiming transaction');
      return { claimed: 0, published: 0, failed: 0 };
    } finally {
      client.release();
      this.isDispatching = false;
    }

    // 2. Dispatch events outside of database lock
    let publishedCount = 0;
    let failedCount = 0;

    for (const event of claimedEvents) {
      try {
        await this.eventTransport.publish(event);
        await outboxRepo.markEventPublished(event.event_id);
        publishedCount++;
        logger.debug({ eventId: event.event_id, eventType: event.event_type }, 'Outbox event published successfully');
      } catch (err) {
        failedCount++;
        const newRetryCount = Number(event.retry_count) + 1;
        const maxRetries = Number(event.max_retries) || 5;
        let nextRetryAt = null;

        if (newRetryCount < maxRetries) {
          // Exponential backoff: 2s, 4s, 8s, 16s...
          const backoffSeconds = Math.pow(2, newRetryCount) * 2;
          nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
        } else {
          logger.error(
            { eventId: event.event_id, retryCount: newRetryCount, maxRetries },
            'Outbox event permanently failed: exhausted retry budget'
          );
        }

        await outboxRepo.markEventFailed(
          event.event_id,
          err instanceof Error ? err.message : String(err),
          newRetryCount,
          nextRetryAt
        );

        logger.warn(
          {
            eventId: event.event_id,
            error: err instanceof Error ? err.message : String(err),
            retryCount: newRetryCount,
            nextRetryAt
          },
          'Outbox event dispatch failed; scheduled retry'
        );
      }
    }

    const durationSec = Number(process.hrtime.bigint() - dispatchStart) / 1e9;
    try {
      const transportName = this.eventTransport?.constructor?.name === 'RabbitMQEventTransport' ? 'rabbitmq' : 'in_process';
      outboxDispatchDuration.observe({ transport: transportName }, durationSec);
    } catch {}

    this.updateBacklogMetrics().catch(() => {});

    return {
      claimed: claimedEvents.length,
      published: publishedCount,
      failed: failedCount
    };
  }

  /**
   * Updates Prometheus outbox backlog gauges asynchronously.
   * @returns {Promise<void>}
   */
  async updateBacklogMetrics() {
    try {
      const counts = await outboxRepo.getOutboxBacklogCounts();
      const statusMap = { PENDING: 0, PROCESSING: 0, FAILED: 0 };
      for (const row of counts) {
        statusMap[row.status] = Number(row.count) || 0;
      }
      outboxBacklogTotal.set({ status: 'PENDING' }, statusMap.PENDING);
      outboxBacklogTotal.set({ status: 'PROCESSING' }, statusMap.PROCESSING);
      outboxBacklogTotal.set({ status: 'RETRYABLE' }, statusMap.FAILED);
    } catch {
      // Metric update must not fail dispatcher
    }
  }

  /**
   * Recovers events that have been stuck in PROCESSING state due to a crashed process.
   * Increments retry_count to consume retry budget.
   *
   * @returns {Promise<number>} Number of recovered events
   */
  async recoverStaleProcessing() {
    try {
      const recovered = await outboxRepo.recoverStaleProcessingEvents(this.staleMinutes);
      if (recovered.length > 0) {
        logger.warn(
          { recoveredCount: recovered.length },
          'Recovered stale outbox events stuck in PROCESSING status'
        );
      }
      return recovered.length;
    } catch (err) {
      logger.error({ err }, 'Error recovering stale processing outbox events');
      return 0;
    }
  }
}
