/**
 * @file sessions.routes.js
 * @description Express router for Exam Sessions, Scheduling, Rosters, and Invigilation.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import {
  handleCreateSession,
  handleGetSession,
  handleUpdateSession,
  handleListSessions,
  handleAssignStudents,
  handleRemoveStudent,
  handleAssignInvigilator,
  handleRemoveInvigilator,
  handleCreateRoom,
  handleListRooms,
  handleGetIceServers
} from './sessions.controller.js';
import { startAttempt, getMyAttempt } from '../attempts/attempts.controller.js';
import { handleGetSessionSummary } from '../proctoring/proctoring.routes.js';

export const sessionsRouter = Router();


// Room routes (placed before parameter routes)
sessionsRouter.get('/rooms', authenticate, handleListRooms);
sessionsRouter.post('/rooms', authenticate, requireRole('FACULTY', 'ADMIN'), handleCreateRoom);

// Session core routes
sessionsRouter.post('/', authenticate, requireRole('FACULTY', 'ADMIN'), handleCreateSession);
sessionsRouter.get('/', authenticate, handleListSessions);
sessionsRouter.get('/:id', authenticate, handleGetSession);
sessionsRouter.put('/:id', authenticate, requireRole('FACULTY', 'ADMIN'), handleUpdateSession);

// Phase 14: Session Proctoring Summary (Invigilator Console)
sessionsRouter.get('/:id/proctoring/summary', authenticate, handleGetSessionSummary);
sessionsRouter.get('/:sessionId/proctoring/summary', authenticate, handleGetSessionSummary);

// Phase 17: WebRTC STUN/TURN ICE Servers Endpoint
sessionsRouter.get('/:id/ice-servers', authenticate, handleGetIceServers);
sessionsRouter.get('/:sessionId/ice-servers', authenticate, handleGetIceServers);


// Session student roster routes
sessionsRouter.post('/:id/students', authenticate, requireRole('FACULTY', 'ADMIN'), handleAssignStudents);
sessionsRouter.delete('/:id/students/:studentId', authenticate, requireRole('FACULTY', 'ADMIN'), handleRemoveStudent);

// Session invigilator assignment routes
sessionsRouter.post('/:id/invigilators', authenticate, requireRole('FACULTY', 'ADMIN'), handleAssignInvigilator);
sessionsRouter.delete('/:id/invigilators/:userId', authenticate, requireRole('FACULTY', 'ADMIN'), handleRemoveInvigilator);

// Phase 6: Candidate Attempt Start & Status for Session
sessionsRouter.post('/:id/attempts', authenticate, requireRole('STUDENT'), startAttempt);
sessionsRouter.get('/:id/my-attempt', authenticate, requireRole('STUDENT'), getMyAttempt);
