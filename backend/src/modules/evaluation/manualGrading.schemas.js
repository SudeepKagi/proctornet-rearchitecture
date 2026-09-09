/**
 * @file manualGrading.schemas.js
 * @description Zod validation schemas for subjective question manual evaluation.
 * Conforms to Phase 26 Track 1 Workstream C.
 */

import { z } from 'zod';

export const submitManualGradeSchema = z.object({
  attemptQuestionId: z.string().uuid(),
  pointsAwarded: z.number().min(0),
  rubricScores: z.record(z.any()).optional().default({}),
  feedback: z.string().trim().max(5000).optional().nullable(),
  rationale: z.string().trim().min(3, 'A mandatory rationale (min 3 characters) is required for manual grading and score overrides')
});
