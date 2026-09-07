/**
 * @file evaluator.test.js
 * @description Unit tests for pure objective grading engine (MCQ, TRUE_FALSE, NUMERIC).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateQuestionAnswer,
  aggregateEvaluationResults,
  NUMERIC_TOLERANCE
} from '../../src/modules/evaluation/evaluator.js';

describe('Objective Evaluator — Pure Grading Engine', () => {
  describe('Multiple Choice (MCQ)', () => {
    const mcqQuestion = {
      question_id: 'q-mcq-1',
      question_type: 'MCQ',
      default_points: 2.5
    };

    const options = [
      { option_id: 'opt-1', is_correct: false },
      { option_id: 'opt-2', is_correct: true },
      { option_id: 'opt-3', is_correct: false }
    ];

    it('should award full points when selected option is correct', () => {
      const answer = { answer_value: { selected_option_id: 'opt-2' } };
      const res = evaluateQuestionAnswer(mcqQuestion, options, answer);

      assert.equal(res.is_correct, true);
      assert.equal(res.is_answered, true);
      assert.equal(res.points_awarded, 2.5);
    });

    it('should award 0 points when selected option is incorrect', () => {
      const answer = { answer_value: { selected_option_id: 'opt-1' } };
      const res = evaluateQuestionAnswer(mcqQuestion, options, answer);

      assert.equal(res.is_correct, false);
      assert.equal(res.is_answered, true);
      assert.equal(res.points_awarded, 0);
    });

    it('should treat missing answer as unanswered with 0 points', () => {
      const res = evaluateQuestionAnswer(mcqQuestion, options, null);

      assert.equal(res.is_correct, false);
      assert.equal(res.is_answered, false);
      assert.equal(res.points_awarded, 0);
    });
  });

  describe('True / False (TRUE_FALSE)', () => {
    const tfQuestion = {
      question_id: 'q-tf-1',
      question_type: 'TRUE_FALSE',
      default_points: 1.0
    };

    const options = [
      { option_id: 'opt-true', is_correct: true },
      { option_id: 'opt-false', is_correct: false }
    ];

    it('should award full points when correct option is selected', () => {
      const answer = { answer_value: { selected_option_id: 'opt-true' } };
      const res = evaluateQuestionAnswer(tfQuestion, options, answer);

      assert.equal(res.is_correct, true);
      assert.equal(res.is_answered, true);
      assert.equal(res.points_awarded, 1.0);
    });

    it('should award 0 points when wrong option is selected', () => {
      const answer = { answer_value: { selected_option_id: 'opt-false' } };
      const res = evaluateQuestionAnswer(tfQuestion, options, answer);

      assert.equal(res.is_correct, false);
      assert.equal(res.is_answered, true);
      assert.equal(res.points_awarded, 0);
    });
  });

  describe('Numeric (NUMERIC) — Tolerance and Boundary Tests', () => {
    const numericQuestion = {
      question_id: 'q-num-1',
      question_type: 'NUMERIC',
      default_points: 3.0,
      correct_numeric_value: 42.1234
    };

    it('should mark correct on exact equality (diff = 0)', () => {
      const answer = { answer_value: { numeric_value: 42.1234 } };
      const res = evaluateQuestionAnswer(numericQuestion, [], answer);

      assert.equal(res.is_correct, true);
      assert.equal(res.is_answered, true);
      assert.equal(res.points_awarded, 3.0);
    });

    it('should mark correct when difference is strictly less than 0.0001 (diff = 0.00005)', () => {
      const answer = { answer_value: { numeric_value: 42.12345 } };
      const res = evaluateQuestionAnswer(numericQuestion, [], answer);

      assert.equal(res.is_correct, true);
      assert.equal(res.is_answered, true);
      assert.equal(res.points_awarded, 3.0);
    });

    it('should mark INCORRECT when difference is exactly equal to 0.0001 (|diff| = 0.0001)', () => {
      const answer = { answer_value: { numeric_value: 42.1235 } }; // diff = 0.0001
      const res = evaluateQuestionAnswer(numericQuestion, [], answer);

      assert.equal(res.is_correct, false);
      assert.equal(res.is_answered, true);
      assert.equal(res.points_awarded, 0);
    });

    it('should mark INCORRECT when difference is greater than 0.0001 (diff = 0.00011)', () => {
      const answer = { answer_value: { numeric_value: 42.12351 } };
      const res = evaluateQuestionAnswer(numericQuestion, [], answer);

      assert.equal(res.is_correct, false);
      assert.equal(res.is_answered, true);
      assert.equal(res.points_awarded, 0);
    });

    it('should handle zero value correctly', () => {
      const zeroQ = {
        question_id: 'q-zero',
        question_type: 'NUMERIC',
        default_points: 1.0,
        correct_numeric_value: 0.0
      };

      const correctAns = { answer_value: { numeric_value: 0.0 } };
      assert.equal(evaluateQuestionAnswer(zeroQ, [], correctAns).is_correct, true);

      const withinTolerance = { answer_value: { numeric_value: 0.00009 } };
      assert.equal(evaluateQuestionAnswer(zeroQ, [], withinTolerance).is_correct, true);

      const outsideTolerance = { answer_value: { numeric_value: 0.0001 } };
      assert.equal(evaluateQuestionAnswer(zeroQ, [], outsideTolerance).is_correct, false);
    });

    it('should handle negative numeric values correctly', () => {
      const negQ = {
        question_id: 'q-neg',
        question_type: 'NUMERIC',
        default_points: 2.0,
        correct_numeric_value: -15.5
      };

      const exactNeg = { answer_value: { numeric_value: -15.5 } };
      assert.equal(evaluateQuestionAnswer(negQ, [], exactNeg).is_correct, true);

      const withinToleranceNeg = { answer_value: { numeric_value: -15.50005 } };
      assert.equal(evaluateQuestionAnswer(negQ, [], withinToleranceNeg).is_correct, true);

      const atBoundaryNeg = { answer_value: { numeric_value: -15.5001 } };
      assert.equal(evaluateQuestionAnswer(negQ, [], atBoundaryNeg).is_correct, false);

      const wrongNeg = { answer_value: { numeric_value: 15.5 } };
      assert.equal(evaluateQuestionAnswer(negQ, [], wrongNeg).is_correct, false);
    });

    it('should handle decimal float rounding comparisons', () => {
      const piQ = {
        question_id: 'q-pi',
        question_type: 'NUMERIC',
        default_points: 1.0,
        correct_numeric_value: 3.14159
      };

      const submittedPi = { answer_value: { numeric_value: 3.14159 } };
      assert.equal(evaluateQuestionAnswer(piQ, [], submittedPi).is_correct, true);

      const coarsePi = { answer_value: { numeric_value: 3.14 } }; // diff ≈ 0.00159 > 0.0001
      assert.equal(evaluateQuestionAnswer(piQ, [], coarsePi).is_correct, false);
    });
  });

  describe('Aggregation & Result Totals', () => {
    it('should accurately aggregate mixed question exams', () => {
      const items = [
        {
          question_id: 'q1',
          question_type: 'MCQ',
          default_points: 2.0,
          options: [{ option_id: 'opt-1', is_correct: true }],
          answer: { answer_value: { selected_option_id: 'opt-1' } } // correct -> 2.0
        },
        {
          question_id: 'q2',
          question_type: 'TRUE_FALSE',
          default_points: 1.5,
          options: [{ option_id: 'opt-true', is_correct: true }],
          answer: { answer_value: { selected_option_id: 'opt-wrong' } } // wrong -> 0
        },
        {
          question_id: 'q3',
          question_type: 'NUMERIC',
          default_points: 3.0,
          correct_numeric_value: 100,
          answer: { answer_value: { numeric_value: 100.00005 } } // correct -> 3.0
        },
        {
          question_id: 'q4',
          question_type: 'MCQ',
          default_points: 2.5,
          options: [{ option_id: 'opt-correct', is_correct: true }],
          answer: null // unanswered -> 0
        }
      ];

      const res = aggregateEvaluationResults(items);

      assert.equal(res.total_questions, 4);
      assert.equal(res.correct_count, 2);
      assert.equal(res.wrong_count, 1);
      assert.equal(res.unanswered_count, 1);
      assert.equal(res.score, 5.0); // 2.0 + 3.0
    });

    it('should produce 0.00 score and 100% wrong/unanswered when all fail', () => {
      const items = [
        {
          question_id: 'q1',
          question_type: 'NUMERIC',
          default_points: 5.0,
          correct_numeric_value: 10,
          answer: { answer_value: { numeric_value: 50 } }
        },
        {
          question_id: 'q2',
          question_type: 'MCQ',
          default_points: 5.0,
          options: [{ option_id: 'opt-1', is_correct: true }],
          answer: null
        }
      ];

      const res = aggregateEvaluationResults(items);

      assert.equal(res.score, 0.0);
      assert.equal(res.correct_count, 0);
      assert.equal(res.wrong_count, 1);
      assert.equal(res.unanswered_count, 1);
    });
  });
});
