/**
 * @file auth.schemas.js
 * @description Zod validation schemas for authentication request payloads.
 * Strictly prevents client self-assignment of privileged roles or account flags during registration.
 */

import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Invalid email address format')
    .toLowerCase(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password cannot be empty')
});

export const registerSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(255),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Invalid email address format')
    .toLowerCase()
    .max(255),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128),
  phone: z.string().trim().max(32).optional(),
  
  // Optional student profile attributes for student self-registration
  student_profile: z
    .object({
      enrollment_number: z.string().trim().min(1).max(64),
      department: z.string().trim().min(1).max(128),
      semester: z.number().int().min(1).max(12),
      metadata: z.record(z.any()).optional()
    })
    .optional()
}).strip(); // Strips any client-provided role, roles, status, permissions, or locked_until fields
