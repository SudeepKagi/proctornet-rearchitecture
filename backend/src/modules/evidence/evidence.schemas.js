/**
 * @file evidence.schemas.js
 * @description Zod validation schemas, MIME allowlists, and size limits for Phase 15 Evidence Storage.
 */

import { z } from 'zod';
import { BadRequestError } from '../../utils/errors.js';

export const EVIDENCE_TYPES = ['WEBCAM_SNAPSHOT', 'SCREEN_CAPTURE', 'AUDIO_SNIPPET'];

export const MIME_EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav'
};

export const MAX_BYTE_SIZES = {
  WEBCAM_SNAPSHOT: 5 * 1024 * 1024, // 5 MB
  SCREEN_CAPTURE: 10 * 1024 * 1024, // 10 MB
  AUDIO_SNIPPET: 5 * 1024 * 1024    // 5 MB
};

/**
 * Derives the server-controlled file extension from a validated MIME content type.
 * @param {string} mimeType
 * @returns {string} extension (e.g. 'jpg', 'png', 'webm')
 */
export function getExtensionForMime(mimeType) {
  const ext = MIME_EXTENSION_MAP[mimeType];
  if (!ext) {
    throw new BadRequestError(`Unsupported MIME type: '${mimeType}'. Allowed types: ${Object.keys(MIME_EXTENSION_MAP).join(', ')}`);
  }
  return ext;
}

/**
 * Validates that byte size does not exceed the allowed maximum for the evidence type.
 * @param {string} evidenceType
 * @param {number} byteSize
 */
export function validateEvidenceSize(evidenceType, byteSize) {
  const max = MAX_BYTE_SIZES[evidenceType];
  if (!max) {
    throw new BadRequestError(`Unknown evidence type: '${evidenceType}'`);
  }
  if (byteSize <= 0) {
    throw new BadRequestError('Evidence byte size must be greater than 0');
  }
  if (byteSize > max) {
    throw new BadRequestError(`Evidence byte size ${byteSize} exceeds maximum allowed size of ${max} bytes for ${evidenceType}`);
  }
}

/**
 * Schema for requesting a presigned PUT upload URL.
 * POST /api/v1/attempts/:attemptId/evidence/upload-url
 */
export const requestUploadUrlSchema = z.object({
  evidenceType: z.enum(EVIDENCE_TYPES, {
    errorMap: () => ({ message: `evidenceType must be one of: ${EVIDENCE_TYPES.join(', ')}` })
  }),
  contentType: z.string().refine((val) => Boolean(MIME_EXTENSION_MAP[val]), {
    message: `contentType must be one of: ${Object.keys(MIME_EXTENSION_MAP).join(', ')}`
  }),
  byteSize: z.number().int().positive('byteSize must be a positive integer'),
  sha256Checksum: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/, 'sha256Checksum must be a 64-character hexadecimal string')
    .optional()
    .nullable(),
  violationId: z.string().uuid('violationId must be a valid UUID').optional().nullable(),
  flagId: z.string().uuid('flagId must be a valid UUID').optional().nullable(),
  metadata: z.record(z.unknown()).optional().default({})
}).superRefine((data, ctx) => {
  const max = MAX_BYTE_SIZES[data.evidenceType];
  if (max && data.byteSize > max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `byteSize ${data.byteSize} exceeds maximum limit of ${max} bytes for ${data.evidenceType}`,
      path: ['byteSize']
    });
  }
});

/**
 * Schema for confirming an uploaded evidence record.
 * POST /api/v1/attempts/:attemptId/evidence/:evidenceId/confirm
 */
export const confirmEvidenceSchema = z.object({
  byteSize: z.number().int().positive().optional(),
  sha256Checksum: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/, 'sha256Checksum must be a 64-character hexadecimal string')
    .optional()
    .nullable()
});

/**
 * Schema for querying attempt evidence listing.
 * GET /api/v1/attempts/:attemptId/evidence
 */
export const listEvidenceQuerySchema = z.object({
  evidenceType: z.enum(EVIDENCE_TYPES).optional(),
  status: z.enum(['INITIATED', 'AVAILABLE', 'FAILED', 'ABANDONED', 'PURGED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
