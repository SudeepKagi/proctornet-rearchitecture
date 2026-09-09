/**
 * @file manualGrading.service.js
 * @description Business service for manual grading, score overrides, and audit trail.
 * Enforces strict faculty/admin authorization and boundary validation.
 */

import * as manualGradingRepo from './manualGrading.repository.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { logger } from '../../utils/logger.js';

export async function getEvaluation(resultId, userId, role) {
  const evaluation = await manualGradingRepo.findEvaluationByResultId(resultId);
  if (!evaluation) {
    throw new NotFoundError(`Evaluation result with ID '${resultId}' not found`);
  }

  // Authorization: FACULTY who owns the exam, or ADMIN
  if (role !== 'ADMIN' && evaluation.attempt.exam_created_by !== userId) {
    throw new ForbiddenError('Access denied: You do not have permission to evaluate this attempt');
  }

  return evaluation;
}

export async function submitManualGrade(resultId, payload, userId, role, clientIp = '127.0.0.1') {
  const evaluation = await getEvaluation(resultId, userId, role);

  const { attemptQuestionId, pointsAwarded, rubricScores, feedback, rationale } = payload;

  // Find the target attempt question in the loaded evaluation
  const targetQuestion = evaluation.questions.find(
    q => q.attempt_question_id === attemptQuestionId
  );
  if (!targetQuestion) {
    throw new NotFoundError(`Question '${attemptQuestionId}' not found in attempt '${evaluation.attempt.attempt_id}'`);
  }

  const maxPoints = Number(targetQuestion.default_points || 1.0);
  if (pointsAwarded > maxPoints) {
    throw new ValidationError(
      `Awarded points (${pointsAwarded}) cannot exceed maximum allowed points (${maxPoints}) for this question`
    );
  }

  const result = await manualGradingRepo.saveManualGrade({
    attemptQuestionId,
    attemptId: evaluation.attempt.attempt_id,
    graderUserId: userId,
    pointsAwarded,
    maxPoints,
    rubricScores: rubricScores || {},
    feedback: feedback || null,
    rationale
  });

  await recordAuditEvent({
    userId,
    action: 'MANUAL_SCORE_OVERRIDDEN',
    resourceType: 'MANUAL_GRADE',
    resourceId: result.grade.grade_id,
    ipAddress: clientIp,
    metadata: {
      resultId,
      attemptId: evaluation.attempt.attempt_id,
      attemptQuestionId,
      previousPoints: result.previousPoints,
      newPoints: result.newPoints,
      recalculatedScore: result.recalculatedScore,
      rationale
    }
  }).catch(err => logger.warn({ err }, 'Audit event recording non-blocking error'));

  return result;
}

export async function getAuditHistory(resultId, userId, role) {
  const evaluation = await getEvaluation(resultId, userId, role);
  return manualGradingRepo.findGradeAuditHistory(evaluation.attempt.attempt_id);
}
