import { describe, it, expect } from 'vitest';
import { ExamStatus, isExamTerminal } from '../../src/domain/exam/examStates.js';
import {
  getNextAllowedExamStates,
  canTransitionExam,
  transitionExamState
} from '../../src/domain/exam/examStateMachine.js';
import { InvalidStateTransitionError, DomainInvariantError } from '../../src/domain/shared/domainErrors.js';

describe('ExamStateMachine Invariants & Transitions', () => {
  describe('Linear lifecycle transitions', () => {
    it('enforces strict sequential progression: DRAFT -> PUBLISHED -> SCHEDULED -> LIVE -> ENDED -> EVALUATED -> RESULT_PUBLISHED', () => {
      let state = ExamStatus.DRAFT;

      state = transitionExamState(state, ExamStatus.PUBLISHED);
      expect(state).toBe(ExamStatus.PUBLISHED);

      state = transitionExamState(state, ExamStatus.SCHEDULED);
      expect(state).toBe(ExamStatus.SCHEDULED);

      state = transitionExamState(state, ExamStatus.LIVE);
      expect(state).toBe(ExamStatus.LIVE);

      state = transitionExamState(state, ExamStatus.ENDED);
      expect(state).toBe(ExamStatus.ENDED);

      state = transitionExamState(state, ExamStatus.EVALUATED);
      expect(state).toBe(ExamStatus.EVALUATED);

      state = transitionExamState(state, ExamStatus.RESULT_PUBLISHED);
      expect(state).toBe(ExamStatus.RESULT_PUBLISHED);
    });

    it('rejects skipping steps in the lifecycle', () => {
      expect(() => transitionExamState(ExamStatus.DRAFT, ExamStatus.LIVE))
        .toThrow(InvalidStateTransitionError);
      expect(() => transitionExamState(ExamStatus.PUBLISHED, ExamStatus.ENDED))
        .toThrow(InvalidStateTransitionError);
      expect(() => transitionExamState(ExamStatus.SCHEDULED, ExamStatus.EVALUATED))
        .toThrow(InvalidStateTransitionError);
    });

    it('rejects backward transitions', () => {
      expect(() => transitionExamState(ExamStatus.LIVE, ExamStatus.SCHEDULED))
        .toThrow(InvalidStateTransitionError);
      expect(() => transitionExamState(ExamStatus.ENDED, ExamStatus.LIVE))
        .toThrow(InvalidStateTransitionError);
      expect(() => transitionExamState(ExamStatus.RESULT_PUBLISHED, ExamStatus.DRAFT))
        .toThrow(InvalidStateTransitionError);
    });
  });

  describe('Terminal state detection', () => {
    it('identifies RESULT_PUBLISHED as the sole terminal state', () => {
      expect(isExamTerminal(ExamStatus.RESULT_PUBLISHED)).toBe(true);
      expect(isExamTerminal(ExamStatus.ENDED)).toBe(false);
      expect(isExamTerminal(ExamStatus.EVALUATED)).toBe(false);
      expect(isExamTerminal(ExamStatus.LIVE)).toBe(false);
    });

    it('allows zero transitions from RESULT_PUBLISHED', () => {
      const allowed = getNextAllowedExamStates(ExamStatus.RESULT_PUBLISHED);
      expect(allowed).toEqual([]);
      expect(canTransitionExam(ExamStatus.RESULT_PUBLISHED, ExamStatus.DRAFT)).toBe(false);
    });
  });

  describe('Invalid inputs', () => {
    it('throws DomainInvariantError on unknown states', () => {
      expect(() => getNextAllowedExamStates('UNKNOWN_STATE')).toThrow(DomainInvariantError);
      expect(() => transitionExamState('UNKNOWN_STATE', ExamStatus.PUBLISHED)).toThrow(DomainInvariantError);
      expect(() => transitionExamState(ExamStatus.DRAFT, 'UNKNOWN_STATE')).toThrow(DomainInvariantError);
    });
  });
});
