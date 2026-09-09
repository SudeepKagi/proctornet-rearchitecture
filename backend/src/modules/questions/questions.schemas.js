/**
 * @file questions.schemas.js
 * @description Zod validation schemas for Question Bank and Rich Question Authoring.
 * Conforms to Phase 26 Track 1 Workstream A specifications.
 */

import { z } from 'zod';
import {
  ALL_QUESTION_TYPES,
  ALL_DIFFICULTY_LEVELS,
  ALL_BLOOM_LEVELS,
  ALL_QUESTION_STATUSES
} from '../../domain/question/questionTypes.js';

export const createQuestionBankSchema = z.object({
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().max(2000).optional().nullable(),
  subject_id: z.string().uuid().optional().nullable(),
  is_shared: z.boolean().default(false)
});

export const updateQuestionBankSchema = z.object({
  title: z.string().trim().min(3).max(255).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  subject_id: z.string().uuid().optional().nullable(),
  is_shared: z.boolean().optional()
});

const questionOptionSchema = z.object({
  option_id: z.string().uuid().optional(),
  option_text: z.string().trim().min(1),
  is_correct: z.boolean().default(false),
  display_order: z.number().int().nonnegative().optional()
});

export const createQuestionSchema = z.object({
  bank_id: z.string().uuid().optional().nullable(),
  topic_id: z.string().uuid(),
  question_type: z.enum(ALL_QUESTION_TYPES),
  prompt_text: z.string().trim().min(1),
  default_points: z.number().positive().default(1.0),
  difficulty: z.enum(ALL_DIFFICULTY_LEVELS).default('MEDIUM'),
  bloom_level: z.enum(ALL_BLOOM_LEVELS).default('REMEMBER'),
  tags: z.array(z.string().trim().min(1)).default([]),
  status: z.enum(ALL_QUESTION_STATUSES).default('PUBLISHED'),
  correct_numeric_value: z.number().finite().optional().nullable(),
  options: z.array(questionOptionSchema).optional().default([]),
  rubric: z.record(z.any()).optional().default({}),
  metadata: z.record(z.any()).optional().default({})
});

export const updateQuestionSchema = z.object({
  topic_id: z.string().uuid().optional(),
  prompt_text: z.string().trim().min(1).optional(),
  default_points: z.number().positive().optional(),
  difficulty: z.enum(ALL_DIFFICULTY_LEVELS).optional(),
  bloom_level: z.enum(ALL_BLOOM_LEVELS).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  status: z.enum(ALL_QUESTION_STATUSES).optional(),
  correct_numeric_value: z.number().finite().optional().nullable(),
  options: z.array(questionOptionSchema).optional(),
  rubric: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional()
});

export const cloneQuestionSchema = z.object({
  target_bank_id: z.string().uuid().optional().nullable(),
  prompt_text: z.string().trim().min(1).optional()
});

export const searchQuestionsQuerySchema = z.object({
  bank_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  topic_id: z.string().uuid().optional(),
  difficulty: z.enum(ALL_DIFFICULTY_LEVELS).optional(),
  bloom_level: z.enum(ALL_BLOOM_LEVELS).optional(),
  question_type: z.enum(ALL_QUESTION_TYPES).optional(),
  status: z.enum(ALL_QUESTION_STATUSES).optional(),
  tag: z.string().trim().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});
