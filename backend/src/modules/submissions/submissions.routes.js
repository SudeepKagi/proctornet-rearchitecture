/**
 * @file submissions.routes.js
 * @description Express router for Exam Submissions and Finalization endpoints.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { submitAttempt } from './submissions.controller.js';

export const submissionsRouter = Router({ mergeParams: true });

// Candidate-only submission endpoint (STUDENT role)
submissionsRouter.post('/', authenticate, requireRole('STUDENT'), submitAttempt);
