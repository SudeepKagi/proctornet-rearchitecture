/**
 * @file examStates.js
 * @description Authoritative Exam lifecycle states and allowed forward transition definitions.
 * Conforms to Step 13.5 Finalized Architecture specification.
 */

/**
 * Authoritative Exam Status Enum.
 * @readonly
 * @enum {string}
 */
export const ExamStatus = Object.freeze({
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  SCHEDULED: 'SCHEDULED',
  LIVE: 'LIVE',
  ENDED: 'ENDED',
  EVALUATED: 'EVALUATED',
  RESULT_PUBLISHED: 'RESULT_PUBLISHED'
});

/**
 * All valid Exam status values as an array.
 * @type {readonly string[]}
 */
export const ALL_EXAM_STATUSES = Object.freeze(Object.values(ExamStatus));

/**
 * Deterministic forward transition matrix for Exam lifecycle.
 * Invariant: Linear forward lifecycle only; backward transitions and step skipping are strictly invalid.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const EXAM_TRANSITIONS = Object.freeze({
  [ExamStatus.DRAFT]: Object.freeze([ExamStatus.PUBLISHED]),
  [ExamStatus.PUBLISHED]: Object.freeze([ExamStatus.SCHEDULED]),
  [ExamStatus.SCHEDULED]: Object.freeze([ExamStatus.LIVE]),
  [ExamStatus.LIVE]: Object.freeze([ExamStatus.ENDED]),
  [ExamStatus.ENDED]: Object.freeze([ExamStatus.EVALUATED]),
  [ExamStatus.EVALUATED]: Object.freeze([ExamStatus.RESULT_PUBLISHED]),
  [ExamStatus.RESULT_PUBLISHED]: Object.freeze([])
});

/**
 * Checks if a given string is a recognized ExamStatus.
 * @param {string} status
 * @returns {boolean}
 */
export function isValidExamStatus(status) {
  return ALL_EXAM_STATUSES.includes(status);
}

/**
 * Checks if an exam status is terminal (no further transitions possible).
 * @param {string} status
 * @returns {boolean}
 */
export function isExamTerminal(status) {
  return status === ExamStatus.RESULT_PUBLISHED;
}
