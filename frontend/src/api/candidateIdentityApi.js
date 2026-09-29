/**
 * @file candidateIdentityApi.js
 * @description Centralized API client for Candidate Identity Document Onboarding,
 * S3 Presigned Uploads, Confirmation, and Profile Management.
 */

import { apiClient } from './client.js';

/**
 * Fetches the candidate's current identity document and onboarding status.
 * @returns {Promise<{hasSubmittedDocument: boolean, document: object|null, overallVerificationStatus: string}>}
 */
export async function getCandidateIdentityStatus() {
  return await apiClient('/api/v1/candidate/identity/status');
}

/**
 * Requests a 300-second S3 presigned PUT URL for document upload.
 * Plaintext document number is hashed by backend and never persisted.
 *
 * @param {object} payload
 * @param {'PASSPORT' | 'NATIONAL_ID' | 'DRIVING_LICENSE' | 'STUDENT_ID'} payload.documentType
 * @param {string} payload.documentNumber
 * @param {string} payload.fullNameOnDocument
 * @param {string} payload.fileName
 * @param {'image/jpeg' | 'image/png' | 'application/pdf'} payload.mimeType
 * @param {number} payload.byteSize
 * @param {string} [payload.dateOfBirth]
 * @param {string} [payload.expiryDate]
 * @param {string} [payload.issueCountry]
 * @returns {Promise<{documentId: string, uploadUrl: string, expiresInSeconds: number}>}
 */
export async function requestDocumentUploadUrl(payload) {
  return await apiClient('/api/v1/candidate/identity/document-url', {
    method: 'POST',
    body: payload
  });
}

/**
 * Direct HTTP PUT binary upload to S3 private bucket using presigned URL.
 * Does not pass through Express API server to conserve backend memory and bandwidth.
 *
 * @param {string} uploadUrl
 * @param {File | Blob} file
 * @param {string} mimeType
 * @returns {Promise<void>}
 */
export async function uploadBinaryToS3(uploadUrl, file, mimeType) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType
    },
    body: file
  });

  if (!response.ok) {
    throw new Error(`Failed to upload document to secure storage (HTTP ${response.status})`);
  }
}

/**
 * Confirms binary upload directly from S3, initiating server-side magic byte
 * and file size verification and transitioning document to PENDING.
 *
 * @param {string} documentId
 * @returns {Promise<{message: string, verificationStatus: string}>}
 */
export async function confirmDocumentUpload(documentId) {
  return await apiClient('/api/v1/candidate/identity/confirm-document', {
    method: 'POST',
    body: { documentId }
  });
}

/**
 * Fetches candidate profile and approved accommodation configuration.
 * @returns {Promise<object>}
 */
export async function getCandidateProfile() {
  return await apiClient('/api/v1/candidate/profile');
}

/**
 * Updates editable candidate profile fields (department, semester, phone).
 * @param {object} updates
 * @returns {Promise<object>}
 */
export async function updateCandidateProfile(updates) {
  return await apiClient('/api/v1/candidate/profile', {
    method: 'PATCH',
    body: updates
  });
}

/**
 * Uploads Student ID card to automated OCR extraction service.
 * @param {File} file
 * @returns {Promise<object>} Extracted structured credentials
 */
export async function extractCardDetails(file) {
  const formData = new FormData();
  formData.append('card', file);

  const res = await apiClient('/api/v1/candidate/identity/extract-card', {
    method: 'POST',
    body: formData
  });

  return res.data?.extracted || res.extracted;
}

/**
 * Enrolls student candidate with reference webcam snapshot and Government ID document.
 * @param {object} payload
 * @param {string|File} payload.faceImage
 * @param {string|File} payload.idDocument
 * @param {string} [payload.documentType='GOVERNMENT_ID']
 * @returns {Promise<{ user: object }>}
 */
export async function enrollCandidate({ faceImage, idDocument, documentType = 'GOVERNMENT_ID' }) {
  if (faceImage instanceof File || idDocument instanceof File) {
    const formData = new FormData();
    if (faceImage instanceof File) {
      formData.append('faceImage', faceImage);
    } else {
      formData.append('faceImage', faceImage);
    }
    if (idDocument instanceof File) {
      formData.append('idDocument', idDocument);
    } else {
      formData.append('idDocument', idDocument);
    }
    formData.append('documentType', documentType);

    const res = await apiClient('/api/v1/candidate/enroll', {
      method: 'POST',
      body: formData
    });
    return res.data;
  }

  const res = await apiClient('/api/v1/candidate/enroll', {
    method: 'POST',
    body: {
      faceImage,
      idDocument,
      documentType
    }
  });
  return res.data;
}

/**
 * Changes candidate password, requiring current password.
 * Revokes other sessions.
 * @param {object} payload
 * @param {string} payload.currentPassword
 * @param {string} payload.newPassword
 * @returns {Promise<object>}
 */
export async function changePassword({ currentPassword, newPassword }) {
  return await apiClient('/api/v1/candidate/password', {
    method: 'POST',
    body: { currentPassword, newPassword }
  });
}

/**
 * Re-enrolls candidate face reference via direct live camera capture.
 * @param {Blob} photoBlob
 * @returns {Promise<object>}
 */
export async function reEnrollFacePhoto(photoBlob) {
  const formData = new FormData();
  formData.append('photo', photoBlob, 'face_capture.jpg');
  return await apiClient('/api/v1/candidate/profile/photo-re-enroll', {
    method: 'POST',
    body: formData
  });
}

