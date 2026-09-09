/**
 * @file anomalyScoringPhase28.test.js
 * @description Phase 28 unit tests for technical risk ceiling (cap=15), 5-minute fullscreen escalation,
 * false-positive protection for normal exam activity, 3-state screen classification,
 * debouncing, and server-side correlation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_TAXONOMY,
  TECHNICAL_RISK_CONTRIBUTION_CAP,
  FULLSCREEN_ESCALATION_WINDOW_MS,
  FOCUS_LOSS_DEBOUNCE_THRESHOLD_MS,
  getEventWeight,
  calculateScoreIncrement,
  calculateNewRiskScore,
  evaluateFlagsToRaise
} from '../../src/modules/proctoring/anomalyScorer.js';
import {
  clientEventItemSchema,
  CLIENT_ALLOWED_EVENT_TYPES
} from '../../src/modules/proctoring/proctoring.schemas.js';

describe('Phase 28 Anomaly Scorer & Policy Boundaries', () => {
  describe('TEST A: Technical Risk Ceiling (Cap = 15)', () => {
    it('should strictly cap cumulative technical risk points at 15', () => {
      assert.equal(TECHNICAL_RISK_CONTRIBUTION_CAP, 15);

      // 1st technical event: SCREEN_CAPTURE_INTERRUPTED (weight: 10)
      const inc1 = calculateScoreIncrement([{ event_type: 'SCREEN_CAPTURE_INTERRUPTED' }], {
        currentTechnicalPoints: 0
      });
      assert.equal(inc1, 10);

      // 2nd technical event: another SCREEN_CAPTURE_INTERRUPTED (weight: 10, but cap is 15 -> only +5 allowed)
      const inc2 = calculateScoreIncrement([{ event_type: 'SCREEN_CAPTURE_INTERRUPTED' }], {
        currentTechnicalPoints: 10
      });
      assert.equal(inc2, 5);

      // 3rd technical event: SCREEN_STREAM_DEGRADED (weight: 2, but already at 15 -> 0 allowed)
      const inc3 = calculateScoreIncrement([{ event_type: 'SCREEN_STREAM_DEGRADED' }], {
        currentTechnicalPoints: 15
      });
      assert.equal(inc3, 0);
    });

    it('should prevent repeated technical failures alone from elevating risk score >= 50 or >= 80', () => {
      const tenTechnicalEvents = Array.from({ length: 10 }, () => ({
        event_type: 'SCREEN_STREAM_DEGRADED'
      }));

      const newScore = calculateNewRiskScore(0, tenTechnicalEvents, {
        currentTechnicalPoints: 0,
        hasOnlyTechnicalEvents: true
      });

      assert.ok(newScore <= 15, `Score should be <= 15 but got ${newScore}`);
      assert.notEqual(newScore, 50);
      assert.notEqual(newScore, 80);

      // Verify flag evaluation: technical failures alone NEVER trigger ELEVATED_RISK or HIGH_RISK
      const flags = evaluateFlagsToRaise(0, newScore, tenTechnicalEvents, {
        hasOnlyTechnicalEvents: true
      });

      const elevatedOrHighFlags = flags.filter(
        (f) => f.flagType === 'ELEVATED_RISK' || f.flagType === 'HIGH_RISK'
      );
      assert.equal(elevatedOrHighFlags.length, 0, 'Technical events alone must not trigger behavioral risk flags');
    });
  });

  describe('TEST B: Fullscreen 5-Minute Sliding Window Escalation', () => {
    it('should escalate fullscreen exits: 1st exit -> +5, 2nd exit -> +10, 3+ exits -> +15 and flag', () => {
      assert.equal(FULLSCREEN_ESCALATION_WINDOW_MS, 300000);

      // 1st exit in window
      const exit1 = getEventWeight({ event_type: 'FULLSCREEN_EXIT' }, { recentFullscreenCount: 0 });
      assert.equal(exit1.weight, 5);
      assert.equal(exit1.effectiveSeverity, 'MEDIUM');

      // 2nd exit in window
      const exit2 = getEventWeight({ event_type: 'FULLSCREEN_EXIT' }, { recentFullscreenCount: 1 });
      assert.equal(exit2.weight, 10);
      assert.equal(exit2.effectiveSeverity, 'MEDIUM');

      // 3rd exit in window (escalates to HIGH severity)
      const exit3 = getEventWeight({ event_type: 'FULLSCREEN_EXIT' }, { recentFullscreenCount: 2 });
      assert.equal(exit3.weight, 15);
      assert.equal(exit3.effectiveSeverity, 'HIGH');

      // Verify 3+ exits raise REPEATED_FULLSCREEN_EXIT flag
      const flags = evaluateFlagsToRaise(15, 30, [{ event_type: 'FULLSCREEN_EXIT' }], {
        recentFullscreenCount: 2
      });
      const fsFlag = flags.find((f) => f.flagType === 'REPEATED_FULLSCREEN_EXIT');
      assert.ok(fsFlag, 'Should raise REPEATED_FULLSCREEN_EXIT flag for 3rd exit');
      assert.equal(fsFlag.severity, 'HIGH');
    });

    it('should reset escalation sequence after the 5-minute window resets (recentFullscreenCount=0)', () => {
      // After window reset, exit is treated as 1st exit
      const resetExit = getEventWeight({ event_type: 'FULLSCREEN_EXIT' }, { recentFullscreenCount: 0 });
      assert.equal(resetExit.weight, 5);
    });
  });

  describe('TEST C: Forged Client Authority Rejection', () => {
    it('should strictly exclude REPEATED_CONTEXT_SWITCHING from CLIENT_ALLOWED_EVENT_TYPES', () => {
      assert.ok(!CLIENT_ALLOWED_EVENT_TYPES.includes('REPEATED_CONTEXT_SWITCHING'));
      assert.ok(CLIENT_ALLOWED_EVENT_TYPES.includes('BROWSER_FOCUS_LOST'));
      assert.ok(CLIENT_ALLOWED_EVENT_TYPES.includes('SCREEN_CONTEXT_CLASSIFICATION'));
    });

    it('should reject client payloads attempting to submit REPEATED_CONTEXT_SWITCHING', () => {
      const invalidEvent = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        eventType: 'REPEATED_CONTEXT_SWITCHING',
        clientTimestamp: new Date().toISOString()
      };
      const result = clientEventItemSchema.safeParse(invalidEvent);
      assert.equal(result.success, false);
      assert.match(result.error.errors[0].message, /Direct client submission of server-derived events.*prohibited/);
    });

    it('should reject client payloads attempting to submit riskScore, risk_score, or severity', () => {
      const payloadWithRiskScore = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        eventType: 'BROWSER_FOCUS_LOST',
        clientTimestamp: new Date().toISOString(),
        riskScore: 90
      };
      assert.equal(clientEventItemSchema.safeParse(payloadWithRiskScore).success, false);

      const payloadWithRiskScoreSnake = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        eventType: 'BROWSER_FOCUS_LOST',
        clientTimestamp: new Date().toISOString(),
        risk_score: 90
      };
      assert.equal(clientEventItemSchema.safeParse(payloadWithRiskScoreSnake).success, false);

      const payloadWithSeverity = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        eventType: 'BROWSER_FOCUS_LOST',
        clientTimestamp: new Date().toISOString(),
        severity: 'CRITICAL'
      };
      assert.equal(clientEventItemSchema.safeParse(payloadWithSeverity).success, false);
    });
  });

  describe('TEST E: Normal Exam Activity False-Positive Protection', () => {
    it('should produce 0 risk increment for SCREEN_CONTEXT_CLASSIFICATION with EXAM_CONTEXT', () => {
      const normalExamEvent = {
        event_type: 'SCREEN_CONTEXT_CLASSIFICATION',
        metadata: {
          contextState: 'EXAM_CONTEXT',
          confidence: 0.95
        }
      };

      const result = getEventWeight(normalExamEvent);
      assert.equal(result.weight, 0);
      assert.equal(result.effectiveSeverity, 'LOW');

      const increment = calculateScoreIncrement([normalExamEvent]);
      assert.equal(increment, 0);

      const newScore = calculateNewRiskScore(10, [normalExamEvent]);
      assert.equal(newScore, 10, 'Score should remain unchanged during normal exam activity');
    });

    it('should produce 0 risk increment for debounced focus loss under 1000ms', () => {
      const transientFocusLoss = {
        event_type: 'BROWSER_FOCUS_LOST',
        metadata: {
          durationMs: 450 // transient notification under 1000ms
        }
      };

      const result = getEventWeight(transientFocusLoss);
      assert.equal(result.weight, 0);

      const increment = calculateScoreIncrement([transientFocusLoss]);
      assert.equal(increment, 0);
    });
  });

  describe('TEST F: UNKNOWN_CONTEXT and NON_EXAM_CONTEXT Handling', () => {
    it('should treat UNKNOWN_CONTEXT as low-confidence advisory (+2), never an automatic violation', () => {
      const unknownEvent = {
        event_type: 'SCREEN_CONTEXT_CLASSIFICATION',
        metadata: {
          contextState: 'UNKNOWN_CONTEXT',
          confidence: 0.45
        }
      };

      const result = getEventWeight(unknownEvent);
      assert.equal(result.weight, 2);
      assert.equal(result.effectiveSeverity, 'LOW');

      // Assert it does NOT raise any flag alone
      const flags = evaluateFlagsToRaise(0, 2, [unknownEvent]);
      assert.equal(flags.length, 0);
    });

    it('should treat NON_EXAM_CONTEXT as high-severity contextual anomaly (+15)', () => {
      const nonExamEvent = {
        event_type: 'SCREEN_CONTEXT_CLASSIFICATION',
        metadata: {
          contextState: 'NON_EXAM_CONTEXT',
          confidence: 0.92
        }
      };

      const result = getEventWeight(nonExamEvent);
      assert.equal(result.weight, 15);
      assert.equal(result.effectiveSeverity, 'HIGH');

      const increment = calculateScoreIncrement([nonExamEvent]);
      assert.equal(increment, 15);
    });
  });
});
