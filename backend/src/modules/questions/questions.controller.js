/**
 * @file questions.controller.js
 * @description HTTP Controllers for Question Bank and Rich Question Authoring endpoints.
 * Conforms to Phase 26 Track 1 Workstream A.
 */

import * as questionsService from './questions.service.js';
import {
  createQuestionBankSchema,
  updateQuestionBankSchema,
  createQuestionSchema,
  updateQuestionSchema,
  cloneQuestionSchema,
  searchQuestionsQuerySchema
} from './questions.schemas.js';

// ==========================================
// Question Bank Controllers
// ==========================================

export async function createBank(req, res, next) {
  try {
    const validated = createQuestionBankSchema.parse(req.body);
    const bank = await questionsService.createBank(req.user.user_id, validated, req.ip);
    res.status(201).json({ success: true, data: bank });
  } catch (err) {
    next(err);
  }
}

export async function listBanks(req, res, next) {
  try {
    const filters = {
      subject_id: req.query.subject_id,
      is_shared: req.query.is_shared !== undefined ? req.query.is_shared === 'true' : undefined
    };
    const banks = await questionsService.listBanks(req.user.user_id, req.user.role, filters);
    res.status(200).json({ success: true, data: banks });
  } catch (err) {
    next(err);
  }
}

export async function getBank(req, res, next) {
  try {
    const bank = await questionsService.getBank(req.params.bankId, req.user.user_id, req.user.role);
    res.status(200).json({ success: true, data: bank });
  } catch (err) {
    next(err);
  }
}

export async function updateBank(req, res, next) {
  try {
    const validated = updateQuestionBankSchema.parse(req.body);
    const updated = await questionsService.updateBank(req.params.bankId, req.user.user_id, req.user.role, validated, req.ip);
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function deleteBank(req, res, next) {
  try {
    const result = await questionsService.deleteBank(req.params.bankId, req.user.user_id, req.user.role, req.ip);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// ==========================================
// Question Controllers
// ==========================================

export async function createQuestion(req, res, next) {
  try {
    const validated = createQuestionSchema.parse(req.body);
    const question = await questionsService.createQuestion(req.user.user_id, req.user.role, validated, req.ip);
    res.status(201).json({ success: true, data: question });
  } catch (err) {
    next(err);
  }
}

export async function getQuestion(req, res, next) {
  try {
    const question = await questionsService.getQuestion(req.params.id, req.user.user_id, req.user.role);
    res.status(200).json({ success: true, data: question });
  } catch (err) {
    next(err);
  }
}

export async function searchQuestions(req, res, next) {
  try {
    const validatedQuery = searchQuestionsQuerySchema.parse(req.query);
    const result = await questionsService.searchQuestions(req.user.user_id, req.user.role, validatedQuery);
    res.status(200).json({ success: true, data: result.questions, pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function updateQuestion(req, res, next) {
  try {
    const validated = updateQuestionSchema.parse(req.body);
    const updated = await questionsService.updateQuestion(req.params.id, req.user.user_id, req.user.role, validated, req.ip);
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function archiveQuestion(req, res, next) {
  try {
    const archived = await questionsService.archiveQuestion(req.params.id, req.user.user_id, req.user.role, req.ip);
    res.status(200).json({ success: true, data: archived });
  } catch (err) {
    next(err);
  }
}

export async function cloneQuestion(req, res, next) {
  try {
    const validated = cloneQuestionSchema.parse(req.body || {});
    const cloned = await questionsService.cloneQuestion(req.params.id, req.user.user_id, req.user.role, validated, req.ip);
    res.status(201).json({ success: true, data: cloned });
  } catch (err) {
    next(err);
  }
}
