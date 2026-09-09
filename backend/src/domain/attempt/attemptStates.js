/**
 * @file attemptStates.js
 * @description Authoritative Exam Attempt lifecycle states and forward transition rules.
 * Conforms to Step 13.5 Finalized Architecture specification.
 */

/**
 * Authoritative Attempt Status Enum.
 * @readonly
 * @enum {string}
 */
export const AttemptStatus = Object.freeze({
  READY: 'READY',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  SUBMITTED: 'SUBMITTED',
  TERMINATED: 'TERMINATED',
  EXPIRED: 'EXPIRED'
});

/**
 * All valid Attempt status values.
 * @type {readonly string[]}
 */
export const ALL_ATTEMPT_STATUSES = Object.freeze(Object.values(AttemptStatus));

/**
 * Terminal Attempt status values where no further state transitions are permitted.
 * @type {readonly string[]}
 */
export const TERMINAL_ATTEMPT_STATES = Object.freeze([
  AttemptStatus.SUBMITTED,
  AttemptStatus.TERMINATED,
  AttemptStatus.EXPIRED
]);

/**
 * Deterministic forward transition matrix for Exam Attempt lifecycle.
 * Invariants:
 * - READY can only transition to ACTIVE (student starts exam).
 * - ACTIVE can transition to PAUSED (invigilator pause), SUBMITTED (student finishes), TERMINATED (proctor/system), or EXPIRED (timer).
 * - PAUSED can transition to ACTIVE (resume), TERMINATED (proctor/system), or EXPIRED (timer cutoff).
 * - SUBMITTED, TERMINATED, and EXPIRED are terminal.
 * - No backward transitions are permitted.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const ATTEMPT_TRANSITIONS = Object.freeze({
  [AttemptStatus.READY]: Object.freeze([AttemptStatus.ACTIVE]),
  [AttemptStatus.ACTIVE]: Object.freeze([
    AttemptStatus.PAUSED,
    AttemptStatus.SUBMITTED,
    AttemptStatus.TERMINATED,
    AttemptStatus.EXPIRED
  ]),
  [AttemptStatus.PAUSED]: Object.freeze([
    AttemptStatus.ACTIVE,
    AttemptStatus.TERMINATED,
    AttemptStatus.EXPIRED
  ]),
  [AttemptStatus.SUBMITTED]: Object.freeze([]),
  [AttemptStatus.TERMINATED]: Object.freeze([]),
  [AttemptStatus.EXPIRED]: Object.freeze([])
});

/**
 * Checks if a given string is a recognized AttemptStatus.
 * @param {string} status
 * @returns {boolean}
 */
export function isValidAttemptStatus(status) {
  return ALL_ATTEMPT_STATUSES.includes(status);
}

/**
 * Checks if an attempt status is terminal (SUBMITTED, TERMINATED, or EXPIRED).
 * @param {string} status
 * @returns {boolean}
 */
export function isAttemptTerminal(status) {
  return TERMINAL_ATTEMPT_STATES.includes(status);
}
