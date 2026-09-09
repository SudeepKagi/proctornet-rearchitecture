/**
 * @file interventions.schemas.js
 * @description Zod validation schemas for invigilator realtime interventions.
 * Conforms to Phase 26 Track 2 Workstream F.
 */

import { z } from 'zod';

export const announcementSchema = z.object({
  message: z.string().trim().min(1, 'Announcement message cannot be empty').max(1000, 'Announcement cannot exceed 1000 characters'),
  metadata: z.record(z.any()).optional().default({})
});

export const candidateMessageSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(1000, 'Message cannot exceed 1000 characters'),
  reason: z.string().trim().max(255).optional(),
  isWarning: z.boolean().optional().default(false),
  metadata: z.record(z.any()).optional().default({})
});

export const pauseAttemptSchema = z.object({
  reason: z.string().trim().min(1, 'Pause rationale is mandatory').max(500, 'Reason cannot exceed 500 characters'),
  metadata: z.record(z.any()).optional().default({})
});

export const resumeAttemptSchema = z.object({
  reason: z.string().trim().min(1, 'Resume rationale is mandatory').max(500, 'Reason cannot exceed 500 characters'),
  extensionSeconds: z.number().int().min(0).max(3600).optional().default(0),
  metadata: z.record(z.any()).optional().default({})
});

export const terminateAttemptSchema = z.object({
  reason: z.string().trim().min(1, 'Termination reason is mandatory').max(500, 'Reason cannot exceed 500 characters'),
  metadata: z.record(z.any()).optional().default({})
});

export const incidentReportSchema = z.object({
  attemptId: z.string().uuid('Invalid attempt UUID').optional(),
  incidentType: z.enum([
    'IMPERSONATION_ATTEMPT',
    'UNAUTHORIZED_MATERIALS',
    'TECHNICAL_DISRUPTION',
    'COLLUSION',
    'UNAUTHORIZED_PERSON',
    'ENVIRONMENTAL_VIOLATION',
    'OTHER'
  ]).default('OTHER'),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  description: z.string().trim().min(1, 'Description cannot be empty').max(2000, 'Description cannot exceed 2000 characters'),
  evidenceIds: z.array(z.string().uuid('Invalid evidence UUID')).optional().default([]),
  actionTaken: z.string().trim().min(1, 'Action taken cannot be empty').max(500, 'Action taken cannot exceed 500 characters'),
  metadata: z.record(z.any()).optional().default({})
});

export const sessionSignOffSchema = z.object({
  checklist: z.object({
    hardwareVerified: z.boolean().default(true),
    roomChecked: z.boolean().default(true),
    allAttemptsFinalized: z.boolean().default(true),
    incidentsLogged: z.boolean().default(true)
  }).default({}),
  notes: z.string().trim().max(2000).optional().default(''),
  signature: z.string().trim().min(1, 'Invigilator signature confirmation is mandatory').max(255)
});

