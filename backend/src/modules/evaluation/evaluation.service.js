/**
 * @file evaluation.service.js
 * @description Business workflow service for asynchronous objective exam attempt evaluation.
 * Conforms to Step 13.5, 13.7, and Phase 8 specifications.
 */

import { getPool } from '../../infrastructure/postgres/pool.js';
import { NotFoundError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import * as evaluationRepo from './evaluation.repository.js';
import { aggregateEvaluationResults } from './evaluator.js';

/**
 * Evaluates an exam attempt by reading authoritative data from PostgreSQL,
 * computing objective scores in-memory without holding locks, and persisting results.
 *
 * @param {string} attemptId
 * @returns {Promise<object>} Persisted or existing results record
 */
export async function evaluateAttempt(attemptId) {
  // 1. Pre-execution deduplication check
  const existingResult = await evaluationRepo.findResultByAttemptId(attemptId);
  if (existingResult) {
    logger.info(
      { attemptId, resultId: existingResult.result_id },
      'Attempt result already exists; returning existing result'
    );
    return existingResult;
  }

  // 2. Load authoritative attempt metadata (non-locking)
  const attempt = await evaluationRepo.loadAttemptForEvaluation(attemptId);
  if (!attempt) {
    throw new NotFoundError(`Exam attempt with ID '${attemptId}' not found for evaluation`);
  }

  // 3. Load attempt questions and submitted answers (non-locking)
  const attemptQuestions = await evaluationRepo.loadAttemptQuestionsWithAnswers(attemptId);

  // 4. Load options for all questions in attempt (non-locking)
  const questionIds = attemptQuestions.map((q) => q.question_id);
  const options = await evaluationRepo.loadOptionsForQuestions(questionIds);

  const optionsByQuestionId = new Map();
  for (const opt of options) {
    if (!optionsByQuestionId.has(opt.question_id)) {
      optionsByQuestionId.set(opt.question_id, []);
    }
    optionsByQuestionId.get(opt.question_id).push(opt);
  }

  // 5. Execute Lock-Free In-Memory CPU Grading
  const itemsToEvaluate = attemptQuestions.map((aq) => ({
    question_id: aq.question_id,
    question_type: aq.question_type,
    default_points: aq.default_points !== null ? Number(aq.default_points) : 1.0,
    correct_numeric_value: aq.correct_numeric_value !== null ? Number(aq.correct_numeric_value) : null,
    options: optionsByQuestionId.get(aq.question_id) || [],
    answer: aq.answer_id ? { answer_value: aq.answer_value } : null
  }));

  const aggregated = aggregateEvaluationResults(itemsToEvaluate);

  logger.info(
    {
      attemptId,
      score: aggregated.score,
      correctCount: aggregated.correct_count,
      wrongCount: aggregated.wrong_count,
      unansweredCount: aggregated.unanswered_count
    },
    'Objective evaluation computed in memory'
  );

  // 6. Short Result Persistence Transaction
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const persistedResult = await evaluationRepo.insertResult(
      {
        attemptId,
        score: aggregated.score,
        correctCount: aggregated.correct_count,
        wrongCount: aggregated.wrong_count,
        unansweredCount: aggregated.unanswered_count
      },
      client
    );

    await client.query('COMMIT');

    if (persistedResult) {
      logger.info(
        { attemptId, resultId: persistedResult.result_id, score: persistedResult.score },
        'Attempt evaluation result persisted successfully'
      );
      return persistedResult;
    }

    // Handled race condition: concurrent insert won, fetch the committed row
    const fallbackResult = await evaluationRepo.findResultByAttemptId(attemptId);
    return fallbackResult;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error({ err, attemptId }, 'Failed to persist evaluation result');
    throw err;
  } finally {
    client.release();
  }
}
