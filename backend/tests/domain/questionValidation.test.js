import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  QuestionType,
  ALL_QUESTION_TYPES,
  isValidQuestionType,
  validateQuestion,
  InvalidQuestionDefinitionError,
  DomainInvariantError
} from '../../src/domain/index.js';

describe('Question Domain & Type Validation', () => {
  describe('QuestionType Enum', () => {
    it('should support MCQ, TRUE_FALSE, NUMERIC, SHORT_ANSWER, ESSAY, and CODE in Phase 26', () => {
      assert.deepEqual(ALL_QUESTION_TYPES, ['MCQ', 'TRUE_FALSE', 'NUMERIC', 'SHORT_ANSWER', 'ESSAY', 'CODE']);
    });

    it('should validate supported types and reject others', () => {
      assert.equal(isValidQuestionType('MCQ'), true);
      assert.equal(isValidQuestionType('TRUE_FALSE'), true);
      assert.equal(isValidQuestionType('NUMERIC'), true);
      assert.equal(isValidQuestionType('SHORT_ANSWER'), true);
      assert.equal(isValidQuestionType('ESSAY'), true);
      assert.equal(isValidQuestionType('CODE'), true);

      assert.equal(isValidQuestionType('CODING'), false);
      assert.equal(isValidQuestionType('DESCRIPTIVE'), false);
      assert.equal(isValidQuestionType(''), false);
      assert.equal(isValidQuestionType(null), false);
    });
  });

  describe('General Question Invariants', () => {
    it('should reject non-object or null question definitions', () => {
      assert.throws(() => validateQuestion(null), (err) => err instanceof DomainInvariantError);
      assert.throws(() => validateQuestion('not-an-object'), (err) => err instanceof DomainInvariantError);
    });

    it('should reject empty or whitespace prompt text', () => {
      assert.throws(
        () => validateQuestion({ prompt_text: '', question_type: QuestionType.NUMERIC, correct_numeric_value: 42 }),
        (err) => err instanceof DomainInvariantError && err.message.includes('prompt text')
      );
      assert.throws(
        () => validateQuestion({ prompt_text: '   ', question_type: QuestionType.NUMERIC, correct_numeric_value: 42 }),
        (err) => err instanceof DomainInvariantError
      );
    });

    it('should reject unsupported question types', () => {
      assert.throws(
        () => validateQuestion({ prompt_text: 'What is X?', question_type: 'UNKNOWN_TYPE' }),
        (err) => err instanceof DomainInvariantError && err.message.includes('Unsupported question type')
      );
    });

    it('should reject non-positive or NaN default_points', () => {
      assert.throws(
        () => validateQuestion({ prompt_text: 'Q', question_type: QuestionType.NUMERIC, correct_numeric_value: 5, default_points: 0 }),
        (err) => err instanceof DomainInvariantError && err.message.includes('default points')
      );
      assert.throws(
        () => validateQuestion({ prompt_text: 'Q', question_type: QuestionType.NUMERIC, correct_numeric_value: 5, default_points: -2 }),
        (err) => err instanceof DomainInvariantError
      );
    });
  });

  describe('Multiple Choice (MCQ) Validation', () => {
    const validMcq = {
      prompt_text: 'Which planet is closest to the Sun?',
      question_type: QuestionType.MCQ,
      default_points: 2.0,
      options: [
        { option_text: 'Mercury', is_correct: true, display_order: 0 },
        { option_text: 'Venus', is_correct: false, display_order: 1 },
        { option_text: 'Mars', is_correct: false, display_order: 2 }
      ]
    };

    it('should accept valid MCQ definition with 2 or more options and a correct answer', () => {
      assert.doesNotThrow(() => validateQuestion(validMcq));
    });

    it('should reject MCQ with fewer than 2 options', () => {
      assert.throws(
        () => validateQuestion({
          ...validMcq,
          options: [{ option_text: 'Only One', is_correct: true }]
        }),
        (err) => err instanceof InvalidQuestionDefinitionError && err.message.includes('at least 2 options')
      );
    });

    it('should reject MCQ with no correct options', () => {
      assert.throws(
        () => validateQuestion({
          ...validMcq,
          options: [
            { option_text: 'Option A', is_correct: false },
            { option_text: 'Option B', is_correct: false }
          ]
        }),
        (err) => err instanceof InvalidQuestionDefinitionError && err.message.includes('at least one correct option')
      );
    });

    it('should reject MCQ with blank option text', () => {
      assert.throws(
        () => validateQuestion({
          ...validMcq,
          options: [
            { option_text: 'Valid Option', is_correct: true },
            { option_text: '   ', is_correct: false }
          ]
        }),
        (err) => err instanceof InvalidQuestionDefinitionError && err.message.includes('empty option_text')
      );
    });

    it('should reject MCQ with duplicate display_order', () => {
      assert.throws(
        () => validateQuestion({
          ...validMcq,
          options: [
            { option_text: 'A', is_correct: true, display_order: 1 },
            { option_text: 'B', is_correct: false, display_order: 1 }
          ]
        }),
        (err) => err instanceof InvalidQuestionDefinitionError && err.message.includes('Duplicate display_order')
      );
    });
  });

  describe('True / False (TRUE_FALSE) Validation', () => {
    const validTf = {
      prompt_text: 'The Earth is spherical.',
      question_type: QuestionType.TRUE_FALSE,
      default_points: 1.0,
      options: [
        { option_text: 'True', is_correct: true },
        { option_text: 'False', is_correct: false }
      ]
    };

    it('should accept valid True/False definition with exactly 2 options and 1 correct', () => {
      assert.doesNotThrow(() => validateQuestion(validTf));
    });

    it('should reject True/False with count !== 2', () => {
      assert.throws(
        () => validateQuestion({
          ...validTf,
          options: [{ option_text: 'True', is_correct: true }]
        }),
        (err) => err instanceof InvalidQuestionDefinitionError && err.message.includes('exactly 2 options')
      );
      assert.throws(
        () => validateQuestion({
          ...validTf,
          options: [
            { option_text: 'True', is_correct: true },
            { option_text: 'False', is_correct: false },
            { option_text: 'Maybe', is_correct: false }
          ]
        }),
        (err) => err instanceof InvalidQuestionDefinitionError && err.message.includes('exactly 2 options')
      );
    });

    it('should reject True/False with 0 or 2 correct options', () => {
      assert.throws(
        () => validateQuestion({
          ...validTf,
          options: [
            { option_text: 'True', is_correct: false },
            { option_text: 'False', is_correct: false }
          ]
        }),
        (err) => err instanceof InvalidQuestionDefinitionError && err.message.includes('exactly one correct option')
      );

      assert.throws(
        () => validateQuestion({
          ...validTf,
          options: [
            { option_text: 'True', is_correct: true },
            { option_text: 'False', is_correct: true }
          ]
        }),
        (err) => err instanceof InvalidQuestionDefinitionError && err.message.includes('exactly one correct option')
      );
    });
  });

  describe('Numeric (NUMERIC) Validation', () => {
    it('should accept valid numeric questions with integer, float, or zero value', () => {
      assert.doesNotThrow(() => validateQuestion({
        prompt_text: 'What is 2 + 2?',
        question_type: QuestionType.NUMERIC,
        correct_numeric_value: 4
      }));

      assert.doesNotThrow(() => validateQuestion({
        prompt_text: 'Value of Pi to 2 decimal places?',
        question_type: QuestionType.NUMERIC,
        correct_numeric_value: 3.14
      }));

      assert.doesNotThrow(() => validateQuestion({
        prompt_text: 'Freezing point of water in Celsius?',
        question_type: QuestionType.NUMERIC,
        correct_numeric_value: 0
      }));

      assert.doesNotThrow(() => validateQuestion({
        prompt_text: 'Target negative temperature?',
        question_type: QuestionType.NUMERIC,
        correct_numeric_value: -273.15
      }));
    });

    it('should reject numeric questions with missing, non-numeric, or NaN target values', () => {
      assert.throws(
        () => validateQuestion({
          prompt_text: 'Value?',
          question_type: QuestionType.NUMERIC
        }),
        (err) => err instanceof InvalidQuestionDefinitionError && err.message.includes('finite numeric value')
      );

      assert.throws(
        () => validateQuestion({
          prompt_text: 'Value?',
          question_type: QuestionType.NUMERIC,
          correct_numeric_value: '42'
        }),
        (err) => err instanceof InvalidQuestionDefinitionError
      );

      assert.throws(
        () => validateQuestion({
          prompt_text: 'Value?',
          question_type: QuestionType.NUMERIC,
          correct_numeric_value: NaN
        }),
        (err) => err instanceof InvalidQuestionDefinitionError
      );

      assert.throws(
        () => validateQuestion({
          prompt_text: 'Value?',
          question_type: QuestionType.NUMERIC,
          correct_numeric_value: Infinity
        }),
        (err) => err instanceof InvalidQuestionDefinitionError
      );
    });
  });

  describe('Subjective Question Validation (SHORT_ANSWER, ESSAY, CODE)', () => {
    it('should accept valid SHORT_ANSWER, ESSAY, and CODE definitions', () => {
      assert.doesNotThrow(() => validateQuestion({
        prompt_text: 'Explain how TCP 3-way handshake works.',
        question_type: QuestionType.SHORT_ANSWER,
        default_points: 5.0,
        rubric: {
          syn_ack: 2.0,
          clarity: 3.0
        }
      }));

      assert.doesNotThrow(() => validateQuestion({
        prompt_text: 'Discuss the impact of distributed consensus protocols on database consistency.',
        question_type: QuestionType.ESSAY,
        default_points: 10.0
      }));

      assert.doesNotThrow(() => validateQuestion({
        prompt_text: 'Write a function in Python that reverses a singly linked list.',
        question_type: QuestionType.CODE,
        default_points: 15.0,
        rubric: {
          correctness: 10.0,
          edge_cases: 5.0
        }
      }));
    });

    it('should reject subjective questions with non-object rubric', () => {
      assert.throws(
        () => validateQuestion({
          prompt_text: 'Explain photosynthesis.',
          question_type: QuestionType.SHORT_ANSWER,
          rubric: 'not-an-object'
        }),
        (err) => err instanceof InvalidQuestionDefinitionError && err.message.includes('rubric must be a valid JSON object')
      );
    });
  });
});
