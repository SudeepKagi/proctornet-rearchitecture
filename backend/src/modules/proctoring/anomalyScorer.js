/**
 * @file anomalyScorer.js
 * @description Server-authoritative event taxonomy, severity weights, deterministic anomaly risk scoring,
 * technical risk contribution ceiling, 5-minute fullscreen escalation, and server-side context correlation.
 * Strictly adheres to Phase 28 specifications and review conditions.
 */

/**
 * Maximum cumulative score contribution permitted for technical/transport degradation events.
 * Prevents network or screen-capture issues alone from elevating a candidate to behavioral ELEVATED_RISK or HIGH_RISK.
 */
export const TECHNICAL_RISK_CONTRIBUTION_CAP = 15;

/**
 * Active sliding-window duration for fullscreen exit escalation (5 minutes in milliseconds).
 */
export const FULLSCREEN_ESCALATION_WINDOW_MS = 5 * 60 * 1000;

/**
 * Minimum duration (ms) for a window blur / focus loss event to be scored.
 * Durations below this threshold are treated as transient OS-level notification debounces.
 */
export const FOCUS_LOSS_DEBOUNCE_THRESHOLD_MS = 1000;

/**
 * Authoritative mapping of proctoring events to server-determined severity,
 * score weight, category, and flag triggers.
 */
export const EVENT_TAXONOMY = Object.freeze({
  // ==========================================
  // STAGE 1: DETERMINISTIC TELEMETRY (Zero ML)
  // ==========================================
  BROWSER_FOCUS_LOST: Object.freeze({
    severity: 'MEDIUM',
    weight: 5,
    category: 'BEHAVIORAL',
    source: 'BROWSER',
    flagTrigger: null,
    description: 'Candidate switched input focus away from examination window'
  }),
  EXAM_VISIBILITY_LOST: Object.freeze({
    severity: 'MEDIUM',
    weight: 5,
    category: 'BEHAVIORAL',
    source: 'BROWSER',
    flagTrigger: null,
    description: 'Examination browser tab became hidden, minimized, or obscured'
  }),
  FULLSCREEN_EXIT: Object.freeze({
    severity: 'MEDIUM',
    weight: 5,
    category: 'BEHAVIORAL',
    source: 'BROWSER',
    flagTrigger: null,
    description: 'Candidate disengaged enforced fullscreen mode'
  }),
  SCREEN_CAPTURE_INTERRUPTED: Object.freeze({
    severity: 'HIGH',
    weight: 10,
    category: 'TECHNICAL',
    source: 'TECHNICAL',
    flagTrigger: Object.freeze({
      flagType: 'SCREEN_CAPTURE_INTERRUPTED',
      severity: 'HIGH'
    }),
    description: 'Screen capture stream was revoked or interrupted'
  }),
  SCREEN_STREAM_DEGRADED: Object.freeze({
    severity: 'LOW',
    weight: 2,
    category: 'TECHNICAL',
    source: 'TECHNICAL',
    flagTrigger: null,
    description: 'Screen media stream experienced transport or frame degradation'
  }),

  // ==========================================
  // STAGE 2: ADVISORY SCREEN AI (Web Worker)
  // ==========================================
  SCREEN_CONTEXT_CLASSIFICATION: Object.freeze({
    severity: 'LOW',
    weight: 0, // Dynamic weight based on metadata.contextState
    category: 'SCREEN_AI',
    source: 'SCREEN_AI',
    flagTrigger: null,
    description: 'Advisory client-side screen content context classification'
  }),

  // ==========================================
  // STAGE 3: SERVER CORRELATION (Backend Only)
  // ==========================================
  REPEATED_CONTEXT_SWITCHING: Object.freeze({
    severity: 'HIGH',
    weight: 20,
    category: 'BEHAVIORAL',
    source: 'BROWSER',
    flagTrigger: Object.freeze({
      flagType: 'REPEATED_CONTEXT_SWITCHING',
      severity: 'HIGH'
    }),
    description: 'Server-derived anomaly: Repeated rapid context switching or focus loss coinciding with non-exam context'
  }),

  // ==========================================
  // LEGACY EVENTS (Backward Compatibility)
  // ==========================================
  PERIODIC_HEARTBEAT: Object.freeze({
    severity: 'LOW',
    weight: 1,
    category: 'BEHAVIORAL',
    source: 'BROWSER',
    flagTrigger: null,
    description: 'Periodic client keep-alive reporting state'
  }),
  WINDOW_FOCUS: Object.freeze({
    severity: 'LOW',
    weight: 1,
    category: 'BEHAVIORAL',
    source: 'BROWSER',
    flagTrigger: null,
    description: 'Examination window regained foreground focus'
  }),
  TAB_VISIBLE: Object.freeze({
    severity: 'LOW',
    weight: 1,
    category: 'BEHAVIORAL',
    source: 'BROWSER',
    flagTrigger: null,
    description: 'Examination browser tab returned to active foreground'
  }),
  FULLSCREEN_ENTER: Object.freeze({
    severity: 'LOW',
    weight: 1,
    category: 'BEHAVIORAL',
    source: 'BROWSER',
    flagTrigger: null,
    description: 'Candidate re-engaged fullscreen mode'
  }),
  WINDOW_BLUR: Object.freeze({
    severity: 'MEDIUM',
    weight: 5,
    category: 'BEHAVIORAL',
    source: 'BROWSER',
    flagTrigger: null,
    description: 'Candidate switched focus away from exam window'
  }),
  TAB_HIDDEN: Object.freeze({
    severity: 'MEDIUM',
    weight: 5,
    category: 'BEHAVIORAL',
    source: 'BROWSER',
    flagTrigger: null,
    description: 'Candidate navigated to another browser tab'
  }),
  COPY_PASTE_ATTEMPT: Object.freeze({
    severity: 'HIGH',
    weight: 15,
    category: 'BEHAVIORAL',
    source: 'BROWSER',
    flagTrigger: null,
    description: 'Copy, cut, paste, or context menu shortcut triggered'
  }),
  RESTRICTED_KEY_COMBO: Object.freeze({
    severity: 'HIGH',
    weight: 15,
    category: 'BEHAVIORAL',
    source: 'BROWSER',
    flagTrigger: null,
    description: 'Blocked system shortcut pressed'
  }),
  DISPLAY_CONFIG_CHANGED: Object.freeze({
    severity: 'HIGH',
    weight: 15,
    category: 'BEHAVIORAL',
    source: 'BROWSER',
    flagTrigger: Object.freeze({
      flagType: 'MULTI_DISPLAY_DETECTED',
      severity: 'HIGH'
    }),
    description: 'Secondary display connected or display geometry altered'
  }),
  DEVTOOLS_OPEN: Object.freeze({
    severity: 'CRITICAL',
    weight: 40,
    category: 'BEHAVIORAL',
    source: 'BROWSER',
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
 * Determines the individual score weight and effective category for a single event.
 * Handles debouncing, 3-state screen classification, and fullscreen escalation.
 *
 * @param {object} event
 * @param {object} [context={}]
 * @param {number} [context.recentFullscreenCount=0]
 * @returns {{ weight: number, isTechnical: boolean, effectiveSeverity: string }}
 */
export function getEventWeight(event, context = {}) {
  const eventType = event.event_type || event.eventType;
  const metadata = event.metadata || {};
  const taxonomy = EVENT_TAXONOMY[eventType];

  if (!taxonomy) {
    const fallbackWeight = SEVERITY_WEIGHTS[event.severity] || 0;
    return { weight: fallbackWeight, isTechnical: false, effectiveSeverity: event.severity || 'LOW' };
  }

  const isTechnical = taxonomy.category === 'TECHNICAL';

  // 1. Debouncing for focus loss / window blur
  if (eventType === 'BROWSER_FOCUS_LOST' || eventType === 'WINDOW_BLUR') {
    if (typeof metadata.durationMs === 'number' && metadata.durationMs < FOCUS_LOSS_DEBOUNCE_THRESHOLD_MS) {
      // Debounce: transient focus loss under 1000ms does not contribute risk points
      return { weight: 0, isTechnical: false, effectiveSeverity: 'LOW' };
    }
    return { weight: taxonomy.weight, isTechnical: false, effectiveSeverity: taxonomy.severity };
  }

  // 2. Fullscreen Escalation (5-minute sliding window)
  if (eventType === 'FULLSCREEN_EXIT') {
    const exitIndex = (context.recentFullscreenCount || 0) + 1;
    if (exitIndex === 1) {
      return { weight: 5, isTechnical: false, effectiveSeverity: 'MEDIUM' };
    }
    if (exitIndex === 2) {
      return { weight: 10, isTechnical: false, effectiveSeverity: 'MEDIUM' };
    }
    // 3+ exits in active window
    return { weight: 15, isTechnical: false, effectiveSeverity: 'HIGH' };
  }

  // 3. Screen Context Classification (3-State Model)
  if (eventType === 'SCREEN_CONTEXT_CLASSIFICATION') {
    const contextState = metadata.contextState;
    if (contextState === 'EXAM_CONTEXT') {
      // Normal exam activity (nav, timers, typing, scroll): zero risk contribution
      return { weight: 0, isTechnical: false, effectiveSeverity: 'LOW' };
    }
    if (contextState === 'NON_EXAM_CONTEXT') {
      // Confirmed foreign window / application: high risk contribution
      return { weight: 15, isTechnical: false, effectiveSeverity: 'HIGH' };
    }
    if (contextState === 'UNKNOWN_CONTEXT') {
      // Low confidence observation: minimal advisory delta, never a violation alone
      return { weight: 2, isTechnical: false, effectiveSeverity: 'LOW' };
    }
    return { weight: 0, isTechnical: false, effectiveSeverity: 'LOW' };
  }

  return { weight: taxonomy.weight, isTechnical, effectiveSeverity: taxonomy.severity };
}

/**
 * Calculates the score increment for newly inserted events, enforcing the technical score ceiling.
 *
 * @param {Array<object>} newlyInsertedEvents
 * @param {object} [options={}]
 * @param {number} [options.currentTechnicalPoints=0] - Points already contributed by technical events
 * @param {number} [options.recentFullscreenCount=0] - Fullscreen exits in active 5-minute window
 * @returns {number}
 */
export function calculateScoreIncrement(newlyInsertedEvents, options = {}) {
  if (!Array.isArray(newlyInsertedEvents) || newlyInsertedEvents.length === 0) {
    return 0;
  }

  let technicalPointsAccrued = options.currentTechnicalPoints || 0;
  let runningFullscreenCount = options.recentFullscreenCount || 0;
  let totalIncrement = 0;

  for (const event of newlyInsertedEvents) {
    const { weight, isTechnical } = getEventWeight(event, {
      recentFullscreenCount: runningFullscreenCount
    });

    const eventType = event.event_type || event.eventType;
    if (eventType === 'FULLSCREEN_EXIT') {
      runningFullscreenCount++;
    }

    if (isTechnical) {
      const allowedTechnicalAddition = Math.max(0, TECHNICAL_RISK_CONTRIBUTION_CAP - technicalPointsAccrued);
      const effectiveTechnicalWeight = Math.min(weight, allowedTechnicalAddition);
      technicalPointsAccrued += effectiveTechnicalWeight;
      totalIncrement += effectiveTechnicalWeight;
    } else {
      totalIncrement += weight;
    }
  }

  return totalIncrement;
}

/**
 * Calculates the new clamped cumulative risk score [0, 100].
 *
 * @param {number} currentScore
 * @param {Array<object>} newlyInsertedEvents
 * @param {object} [options={}]
 * @returns {number}
 */
export function calculateNewRiskScore(currentScore, newlyInsertedEvents, options = {}) {
  const baseScore = typeof currentScore === 'number' && !isNaN(currentScore) ? currentScore : 0;
  const increment = calculateScoreIncrement(newlyInsertedEvents, options);
  const newScore = Math.min(100, Math.max(0, baseScore + increment));

  // If the attempt has ONLY technical events, enforce the technical risk ceiling on total score
  if (options.hasOnlyTechnicalEvents && newScore > TECHNICAL_RISK_CONTRIBUTION_CAP) {
    return TECHNICAL_RISK_CONTRIBUTION_CAP;
  }

  return newScore;
}

/**
 * Evaluates whether automatic flags should be raised based on threshold crossings
 * and immediate event overrides, strictly respecting the technical risk boundary.
 *
 * @param {number} currentScore
 * @param {number} newScore
 * @param {Array<object>} newlyInsertedEvents
 * @param {object} [options={}]
 * @param {boolean} [options.hasOnlyTechnicalEvents=false]
 * @param {number} [options.recentFullscreenCount=0]
 * @returns {Array<{ flagType: string, severity: string, raisedBy: 'SYSTEM', scoreDelta: number, details: object }>}
 */
export function evaluateFlagsToRaise(currentScore, newScore, newlyInsertedEvents, options = {}) {
  const flags = [];
  const events = Array.isArray(newlyInsertedEvents) ? newlyInsertedEvents : [];
  const eventTypes = new Set(events.map((e) => e.event_type || e.eventType));

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

  if (eventTypes.has('REPEATED_CONTEXT_SWITCHING')) {
    flags.push({
      flagType: 'SUSPICIOUS_CONTEXT_SWITCHING',
      severity: 'HIGH',
      raisedBy: 'SYSTEM',
      scoreDelta: 20,
      details: { reason: 'Server-derived: Rapid context switching or focus loss coinciding with non-exam application' }
    });
  }

  if (eventTypes.has('SCREEN_CAPTURE_INTERRUPTED')) {
    flags.push({
      flagType: 'SCREEN_CAPTURE_REVOKED',
      severity: 'HIGH',
      raisedBy: 'SYSTEM',
      scoreDelta: 10,
      details: {
        reason: 'Candidate revoked or lost screen capture permissions',
        category: 'TECHNICAL'
      }
    });
  }

  // Fullscreen escalation flag trigger: 3+ exits in active 5m window
  if (eventTypes.has('FULLSCREEN_EXIT')) {
    const totalFullscreenExitsInWindow = (options.recentFullscreenCount || 0) +
      events.filter((e) => (e.event_type || e.eventType) === 'FULLSCREEN_EXIT').length;
    if (totalFullscreenExitsInWindow >= 3) {
      flags.push({
        flagType: 'REPEATED_FULLSCREEN_EXIT',
        severity: 'HIGH',
        raisedBy: 'SYSTEM',
        scoreDelta: 15,
        details: {
          reason: `Candidate exited fullscreen ${totalFullscreenExitsInWindow} times within the 5-minute escalation window`,
          count: totalFullscreenExitsInWindow
        }
      });
    }
  }

  // 2. Deterministic threshold crossing rules
  // CONDITION 1 & 4: Technical failures alone must NOT trigger behavioral ELEVATED_RISK or HIGH_RISK
  if (!options.hasOnlyTechnicalEvents) {
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
  }

  return flags;
}
