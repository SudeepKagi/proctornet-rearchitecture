/**
 * @file student.schemas.js
 * @description Zod validation schemas and binary magic byte validators for student onboarding.
 */

import { z } from 'zod';

export const updateStudentProfileSchema = z.object({
  name: z.string().min(1, 'Display name cannot be empty').max(255).trim().optional(),
  phone: z.string().max(32).trim().optional().nullable()
}).strict({
  message: 'Academic branch and semester are read-only facts managed exclusively by institutional administrators.'
});

export const studentOnboardingSchema = z.object({
  name: z.string().min(1, 'Full name is required').max(255).trim(),
  departmentId: z.string().uuid('Valid department ID is required'),
  semester: z.number().int().min(1).max(8),
  facePhotoUrl: z.string().optional().nullable(),
  collegeIdUrl: z.string().optional().nullable()
});

/**
 * Validates leading binary signature (magic bytes) against declared MIME type.
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {boolean}
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
