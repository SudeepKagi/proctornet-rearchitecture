/**
 * @file exams.service.js
 * @description Business workflow service for Exam authoring, topic rules, and publishing lifecycle.
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
import {
  validateExamDefinition,
  assertExamCanBeMutated
} from '../../domain/exam/examInvariants.js';
import { transitionExamState } from '../../domain/exam/examStateMachine.js';
import * as examsRepo from './exams.repository.js';
import { cacheService } from '../../infrastructure/redis/cacheService.js';
import { validateExamBlueprint } from './blueprintValidator.js';

/**
 * Creates a new draft exam.
 * @param {object} payload
 * @param {string} userId - Authenticated creator ID
 * @param {string} [requestId]
 * @returns {Promise<object>}
 */
export async function createExam(payload, userId, requestId = null) {
  const subject = await examsRepo.findSubjectById(payload.subject_id);
  if (!subject) {
    throw new NotFoundError(`Subject with ID '${payload.subject_id}' not found`);
  }

  // Validate core business invariants using pure domain logic
  validateExamDefinition({
    title: payload.title,
    duration_minutes: payload.duration_minutes,
    total_marks: payload.total_marks,
    passing_marks: payload.passing_marks,
    status: ExamStatus.DRAFT
  });

  const exam = await examsRepo.createExam({
    title: payload.title,
    description: payload.description,
    subjectId: payload.subject_id,
    durationMinutes: payload.duration_minutes,
    totalMarks: payload.total_marks,
    passingMarks: payload.passing_marks,
    createdBy: userId
  });

  await examsRepo.createAuditLog({
    actorUserId: userId,
    action: 'EXAM_CREATED',
    resourceType: 'EXAM',
    resourceId: exam.exam_id,
    requestId,
    metadata: { title: exam.title, subjectId: exam.subject_id, totalMarks: exam.total_marks }
  });

  logger.info({ examId: exam.exam_id, createdBy: userId }, 'Exam created in DRAFT status');
  return exam;
}

/**
 * Retrieves full exam details including topic rules and subject info.
 * @param {string} examId
 * @returns {Promise<object>}
 */
export async function getExamById(examId) {
  const cacheKey = `v1:exam:${examId}`;
  const cached = await cacheService.get(cacheKey);
  if (cached) {
    return cached;
  }

  const exam = await examsRepo.findExamById(examId);
  if (!exam) {
    throw new NotFoundError(`Exam with ID '${examId}' not found`);
  }

  const topicRules = await examsRepo.getTopicRules(examId);

  const result = {
    ...exam,
    topic_rules: topicRules
  };

  if (exam.status === ExamStatus.PUBLISHED) {
    await cacheService.set(cacheKey, result, 3600);
  }

  return result;
}

/**
 * Updates draft exam metadata.
 * @param {string} examId
 * @param {object} updates
 * @param {object} user - Authenticated user context { userId, roles }
 * @param {string} [requestId]
 * @returns {Promise<object>}
 */
export async function updateDraftExam(examId, updates, user, requestId = null) {
  const exam = await examsRepo.findExamById(examId);
  if (!exam) {
    throw new NotFoundError(`Exam with ID '${examId}' not found`);
  }

  // Ownership verification: Creator or ADMIN
  const isOwner = exam.created_by === user.userId;
  const isAdmin = (user.roles || []).includes('ADMIN');
  if (!isOwner && !isAdmin) {
    throw new ForbiddenError('Access denied: You do not have permission to modify this exam');
  }

  // Enforce Phase 3 Domain Invariant: Only DRAFT exams can be modified
  assertExamCanBeMutated(exam.status);

  // Validate merged attributes
  validateExamDefinition({
    title: updates.title !== undefined ? updates.title : exam.title,
    duration_minutes: updates.duration_minutes !== undefined ? updates.duration_minutes : exam.duration_minutes,
    total_marks: updates.total_marks !== undefined ? updates.total_marks : Number(exam.total_marks),
    passing_marks: updates.passing_marks !== undefined ? updates.passing_marks : Number(exam.passing_marks),
    status: exam.status
  });

  const updatedExam = await examsRepo.updateExam(examId, updates);
  await cacheService.del(`v1:exam:${examId}`);

  await examsRepo.createAuditLog({
    actorUserId: user.userId,
    action: 'EXAM_UPDATED',
    resourceType: 'EXAM',
    resourceId: examId,
    requestId,
    metadata: { updates }
  });

  logger.info({ examId, updatedBy: user.userId }, 'Draft exam updated');
  return updatedExam;
}

/**
 * Adds or updates a topic question rule for a draft exam.
 * @param {string} examId
 * @param {object} ruleData
 * @param {object} user
 * @param {string} [requestId]
 * @returns {Promise<object>}
 */
export async function configureTopicRule(examId, ruleData, user, requestId = null) {
  const exam = await examsRepo.findExamById(examId);
  if (!exam) {
    throw new NotFoundError(`Exam with ID '${examId}' not found`);
  }

  const isOwner = exam.created_by === user.userId;
  const isAdmin = (user.roles || []).includes('ADMIN');
  if (!isOwner && !isAdmin) {
    throw new ForbiddenError('Access denied: You do not have permission to configure topic rules for this exam');
  }

  assertExamCanBeMutated(exam.status);

  const topic = await examsRepo.findTopicById(ruleData.topic_id);
  if (!topic) {
    throw new NotFoundError(`Topic with ID '${ruleData.topic_id}' not found`);
  }

  if (topic.subject_id !== exam.subject_id) {
    throw new BadRequestError(
      `Topic '${topic.name}' belongs to subject '${topic.subject_id}', which does not match exam subject '${exam.subject_id}'`
    );
  }

  const rule = await examsRepo.addOrUpdateTopicRule(examId, {
    topicId: ruleData.topic_id,
    questionCount: ruleData.question_count,
    pointsPerQuestion: ruleData.points_per_question
  });
  await cacheService.del(`v1:exam:${examId}`);

  await examsRepo.createAuditLog({
    actorUserId: user.userId,
    action: 'EXAM_TOPIC_RULE_CONFIGURED',
    resourceType: 'EXAM',
    resourceId: examId,
    requestId,
    metadata: { ruleId: rule.rule_id, topicId: rule.topic_id }
  });

  return rule;
}

/**
 * Removes a topic rule from a draft exam.
 * @param {string} examId
 * @param {string} ruleId
 * @param {object} user
 * @param {string} [requestId]
 * @returns {Promise<void>}
 */
export async function removeTopicRule(examId, ruleId, user, requestId = null) {
  const exam = await examsRepo.findExamById(examId);
  if (!exam) {
    throw new NotFoundError(`Exam with ID '${examId}' not found`);
  }

  const isOwner = exam.created_by === user.userId;
  const isAdmin = (user.roles || []).includes('ADMIN');
  if (!isOwner && !isAdmin) {
    throw new ForbiddenError('Access denied: You do not have permission to delete topic rules for this exam');
  }

  assertExamCanBeMutated(exam.status);

  const deleted = await examsRepo.deleteTopicRule(examId, ruleId);
  if (!deleted) {
    throw new NotFoundError(`Topic rule with ID '${ruleId}' not found on this exam`);
  }
  await cacheService.del(`v1:exam:${examId}`);

  await examsRepo.createAuditLog({
    actorUserId: user.userId,
    action: 'EXAM_TOPIC_RULE_DELETED',
    resourceType: 'EXAM',
    resourceId: examId,
    requestId,
    metadata: { ruleId }
  });
}

/**
 * Validates blueprint consistency, question bank inventory, and publishes the exam.
 * Freezes the exam contract against future modifications.
 * @param {string} examId
 * @param {object} user
 * @param {string} [requestId]
 * @returns {Promise<object>} Published exam
 */
export async function publishExam(examId, user, requestId = null) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Acquire row lock on the exam to serialize concurrent publish requests
    const exam = await examsRepo.findExamByIdForUpdate(examId, client);
    if (!exam) {
      throw new NotFoundError(`Exam with ID '${examId}' not found`);
    }

    const isOwner = exam.created_by === user.userId;
    const isAdmin = (user.roles || []).includes('ADMIN');
    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('Access denied: You do not have permission to publish this exam');
    }

    // 2. State Machine Validation: DRAFT -> PUBLISHED
    const nextStatus = transitionExamState(exam.status, ExamStatus.PUBLISHED);

    // 3. Comprehensive Blueprint & Inventory Validation
    const validation = await validateExamBlueprint(examId, client);
    if (!validation.isValid) {
      throw new ConflictError(
        `Cannot publish exam: Blueprint validation failed: ${validation.issues.join('; ')}`
      );
    }

    // 6. Transition state to PUBLISHED
    const updatedExam = await examsRepo.updateExam(examId, { status: nextStatus }, client);

    // 7. Audit log
    await examsRepo.createAuditLog(
      {
        actorUserId: user.userId,
        action: 'EXAM_PUBLISHED',
        resourceType: 'EXAM',
        resourceId: examId,
        requestId,
        metadata: { topicRulesCount: validation.ruleCount, totalMarks: validation.totalMarks }
      },
      client
    );

    await client.query('COMMIT');
    await cacheService.del(`v1:exam:${examId}`);
    logger.info({ examId, publishedBy: user.userId }, 'Exam successfully published');
    return updatedExam;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lists exams with pagination and filters.
 * @param {object} params
 * @param {object} user
 * @returns {Promise<object>}
 */
export async function listExams(params, user) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const offset = (page - 1) * limit;

  // If user is FACULTY and not ADMIN, they see their created exams by default unless querying specific status
  let createdBy = params.createdBy;
  if (!createdBy && (user.roles || []).includes('FACULTY') && !(user.roles || []).includes('ADMIN')) {
    createdBy = user.userId;
  }

  const queryParams = {
    createdBy,
    status: params.status,
    subjectId: params.subject_id,
    limit,
    offset
  };

  const [exams, total] = await Promise.all([
    examsRepo.listExams(queryParams),
    examsRepo.countExams(queryParams)
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    exams,
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  };
}

/**
 * Retrieves blueprint validation details for an exam.
 * @param {string} examId
 * @param {object} user
 * @returns {Promise<object>}
 */
export async function getBlueprintValidation(examId, user) {
  const exam = await examsRepo.findExamById(examId);
  if (!exam) {
    throw new NotFoundError(`Exam with ID '${examId}' not found`);
  }

  const isOwner = exam.created_by === user.userId;
  const isAdmin = (user.roles || []).includes('ADMIN');
  if (!isOwner && !isAdmin) {
    throw new ForbiddenError('Access denied: You do not have permission to inspect this exam blueprint');
  }

  return validateExamBlueprint(examId);
}
