import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ExamStatus,
  ResultsReleasePolicy,
  ALL_RESULTS_RELEASE_POLICIES,
  isResultCandidateVisible,
  calculateDerivedFields
} from '../../src/domain/index.js';

describe('Results Domain & Visibility Unit Tests', () => {
  describe('ResultsReleasePolicy Enum', () => {
    it('should define exactly the 3 release policies', () => {
      assert.deepEqual(ALL_RESULTS_RELEASE_POLICIES, [
        'IMMEDIATE',
        'SCHEDULED',
        'MANUAL'
      ]);
      assert.equal(ResultsReleasePolicy.IMMEDIATE, 'IMMEDIATE');
      assert.equal(ResultsReleasePolicy.SCHEDULED, 'SCHEDULED');
      assert.equal(ResultsReleasePolicy.MANUAL, 'MANUAL');
    });
  });

  describe('isResultCandidateVisible (Domain Reference Logic)', () => {
    const fixedNow = new Date('2026-09-07T12:00:00.000Z');
    const pastTime = new Date('2026-09-07T11:00:00.000Z');
    const futureTime = new Date('2026-09-07T13:00:00.000Z');

    it('CORRECTION 1: should DENY visibility for LIVE exam with IMMEDIATE policy', () => {
      const visible = isResultCandidateVisible({
        examStatus: ExamStatus.LIVE,
        releasePolicy: ResultsReleasePolicy.IMMEDIATE,
        now: fixedNow
      });
      assert.equal(visible, false, 'Candidate must not see result while exam is still LIVE');
    });

    it('CORRECTION 1: should ALLOW visibility for ENDED exam with IMMEDIATE policy', () => {
      const visible = isResultCandidateVisible({
        examStatus: ExamStatus.ENDED,
        releasePolicy: ResultsReleasePolicy.IMMEDIATE,
        now: fixedNow
      });
      assert.equal(visible, true, 'Candidate may see result once exam status is ENDED');
    });

    it('should ALLOW visibility for EVALUATED exam with IMMEDIATE policy', () => {
      const visible = isResultCandidateVisible({
        examStatus: ExamStatus.EVALUATED,
        releasePolicy: ResultsReleasePolicy.IMMEDIATE,
        now: fixedNow
      });
      assert.equal(visible, true);
    });

    it('should ALWAYS ALLOW visibility when exam status is RESULT_PUBLISHED', () => {
      for (const policy of ALL_RESULTS_RELEASE_POLICIES) {
        const visible = isResultCandidateVisible({
          examStatus: ExamStatus.RESULT_PUBLISHED,
          releasePolicy: policy,
          now: fixedNow
        });
        assert.equal(visible, true, `Expected visible for policy ${policy} when RESULT_PUBLISHED`);
      }
    });

    it('should ALWAYS ALLOW visibility when publishedAt is non-null', () => {
      const visible = isResultCandidateVisible({
        examStatus: ExamStatus.EVALUATED,
        releasePolicy: ResultsReleasePolicy.MANUAL,
        publishedAt: pastTime,
        now: fixedNow
      });
      assert.equal(visible, true);
    });

    it('SCHEDULED policy: should DENY before release time has arrived', () => {
      const visible = isResultCandidateVisible({
        examStatus: ExamStatus.ENDED,
        releasePolicy: ResultsReleasePolicy.SCHEDULED,
        releaseAt: futureTime,
        now: fixedNow
      });
      assert.equal(visible, false, 'Should be denied before scheduled release time');
    });

    it('SCHEDULED policy: should ALLOW exactly at release time boundary', () => {
      const visible = isResultCandidateVisible({
        examStatus: ExamStatus.ENDED,
        releasePolicy: ResultsReleasePolicy.SCHEDULED,
        releaseAt: fixedNow,
        now: fixedNow
      });
      assert.equal(visible, true, 'Should be allowed exactly at release boundary');
    });

    it('SCHEDULED policy: should ALLOW after release time has passed', () => {
      const visible = isResultCandidateVisible({
        examStatus: ExamStatus.ENDED,
        releasePolicy: ResultsReleasePolicy.SCHEDULED,
        releaseAt: pastTime,
        now: fixedNow
      });
      assert.equal(visible, true, 'Should be allowed after scheduled release time');
    });

    it('SCHEDULED policy: should DENY if exam is still LIVE even if release time passed', () => {
      const visible = isResultCandidateVisible({
        examStatus: ExamStatus.LIVE,
        releasePolicy: ResultsReleasePolicy.SCHEDULED,
        releaseAt: pastTime,
        now: fixedNow
      });
      assert.equal(visible, false, 'Should be denied while exam is LIVE');
    });

    it('MANUAL policy: should DENY when not explicitly published', () => {
      const visible = isResultCandidateVisible({
        examStatus: ExamStatus.EVALUATED,
        releasePolicy: ResultsReleasePolicy.MANUAL,
        publishedAt: null,
        now: fixedNow
      });
      assert.equal(visible, false, 'MANUAL policy must remain hidden until RESULT_PUBLISHED');
    });
  });

  describe('calculateDerivedFields', () => {
    it('should calculate passing status and rounded percentage correctly', () => {
      const result = calculateDerivedFields({
        score: 75.5,
        totalMarks: 100,
        passingMarks: 40
      });
      assert.equal(result.passed, true);
      assert.equal(result.percentage, 75.5);
    });

    it('should determine failing status when score is below passing marks', () => {
      const result = calculateDerivedFields({
        score: 39.5,
        totalMarks: 100,
        passingMarks: 40
      });
      assert.equal(result.passed, false);
      assert.equal(result.percentage, 39.5);
    });

    it('should determine passing when score exactly equals passing marks', () => {
      const result = calculateDerivedFields({
        score: 40,
        totalMarks: 100,
        passingMarks: 40
      });
      assert.equal(result.passed, true);
      assert.equal(result.percentage, 40.0);
    });

    it('should round percentage to 2 decimal places properly', () => {
      const result = calculateDerivedFields({
        score: 22,
        totalMarks: 30,
        passingMarks: 12
      });
      // 22 / 30 = 0.7333333333333334 => 73.33%
      assert.equal(result.percentage, 73.33);
      assert.equal(result.passed, true);
    });

    it('should handle zero totalMarks edge case safely without NaN', () => {
      const result = calculateDerivedFields({
        score: 0,
        totalMarks: 0,
        passingMarks: 0
      });
      assert.equal(result.passed, true);
      assert.equal(result.percentage, 0.0);
    });
  });
});
