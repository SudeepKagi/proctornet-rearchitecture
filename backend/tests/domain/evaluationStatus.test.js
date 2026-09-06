import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EvaluationStatus,
  ALL_EVALUATION_STATUSES,
  isValidEvaluationStatus,
  canTransitionEvaluation,
  transitionEvaluationStatus,
  InvalidStateTransitionError,
  DomainInvariantError
} from '../../src/domain/index.js';

describe('Evaluation Domain & Status Lifecycle', () => {
  describe('EvaluationStatus Enum', () => {
    it('should define the authoritative evaluation statuses', () => {
      assert.deepEqual(ALL_EVALUATION_STATUSES, ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED']);
    });

    it('should correctly identify valid and invalid evaluation statuses', () => {
      assert.equal(isValidEvaluationStatus('PENDING'), true);
      assert.equal(isValidEvaluationStatus('IN_PROGRESS'), true);
      assert.equal(isValidEvaluationStatus('COMPLETED'), true);
      assert.equal(isValidEvaluationStatus('FAILED'), true);

      assert.equal(isValidEvaluationStatus('UNKNOWN'), false);
      assert.equal(isValidEvaluationStatus(''), false);
      assert.equal(isValidEvaluationStatus(null), false);
    });
  });

  describe('Evaluation State Transitions', () => {
    it('should allow valid evaluation progression: PENDING -> IN_PROGRESS -> COMPLETED', () => {
      assert.equal(canTransitionEvaluation(EvaluationStatus.PENDING, EvaluationStatus.IN_PROGRESS), true);
      let status = transitionEvaluationStatus(EvaluationStatus.PENDING, EvaluationStatus.IN_PROGRESS);
      assert.equal(status, EvaluationStatus.IN_PROGRESS);

      assert.equal(canTransitionEvaluation(status, EvaluationStatus.COMPLETED), true);
      status = transitionEvaluationStatus(status, EvaluationStatus.COMPLETED);
      assert.equal(status, EvaluationStatus.COMPLETED);
    });

    it('should allow failure and retry: IN_PROGRESS -> FAILED -> IN_PROGRESS -> COMPLETED', () => {
      let status = transitionEvaluationStatus(EvaluationStatus.PENDING, EvaluationStatus.IN_PROGRESS);
      status = transitionEvaluationStatus(status, EvaluationStatus.FAILED);
      assert.equal(status, EvaluationStatus.FAILED);

      // Retry allowed
      assert.equal(canTransitionEvaluation(EvaluationStatus.FAILED, EvaluationStatus.IN_PROGRESS), true);
      status = transitionEvaluationStatus(status, EvaluationStatus.IN_PROGRESS);
      assert.equal(status, EvaluationStatus.IN_PROGRESS);

      status = transitionEvaluationStatus(status, EvaluationStatus.COMPLETED);
      assert.equal(status, EvaluationStatus.COMPLETED);
    });

    it('should reject illegal transitions (e.g., PENDING -> COMPLETED, COMPLETED -> IN_PROGRESS)', () => {
      assert.equal(canTransitionEvaluation(EvaluationStatus.PENDING, EvaluationStatus.COMPLETED), false);
      assert.throws(
        () => transitionEvaluationStatus(EvaluationStatus.PENDING, EvaluationStatus.COMPLETED),
        (err) => err instanceof InvalidStateTransitionError
      );

      assert.equal(canTransitionEvaluation(EvaluationStatus.COMPLETED, EvaluationStatus.IN_PROGRESS), false);
      assert.throws(
        () => transitionEvaluationStatus(EvaluationStatus.COMPLETED, EvaluationStatus.IN_PROGRESS),
        (err) => err instanceof InvalidStateTransitionError
      );
    });

    it('should throw DomainInvariantError on invalid evaluation status values', () => {
      assert.throws(
        () => transitionEvaluationStatus('BAD_STATUS', EvaluationStatus.IN_PROGRESS),
        (err) => err instanceof DomainInvariantError
      );
      assert.throws(
        () => transitionEvaluationStatus(EvaluationStatus.PENDING, 'BAD_TARGET'),
        (err) => err instanceof DomainInvariantError
      );
    });
  });
});
