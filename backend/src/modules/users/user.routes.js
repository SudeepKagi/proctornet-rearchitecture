/**
 * @file user.routes.js
 * @description Express router for user administration, organization configuration, and self-service onboarding.
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import * as userController from './user.controller.js';
import * as auditController from '../audit/audit.controller.js';
import * as studentConfigController from '../candidate/studentConfig.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// 1. Admin router (/api/v1/admin)
export const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(requireRole('ADMIN'));

// User registry and queries
adminRouter.get('/users', userController.handleListUsers);
adminRouter.post('/users', userController.handleCreateSingleUser);
adminRouter.get('/users/:id', userController.handleGetUserDetail);
adminRouter.patch('/users/:id', userController.handleUpdateUserProfile);
adminRouter.patch('/users/:id/status', userController.handleChangeUserStatus);
adminRouter.post('/users/:id/unlock', userController.handleUnlockUser);
adminRouter.post('/users/:id/reset-password', userController.handleResetPassword);
adminRouter.post('/users/:id/roles', userController.handleAssignRole);
adminRouter.delete('/users/:id/roles/:role', userController.handleRevokeRole);
adminRouter.post('/users/:id/revoke-sessions', userController.handleRevokeSessions);

// Verification queue and review
adminRouter.get('/verifications', userController.handleGetVerificationQueue);
adminRouter.patch('/users/:id/verification', userController.handleReviewVerification);

// Phase 24: Student Identity Verification Dossier, Preview & Configuration
adminRouter.get('/students/:id/verification', userController.handleGetStudentVerificationDossier);
adminRouter.get('/students/:id/document-preview', userController.handleGetStudentDocumentPreview);
adminRouter.patch('/students/:id/verification', userController.handleReviewStudentVerification);
adminRouter.get('/students/:id/configuration', studentConfigController.handleGetStudentConfiguration);
adminRouter.put('/students/:id/configuration', studentConfigController.handleUpdateStudentConfiguration);

// Bulk spreadsheet ingestion
adminRouter.post(
  '/users/bulk-import/preview',
  upload.single('file'),
  userController.handleBulkImportPreview
);
adminRouter.post(
  '/users/bulk-import',
  upload.single('file'),
  userController.handleBulkImport
);

// Organization settings
adminRouter.get('/organization', userController.handleGetOrganizationSettings);
adminRouter.put('/organization', userController.handleUpdateOrganizationSettings);

// Administrative audit feed
adminRouter.get('/audit', auditController.handleGetAuditLogs);

// 2. User self-service router (/api/v1/users/me)
export const userSelfRouter = Router();

userSelfRouter.use(authenticate);

userSelfRouter.get('/onboarding-status', userController.handleGetOnboardingStatus);
userSelfRouter.post(
  '/first-login/change-password',
  userController.handleChangeFirstLoginPassword
);
userSelfRouter.post('/onboarding', userController.handleSubmitOnboarding);
