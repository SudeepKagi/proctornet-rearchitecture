/**
 * @file candidateIdentity.controller.js
 * @description HTTP controllers for candidate identity document onboarding, confirmation, and profile endpoints.
 */

import * as candidateIdentityService from './candidateIdentity.service.js';
import {
  requestUploadUrlSchema,
  confirmDocumentSchema,
  updateCandidateProfileSchema
} from './candidateIdentity.schemas.js';

/**
 * GET /api/v1/candidate/identity/status
 */
export async function getIdentityStatusHandler(req, res, next) {
  try {
    const status = await candidateIdentityService.getCandidateIdentityStatus(req.user.userId);
    res.json(status);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/candidate/identity/document-url
 */
export async function requestUploadUrlHandler(req, res, next) {
  try {
    const payload = requestUploadUrlSchema.parse(req.body);
    const result = await candidateIdentityService.requestDocumentUploadUrl({
      userId: req.user.userId,
      ...payload
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/candidate/identity/confirm-document
 */
export async function confirmDocumentHandler(req, res, next) {
  try {
    const payload = confirmDocumentSchema.parse(req.body);
    const result = await candidateIdentityService.confirmDocumentUpload({
      documentId: payload.documentId,
      user: req.user
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/candidate/profile
 */
export async function getProfileHandler(req, res, next) {
  try {
    const profile = await candidateIdentityService.getCandidateProfile(req.user.userId);
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/candidate/profile
 */
export async function updateProfileHandler(req, res, next) {
  try {
    const payload = updateCandidateProfileSchema.parse(req.body);
    const updated = await candidateIdentityService.updateCandidateProfile(req.user.userId, payload);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}
