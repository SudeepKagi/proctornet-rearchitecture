/**
 * @file student.routes.js
 * @description Express router for student profile, onboarding, and face verification.
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import * as studentController from './student.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

export const studentRouter = Router();

// Public / common: list departments
studentRouter.get('/departments', studentController.getDepartmentsHandler);

// Protected routes for students
studentRouter.use(authenticate);
studentRouter.use(requireRole('STUDENT'));

studentRouter.get('/profile', studentController.getProfileHandler);
studentRouter.patch('/profile', studentController.updateProfileHandler);
studentRouter.post(
  '/photo-update',
  upload.single('photo'),
  studentController.requestPhotoUpdateHandler
);
studentRouter.post(
  '/profile/photo-update',
  upload.single('photo'),
  studentController.requestPhotoUpdateHandler
);
studentRouter.post(
  '/profile/photo-re-enroll',
  upload.single('photo'),
  studentController.requestPhotoUpdateHandler
);
studentRouter.get('/identity/status', studentController.getIdentityStatusHandler);
studentRouter.get('/identity-status', studentController.getIdentityStatusHandler);

studentRouter.post(
  '/setup',
  upload.fields([
    { name: 'faceImage', maxCount: 1 },
    { name: 'idDocument', maxCount: 1 }
  ]),
  studentController.submitOnboardingHandler
);

// Backward-compatible alias for setup
studentRouter.post(
  '/enroll',
  upload.fields([
    { name: 'faceImage', maxCount: 1 },
    { name: 'idDocument', maxCount: 1 }
  ]),
  studentController.submitOnboardingHandler
);

studentRouter.post('/verify-identity', studentController.verifyFaceHandler);
