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
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max PDF upload
});

export const facultyRouter = Router();

// Strict security: Authenticate, Require Verified Active User, Require FACULTY or ADMIN role
facultyRouter.use(authenticate, requireVerifiedActiveUser, requireRole('FACULTY', 'ADMIN'));

// 1. Dashboard Overview Stats
facultyRouter.get('/dashboard/stats', facultyController.getDashboardStatsHandler);

// 2. Exams Management & Scheduling
facultyRouter.get('/exams', facultyController.listFacultyExamsHandler);
facultyRouter.get('/exams/:examId', facultyController.getExamDetailsHandler);
facultyRouter.post('/exams/schedule', facultyController.scheduleExamHandler);
facultyRouter.post('/exams', facultyController.scheduleExamHandler);
facultyRouter.put('/exams/:examId', facultyController.updateFacultyExamHandler);
facultyRouter.put('/exams/:examId/cancel', facultyController.cancelExamHandler);
facultyRouter.get('/exams/:examId/analytics-summary', facultyController.getExamAnalyticsSummaryHandler);
facultyRouter.post('/exams/generate-from-pdf', upload.single('pdf'), facultyController.generateMCQsFromPdfHandler);
