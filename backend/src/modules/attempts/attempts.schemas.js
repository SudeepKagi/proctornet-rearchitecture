/**
 * @file attempts.schemas.js
 * @description Zod validation schemas for Exam Attempts & Question Mapping API requests.
 */

import { z } from 'zod';

export const startAttemptParamsSchema = z.object({
  sessionId: z
    .string({ required_error: 'Session ID is required' })
    .uuid('Session ID must be a valid UUID')
});

export const startAttemptBodySchema = z.object({
  sessionId: z
    .string()
    .uuid('Session ID must be a valid UUID')
    .optional()
});

export const attemptIdParamsSchema = z.object({
  attemptId: z
    .string({ required_error: 'Attempt ID is required' })
    .uuid('Attempt ID must be a valid UUID')
});

export const myAttemptParamsSchema = z.object({
  sessionId: z
    .string({ required_error: 'Session ID is required' })
    .uuid('Session ID must be a valid UUID')
});
