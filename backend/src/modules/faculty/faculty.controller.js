/**
 * @file faculty.controller.js
 * @description Controller actions for Faculty Portal endpoints.
 */

import * as facultyService from './faculty.service.js';
import * as llmService from './llm.service.js';
import { BadRequestError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export async function getDashboardStatsHandler(req, res, next) {
  try {
    const stats = await facultyService.getDashboardStats(req.user.userId);
    res.status(200).json({ status: 'success', data: stats });
  } catch (err) {
    next(err);
  }
}

export async function listFacultyExamsHandler(req, res, next) {
  try {
    const { tab } = req.query;
    const exams = await facultyService.listFacultyExams({ tab }, req.user.userId);
    res.status(200).json({ status: 'success', data: exams });
  } catch (err) {
    next(err);
  }
}

export async function listQuestionPoolsHandler(req, res, next) {
  try {
    const pools = await facultyService.listQuestionPools(req.user.userId);
    res.status(200).json({ status: 'success', data: pools });
  } catch (err) {
    next(err);
  }
}

export async function createQuestionPoolHandler(req, res, next) {
  try {
    const { name, description, subject_id } = req.body;
    const pool = await facultyService.createQuestionPool({
      name,
      description,
      subjectId: subject_id,
      facultyUserId: req.user.userId
    });
    res.status(201).json({ status: 'success', data: pool });
  } catch (err) {
    next(err);
  }
}

export async function getTopicPoolQuestionsHandler(req, res, next) {
  try {
    const { topicId } = req.params;
    const questions = await facultyService.getTopicPoolQuestions(topicId);
    res.status(200).json({ status: 'success', data: questions });
  } catch (err) {
    next(err);
  }
}

export async function generateMCQsFromPdfHandler(req, res, next) {
  try {
    logger.info({
      hasFile: Boolean(req.file),
      fileSize: req.file?.size,
      mimetype: req.file?.mimetype,
      filename: req.file?.originalname,
      topicName: req.body?.topicName,
      questionCount: req.body?.questionCount,
      difficulty: req.body?.difficulty
    }, 'Faculty AI PDF question generation request initiated');

    if (!req.file || !req.file.buffer) {
      throw new BadRequestError('PDF file is required');
    }

    const { topicName, questionCount, difficulty } = req.body;
    if (!topicName || !topicName.trim()) {
      throw new BadRequestError('Topic name is required');
    }

    // Extract text from uploaded PDF
    const extractedText = await llmService.extractTextFromPdf(req.file.buffer);
    logger.info({ extractedLength: extractedText.length, sample: extractedText.slice(0, 150) }, 'PDF text parsed successfully');

    // Call LLM / Heuristic Engine
    const questions = await llmService.generateMCQsFromText({
      text: extractedText,
      topicName: topicName.trim(),
      questionCount: Number(questionCount) || 5,
      difficulty: difficulty || 'MEDIUM'
    });
    logger.info({ questionCount: questions.length }, 'Generated MCQs successfully');

    res.status(200).json({
      status: 'success',
      data: {
        topicName: topicName.trim(),
        questionCount: questions.length,
        questions
      }
    });
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'generateMCQsFromPdfHandler failed');
    next(err);
  }
}

export async function saveQuestionsToPoolHandler(req, res, next) {
  try {
    const { topicId } = req.params;
    const { questions } = req.body;
    const result = await facultyService.saveQuestionsToPool({
      topicId,
      questions,
      facultyUserId: req.user.userId
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
}

export async function scheduleExamHandler(req, res, next) {
  try {
    const result = await facultyService.scheduleExam(req.body, req.user?.userId);

    return res.status(201).json({
      status: 'success',
      success: true,
      data: result
    });
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'scheduleExamHandler failed');
    if (err.statusCode && typeof err.statusCode === 'number') {
      return res.status(err.statusCode).json({
        status: 'error',
        success: false,
        message: err.message,
        error: {
          code: err.code || 'BAD_REQUEST',
          message: err.message
        }
      });
    }
    return next(err);
  }
}

export async function getExamDetailsHandler(req, res, next) {
  try {
    const { examId } = req.params;
    const result = await facultyService.getExamDetails(examId, req.user?.userId);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
}

export async function updateFacultyExamHandler(req, res, next) {
  try {
    const { examId } = req.params;
    const result = await facultyService.updateFacultyExam(examId, req.body, req.user?.userId);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
}

export async function cancelExamHandler(req, res, next) {
  try {
    const { examId } = req.params;
    const result = await facultyService.cancelExam(examId, req.user.userId);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
}

export async function getExamAnalyticsSummaryHandler(req, res, next) {
  try {
    const { examId } = req.params;
    const analytics = await facultyService.getExamAnalyticsSummary(examId, req.user.userId);
    res.status(200).json({ status: 'success', data: analytics });
  } catch (err) {
    next(err);
  }
}
