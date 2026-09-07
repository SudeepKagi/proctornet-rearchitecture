/**
 * @file submissions.controller.js
 * @description HTTP REST Controller for Exam Submissions and Finalization.
 * Conforms to Step 13.5 and Phase 8 specifications.
 */

import * as submissionsService from './submissions.service.js';
import {
  submitAttemptParamsSchema,
  submitAttemptBodySchema
} from './submissions.schemas.js';
import { BadRequestError } from '../../utils/errors.js';

/**
 * Submits an exam attempt with mandatory Idempotency-Key and optional final dirty answers.
 * POST /api/v1/attempts/:attemptId/submit
 */
export async function submitAttempt(req, res, next) {
  try {
    const { attemptId } = submitAttemptParamsSchema.parse(req.params);
    const body = submitAttemptBodySchema.parse(req.body || {});

    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
      throw new BadRequestError('Idempotency-Key header is required for exam submission', 'MISSING_IDEMPOTENCY_KEY');
    }

    const result = await submissionsService.submitAttempt(
      attemptId,
      idempotencyKey.trim(),
      body,
      req.user,
      req.id
    );

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    return next(err);
  }
}
