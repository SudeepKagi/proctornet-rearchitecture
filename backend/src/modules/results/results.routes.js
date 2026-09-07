/**
 * @file results.routes.js
 * @description Express routers for Candidate Results and Staff Exam Results.
 * Conforms to Step 13.5 and Phase 9 specifications.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import {
  getCandidateResult,
  getExamResults,
  getExamResultsSummary,
  publishExamResults,
  updateReleasePolicy
} from './results.controller.js';

/**
 * Candidate result router mounted at /attempts/:attemptId/result
 */
export const candidateResultsRouter = Router({ mergeParams: true });
candidateResultsRouter.get('/', authenticate, requireRole('STUDENT'), getCandidateResult);

/**
 * Staff exam results router mounted at /exams/:examId/results
 */
export const examResultsRouter = Router({ mergeParams: true });

// Summary statistics endpoint (placed before root to avoid route conflict)
examResultsRouter.get(
  '/summary',
  authenticate,
  requireRole('FACULTY', 'ADMIN', 'INVIGILATOR'),
  getExamResultsSummary
);

// Manual administrative publication
examResultsRouter.post(
  '/publish',
  authenticate,
  requireRole('FACULTY', 'ADMIN'),
  publishExamResults
);

// Result release policy and schedule update
examResultsRouter.patch(
  '/policy',
  authenticate,
  requireRole('FACULTY', 'ADMIN'),
  updateReleasePolicy
);

// List evaluated results for exam
examResultsRouter.get(
  '/',
  authenticate,
  requireRole('FACULTY', 'ADMIN', 'INVIGILATOR'),
  getExamResults
);
