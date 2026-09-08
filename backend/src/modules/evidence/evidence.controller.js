/**
 * @file evidence.controller.js
 * @description HTTP controllers for Phase 15 Evidence Storage endpoints.
 */

import * as evidenceService from './evidence.service.js';
import {
  requestUploadUrlSchema,
  confirmEvidenceSchema,
  listEvidenceQuerySchema
} from './evidence.schemas.js';

/**
 * Requests a presigned PUT URL for direct-to-S3 evidence upload.
 * POST /api/v1/attempts/:attemptId/evidence/upload-url
 */
export async function handleRequestUploadUrl(req, res, next) {
  try {
    const attemptId = req.params.attemptId;
    const parsed = requestUploadUrlSchema.parse(req.body);
    const result = await evidenceService.initiateUploadUrl(attemptId, req.user, parsed);

    res.status(201).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Confirms an uploaded evidence record, verifying existence and exact byte size via S3 HeadObject.
 * POST /api/v1/attempts/:attemptId/evidence/:evidenceId/confirm
 */
export async function handleConfirmUpload(req, res, next) {
  try {
    const { attemptId, evidenceId } = req.params;
    const parsed = confirmEvidenceSchema.parse(req.body || {});
    const result = await evidenceService.confirmUpload(attemptId, evidenceId, req.user, parsed);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists evidence records for an attempt.
 * GET /api/v1/attempts/:attemptId/evidence
 */
export async function handleListEvidence(req, res, next) {
  try {
    const attemptId = req.params.attemptId;
    const parsed = listEvidenceQuerySchema.parse(req.query);
    const result = await evidenceService.listEvidence(attemptId, req.user, parsed);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Generates an authorized presigned GET URL for evidence playback pinned to S3 VersionId.
 * GET /api/v1/attempts/:attemptId/evidence/:evidenceId/url
 */
export async function handleGetPlaybackUrl(req, res, next) {
  try {
    const { attemptId, evidenceId } = req.params;
    const result = await evidenceService.getPlaybackUrl(attemptId, evidenceId, req.user);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Purges an evidence artifact and its S3 versions.
 * DELETE /api/v1/attempts/:attemptId/evidence/:evidenceId
 */
export async function handleDeleteEvidence(req, res, next) {
  try {
    const { attemptId, evidenceId } = req.params;
    const result = await evidenceService.deleteEvidence(attemptId, evidenceId, req.user);

    res.status(200).json({
      status: 'success',
      message: result.message
    });
  } catch (err) {
    next(err);
  }
}
