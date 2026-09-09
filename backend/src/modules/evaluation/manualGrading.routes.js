/**
 * @file manualGrading.routes.js
 * @description Express routes for Manual Grading and Score Overrides.
 * Mounted at /api/v1/results
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import {
  handleGetEvaluation,
  handleSubmitGrade,
  handleGetAudits
} from './manualGrading.controller.js';

export const manualGradingRouter = Router();

// Gated for FACULTY and ADMIN
manualGradingRouter.use(authenticate, requireRole('FACULTY', 'ADMIN'));

manualGradingRouter.get('/:resultId/evaluation', handleGetEvaluation);
manualGradingRouter.post('/:resultId/manual-grade', handleSubmitGrade);
manualGradingRouter.get('/:resultId/manual-grade/audits', handleGetAudits);
