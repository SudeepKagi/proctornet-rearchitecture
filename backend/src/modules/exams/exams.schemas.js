/**
 * @file exams.schemas.js
 * @description Zod validation schemas for Exam authoring, topic rules, and querying.
 */

import { z } from 'zod';

export const createExamSchema = z
  .object({
    title: z
      .string({ required_error: 'Exam title is required' })
      .trim()
      .min(2, 'Title must be at least 2 characters')
      .max(255, 'Title cannot exceed 255 characters'),
    description: z.string().trim().optional().nullable(),
    subject_id: z
      .string({ required_error: 'Subject ID is required' })
      .uuid('Invalid subject ID format'),
    duration_minutes: z
      .number({ required_error: 'Duration in minutes is required' })
      .int('Duration must be an integer')
      .min(1, 'Duration must be at least 1 minute')
      .max(1440, 'Duration cannot exceed 24 hours (1440 minutes)'),
    total_marks: z
      .number({ required_error: 'Total marks is required' })
      .min(1, 'Total marks must be at least 1'),
    passing_marks: z
      .number({ required_error: 'Passing marks is required' })
      .min(0, 'Passing marks cannot be negative')
  })
  .refine((data) => data.passing_marks <= data.total_marks, {
    message: 'Passing marks cannot exceed total marks',
    path: ['passing_marks']
  });

export const updateExamSchema = z
  .object({
    title: z.string().trim().min(2).max(255).optional(),
    description: z.string().trim().optional().nullable(),
    duration_minutes: z.number().int().min(1).max(1440).optional(),
    total_marks: z.number().min(1).optional(),
    passing_marks: z.number().min(0).optional()
  })
  .refine(
    (data) => {
      if (data.passing_marks !== undefined && data.total_marks !== undefined) {
        return data.passing_marks <= data.total_marks;
      }
      return true;
    },
    {
      message: 'Passing marks cannot exceed total marks',
      path: ['passing_marks']
    }
  );

export const examTopicRuleSchema = z.object({
  topic_id: z
    .string({ required_error: 'Topic ID is required' })
    .uuid('Invalid topic ID format'),
  question_count: z
    .number({ required_error: 'Question count is required' })
    .int('Question count must be an integer')
    .min(1, 'Question count must be at least 1'),
  points_per_question: z
    .number({ required_error: 'Points per question is required' })
    .min(0.01, 'Points per question must be greater than 0'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'ANY']).default('ANY'),
  bloom_level: z.enum(['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE', 'ANY']).default('ANY')
});

export const examQuerySchema = z.object({
  status: z
    .enum(['DRAFT', 'PUBLISHED', 'SCHEDULED', 'LIVE', 'ENDED', 'EVALUATED', 'RESULT_PUBLISHED'])
    .optional(),
  subject_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});
