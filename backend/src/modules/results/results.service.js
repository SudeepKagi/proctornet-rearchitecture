/**
 * @file results.service.js
 * @description Business workflow service for Results visibility, listing, summary stats, publication, and release policy mutations.
 * Conforms to Step 13.5, Step 13.7, and Phase 9 Architecture specifications.
 */

import { getPool } from '../../infrastructure/postgres/pool.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import {
  ExamStatus,
  ResultsReleasePolicy,
  calculateDerivedFields
} from '../../domain/index.js';
import * as resultsRepo from './results.repository.js';

/**
 * Retrieves candidate result for an attempt with strict BOLA, attempt status,
 * evaluation, and release-policy checks.
 *
 * @param {Object} params
 * @param {string} params.attemptId
 * @param {string} params.candidateUserId
 * @param {string} [params.requestId]
 * @returns {Promise<object>}
 */
export async function getCandidateAttemptResult({ attemptId, candidateUserId, requestId = null }) {
  const row = await resultsRepo.getCandidateResultByAttemptId(attemptId);

  // 1. Attempt existence check
  if (!row) {
    throw new AppError('Exam attempt not found', 404, 'ATTEMPT_NOT_FOUND');
  }

  // 2. Strict BOLA check: Candidate can only view their own attempt
  if (row.student_id !== candidateUserId) {
    throw new AppError('Access denied to attempt results', 403, 'FORBIDDEN');
  }

  // 3. Attempt status check: In-progress attempts cannot be viewed
  if (row.attempt_status === 'ACTIVE') {
    throw new AppError('Exam attempt is still active', 409, 'ATTEMPT_ACTIVE');
  }

  // 4. Result existence check: Attempt is finalized but not yet evaluated
  if (!row.result_id) {
    throw new AppError('Attempt result is not available', 404, 'RESULT_NOT_FOUND');
  }

  // 5. Release policy / candidate visibility check
  if (!row.is_candidate_visible) {
    throw new AppError('Exam results have not been released', 403, 'RESULT_NOT_PUBLISHED');
  }

  // 6. Compute derived fields
  const derived = calculateDerivedFields({
    score: row.score,
    totalMarks: row.total_marks,
    passingMarks: row.passing_marks
  });

  return {
    attemptId: row.attempt_id,
    examId: row.exam_id,
    examTitle: row.exam_title,
    score: Number(row.score),
    totalMarks: Number(row.total_marks),
    passingMarks: Number(row.passing_marks),
    passed: derived.passed,
    percentage: derived.percentage,
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    unansweredCount: row.unanswered_count,
    evaluatedAt: row.evaluated_at,
    publishedAt: row.results_published_at
  };
}

function getUserRoles(user) {
  if (Array.isArray(user?.roles)) return user.roles;
  if (user?.role) return [user.role];
  return [];
}

/**
 * Internal helper to authorize staff access to an exam and optionally its session.
 *
 * @param {Object} params
 * @param {string} params.examId
 * @param {Object} params.user
 * @param {string} [params.sessionId]
 * @returns {Promise<object>}
 */
async function authorizeStaffExamAccess({ examId, user, sessionId = null }) {
  const exam = await resultsRepo.getExamById(examId);
  if (!exam) {
    throw new AppError('Exam not found', 404, 'EXAM_NOT_FOUND');
  }

  const roles = getUserRoles(user);
  const isAdmin = roles.includes('ADMIN');
  const isFaculty = roles.includes('FACULTY');
  const isInvigilator = roles.includes('INVIGILATOR');

  if (isAdmin) {
    return exam;
  }

  if (isFaculty) {
    if (exam.created_by !== user.userId) {
      throw new AppError('Access denied to exam results', 403, 'FORBIDDEN');
    }
    return exam;
  }

  if (isInvigilator) {
    if (!sessionId) {
      throw new AppError('Invigilators must provide sessionId to inspect results', 400, 'SESSION_ID_REQUIRED');
    }

    const session = await resultsRepo.getExamSessionById(sessionId);
    if (!session) {
      throw new AppError('Exam session not found', 404, 'SESSION_NOT_FOUND');
    }

    if (session.exam_id !== examId) {
      throw new AppError('Session does not belong to this exam', 400, 'INVALID_SESSION');
    }

    const isAssigned = await resultsRepo.isInvigilatorAssignedToSession(sessionId, user.userId);
    if (!isAssigned) {
      throw new AppError('Invigilator is not assigned to this session', 403, 'FORBIDDEN');
    }

    return exam;
  }

  throw new AppError('Forbidden', 403, 'FORBIDDEN');
}

/**
 * Lists evaluated results for an exam with pagination, filtering, and role scoping.
 *
 * @param {Object} params
 * @param {string} params.examId
 * @param {Object} params.user
 * @param {Object} [params.query]
 * @param {string} [params.query.sessionId]
 * @param {number} [params.query.limit=50]
 * @param {number} [params.query.offset=0]
 * @param {string} [params.requestId]
 * @returns {Promise<{ results: Array<object>, totalCount: number, limit: number, offset: number }>}
 */
export async function getExamResults({
  examId,
  user,
  query: { sessionId = null, limit = 50, offset = 0 } = {},
  requestId = null
}) {
  await authorizeStaffExamAccess({ examId, user, sessionId });

  const roles = getUserRoles(user);
  const isInvigilatorOnly = roles.includes('INVIGILATOR') && !roles.includes('ADMIN') && !roles.includes('FACULTY');
  const invigilatorUserId = isInvigilatorOnly ? user.userId : null;

  const { rows, totalCount } = await resultsRepo.listExamResults(examId, {
    sessionId,
    limit,
    offset,
    invigilatorUserId
  });

  const formattedResults = rows.map((row) => {
    const derived = calculateDerivedFields({
      score: row.score,
      totalMarks: row.total_marks,
      passingMarks: row.passing_marks
    });

    return {
      resultId: row.result_id,
      attemptId: row.attempt_id,
      studentId: row.student_id,
      studentName: row.student_name,
      studentEmail: row.student_email,
      sessionId: row.session_id,
      score: Number(row.score),
      totalMarks: Number(row.total_marks),
      passingMarks: Number(row.passing_marks),
      passed: derived.passed,
      percentage: derived.percentage,
      correctCount: row.correct_count,
      wrongCount: row.wrong_count,
      unansweredCount: row.unanswered_count,
      evaluatedAt: row.evaluated_at
    };
  });

  return {
    results: formattedResults,
    totalCount,
    limit,
    offset
  };
}

/**
 * Aggregates summary statistics for an exam's results.
 *
 * @param {Object} params
 * @param {string} params.examId
 * @param {Object} params.user
 * @param {Object} [params.query]
 * @param {string} [params.query.sessionId]
 * @param {string} [params.requestId]
 * @returns {Promise<object>}
 */
export async function getExamResultsSummary({
  examId,
  user,
  query: { sessionId = null } = {},
  requestId = null
}) {
  await authorizeStaffExamAccess({ examId, user, sessionId });

  const roles = getUserRoles(user);
  const isInvigilatorOnly = roles.includes('INVIGILATOR') && !roles.includes('ADMIN') && !roles.includes('FACULTY');
  const invigilatorUserId = isInvigilatorOnly ? user.userId : null;

  const summary = await resultsRepo.getExamResultsSummary(examId, {
    sessionId,
    invigilatorUserId
  });

  return {
    examId,
    totalAttempts: summary.total_attempts,
    evaluatedCount: summary.evaluated_count,
    passCount: summary.pass_count,
    failCount: summary.fail_count,
    averageScore: summary.average_score !== null ? Number(summary.average_score) : null,
    highestScore: summary.highest_score !== null ? Number(summary.highest_score) : null,
    lowestScore: summary.lowest_score !== null ? Number(summary.lowest_score) : null
  };
}

/**
 * Manually publishes results for an exam.
 * Allowed only for ADMIN or FACULTY owner when exam is in ENDED or EVALUATED state.
 *
 * @param {Object} params
 * @param {string} params.examId
 * @param {Object} params.user
 * @param {string} [params.requestId]
 * @returns {Promise<object>}
 */
export async function publishExamResults({ examId, user, requestId = null }) {
  const roles = getUserRoles(user);
  const isAdmin = roles.includes('ADMIN');
  const isFaculty = roles.includes('FACULTY');

  if (!isAdmin && !isFaculty) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const exam = await resultsRepo.getExamByIdWithLock(examId, client);
    if (!exam) {
      throw new AppError('Exam not found', 404, 'EXAM_NOT_FOUND');
    }

    if (!isAdmin && isFaculty && exam.created_by !== user.userId) {
      throw new AppError('Access denied to publish exam results', 403, 'FORBIDDEN');
    }

    // Idempotency: If already published, return existing status without error
    if (exam.status === ExamStatus.RESULT_PUBLISHED) {
      await client.query('COMMIT');
      return {
        examId: exam.exam_id,
        status: exam.status,
        resultsPublishedAt: exam.results_published_at
      };
    }

    // State machine check: Must be in ENDED or EVALUATED
    if (!['ENDED', 'EVALUATED'].includes(exam.status)) {
      throw new AppError(
        'Exam must be in ENDED or EVALUATED status to publish results',
        409,
        'INVALID_STATE_TRANSITION'
      );
    }

    const updatedExam = await resultsRepo.publishExamResults(examId, client);

    await resultsRepo.insertAuditLog({
      actorUserId: user.userId,
      action: 'EXAM_RESULTS_PUBLISHED',
      resourceType: 'EXAM',
      resourceId: examId,
      requestId,
      metadata: {
        previousStatus: exam.status,
        newStatus: 'RESULT_PUBLISHED'
      }
    }, client);

    await client.query('COMMIT');

    logger.info({
      examId,
      actorUserId: user.userId,
      resultsPublishedAt: updatedExam.results_published_at
    }, 'Exam results published successfully');

    return {
      examId: updatedExam.exam_id,
      status: updatedExam.status,
      resultsPublishedAt: updatedExam.results_published_at
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Updates the result release policy and scheduled release time for an exam.
 * Policy changes are forbidden once results have become candidate-visible.
 *
 * @param {Object} params
 * @param {string} params.examId
 * @param {Object} params.user
 * @param {string} params.policy
 * @param {Date|string|null} [params.releaseAt]
 * @param {string} [params.requestId]
 * @returns {Promise<object>}
 */
export async function updateReleasePolicy({
  examId,
  user,
  policy,
  releaseAt = null,
  requestId = null
}) {
  const roles = getUserRoles(user);
  const isAdmin = roles.includes('ADMIN');
  const isFaculty = roles.includes('FACULTY');

  if (!isAdmin && !isFaculty) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  // Pre-validate schedule consistency
  if (policy === ResultsReleasePolicy.SCHEDULED) {
    if (!releaseAt) {
      throw new AppError('Release time is required for SCHEDULED policy', 400, 'INVALID_RELEASE_POLICY');
    }
    const targetTime = new Date(releaseAt).getTime();
    if (isNaN(targetTime) || targetTime <= Date.now()) {
      throw new AppError('Scheduled release time must be in the future', 422, 'INVALID_RELEASE_TIME');
    }
  } else {
    releaseAt = null;
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const exam = await resultsRepo.getExamByIdWithLock(examId, client);
    if (!exam) {
      throw new AppError('Exam not found', 404, 'EXAM_NOT_FOUND');
    }

    if (!isAdmin && isFaculty && exam.created_by !== user.userId) {
      throw new AppError('Access denied to update exam release policy', 403, 'FORBIDDEN');
    }

    // 1. If exam has already been published, policy cannot be altered
    if (exam.status === ExamStatus.RESULT_PUBLISHED || exam.results_published_at !== null) {
      throw new AppError(
        'Release policy cannot be modified once results have been published',
        409,
        'RESULT_ALREADY_RELEASED'
      );
    }

    // 2. If scheduled release time has elapsed while exam is ended/evaluated
    if (
      exam.results_release_policy === ResultsReleasePolicy.SCHEDULED &&
      exam.results_release_at &&
      ['ENDED', 'EVALUATED'].includes(exam.status) &&
      new Date(exam.results_release_at).getTime() <= Date.now()
    ) {
      throw new AppError(
        'Release policy cannot be modified once scheduled release time has elapsed',
        409,
        'RESULT_ALREADY_RELEASED'
      );
    }

    // 3. Authoritative check: Have any candidates already gained visibility?
    const hasVisible = await resultsRepo.hasCandidateVisibleResults(examId, client);
    if (hasVisible) {
      throw new AppError(
        'Release policy cannot be modified after results have become candidate-visible',
        409,
        'RESULT_ALREADY_RELEASED'
      );
    }

    const updatedExam = await resultsRepo.updateExamReleasePolicy(
      examId,
      { policy, releaseAt },
      client
    );

    await resultsRepo.insertAuditLog({
      actorUserId: user.userId,
      action: 'EXAM_RELEASE_POLICY_UPDATED',
      resourceType: 'EXAM',
      resourceId: examId,
      requestId,
      metadata: {
        previousPolicy: exam.results_release_policy,
        newPolicy: policy,
        previousReleaseAt: exam.results_release_at,
        newReleaseAt: releaseAt
      }
    }, client);

    await client.query('COMMIT');

    logger.info({
      examId,
      actorUserId: user.userId,
      newPolicy: policy,
      newReleaseAt: releaseAt
    }, 'Exam release policy updated successfully');

    return {
      examId: updatedExam.exam_id,
      resultsReleasePolicy: updatedExam.results_release_policy,
      resultsReleaseAt: updatedExam.results_release_at
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
