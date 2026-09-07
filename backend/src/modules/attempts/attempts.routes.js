/**
 * @file attempts.routes.js
 * @description Express router for Exam Attempts and Question Mapping endpoints.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import {
  startAttempt,
  getAttemptById,
  getAttemptQuestions
} from './attempts.controller.js';
import { answersRouter } from '../answers/answers.routes.js';
import { submitAttempt } from '../submissions/submissions.controller.js';
import { candidateResultsRouter } from '../results/results.routes.js';
import { createRateLimiter } from '../../middleware/rateLimiter.js';

export const attemptsRouter = Router();

// Submission rate limiter: 5 requests per 60s per candidate attempt
const submitRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Submission rate limit exceeded. Please wait a moment before attempting to submit again.',
  keyGenerator: (req) => {
    const userId = req.user?.userId || 'unknown';
    const attemptId = req.params?.attemptId || 'unknown';
    return `v1:ratelimit:submit:${userId}:${attemptId}`;
  }
});

// Candidate attempt-start alias
attemptsRouter.post('/start', authenticate, requireRole('STUDENT'), startAttempt);

// Phase 7: Answers, Autosave, OCC Revisions & Clear
attemptsRouter.use('/:attemptId/answers', answersRouter);

// Phase 8: Candidate Exam Submission & Finalization
attemptsRouter.post('/:attemptId/submit', authenticate, requireRole('STUDENT'), submitRateLimiter, submitAttempt);

// Phase 9: Candidate Result Inspection
attemptsRouter.use('/:attemptId/result', candidateResultsRouter);

// Attempt inspection & question mapping endpoints
attemptsRouter.get('/:attemptId', authenticate, getAttemptById);
attemptsRouter.get('/:attemptId/questions', authenticate, getAttemptQuestions);
