/**
 * @file anomalyScorer.js
 * @description Server-authoritative event taxonomy, severity weights, and deterministic anomaly risk scoring.
 * Strictly adheres to Phase 14 specifications.
 */

/**
 * Authoritative mapping of client telemetry events to server-determined severity,
 * score weight, and automatic flag triggers.
 */
export const EVENT_TAXONOMY = Object.freeze({
  PERIODIC_HEARTBEAT: Object.freeze({
    severity: 'LOW',
    weight: 1,
    flagTrigger: null,
    description: 'Periodic client keep-alive reporting state'
  }),
  WINDOW_FOCUS: Object.freeze({
    severity: 'LOW',
    weight: 1,
    flagTrigger: null,
    description: 'Examination window regained foreground focus'
  }),
  TAB_VISIBLE: Object.freeze({
    severity: 'LOW',
    weight: 1,
    flagTrigger: null,
    description: 'Examination browser tab returned to active foreground'
  }),
  FULLSCREEN_ENTER: Object.freeze({
    severity: 'LOW',
    weight: 1,
    flagTrigger: null,
    description: 'Candidate re-engaged fullscreen mode'
  }),
  WINDOW_BLUR: Object.freeze({
    severity: 'MEDIUM',
    weight: 5,
    flagTrigger: null,
    description: 'Candidate switched focus away from exam window'
  }),
  TAB_HIDDEN: Object.freeze({
    severity: 'MEDIUM',
    weight: 5,
    flagTrigger: null,
    description: 'Candidate navigated to another browser tab'
  }),
  FULLSCREEN_EXIT: Object.freeze({
    severity: 'MEDIUM',
    weight: 5,
    flagTrigger: null,
    description: 'Candidate exited enforced fullscreen mode'
  }),
  COPY_PASTE_ATTEMPT: Object.freeze({
    severity: 'HIGH',
    weight: 15,
    flagTrigger: null,
    description: 'Copy, cut, paste, or context menu shortcut triggered'
  }),
  RESTRICTED_KEY_COMBO: Object.freeze({
    severity: 'HIGH',
    weight: 15,
    flagTrigger: null,
    description: 'Blocked system shortcut pressed'
  }),
  DISPLAY_CONFIG_CHANGED: Object.freeze({
    severity: 'HIGH',
    weight: 15,
    flagTrigger: Object.freeze({
      flagType: 'MULTI_DISPLAY_DETECTED',
      severity: 'HIGH'
    }),
    description: 'Secondary display connected or display geometry altered'
  }),
  DEVTOOLS_OPEN: Object.freeze({
    severity: 'CRITICAL',
    weight: 40,
    flagTrigger: Object.freeze({
      flagType: 'DEVTOOLS_DETECTED',
      severity: 'CRITICAL'
    }),
    description: 'Browser Developer Tools opened'
  })
});

/**
 * Numerical weights associated with each severity tier.
 */
export const SEVERITY_WEIGHTS = Object.freeze({
  LOW: 1,
  MEDIUM: 5,
  HIGH: 15,
  CRITICAL: 40
});

/**
 * Deterministic threshold rules for automated risk flags.
 */
export const THRESHOLD_RULES = Object.freeze([
  Object.freeze({
    threshold: 50,
    flagType: 'ELEVATED_RISK',
    severity: 'MEDIUM'
  }),
  Object.freeze({
    threshold: 80,
    flagType: 'HIGH_RISK',
    severity: 'HIGH'
  })
]);

/**
 * Calculates the score increment for newly inserted, non-duplicate events.
 *
 * @param {Array<{ event_type: string, severity?: string }>} newlyInsertedEvents
 * @returns {number}
 */
export function calculateScoreIncrement(newlyInsertedEvents) {
  if (!Array.isArray(newlyInsertedEvents) || newlyInsertedEvents.length === 0) {
    return 0;
  }

  return newlyInsertedEvents.reduce((total, event) => {
    const taxonomy = EVENT_TAXONOMY[event.event_type];
    const weight = taxonomy ? taxonomy.weight : (SEVERITY_WEIGHTS[event.severity] || 0);
    return total + weight;
  }, 0);
}

/**
 * Calculates the new clamped cumulative risk score.
 * Starts at 0, strictly clamped to [0, 100].
 *
 * @param {number} currentScore
 * @param {Array<{ event_type: string, severity?: string }>} newlyInsertedEvents
 * @returns {number}
 */
export function calculateNewRiskScore(currentScore, newlyInsertedEvents) {
  const baseScore = typeof currentScore === 'number' && !isNaN(currentScore) ? currentScore : 0;
  const increment = calculateScoreIncrement(newlyInsertedEvents);
  return Math.min(100, Math.max(0, baseScore + increment));
}

/**
 * Evaluates whether automatic flags should be raised based on threshold crossings
 * and immediate event overrides.
 *
 * @param {number} currentScore
 * @param {number} newScore
 * @param {Array<{ event_type: string, severity?: string }>} newlyInsertedEvents
 * @returns {Array<{ flagType: string, severity: string, raisedBy: 'SYSTEM', scoreDelta: number, details: object }>}
 */
export function evaluateFlagsToRaise(currentScore, newScore, newlyInsertedEvents) {
  const flags = [];
  const eventTypes = new Set((newlyInsertedEvents || []).map((e) => e.event_type));

  // 1. Immediate event-type overrides
  if (eventTypes.has('DEVTOOLS_OPEN')) {
    flags.push({
      flagType: 'DEVTOOLS_DETECTED',
      severity: 'CRITICAL',
      raisedBy: 'SYSTEM',
      scoreDelta: 40,
      details: { reason: 'Browser Developer Tools opened during active attempt' }
    });
  }

  if (eventTypes.has('DISPLAY_CONFIG_CHANGED')) {
    flags.push({
      flagType: 'MULTI_DISPLAY_DETECTED',
      severity: 'HIGH',
      raisedBy: 'SYSTEM',
      scoreDelta: 15,
      details: { reason: 'Secondary monitor attached or resolution geometry changed' }
    });
  }

  // 2. Deterministic threshold crossing rules
  for (const rule of THRESHOLD_RULES) {
    if (currentScore < rule.threshold && newScore >= rule.threshold) {
      flags.push({
        flagType: rule.flagType,
        severity: rule.severity,
        raisedBy: 'SYSTEM',
        scoreDelta: 0,
        details: {
          reason: `Attempt risk score crossed threshold ${rule.threshold}`,
          scoreBefore: currentScore,
          scoreAfter: newScore
        }
      });
    }
  }

  return flags;
}
