import { describe, it, expect } from 'vitest';
import { ExamStatus } from '../../src/domain/exam/examStates.js';
import { ResultsReleasePolicy } from '../../src/domain/results/resultsReleasePolicy.js';
import {
  isResultCandidateVisible,
  calculateDerivedFields
} from '../../src/domain/results/resultsVisibility.js';

describe('Results Release Policy & Candidate Visibility Domain Logic', () => {
  describe('isResultCandidateVisible', () => {
    it('always makes results visible if examStatus is RESULT_PUBLISHED', () => {
      const visible = isResultCandidateVisible({
        examStatus: ExamStatus.RESULT_PUBLISHED,
        releasePolicy: ResultsReleasePolicy.MANUAL
      });
      expect(visible).toBe(true);
    });

    it('always makes results visible if publishedAt timestamp is set', () => {
      const visible = isResultCandidateVisible({
        examStatus: ExamStatus.LIVE,
        releasePolicy: ResultsReleasePolicy.MANUAL,
        publishedAt: new Date()
      });
      expect(visible).toBe(true);
    });

    it('IMMEDIATE policy: visible immediately upon evaluation', () => {
      expect(isResultCandidateVisible({
        examStatus: ExamStatus.EVALUATED,
        releasePolicy: ResultsReleasePolicy.IMMEDIATE
      })).toBe(true);

      expect(isResultCandidateVisible({
        examStatus: ExamStatus.ENDED,
        releasePolicy: ResultsReleasePolicy.IMMEDIATE
      })).toBe(true);
    });

    it('SCHEDULED policy: visible only after scheduled release time and after exam ended', () => {
      const now = new Date('2026-09-27T12:00:00Z');
      const pastRelease = '2026-09-27T11:00:00Z';
      const futureRelease = '2026-09-27T13:00:00Z';

      // Exam ended, release time reached
      expect(isResultCandidateVisible({
        examStatus: ExamStatus.ENDED,
        releasePolicy: ResultsReleasePolicy.SCHEDULED,
        releaseAt: pastRelease,
        now
      })).toBe(true);

      // Exam ended, release time in future
      expect(isResultCandidateVisible({
        examStatus: ExamStatus.ENDED,
        releasePolicy: ResultsReleasePolicy.SCHEDULED,
        releaseAt: futureRelease,
        now
      })).toBe(false);

      // Exam still LIVE even if release time reached (shields active exam)
      expect(isResultCandidateVisible({
        examStatus: ExamStatus.LIVE,
        releasePolicy: ResultsReleasePolicy.SCHEDULED,
        releaseAt: pastRelease,
        now
      })).toBe(false);
    });

    it('MANUAL policy: shielded unless explicitly published', () => {
      expect(isResultCandidateVisible({
        examStatus: ExamStatus.ENDED,
        releasePolicy: ResultsReleasePolicy.MANUAL
      })).toBe(false);

      expect(isResultCandidateVisible({
        examStatus: ExamStatus.EVALUATED,
        releasePolicy: ResultsReleasePolicy.MANUAL
      })).toBe(false);
    });
  });

  describe('calculateDerivedFields', () => {
    it('correctly calculates pass and percentage', () => {
      const result = calculateDerivedFields({
        score: 75,
        totalMarks: 100,
        passingMarks: 50
      });
      expect(result).toEqual({ passed: true, percentage: 75 });
    });

    it('identifies failing score accurately', () => {
      const result = calculateDerivedFields({
        score: 39,
        totalMarks: 100,
        passingMarks: 40
      });
      expect(result).toEqual({ passed: false, percentage: 39 });
    });

    it('handles decimal division with 2 decimal places precision', () => {
      const result = calculateDerivedFields({
        score: 33,
        totalMarks: 90,
        passingMarks: 36
      });
      expect(result).toEqual({ passed: false, percentage: 36.67 });
    });

    it('safely handles zero totalMarks', () => {
      const result = calculateDerivedFields({
        score: 0,
        totalMarks: 0,
        passingMarks: 0
      });
      expect(result).toEqual({ passed: true, percentage: 0 });
    });
  });
});
