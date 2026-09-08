/**
 * @file evidence.routes.js
 * @description Express router for Phase 15 Evidence Storage endpoints.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { createRateLimiter } from '../../middleware/rateLimiter.js';
import {
  handleRequestUploadUrl,
  handleConfirmUpload,
  handleListEvidence,
  handleGetPlaybackUrl,
  handleDeleteEvidence
} from './evidence.controller.js';

// Sliding-window rate limiter: max 30 requests per minute per candidate attempt
export const evidenceRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Evidence upload rate limit exceeded. Please wait before requesting or confirming more uploads.',
  keyGenerator: (req) => {
    const userId = req.user?.userId || 'unknown';
    const attemptId = req.params?.attemptId || 'unknown';
    return `v1:ratelimit:evidence:${userId}:${attemptId}`;
  }
});

export const evidenceRouter = Router({ mergeParams: true });

// 1. Candidate initiates direct S3 upload (presigned PUT)
evidenceRouter.post(
  '/upload-url',
  authenticate,
  requireRole('STUDENT'),
  evidenceRateLimiter,
  handleRequestUploadUrl
);

// 2. Candidate confirms direct S3 upload
evidenceRouter.post(
  '/:evidenceId/confirm',
  authenticate,
  requireRole('STUDENT'),
  evidenceRateLimiter,
  handleConfirmUpload
);

// 3. Staff lists evidence for attempt
evidenceRouter.get(
  '/',
  authenticate,
  requireRole('INVIGILATOR', 'FACULTY', 'ADMIN'),
  handleListEvidence
);

// 4. Staff retrieves presigned playback URL
evidenceRouter.get(
  '/:evidenceId/url',
  authenticate,
  requireRole('INVIGILATOR', 'FACULTY', 'ADMIN'),
  handleGetPlaybackUrl
);

// 5. Faculty / Admin purges evidence
evidenceRouter.delete(
  '/:evidenceId',
  authenticate,
  requireRole('FACULTY', 'ADMIN'),
  handleDeleteEvidence
);
