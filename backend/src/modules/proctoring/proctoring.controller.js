/**
 * @file proctoring.controller.js
 * @description HTTP request handlers for Proctoring Event Ingestion, Timeline, Summary, and Flags.
 */

import * as proctoringService from './proctoring.service.js';
import {
  ingestEventsSchema,
  createManualFlagSchema,
  updateFlagStatusSchema,
  timelineQuerySchema
} from './proctoring.schemas.js';

/**
 * Ingests a batch of candidate violation and telemetry events.
 * POST /api/v1/attempts/:attemptId/events
 */
export async function handleIngestEvents(req, res, next) {
  try {
    const attemptId = req.params.attemptId;
    const parsed = ingestEventsSchema.parse(req.body);
    const result = await proctoringService.ingestCandidateEvents(attemptId, req.user, parsed.events);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Queries violation event timeline and flags for an attempt.
 * GET /api/v1/attempts/:attemptId/events
 */
export async function handleGetAttemptTimeline(req, res, next) {
  try {
    const attemptId = req.params.attemptId;
    const parsedQuery = timelineQuerySchema.parse(req.query);
    const result = await proctoringService.getAttemptTimeline(attemptId, req.user, parsedQuery);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Queries session-level proctoring summary across all candidates.
 * GET /api/v1/sessions/:sessionId/proctoring/summary
 */
export async function handleGetSessionSummary(req, res, next) {
  try {
    const sessionId = req.params.sessionId || req.params.id;
    const result = await proctoringService.getSessionProctoringSummary(sessionId, req.user);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a manual violation flag for an attempt.
 * POST /api/v1/attempts/:attemptId/proctoring/flags
 */
export async function handleCreateManualFlag(req, res, next) {
  try {
    const attemptId = req.params.attemptId;
    const parsed = createManualFlagSchema.parse(req.body);
    const result = await proctoringService.createManualProctorFlag(attemptId, req.user, parsed);

    res.status(201).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates status of a violation flag (REVIEWED or DISMISSED).
 * PATCH /api/v1/attempts/:attemptId/proctoring/flags/:flagId
 */
export async function handleUpdateFlagStatus(req, res, next) {
  try {
    const attemptId = req.params.attemptId;
    const flagId = req.params.flagId;
    const parsed = updateFlagStatusSchema.parse(req.body);
    const result = await proctoringService.updateProctorFlagStatus(attemptId, flagId, req.user, parsed);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    next(err);
  }
}
