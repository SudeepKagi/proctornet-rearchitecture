/**
 * @file candidateIdentity.controller.js
 * @description HTTP controllers for candidate identity document onboarding, confirmation, and profile endpoints.
 */

import * as candidateIdentityService from './candidateIdentity.service.js';
import { extractStudentIdCard } from './cardExtractor.js';
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

