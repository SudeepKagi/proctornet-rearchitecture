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

export const attemptsRouter = Router();

// Candidate attempt-start alias
attemptsRouter.post('/start', authenticate, requireRole('STUDENT'), startAttempt);

// Phase 7: Answers, Autosave, OCC Revisions & Clear
attemptsRouter.use('/:attemptId/answers', answersRouter);

// Attempt inspection & question mapping endpoints
attemptsRouter.get('/:attemptId', authenticate, getAttemptById);
attemptsRouter.get('/:attemptId/questions', authenticate, getAttemptQuestions);
