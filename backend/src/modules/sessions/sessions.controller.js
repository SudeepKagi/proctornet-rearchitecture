/**
 * @file sessions.controller.js
 * @description HTTP request handlers for Exam Sessions, Scheduling, Rosters, and Invigilation.
 */

import { BadRequestError, ForbiddenError } from '../../utils/errors.js';
import { getIceServersForSession, authorizeParticipant } from '../../infrastructure/media/index.js';
import {
  createSessionSchema,
  updateSessionSchema,
  assignStudentsSchema,
  assignInvigilatorSchema,
  sessionQuerySchema,
  createRoomSchema
} from './sessions.schemas.js';
import * as sessionsService from './sessions.service.js';

/**
 * Handles creating and scheduling an exam session.
 */
export async function handleCreateSession(req, res, next) {
  try {
    const parseResult = createSessionSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid session scheduling data', parseResult.error.format());
    }

    const requestId = req.id || req.requestId;
    const session = await sessionsService.createSession(parseResult.data, req.user, requestId);

    res.status(201).json({
      status: 'success',
      data: { session }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles retrieving full session details by ID.
 */
export async function handleGetSession(req, res, next) {
  try {
    const { id } = req.params;
    const session = await sessionsService.getSessionById(id, req.user);

    res.status(200).json({
      status: 'success',
      data: { session }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles updating session schedule or room.
 */
export async function handleUpdateSession(req, res, next) {
  try {
    const { id } = req.params;
    const parseResult = updateSessionSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid session update data', parseResult.error.format());
    }

    const requestId = req.id || req.requestId;
    const updatedSession = await sessionsService.updateSession(id, parseResult.data, req.user, requestId);

    res.status(200).json({
      status: 'success',
      data: { session: updatedSession }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles listing exam sessions with filtering and pagination.
 */
export async function handleListSessions(req, res, next) {
  try {
    const parseResult = sessionQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid query parameters', parseResult.error.format());
    }

    const result = await sessionsService.listSessions(parseResult.data, req.user);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles assigning candidate students to a session roster.
 */
export async function handleAssignStudents(req, res, next) {
  try {
    const { id } = req.params;
    const parseResult = assignStudentsSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid student assignment data', parseResult.error.format());
    }

    const requestId = req.id || req.requestId;
    const result = await sessionsService.assignStudents(id, parseResult.data.student_ids, req.user, requestId);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles removing a candidate student from a session roster.
 */
export async function handleRemoveStudent(req, res, next) {
  try {
    const { id, studentId } = req.params;
    const requestId = req.id || req.requestId;

    await sessionsService.removeStudent(id, studentId, req.user, requestId);

    res.status(200).json({
      status: 'success',
      message: 'Student removed from session roster successfully'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles assigning or updating an invigilator for an exam session.
 */
export async function handleAssignInvigilator(req, res, next) {
  try {
    const { id } = req.params;
    const parseResult = assignInvigilatorSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid invigilator assignment data', parseResult.error.format());
    }

    const requestId = req.id || req.requestId;
    const assignment = await sessionsService.assignInvigilator(id, parseResult.data, req.user, requestId);

    res.status(201).json({
      status: 'success',
      data: { assignment }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles removing an invigilator from an exam session.
 */
export async function handleRemoveInvigilator(req, res, next) {
  try {
    const { id, userId } = req.params;
    const requestId = req.id || req.requestId;

    await sessionsService.removeInvigilator(id, userId, req.user, requestId);

    res.status(200).json({
      status: 'success',
      message: 'Invigilator removed from session successfully'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles creating a new examination room.
 */
export async function handleCreateRoom(req, res, next) {
  try {
    const parseResult = createRoomSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid room data', parseResult.error.format());
    }

    const requestId = req.id || req.requestId;
    const room = await sessionsService.createRoom(parseResult.data, req.user, requestId);

    res.status(201).json({
      status: 'success',
      data: { room }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles listing all rooms.
 */
export async function handleListRooms(req, res, next) {
  try {
    const rooms = await sessionsService.listRooms();

    res.status(200).json({
      status: 'success',
      data: { rooms }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles retrieving ephemeral STUN/TURN ICE server credentials for an authorized session participant.
 */
export async function handleGetIceServers(req, res, next) {
  try {
    const sessionId = req.params.id || req.params.sessionId;
    const user = req.user;

    const direction = user.roles?.includes('STUDENT') ? 'send' : 'recv';
    const auth = await authorizeParticipant({
      sessionId,
      userId: user.userId,
      roles: user.roles,
      direction
    });

    if (!auth.authorized) {
      throw new ForbiddenError(`Access denied: not authorized for session media (${auth.reason})`);
    }

    const iceData = getIceServersForSession(sessionId, user);

    res.status(200).json({
      status: 'success',
      data: iceData
    });
  } catch (err) {
    next(err);
  }
}
