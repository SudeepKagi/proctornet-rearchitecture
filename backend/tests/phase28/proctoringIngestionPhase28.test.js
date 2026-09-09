/**
 * @file proctoringIngestionPhase28.test.js
 * @description Phase 28 integration tests for proctoring event ingestion:
 * - Stage 1 deterministic telemetry (BROWSER_FOCUS_LOST, EXAM_VISIBILITY_LOST, FULLSCREEN_EXIT, SCREEN_CAPTURE_INTERRUPTED, SCREEN_STREAM_DEGRADED)
 * - Stage 2 screen context classification (EXAM_CONTEXT, NON_EXAM_CONTEXT, UNKNOWN_CONTEXT)
 * - Rejection of client-submitted REPEATED_CONTEXT_SWITCHING and riskScore
 * - Server-side correlation deriving REPEATED_CONTEXT_SWITCHING
 * - Technical risk ceiling (max 15 points)
 * - Fullscreen 5-minute sliding window escalation
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { app } from '../../src/app.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { closeRabbitMQ } from '../../src/infrastructure/rabbitmq/client.js';
import { setupProctoringFixture } from '../proctoring/proctoringTestHelper.js';

describe('Phase 28 Proctoring Ingestion API (Integration)', () => {
  let fixture;

  before(async () => {
    fixture = await setupProctoringFixture();
  });

  after(async () => {
    await new Promise((r) => setTimeout(r, 200));
    await closeRabbitMQ();
    await closeRedis();
    await closePool();
  });

  it('TEST C: should reject client submission of REPEATED_CONTEXT_SWITCHING with HTTP 400', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'REPEATED_CONTEXT_SWITCHING',
            clientTimestamp: new Date().toISOString()
          }
        ]
      });

    assert.equal(res.status, 400);
    const errorMsg = JSON.stringify(res.body);
    assert.match(errorMsg, /Direct client submission of server-derived events.*strictly prohibited/);
  });

  it('TEST C: should reject client submission of riskScore or severity with HTTP 400', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'BROWSER_FOCUS_LOST',
            clientTimestamp: new Date().toISOString(),
            riskScore: 75
          }
        ]
      });

    assert.equal(res.status, 400);
  });

  it('TEST E: should ingest EXAM_CONTEXT with 0 risk increment (normal exam activity)', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'SCREEN_CONTEXT_CLASSIFICATION',
            clientTimestamp: new Date().toISOString(),
            metadata: {
              contextState: 'EXAM_CONTEXT',
              confidence: 0.98
            }
          }
        ]
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.accepted, 1);
    assert.equal(res.body.data.riskScore, 0, 'EXAM_CONTEXT must produce 0 risk score');
  });

  it('TEST F: should ingest UNKNOWN_CONTEXT as low-confidence advisory (+2), not a severe violation', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'SCREEN_CONTEXT_CLASSIFICATION',
            clientTimestamp: new Date().toISOString(),
            metadata: {
              contextState: 'UNKNOWN_CONTEXT',
              confidence: 0.50
            }
          }
        ]
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.accepted, 1);
    assert.equal(res.body.data.riskScore, 2);
  });

  it('STAGE 3: should authoritatively derive REPEATED_CONTEXT_SWITCHING (+20) when focus loss coincides with NON_EXAM_CONTEXT', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'BROWSER_FOCUS_LOST',
            clientTimestamp: new Date().toISOString(),
            metadata: { durationMs: 2500 }
          },
          {
            eventId: randomUUID(),
            eventType: 'SCREEN_CONTEXT_CLASSIFICATION',
            clientTimestamp: new Date().toISOString(),
            metadata: {
              contextState: 'NON_EXAM_CONTEXT',
              confidence: 0.92
            }
          }
        ]
      });

    assert.equal(res.status, 200);
    // 2 client events + 1 server-derived REPEATED_CONTEXT_SWITCHING = 3 accepted events in violation_events
    assert.ok(res.body.data.accepted >= 2);

    // Verify REPEATED_CONTEXT_SWITCHING row in database
    const dbEvents = await query(
      `SELECT event_type, severity, metadata FROM violation_events WHERE attempt_id = $1 ORDER BY server_timestamp ASC;`,
      [attempt.attempt_id]
    );

    const derivedEvent = dbEvents.rows.find((r) => r.event_type === 'REPEATED_CONTEXT_SWITCHING');
    assert.ok(derivedEvent, 'Server should have synthesized REPEATED_CONTEXT_SWITCHING');
    assert.equal(derivedEvent.severity, 'HIGH');
    assert.equal(derivedEvent.metadata.autoDerived, true);

    // Score: BROWSER_FOCUS_LOST (+5) + NON_EXAM_CONTEXT (+15) + REPEATED_CONTEXT_SWITCHING (+20) = 40
    assert.equal(res.body.data.riskScore, 40);
  });

  it('TEST A: should enforce TECHNICAL_RISK_CONTRIBUTION_CAP (max 15 points) on repeated technical failures', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    // Send 1st technical event: SCREEN_CAPTURE_INTERRUPTED (+10)
    const res1 = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'SCREEN_CAPTURE_INTERRUPTED',
            clientTimestamp: new Date().toISOString(),
            metadata: { reason: 'Screen share stopped' }
          }
        ]
      });
    assert.equal(res1.status, 200);
    assert.equal(res1.body.data.riskScore, 10);

    // Send 2nd technical event: SCREEN_CAPTURE_INTERRUPTED (+10, capped at 15 -> +5)
    const res2 = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'SCREEN_CAPTURE_INTERRUPTED',
            clientTimestamp: new Date().toISOString(),
            metadata: { reason: 'Screen share stopped again' }
          }
        ]
      });
    assert.equal(res2.status, 200);
    assert.equal(res2.body.data.riskScore, 15);

    // Send 3rd and 4th technical events: SCREEN_STREAM_DEGRADED (+2 each, but already capped at 15 -> +0)
    const res3 = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'SCREEN_STREAM_DEGRADED',
            clientTimestamp: new Date().toISOString(),
            metadata: { fps: 0 }
          },
          {
            eventId: randomUUID(),
            eventType: 'SCREEN_STREAM_DEGRADED',
            clientTimestamp: new Date().toISOString(),
            metadata: { fps: 0 }
          }
        ]
      });
    assert.equal(res3.status, 200);
    assert.equal(res3.body.data.riskScore, 15, 'Technical events alone must not exceed 15 points');

    // Assert database risk_score on attempt is exactly 15
    const dbAttempt = await query(
      `SELECT risk_score FROM exam_attempts WHERE attempt_id = $1;`,
      [attempt.attempt_id]
    );
    assert.equal(Number(dbAttempt.rows[0].risk_score), 15);
  });

  it('TEST B: should escalate fullscreen exits across active 5-minute sliding window', async () => {
    const { attempt, token } = await fixture.createStudentAttempt('ACTIVE');

    // 1st exit: +5
    const res1 = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'FULLSCREEN_EXIT',
            clientTimestamp: new Date().toISOString()
          }
        ]
      });
    assert.equal(res1.body.data.riskScore, 5);

    // 2nd exit inside window: +10 (total: 15)
    const res2 = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'FULLSCREEN_EXIT',
            clientTimestamp: new Date().toISOString()
          }
        ]
      });
    assert.equal(res2.body.data.riskScore, 15);

    // 3rd exit inside window: +15 and raises REPEATED_FULLSCREEN_EXIT flag
    const res3 = await request(app)
      .post(`/api/v1/attempts/${attempt.attempt_id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            eventType: 'FULLSCREEN_EXIT',
            clientTimestamp: new Date().toISOString()
          }
        ]
      });
    assert.equal(res3.body.data.riskScore, 30);

    const flags = await query(
      `SELECT flag_type, severity FROM violation_flags WHERE attempt_id = $1 AND flag_type = 'REPEATED_FULLSCREEN_EXIT';`,
      [attempt.attempt_id]
    );
    assert.equal(flags.rows.length, 1);
    assert.equal(flags.rows[0].severity, 'HIGH');
  });
});
