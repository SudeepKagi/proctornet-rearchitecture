/**
 * @file submissions.schemas.js
 * @description Zod validation schemas for Exam Submission endpoint.
 * Conforms to Step 13.5 and Phase 8 specifications.
 */

import { z } from 'zod';

/**
 * Route parameter schema for /attempts/:attemptId/submit
 */
export const submitAttemptParamsSchema = z.object({
  attemptId: z
    .string({ required_error: 'Attempt ID is required' })
    .uuid('Attempt ID must be a valid UUID')
});

/**
 * Individual dirty answer item in submission payload
 */
export const submitAnswerItemSchema = z
  .object({
    attempt_question_id: z
      .string({ required_error: 'attempt_question_id is required' })
      .uuid('attempt_question_id must be a valid UUID'),
    answer_value: z
      .record(z.any(), { required_error: 'answer_value is required' })
      .refine(
        (val) => val !== null && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0,
        { message: 'answer_value must be a non-empty object' }
      ),
    expected_revision: z
      .number({ required_error: 'expected_revision is required' })
      .int('expected_revision must be an integer')
      .min(0, 'expected_revision must be non-negative')
  })
  .strict();

/**
 * Body schema for POST /attempts/:attemptId/submit
 */
export const submitAttemptBodySchema = z
  .object({
    answers: z
      .array(submitAnswerItemSchema)
      .optional()
      .refine(
        (items) => {
          if (!items || items.length === 0) return true;
          const ids = items.map((item) => item.attempt_question_id);
          return new Set(ids).size === ids.length;
        },
        {
          message: 'Submission answers array contains duplicate attempt_question_id entries'
        }
      )
  })
  .strict();
