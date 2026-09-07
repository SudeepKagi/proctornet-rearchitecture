/**
 * @file submissions.service.js
 * @description Business workflow service for Exam Submissions, Durable Idempotency, Final Dirty Answer Persistence, and Unified Attempt Finalization.
 * Conforms to Step 13.5, 13.7, and Phase 8 specifications.
 */

import crypto from 'node:crypto';
import { getPool } from '../../infrastructure/postgres/pool.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  UnprocessableEntityError
} from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { AttemptStatus } from '../../domain/attempt/attemptStates.js';
import { transitionAttemptState } from '../../domain/attempt/attemptStateMachine.js';
import * as submissionsRepo from './submissions.repository.js';
import { triggerOutboxDispatch } from '../outbox/outbox.service.js';

/**
 * Computes a deterministic SHA-256 fingerprint for a submission request based solely on semantic submission data.
 * Excludes unstable metadata such as request IDs, client IPs, or per-request timestamps.
 *
 * @param {string} attemptId
 * @param {object} [body]
 * @returns {string} Hex-encoded SHA-256 digest
 */
export function computeSubmissionFingerprint(attemptId, body) {
  const normalizedAnswers = Array.isArray(body?.answers)
    ? [...body.answers]
        .sort((a, b) => a.attempt_question_id.localeCompare(b.attempt_question_id))
        .map((a) => ({
          attempt_question_id: a.attempt_question_id,
          expected_revision: a.expected_revision,
          answer_value: a.answer_value
        }))
    : [];

  const canonicalPayload = JSON.stringify({
    attempt_id: attemptId,
    answers: normalizedAnswers
  });

  return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
}

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
 * @throws {UnprocessableEntityError}
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
 * Shared finalization service abstraction that transitions an attempt into a terminal state,
 * updates the database, enqueues the domain outbox event, and records an audit log atomically.
 *
 * @param {import('pg').PoolClient} client - Active database client inside transaction
 * @param {object} attempt - Locked exam attempt row
 * @param {string} targetStatus - Target terminal status (SUBMITTED or EXPIRED)
 * @param {string} reason - Finalization reason description
 * @param {string} actorUserId - User ID performing or triggering finalization
 * @param {string} [requestId=null] - Request correlation ID
 * @param {object} [metadata={}] - Additional audit metadata
 * @returns {Promise<object>} The updated attempt record
 */
export async function finalizeAttempt(
  client,
  attempt,
  targetStatus,
  reason,
  actorUserId,
  requestId = null,
  metadata = {}
) {
  const nextStatus = transitionAttemptState(attempt.status, targetStatus);
  let updatedAttempt;

  if (nextStatus === AttemptStatus.SUBMITTED) {
    updatedAttempt = await submissionsRepo.updateAttemptToSubmitted(attempt.attempt_id, client);
    await submissionsRepo.insertOutboxEvent(
      {
        aggregateType: 'ATTEMPT',
        aggregateId: attempt.attempt_id,
        eventType: 'ATTEMPT_SUBMITTED',
        payload: {
          attempt_id: attempt.attempt_id,
          session_id: attempt.session_id,
          student_id: attempt.student_id,
          submitted_at: updatedAttempt.submitted_at || new Date().toISOString(),
          correlationId: requestId || metadata?.requestId,
          traceparent: metadata?.traceparent
        }
      },
      client
    );

    await submissionsRepo.createAuditLog(
      {
        actorUserId,
        action: 'ATTEMPT_SUBMITTED',
        resourceType: 'ATTEMPT',
        resourceId: attempt.attempt_id,
        attemptId: attempt.attempt_id,
        requestId,
        metadata: {
          reason,
          submittedAt: updatedAttempt.submitted_at,
          ...metadata
        }
      },
      client
    );
  } else if (nextStatus === AttemptStatus.EXPIRED) {
    updatedAttempt = await submissionsRepo.updateAttemptToExpired(attempt.attempt_id, client);
    await submissionsRepo.insertOutboxEvent(
      {
        aggregateType: 'ATTEMPT',
        aggregateId: attempt.attempt_id,
        eventType: 'ATTEMPT_EXPIRED',
        payload: {
          attempt_id: attempt.attempt_id,
          session_id: attempt.session_id,
          student_id: attempt.student_id,
          expires_at: attempt.expires_at,
          expired_at: updatedAttempt.updated_at || new Date().toISOString()
        }
      },
      client
    );

    await submissionsRepo.createAuditLog(
      {
        actorUserId,
        action: 'ATTEMPT_EXPIRED',
        resourceType: 'ATTEMPT',
        resourceId: attempt.attempt_id,
        attemptId: attempt.attempt_id,
        requestId,
        metadata: {
          reason,
          expiresAt: attempt.expires_at,
          serverTime: new Date().toISOString(),
          ...metadata
        }
      },
      client
    );
  }

  return updatedAttempt || { ...attempt, status: nextStatus };
}

/**
 * Submits an active exam attempt atomically with mandatory idempotency key,
 * optional final dirty answers, and asynchronous outbox evaluation trigger.
 *
 * @param {string} attemptId
 * @param {string} idempotencyKey
 * @param {object} body - { answers?: Array<{ attempt_question_id, answer_value, expected_revision }> }
 * @param {object} user - Authenticated user context { userId, roles }
 * @param {string} [requestId=null]
 * @param {string} [traceparent=null]
 * @returns {Promise<object>}
 */
export async function submitAttempt(attemptId, idempotencyKey, body, user, requestId = null, traceparent = null) {
  // 1. Validate Idempotency-Key
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    throw new BadRequestError('Idempotency-Key header is required for exam submission', 'MISSING_IDEMPOTENCY_KEY');
  }

  const trimmedKey = idempotencyKey.trim();
  if (trimmedKey.length > 255) {
    throw new BadRequestError('Idempotency-Key header must not exceed 255 characters', 'INVALID_IDEMPOTENCY_KEY');
  }

  // 2. Validate Role (STUDENT only)
  const isStudent = (user.roles || []).includes('STUDENT');
  if (!isStudent) {
    throw new ForbiddenError('Access denied: Only candidates with the STUDENT role can submit exam attempts');
  }

  // 3. Compute deterministic request fingerprint
  const currentFingerprint = computeSubmissionFingerprint(attemptId, body);

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 4. Lock Attempt row (FOR UPDATE)
    const attempt = await submissionsRepo.findAttemptForUpdate(attemptId, client);
    if (!attempt) {
      throw new NotFoundError(`Exam attempt with ID '${attemptId}' not found`);
    }

    // 5. BOLA defense: Verify authenticated user owns the attempt
    if (user.userId !== attempt.student_id) {
      throw new ForbiddenError('Access denied: You cannot submit another candidate\'s exam attempt');
    }

    // 6. Check existing submission idempotency record
    const existingIdempotency = await submissionsRepo.findSubmissionIdempotency(attemptId, client);
    if (existingIdempotency) {
      if (existingIdempotency.user_id !== user.userId) {
        throw new ForbiddenError('Access denied: You cannot access submission records for another student');
      }

      if (existingIdempotency.idempotency_key === trimmedKey) {
        if (existingIdempotency.request_fingerprint === currentFingerprint) {
          // Exact idempotent replay: rollback transaction and return stored response
          await client.query('ROLLBACK');
          logger.info(
            { attemptId, idempotencyKey: trimmedKey, studentId: user.userId },
            'Idempotent submission replay returned cached response'
          );
          return existingIdempotency.response_payload;
        }

        // Same key, different request payload -> 409 Conflict
        await client.query('ROLLBACK');
        throw new ConflictError(
          'Idempotency key reuse error: The same Idempotency-Key was previously submitted with a different request payload',
          'IDEMPOTENCY_KEY_REUSE'
        );
      }

      // Different key on already submitted attempt -> 409 Conflict
      await client.query('ROLLBACK');
      throw new ConflictError(
        'Exam attempt has already been submitted',
        'ATTEMPT_ALREADY_SUBMITTED'
      );
    }

    // 7. Check Attempt Status
    if (attempt.status === AttemptStatus.SUBMITTED) {
      await client.query('ROLLBACK');
      throw new ConflictError(
        'Exam attempt has already been submitted',
        'ATTEMPT_ALREADY_SUBMITTED'
      );
    }

    if (attempt.status !== AttemptStatus.ACTIVE) {
      await client.query('ROLLBACK');
      throw new ConflictError(
        `Cannot submit exam attempt: Attempt is in '${attempt.status}' state. Only ACTIVE attempts can be submitted.`,
        'ATTEMPT_NOT_ACTIVE'
      );
    }

    // 8. Authoritative Server Deadline Check
    const serverNow = new Date(attempt.server_now);
    const expiresAt = new Date(attempt.expires_at);

    if (serverNow >= expiresAt) {
      await finalizeAttempt(
        client,
        attempt,
        AttemptStatus.EXPIRED,
        'Authoritative server deadline elapsed on submit request',
        user.userId,
        requestId,
        {
          serverTime: serverNow.toISOString(),
          expiresAt: attempt.expires_at
        }
      );

      await client.query('COMMIT');
      logger.warn(
        { attemptId, studentId: user.userId },
        'Attempt transitioned to EXPIRED on submission attempt'
      );

      throw new ConflictError(
        'Cannot submit exam: Your exam attempt deadline has expired',
        'ATTEMPT_EXPIRED'
      );
    }

    // 9. Process Optional Final Dirty Answers
    if (Array.isArray(body?.answers) && body.answers.length > 0) {
      // Reject duplicate question IDs in batch
      const questionIds = body.answers.map((a) => a.attempt_question_id);
      if (new Set(questionIds).size !== questionIds.length) {
        throw new BadRequestError('Submission answers contains duplicate attempt_question_id entries');
      }

      // Sort items deterministically by attempt_question_id
      const sortedAnswers = [...body.answers].sort((a, b) =>
        a.attempt_question_id.localeCompare(b.attempt_question_id)
      );

      for (const item of sortedAnswers) {
        const { attempt_question_id, answer_value, expected_revision } = item;

        // Verify question belongs to attempt
        const attemptQuestion = await submissionsRepo.findAttemptQuestion(attemptId, attempt_question_id, client);
        if (!attemptQuestion) {
          throw new NotFoundError(
            `Question mapping '${attempt_question_id}' not found for attempt '${attemptId}'`
          );
        }

        // Semantic validation
        let validOptionIds = new Set();
        if (['MCQ', 'TRUE_FALSE'].includes(attemptQuestion.question_type)) {
          const options = await submissionsRepo.getQuestionOptions(attemptQuestion.question_id, client);
          validOptionIds = new Set(options.map((o) => o.option_id));
        }
        validateAnswerPayload(attemptQuestion.question_type, answer_value, validOptionIds);

        // OCC revision handling
        const existingAnswer = await submissionsRepo.findAnswerByAttemptQuestionId(attempt_question_id, client);

        if (!existingAnswer) {
          if (expected_revision !== 0) {
            throw new ConflictError(
              `Stale revision conflict: Question is currently unanswered (expected_revision MUST be 0, received ${expected_revision})`,
              'STALE_REVISION_CONFLICT'
            );
          }
          await submissionsRepo.insertAnswer(attempt_question_id, answer_value, client);
        } else {
          const currentRevision = Number(existingAnswer.revision);

          if (expected_revision === currentRevision) {
            const updated = await submissionsRepo.updateAnswer(attempt_question_id, answer_value, expected_revision, client);
            if (!updated) {
              throw new ConflictError(
                'Stale revision conflict: Answer revision changed concurrently',
                'STALE_REVISION_CONFLICT'
              );
            }
          } else if (expected_revision === currentRevision - 1 && isPayloadEqual(existingAnswer.answer_value, answer_value)) {
            // Idempotent retry of previous save -> no-op
          } else {
            throw new ConflictError(
              `Stale revision conflict: Current server revision is ${currentRevision}, but expected_revision was ${expected_revision}`,
              'STALE_REVISION_CONFLICT'
            );
          }
        }
      }
    }

    // 10. Execute State Transition & Finalization (ACTIVE -> SUBMITTED)
    const finalizedAttempt = await finalizeAttempt(
      client,
      attempt,
      AttemptStatus.SUBMITTED,
      'Candidate voluntarily submitted exam attempt',
      user.userId,
      requestId,
      { traceparent }
    );

    // 11. Build Response Payload
    const responsePayload = {
      attempt_id: attempt.attempt_id,
      status: AttemptStatus.SUBMITTED,
      submitted_at: finalizedAttempt.submitted_at ? new Date(finalizedAttempt.submitted_at).toISOString() : new Date().toISOString(),
      server_time: serverNow.toISOString(),
      message: 'Exam attempt submitted successfully. Objective evaluation initiated.'
    };

    // 12. Persist Submission Idempotency Record
    await submissionsRepo.insertSubmissionIdempotency(
      {
        attemptId,
        idempotencyKey: trimmedKey,
        userId: user.userId,
        requestFingerprint: currentFingerprint,
        responseStatus: 200,
        responsePayload
      },
      client
    );

    // 13. Commit Transaction
    await client.query('COMMIT');

    logger.info(
      { attemptId, studentId: user.userId, idempotencyKey: trimmedKey },
      'Exam attempt successfully submitted and finalized'
    );

    // 14. Asynchronously Trigger Outbox Dispatcher (non-blocking)
    setImmediate(() => {
      triggerOutboxDispatch().catch((err) => {
        logger.error({ err, attemptId }, 'Background outbox dispatch trigger error');
      });
    });

    return responsePayload;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
