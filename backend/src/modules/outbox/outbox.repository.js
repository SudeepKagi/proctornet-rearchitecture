/**
 * @file outbox.repository.js
 * @description PostgreSQL persistence layer for Transactional Outbox Events, Claiming, and State Transitions.
 * Conforms to Step 13.5 and Phase 8 specifications.
 */

import { query } from '../../infrastructure/postgres/pool.js';

/**
 * Claims pending or eligible failed outbox events using FOR UPDATE SKIP LOCKED.
 * Excludes permanently failed events (next_retry_at IS NULL).
 *
 * @param {number} batchSize
 * @param {import('pg').PoolClient} client
 * @returns {Promise<Array<object>>}
 */
export async function claimPendingEvents(batchSize, client) {
  const sql = `
    SELECT 
      event_id,
      aggregate_type,
      aggregate_id,
      event_type,
      payload,
      status,
      retry_count,
      max_retries,
      next_retry_at,
      created_at
    FROM outbox_events
    WHERE (
      status = 'PENDING'
      OR (status = 'FAILED' AND next_retry_at IS NOT NULL AND next_retry_at <= CURRENT_TIMESTAMP)
    )
    AND retry_count < max_retries
    ORDER BY created_at ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED;
  `;
  const result = await client.query(sql, [batchSize]);
  return result.rows;
}

/**
 * Marks a batch of events as PROCESSING.
 * @param {string[]} eventIds
 * @param {import('pg').PoolClient} client
 * @returns {Promise<Array<object>>}
 */
export async function markEventsProcessing(eventIds, client) {
  if (!eventIds || eventIds.length === 0) return [];
  const sql = `
    UPDATE outbox_events
    SET 
      status = 'PROCESSING',
      updated_at = CURRENT_TIMESTAMP
    WHERE event_id = ANY($1)
    RETURNING event_id, status, retry_count, max_retries;
  `;
  const result = await client.query(sql, [eventIds]);
  return result.rows;
}

/**
 * Marks an outbox event as PUBLISHED.
 * @param {string} eventId
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function markEventPublished(eventId, client = null) {
  const sql = `
    UPDATE outbox_events
    SET 
      status = 'PUBLISHED',
      published_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE event_id = $1
    RETURNING event_id, status, published_at;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [eventId]);
  return result.rows[0];
}

/**
 * Marks an outbox event as FAILED, updating retry count and next retry time.
 * If nextRetryAt is null, the event is permanently failed (unretryable).
 *
 * @param {string} eventId
 * @param {string} errorMessage
 * @param {number} retryCount
 * @param {Date|string|null} nextRetryAt
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function markEventFailed(eventId, errorMessage, retryCount, nextRetryAt, client = null) {
  const sql = `
    UPDATE outbox_events
    SET 
      status = 'FAILED',
      retry_count = $2,
      next_retry_at = $3,
      last_error = $4,
      updated_at = CURRENT_TIMESTAMP
    WHERE event_id = $1
    RETURNING event_id, status, retry_count, max_retries, next_retry_at, last_error;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [eventId, retryCount, nextRetryAt, errorMessage]);
  return result.rows[0];
}

/**
 * Recovers events stuck in PROCESSING status due to dispatcher crash.
 * Consumes retry budget by incrementing retry_count. If retry_count >= max_retries,
 * sets next_retry_at = NULL (permanently failed).
 *
 * @param {number} [staleMinutes=5]
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<object>>}
 */
export async function recoverStaleProcessingEvents(staleMinutes = 5, client = null) {
  const sql = `
    UPDATE outbox_events
    SET 
      retry_count = retry_count + 1,
      status = 'FAILED',
      next_retry_at = CASE 
        WHEN retry_count + 1 >= max_retries THEN NULL
        ELSE CURRENT_TIMESTAMP + (power(2, retry_count + 1) * interval '2 seconds')
      END,
      last_error = CASE
        WHEN retry_count + 1 >= max_retries THEN 'Exhausted retry budget due to repeated crashes'
        ELSE 'Stale processing lock recovered after dispatcher crash'
      END,
      updated_at = CURRENT_TIMESTAMP
    WHERE status = 'PROCESSING'
      AND updated_at < CURRENT_TIMESTAMP - ($1 || ' minutes')::interval
    RETURNING event_id, retry_count, max_retries, next_retry_at, last_error;
  `;
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, [staleMinutes]);
  return result.rows;
}

/**
 * Inserts a transactional outbox event.
 * @param {object} event
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<object>}
 */
export async function insertOutboxEvent(event, client = null) {
  const sql = `
    INSERT INTO outbox_events (
      aggregate_type,
      aggregate_id,
      event_type,
      payload,
      status,
      retry_count,
      max_retries,
      next_retry_at,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, 'PENDING', 0, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING *;
  `;
  const params = [
    event.aggregateType,
    event.aggregateId,
    event.eventType,
    JSON.stringify(event.payload),
    event.maxRetries ?? 5
  ];
  const executor = client ? client.query.bind(client) : query;
  const result = await executor(sql, params);
  return result.rows[0];
}

/**
 * Retrieves aggregate outbox backlog counts grouped by status.
 * @returns {Promise<Array<{ status: string, count: number }>>}
 */
export async function getOutboxBacklogCounts() {
  const sql = `
    SELECT status, COUNT(*)::int AS count
    FROM outbox_events
    WHERE status IN ('PENDING', 'PROCESSING', 'FAILED')
    GROUP BY status;
  `;
  const result = await query(sql);
  return result.rows;
}
