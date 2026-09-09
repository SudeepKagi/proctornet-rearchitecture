/**
 * @file questions.routes.js
 * @description Express routes for Question Bank and Rich Question Authoring.
 * Mounted at /api/v1/faculty/question-bank
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import {
  createBank,
  listBanks,
  getBank,
  updateBank,
  deleteBank,
  createQuestion,
  getQuestion,
  searchQuestions,
  updateQuestion,
  archiveQuestion,
  cloneQuestion
} from './questions.controller.js';

export const questionBankRouter = Router();

// Gated for FACULTY and ADMIN
questionBankRouter.use(authenticate, requireRole('FACULTY', 'ADMIN'));

// Banks CRUD
questionBankRouter.get('/banks', listBanks);
questionBankRouter.post('/banks', createBank);
questionBankRouter.get('/banks/:bankId', getBank);
questionBankRouter.put('/banks/:bankId', updateBank);
questionBankRouter.delete('/banks/:bankId', deleteBank);

// Questions CRUD & Search
questionBankRouter.get('/questions', searchQuestions);
questionBankRouter.post('/questions', createQuestion);
questionBankRouter.get('/questions/:id', getQuestion);
questionBankRouter.put('/questions/:id', updateQuestion);
questionBankRouter.post('/questions/:id/clone', cloneQuestion);
questionBankRouter.delete('/questions/:id', archiveQuestion);
