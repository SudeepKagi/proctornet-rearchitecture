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
  requireRole('INVIGILATOR', 'FACULTY', 'ADMIN'),
  handleBroadcastAnnouncement
);

interventionsRouter.get(
  '/sessions/:sessionId/history',
  requireRole('INVIGILATOR', 'FACULTY', 'ADMIN'),
  handleGetSessionInterventions
);

// Incident reporting
interventionsRouter.post(
  '/sessions/:sessionId/incidents',
  requireRole('INVIGILATOR', 'FACULTY', 'ADMIN'),
  handleReportIncident
);

interventionsRouter.get(
  '/sessions/:sessionId/incidents',
  requireRole('INVIGILATOR', 'FACULTY', 'ADMIN'),
  handleGetSessionIncidents
);

// Session Sign-off & Closure
interventionsRouter.post(
  '/sessions/:sessionId/sign-off',
  requireRole('INVIGILATOR', 'FACULTY', 'ADMIN'),
  handleSignOffSession
);

interventionsRouter.get(
  '/sessions/:sessionId/sign-off',
  requireRole('INVIGILATOR', 'FACULTY', 'ADMIN'),
  handleGetSessionSignOffStatus
);

// Individual candidate interventions
interventionsRouter.post(
  '/attempts/:attemptId/message',
  requireRole('INVIGILATOR', 'FACULTY', 'ADMIN'),
  handleSendCandidateMessage
);

interventionsRouter.post(
  '/attempts/:attemptId/pause',
  requireRole('INVIGILATOR', 'FACULTY', 'ADMIN'),
  handlePauseAttempt
);

interventionsRouter.post(
  '/attempts/:attemptId/resume',
  requireRole('INVIGILATOR', 'FACULTY', 'ADMIN'),
  handleResumeAttempt
);

interventionsRouter.post(
  '/attempts/:attemptId/terminate',
  requireRole('INVIGILATOR', 'FACULTY', 'ADMIN'),
  handleTerminateAttempt
);

interventionsRouter.get(
  '/attempts/:attemptId/history',
  handleGetAttemptInterventions
);

