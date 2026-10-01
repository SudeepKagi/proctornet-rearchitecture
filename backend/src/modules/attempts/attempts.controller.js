/**
 * @file attempts.controller.js
 * @description HTTP REST Controller for Exam Attempts and Question Mapping endpoints.
 */

import * as attemptsService from './attempts.service.js';
import {
  startAttemptParamsSchema,
  startAttemptBodySchema,
  attemptIdParamsSchema,
  myAttemptParamsSchema
} from './attempts.schemas.js';

/**
 * Initiates an exam attempt for the authenticated candidate.
 * POST /api/v1/sessions/:sessionId/attempts
 */
export async function startAttempt(req, res, next) {
  try {
    let sessionId = req.params.sessionId || req.params.examId || req.params.id;
    if (!sessionId && req.body?.sessionId) {
      sessionId = req.body.sessionId;
    } else if (!sessionId && req.body?.examId) {
      sessionId = req.body.examId;
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Exam session or exam ID is required to start an examination attempt'
        }
      });
    }

    const result = await attemptsService.startAttempt(sessionId, req.user, req.id);
    const statusCode = result.is_new ? 201 : 200;
    const attemptId = result.attempt_id || result.attemptId;

    return res.status(statusCode).json({
      success: true,
      status: result.status || (result.is_new ? 'CREATED' : 'RESUMED'),
      data: {
        ...result,
        attemptId,
        id: attemptId,
        redirectUrl: result.redirectUrl || `/candidate/attempts/${attemptId}`
      }
    });
  } catch (err) {
    // If a conflict or existing attempt was flagged, return the structured attempt resume payload
    const existingAttemptId = err.existingAttemptId || err.data?.attemptId || err.data?.attempt_id;
    if (existingAttemptId) {
      return res.status(200).json({
        success: true,
        status: 'RESUMED',
        data: {
          attemptId: existingAttemptId,
          attempt_id: existingAttemptId,
          id: existingAttemptId,
          redirectUrl: err.redirectUrl || `/candidate/attempts/${existingAttemptId}`,
          message: 'Existing attempt resumed'
        }
      });
    }
    return next(err);
  }
}

/**
 * Retrieves details of an attempt by ID.
 * GET /api/v1/attempts/:attemptId
 */
export async function getAttemptById(req, res, next) {
  try {
    const { attemptId } = attemptIdParamsSchema.parse(req.params);
    const attempt = await attemptsService.getAttemptById(attemptId, req.user, req.id);

    return res.status(200).json({
      success: true,
      data: attempt
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Retrieves sanitized question mappings for an attempt.
 * GET /api/v1/attempts/:attemptId/questions
 */
export async function getAttemptQuestions(req, res, next) {
  try {
    const { attemptId } = attemptIdParamsSchema.parse(req.params);
    const result = await attemptsService.getAttemptQuestions(attemptId, req.user, req.id);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Retrieves candidate's attempt for a specific session.
 * GET /api/v1/sessions/:sessionId/my-attempt
 */
export async function getMyAttempt(req, res, next) {
  try {
    const sessionId = req.params.sessionId || req.params.id;
    const parsed = myAttemptParamsSchema.parse({ sessionId });
    const attempt = await attemptsService.getMyAttemptForSession(parsed.sessionId, req.user, req.id);

    return res.status(200).json({
      success: true,
      data: attempt
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Submits an exam attempt.
 * POST /api/v1/attempts/:attemptId/submit
 */
export async function submitAttempt(req, res, next) {
  try {
    const { attemptId } = attemptIdParamsSchema.parse(req.params);
    const result = await attemptsService.submitAttempt(attemptId, req.body || {}, req.user, req.id);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    return next(err);
  }
}
