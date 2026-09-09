/**
 * @file proctoring.schemas.js
 * @description Zod validation schemas for proctoring event ingestion, timeline queries, and flag management.
 * Enforces strict input bounds, untrusted client boundaries, and privacy guarantees.
 */

import { z } from 'zod';
import { EVENT_TAXONOMY } from './anomalyScorer.js';

/**
 * Event types that are permissible for untrusted client submission.
 * Strictly EXCLUDES server-derived anomalies such as 'REPEATED_CONTEXT_SWITCHING'.
 */
export const CLIENT_ALLOWED_EVENT_TYPES = Object.freeze(
  Object.keys(EVENT_TAXONOMY).filter((type) => type !== 'REPEATED_CONTEXT_SWITCHING')
);

/**
 * Validates that clientTimestamp is not more than 60 seconds into the future.
 */
function validateClientTimestamp(ts) {
  const parsed = new Date(ts);
  if (isNaN(parsed.getTime())) {
    return false;
  }
  const maxAllowedFuture = Date.now() + 60 * 1000;
  return parsed.getTime() <= maxAllowedFuture;
}

/**
 * Sanitized metadata schema for telemetry events.
 * Strictly whitelists permitted operational telemetry keys and restricts max payload size to 4KB.
 */
const safeMetadataSchema = z
  .object({
    durationMs: z.number().nonnegative().max(86400000).optional(),
    target: z.string().max(64).optional(),
    keyCombo: z.string().max(64).optional(),
    displayCount: z.number().int().positive().max(16).optional(),
    screenState: z.string().max(64).optional(),
    contextState: z.enum(['EXAM_CONTEXT', 'NON_EXAM_CONTEXT', 'UNKNOWN_CONTEXT']).optional(),
    confidence: z.number().min(0).max(1).optional(),
    reason: z.string().max(256).optional(),
    source: z.string().max(32).optional(),
    fps: z.number().nonnegative().max(120).optional(),
    modelId: z.string().max(64).optional(),
    modelVersion: z.string().max(32).optional()
  })
  .passthrough() // allow other non-sensitive keys but sanitize payload
  .refine(
    (obj) => {
      // Prohibit sensitive keywords in metadata keys or values
      const stringified = JSON.stringify(obj).toLowerCase();
      const forbidden = [
        'password',
        'passwd',
        'clipboardtext',
        'keystroke',
        'answer',
        'token',
        'cookie',
        'secret',
        'riskscore',
        'risk_score',
        'severity'
      ];
      return !forbidden.some((word) => stringified.includes(word));
    },
    { message: 'Metadata contains forbidden sensitive keys or payload content' }
  )
  .refine(
    (obj) => {
      const bytes = Buffer.byteLength(JSON.stringify(obj), 'utf8');
      return bytes <= 4096;
    },
    { message: 'Event metadata exceeds maximum payload size of 4KB' }
  )
  .optional()
  .default({});

/**
 * Schema for a single client-reported telemetry event.
 * Prohibits client-supplied severity, risk score, reviewer fields, or server-derived anomalies.
 */
export const clientEventItemSchema = z
  .object({
    eventId: z.string().uuid({ message: 'eventId must be a valid UUIDv4' }),
    eventType: z.enum(CLIENT_ALLOWED_EVENT_TYPES, {
      errorMap: () => ({
        message: `eventType must be one of: ${CLIENT_ALLOWED_EVENT_TYPES.join(', ')}. Direct client submission of server-derived events (e.g. REPEATED_CONTEXT_SWITCHING) is strictly prohibited.`
      })
    }),
    clientTimestamp: z
      .string()
      .refine(validateClientTimestamp, { message: 'clientTimestamp must be a valid timestamp not exceeding 60s in the future' }),
    metadata: safeMetadataSchema,
    severity: z.never({ message: 'Client-supplied severity is forbidden. Severity is determined authoritatively by the server.' }).optional(),
    riskScore: z.never({ message: 'Client-supplied risk score is forbidden.' }).optional(),
    risk_score: z.never({ message: 'Client-supplied risk score is forbidden.' }).optional()
  })
  .strict();

/**
 * Ingestion request payload schema (Max 50 events per batch).
 */
export const ingestEventsSchema = z
  .object({
    events: z
      .array(clientEventItemSchema)
      .min(1, { message: 'Batch must contain at least 1 event' })
      .max(50, { message: 'Batch cannot exceed 50 events per request' })
  })
  .strict();

/**
 * Schema for manual flag creation by staff.
 */
export const createManualFlagSchema = z
  .object({
    flagType: z.string().min(1).max(64),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().default('MEDIUM'),
    notes: z.string().max(1000).optional().default(''),
    sessionId: z.never({ message: 'Client cannot provide session_id. It is derived server-side.' }).optional(),
    session_id: z.never({ message: 'Client cannot provide session_id. It is derived server-side.' }).optional(),
    studentId: z.never({ message: 'Client cannot provide student_id. It is derived server-side.' }).optional(),
    student_id: z.never({ message: 'Client cannot provide student_id. It is derived server-side.' }).optional()
  })
  .strict();

/**
 * Schema for updating/reviewing a proctor flag.
 */
export const updateFlagStatusSchema = z.object({
  status: z.enum(['REVIEWED', 'DISMISSED'], {
    errorMap: () => ({ message: "Status must be transitioned to 'REVIEWED' or 'DISMISSED'" })
  }),
  notes: z.string().max(1000).optional().default('')
});

/**
 * Schema for query parameters on the violation timeline.
 */
export const timelineQuerySchema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  eventType: z.string().optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10) || 1) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10) || 50)) : 50))
});
