/**
 * @file faculty.routes.js
 * @description Express router for the Faculty Portal module.
 * Mounted at /api/v1/faculty
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { requireVerifiedActiveUser } from '../../middleware/verificationGate.js';
import * as facultyController from './faculty.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max PDF upload
});

export const facultyRouter = Router();

// Strict security: Authenticate, Require Verified Active User, Require FACULTY or ADMIN role
facultyRouter.use(authenticate, requireVerifiedActiveUser, requireRole('FACULTY', 'ADMIN'));

// 1. Dashboard Overview Stats
facultyRouter.get('/dashboard/stats', facultyController.getDashboardStatsHandler);

// 2. Exams Management & Scheduling
facultyRouter.get('/exams', facultyController.listFacultyExamsHandler);
facultyRouter.post('/exams/schedule', facultyController.scheduleExamHandler);
facultyRouter.put('/exams/:examId', facultyController.updateFacultyExamHandler);
facultyRouter.put('/exams/:examId/cancel', facultyController.cancelExamHandler);
facultyRouter.get('/exams/:examId/analytics-summary', facultyController.getExamAnalyticsSummaryHandler);

// 3. Question Pools & AI PDF Generation
facultyRouter.get('/question-pools', facultyController.listQuestionPoolsHandler);
facultyRouter.post('/question-pools', facultyController.createQuestionPoolHandler);
facultyRouter.get('/question-pools/:topicId/questions', facultyController.getTopicPoolQuestionsHandler);
facultyRouter.post(
  '/question-pools/generate-from-pdf',
  upload.single('pdf'),
  facultyController.generateMCQsFromPdfHandler
);
facultyRouter.post('/question-pools/:topicId/save-questions', facultyController.saveQuestionsToPoolHandler);
