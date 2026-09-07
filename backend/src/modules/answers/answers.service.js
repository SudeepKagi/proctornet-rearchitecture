/**
 * @file answers.service.js
 * @description Business workflow service for Exam Answers, OCC Revision Sequence, Revision-aware Retries, Clear-Answer Operations, and Atomic Batch Autosave.
 */

import { getPool } from '../../infrastructure/postgres/pool.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
  UnprocessableEntityError
} from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { AttemptStatus } from '../../domain/attempt/attemptStates.js';
import { transitionAttemptState } from '../../domain/attempt/attemptStateMachine.js';
import * as answersRepo from './answers.repository.js';
import { finalizeAttempt } from '../submissions/submissions.service.js';

/**
 * Checks if two answer payloads are semantically identical.
 * @param {object} payloadA
 * @param {object} payloadB
 * @returns {boolean}
 */
function isPayloadEqual(payloadA, payloadB) {
  if (!payloadA || !payloadB) return false;
  if (payloadA.selected_option_id !== undefined || payloadB.selected_option_id !== undefined) {
    return payloadA.selected_option_id === payloadB.selected_option_id;
  }
  if (payloadA.numeric_value !== undefined || payloadB.numeric_value !== undefined) {
    return Number(payloadA.numeric_value) === Number(payloadB.numeric_value);
  }
  return JSON.stringify(payloadA) === JSON.stringify(payloadB);
}

/**
 * Validates answer payload semantics against question type and available options.
 * @param {string} questionType
 * @param {object} answerValue
 * @param {Set<string>} validOptionIds
 * @throws {UnprocessableEntityError} If answer value is semantically invalid
 */
function validateAnswerPayload(questionType, answerValue, validOptionIds = new Set()) {
  if (['MCQ', 'TRUE_FALSE'].includes(questionType)) {
    const selectedOptionId = answerValue?.selected_option_id;
    if (!selectedOptionId || typeof selectedOptionId !== 'string') {
      throw new UnprocessableEntityError(
        `Invalid answer: Question type '${questionType}' requires a valid 'selected_option_id' string`
      );
    }
    if (!validOptionIds.has(selectedOptionId)) {
      throw new UnprocessableEntityError(
        `Invalid answer: Selected option '${selectedOptionId}' does not belong to question`
      );
    }
    return;
  }

  if (questionType === 'NUMERIC') {
    const numericValue = answerValue?.numeric_value;
    if (numericValue === null || numericValue === undefined || typeof numericValue !== 'number' || !Number.isFinite(numericValue)) {
      throw new UnprocessableEntityError(
        `Invalid answer: Question type 'NUMERIC' requires a finite 'numeric_value'`
      );
    }
    return;
  }

  throw new UnprocessableEntityError(`Unsupported question type '${questionType}'`);
}

/**
 * Verifies attempt ownership and student role for write operations (BOLA defense).
 * @param {object} user - Authenticated user context { userId, roles }
 * @param {object} attempt - Exam attempt record
 * @throws {ForbiddenError}
 */
function assertStudentOwner(user, attempt) {
  const isStudent = (user.roles || []).includes('STUDENT');
  if (!isStudent) {
    throw new ForbiddenError('Access denied: Only candidates with the STUDENT role can save or clear answers');
  }
  if (user.userId !== attempt.student_id) {
    throw new ForbiddenError('Access denied: You cannot modify answers for another student\'s exam attempt');
  }
}

/**
 * Verifies authorization to read an attempt's answers.
 * Allowed: Attempt Owner (STUDENT), Exam Creator (FACULTY), Assigned Invigilator, or ADMIN.
 * @param {object} user
 * @param {object} attempt
 * @throws {ForbiddenError}
 */
async function assertCanReadAnswers(user, attempt) {
  const isAdmin = (user.roles || []).includes('ADMIN');
  if (isAdmin) return;

  const isOwner = user.userId === attempt.student_id;
  if (isOwner) return;

  const isExamCreator = user.userId === attempt.exam_created_by;
  if (isExamCreator) return;

  const isInvigilator = await answersRepo.isUserInvigilatorForSession(attempt.session_id, user.userId);
  if (isInvigilator) return;

  throw new ForbiddenError('Access denied: You do not have permission to view answers for this exam attempt');
}

/**
 * Verifies attempt status is ACTIVE and deadline has not elapsed.
 * If deadline has elapsed, transitions attempt to EXPIRED and rejects write.
 * @param {object} attempt
 * @param {import('pg').PoolClient} client
 * @param {string} actorUserId
 * @param {string} [requestId=null]
 * @throws {ConflictError} If attempt is inactive or expired
 */
async function assertActiveAndValidDeadline(attempt, client, actorUserId, requestId = null) {
  if (attempt.status !== AttemptStatus.ACTIVE) {
    throw new ConflictError(
      `Cannot modify answers: Exam attempt is in '${attempt.status}' state. Answers can only be modified in ACTIVE state.`,
      'ATTEMPT_NOT_ACTIVE'
    );
  }

  const serverNow = new Date(attempt.server_now);
  const expiresAt = new Date(attempt.expires_at);

  if (serverNow >= expiresAt) {
    await finalizeAttempt(
      client,
      attempt,
      AttemptStatus.EXPIRED,
      'Authoritative server deadline elapsed on answer write attempt',
      actorUserId,
      requestId,
      {
        expiresAt: attempt.expires_at,
        serverTime: serverNow.toISOString()
      }
    );

    await client.query('COMMIT');

    logger.warn(
      { attemptId: attempt.attempt_id, studentId: actorUserId },
      'Attempt transitioned to EXPIRED on answer write attempt'
    );

    throw new ConflictError(
      'Cannot save answer: Your exam attempt deadline has expired',
      'ATTEMPT_EXPIRED'
    );
  }
}

/**
 * Saves a single question answer with OCC revision tracking and payload-based retry recognition.
 * PUT /api/v1/attempts/:attemptId/answers/:attemptQuestionId
 * @param {string} attemptId
 * @param {string} attemptQuestionId
 * @param {object} data - { answer_value, expected_revision }
 * @param {object} user - Authenticated student { userId, roles }
 * @param {string} [requestId=null]
 * @returns {Promise<object>} Saved answer record
 */
export async function saveAnswer(attemptId, attemptQuestionId, data, user, requestId = null) {
  const { answer_value, expected_revision } = data;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock Attempt row (FOR UPDATE)
    const attempt = await answersRepo.findAttemptForUpdate(attemptId, client);
    if (!attempt) {
      throw new NotFoundError(`Exam attempt with ID '${attemptId}' not found`);
    }

    // 2. Authorization (BOLA defense)
    assertStudentOwner(user, attempt);

    // 3. State & Deadline Guards (Authoritative Server Time)
    await assertActiveAndValidDeadline(attempt, client, user.userId, requestId);

    // 4. Verify Attempt Question Mapping
    const attemptQuestion = await answersRepo.findAttemptQuestion(attemptId, attemptQuestionId, client);
    if (!attemptQuestion) {
      throw new NotFoundError(`Question mapping '${attemptQuestionId}' not found for attempt '${attemptId}'`);
    }

    // 5. Question-Type Semantic Validation
    let validOptionIds = new Set();
    if (['MCQ', 'TRUE_FALSE'].includes(attemptQuestion.question_type)) {
      const options = await answersRepo.getQuestionOptions(attemptQuestion.question_id, client);
      validOptionIds = new Set(options.map((o) => o.option_id));
    }
    validateAnswerPayload(attemptQuestion.question_type, answer_value, validOptionIds);

    // 6. OCC & Revision Logic
    const existingAnswer = await answersRepo.findAnswerByAttemptQuestionId(attemptQuestionId, client);

    let resultRecord;

    if (!existingAnswer) {
      // Unanswered question -> expected_revision MUST be 0
      if (expected_revision !== 0) {
        throw new ConflictError(
          `Stale revision conflict: Question is currently unanswered (expected_revision MUST be 0, received ${expected_revision})`,
          'STALE_REVISION_CONFLICT'
        );
      }

      // First save creates revision = 1
      resultRecord = await answersRepo.insertAnswer(attemptQuestionId, answer_value, client);
    } else {
      const currentRevision = Number(existingAnswer.revision);

      if (expected_revision === currentRevision) {
        // Normal save: increment revision K -> K + 1
        resultRecord = await answersRepo.updateAnswer(attemptQuestionId, answer_value, expected_revision, client);
        if (!resultRecord) {
          throw new ConflictError(
            `Stale revision conflict: Answer revision changed concurrently`,
            'STALE_REVISION_CONFLICT'
          );
        }
      } else if (expected_revision === currentRevision - 1 && isPayloadEqual(existingAnswer.answer_value, answer_value)) {
        // Revision-aware retry of immediately previous committed save
        resultRecord = existingAnswer;
      } else {
        // Stale or future revision mismatch
        throw new ConflictError(
          `Stale revision conflict: Current server revision is ${currentRevision}, but expected_revision was ${expected_revision}`,
          'STALE_REVISION_CONFLICT'
        );
      }
    }

    await client.query('COMMIT');

    const serverNow = new Date(attempt.server_now).toISOString();

    return {
      answer_id: resultRecord.answer_id,
      attempt_question_id: resultRecord.attempt_question_id,
      answer_value: resultRecord.answer_value,
      revision: Number(resultRecord.revision),
      saved_at: new Date(resultRecord.saved_at).toISOString(),
      server_time: serverNow
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Clears an answer with OCC revision tracking.
 * DELETE /api/v1/attempts/:attemptId/answers/:attemptQuestionId
 * @param {string} attemptId
 * @param {string} attemptQuestionId
 * @param {object} data - { expected_revision }
 * @param {object} user - Authenticated student { userId, roles }
 * @param {string} [requestId=null]
 * @returns {Promise<object>}
 */
export async function clearAnswer(attemptId, attemptQuestionId, data, user, requestId = null) {
  const { expected_revision } = data;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock Attempt row (FOR UPDATE)
    const attempt = await answersRepo.findAttemptForUpdate(attemptId, client);
    if (!attempt) {
      throw new NotFoundError(`Exam attempt with ID '${attemptId}' not found`);
    }

    // 2. Authorization
    assertStudentOwner(user, attempt);

    // 3. State & Deadline Guards
    await assertActiveAndValidDeadline(attempt, client, user.userId, requestId);

    // 4. Verify Question Mapping
    const attemptQuestion = await answersRepo.findAttemptQuestion(attemptId, attemptQuestionId, client);
    if (!attemptQuestion) {
      throw new NotFoundError(`Question mapping '${attemptQuestionId}' not found for attempt '${attemptId}'`);
    }

    // 5. OCC Deletion Logic
    const existingAnswer = await answersRepo.findAnswerByAttemptQuestionId(attemptQuestionId, client);

    if (existingAnswer) {
      const currentRevision = Number(existingAnswer.revision);
      if (expected_revision !== currentRevision) {
        throw new ConflictError(
          `Stale revision conflict: Current server revision is ${currentRevision}, but expected_revision was ${expected_revision}`,
          'STALE_REVISION_CONFLICT'
        );
      }

      await answersRepo.deleteAnswer(attemptQuestionId, expected_revision, client);
    } else {
      // No answer row exists
      if (expected_revision === 0) {
        // Safe, idempotent no-op clear
      } else {
        throw new ConflictError(
          `Stale revision conflict: Question is unanswered but expected_revision was ${expected_revision}`,
          'STALE_REVISION_CONFLICT'
        );
      }
    }

    await client.query('COMMIT');

    const serverNow = new Date(attempt.server_now).toISOString();

    return {
      attempt_question_id: attemptQuestionId,
      cleared: true,
      server_time: serverNow
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Saves a batch of answers in a single atomic PostgreSQL transaction.
 * POST /api/v1/attempts/:attemptId/answers/batch
 * @param {string} attemptId
 * @param {object} data - { answers: Array<{ attempt_question_id, answer_value, expected_revision }> }
 * @param {object} user - Authenticated student { userId, roles }
 * @param {string} [requestId=null]
 * @returns {Promise<object>} Batch save result summary
 */
export async function batchSaveAnswers(attemptId, data, user, requestId = null) {
  const { answers } = data;

  // Defensive validation against duplicate attempt_question_id values
  const seenIds = new Set();
  for (const item of answers) {
    if (seenIds.has(item.attempt_question_id)) {
      throw new BadRequestError('Batch request contains duplicate attempt_question_id entries');
    }
    seenIds.add(item.attempt_question_id);
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock Attempt row (FOR UPDATE)
    const attempt = await answersRepo.findAttemptForUpdate(attemptId, client);
    if (!attempt) {
      throw new NotFoundError(`Exam attempt with ID '${attemptId}' not found`);
    }

    // 2. Authorization
    assertStudentOwner(user, attempt);

    // 3. State & Deadline Guards
    await assertActiveAndValidDeadline(attempt, client, user.userId, requestId);

    // 4. Sort batch items deterministically by attempt_question_id
    const sortedAnswers = [...answers].sort((a, b) =>
      a.attempt_question_id.localeCompare(b.attempt_question_id)
    );

    // 5. Batch fetch and validate all question mappings
    const attemptQuestionIds = sortedAnswers.map((a) => a.attempt_question_id);
    const mappedQuestions = await answersRepo.findAttemptQuestionsByIds(attemptId, attemptQuestionIds, client);
    const mappedQuestionsMap = new Map(mappedQuestions.map((q) => [q.attempt_question_id, q]));

    for (const item of sortedAnswers) {
      if (!mappedQuestionsMap.has(item.attempt_question_id)) {
        throw new NotFoundError(
          `Question mapping '${item.attempt_question_id}' not found for attempt '${attemptId}'`
        );
      }
    }

    // 6. Batch fetch question options for MCQ / TRUE_FALSE questions
    const mcqQuestionIds = mappedQuestions
      .filter((q) => ['MCQ', 'TRUE_FALSE'].includes(q.question_type))
      .map((q) => q.question_id);

    const questionOptions = await answersRepo.getQuestionOptionsForQuestions(mcqQuestionIds, client);
    const optionsMap = new Map();
    for (const opt of questionOptions) {
      if (!optionsMap.has(opt.question_id)) {
        optionsMap.set(opt.question_id, new Set());
      }
      optionsMap.get(opt.question_id).add(opt.option_id);
    }

    // 7. Batch fetch existing answers for all questions
    const existingAnswers = await answersRepo.findAnswersByAttemptQuestionIds(attemptQuestionIds, client);
    const existingAnswersMap = new Map(existingAnswers.map((a) => [a.attempt_question_id, a]));

    const savedResults = [];

    // 8. Process each item atomically
    for (const item of sortedAnswers) {
      const mappedQ = mappedQuestionsMap.get(item.attempt_question_id);
      const validOptions = optionsMap.get(mappedQ.question_id) || new Set();

      // Semantic validation
      validateAnswerPayload(mappedQ.question_type, item.answer_value, validOptions);

      const existingAnswer = existingAnswersMap.get(item.attempt_question_id);

      let savedRecord;

      if (!existingAnswer) {
        if (item.expected_revision !== 0) {
          throw new ConflictError(
            `Stale revision conflict on question '${item.attempt_question_id}': Currently unanswered (expected_revision MUST be 0, received ${item.expected_revision})`,
            'STALE_REVISION_CONFLICT'
          );
        }
        savedRecord = await answersRepo.insertAnswer(item.attempt_question_id, item.answer_value, client);
      } else {
        const currentRevision = Number(existingAnswer.revision);

        if (item.expected_revision === currentRevision) {
          savedRecord = await answersRepo.updateAnswer(
            item.attempt_question_id,
            item.answer_value,
            item.expected_revision,
            client
          );
          if (!savedRecord) {
            throw new ConflictError(
              `Stale revision conflict on question '${item.attempt_question_id}': Concurrently modified`,
              'STALE_REVISION_CONFLICT'
            );
          }
        } else if (
          item.expected_revision === currentRevision - 1 &&
          isPayloadEqual(existingAnswer.answer_value, item.answer_value)
        ) {
          savedRecord = existingAnswer;
        } else {
          throw new ConflictError(
            `Stale revision conflict on question '${item.attempt_question_id}': Server revision is ${currentRevision}, but expected_revision was ${item.expected_revision}`,
            'STALE_REVISION_CONFLICT'
          );
        }
      }

      savedResults.push(savedRecord);
    }

    await client.query('COMMIT');

    const serverNow = new Date(attempt.server_now).toISOString();

    return {
      saved_count: savedResults.length,
      server_time: serverNow,
      answers: savedResults.map((r) => ({
        answer_id: r.answer_id,
        attempt_question_id: r.attempt_question_id,
        answer_value: r.answer_value,
        revision: Number(r.revision),
        saved_at: new Date(r.saved_at).toISOString()
      }))
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieves all answers for an attempt.
 * GET /api/v1/attempts/:attemptId/answers
 * @param {string} attemptId
 * @param {object} user - Authenticated user context
 * @param {string} [requestId=null]
 * @returns {Promise<object>}
 */
export async function getAnswersForAttempt(attemptId, user, requestId = null) {
  const attempt = await answersRepo.findAttemptById(attemptId);
  if (!attempt) {
    throw new NotFoundError(`Exam attempt with ID '${attemptId}' not found`);
  }

  // Authorization check
  await assertCanReadAnswers(user, attempt);

  // Lazy on-access expiration check
  let currentStatus = attempt.status;
  const serverNow = new Date(attempt.server_now);
  const expiresAt = new Date(attempt.expires_at);

  if (currentStatus === AttemptStatus.ACTIVE && serverNow >= expiresAt) {
    const nextStatus = transitionAttemptState(currentStatus, AttemptStatus.EXPIRED);
    await answersRepo.updateAttemptStatus(attemptId, nextStatus);
    await answersRepo.createAuditLog({
      actorUserId: user.userId,
      action: 'ATTEMPT_EXPIRED',
      resourceType: 'ATTEMPT',
      resourceId: attemptId,
      attemptId,
      requestId,
      metadata: {
        reason: 'Authoritative server deadline elapsed on answers retrieval',
        expiresAt: attempt.expires_at,
        serverTime: serverNow.toISOString()
      }
    });
    currentStatus = AttemptStatus.EXPIRED;
  }

  const answers = await answersRepo.getAnswersForAttempt(attemptId);

  return {
    attempt_id: attempt.attempt_id,
    status: currentStatus,
    server_time: serverNow.toISOString(),
    answered_count: answers.length,
    answers: answers.map((a) => ({
      answer_id: a.answer_id,
      attempt_question_id: a.attempt_question_id,
      answer_value: a.answer_value,
      revision: Number(a.revision),
      saved_at: new Date(a.saved_at).toISOString()
    }))
  };
}
