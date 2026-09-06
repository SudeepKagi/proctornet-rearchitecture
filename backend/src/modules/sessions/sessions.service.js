/**
 * @file sessions.service.js
 * @description Business workflow service for Exam Sessions, Scheduling, Candidate Rosters, and Invigilators.
 */

import { getPool } from '../../infrastructure/postgres/pool.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError
} from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { ExamStatus } from '../../domain/exam/examStates.js';
import { transitionExamState } from '../../domain/exam/examStateMachine.js';
import * as sessionsRepo from './sessions.repository.js';
import * as examsRepo from '../exams/exams.repository.js';

/**
 * Creates and schedules an exam session.
 * Handles multi-session lifecycle:
 * - If exam is PUBLISHED, transitions it to SCHEDULED.
 * - If exam is SCHEDULED, keeps it as SCHEDULED.
 * @param {object} payload
 * @param {object} user - Authenticated user context
 * @param {string} [requestId]
 * @returns {Promise<object>} Created session
 */
export async function createSession(payload, user, requestId = null) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock and fetch exam
    const exam = await examsRepo.findExamByIdForUpdate(payload.exam_id, client);
    if (!exam) {
      throw new NotFoundError(`Exam with ID '${payload.exam_id}' not found`);
    }

    // 2. Ownership / RBAC check: Creator or ADMIN
    const isOwner = exam.created_by === user.userId;
    const isAdmin = (user.roles || []).includes('ADMIN');
    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('Access denied: You do not have permission to schedule sessions for this exam');
    }

    // 3. State Machine & Lifecycle Validation
    if (exam.status === ExamStatus.PUBLISHED) {
      // First session transitions exam to SCHEDULED
      const nextStatus = transitionExamState(exam.status, ExamStatus.SCHEDULED);
      await examsRepo.updateExam(exam.exam_id, { status: nextStatus }, client);
    } else if (exam.status === ExamStatus.SCHEDULED) {
      // Multi-session scheduling: exam is already scheduled, stays in SCHEDULED
    } else {
      throw new BadRequestError(
        `Cannot schedule session: Exam is in '${exam.status}' state. Only 'PUBLISHED' or 'SCHEDULED' exams can be scheduled.`
      );
    }

    // 4. Server-time window validation
    const startTime = new Date(payload.scheduled_start_time);
    const endTime = new Date(payload.scheduled_end_time);

    if (endTime <= startTime) {
      throw new BadRequestError('Scheduled end time must be strictly after scheduled start time');
    }

    const windowMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
    if (windowMinutes < Number(exam.duration_minutes)) {
      throw new BadRequestError(
        `Scheduled time window (${Math.round(windowMinutes)} min) is shorter than the exam duration (${exam.duration_minutes} min)`
      );
    }

    // 5. Room validation if room_id is specified
    if (payload.room_id) {
      const room = await sessionsRepo.findRoomById(payload.room_id, client);
      if (!room) {
        throw new NotFoundError(`Room with ID '${payload.room_id}' not found`);
      }
    }

    // 6. Insert session
    const session = await sessionsRepo.createSession(
      {
        examId: payload.exam_id,
        roomId: payload.room_id || null,
        scheduledStartTime: startTime.toISOString(),
        scheduledEndTime: endTime.toISOString()
      },
      client
    );

    // 7. Audit log
    await sessionsRepo.createAuditLog(
      {
        actorUserId: user.userId,
        action: 'SESSION_CREATED',
        resourceType: 'SESSION',
        resourceId: session.session_id,
        requestId,
        metadata: {
          examId: session.exam_id,
          roomId: session.room_id,
          startTime: session.scheduled_start_time,
          endTime: session.scheduled_end_time
        }
      },
      client
    );

    await client.query('COMMIT');
    logger.info({ sessionId: session.session_id, examId: payload.exam_id }, 'Exam session created successfully');
    return session;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieves full session details including enrolled students and invigilators.
 * @param {string} sessionId
 * @param {object} user
 * @returns {Promise<object>}
 */
export async function getSessionById(sessionId, user) {
  const session = await sessionsRepo.findSessionById(sessionId);
  if (!session) {
    throw new NotFoundError(`Exam session with ID '${sessionId}' not found`);
  }

  const isStudent = (user.roles || []).includes('STUDENT') && !(user.roles || []).includes('ADMIN') && !(user.roles || []).includes('FACULTY');
  if (isStudent) {
    const studentIds = await sessionsRepo.getSessionStudentIds(sessionId);
    if (!studentIds.includes(user.userId)) {
      throw new ForbiddenError('Access denied: You are not assigned to this exam session');
    }
  }

  const [students, invigilators] = await Promise.all([
    sessionsRepo.getSessionStudents(sessionId),
    sessionsRepo.getSessionInvigilators(sessionId)
  ]);

  return {
    ...session,
    students,
    invigilators
  };
}

/**
 * Updates session schedule or room configuration.
 * @param {string} sessionId
 * @param {object} updates
 * @param {object} user
 * @param {string} [requestId]
 * @returns {Promise<object>}
 */
export async function updateSession(sessionId, updates, user, requestId = null) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const session = await sessionsRepo.findSessionByIdForUpdate(sessionId, client);
    if (!session) {
      throw new NotFoundError(`Exam session with ID '${sessionId}' not found`);
    }

    const exam = await examsRepo.findExamByIdForUpdate(session.exam_id, client);
    if (!exam) {
      throw new NotFoundError(`Associated exam with ID '${session.exam_id}' not found`);
    }

    const isOwner = exam.created_by === user.userId;
    const isAdmin = (user.roles || []).includes('ADMIN');
    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('Access denied: You do not have permission to update this exam session');
    }

    if (session.status !== 'SCHEDULED') {
      throw new BadRequestError(
        `Cannot modify session in '${session.status}' state. Only 'SCHEDULED' sessions can be modified.`
      );
    }

    // Validate new timing if provided
    const newStartStr = updates.scheduled_start_time || session.scheduled_start_time;
    const newEndStr = updates.scheduled_end_time || session.scheduled_end_time;
    const startTime = new Date(newStartStr);
    const endTime = new Date(newEndStr);

    if (endTime <= startTime) {
      throw new BadRequestError('Scheduled end time must be strictly after scheduled start time');
    }

    const windowMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
    if (windowMinutes < Number(exam.duration_minutes)) {
      throw new BadRequestError(
        `Scheduled time window (${Math.round(windowMinutes)} min) is shorter than the exam duration (${exam.duration_minutes} min)`
      );
    }

    // Validate room capacity if changing room
    if (updates.room_id !== undefined && updates.room_id !== null) {
      const room = await sessionsRepo.findRoomByIdForUpdate(updates.room_id, client);
      if (!room) {
        throw new NotFoundError(`Room with ID '${updates.room_id}' not found`);
      }

      const enrolledCount = await sessionsRepo.countSessionStudents(sessionId, client);
      if (enrolledCount > room.capacity) {
        throw new ConflictError(
          `Cannot assign room '${room.name}': Room capacity (${room.capacity}) is less than current student roster (${enrolledCount})`
        );
      }
    }

    const updatedSession = await sessionsRepo.updateSession(sessionId, updates, client);

    await sessionsRepo.createAuditLog(
      {
        actorUserId: user.userId,
        action: 'SESSION_UPDATED',
        resourceType: 'SESSION',
        resourceId: sessionId,
        requestId,
        metadata: { updates }
      },
      client
    );

    await client.query('COMMIT');
    logger.info({ sessionId, updatedBy: user.userId }, 'Exam session updated');
    return updatedSession;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Assigns student candidates to a session roster with strict transactional room capacity checks.
 * @param {string} sessionId
 * @param {string[]} studentIds
 * @param {object} user
 * @param {string} [requestId]
 * @returns {Promise<object>} Summary { assignedCount, totalEnrolled }
 */
export async function assignStudents(sessionId, studentIds, user, requestId = null) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock session
    const session = await sessionsRepo.findSessionByIdForUpdate(sessionId, client);
    if (!session) {
      throw new NotFoundError(`Exam session with ID '${sessionId}' not found`);
    }

    // 2. Lock exam and verify ownership
    const exam = await examsRepo.findExamByIdForUpdate(session.exam_id, client);
    if (!exam) {
      throw new NotFoundError(`Associated exam with ID '${session.exam_id}' not found`);
    }

    const isOwner = exam.created_by === user.userId;
    const isAdmin = (user.roles || []).includes('ADMIN');
    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('Access denied: You do not have permission to assign students to this session');
    }

    if (session.status !== 'SCHEDULED') {
      throw new BadRequestError(
        `Cannot assign candidates to session in '${session.status}' state. Only 'SCHEDULED' sessions can receive candidate assignments.`
      );
    }

    // 3. Deduplicate candidate IDs
    const uniqueStudentIds = [...new Set(studentIds)];

    // 4. Verify all students exist in users table
    const existingUsers = await sessionsRepo.findUsersByIds(uniqueStudentIds, client);
    if (existingUsers.length !== uniqueStudentIds.length) {
      const foundIds = existingUsers.map((u) => u.user_id);
      const missingIds = uniqueStudentIds.filter((id) => !foundIds.includes(id));
      throw new BadRequestError(
        `One or more candidate user IDs do not exist in the system: ${missingIds.join(', ')}`
      );
    }

    // 5. Room capacity verification with row locking
    const currentlyEnrolledIds = await sessionsRepo.getSessionStudentIds(sessionId, client);
    const newlyAddingIds = uniqueStudentIds.filter((id) => !currentlyEnrolledIds.includes(id));

    if (session.room_id) {
      const room = await sessionsRepo.findRoomByIdForUpdate(session.room_id, client);
      if (room) {
        const projectedTotal = currentlyEnrolledIds.length + newlyAddingIds.length;
        if (projectedTotal > room.capacity) {
          throw new ConflictError(
            `Cannot assign candidates: Room capacity (${room.capacity}) exceeded. Currently enrolled: ${currentlyEnrolledIds.length}, attempting to add: ${newlyAddingIds.length}`
          );
        }
      }
    }

    // 6. Batch insert students
    const insertedIds = await sessionsRepo.assignStudentsToSession(sessionId, newlyAddingIds, client);
    const totalEnrolled = currentlyEnrolledIds.length + insertedIds.length;

    // 7. Audit log
    await sessionsRepo.createAuditLog(
      {
        actorUserId: user.userId,
        action: 'SESSION_STUDENTS_ASSIGNED',
        resourceType: 'SESSION',
        resourceId: sessionId,
        requestId,
        metadata: {
          requestedCount: uniqueStudentIds.length,
          newlyAssignedCount: insertedIds.length,
          totalEnrolled
        }
      },
      client
    );

    await client.query('COMMIT');
    logger.info(
      { sessionId, newlyAssigned: insertedIds.length, totalEnrolled },
      'Candidates assigned to exam session'
    );

    return {
      assigned_count: insertedIds.length,
      total_enrolled: totalEnrolled
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Removes a candidate student from a session roster.
 * @param {string} sessionId
 * @param {string} studentId
 * @param {object} user
 * @param {string} [requestId]
 * @returns {Promise<void>}
 */
export async function removeStudent(sessionId, studentId, user, requestId = null) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const session = await sessionsRepo.findSessionByIdForUpdate(sessionId, client);
    if (!session) {
      throw new NotFoundError(`Exam session with ID '${sessionId}' not found`);
    }

    const exam = await examsRepo.findExamByIdForUpdate(session.exam_id, client);
    if (!exam) {
      throw new NotFoundError(`Associated exam with ID '${session.exam_id}' not found`);
    }

    const isOwner = exam.created_by === user.userId;
    const isAdmin = (user.roles || []).includes('ADMIN');
    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('Access denied: You do not have permission to remove students from this session');
    }

    if (session.status !== 'SCHEDULED') {
      throw new BadRequestError(
        `Cannot remove candidates from session in '${session.status}' state. Only 'SCHEDULED' sessions can be modified.`
      );
    }

    const removed = await sessionsRepo.removeStudentFromSession(sessionId, studentId, client);
    if (!removed) {
      throw new NotFoundError(`Student with ID '${studentId}' is not assigned to this exam session`);
    }

    await sessionsRepo.createAuditLog(
      {
        actorUserId: user.userId,
        action: 'SESSION_STUDENT_REMOVED',
        resourceType: 'SESSION',
        resourceId: sessionId,
        requestId,
        metadata: { studentId }
      },
      client
    );

    await client.query('COMMIT');
    logger.info({ sessionId, studentId }, 'Candidate removed from exam session');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Assigns or updates an invigilator for an exam session.
 * @param {string} sessionId
 * @param {object} payload
 * @param {string} payload.userId
 * @param {string} payload.role
 * @param {object} user
 * @param {string} [requestId]
 * @returns {Promise<object>}
 */
export async function assignInvigilator(sessionId, payload, user, requestId = null) {
  const targetUserId = payload.user_id || payload.userId;
  const role = payload.role || 'PRIMARY';
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const session = await sessionsRepo.findSessionByIdForUpdate(sessionId, client);
    if (!session) {
      throw new NotFoundError(`Exam session with ID '${sessionId}' not found`);
    }

    const exam = await examsRepo.findExamByIdForUpdate(session.exam_id, client);
    if (!exam) {
      throw new NotFoundError(`Associated exam with ID '${session.exam_id}' not found`);
    }

    const isOwner = exam.created_by === user.userId;
    const isAdmin = (user.roles || []).includes('ADMIN');
    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('Access denied: You do not have permission to assign invigilators to this session');
    }

    // Verify user exists
    const users = await sessionsRepo.findUsersByIds([targetUserId], client);
    if (!users || users.length === 0) {
      throw new NotFoundError(`Invigilator user with ID '${targetUserId}' not found`);
    }

    // Verify user has eligible role (FACULTY, INVIGILATOR, PROCTOR, or ADMIN)
    const roles = await sessionsRepo.findUserRoles(targetUserId, client);
    const isEligible = roles.some((r) => ['FACULTY', 'INVIGILATOR', 'PROCTOR', 'ADMIN'].includes(r));
    if (!isEligible) {
      throw new BadRequestError(
        `Cannot assign user as invigilator: User must possess FACULTY, INVIGILATOR, or ADMIN role. User roles: [${roles.join(', ')}]`
      );
    }

    const assignment = await sessionsRepo.assignInvigilatorToSession(sessionId, targetUserId, role, client);

    await sessionsRepo.createAuditLog(
      {
        actorUserId: user.userId,
        action: 'SESSION_INVIGILATOR_ASSIGNED',
        resourceType: 'SESSION',
        resourceId: sessionId,
        requestId,
        metadata: { invigilatorUserId: targetUserId, role }
      },
      client
    );

    await client.query('COMMIT');
    logger.info({ sessionId, invigilatorUserId: targetUserId, role }, 'Invigilator assigned to exam session');
    return assignment;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Removes an invigilator from an exam session.
 * @param {string} sessionId
 * @param {string} invigilatorUserId
 * @param {object} user
 * @param {string} [requestId]
 * @returns {Promise<void>}
 */
export async function removeInvigilator(sessionId, invigilatorUserId, user, requestId = null) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const session = await sessionsRepo.findSessionByIdForUpdate(sessionId, client);
    if (!session) {
      throw new NotFoundError(`Exam session with ID '${sessionId}' not found`);
    }

    const exam = await examsRepo.findExamByIdForUpdate(session.exam_id, client);
    if (!exam) {
      throw new NotFoundError(`Associated exam with ID '${session.exam_id}' not found`);
    }

    const isOwner = exam.created_by === user.userId;
    const isAdmin = (user.roles || []).includes('ADMIN');
    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('Access denied: You do not have permission to remove invigilators from this session');
    }

    const removed = await sessionsRepo.removeInvigilatorFromSession(sessionId, invigilatorUserId, client);
    if (!removed) {
      throw new NotFoundError(`Invigilator with ID '${invigilatorUserId}' is not assigned to this session`);
    }

    await sessionsRepo.createAuditLog(
      {
        actorUserId: user.userId,
        action: 'SESSION_INVIGILATOR_REMOVED',
        resourceType: 'SESSION',
        resourceId: sessionId,
        requestId,
        metadata: { invigilatorUserId }
      },
      client
    );

    await client.query('COMMIT');
    logger.info({ sessionId, invigilatorUserId }, 'Invigilator removed from exam session');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lists exam sessions with filtering and pagination.
 * @param {object} params
 * @param {object} user
 * @returns {Promise<object>}
 */
export async function listSessions(params, user) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const offset = (page - 1) * limit;

  const queryParams = {
    examId: params.exam_id,
    roomId: params.room_id,
    status: params.status,
    limit,
    offset
  };

  const [sessions, total] = await Promise.all([
    sessionsRepo.listSessions(queryParams),
    sessionsRepo.countSessions(queryParams)
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    sessions,
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  };
}

/**
 * Creates a new physical or virtual room.
 * @param {object} payload
 * @param {object} user
 * @param {string} [requestId]
 * @returns {Promise<object>}
 */
export async function createRoom(payload, user, requestId = null) {
  const room = await sessionsRepo.createRoom({
    name: payload.name,
    capacity: payload.capacity,
    building: payload.building,
    metadata: payload.metadata || {}
  });

  await sessionsRepo.createAuditLog({
    actorUserId: user.userId,
    action: 'ROOM_CREATED',
    resourceType: 'ROOM',
    resourceId: room.room_id,
    requestId,
    metadata: { name: room.name, capacity: room.capacity }
  });

  return room;
}

/**
 * Lists all configured rooms.
 * @returns {Promise<object[]>}
 */
export async function listRooms() {
  return sessionsRepo.listRooms();
}
