/**
 * @file answers.routes.js
 * @description Express router for Exam Answers, Autosave, OCC Revisions, and Clear operations.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import {
  saveAnswer,
  clearAnswer,
  batchSaveAnswers,
  getAnswersForAttempt
} from './answers.controller.js';

export const answersRouter = Router({ mergeParams: true });

// Candidate-only write endpoints (STUDENT role)
answersRouter.put('/:attemptQuestionId', authenticate, requireRole('STUDENT'), saveAnswer);
answersRouter.delete('/:attemptQuestionId', authenticate, requireRole('STUDENT'), clearAnswer);
answersRouter.post('/batch', authenticate, requireRole('STUDENT'), batchSaveAnswers);

// Inspection endpoint (STUDENT owner, FACULTY creator, INVIGILATOR, ADMIN)
answersRouter.get('/', authenticate, getAnswersForAttempt);
