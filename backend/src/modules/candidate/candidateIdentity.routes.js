/**
 * @file candidateIdentity.routes.js
 * @description Express router for student candidate identity document onboarding,
 * S3 presign generation, upload confirmation, and profile management.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import * as candidateIdentityController from './candidateIdentity.controller.js';

export const candidateRouter = Router();

// Candidate identity endpoints strictly require authenticated STUDENT role
candidateRouter.use(authenticate);
candidateRouter.use(requireRole('STUDENT'));

candidateRouter.get('/identity/status', candidateIdentityController.getIdentityStatusHandler);
candidateRouter.post('/identity/document-url', candidateIdentityController.requestUploadUrlHandler);
candidateRouter.post('/identity/confirm-document', candidateIdentityController.confirmDocumentHandler);

candidateRouter.get('/profile', candidateIdentityController.getProfileHandler);
candidateRouter.patch('/profile', candidateIdentityController.updateProfileHandler);
