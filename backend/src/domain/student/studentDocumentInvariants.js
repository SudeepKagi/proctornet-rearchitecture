/**
 * @file studentDocumentInvariants.js
 * @description Pure domain invariants and transition validators for student identity documents.
 * Ensures zero illegal state jumps, mandatory rejection justification, and file policy enforcement.
 */

import {
  DocumentType,
  DocumentVerificationStatus,
  ALLOWED_DOCUMENT_TRANSITIONS
} from './studentDocumentStates.js';
import { BadRequestError, ConflictError } from '../../utils/errors.js';

export const MAX_DOCUMENT_BYTE_SIZE = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_DOCUMENT_MIME_TYPES = Object.freeze({
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/pdf': ['.pdf']
});

/**
 * Asserts that the document type is authoritative.
 * @param {string} documentType
 */
export function assertValidDocumentType(documentType) {
  if (!Object.values(DocumentType).includes(documentType)) {
    throw new BadRequestError(
      `Invalid document type '${documentType}'. Allowed types: ${Object.values(DocumentType).join(', ')}`,
      'INVALID_DOCUMENT_TYPE'
    );
  }
}

/**
 * Asserts that a state transition for an identity document is legally permitted.
 * @param {string} currentStatus
 * @param {string} nextStatus
 */
export function assertValidDocumentTransition(currentStatus, nextStatus) {
  const allowed = ALLOWED_DOCUMENT_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.has(nextStatus)) {
    throw new ConflictError(
      `Illegal document status transition from '${currentStatus}' to '${nextStatus}'`,
      'ILLEGAL_DOCUMENT_TRANSITION'
    );
  }
}

/**
 * Asserts that when a document or verification is rejected, mandatory review notes are provided.
 * @param {'APPROVED' | 'REJECTED'} decision
 * @param {string} [notes]
 */
export function assertMandatoryRejectionNotes(decision, notes) {
  if (decision === 'REJECTED') {
    if (!notes || typeof notes !== 'string' || notes.trim().length === 0) {
      throw new BadRequestError(
        'Rejection reason is mandatory when rejecting student identity verification',
        'REJECTION_NOTES_MANDATORY'
      );
    }
  }
}

/**
 * Asserts that the declared MIME type is supported for document uploads.
 * @param {string} mimeType
 */
export function assertValidDocumentMimeType(mimeType) {
  if (!Object.keys(ALLOWED_DOCUMENT_MIME_TYPES).includes(mimeType)) {
    throw new BadRequestError(
      `Unsupported MIME type '${mimeType}'. Allowed: image/jpeg, image/png, application/pdf`,
      'UNSUPPORTED_MIME_TYPE'
    );
  }
}

/**
 * Asserts that the declared file size is within limits.
 * @param {number} byteSize
 */
export function assertValidDocumentSize(byteSize) {
  if (typeof byteSize !== 'number' || byteSize <= 0 || byteSize > MAX_DOCUMENT_BYTE_SIZE) {
    throw new BadRequestError(
      `File size must be between 1 byte and 10 MB (received ${byteSize} bytes)`,
      'INVALID_FILE_SIZE'
    );
  }
}
