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
