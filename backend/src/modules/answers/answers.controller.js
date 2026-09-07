/**
 * @file answers.controller.js
 * @description HTTP REST Controller for Exam Answers, Autosave, OCC Revisions, and Clear operations.
 */

import * as answersService from './answers.service.js';
import {
  attemptAnswersParamsSchema,
  singleAnswerParamsSchema,
  saveAnswerBodySchema,
  clearAnswerBodySchema,
  batchAnswersBodySchema
} from './answers.schemas.js';

/**
 * Saves or updates a single question answer with OCC revision tracking.
 * PUT /api/v1/attempts/:attemptId/answers/:attemptQuestionId
 */
export async function saveAnswer(req, res, next) {
  try {
    const { attemptId, attemptQuestionId } = singleAnswerParamsSchema.parse(req.params);
    const body = saveAnswerBodySchema.parse(req.body);

    const result = await answersService.saveAnswer(attemptId, attemptQuestionId, body, req.user, req.id);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Clears an answer with OCC revision tracking.
 * DELETE /api/v1/attempts/:attemptId/answers/:attemptQuestionId
 */
export async function clearAnswer(req, res, next) {
  try {
    const { attemptId, attemptQuestionId } = singleAnswerParamsSchema.parse(req.params);
    const body = clearAnswerBodySchema.parse(req.body);

    const result = await answersService.clearAnswer(attemptId, attemptQuestionId, body, req.user, req.id);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Saves a batch of answers in a single atomic PostgreSQL transaction.
 * POST /api/v1/attempts/:attemptId/answers/batch
 */
export async function batchSaveAnswers(req, res, next) {
  try {
    const { attemptId } = attemptAnswersParamsSchema.parse(req.params);
    const body = batchAnswersBodySchema.parse(req.body);

    const result = await answersService.batchSaveAnswers(attemptId, body, req.user, req.id);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Retrieves all answers for an attempt.
 * GET /api/v1/attempts/:attemptId/answers
 */
export async function getAnswersForAttempt(req, res, next) {
  try {
    const { attemptId } = attemptAnswersParamsSchema.parse(req.params);
    const result = await answersService.getAnswersForAttempt(attemptId, req.user, req.id);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    return next(err);
  }
}
