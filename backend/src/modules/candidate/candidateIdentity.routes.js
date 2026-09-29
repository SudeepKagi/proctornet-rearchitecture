/**
 * @file candidateIdentity.routes.js
 * @description Express router for student candidate identity document onboarding,
 * S3 presign generation, upload confirmation, and profile management.
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import * as candidateIdentityController from './candidateIdentity.controller.js';
import { verifyIdentityHandler } from '../biometrics/biometrics.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

export const candidateRouter = Router();

// Candidate identity endpoints strictly require authenticated STUDENT role
candidateRouter.use(authenticate);
candidateRouter.use(requireRole('STUDENT'));

candidateRouter.get('/identity/status', candidateIdentityController.getIdentityStatusHandler);
candidateRouter.post('/identity/document-url', candidateIdentityController.requestUploadUrlHandler);
candidateRouter.post('/identity/confirm-document', candidateIdentityController.confirmDocumentHandler);
candidateRouter.post('/identity/extract-card', upload.single('card'), candidateIdentityController.extractCardHandler);

candidateRouter.get('/profile', candidateIdentityController.getProfileHandler);
candidateRouter.patch('/profile', candidateIdentityController.updateProfileHandler);
candidateRouter.post('/password', candidateIdentityController.changePasswordHandler);
candidateRouter.post('/profile/photo-re-enroll', upload.single('photo'), candidateIdentityController.reEnrollFaceHandler);
candidateRouter.post('/verify-identity', upload.single('image'), verifyIdentityHandler);
candidateRouter.post(
  '/enroll',
  upload.fields([
    { name: 'faceImage', maxCount: 1 },
    { name: 'idDocument', maxCount: 1 }
  ]),
  candidateIdentityController.enrollCandidateHandler
);


