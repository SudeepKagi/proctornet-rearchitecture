/**
 * @file biometrics.routes.js
 * @description Express routers for Phase 25 Biometric Identity endpoints.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import multer from 'multer';
import * as controller from './biometrics.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ==========================================
// Candidate Biometrics Router (/candidate/biometrics)
// ==========================================
export const candidateBiometricsRouter = Router();

candidateBiometricsRouter.use(authenticate);
candidateBiometricsRouter.use(requireRole('STUDENT'));

candidateBiometricsRouter.post('/enroll-url', controller.requestEnrollUrlHandler);
candidateBiometricsRouter.post('/enroll-confirm', controller.confirmEnrollHandler);
candidateBiometricsRouter.get('/status', controller.getEnrollmentStatusHandler);
candidateBiometricsRouter.post('/liveness-challenge', controller.requestLivenessChallengeHandler);
candidateBiometricsRouter.post('/verify-liveness', controller.verifyLivenessHandler);
candidateBiometricsRouter.post('/verify-image-url', controller.requestVerificationImageUrlHandler);
candidateBiometricsRouter.post('/verify-face', controller.verifyFaceHandler);
candidateBiometricsRouter.post('/verify-identity', upload.single('image'), controller.verifyIdentityHandler);

// ==========================================
// Admin Biometrics Router (/admin/biometrics)
// ==========================================
export const adminBiometricsRouter = Router();

adminBiometricsRouter.use(authenticate);
adminBiometricsRouter.use(requireRole('ADMIN'));

adminBiometricsRouter.post('/override', controller.adminOverrideHandler);
adminBiometricsRouter.get('/sessions/:sessionId', controller.getSessionVerificationsHandler);
