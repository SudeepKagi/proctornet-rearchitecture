/**
 * @file interventions.routes.js
 * @description Express routes for invigilator realtime interventions.
 * Express router for live invigilation intervention endpoints.
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
  requireRole('FACULTY', 'ADMIN'),
  handleBroadcastAnnouncement
);

interventionsRouter.get(
  '/sessions/:sessionId/history',
  requireRole('FACULTY', 'ADMIN'),
  handleGetSessionInterventions
);

// Incident reporting
interventionsRouter.post(
  '/sessions/:sessionId/incidents',
  requireRole('FACULTY', 'ADMIN'),
  handleReportIncident
);

interventionsRouter.get(
  '/sessions/:sessionId/incidents',
  requireRole('FACULTY', 'ADMIN'),
  handleGetSessionIncidents
);

// Session Sign-off & Closure
interventionsRouter.post(
  '/sessions/:sessionId/sign-off',
  requireRole('FACULTY', 'ADMIN'),
  handleSignOffSession
);

interventionsRouter.get(
  '/sessions/:sessionId/sign-off',
  requireRole('FACULTY', 'ADMIN'),
  handleGetSessionSignOffStatus
);

// Individual candidate interventions
interventionsRouter.post(
  '/attempts/:attemptId/message',
  requireRole('FACULTY', 'ADMIN'),
  handleSendCandidateMessage
);

interventionsRouter.post(
  '/attempts/:attemptId/pause',
  requireRole('FACULTY', 'ADMIN'),
  handlePauseAttempt
);

interventionsRouter.post(
  '/attempts/:attemptId/resume',
  requireRole('FACULTY', 'ADMIN'),
  handleResumeAttempt
);

interventionsRouter.post(
  '/attempts/:attemptId/terminate',
  requireRole('FACULTY', 'ADMIN'),
  handleTerminateAttempt
);

interventionsRouter.get(
  '/attempts/:attemptId/history',
  handleGetAttemptInterventions
);

