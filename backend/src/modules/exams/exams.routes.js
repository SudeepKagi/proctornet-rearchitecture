/**
 * @file exams.routes.js
 * @description Express router for Exam authoring, topic rules, and publishing lifecycle.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import {
  handleCreateExam,
  handleGetExam,
  handleUpdateExam,
  handleAddTopicRule,
  handleDeleteTopicRule,
  handlePublishExam,
  handleListExams
} from './exams.controller.js';

export const examsRouter = Router();

// Protected exam routes
examsRouter.post('/', authenticate, requireRole('FACULTY', 'ADMIN'), handleCreateExam);
examsRouter.get('/', authenticate, handleListExams);
examsRouter.get('/:id', authenticate, handleGetExam);
examsRouter.put('/:id', authenticate, requireRole('FACULTY', 'ADMIN'), handleUpdateExam);
examsRouter.post('/:id/rules', authenticate, requireRole('FACULTY', 'ADMIN'), handleAddTopicRule);
examsRouter.delete('/:id/rules/:ruleId', authenticate, requireRole('FACULTY', 'ADMIN'), handleDeleteTopicRule);
examsRouter.post('/:id/publish', authenticate, requireRole('FACULTY', 'ADMIN'), handlePublishExam);
