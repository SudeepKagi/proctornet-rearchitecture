/**
 * @file proctoringValidation.test.js
 * @description Unit tests for input validation schemas, privacy boundaries, and severity tamper resistance.
 * Conforms strictly to Phase 14 specifications.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  ingestEventsSchema,
  clientEventItemSchema,
  createManualFlagSchema,
  updateFlagStatusSchema
} from '../../src/modules/proctoring/proctoring.schemas.js';

describe('Proctoring Input Validation & Tamper Resistance (Unit Tests)', () => {
  it('should accept valid client event payload without severity', () => {
    const validEvent = {
      eventId: randomUUID(),
      eventType: 'TAB_HIDDEN',
      clientTimestamp: new Date().toISOString(),
      metadata: {
        durationMs: 1500,
        target: 'window_blur'
      }
    };

    const parsed = clientEventItemSchema.parse(validEvent);
    assert.equal(parsed.eventId, validEvent.eventId);
    assert.equal(parsed.eventType, 'TAB_HIDDEN');
    assert.equal(parsed.metadata.durationMs, 1500);
  });

  it('SEVERITY TAMPER RESISTANCE: should strictly reject client-supplied severity', () => {
    const forgedEvent = {
      eventId: randomUUID(),
      eventType: 'DEVTOOLS_OPEN',
      clientTimestamp: new Date().toISOString(),
      severity: 'LOW' // malicious attempt to downgrade critical event
    };

    assert.throws(
      () => clientEventItemSchema.parse(forgedEvent),
      (err) => {
        const messages = err.errors.map((e) => e.message);
        return messages.some((m) => m.includes('Client-supplied severity is forbidden'));
      }
    );
  });

  it('should strictly reject client-supplied riskScore', () => {
    const forgedEvent = {
      eventId: randomUUID(),
      eventType: 'WINDOW_BLUR',
      clientTimestamp: new Date().toISOString(),
      riskScore: 0
    };

    assert.throws(
      () => clientEventItemSchema.parse(forgedEvent),
      (err) => {
        const messages = err.errors.map((e) => e.message);
        return messages.some((m) => m.includes('Client-supplied risk score is forbidden'));
      }
    );
  });

  it('should reject invalid eventType not in authoritative taxonomy', () => {
    const invalidEvent = {
      eventId: randomUUID(),
      eventType: 'HACKING_TOOL_OPENED',
      clientTimestamp: new Date().toISOString()
    };

    assert.throws(
      () => clientEventItemSchema.parse(invalidEvent),
      (err) => {
        const messages = err.errors.map((e) => e.message);
        return messages.some((m) => m.includes('eventType must be one of'));
      }
    );
  });

  it('should reject future-dated timestamps exceeding 60s drift tolerance', () => {
    const futureTimestamp = new Date(Date.now() + 120 * 1000).toISOString(); // +2 minutes
    const futureEvent = {
      eventId: randomUUID(),
      eventType: 'TAB_VISIBLE',
      clientTimestamp: futureTimestamp
    };

    assert.throws(
      () => clientEventItemSchema.parse(futureEvent),
      (err) => {
        const messages = err.errors.map((e) => e.message);
        return messages.some((m) => m.includes('not exceeding 60s in the future'));
      }
    );
  });

  it('PRIVACY: should reject metadata containing sensitive keywords (password, clipboardText, answer)', () => {
    const passwordEvent = {
      eventId: randomUUID(),
      eventType: 'RESTRICTED_KEY_COMBO',
      clientTimestamp: new Date().toISOString(),
      metadata: {
        target: 'login_form',
        passwordField: 'SuperSecret123'
      }
    };

    assert.throws(
      () => clientEventItemSchema.parse(passwordEvent),
      (err) => {
        const messages = err.errors.map((e) => e.message);
        return messages.some((m) => m.includes('forbidden sensitive keys'));
      }
    );

    const clipboardEvent = {
      eventId: randomUUID(),
      eventType: 'COPY_PASTE_ATTEMPT',
      clientTimestamp: new Date().toISOString(),
      metadata: {
        clipboardText: 'Copied exam question answer content'
      }
    };

    assert.throws(
      () => clientEventItemSchema.parse(clipboardEvent),
      (err) => {
        const messages = err.errors.map((e) => e.message);
        return messages.some((m) => m.includes('forbidden sensitive keys'));
      }
    );
  });

  it('should reject event metadata exceeding 4KB payload limit', () => {
    const largeString = 'A'.repeat(5000);
    const heavyEvent = {
      eventId: randomUUID(),
      eventType: 'WINDOW_BLUR',
      clientTimestamp: new Date().toISOString(),
      metadata: {
        filler: largeString
      }
    };

    assert.throws(
      () => clientEventItemSchema.parse(heavyEvent),
      (err) => {
        const messages = err.errors.map((e) => e.message);
        return messages.some((m) => m.includes('exceeds maximum payload size of 4KB'));
      }
    );
  });

  it('should enforce batch bounds: minimum 1 and maximum 50 events per batch', () => {
    assert.throws(
      () => ingestEventsSchema.parse({ events: [] }),
      (err) => err.errors.some((e) => e.message.includes('at least 1 event'))
    );

    const over50Events = Array.from({ length: 51 }, () => ({
      eventId: randomUUID(),
      eventType: 'PERIODIC_HEARTBEAT',
      clientTimestamp: new Date().toISOString()
    }));

    assert.throws(
      () => ingestEventsSchema.parse({ events: over50Events }),
      (err) => err.errors.some((e) => e.message.includes('cannot exceed 50 events'))
    );
  });

  it('should validate manual flag creation and reject client session_id / student_id injection', () => {
    const validManualFlag = {
      flagType: 'SUSPICIOUS_GLANCE',
      severity: 'HIGH',
      notes: 'Candidate glancing repeatedly away from screen.'
    };

    const parsed = createManualFlagSchema.parse(validManualFlag);
    assert.equal(parsed.flagType, 'SUSPICIOUS_GLANCE');
    assert.equal(parsed.severity, 'HIGH');

    // Reject client-supplied session_id or student_id
    assert.throws(
      () =>
        createManualFlagSchema.parse({
          flagType: 'SUSPICIOUS_GLANCE',
          sessionId: randomUUID()
        }),
      (err) => err.errors.some((e) => e.message.includes('Client cannot provide session_id'))
    );

    assert.throws(
      () =>
        createManualFlagSchema.parse({
          flagType: 'SUSPICIOUS_GLANCE',
          studentId: randomUUID()
        }),
      (err) => err.errors.some((e) => e.message.includes('Client cannot provide student_id'))
    );
  });

  it('should validate flag review status update transitions and reject invalid statuses', () => {
    assert.equal(updateFlagStatusSchema.parse({ status: 'REVIEWED' }).status, 'REVIEWED');
    assert.equal(updateFlagStatusSchema.parse({ status: 'DISMISSED', notes: 'Dismissed by invigilator' }).status, 'DISMISSED');

    assert.throws(
      () => updateFlagStatusSchema.parse({ status: 'ACTIVE' }),
      (err) => err.errors.some((e) => e.message.includes("Status must be transitioned to 'REVIEWED' or 'DISMISSED'"))
    );

    assert.throws(
      () => updateFlagStatusSchema.parse({ status: 'RESOLVED' }),
      (err) => err.errors.some((e) => e.message.includes("Status must be transitioned to 'REVIEWED' or 'DISMISSED'"))
    );
  });
});
