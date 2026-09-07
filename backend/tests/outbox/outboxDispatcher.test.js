/**
 * @file outboxDispatcher.test.js
 * @description Unit & Integration tests for the Outbox Dispatcher, FOR UPDATE SKIP LOCKED claiming,
 * exponential backoff, retry budget exhaustion, and stale processing lock recovery.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { OutboxDispatcher } from '../../src/modules/outbox/outbox.dispatcher.js';
import * as outboxRepo from '../../src/modules/outbox/outbox.repository.js';

describe('Outbox Dispatcher (Integration)', () => {
  before(async () => {
    // Clean up any lingering outbox events from other tests to ensure predictable counts
    await query(`DELETE FROM outbox_events WHERE aggregate_type = 'TEST_AGGREGATE';`);
  });

  after(async () => {
    await query(`DELETE FROM outbox_events WHERE aggregate_type = 'TEST_AGGREGATE';`);
    await closeRedis();
    await closePool();
  });

  it('should claim pending events using SKIP LOCKED and mark them PUBLISHED on successful dispatch', async () => {
    const testAttemptId = randomUUID();
    const event = await outboxRepo.insertOutboxEvent({
      aggregateType: 'TEST_AGGREGATE',
      aggregateId: testAttemptId,
      eventType: 'ATTEMPT_SUBMITTED',
      payload: { attempt_id: testAttemptId },
      maxRetries: 5
    });

    const publishedEvents = [];
    const mockTransport = {
      publish: async (evt) => {
        publishedEvents.push(evt);
      }
    };

    const dispatcher = new OutboxDispatcher(mockTransport, { batchSize: 10 });
    const result = await dispatcher.dispatchPendingEvents();

    assert.ok(result.claimed >= 1);
    assert.ok(result.published >= 1);
    assert.equal(result.failed, 0);

    const checkRes = await query(`SELECT * FROM outbox_events WHERE event_id = $1;`, [event.event_id]);
    const updated = checkRes.rows[0];

    assert.equal(updated.status, 'PUBLISHED');
    assert.ok(updated.published_at);
    assert.equal(updated.retry_count, 0);
    assert.equal(publishedEvents.some((e) => e.event_id === event.event_id), true);
  });

  it('should mark event FAILED and calculate exponential backoff next_retry_at on transport failure', async () => {
    const testAttemptId = randomUUID();
    const event = await outboxRepo.insertOutboxEvent({
      aggregateType: 'TEST_AGGREGATE',
      aggregateId: testAttemptId,
      eventType: 'ATTEMPT_SUBMITTED',
      payload: { attempt_id: testAttemptId },
      maxRetries: 5
    });

    const mockFailingTransport = {
      publish: async () => {
        throw new Error('Connection timeout to downstream worker');
      }
    };

    const dispatcher = new OutboxDispatcher(mockFailingTransport, { batchSize: 10 });
    const result = await dispatcher.dispatchPendingEvents();

    assert.ok(result.claimed >= 1);
    assert.ok(result.failed >= 1);

    const checkRes = await query(`SELECT * FROM outbox_events WHERE event_id = $1;`, [event.event_id]);
    const updated = checkRes.rows[0];

    assert.equal(updated.status, 'FAILED');
    assert.equal(updated.retry_count, 1);
    assert.ok(updated.next_retry_at);
    assert.ok(new Date(updated.next_retry_at).getTime() > Date.now());
    assert.match(updated.last_error, /Connection timeout/);
  });

  it('should permanently fail event with next_retry_at = NULL when retry_count reaches max_retries', async () => {
    const testAttemptId = randomUUID();
    const event = await outboxRepo.insertOutboxEvent({
      aggregateType: 'TEST_AGGREGATE',
      aggregateId: testAttemptId,
      eventType: 'ATTEMPT_SUBMITTED',
      payload: { attempt_id: testAttemptId },
      maxRetries: 3
    });

    // Artificially set retry_count to 2 (one attempt remaining before permanent exhaustion)
    await query(
      `UPDATE outbox_events SET retry_count = 2, status = 'PENDING' WHERE event_id = $1;`,
      [event.event_id]
    );

    const mockFailingTransport = {
      publish: async () => {
        throw new Error('Downstream queue permanently unroutable');
      }
    };

    const dispatcher = new OutboxDispatcher(mockFailingTransport, { batchSize: 10 });
    const result = await dispatcher.dispatchPendingEvents();

    assert.ok(result.claimed >= 1);
    assert.ok(result.failed >= 1);

    const checkRes = await query(`SELECT * FROM outbox_events WHERE event_id = $1;`, [event.event_id]);
    const updated = checkRes.rows[0];

    assert.equal(updated.status, 'FAILED');
    assert.equal(updated.retry_count, 3);
    assert.equal(updated.next_retry_at, null); // NULL next_retry_at prevents any future claiming
    assert.match(updated.last_error, /Downstream queue permanently unroutable/);
  });

  it('should recover stale PROCESSING events after simulated dispatcher crash and consume retry budget', async () => {
    const testAttemptId = randomUUID();
    const event = await outboxRepo.insertOutboxEvent({
      aggregateType: 'TEST_AGGREGATE',
      aggregateId: testAttemptId,
      eventType: 'ATTEMPT_SUBMITTED',
      payload: { attempt_id: testAttemptId },
      maxRetries: 5
    });

    // Simulate dispatcher crash: status was set to PROCESSING 15 minutes ago
    await query(
      `UPDATE outbox_events 
       SET status = 'PROCESSING', 
           updated_at = CURRENT_TIMESTAMP - interval '15 minutes' 
       WHERE event_id = $1;`,
      [event.event_id]
    );

    const mockTransport = { publish: async () => {} };
    const dispatcher = new OutboxDispatcher(mockTransport, { staleMinutes: 5 });

    const recoveredCount = await dispatcher.recoverStaleProcessing();
    assert.ok(recoveredCount >= 1);

    const checkRes = await query(`SELECT * FROM outbox_events WHERE event_id = $1;`, [event.event_id]);
    const updated = checkRes.rows[0];

    assert.equal(updated.status, 'FAILED');
    assert.equal(updated.retry_count, 1); // retry budget consumed!
    assert.ok(updated.next_retry_at);
    assert.match(updated.last_error, /Stale processing lock recovered/);
  });

  it('should permanently fail stale PROCESSING events if recovery reaches max_retries', async () => {
    const testAttemptId = randomUUID();
    const event = await outboxRepo.insertOutboxEvent({
      aggregateType: 'TEST_AGGREGATE',
      aggregateId: testAttemptId,
      eventType: 'ATTEMPT_SUBMITTED',
      payload: { attempt_id: testAttemptId },
      maxRetries: 2
    });

    // Simulate repeated crashes where retry_count is already 1 of 2
    await query(
      `UPDATE outbox_events 
       SET status = 'PROCESSING', 
           retry_count = 1,
           updated_at = CURRENT_TIMESTAMP - interval '20 minutes' 
       WHERE event_id = $1;`,
      [event.event_id]
    );

    const mockTransport = { publish: async () => {} };
    const dispatcher = new OutboxDispatcher(mockTransport, { staleMinutes: 5 });

    const recoveredCount = await dispatcher.recoverStaleProcessing();
    assert.ok(recoveredCount >= 1);

    const checkRes = await query(`SELECT * FROM outbox_events WHERE event_id = $1;`, [event.event_id]);
    const updated = checkRes.rows[0];

    assert.equal(updated.status, 'FAILED');
    assert.equal(updated.retry_count, 2);
    assert.equal(updated.next_retry_at, null); // permanently exhausted
    assert.match(updated.last_error, /Exhausted retry budget due to repeated crashes/);
  });
});
