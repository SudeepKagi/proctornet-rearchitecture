/**
 * @file evaluator.js
 * @description Pure deterministic objective grading engine for MCQ, TRUE_FALSE, and NUMERIC questions.
 * Completely free of side effects, database calls, or external I/O.
 * Conforms to Step 13.5 and Step 13.7 specifications.
 */

import { QuestionType } from '../../domain/question/questionTypes.js';

/**
 * Floating-point tolerance threshold for NUMERIC question evaluation.
 * A submitted numeric answer is correct if and only if |submitted - expected| < NUMERIC_TOLERANCE.
 */
export const NUMERIC_TOLERANCE = 0.0001;

/**
 * Evaluates a single question's answer against authoritative question definition and options.
 *
 * @param {object} question - Authoritative question definition from DB
 * @param {string} question.question_type - QuestionType ('MCQ', 'TRUE_FALSE', 'NUMERIC')
 * @param {number} [question.default_points=1.00] - Points for a correct answer
 * @param {number} [question.correct_numeric_value] - Correct numeric value if NUMERIC
 * @param {Array<{ option_id: string, is_correct: boolean }>} [options=[]] - Authoritative question options
 * @param {object|null} answer - Candidate submitted answer from DB (if any)
 * @param {object} [answer.answer_value] - Submitted answer JSON payload
 * @returns {{ is_correct: boolean, is_answered: boolean, points_awarded: number }}
 */
export function evaluateQuestionAnswer(question, options = [], answer = null) {
  const defaultPoints = typeof question.default_points === 'number' && Number.isFinite(question.default_points)
    ? question.default_points
    : 1.00;

  // Unanswered check: no answer record or empty answer_value
  if (!answer || !answer.answer_value || typeof answer.answer_value !== 'object') {
    return {
      is_correct: false,
      is_answered: false,
      points_awarded: 0
    };
  }

  const { answer_value } = answer;

  switch (question.question_type) {
    case QuestionType.MCQ:
    case QuestionType.TRUE_FALSE: {
      const selectedOptionId = answer_value.selected_option_id;
      if (!selectedOptionId || typeof selectedOptionId !== 'string') {
        return {
          is_correct: false,
          is_answered: false,
          points_awarded: 0
        };
      }

      // Find authoritative correct option
      const correctOption = options.find((opt) => opt.is_correct === true);
      const isCorrect = Boolean(correctOption && correctOption.option_id === selectedOptionId);

      return {
        is_correct: isCorrect,
        is_answered: true,
        points_awarded: isCorrect ? defaultPoints : 0
      };
    }

    case QuestionType.NUMERIC: {
      const submittedValue = answer_value.numeric_value;
      if (submittedValue === null || submittedValue === undefined || typeof submittedValue !== 'number' || !Number.isFinite(submittedValue)) {
        return {
          is_correct: false,
          is_answered: false,
          points_awarded: 0
        };
      }

      const expectedValue = Number(question.correct_numeric_value);
      if (!Number.isFinite(expectedValue)) {
        return {
          is_correct: false,
          is_answered: true,
          points_awarded: 0
        };
      }

      // Strict tolerance comparison: |submitted - expected| < 0.0001
      // Normalized to 8 decimal places to eliminate binary floating-point representation jitter (e.g. 0.0000999999999997)
      const diff = Number(Math.abs(submittedValue - expectedValue).toFixed(8));
      const isCorrect = diff < NUMERIC_TOLERANCE;

      return {
        is_correct: isCorrect,
        is_answered: true,
        points_awarded: isCorrect ? defaultPoints : 0
      };
    }

    default:
      return {
        is_correct: false,
        is_answered: false,
        points_awarded: 0
      };
  }
}

/**
 * Aggregates objective grading results across all questions mapped to an exam attempt.
 *
 * @param {Array<{
 *   question_id: string,
 *   question_type: string,
 *   default_points?: number,
 *   correct_numeric_value?: number,
 *   options?: Array<{ option_id: string, is_correct: boolean }>,
 *   answer?: object|null
 * }>} questionEvaluations
 * @returns {{
 *   score: number,
 *   correct_count: number,
 *   wrong_count: number,
 *   unanswered_count: number,
 *   total_questions: number,
 *   item_results: Array<{ question_id: string, is_correct: boolean, is_answered: boolean, points_awarded: number }>
 * }}
 */
export function aggregateEvaluationResults(questionEvaluations) {
  let totalScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  const itemResults = [];

  for (const item of questionEvaluations) {
    const evaluation = evaluateQuestionAnswer(item, item.options || [], item.answer || null);

    itemResults.push({
      question_id: item.question_id,
      ...evaluation
    });

    if (!evaluation.is_answered) {
      unansweredCount++;
    } else if (evaluation.is_correct) {
      correctCount++;
      totalScore += evaluation.points_awarded;
    } else {
      wrongCount++;
    }
  }

  // Round score to 2 decimal places matching NUMERIC(6, 2)
  const score = Number(totalScore.toFixed(2));

  return {
    score,
    correct_count: correctCount,
    wrong_count: wrongCount,
    unanswered_count: unansweredCount,
    total_questions: questionEvaluations.length,
    item_results: itemResults
  };
}
