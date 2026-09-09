/**
 * @file studentConfigInvariants.js
 * @description Pure domain invariants for per-student configuration and exam accommodations.
 * Validates time multiplier bounds, break limits, and proctoring strictness rules.
 */

import { ProctoringStrictness } from './studentDocumentStates.js';
import { BadRequestError } from '../../utils/errors.js';

export const MIN_EXTRA_TIME_MULTIPLIER = 1.00;
export const MAX_EXTRA_TIME_MULTIPLIER = 3.00;
export const MAX_BREAK_MINUTES = 120;
export const MAX_BREAK_COUNT = 10;

/**
 * Asserts that the extra time multiplier is within valid accommodation bounds (1.00x to 3.00x).
 * @param {number} multiplier
 */
export function assertValidTimeMultiplier(multiplier) {
  const num = Number(multiplier);
  if (isNaN(num) || num < MIN_EXTRA_TIME_MULTIPLIER || num > MAX_EXTRA_TIME_MULTIPLIER) {
    throw new BadRequestError(
      `Extra time multiplier must be between ${MIN_EXTRA_TIME_MULTIPLIER.toFixed(2)} and ${MAX_EXTRA_TIME_MULTIPLIER.toFixed(2)}`,
      'INVALID_TIME_MULTIPLIER'
    );
  }
}

/**
 * Asserts that break allowances are valid non-negative numbers within policy limits.
 * @param {number} minutes
 * @param {number} maxBreaks
 */
export function assertValidBreakAllowance(minutes, maxBreaks) {
  const mins = Number(minutes);
  const count = Number(maxBreaks);

  if (isNaN(mins) || mins < 0 || mins > MAX_BREAK_MINUTES) {
    throw new BadRequestError(
      `Break allowance minutes must be between 0 and ${MAX_BREAK_MINUTES}`,
      'INVALID_BREAK_MINUTES'
    );
  }

  if (isNaN(count) || count < 0 || count > MAX_BREAK_COUNT) {
    throw new BadRequestError(
      `Max breaks allowed must be between 0 and ${MAX_BREAK_COUNT}`,
      'INVALID_BREAK_COUNT'
    );
  }
}

/**
 * Asserts that the proctoring strictness value is an authoritative enum.
 * @param {string} strictness
 */
export function assertValidProctoringStrictness(strictness) {
  if (!Object.values(ProctoringStrictness).includes(strictness)) {
    throw new BadRequestError(
      `Invalid proctoring strictness '${strictness}'. Allowed: ${Object.values(ProctoringStrictness).join(', ')}`,
      'INVALID_PROCTORING_STRICTNESS'
    );
  }
}

/**
 * Asserts that assistive technology payload conforms to expected boolean flag schema.
 * @param {object} tech
 */
export function assertValidAssistiveTechnology(tech) {
  if (tech !== undefined && tech !== null && typeof tech !== 'object') {
    throw new BadRequestError(
      'Assistive technology must be a JSON object of accommodation flags',
      'INVALID_ASSISTIVE_TECH'
    );
  }
}
