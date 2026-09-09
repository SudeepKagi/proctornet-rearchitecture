/**
 * @file candidateIdentity.schemas.js
 * @description Zod validation schemas and binary magic byte validators for candidate identity onboarding.
 */

import { z } from 'zod';
import crypto from 'node:crypto';
import { DocumentType } from '../../domain/student/studentDocumentStates.js';
import { MAX_DOCUMENT_BYTE_SIZE } from '../../domain/student/studentDocumentInvariants.js';

export const requestUploadUrlSchema = z.object({
  documentType: z.nativeEnum(DocumentType, {
    errorMap: () => ({ message: 'documentType must be PASSPORT, NATIONAL_ID, DRIVING_LICENSE, or STUDENT_ID' })
  }),
  documentNumber: z
    .string()
    .min(1, 'documentNumber is required')
    .max(64, 'documentNumber exceeds 64 characters')
    .trim(),
  fullNameOnDocument: z
    .string()
    .min(1, 'fullNameOnDocument is required')
    .max(255, 'fullNameOnDocument exceeds 255 characters')
    .trim(),
  dateOfBirth: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  issueCountry: z.string().max(64).optional().nullable(),
  fileName: z
    .string()
    .min(1, 'fileName is required')
    .max(255, 'fileName exceeds 255 characters'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf'], {
    errorMap: () => ({ message: 'mimeType must be image/jpeg, image/png, or application/pdf' })
  }),
  byteSize: z
    .number()
    .int()
    .min(1, 'byteSize must be greater than 0')
    .max(MAX_DOCUMENT_BYTE_SIZE, `byteSize cannot exceed ${MAX_DOCUMENT_BYTE_SIZE} bytes (10MB)`)
});

export const confirmDocumentSchema = z.object({
  documentId: z.string().uuid('documentId must be a valid UUID')
});

export const updateCandidateProfileSchema = z.object({
  department: z.string().max(100).optional(),
  semester: z.number().int().min(1).max(12).optional(),
  phone: z.string().max(30).optional()
});

/**
 * Computes a SHA-256 hash of the plaintext document number for deduplication.
 * @param {string} documentNumber
 * @returns {string} SHA-256 hex string
 */
export function hashDocumentNumber(documentNumber) {
  return crypto.createHash('sha256').update(documentNumber.trim().toUpperCase()).digest('hex');
}

/**
 * Extracts the last 4 characters of the document number for safe display.
 * @param {string} documentNumber
 * @returns {string}
 */
export function maskDocumentNumber(documentNumber) {
  const trimmed = documentNumber.trim();
  if (trimmed.length <= 4) {
    return trimmed;
  }
  return trimmed.slice(-4);
}

/**
 * Validates leading binary signature (magic bytes) against declared MIME type.
 *
 * Signatures:
 * - image/jpeg: FF D8 FF
 * - image/png:  89 50 4E 47 0D 0A 1A 0A
 * - application/pdf: 25 50 44 46 (%PDF)
 *
 * @param {Buffer} buffer - First N bytes of the file
 * @param {string} mimeType - Declared MIME type
 * @returns {boolean} True if magic bytes match declared format
 */
export function validateDocumentMagicBytes(buffer, mimeType) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 3) {
    return false;
  }

  switch (mimeType) {
    case 'image/jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

    case 'image/png':
      if (buffer.length < 8) return false;
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );

    case 'application/pdf':
      if (buffer.length < 4) return false;
      return (
        buffer[0] === 0x25 && // %
        buffer[1] === 0x50 && // P
        buffer[2] === 0x44 && // D
        buffer[3] === 0x46    // F
      );

    default:
      return false;
  }
}
