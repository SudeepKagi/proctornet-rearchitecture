/**
 * @file questions.service.js
 * @description Business service for Question Banks and Rich Question Authoring.
 * Enforces ownership, sharing authorization, and audit logging.
 */

import * as questionsRepo from './questions.repository.js';
import { validateQuestion } from '../../domain/question/questionTypes.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { logger } from '../../utils/logger.js';

// ==========================================
// Question Bank Service
// ==========================================

export async function createBank(userId, data, clientIp = '127.0.0.1') {
  const bank = await questionsRepo.createBank({
    created_by: userId,
    title: data.title,
    description: data.description,
    subject_id: data.subject_id,
    is_shared: data.is_shared
  });

  await recordAuditEvent({
    userId,
    action: 'FACULTY_QUESTION_BANK_CREATED',
    resourceType: 'QUESTION_BANK',
    resourceId: bank.bank_id,
    ipAddress: clientIp,
    metadata: { title: bank.title, subject_id: bank.subject_id, is_shared: bank.is_shared }
  }).catch(err => logger.warn({ err }, 'Audit event recording non-blocking error'));

  return bank;
}

export async function listBanks(userId, role, filters) {
  if (role === 'ADMIN') {
    // Admin can list all banks
    return questionsRepo.listBanksForUser(userId, filters);
  }
  return questionsRepo.listBanksForUser(userId, filters);
}

export async function getBank(bankId, userId, role) {
  const bank = await questionsRepo.findBankById(bankId);
  if (!bank) {
    throw new NotFoundError(`Question bank with ID '${bankId}' not found`);
  }

  // BOLA authorization: must be creator, shared bank, or admin
  if (bank.created_by !== userId && !bank.is_shared && role !== 'ADMIN') {
    throw new ForbiddenError('You do not have permission to access this question bank');
  }

  return bank;
}

export async function updateBank(bankId, userId, role, data, clientIp = '127.0.0.1') {
  const bank = await getBank(bankId, userId, role);

  if (bank.created_by !== userId && role !== 'ADMIN') {
    throw new ForbiddenError('Only the creator or an administrator can update this question bank');
  }

  const updated = await questionsRepo.updateBank(bankId, data);

  await recordAuditEvent({
    userId,
    action: 'FACULTY_QUESTION_BANK_UPDATED',
    resourceType: 'QUESTION_BANK',
    resourceId: bankId,
    ipAddress: clientIp,
    metadata: { updatedFields: Object.keys(data) }
  }).catch(err => logger.warn({ err }, 'Audit event recording non-blocking error'));

  return updated;
}

export async function deleteBank(bankId, userId, role, clientIp = '127.0.0.1') {
  const bank = await getBank(bankId, userId, role);

  if (bank.created_by !== userId && role !== 'ADMIN') {
    throw new ForbiddenError('Only the creator or an administrator can delete this question bank');
  }

  await questionsRepo.deleteBank(bankId);

  await recordAuditEvent({
    userId,
    action: 'FACULTY_QUESTION_BANK_DELETED',
    resourceType: 'QUESTION_BANK',
    resourceId: bankId,
    ipAddress: clientIp,
    metadata: { title: bank.title }
  }).catch(err => logger.warn({ err }, 'Audit event recording non-blocking error'));

  return { success: true, bank_id: bankId };
}

// ==========================================
// Question Service
// ==========================================

export async function createQuestion(userId, role, data, clientIp = '127.0.0.1') {
  // If bank_id provided, verify write access
  if (data.bank_id) {
    const bank = await questionsRepo.findBankById(data.bank_id);
    if (!bank) {
      throw new NotFoundError(`Question bank with ID '${data.bank_id}' not found`);
    }
    if (bank.created_by !== userId && role !== 'ADMIN') {
      throw new ForbiddenError('You can only add questions to question banks you own');
    }
  }

  // Domain invariant validation
  validateQuestion({
    question_type: data.question_type,
    prompt_text: data.prompt_text,
    default_points: data.default_points,
    correct_numeric_value: data.correct_numeric_value,
    options: data.options,
    rubric: data.rubric
  });

  const question = await questionsRepo.createQuestion(data);

  await recordAuditEvent({
    userId,
    action: 'FACULTY_QUESTION_CREATED',
    resourceType: 'QUESTION',
    resourceId: question.question_id,
    ipAddress: clientIp,
    metadata: {
      bank_id: question.bank_id,
      topic_id: question.topic_id,
      question_type: question.question_type,
      difficulty: question.difficulty,
      bloom_level: question.bloom_level
    }
  }).catch(err => logger.warn({ err }, 'Audit event recording non-blocking error'));

  return question;
}

export async function getQuestion(questionId, userId, role) {
  const question = await questionsRepo.findQuestionById(questionId);
  if (!question) {
    throw new NotFoundError(`Question with ID '${questionId}' not found`);
  }

  // BOLA check if linked to a private question bank
  if (question.bank_id && question.bank_created_by !== userId && !question.bank_is_shared && role !== 'ADMIN') {
    throw new ForbiddenError('You do not have permission to access this question');
  }

  return question;
}

export async function searchQuestions(userId, role, queryParams) {
  const { page = 1, limit = 20, ...filters } = queryParams;
  const offset = (page - 1) * limit;

  // If searching specific bank, verify access
  if (filters.bank_id) {
    await getBank(filters.bank_id, userId, role);
  }

  const [questions, total] = await Promise.all([
    questionsRepo.searchQuestions(filters, { limit, offset }),
    questionsRepo.countQuestions(filters)
  ]);

  return {
    questions,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit)
    }
  };
}

export async function updateQuestion(questionId, userId, role, data, clientIp = '127.0.0.1') {
  const existing = await getQuestion(questionId, userId, role);

  if (existing.bank_id && existing.bank_created_by !== userId && role !== 'ADMIN') {
    throw new ForbiddenError('You cannot modify questions authored by another faculty member');
  }

  const merged = {
    question_type: existing.question_type,
    prompt_text: data.prompt_text || existing.prompt_text,
    default_points: data.default_points !== undefined ? data.default_points : Number(existing.default_points),
    correct_numeric_value: data.correct_numeric_value !== undefined ? data.correct_numeric_value : existing.correct_numeric_value,
    options: data.options || existing.options,
    rubric: data.rubric !== undefined ? data.rubric : existing.rubric
  };

  validateQuestion(merged);

  const updated = await questionsRepo.updateQuestion(questionId, data);

  await recordAuditEvent({
    userId,
    action: 'FACULTY_QUESTION_UPDATED',
    resourceType: 'QUESTION',
    resourceId: questionId,
    ipAddress: clientIp,
    metadata: { version: updated.version, updatedFields: Object.keys(data) }
  }).catch(err => logger.warn({ err }, 'Audit event recording non-blocking error'));

  return updated;
}

export async function archiveQuestion(questionId, userId, role, clientIp = '127.0.0.1') {
  const existing = await getQuestion(questionId, userId, role);

  if (existing.bank_id && existing.bank_created_by !== userId && role !== 'ADMIN') {
    throw new ForbiddenError('You cannot archive questions authored by another faculty member');
  }

  const archived = await questionsRepo.archiveQuestion(questionId);

  await recordAuditEvent({
    userId,
    action: 'FACULTY_QUESTION_ARCHIVED',
    resourceType: 'QUESTION',
    resourceId: questionId,
    ipAddress: clientIp,
    metadata: { question_id: questionId }
  }).catch(err => logger.warn({ err }, 'Audit event recording non-blocking error'));

  return archived;
}

export async function cloneQuestion(questionId, userId, role, cloneParams, clientIp = '127.0.0.1') {
  const source = await getQuestion(questionId, userId, role);

  if (cloneParams.target_bank_id) {
    const targetBank = await questionsRepo.findBankById(cloneParams.target_bank_id);
    if (!targetBank) {
      throw new NotFoundError(`Target question bank '${cloneParams.target_bank_id}' not found`);
    }
    if (targetBank.created_by !== userId && role !== 'ADMIN') {
      throw new ForbiddenError('You do not own the target question bank');
    }
  }

  const cloned = await questionsRepo.cloneQuestion(questionId, cloneParams);

  await recordAuditEvent({
    userId,
    action: 'FACULTY_QUESTION_CLONED',
    resourceType: 'QUESTION',
    resourceId: cloned.question_id,
    ipAddress: clientIp,
    metadata: { source_question_id: questionId, new_question_id: cloned.question_id }
  }).catch(err => logger.warn({ err }, 'Audit event recording non-blocking error'));

  return cloned;
}
