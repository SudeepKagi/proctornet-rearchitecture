/**
 * @file exams.controller.js
 * @description HTTP request handlers for Exam authoring, topic rules, and publishing.
 */

import { BadRequestError } from '../../utils/errors.js';
import {
  createExamSchema,
  updateExamSchema,
  examTopicRuleSchema,
  examQuerySchema
} from './exams.schemas.js';
import * as examsService from './exams.service.js';
import { getExamAnalytics } from './examAnalytics.service.js';

/**
 * Handles creating a new draft exam.
 */
export async function handleCreateExam(req, res, next) {
  try {
    const parseResult = createExamSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid exam data provided', parseResult.error.format());
    }

    const userId = req.user.userId;
    const requestId = req.id || req.requestId;

    const exam = await examsService.createExam(parseResult.data, userId, requestId);

    res.status(201).json({
      status: 'success',
      data: { exam }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles fetching exam details and topic rules by ID.
 */
export async function handleGetExam(req, res, next) {
  try {
    const { id } = req.params;
    const exam = await examsService.getExamById(id);

    res.status(200).json({
      status: 'success',
      data: { exam }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles updating draft exam metadata.
 */
export async function handleUpdateExam(req, res, next) {
  try {
    const { id } = req.params;
    const parseResult = updateExamSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid exam update data', parseResult.error.format());
    }

    const requestId = req.id || req.requestId;
    const updatedExam = await examsService.updateDraftExam(id, parseResult.data, req.user, requestId);

    res.status(200).json({
      status: 'success',
      data: { exam: updatedExam }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles adding or updating a topic rule on a draft exam.
 */
export async function handleAddTopicRule(req, res, next) {
  try {
    const { id } = req.params;
    const parseResult = examTopicRuleSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid topic rule configuration', parseResult.error.format());
    }

    const requestId = req.id || req.requestId;
    const rule = await examsService.configureTopicRule(id, parseResult.data, req.user, requestId);

    res.status(201).json({
      status: 'success',
      data: { rule }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles deleting a topic rule from a draft exam.
 */
export async function handleDeleteTopicRule(req, res, next) {
  try {
    const { id, ruleId } = req.params;
    const requestId = req.id || req.requestId;

    await examsService.removeTopicRule(id, ruleId, req.user, requestId);

    res.status(200).json({
      status: 'success',
      message: 'Topic rule deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles publishing an exam and freezing its blueprint.
 */
export async function handlePublishExam(req, res, next) {
  try {
    const { id } = req.params;
    const requestId = req.id || req.requestId;

    const publishedExam = await examsService.publishExam(id, req.user, requestId);

    res.status(200).json({
      status: 'success',
      data: { exam: publishedExam }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles listing exams with pagination and filters.
 */
export async function handleListExams(req, res, next) {
  try {
    const parseResult = examQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid query parameters', parseResult.error.format());
    }

    const result = await examsService.listExams(parseResult.data, req.user);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles inspecting blueprint validation details.
 */
export async function handleValidateBlueprint(req, res, next) {
  try {
    const { id } = req.params;
    const validation = await examsService.getBlueprintValidation(id, req.user);
    res.status(200).json({
      status: 'success',
      data: { validation }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles fetching psychometric item difficulty, discrimination, histograms, and completion statistics.
 */
export async function handleGetExamAnalytics(req, res, next) {
  try {
    const { id } = req.params;
    const forceRefresh = req.query.refresh === 'true';
    const analytics = await getExamAnalytics(id, req.user, forceRefresh);
    res.status(200).json({
      status: 'success',
      data: analytics
    });
  } catch (err) {
    next(err);
  }
}

