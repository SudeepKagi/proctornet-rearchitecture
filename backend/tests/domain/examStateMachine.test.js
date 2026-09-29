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
    it('identifies RESULT_PUBLISHED and CANCELLED as terminal states', () => {
      expect(isExamTerminal(ExamStatus.RESULT_PUBLISHED)).toBe(true);
      expect(isExamTerminal(ExamStatus.CANCELLED)).toBe(true);
      expect(isExamTerminal(ExamStatus.ENDED)).toBe(false);
      expect(isExamTerminal(ExamStatus.EVALUATED)).toBe(false);
      expect(isExamTerminal(ExamStatus.LIVE)).toBe(false);
      expect(isExamTerminal(ExamStatus.SCHEDULED)).toBe(false);
    });

    it('allows zero transitions from RESULT_PUBLISHED and CANCELLED', () => {
      expect(getNextAllowedExamStates(ExamStatus.RESULT_PUBLISHED)).toEqual([]);
      expect(canTransitionExam(ExamStatus.RESULT_PUBLISHED, ExamStatus.DRAFT)).toBe(false);
      expect(getNextAllowedExamStates(ExamStatus.CANCELLED)).toEqual([]);
      expect(canTransitionExam(ExamStatus.CANCELLED, ExamStatus.LIVE)).toBe(false);
    });
  });

  describe('Cancellation transitions', () => {
    it('allows transitions to CANCELLED from DRAFT, PUBLISHED, SCHEDULED, and LIVE', () => {
      expect(canTransitionExam(ExamStatus.DRAFT, ExamStatus.CANCELLED)).toBe(true);
      expect(transitionExamState(ExamStatus.DRAFT, ExamStatus.CANCELLED)).toBe(ExamStatus.CANCELLED);

      expect(canTransitionExam(ExamStatus.PUBLISHED, ExamStatus.CANCELLED)).toBe(true);
      expect(transitionExamState(ExamStatus.PUBLISHED, ExamStatus.CANCELLED)).toBe(ExamStatus.CANCELLED);

      expect(canTransitionExam(ExamStatus.SCHEDULED, ExamStatus.CANCELLED)).toBe(true);
      expect(transitionExamState(ExamStatus.SCHEDULED, ExamStatus.CANCELLED)).toBe(ExamStatus.CANCELLED);

      expect(canTransitionExam(ExamStatus.LIVE, ExamStatus.CANCELLED)).toBe(true);
      expect(transitionExamState(ExamStatus.LIVE, ExamStatus.CANCELLED)).toBe(ExamStatus.CANCELLED);
    });

    it('rejects transitions to CANCELLED from ENDED, EVALUATED, or RESULT_PUBLISHED', () => {
      expect(canTransitionExam(ExamStatus.ENDED, ExamStatus.CANCELLED)).toBe(false);
      expect(() => transitionExamState(ExamStatus.ENDED, ExamStatus.CANCELLED))
        .toThrow(InvalidStateTransitionError);

      expect(canTransitionExam(ExamStatus.EVALUATED, ExamStatus.CANCELLED)).toBe(false);
      expect(() => transitionExamState(ExamStatus.EVALUATED, ExamStatus.CANCELLED))
        .toThrow(InvalidStateTransitionError);

      expect(canTransitionExam(ExamStatus.RESULT_PUBLISHED, ExamStatus.CANCELLED)).toBe(false);
      expect(() => transitionExamState(ExamStatus.RESULT_PUBLISHED, ExamStatus.CANCELLED))
        .toThrow(InvalidStateTransitionError);
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
