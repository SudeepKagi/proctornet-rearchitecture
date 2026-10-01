/**
 * @file user.schemas.js
 * @description Zod validation schemas for administrative and onboarding user endpoints.
 */

import { z } from 'zod';

export const createUserSchema = z
  .object({
    name: z.string().trim().max(255).optional().nullable(),
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .email('Invalid email address format')
      .toLowerCase()
      .max(255),
    phone: z.string().trim().max(32).optional().nullable(),
    role: z.enum(['STUDENT', 'FACULTY'], {
      required_error: 'Role is required and must be either STUDENT or FACULTY'
    }),
    identifier: z
      .string({ required_error: 'Identifier (USN or Employee ID) is required' })
      .trim()
      .min(2, 'Identifier must be at least 2 characters')
      .max(64)
  })
  .superRefine((data, ctx) => {
    const trimmed = typeof data.identifier === 'string' ? data.identifier.trim() : '';
    if (data.role === 'STUDENT') {
      if (!trimmed || trimmed.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'USN / Enrollment Number is required for student accounts',
          path: ['identifier']
        });
      }
    } else if (data.role === 'FACULTY') {
      if (!trimmed || trimmed.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Employee / Faculty ID is required for teacher accounts',
          path: ['identifier']
        });
      }
    }
  });

export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED'], {
    required_error: 'Target status is required'
  }),
  reason: z.string().trim().max(500).optional().nullable()
});

export const updateVerificationSchema = z.object({
  verificationStatus: z.enum(['VERIFIED', 'REJECTED'], {
    required_error: 'Verification decision is required (VERIFIED or REJECTED)'
  }),
  reviewNotes: z.string().trim().max(1000).optional().nullable()
}).refine(
  (data) => data.verificationStatus !== 'REJECTED' || (data.reviewNotes && data.reviewNotes.trim().length > 0),
  {
    message: 'Mandatory review notes are required when rejecting an onboarding submission',
    path: ['reviewNotes']
  }
);

export const firstLoginPasswordSchema = z.object({
  currentPassword: z
    .string({ required_error: 'Current temporary password is required' })
    .min(1, 'Current password cannot be empty'),
  newPassword: z
    .string({ required_error: 'New password is required' })
    .min(8, 'New password must be at least 8 characters')
    .max(128)
});

export const onboardingProfileSchema = z.object({
  department: z.string().trim().min(2).max(128).optional(),
  departmentId: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  semester: z.number().int().min(1).max(12).optional(),
  designation: z.string().trim().min(2).max(128).optional(),
  phone: z.string().trim().max(32).optional().nullable(),
  metadata: z.record(z.any()).optional()
});

export const updateUserProfileSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  phone: z.string().trim().max(32).optional().nullable()
});

export const assignRoleSchema = z.object({
  role: z.enum(['STUDENT', 'FACULTY', 'ADMIN', 'DEVELOPER'], {
    required_error: 'Role is required'
  })
});
