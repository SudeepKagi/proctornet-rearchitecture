import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ExamStatus,
  ALL_EXAM_STATUSES,
  EXAM_TRANSITIONS,
  isValidExamStatus,
  isExamTerminal,
  transitionExamState,
  canTransitionExam,
  getNextAllowedExamStates,
  validateExamDefinition,
  assertExamCanBeMutated,
  InvalidStateTransitionError,
  DomainInvariantError
} from '../../src/domain/index.js';

describe('Exam Domain & State Machine', () => {
  describe('ExamStatus Enum & Utility Checks', () => {
    it('should define exactly the 7 authoritative exam lifecycle states', () => {
      assert.deepEqual(ALL_EXAM_STATUSES, [
        'DRAFT',
        'PUBLISHED',
        'SCHEDULED',
        'LIVE',
        'ENDED',
        'EVALUATED',
        'RESULT_PUBLISHED'
      ]);
    });

    it('should correctly identify valid and invalid status strings', () => {
      assert.equal(isValidExamStatus('DRAFT'), true);
      assert.equal(isValidExamStatus('PUBLISHED'), true);
      assert.equal(isValidExamStatus('SCHEDULED'), true);
      assert.equal(isValidExamStatus('LIVE'), true);
      assert.equal(isValidExamStatus('ENDED'), true);
      assert.equal(isValidExamStatus('EVALUATED'), true);
      assert.equal(isValidExamStatus('RESULT_PUBLISHED'), true);

      // Deprecated or invalid statuses
      assert.equal(isValidExamStatus('CONCLUDED'), false);
      assert.equal(isValidExamStatus('ARCHIVED'), false);
      assert.equal(isValidExamStatus('ACTIVE'), false);
      assert.equal(isValidExamStatus(''), false);
      assert.equal(isValidExamStatus(null), false);
      assert.equal(isValidExamStatus(undefined), false);
    });

    it('should correctly identify terminal exam status', () => {
      assert.equal(isExamTerminal(ExamStatus.RESULT_PUBLISHED), true);
      assert.equal(isExamTerminal(ExamStatus.DRAFT), false);
      assert.equal(isExamTerminal(ExamStatus.LIVE), false);
      assert.equal(isExamTerminal(ExamStatus.ENDED), false);
    });

    it('should return next allowed states or empty array for terminal state', () => {
      assert.deepEqual(getNextAllowedExamStates(ExamStatus.DRAFT), [ExamStatus.PUBLISHED]);
      assert.deepEqual(getNextAllowedExamStates(ExamStatus.PUBLISHED), [ExamStatus.SCHEDULED]);
      assert.deepEqual(getNextAllowedExamStates(ExamStatus.SCHEDULED), [ExamStatus.LIVE]);
      assert.deepEqual(getNextAllowedExamStates(ExamStatus.LIVE), [ExamStatus.ENDED]);
      assert.deepEqual(getNextAllowedExamStates(ExamStatus.ENDED), [ExamStatus.EVALUATED]);
      assert.deepEqual(getNextAllowedExamStates(ExamStatus.EVALUATED), [ExamStatus.RESULT_PUBLISHED]);
      assert.deepEqual(getNextAllowedExamStates(ExamStatus.RESULT_PUBLISHED), []);
    });

    it('should throw DomainInvariantError when getting next states for invalid state', () => {
      assert.throws(
        () => getNextAllowedExamStates('NON_EXISTENT'),
        (err) => err instanceof DomainInvariantError && err.code === 'DOMAIN_INVARIANT_VIOLATION'
      );
    });
  });

  describe('Valid Forward Transitions', () => {
    it('should successfully transition through the entire lifecycle linearly', () => {
      let state = ExamStatus.DRAFT;

      assert.equal(canTransitionExam(state, ExamStatus.PUBLISHED), true);
      state = transitionExamState(state, ExamStatus.PUBLISHED);
      assert.equal(state, ExamStatus.PUBLISHED);

      assert.equal(canTransitionExam(state, ExamStatus.SCHEDULED), true);
      state = transitionExamState(state, ExamStatus.SCHEDULED);
      assert.equal(state, ExamStatus.SCHEDULED);

      assert.equal(canTransitionExam(state, ExamStatus.LIVE), true);
      state = transitionExamState(state, ExamStatus.LIVE);
      assert.equal(state, ExamStatus.LIVE);

      assert.equal(canTransitionExam(state, ExamStatus.ENDED), true);
      state = transitionExamState(state, ExamStatus.ENDED);
      assert.equal(state, ExamStatus.ENDED);

      assert.equal(canTransitionExam(state, ExamStatus.EVALUATED), true);
      state = transitionExamState(state, ExamStatus.EVALUATED);
      assert.equal(state, ExamStatus.EVALUATED);

      assert.equal(canTransitionExam(state, ExamStatus.RESULT_PUBLISHED), true);
      state = transitionExamState(state, ExamStatus.RESULT_PUBLISHED);
      assert.equal(state, ExamStatus.RESULT_PUBLISHED);
    });
  });

  describe('Invalid Transitions & Guards', () => {
    it('should reject backward transitions', () => {
      const backwardTransitions = [
        [ExamStatus.PUBLISHED, ExamStatus.DRAFT],
        [ExamStatus.SCHEDULED, ExamStatus.PUBLISHED],
        [ExamStatus.SCHEDULED, ExamStatus.DRAFT],
        [ExamStatus.LIVE, ExamStatus.SCHEDULED],
        [ExamStatus.LIVE, ExamStatus.PUBLISHED],
        [ExamStatus.LIVE, ExamStatus.DRAFT],
        [ExamStatus.ENDED, ExamStatus.LIVE],
        [ExamStatus.EVALUATED, ExamStatus.ENDED],
        [ExamStatus.RESULT_PUBLISHED, ExamStatus.EVALUATED],
        [ExamStatus.RESULT_PUBLISHED, ExamStatus.LIVE]
      ];

      for (const [from, to] of backwardTransitions) {
        assert.equal(canTransitionExam(from, to), false, `canTransitionExam should be false for ${from} -> ${to}`);
        assert.throws(
          () => transitionExamState(from, to),
          (err) => {
            assert.ok(err instanceof InvalidStateTransitionError);
            assert.equal(err.entity, 'Exam');
            assert.equal(err.currentState, from);
            assert.equal(err.requestedState, to);
            return true;
          },
          `Should throw InvalidStateTransitionError for ${from} -> ${to}`
        );
      }
    });

    it('should reject step-skipping transitions', () => {
      const skippedTransitions = [
        [ExamStatus.DRAFT, ExamStatus.LIVE],
        [ExamStatus.DRAFT, ExamStatus.ENDED],
        [ExamStatus.DRAFT, ExamStatus.RESULT_PUBLISHED],
        [ExamStatus.PUBLISHED, ExamStatus.LIVE],
        [ExamStatus.PUBLISHED, ExamStatus.ENDED],
        [ExamStatus.SCHEDULED, ExamStatus.ENDED],
        [ExamStatus.LIVE, ExamStatus.RESULT_PUBLISHED]
      ];

      for (const [from, to] of skippedTransitions) {
        assert.equal(canTransitionExam(from, to), false);
        assert.throws(
          () => transitionExamState(from, to),
          (err) => err instanceof InvalidStateTransitionError
        );
      }
    });

    it('should reject self-transitions', () => {
      for (const status of ALL_EXAM_STATUSES) {
        assert.equal(canTransitionExam(status, status), false);
        assert.throws(
          () => transitionExamState(status, status),
          (err) => err instanceof InvalidStateTransitionError
        );
      }
    });

    it('should reject transitions from terminal state (RESULT_PUBLISHED)', () => {
      for (const target of ALL_EXAM_STATUSES) {
        assert.equal(canTransitionExam(ExamStatus.RESULT_PUBLISHED, target), false);
        assert.throws(
          () => transitionExamState(ExamStatus.RESULT_PUBLISHED, target),
          (err) => err instanceof InvalidStateTransitionError
        );
      }
    });

    it('should throw DomainInvariantError on invalid or null status inputs', () => {
      assert.throws(
        () => transitionExamState('INVALID_STATE', ExamStatus.LIVE),
        (err) => err instanceof DomainInvariantError
      );

      assert.throws(
        () => transitionExamState(ExamStatus.DRAFT, 'INVALID_TARGET'),
        (err) => err instanceof DomainInvariantError
      );
    });
  });

  describe('Exam Invariants & Validation', () => {
    it('should accept valid exam definitions', () => {
      assert.doesNotThrow(() => {
        validateExamDefinition({
          title: 'Midterm Physics Exam',
          duration_minutes: 90,
          total_marks: 100,
          passing_marks: 40,
          status: ExamStatus.DRAFT
        });
      });
    });

    it('should reject non-object or null exam definition', () => {
      assert.throws(() => validateExamDefinition(null), (err) => err instanceof DomainInvariantError);
      assert.throws(() => validateExamDefinition('not-an-object'), (err) => err instanceof DomainInvariantError);
    });

    it('should reject missing or empty title', () => {
      assert.throws(
        () => validateExamDefinition({ title: '', duration_minutes: 60, total_marks: 100, passing_marks: 40 }),
        (err) => err instanceof DomainInvariantError && err.message.includes('title')
      );
      assert.throws(
        () => validateExamDefinition({ title: '   ', duration_minutes: 60, total_marks: 100, passing_marks: 40 }),
        (err) => err instanceof DomainInvariantError
      );
    });

    it('should reject non-positive or non-integer duration', () => {
      assert.throws(
        () => validateExamDefinition({ title: 'Exam', duration_minutes: 0, total_marks: 100, passing_marks: 40 }),
        (err) => err instanceof DomainInvariantError && err.message.includes('duration')
      );
      assert.throws(
        () => validateExamDefinition({ title: 'Exam', duration_minutes: -15, total_marks: 100, passing_marks: 40 }),
        (err) => err instanceof DomainInvariantError
      );
      assert.throws(
        () => validateExamDefinition({ title: 'Exam', duration_minutes: 45.5, total_marks: 100, passing_marks: 40 }),
        (err) => err instanceof DomainInvariantError
      );
    });

    it('should reject negative marks or passing marks > total marks', () => {
      assert.throws(
        () => validateExamDefinition({ title: 'Exam', duration_minutes: 60, total_marks: -10, passing_marks: 0 }),
        (err) => err instanceof DomainInvariantError && err.message.includes('total marks')
      );
      assert.throws(
        () => validateExamDefinition({ title: 'Exam', duration_minutes: 60, total_marks: 100, passing_marks: -5 }),
        (err) => err instanceof DomainInvariantError && err.message.includes('passing marks')
      );
      assert.throws(
        () => validateExamDefinition({ title: 'Exam', duration_minutes: 60, total_marks: 50, passing_marks: 60 }),
        (err) => err instanceof DomainInvariantError && err.message.includes('cannot exceed total marks')
      );
    });

    it('should reject invalid initial status', () => {
      assert.throws(
        () => validateExamDefinition({ title: 'Exam', duration_minutes: 60, total_marks: 100, passing_marks: 40, status: 'UNKNOWN' }),
        (err) => err instanceof DomainInvariantError && err.message.includes('Invalid initial exam status')
      );
    });

    it('should enforce exam immutability for non-DRAFT states', () => {
      assert.doesNotThrow(() => assertExamCanBeMutated(ExamStatus.DRAFT));

      const nonDraftStates = [
        ExamStatus.PUBLISHED,
        ExamStatus.SCHEDULED,
        ExamStatus.LIVE,
        ExamStatus.ENDED,
        ExamStatus.EVALUATED,
        ExamStatus.RESULT_PUBLISHED
      ];

      for (const status of nonDraftStates) {
        assert.throws(
          () => assertExamCanBeMutated(status),
          (err) => err instanceof DomainInvariantError && err.message.includes('Cannot modify exam content'),
          `Should forbid mutations when exam status is ${status}`
        );
      }
    });
  });
});
