/**
 * @file sessions.schemas.js
 * @description Zod validation schemas for Exam Sessions, Scheduling, and Candidate/Invigilator Assignments.
 */

import { z } from 'zod';

export const createSessionSchema = z
  .object({
    exam_id: z
      .string({ required_error: 'Exam ID is required' })
      .uuid('Invalid exam ID format'),
    room_id: z
      .string()
      .uuid('Invalid room ID format')
      .optional()
      .nullable(),
    scheduled_start_time: z
      .string({ required_error: 'Scheduled start time is required' })
      .datetime({ message: 'Scheduled start time must be a valid ISO-8601 date string' }),
    scheduled_end_time: z
      .string({ required_error: 'Scheduled end time is required' })
      .datetime({ message: 'Scheduled end time must be a valid ISO-8601 date string' })
  })
  .refine(
    (data) => new Date(data.scheduled_end_time) > new Date(data.scheduled_start_time),
    {
      message: 'Scheduled end time must be strictly after scheduled start time',
      path: ['scheduled_end_time']
    }
  );

export const updateSessionSchema = z
  .object({
    room_id: z
      .string()
      .uuid('Invalid room ID format')
      .optional()
      .nullable(),
    scheduled_start_time: z
      .string()
      .datetime({ message: 'Scheduled start time must be a valid ISO-8601 date string' })
      .optional(),
    scheduled_end_time: z
      .string()
      .datetime({ message: 'Scheduled end time must be a valid ISO-8601 date string' })
      .optional(),
    status: z
      .enum(['SCHEDULED', 'ACTIVE', 'CONCLUDED', 'CANCELLED'])
      .optional()
  })
  .refine(
    (data) => {
      if (data.scheduled_start_time && data.scheduled_end_time) {
        return new Date(data.scheduled_end_time) > new Date(data.scheduled_start_time);
      }
      return true;
    },
    {
      message: 'Scheduled end time must be strictly after scheduled start time',
      path: ['scheduled_end_time']
    }
  );

export const assignStudentsSchema = z.object({
  student_ids: z
    .array(z.string().uuid('Each student ID must be a valid UUID'))
    .min(1, 'At least one student ID must be provided')
});

export const assignInvigilatorSchema = z.object({
  user_id: z
    .string({ required_error: 'User ID is required' })
    .uuid('Invalid user ID format'),
  role: z
    .enum(['PRIMARY', 'SECONDARY'])
    .default('PRIMARY')
});

export const sessionQuerySchema = z.object({
  exam_id: z.string().uuid().optional(),
  room_id: z.string().uuid().optional(),
  status: z
    .enum(['SCHEDULED', 'ACTIVE', 'CONCLUDED', 'CANCELLED'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const createRoomSchema = z.object({
  name: z
    .string({ required_error: 'Room name is required' })
    .trim()
    .min(1, 'Room name cannot be empty')
    .max(128, 'Room name cannot exceed 128 characters'),
  capacity: z
    .number({ required_error: 'Room capacity is required' })
    .int('Capacity must be an integer')
    .min(1, 'Capacity must be at least 1'),
  building: z
    .string()
    .trim()
    .max(128)
    .optional()
    .nullable(),
  metadata: z
    .record(z.any())
    .optional()
    .default({})
});
