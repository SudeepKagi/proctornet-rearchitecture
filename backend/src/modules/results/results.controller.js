/**
 * @file results.controller.js
 * @description HTTP REST Controller for Candidate Results, Staff Result Lists, Summaries, Publication, and Release Policies.
 * Conforms to Step 13.5 and Phase 9 specifications.
 */

import * as resultsService from './results.service.js';
import {
  candidateResultParamsSchema,
  examParamsSchema,
  listExamResultsQuerySchema,
  examSummaryQuerySchema,
  updateReleasePolicyBodySchema
} from './results.schemas.js';

/**
 * Handles candidate fetching their own attempt result.
 * GET /api/v1/attempts/:attemptId/result
 */
export async function getCandidateResult(req, res, next) {
  try {
    const { attemptId } = candidateResultParamsSchema.parse(req.params);

    const result = await resultsService.getCandidateAttemptResult({
      attemptId,
      candidateUserId: req.user.userId,
      requestId: req.id || req.requestId
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handles staff listing evaluated results for an exam with filters and pagination.
 * GET /api/v1/exams/:examId/results
 */
export async function getExamResults(req, res, next) {
  try {
    const { examId } = examParamsSchema.parse({ examId: req.params.examId || req.params.id });
    const query = listExamResultsQuerySchema.parse(req.query);

    const data = await resultsService.getExamResults({
      examId,
      user: req.user,
      query,
      requestId: req.id || req.requestId
    });

    return res.status(200).json({
      success: true,
      data
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handles staff fetching aggregated summary statistics for an exam's results.
 * GET /api/v1/exams/:examId/results/summary
 */
export async function getExamResultsSummary(req, res, next) {
  try {
    const { examId } = examParamsSchema.parse({ examId: req.params.examId || req.params.id });
    const query = examSummaryQuerySchema.parse(req.query);

    const summary = await resultsService.getExamResultsSummary({
      examId,
      user: req.user,
      query,
      requestId: req.id || req.requestId
    });

    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handles administrative manual publication of exam results.
 * POST /api/v1/exams/:examId/results/publish
 */
export async function publishExamResults(req, res, next) {
  try {
    const { examId } = examParamsSchema.parse({ examId: req.params.examId || req.params.id });

    const result = await resultsService.publishExamResults({
      examId,
      user: req.user,
      requestId: req.id || req.requestId
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handles updating an exam's result release policy and scheduled release time.
 * PATCH /api/v1/exams/:examId/results/policy
 */
export async function updateReleasePolicy(req, res, next) {
  try {
    const { examId } = examParamsSchema.parse({ examId: req.params.examId || req.params.id });
    const body = updateReleasePolicyBodySchema.parse(req.body);

    const result = await resultsService.updateReleasePolicy({
      examId,
      user: req.user,
      policy: body.resultsReleasePolicy,
      releaseAt: body.resultsReleaseAt,
      requestId: req.id || req.requestId
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    return next(err);
  }
}
