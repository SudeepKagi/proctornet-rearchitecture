/**
 * @file results.schemas.js
 * @description Zod validation schemas for Result query parameters, body payloads, and route parameters.
 * Conforms to Step 13.5 and Phase 9 specifications.
 */

import { z } from 'zod';
import { ResultsReleasePolicy } from '../../domain/index.js';

export const candidateResultParamsSchema = z.object({
  attemptId: z
    .string({ required_error: 'Attempt ID is required' })
    .uuid('Attempt ID must be a valid UUID')
});

export const examParamsSchema = z.object({
  examId: z
    .string({ required_error: 'Exam ID is required' })
    .uuid('Exam ID must be a valid UUID')
});

export const listExamResultsQuerySchema = z.object({
  sessionId: z
    .string()
    .uuid('Session ID must be a valid UUID')
    .optional(),
  limit: z.coerce
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(50),
  offset: z.coerce
    .number()
    .int('Offset must be an integer')
    .min(0, 'Offset must be non-negative')
    .default(0)
});

export const examSummaryQuerySchema = z.object({
  sessionId: z
    .string()
    .uuid('Session ID must be a valid UUID')
    .optional()
});

export const updateReleasePolicyBodySchema = z
  .object({
    resultsReleasePolicy: z.enum(
      [
        ResultsReleasePolicy.IMMEDIATE,
        ResultsReleasePolicy.SCHEDULED,
        ResultsReleasePolicy.MANUAL
      ],
      {
        errorMap: () => ({
          message: 'resultsReleasePolicy must be IMMEDIATE, SCHEDULED, or MANUAL'
        })
      }
    ),
    resultsReleaseAt: z
      .string()
      .datetime({ message: 'resultsReleaseAt must be a valid ISO-8601 date string' })
      .optional()
      .nullable()
  })
  .refine(
    (data) => {
      if (data.resultsReleasePolicy === ResultsReleasePolicy.SCHEDULED) {
        return Boolean(data.resultsReleaseAt);
      }
      return true;
    },
    {
      message: 'resultsReleaseAt is required when resultsReleasePolicy is SCHEDULED',
      path: ['resultsReleaseAt']
    }
  )
  .refine(
    (data) => {
      if (data.resultsReleasePolicy !== ResultsReleasePolicy.SCHEDULED) {
        return !data.resultsReleaseAt;
      }
      return true;
    },
    {
      message: 'resultsReleaseAt must be omitted or null when resultsReleasePolicy is IMMEDIATE or MANUAL',
      path: ['resultsReleaseAt']
    }
  );
