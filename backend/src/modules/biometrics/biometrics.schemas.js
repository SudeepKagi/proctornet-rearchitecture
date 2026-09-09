/**
 * @file biometrics.schemas.js
 * @description Zod validation schemas for Phase 25 Biometric Identity endpoints.
 * CRITICAL INVARIANT: Rejects any client-supplied embedding, liveEmbedding, vector,
 * faceVector, or motionDelta payload with 400 Bad Request.
 */

import { z } from 'zod';

export const MAX_BIOMETRIC_IMAGE_BYTE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_LIVENESS_MEDIA_BYTE_SIZE = 5 * 1024 * 1024; // 5 MB

export const FORBIDDEN_CLIENT_BIOMETRIC_FIELDS = [
  'embedding',
  'liveEmbedding',
  'vector',
  'faceVector',
  'motionDelta',
  'livenessScore',
  'actionVerdicts',
  'confidenceScore',
  'similarityScore'
];

/**
 * SuperRefine helper to ensure no forbidden client-computed biometric vector fields exist.
 */
function rejectForbiddenBiometricFields(data, ctx) {
  if (data && typeof data === 'object') {
    for (const forbidden of FORBIDDEN_CLIENT_BIOMETRIC_FIELDS) {
      if (forbidden in data) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [forbidden],
          message: `Client-supplied biometric field '${forbidden}' is strictly forbidden. All biometric feature extraction must be server-authoritative.`
        });
      }
    }
  }
}

// 1. POST /api/v1/candidate/biometrics/enroll-url
export const enrollUrlSchema = z
  .object({
    fileName: z.string().min(1, 'fileName is required').max(255),
    mimeType: z.enum(['image/jpeg', 'image/png'], {
      errorMap: () => ({ message: 'mimeType must be image/jpeg or image/png' })
    }),
    byteSize: z
      .number()
      .int()
      .min(1, 'byteSize must be greater than 0')
      .max(MAX_BIOMETRIC_IMAGE_BYTE_SIZE, `byteSize cannot exceed ${MAX_BIOMETRIC_IMAGE_BYTE_SIZE} bytes (10MB)`)
  })
  .passthrough()
  .superRefine(rejectForbiddenBiometricFields);

// 2. POST /api/v1/candidate/biometrics/enroll-confirm
// Strict: only biometricId permitted. No embeddings or metadata allowed.
export const enrollConfirmSchema = z
  .object({
    biometricId: z.string().uuid('biometricId must be a valid UUID')
  })
  .strict()
  .superRefine(rejectForbiddenBiometricFields);

// 3. POST /api/v1/candidate/biometrics/liveness-challenge
export const livenessChallengeSchema = z
  .object({
    sessionId: z.string().uuid('sessionId must be a valid UUID')
  })
  .passthrough()
  .superRefine(rejectForbiddenBiometricFields);

// 4. POST /api/v1/candidate/biometrics/verify-liveness
export const verifyLivenessSchema = z
  .object({
    challengeId: z.string().uuid('challengeId must be a valid UUID'),
    nonce: z.string().min(1, 'nonce is required').max(64),
    sessionId: z.string().uuid('sessionId must be a valid UUID').optional()
  })
  .passthrough()
  .superRefine(rejectForbiddenBiometricFields);

// 5. POST /api/v1/candidate/biometrics/verify-image-url
export const verifyImageUrlSchema = z
  .object({
    sessionId: z.string().uuid('sessionId must be a valid UUID'),
    mimeType: z.enum(['image/jpeg', 'image/png'], {
      errorMap: () => ({ message: 'mimeType must be image/jpeg or image/png' })
    }),
    byteSize: z
      .number()
      .int()
      .min(1, 'byteSize must be greater than 0')
      .max(MAX_BIOMETRIC_IMAGE_BYTE_SIZE, `byteSize cannot exceed ${MAX_BIOMETRIC_IMAGE_BYTE_SIZE} bytes (10MB)`)
  })
  .passthrough()
  .superRefine(rejectForbiddenBiometricFields);

// 6. POST /api/v1/candidate/biometrics/verify-face
export const verifyFaceSchema = z
  .object({
    liveImageId: z.string().uuid('liveImageId must be a valid UUID'),
    livenessToken: z.string().min(1, 'livenessToken is required')
  })
  .passthrough()
  .superRefine(rejectForbiddenBiometricFields);

// 7. POST /api/v1/admin/biometrics/override
export const adminOverrideSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
  studentId: z.string().uuid('studentId must be a valid UUID'),
  reason: z.string().min(10, 'reason must be at least 10 characters')
});

// 8. GET /api/v1/admin/biometrics/sessions/:sessionId
export const adminSessionVerificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['PENDING', 'VERIFIED', 'FAILED', 'LOCKED', 'OVERRIDDEN', 'EXEMPTED'])
    .optional()
});
