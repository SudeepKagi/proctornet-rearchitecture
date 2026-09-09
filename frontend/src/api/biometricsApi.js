/**
 * @file biometricsApi.js
 * @description Candidate and Administrator Biometric API client.
 * Strictly server-authoritative: client NEVER computes or submits biometric embeddings or verdicts.
 */

import { apiClient } from './client.js';

/**
 * Fetch candidate's current face enrollment status.
 * @returns {Promise<{ isEnrolled: boolean, enrollmentStatus: string, qualityScore?: number, modelVersion?: string, enrolledAt?: string }>}
 */
export async function getEnrollmentStatus() {
  return await apiClient('/api/v1/candidate/biometrics/status');
}

/**
 * Request a pre-signed S3 upload URL for reference face enrollment.
 * @param {{ fileName: string, mimeType: string, byteSize: number }} payload
 * @returns {Promise<{ biometricId: string, uploadUrl: string, key: string, expiresIn: number }>}
 */
export async function requestEnrollmentUrl({ fileName, mimeType, byteSize }) {
  return await apiClient('/api/v1/candidate/biometrics/enroll-url', {
    method: 'POST',
    body: { fileName, mimeType, byteSize }
  });
}

/**
 * Confirm face enrollment once image is uploaded to S3.
 * Server extracts authoritative embedding, calculates quality, and validates threshold.
 * @param {{ biometricId: string }} payload
 * @returns {Promise<{ success: boolean, biometricId: string, enrollmentStatus: string, qualityScore: number }>}
 */
export async function confirmEnrollment({ biometricId }) {
  return await apiClient('/api/v1/candidate/biometrics/enroll-confirm', {
    method: 'POST',
    body: { biometricId }
  });
}

/**
 * Request active randomized liveness challenge for an exam session.
 * @param {{ sessionId: string }} payload
 * @returns {Promise<{ challengeId: string, nonce: string, expectedActions: string[], expiresInSeconds: number, liveMediaUploadUrl: string }>}
 */
export async function requestLivenessChallenge({ sessionId }) {
  return await apiClient('/api/v1/candidate/biometrics/liveness-challenge', {
    method: 'POST',
    body: { sessionId }
  });
}

/**
 * Submit challenge verification request once frames are uploaded to S3.
 * Server evaluates passive and active anti-spoofing and issues an HMAC livenessToken.
 * @param {{ sessionId?: string, challengeId: string, nonce: string }} payload
 * @returns {Promise<{ success: boolean, livenessToken: string, verdict: string }>}
 */
export async function verifyLiveness({ sessionId, challengeId, nonce }) {
  return await apiClient('/api/v1/candidate/biometrics/verify-liveness', {
    method: 'POST',
    body: { sessionId, challengeId, nonce }
  });
}

/**
 * Request upload URL for live selfie image.
 * @param {{ sessionId: string, mimeType: string, byteSize: number }} payload
 * @returns {Promise<{ liveImageId: string, uploadUrl: string, key: string, expiresIn: number }>}
 */
export async function requestVerificationImageUrl({ sessionId, mimeType, byteSize }) {
  return await apiClient('/api/v1/candidate/biometrics/verify-image-url', {
    method: 'POST',
    body: { sessionId, mimeType, byteSize }
  });
}

/**
 * Submit live image for face verification against enrolled template.
 * Requires server-issued HMAC livenessToken.
 * @param {{ sessionId: string, liveImageId: string, livenessToken: string }} payload
 * @returns {Promise<{ success: boolean, matchVerdict: string, similarityScore: number, finalStatus: string, attemptNumber: number, remainingAttempts: number }>}
 */
export async function verifyFace({ sessionId, liveImageId, livenessToken }) {
  return await apiClient('/api/v1/candidate/biometrics/verify-face', {
    method: 'POST',
    body: { sessionId, liveImageId, livenessToken }
  });
}

/**
 * Upload a raw image blob or binary buffer directly to pre-signed S3 URL.
 * Does not include Bearer authorization header to avoid S3 SignatureDoesNotMatch errors.
 * @param {string} uploadUrl
 * @param {Blob|Uint8Array} data
 * @param {string} mimeType
 * @returns {Promise<Response>}
 */
export async function uploadBlobToPresignedUrl(uploadUrl, data, mimeType = 'image/jpeg') {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType
    },
    body: data
  });

  if (!res.ok) {
    throw new Error(`S3 upload failed with status ${res.status}`);
  }
  return res;
}

// ==========================================
// Administrator Endpoints
// ==========================================

/**
 * Admin: Override candidate's biometric gate for a session with audit reason.
 * @param {{ sessionId: string, studentId: string, reason: string }} payload
 * @returns {Promise<{ success: boolean, verificationId: string, finalStatus: string }>}
 */
export async function overrideBiometrics({ sessionId, studentId, reason }) {
  return await apiClient('/api/v1/admin/biometrics/override', {
    method: 'POST',
    body: { sessionId, studentId, reason }
  });
}

/**
 * Admin: Query biometric verification logs for an exam session (data-minimized).
 * @param {string} sessionId
 * @param {{ page?: number, limit?: number, status?: string }} params
 * @returns {Promise<{ verifications: Array<object>, pagination: object }>}
 */
export async function getSessionBiometricVerifications(sessionId, params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page);
  if (params.limit) query.set('limit', params.limit);
  if (params.status) query.set('status', params.status);

  const qs = query.toString();
  return await apiClient(`/api/v1/admin/biometrics/sessions/${sessionId}${qs ? `?${qs}` : ''}`);
}
