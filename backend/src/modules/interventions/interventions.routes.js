/**
 * @file interventions.routes.js
 * @description Express routes for invigilator realtime interventions.
 * Conforms to Phase 26 Track 2 Workstream F.
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/authorize.js';
import {
  handleBroadcastAnnouncement,
  handleSendCandidateMessage,
  handlePauseAttempt,
  handleResumeAttempt,
  handleTerminateAttempt,
  handleGetSessionInterventions,
  handleGetAttemptInterventions,
  handleReportIncident,
  handleGetSessionIncidents,
  handleSignOffSession,
  handleGetSessionSignOffStatus
} from './interventions.controller.js';

export const interventionsRouter = Router();

// Session interventions
interventionsRouter.post(
  '/sessions/:sessionId/announcements',
  requireRole('INVIGILATOR', 'ADMIN'),
  handleBroadcastAnnouncement
);

interventionsRouter.get(
  '/sessions/:sessionId/history',
  requireRole('INVIGILATOR', 'ADMIN'),
  handleGetSessionInterventions
);

// Incident reporting
interventionsRouter.post(
  '/sessions/:sessionId/incidents',
  requireRole('INVIGILATOR', 'ADMIN'),
  handleReportIncident
);

interventionsRouter.get(
  '/sessions/:sessionId/incidents',
  requireRole('INVIGILATOR', 'ADMIN'),
  handleGetSessionIncidents
);

// Session Sign-off & Closure
interventionsRouter.post(
  '/sessions/:sessionId/sign-off',
  requireRole('INVIGILATOR', 'ADMIN'),
  handleSignOffSession
);

interventionsRouter.get(
  '/sessions/:sessionId/sign-off',
  requireRole('INVIGILATOR', 'ADMIN'),
  handleGetSessionSignOffStatus
);

// Individual candidate interventions
interventionsRouter.post(
  '/attempts/:attemptId/message',
  requireRole('INVIGILATOR', 'ADMIN'),
  handleSendCandidateMessage
);

interventionsRouter.post(
  '/attempts/:attemptId/pause',
  requireRole('INVIGILATOR', 'ADMIN'),
  handlePauseAttempt
);

interventionsRouter.post(
  '/attempts/:attemptId/resume',
  requireRole('INVIGILATOR', 'ADMIN'),
  handleResumeAttempt
);

interventionsRouter.post(
  '/attempts/:attemptId/terminate',
  requireRole('INVIGILATOR', 'ADMIN'),
  handleTerminateAttempt
);

interventionsRouter.get(
  '/attempts/:attemptId/history',
  handleGetAttemptInterventions
);

