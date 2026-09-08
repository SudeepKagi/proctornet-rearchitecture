/**
 * @file evidenceApi.js
 * @description API service functions for Phase 15 Evidence Storage.
 * Handles requesting direct S3 upload URLs, confirming uploads, listing evidence,
 * retrieving presigned playback URLs, and administrative purging.
 */

import { apiClient } from './client.js';

/**
 * Requests a presigned PUT URL for direct-to-S3 binary evidence upload.
 * Candidate only.
 *
 * @param {string} attemptId
 * @param {object} uploadData
 * @param {string} uploadData.evidenceType - 'WEBCAM_SNAPSHOT' | 'SCREEN_CAPTURE' | 'AUDIO_SNIPPET'
 * @param {string} uploadData.contentType
 * @param {number} uploadData.byteSize
 * @param {string} [uploadData.sha256Checksum]
 * @param {string} [uploadData.violationId]
 * @param {string} [uploadData.flagId]
 * @param {object} [uploadData.metadata]
 * @returns {Promise<{evidenceId: string, uploadUrl: string, objectKey: string, expiresIn: number}>}
 */
export async function requestUploadUrl(attemptId, uploadData) {
  const result = await apiClient(`/api/v1/attempts/${attemptId}/evidence/upload-url`, {
    method: 'POST',
    body: uploadData
  });
  return result.data;
}

/**
 * Confirms an uploaded evidence record once the binary payload has been PUT to S3.
 * Candidate only.
 *
 * @param {string} attemptId
 * @param {string} evidenceId
 * @param {object} [confirmData={}]
 * @returns {Promise<object>} Confirmed evidence record details
 */
export async function confirmUpload(attemptId, evidenceId, confirmData = {}) {
  const result = await apiClient(`/api/v1/attempts/${attemptId}/evidence/${evidenceId}/confirm`, {
    method: 'POST',
    body: confirmData
  });
  return result.data;
}

/**
 * Lists evidence records for an attempt (Invigilator, Faculty, Admin).
 *
 * @param {string} attemptId
 * @param {object} [params={}]
 * @returns {Promise<{attemptId: string, evidence: Array<object>, pagination: object}>}
 */
export async function listEvidence(attemptId, params = {}) {
  const query = new URLSearchParams(params).toString();
  const endpoint = `/api/v1/attempts/${attemptId}/evidence${query ? `?${query}` : ''}`;
  const result = await apiClient(endpoint, {
    method: 'GET'
  });
  return result.data;
}

/**
 * Retrieves a short-lived presigned GET URL for evidence playback pinned to S3 VersionId.
 * Staff only.
 *
 * @param {string} attemptId
 * @param {string} evidenceId
 * @returns {Promise<{evidenceId: string, downloadUrl: string, contentType: string, expiresIn: number}>}
 */
export async function getPlaybackUrl(attemptId, evidenceId) {
  const result = await apiClient(`/api/v1/attempts/${attemptId}/evidence/${evidenceId}/url`, {
    method: 'GET'
  });
  return result.data;
}

/**
 * Purges an evidence artifact from S3 and marks the record PURGED in the database.
 * Faculty exam owner and Admin only.
 *
 * @param {string} attemptId
 * @param {string} evidenceId
 * @returns {Promise<{status: string, message: string}>}
 */
export async function deleteEvidence(attemptId, evidenceId) {
  const result = await apiClient(`/api/v1/attempts/${attemptId}/evidence/${evidenceId}`, {
    method: 'DELETE'
  });
  return result;
}
