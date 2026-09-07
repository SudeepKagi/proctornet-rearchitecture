/**
 * @file resultsReleasePolicy.js
 * @description Domain definition for Exam Results Release Policies.
 * Conforms to Step 13.5 and Phase 9 Architecture specifications.
 */

/**
 * Authoritative Results Release Policy Enum.
 * @readonly
 * @enum {string}
 */
export const ResultsReleasePolicy = Object.freeze({
  IMMEDIATE: 'IMMEDIATE',
  SCHEDULED: 'SCHEDULED',
  MANUAL: 'MANUAL'
});

/**
 * All valid release policies as an array.
 * @type {readonly string[]}
 */
export const ALL_RESULTS_RELEASE_POLICIES = Object.freeze(Object.values(ResultsReleasePolicy));
