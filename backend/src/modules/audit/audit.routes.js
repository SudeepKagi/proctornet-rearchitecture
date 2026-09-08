/**
 * @file audit.routes.js
 * @description Express router for Audit Log inspection.
 * Strictly restricted to users with the ADMIN role.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import * as auditController from './audit.controller.js';

export const auditRouter = Router();

// GET /api/v1/audit-logs
auditRouter.get(
  '/',
  authenticate,
  requireRole('ADMIN', 'DEVELOPER'),
  auditController.handleGetAuditLogs
);
