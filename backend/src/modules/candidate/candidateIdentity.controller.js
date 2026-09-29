/**
 * @file candidateIdentity.controller.js
 * @description HTTP controllers for candidate identity document onboarding, confirmation, and profile endpoints.
 */

import * as candidateIdentityService from './candidateIdentity.service.js';
import { extractStudentIdCard } from './cardExtractor.js';
import {
  requestUploadUrlSchema,
  confirmDocumentSchema,
  updateCandidateProfileSchema,
  changePasswordSchema
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

/**
 * POST /api/v1/candidate/identity/extract-card
 */
export async function extractCardHandler(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'No Student ID card file provided for automated extraction.'
        }
      });
    }

    const extracted = await extractStudentIdCard(req.file.buffer);
    res.status(200).json({
      status: 'success',
      data: {
        extracted
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/candidate/enroll
 * Receives reference face snapshot and ID document, compresses and stores both to S3,
 * and updates user verification_status to VERIFIED.
 */
export async function enrollCandidateHandler(req, res, next) {
  try {
    const userId = req.user.userId;

    // Support both multipart file uploads and JSON Base64 payloads
    const faceFile = req.files?.['faceImage']?.[0] || (req.file?.fieldname === 'faceImage' ? req.file : null);
    const idFile = req.files?.['idDocument']?.[0] || (req.file?.fieldname === 'idDocument' ? req.file : null);

    const faceImage = req.body.faceImage || null;
    const idDocument = req.body.idDocument || null;
    const documentType = req.body.documentType || 'GOVERNMENT_ID';

    const updatedUser = await candidateIdentityService.enrollCandidate({
      userId,
      faceImage,
      idDocument,
      faceFile,
      idFile,
      documentType
    });

    res.status(200).json({
      status: 'success',
      message: 'Candidate enrolled and verified successfully',
      data: {
        user: updatedUser
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/candidate/password
 * Changes candidate password, requiring current password verification.
 * Revokes other active sessions via token blacklist on successful change.
 */
export async function changePasswordHandler(req, res, next) {
  try {
    const payload = changePasswordSchema.parse(req.body);
    const result = await candidateIdentityService.changeCandidatePassword({
      userId: req.user.userId,
      currentPassword: payload.currentPassword,
      newPassword: payload.newPassword,
      currentSessionId: req.user.sessionId || req.authSessionId || null
    });

    res.status(200).json({
      status: 'success',
      message: 'Password changed successfully. Other active sessions have been signed out.',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/candidate/profile/photo-re-enroll
 * Re-enrolls candidate face reference via direct live camera capture.
 * Validates liveness, checks quality, extracts 128-d embedding, compares with ID document,
 * and atomically updates template and avatar in ONE DB transaction.
 */
export async function reEnrollFaceHandler(req, res, next) {
  try {
    let imageBuffer = null;
    let mimeType = 'image/jpeg';

    if (req.file && req.file.buffer) {
      imageBuffer = req.file.buffer;
      mimeType = req.file.mimetype || 'image/jpeg';
    } else if (req.body?.image && typeof req.body.image === 'string') {
      const match = req.body.image.match(/^data:image\/(jpeg|png);base64,(.+)$/);
      if (match) {
        mimeType = `image/${match[1]}`;
        imageBuffer = Buffer.from(match[2], 'base64');
      } else {
        imageBuffer = Buffer.from(req.body.image, 'base64');
      }
    }

    if (!imageBuffer) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CAMERA_CAPTURE_REQUIRED',
          message: 'A fresh camera capture image is required for biometric re-enrollment.'
        }
      });
    }

    const result = await candidateIdentityService.reEnrollCandidateFace({
      userId: req.user.userId,
      imageBuffer,
      mimeType
    });

    res.status(200).json({
      status: 'success',
      message: 'Reference face photo re-enrolled successfully.',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

