/**
 * @file attempts.service.js
 * @description Business workflow service for Exam Attempts, Authoritative Server Timing, Deterministic Question Mapping, and Attempt Resumption.
 */

import { getPool } from '../../infrastructure/postgres/pool.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError
} from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { AttemptStatus } from '../../domain/attempt/attemptStates.js';
import { transitionAttemptState } from '../../domain/attempt/attemptStateMachine.js';
import { validateAttemptInvariants } from '../../domain/attempt/attemptInvariants.js';
import { generateSeed, selectQuestionsDeterministically } from './attempts.shuffler.js';
import * as attemptsRepo from './attempts.repository.js';
import * as studentConfigRepo from '../candidate/studentConfig.repository.js';
import { cacheService } from '../../infrastructure/redis/cacheService.js';
import { config } from '../../config/env.js';
import { deriveAttemptSigningKey } from '../../utils/antiTamper.js';

/**
 * Calculates authoritative remaining seconds for an attempt against PostgreSQL server time.
 * @param {string|Date} expiresAt
 * @param {string|Date} serverNow
 * @returns {number} Non-negative remaining seconds
 */
function calculateRemainingSeconds(expiresAt, serverNow) {
  const expiresMs = new Date(expiresAt).getTime();
  const nowMs = new Date(serverNow).getTime();
  return Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
}

/**
 * Checks and executes lazy on-access expiration for an active attempt.
 * @param {object} attempt
 * @param {string} actorUserId
 * @param {string} [requestId=null]
 * @returns {Promise<object>} The updated attempt
 */
async function checkAndApplyLazyExpiration(attempt, actorUserId, requestId = null) {
  if (attempt.status !== AttemptStatus.ACTIVE) {
    return attempt;
  }

  const serverNow = new Date(attempt.server_now || new Date());
  const expiresAt = new Date(attempt.expires_at);

  if (serverNow >= expiresAt) {
    const nextStatus = transitionAttemptState(attempt.status, AttemptStatus.EXPIRED);
    const updated = await attemptsRepo.updateAttemptStatus(attempt.attempt_id, nextStatus);

    await attemptsRepo.createAuditLog({
      actorUserId,
      action: 'ATTEMPT_EXPIRED',
      resourceType: 'ATTEMPT',
      resourceId: attempt.attempt_id,
      attemptId: attempt.attempt_id,
      requestId,
      metadata: {
        reason: 'Authoritative server deadline elapsed on access',
        expiresAt: attempt.expires_at,
        serverTime: serverNow.toISOString()
      }
    });

    logger.info(
      { attemptId: attempt.attempt_id, studentId: attempt.student_id },
      'Attempt transitioned to EXPIRED on access'
    );

    return updated || { ...attempt, status: AttemptStatus.EXPIRED };
  }

  return attempt;
}

/**
 * Verifies that the authenticated user has authorization to inspect an attempt (BOLA defense).
 * Allowed: Attempt Owner (STUDENT), Exam Creator (FACULTY), Assigned Proctor (INVIGILATOR), or ADMIN.
 * @param {object} attempt
 * @param {object} user - Authenticated user context { userId, roles }
 * @throws {ForbiddenError} If unauthorized
 */
async function assertCanAccessAttempt(attempt, user) {
  const isAdmin = (user.roles || []).includes('ADMIN');
  if (isAdmin) {
    return;
  }

  const isOwner = user.userId === attempt.student_id;
  if (isOwner) {
    return;
  }

  const isExamCreator = user.userId === attempt.exam_created_by;
  if (isExamCreator) {
    return;
  }

  const isInvigilator = await attemptsRepo.isUserInvigilatorForSession(attempt.session_id, user.userId);
  if (isInvigilator) {
    return;
  }

  throw new ForbiddenError('Access denied: You do not have permission to view this exam attempt');
}

/**
 * Starts a new exam attempt or returns existing active attempt (idempotent initialization).
 * Strictly candidate-only: caller must have STUDENT role and starts attempt for self.
 * @param {string} sessionId
 * @param {object} user - Authenticated student { userId, roles }
 * @param {string} [requestId=null]
 * @returns {Promise<object>} Created or resumed attempt summary
 */
export async function startAttempt(sessionId, user, requestId = null) {
  const isStudent = (user.roles || []).includes('STUDENT');
  if (!isStudent) {
    throw new ForbiddenError('Access denied: Only candidates with the STUDENT role can start exam attempts');
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock Session (FOR SHARE)
    const session = await attemptsRepo.findSessionById(sessionId, client, true);
    if (!session) {
      throw new NotFoundError(`Exam session with ID '${sessionId}' not found`);
    }

    if (!['SCHEDULED', 'ACTIVE'].includes(session.status)) {
      throw new BadRequestError(
        `Cannot start exam: Exam session is in '${session.status}' state. Only 'SCHEDULED' or 'ACTIVE' sessions can be started.`
      );
    }

    // 2. Lock Exam (FOR SHARE)
    const exam = await attemptsRepo.findExamById(session.exam_id, client, true);
    if (!exam) {
      throw new NotFoundError(`Associated exam with ID '${session.exam_id}' not found`);
    }

    if (!['PUBLISHED', 'SCHEDULED', 'LIVE'].includes(exam.status)) {
      throw new BadRequestError(
        `Cannot start exam: Exam is in '${exam.status}' state. It must be published or scheduled.`
      );
    }

    // 3. Lock Roster Row (FOR UPDATE)
    const sessionStudent = await attemptsRepo.findSessionStudentForUpdate(sessionId, user.userId, client);
    if (!sessionStudent) {
      throw new ForbiddenError('Access denied: You are not assigned to this exam session roster');
    }

    if (sessionStudent.status === 'DISQUALIFIED') {
      throw new ForbiddenError('Access denied: You have been disqualified from this exam session');
    }

    // 4. Server-Authoritative Timing Validation (PostgreSQL CURRENT_TIMESTAMP)
    const serverNow = new Date(session.server_now);
    const startTime = new Date(session.scheduled_start_time);
    const endTime = new Date(session.scheduled_end_time);

    if (serverNow < startTime) {
      throw new BadRequestError('Cannot start exam: Scheduled exam session window has not opened yet');
    }

    if (serverNow >= endTime) {
      throw new BadRequestError('Cannot start exam: Scheduled exam session window has closed');
    }

    // 5. Lock & Check Existing Attempt for (session_id, student_id)
    const existingAttempt = await attemptsRepo.findAttemptBySessionAndStudentForUpdate(sessionId, user.userId, client);

    if (existingAttempt) {
      // Check lazy expiration
      if (existingAttempt.status === AttemptStatus.ACTIVE) {
        const expiresAt = new Date(existingAttempt.expires_at);
        if (serverNow >= expiresAt) {
          const nextStatus = transitionAttemptState(existingAttempt.status, AttemptStatus.EXPIRED);
          await attemptsRepo.updateAttemptStatus(existingAttempt.attempt_id, nextStatus, client);

          await attemptsRepo.createAuditLog(
            {
              actorUserId: user.userId,
              action: 'ATTEMPT_EXPIRED',
              resourceType: 'ATTEMPT',
              resourceId: existingAttempt.attempt_id,
              attemptId: existingAttempt.attempt_id,
              requestId,
              metadata: { reason: 'Expired on start retry', serverTime: serverNow.toISOString() }
            },
            client
          );

          await client.query('COMMIT');
          throw new ConflictError('Cannot resume exam: Your exam attempt has expired');
        }

        // Active and valid: Idempotent return of existing attempt
        const totalQuestions = await attemptsRepo.countAttemptQuestions(existingAttempt.attempt_id, client);
        await client.query('COMMIT');

        logger.info(
          { attemptId: existingAttempt.attempt_id, studentId: user.userId, sessionId },
          'Existing active attempt resumed idempotently'
        );

        return {
          attempt_id: existingAttempt.attempt_id,
          session_id: existingAttempt.session_id,
          student_id: existingAttempt.student_id,
          status: existingAttempt.status,
          started_at: existingAttempt.started_at,
          expires_at: existingAttempt.expires_at,
          server_time: serverNow.toISOString(),
          time_remaining_seconds: calculateRemainingSeconds(existingAttempt.expires_at, serverNow),
          total_questions: totalQuestions,
          total_marks: Number(exam.total_marks),
          is_new: false,
          anti_tamper_token: deriveAttemptSigningKey(
            config.ANTI_TAMPER_SECRET,
            existingAttempt.attempt_id,
            user.userId,
            existingAttempt.started_at
          )
        };
      }

      // Finalized attempt
      await client.query('COMMIT');
      throw new ConflictError(
        `Cannot start exam: Your exam attempt has already been finalized with status '${existingAttempt.status}'`
      );
    }

    // 6. Fetch Topic Rules
    const topicRules = await attemptsRepo.getTopicRulesForExam(exam.exam_id, client);
    if (!topicRules || topicRules.length === 0) {
      throw new BadRequestError('Cannot start exam: Exam has no configured topic rules');
    }

    // 7. Deterministic Question Selection & Mapping
    const allSelectedQuestions = [];
    const selectedQuestionIds = new Set();
    let totalRequiredCount = 0;

    for (const rule of topicRules) {
      totalRequiredCount += Number(rule.question_count);
      const eligibleQuestions = await attemptsRepo.getEligibleQuestionsForTopic(rule.topic_id, client);

      if (eligibleQuestions.length < Number(rule.question_count)) {
        throw new ConflictError(
          `Cannot start exam: Insufficient question inventory in topic '${rule.topic_id}'. Required: ${rule.question_count}, Available: ${eligibleQuestions.length}`
        );
      }

      const seed = generateSeed(sessionId, user.userId, rule.topic_id);
      const selected = selectQuestionsDeterministically(eligibleQuestions, Number(rule.question_count), seed);

      for (const q of selected) {
        if (!selectedQuestionIds.has(q.question_id)) {
          selectedQuestionIds.add(q.question_id);
          allSelectedQuestions.push(q);
        }
      }
    }

    // Mapping invariant assertion
    if (allSelectedQuestions.length !== totalRequiredCount) {
      throw new ConflictError(
        `Question mapping count mismatch: Expected ${totalRequiredCount}, selected ${allSelectedQuestions.length}`
      );
    }

    // 8. Calculate Authoritative Expiration (incorporating per-student extra_time_multiplier)
    const studentConfig = await studentConfigRepo.findConfigurationByStudentId(user.userId, client);
    const rawMultiplier = studentConfig ? Number(studentConfig.extra_time_multiplier) : 1.0;
    const extraTimeMultiplier = (!isNaN(rawMultiplier) && rawMultiplier >= 1.0 && rawMultiplier <= 3.0) ? rawMultiplier : 1.0;
    const baseDurationMinutes = Number(exam.duration_minutes);
    const effectiveDurationMinutes = Math.round(baseDurationMinutes * extraTimeMultiplier);
    const examDurationMs = effectiveDurationMinutes * 60 * 1000;
    const durationEnd = new Date(serverNow.getTime() + examDurationMs);
    const expiresAt = durationEnd < endTime ? durationEnd : endTime;

    // 9. Pure Domain Invariant Validation
    validateAttemptInvariants({
      session_id: sessionId,
      student_id: user.userId,
      status: AttemptStatus.ACTIVE,
      started_at: serverNow,
      expires_at: expiresAt
    });

    // 10. Insert Attempt in ACTIVE Status
    const attempt = await attemptsRepo.insertAttempt(
      {
        sessionId,
        studentId: user.userId,
        expiresAt: expiresAt.toISOString()
      },
      client
    );

    // 11. Batch Insert Attempt Questions with Contiguous display_order (1..N)
    const questionMappings = allSelectedQuestions.map((q, index) => ({
      questionId: q.question_id,
      displayOrder: index + 1
    }));

    await attemptsRepo.batchInsertAttemptQuestions(attempt.attempt_id, questionMappings, client);

    // 12. Update Student Roster Status to 'PRESENT'
    await attemptsRepo.updateSessionStudentStatus(sessionId, user.userId, 'PRESENT', client);

    // 13. Audit Log
    await attemptsRepo.createAuditLog(
      {
        actorUserId: user.userId,
        action: 'ATTEMPT_STARTED',
        resourceType: 'ATTEMPT',
        resourceId: attempt.attempt_id,
        attemptId: attempt.attempt_id,
        requestId,
        metadata: {
          sessionId,
          examId: exam.exam_id,
          totalQuestions: questionMappings.length,
          totalMarks: Number(exam.total_marks),
          baseDurationMinutes,
          effectiveDurationMinutes,
          extraTimeMultiplier,
          expiresAt: attempt.expires_at,
          startedAt: attempt.started_at
        }
      },
      client
    );

    await client.query('COMMIT');

    logger.info(
      {
        attemptId: attempt.attempt_id,
        studentId: user.userId,
        sessionId,
        totalQuestions: questionMappings.length,
        effectiveDurationMinutes,
        extraTimeMultiplier
      },
      'Exam attempt successfully created and initialized in ACTIVE status'
    );

    return {
      attempt_id: attempt.attempt_id,
      session_id: attempt.session_id,
      student_id: attempt.student_id,
      status: attempt.status,
      started_at: attempt.started_at,
      expires_at: attempt.expires_at,
      server_time: serverNow.toISOString(),
      time_remaining_seconds: calculateRemainingSeconds(attempt.expires_at, serverNow),
      total_questions: questionMappings.length,
      total_marks: Number(exam.total_marks),
      effective_duration_minutes: effectiveDurationMinutes,
      extra_time_multiplier: extraTimeMultiplier,
      is_new: true,
      anti_tamper_token: deriveAttemptSigningKey(
        config.ANTI_TAMPER_SECRET,
        attempt.attempt_id,
        user.userId,
        attempt.started_at
      )
    };
  } catch (err) {
    await client.query('ROLLBACK');

    // Layer 3: Defense-in-depth recovery for concurrent unique violation on (session_id, student_id)
    if (err.code === '23505' && (err.constraint === 'unique_session_student_attempt' || err.detail?.includes('session_id, student_id'))) {
      logger.warn(
        { sessionId, studentId: user.userId },
        'Caught concurrent attempt creation race (23505). Recovering committed attempt.'
      );

      const recovered = await attemptsRepo.findAttemptBySessionAndStudent(sessionId, user.userId);
      if (recovered) {
        if (recovered.status === AttemptStatus.ACTIVE) {
          const totalQuestions = await attemptsRepo.countAttemptQuestions(recovered.attempt_id);
          const recoveredNow = new Date(recovered.server_now);
          return {
            attempt_id: recovered.attempt_id,
            session_id: recovered.session_id,
            student_id: recovered.student_id,
            status: recovered.status,
            started_at: recovered.started_at,
            expires_at: recovered.expires_at,
            server_time: recoveredNow.toISOString(),
            time_remaining_seconds: calculateRemainingSeconds(recovered.expires_at, recoveredNow),
            total_questions: totalQuestions,
            is_new: false,
            anti_tamper_token: deriveAttemptSigningKey(
              config.ANTI_TAMPER_SECRET,
              recovered.attempt_id,
              user.userId,
              recovered.started_at
            )
          };
        }

        throw new ConflictError(
          `Cannot start exam: Your exam attempt has already been finalized with status '${recovered.status}'`
        );
      }
    }

    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieves attempt details including authoritative timer calculation.
 * @param {string} attemptId
 * @param {object} user - Authenticated user context
 * @param {string} [requestId=null]
 * @returns {Promise<object>}
 */
export async function getAttemptById(attemptId, user, requestId = null) {
  const attempt = await attemptsRepo.findAttemptById(attemptId);
  if (!attempt) {
    throw new NotFoundError(`Exam attempt with ID '${attemptId}' not found`);
  }

  // BOLA authorization check
  await assertCanAccessAttempt(attempt, user);

  // Lazy on-access expiration
  const currentAttempt = await checkAndApplyLazyExpiration(attempt, user.userId, requestId);

  const totalQuestions = await attemptsRepo.countAttemptQuestions(attemptId);
  const serverNow = new Date(currentAttempt.server_now || new Date());

  return {
    attempt_id: currentAttempt.attempt_id,
    session_id: currentAttempt.session_id,
    student_id: currentAttempt.student_id,
    status: currentAttempt.status,
    started_at: currentAttempt.started_at,
    expires_at: currentAttempt.expires_at,
    submitted_at: currentAttempt.submitted_at,
    server_time: serverNow.toISOString(),
    time_remaining_seconds:
      currentAttempt.status === AttemptStatus.ACTIVE
        ? calculateRemainingSeconds(currentAttempt.expires_at, serverNow)
        : 0,
    total_questions: totalQuestions,
    exam_title: currentAttempt.exam_title,
    duration_minutes: Number(currentAttempt.duration_minutes),
    total_marks: Number(currentAttempt.total_marks),
    anti_tamper_token:
      currentAttempt.student_id === user.userId
        ? deriveAttemptSigningKey(
            config.ANTI_TAMPER_SECRET,
            currentAttempt.attempt_id,
            user.userId,
            currentAttempt.started_at
          )
        : undefined
  };
}

/**
 * Retrieves the sanitized question set mapped to an attempt.
 * Ensures zero leakage of answers, is_correct, or correct_numeric_value.
 * @param {string} attemptId
 * @param {object} user - Authenticated user context
 * @param {string} [requestId=null]
 * @returns {Promise<object>}
 */
export async function getAttemptQuestions(attemptId, user, requestId = null) {
  const attempt = await attemptsRepo.findAttemptById(attemptId);
  if (!attempt) {
    throw new NotFoundError(`Exam attempt with ID '${attemptId}' not found`);
  }

  // BOLA authorization check
  await assertCanAccessAttempt(attempt, user);

  // Lazy on-access expiration
  const currentAttempt = await checkAndApplyLazyExpiration(attempt, user.userId, requestId);

  const serverNow = new Date(currentAttempt.server_now || new Date());
  const cacheKey = `v1:attempt:${attemptId}:questions`;

  // Dynamic TTL policy based on remaining seconds until authoritative expiration:
  // remainingSeconds = Math.ceil((new Date(currentAttempt.expires_at).getTime() - Date.now()) / 1000)
  const remainingSeconds = Math.ceil(
    (new Date(currentAttempt.expires_at).getTime() - Date.now()) / 1000
  );

  // 1. Attempt cache lookup
  let questions = await cacheService.get(cacheKey);

  // 2. Cache miss -> query PostgreSQL
  if (!questions) {
    questions = await attemptsRepo.getAttemptQuestionsSanitized(attemptId);

    // Only populate Redis if attempt has remaining time and is ACTIVE
    if (remainingSeconds > 0 && currentAttempt.status === AttemptStatus.ACTIVE) {
      await cacheService.set(cacheKey, questions, remainingSeconds);
    }
  }

  return {
    attempt_id: currentAttempt.attempt_id,
    status: currentAttempt.status,
    server_time: serverNow.toISOString(),
    time_remaining_seconds:
      currentAttempt.status === AttemptStatus.ACTIVE
        ? calculateRemainingSeconds(currentAttempt.expires_at, serverNow)
        : 0,
    total_questions: questions.length,
    questions
  };
}

/**
 * Retrieves candidate's attempt for a specific session.
 * @param {string} sessionId
 * @param {object} user - Authenticated user context (STUDENT)
 * @param {string} [requestId=null]
 * @returns {Promise<object|null>}
 */
export async function getMyAttemptForSession(sessionId, user, requestId = null) {
  const attempt = await attemptsRepo.findAttemptBySessionAndStudent(sessionId, user.userId);
  if (!attempt) {
    return null;
  }

  // Lazy on-access expiration
  const currentAttempt = await checkAndApplyLazyExpiration(attempt, user.userId, requestId);

  const totalQuestions = await attemptsRepo.countAttemptQuestions(currentAttempt.attempt_id);
  const serverNow = new Date(currentAttempt.server_now || new Date());

  return {
    attempt_id: currentAttempt.attempt_id,
    session_id: currentAttempt.session_id,
    student_id: currentAttempt.student_id,
    status: currentAttempt.status,
    started_at: currentAttempt.started_at,
    expires_at: currentAttempt.expires_at,
    submitted_at: currentAttempt.submitted_at,
    server_time: serverNow.toISOString(),
    time_remaining_seconds:
      currentAttempt.status === AttemptStatus.ACTIVE
        ? calculateRemainingSeconds(currentAttempt.expires_at, serverNow)
        : 0,
    total_questions: totalQuestions
  };
}
