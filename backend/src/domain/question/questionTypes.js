/**
 * @file questionTypes.js
 * @description Question domain types and structural invariant validators.
 * Conforms to Step 13.5 Finalized Architecture specification.
 */

import { InvalidQuestionDefinitionError, DomainInvariantError } from '../shared/domainErrors.js';

/**
 * Supported Question Types in ProctorNet v1.
 * @readonly
 * @enum {string}
 */
export const QuestionType = Object.freeze({
  MCQ: 'MCQ',
  TRUE_FALSE: 'TRUE_FALSE',
  NUMERIC: 'NUMERIC'
});

/**
 * All valid question types.
 * @type {readonly string[]}
 */
export const ALL_QUESTION_TYPES = Object.freeze(Object.values(QuestionType));

/**
 * Checks if a given string is a valid QuestionType.
 * @param {string} type
 * @returns {boolean}
 */
export function isValidQuestionType(type) {
  return ALL_QUESTION_TYPES.includes(type);
}

/**
 * Validates a Question definition against its type invariants.
 * @param {object} question
 * @param {string} question.question_type
 * @param {string} question.prompt_text
 * @param {number} [question.default_points=1.00]
 * @param {number} [question.correct_numeric_value]
 * @param {Array<{ option_text: string, is_correct: boolean, display_order?: number }>} [question.options]
 * @throws {DomainInvariantError|InvalidQuestionDefinitionError}
 */
export function validateQuestion(question) {
  if (!question || typeof question !== 'object') {
    throw new DomainInvariantError('Question', 'Question definition must be a non-null object');
  }

  if (typeof question.prompt_text !== 'string' || question.prompt_text.trim().length === 0) {
    throw new DomainInvariantError('Question', 'Question prompt text is required and cannot be blank');
  }

  if (!isValidQuestionType(question.question_type)) {
    throw new DomainInvariantError(
      'Question',
      `Unsupported question type: '${question.question_type}'. Supported types: [${ALL_QUESTION_TYPES.join(', ')}]`,
      { question_type: question.question_type }
    );
  }

  const points = question.default_points !== undefined ? question.default_points : 1.00;
  if (typeof points !== 'number' || Number.isNaN(points) || points <= 0) {
    throw new DomainInvariantError('Question', 'Question default points must be a positive number', { default_points: points });
  }

  switch (question.question_type) {
    case QuestionType.MCQ: {
      if (!Array.isArray(question.options) || question.options.length < 2) {
        throw new InvalidQuestionDefinitionError(
          QuestionType.MCQ,
          `Multiple choice questions must have at least 2 options (received ${question.options?.length || 0})`
        );
      }

      let correctCount = 0;
      const seenOrders = new Set();

      for (let i = 0; i < question.options.length; i++) {
        const opt = question.options[i];
        if (!opt || typeof opt.option_text !== 'string' || opt.option_text.trim().length === 0) {
          throw new InvalidQuestionDefinitionError(QuestionType.MCQ, `Option at index ${i} has empty option_text`);
        }
        if (opt.is_correct === true) {
          correctCount++;
        }
        const order = opt.display_order !== undefined ? opt.display_order : i;
        if (seenOrders.has(order)) {
          throw new InvalidQuestionDefinitionError(QuestionType.MCQ, `Duplicate display_order ${order} found among options`);
        }
        seenOrders.add(order);
      }

      if (correctCount === 0) {
        throw new InvalidQuestionDefinitionError(QuestionType.MCQ, 'Multiple choice question must define at least one correct option');
      }
      break;
    }

    case QuestionType.TRUE_FALSE: {
      if (!Array.isArray(question.options) || question.options.length !== 2) {
        throw new InvalidQuestionDefinitionError(
          QuestionType.TRUE_FALSE,
          `True/False questions must define exactly 2 options (received ${question.options?.length || 0})`
        );
      }

      let correctCount = 0;
      for (let i = 0; i < question.options.length; i++) {
        const opt = question.options[i];
        if (!opt || typeof opt.option_text !== 'string' || opt.option_text.trim().length === 0) {
          throw new InvalidQuestionDefinitionError(QuestionType.TRUE_FALSE, `Option at index ${i} has empty option_text`);
        }
        if (opt.is_correct === true) {
          correctCount++;
        }
      }

      if (correctCount !== 1) {
        throw new InvalidQuestionDefinitionError(
          QuestionType.TRUE_FALSE,
          `True/False questions must have exactly one correct option (found ${correctCount})`
        );
      }
      break;
    }

    case QuestionType.NUMERIC: {
      if (typeof question.correct_numeric_value !== 'number' || Number.isNaN(question.correct_numeric_value) || !Number.isFinite(question.correct_numeric_value)) {
        throw new InvalidQuestionDefinitionError(
          QuestionType.NUMERIC,
          'Numeric questions must specify a valid finite numeric value for correct_numeric_value'
        );
      }
      break;
    }

    default:
      throw new DomainInvariantError('Question', `Unhandled question type: ${question.question_type}`);
  }
}
