/**
 * @file proctoring.routes.js
 * @description Express routers for Proctoring Event Ingestion, Timeline, Summary, and Flag Lifecycle.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { createRateLimiter } from '../../middleware/rateLimiter.js';
import { antiTamperMiddleware } from '../../middleware/antiTamper.js';
import {
  handleIngestEvents,
  handleGetAttemptTimeline,
  handleGetSessionSummary,
  handleCreateManualFlag,
  handleUpdateFlagStatus
} from './proctoring.controller.js';

// Sliding-window rate limiter: max 60 batch requests per 60s per candidate attempt
export const proctoringRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Proctoring event ingestion rate limit exceeded. Please wait before transmitting more telemetry.',
  keyGenerator: (req) => {
    const userId = req.user?.userId || 'unknown';
    const attemptId = req.params?.attemptId || 'unknown';
    return `v1:ratelimit:proctoring:${userId}:${attemptId}`;
  }
});

// Router mounted on attemptsRouter at '/:attemptId/events'
export const attemptEventsRouter = Router({ mergeParams: true });
attemptEventsRouter.post('/', authenticate, requireRole('STUDENT'), antiTamperMiddleware, proctoringRateLimiter, handleIngestEvents);
attemptEventsRouter.get('/', authenticate, handleGetAttemptTimeline);

// Router mounted on attemptsRouter at '/:attemptId/proctoring/flags'
export const attemptProctoringFlagsRouter = Router({ mergeParams: true });
attemptProctoringFlagsRouter.post('/', authenticate, requireRole('INVIGILATOR', 'FACULTY', 'ADMIN'), handleCreateManualFlag);
attemptProctoringFlagsRouter.patch('/:flagId', authenticate, requireRole('INVIGILATOR', 'FACULTY', 'ADMIN'), handleUpdateFlagStatus);

// Handler for session proctoring summary
export { handleGetSessionSummary };
