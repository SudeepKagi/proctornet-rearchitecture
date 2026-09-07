/**
 * @file resultsVisibility.js
 * @description Pure domain functions for evaluating result visibility and derived fields.
 * Conforms to Step 13.5 and Phase 9 Architecture specifications.
 * Note: PostgreSQL visibility predicate is the authoritative runtime enforcement.
 * This module is the pure domain reference model used for unit testing, documentation,
 * and business-rule consistency.
 */

import { ExamStatus } from '../exam/examStates.js';
import { ResultsReleasePolicy } from './resultsReleasePolicy.js';

const POST_EXAM_STATUSES = Object.freeze([
  ExamStatus.ENDED,
  ExamStatus.EVALUATED,
  ExamStatus.RESULT_PUBLISHED
]);

/**
 * Determines whether an evaluated result is visible to a candidate.
 * 
 * Rules:
 * 1. An explicit administrative publication (RESULT_PUBLISHED) makes results visible immediately.
 * 2. An IMMEDIATE release policy makes results visible ONLY once the exam has concluded
 *    (status is ENDED, EVALUATED, or RESULT_PUBLISHED). While the exam is LIVE, early submissions
 *    are shielded to prevent answer/score leakage.
 * 3. A SCHEDULED release policy makes results visible once the exam has concluded AND the
 *    scheduled release time (releaseAt) has arrived (now >= releaseAt).
 * 4. A MANUAL release policy requires explicit administrative publication (RESULT_PUBLISHED).
 *
 * @param {Object} params
 * @param {string} params.examStatus
 * @param {string} params.releasePolicy
 * @param {Date|string|null} [params.releaseAt]
 * @param {Date|string|null} [params.publishedAt]
 * @param {Date} [params.now]
 * @returns {boolean}
 */
export function isResultCandidateVisible({
  examStatus,
  releasePolicy,
  releaseAt = null,
  publishedAt = null,
  now = new Date()
}) {
  // 1. Explicit publication state always grants visibility
  if (examStatus === ExamStatus.RESULT_PUBLISHED || publishedAt !== null) {
    return true;
  }

  // All non-manual automatic visibility policies require the exam to have ended
  if (!POST_EXAM_STATUSES.includes(examStatus)) {
    return false;
  }

  // 2. IMMEDIATE policy: visible once exam has ended
  if (releasePolicy === ResultsReleasePolicy.IMMEDIATE) {
    return true;
  }

  // 3. SCHEDULED policy: visible once exam has ended AND release time has arrived
  if (releasePolicy === ResultsReleasePolicy.SCHEDULED) {
    if (!releaseAt) {
      return false;
    }
    const releaseTime = new Date(releaseAt).getTime();
    const currentTime = new Date(now).getTime();
    return currentTime >= releaseTime;
  }

  // 4. MANUAL policy: requires explicit RESULT_PUBLISHED (already checked in #1)
  return false;
}

/**
 * Calculates derived result fields (passed, percentage) deterministically.
 *
 * @param {Object} params
 * @param {number|string} params.score
 * @param {number|string} params.totalMarks
 * @param {number|string} params.passingMarks
 * @returns {{ passed: boolean, percentage: number }}
 */
export function calculateDerivedFields({ score, totalMarks, passingMarks }) {
  const numericScore = Number(score);
  const numericTotal = Number(totalMarks);
  const numericPassing = Number(passingMarks);

  const passed = numericScore >= numericPassing;
  const percentage = numericTotal > 0
    ? Number(((numericScore / numericTotal) * 100).toFixed(2))
    : 0.0;

  return { passed, percentage };
}
