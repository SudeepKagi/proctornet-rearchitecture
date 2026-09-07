/**
 * @file answers.routes.js
 * @description Express router for Exam Answers, Autosave, OCC Revisions, and Clear operations.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { createRateLimiter } from '../../middleware/rateLimiter.js';
import {
  saveAnswer,
  clearAnswer,
  batchSaveAnswers,
  getAnswersForAttempt
} from './answers.controller.js';

export const answersRouter = Router({ mergeParams: true });

// Rate limiter for autosave and batch answer modification (60 requests per 60s per candidate attempt)
const answerSaveRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Answer autosave rate limit exceeded. Please wait a moment before modifying answers.',
  keyGenerator: (req) => {
    const userId = req.user?.userId || 'unknown';
    const attemptId = req.params?.attemptId || 'unknown';
    return `v1:ratelimit:answers:${userId}:${attemptId}`;
  }
});

// Candidate-only write endpoints (STUDENT role)
answersRouter.put('/:attemptQuestionId', authenticate, requireRole('STUDENT'), answerSaveRateLimiter, saveAnswer);
answersRouter.delete('/:attemptQuestionId', authenticate, requireRole('STUDENT'), clearAnswer);
answersRouter.post('/batch', authenticate, requireRole('STUDENT'), answerSaveRateLimiter, batchSaveAnswers);

// Inspection endpoint (STUDENT owner, FACULTY creator, INVIGILATOR, ADMIN)
answersRouter.get('/', authenticate, getAnswersForAttempt);
