/**
 * @file answers.schemas.js
 * @description Zod validation schemas for Exam Answers, Autosave, OCC Revisions, and Clear operations.
 */

import { z } from 'zod';

/**
 * Route parameter schema for /attempts/:attemptId/answers
 */
export const attemptAnswersParamsSchema = z.object({
  attemptId: z
    .string({ required_error: 'Attempt ID is required' })
    .uuid('Attempt ID must be a valid UUID')
});

/**
 * Route parameter schema for /attempts/:attemptId/answers/:attemptQuestionId
 */
export const singleAnswerParamsSchema = z.object({
  attemptId: z
    .string({ required_error: 'Attempt ID is required' })
    .uuid('Attempt ID must be a valid UUID'),
  attemptQuestionId: z
    .string({ required_error: 'Attempt Question ID is required' })
    .uuid('Attempt Question ID must be a valid UUID')
});

/**
 * Schema for PUT /attempts/:attemptId/answers/:attemptQuestionId
 */
export const saveAnswerBodySchema = z
  .object({
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
 * Schema for DELETE /attempts/:attemptId/answers/:attemptQuestionId
 */
export const clearAnswerBodySchema = z
  .object({
    expected_revision: z
      .number({ required_error: 'expected_revision is required' })
      .int('expected_revision must be an integer')
      .min(0, 'expected_revision must be non-negative')
  })
  .strict();

/**
 * Schema for individual item in batch answer autosave
 */
export const batchAnswerItemSchema = z
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
 * Schema for POST /attempts/:attemptId/answers/batch
 */
export const batchAnswersBodySchema = z
  .object({
    answers: z
      .array(batchAnswerItemSchema, { required_error: 'answers array is required' })
      .min(1, 'answers array must contain at least one item')
      .refine(
        (items) => {
          const ids = items.map((item) => item.attempt_question_id);
          return new Set(ids).size === ids.length;
        },
        {
          message: 'Batch request contains duplicate attempt_question_id entries'
        }
      )
  })
  .strict();
