/**
 * @file anomalyScoring.test.js
 * @description Unit tests for deterministic anomaly risk scoring, severity weights,
 * clamping, duplicate behavior, and threshold flag triggers.
 * Conforms strictly to Phase 14 specifications.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_TAXONOMY,
  SEVERITY_WEIGHTS,
  THRESHOLD_RULES,
  calculateScoreIncrement,
  calculateNewRiskScore,
  evaluateFlagsToRaise
} from '../../src/modules/proctoring/anomalyScorer.js';

describe('Deterministic Anomaly Scoring (Unit Tests)', () => {
  it('should verify exact severity weights: LOW=1, MEDIUM=5, HIGH=15, CRITICAL=40', () => {
    assert.equal(SEVERITY_WEIGHTS.LOW, 1);
    assert.equal(SEVERITY_WEIGHTS.MEDIUM, 5);
    assert.equal(SEVERITY_WEIGHTS.HIGH, 15);
    assert.equal(SEVERITY_WEIGHTS.CRITICAL, 40);

    assert.equal(EVENT_TAXONOMY.PERIODIC_HEARTBEAT.weight, 1);
    assert.equal(EVENT_TAXONOMY.WINDOW_FOCUS.weight, 1);
    assert.equal(EVENT_TAXONOMY.TAB_VISIBLE.weight, 1);
    assert.equal(EVENT_TAXONOMY.FULLSCREEN_ENTER.weight, 1);

    assert.equal(EVENT_TAXONOMY.WINDOW_BLUR.weight, 5);
    assert.equal(EVENT_TAXONOMY.TAB_HIDDEN.weight, 5);
    assert.equal(EVENT_TAXONOMY.FULLSCREEN_EXIT.weight, 5);

    assert.equal(EVENT_TAXONOMY.COPY_PASTE_ATTEMPT.weight, 15);
    assert.equal(EVENT_TAXONOMY.RESTRICTED_KEY_COMBO.weight, 15);
    assert.equal(EVENT_TAXONOMY.DISPLAY_CONFIG_CHANGED.weight, 15);

    assert.equal(EVENT_TAXONOMY.DEVTOOLS_OPEN.weight, 40);
  });

  it('should calculate initial score starting at 0', () => {
    const score = calculateNewRiskScore(0, []);
    assert.equal(score, 0);
  });

  it('should accumulate score linearly for individual events', () => {
    const lowEvent = [{ event_type: 'TAB_VISIBLE' }];
    assert.equal(calculateNewRiskScore(0, lowEvent), 1);

    const mediumEvent = [{ event_type: 'WINDOW_BLUR' }];
    assert.equal(calculateNewRiskScore(0, mediumEvent), 5);

    const highEvent = [{ event_type: 'COPY_PASTE_ATTEMPT' }];
    assert.equal(calculateNewRiskScore(0, highEvent), 15);

    const criticalEvent = [{ event_type: 'DEVTOOLS_OPEN' }];
    assert.equal(calculateNewRiskScore(0, criticalEvent), 40);
  });

  it('should calculate cumulative sum across multiple diverse events: 1+5+15+40 = 61', () => {
    const mixedEvents = [
      { event_type: 'TAB_VISIBLE' },       // +1
      { event_type: 'WINDOW_BLUR' },       // +5
      { event_type: 'COPY_PASTE_ATTEMPT' },// +15
      { event_type: 'DEVTOOLS_OPEN' }      // +40
    ];
    assert.equal(calculateScoreIncrement(mixedEvents), 61);
    assert.equal(calculateNewRiskScore(0, mixedEvents), 61);
    assert.equal(calculateNewRiskScore(10, mixedEvents), 71);
  });

  it('should strictly clamp risk score at 100 on overflow', () => {
    const heavyEvents = [
      { event_type: 'DEVTOOLS_OPEN' }, // 40
      { event_type: 'DEVTOOLS_OPEN' }, // 40
      { event_type: 'DEVTOOLS_OPEN' }  // 40 => sum = 120
    ];
    assert.equal(calculateScoreIncrement(heavyEvents), 120);
    const clampedScore = calculateNewRiskScore(0, heavyEvents);
    assert.equal(clampedScore, 100);

    const overflowFromExisting = calculateNewRiskScore(95, [{ event_type: 'COPY_PASTE_ATTEMPT' }]); // 95 + 15 = 110
    assert.equal(overflowFromExisting, 100);
  });

  it('should contribute 0 score increment for duplicate or empty event batches', () => {
    assert.equal(calculateScoreIncrement([]), 0);
    assert.equal(calculateNewRiskScore(45, []), 45);
  });

  it('should evaluate threshold crossings accurately', () => {
    // Current 45, new 55 -> crosses 50
    const flags50 = evaluateFlagsToRaise(45, 55, [{ event_type: 'WINDOW_BLUR' }, { event_type: 'WINDOW_BLUR' }]);
    assert.equal(flags50.length, 1);
    assert.equal(flags50[0].flagType, 'ELEVATED_RISK');
    assert.equal(flags50[0].severity, 'MEDIUM');
    assert.equal(flags50[0].raisedBy, 'SYSTEM');

    // Current 55, new 65 -> already >= 50, does NOT re-raise ELEVATED_RISK
    const flags50Again = evaluateFlagsToRaise(55, 65, [{ event_type: 'WINDOW_BLUR' }, { event_type: 'WINDOW_BLUR' }]);
    assert.equal(flags50Again.length, 0);

    // Current 75, new 85 -> crosses 80
    const flags80 = evaluateFlagsToRaise(75, 85, [{ event_type: 'COPY_PASTE_ATTEMPT' }]);
    assert.equal(flags80.length, 1);
    assert.equal(flags80[0].flagType, 'HIGH_RISK');
    assert.equal(flags80[0].severity, 'HIGH');
    assert.equal(flags80[0].raisedBy, 'SYSTEM');

    // Leap across both thresholds: 40 -> 85
    const flagsBoth = evaluateFlagsToRaise(40, 85, [{ event_type: 'DEVTOOLS_OPEN' }, { event_type: 'COPY_PASTE_ATTEMPT' }]);
    assert.equal(flagsBoth.length, 3);
    assert.ok(flagsBoth.some((f) => f.flagType === 'DEVTOOLS_DETECTED'));
    assert.ok(flagsBoth.some((f) => f.flagType === 'ELEVATED_RISK'));
    assert.ok(flagsBoth.some((f) => f.flagType === 'HIGH_RISK'));
  });


  it('should immediately raise flags for DEVTOOLS_OPEN and DISPLAY_CONFIG_CHANGED regardless of score', () => {
    const devtoolsFlags = evaluateFlagsToRaise(0, 40, [{ event_type: 'DEVTOOLS_OPEN' }]);
    assert.ok(devtoolsFlags.some((f) => f.flagType === 'DEVTOOLS_DETECTED' && f.severity === 'CRITICAL'));

    const displayFlags = evaluateFlagsToRaise(0, 15, [{ event_type: 'DISPLAY_CONFIG_CHANGED' }]);
    assert.ok(displayFlags.some((f) => f.flagType === 'MULTI_DISPLAY_DETECTED' && f.severity === 'HIGH'));
  });
});
