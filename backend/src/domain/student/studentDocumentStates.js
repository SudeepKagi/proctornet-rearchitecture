/**
 * @file studentDocumentStates.js
 * @description Authoritative DocumentType, DocumentVerificationStatus, and ProctoringStrictness
 * enumerations and state transition maps for candidate identity document verification.
 * Conforms to Step 13.5 and Phase 24 specifications.
 */

/**
 * Authoritative supported identity document types.
 * @readonly
 * @enum {string}
 */
export const DocumentType = Object.freeze({
  PASSPORT: 'PASSPORT',
  NATIONAL_ID: 'NATIONAL_ID',
  DRIVING_LICENSE: 'DRIVING_LICENSE',
  STUDENT_ID: 'STUDENT_ID'
});

/**
 * Authoritative document-level verification status.
 * @readonly
 * @enum {string}
 */
export const DocumentVerificationStatus = Object.freeze({
  PENDING_UPLOAD: 'PENDING_UPLOAD',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUPERSEDED: 'SUPERSEDED'
});

/**
 * Authoritative per-student proctoring strictness overrides.
 * @readonly
 * @enum {string}
 */
export const ProctoringStrictness = Object.freeze({
  STANDARD: 'STANDARD',
  RELAXED: 'RELAXED',
  STRICT: 'STRICT',
  MEDICAL_EXEMPTION: 'MEDICAL_EXEMPTION'
});

/**
 * Strict transition map for document verification states.
 */
export const ALLOWED_DOCUMENT_TRANSITIONS = Object.freeze({
  [DocumentVerificationStatus.PENDING_UPLOAD]: new Set([
    DocumentVerificationStatus.PENDING,
    DocumentVerificationStatus.REJECTED,
    DocumentVerificationStatus.SUPERSEDED
  ]),
  [DocumentVerificationStatus.PENDING]: new Set([
    DocumentVerificationStatus.APPROVED,
    DocumentVerificationStatus.REJECTED
  ]),
  [DocumentVerificationStatus.APPROVED]: new Set([
    // Approved is terminal
  ]),
  [DocumentVerificationStatus.REJECTED]: new Set([
    DocumentVerificationStatus.SUPERSEDED
  ]),
  [DocumentVerificationStatus.SUPERSEDED]: new Set([
    // Superseded is terminal inactive record
  ])
});
