/**
 * @file realtime.schemas.js
 * @description Zod schemas and validation utilities for WebSocket envelopes and client commands.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

/**
 * Validates room identifier format.
 * Supported patterns:
 * - session:<uuid>
 * - session:<uuid>:candidate
 * - attempt:<uuid>
 */
export const ROOM_REGEX = /^(session:[0-9a-fA-F-]{36}(:candidate)?|attempt:[0-9a-fA-F-]{36})$/;

export const RoomSchema = z.string().regex(ROOM_REGEX, {
  message: 'Invalid room identifier format. Expected session:<uuid>, session:<uuid>:candidate, or attempt:<uuid>'
});

/**
 * Validates room identifier format.
 * @param {any} room
 * @returns {boolean}
 */
export function validateRoomFormat(room) {
  return typeof room === 'string' && ROOM_REGEX.test(room);
}

/**
 * Inbound client-to-server command schemas.
 * Accepts either { type, room } or { type, payload: { room } }
 */
export const SubscribeCommandSchema = z
  .object({
    type: z.literal('subscribe'),
    room: RoomSchema.optional(),
    payload: z
      .object({
        room: RoomSchema.optional()
      })
      .optional()
  })
  .refine((data) => data.room || data.payload?.room, {
    message: 'Room identifier is required'
  })
  .transform((data) => {
    const r = data.room || data.payload?.room;
    return {
      type: 'subscribe',
      room: r,
      payload: { room: r }
    };
  });

export const UnsubscribeCommandSchema = z
  .object({
    type: z.literal('unsubscribe'),
    room: RoomSchema.optional(),
    payload: z
      .object({
        room: RoomSchema.optional()
      })
      .optional()
  })
  .refine((data) => data.room || data.payload?.room, {
    message: 'Room identifier is required'
  })
  .transform((data) => {
    const r = data.room || data.payload?.room;
    return {
      type: 'unsubscribe',
      room: r,
      payload: { room: r }
    };
  });

export const HeartbeatCommandSchema = z
  .object({
    type: z.literal('heartbeat'),
    payload: z
      .object({
        attemptId: z.string().uuid({ message: 'Valid attempt UUID is required' }).optional()
      })
      .optional()
  })
  .transform((data) => ({
    type: 'heartbeat',
    payload: data.payload || {}
  }));

export const ClientCommandSchema = z.union([
  SubscribeCommandSchema,
  UnsubscribeCommandSchema,
  HeartbeatCommandSchema
]);

/**
 * Outbound server-to-client event envelope schema.
 */
export const EventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  type: z.string().min(1),
  version: z.string().default('1.0'),
  timestamp: z.string().datetime(),
  room: z.string().optional(),
  payload: z.record(z.any()),
  traceId: z.string().optional()
});

/**
 * Creates and validates a standardized event envelope.
 * @param {object} params
 * @param {string} params.type
 * @param {object} params.payload
 * @param {string} [params.room]
 * @param {string} [params.traceId]
 * @param {string} [params.eventId]
 * @param {string} [params.version]
 * @param {string} [params.timestamp]
 * @returns {object} Validated event envelope
 */
export function createEventEnvelope({
  type,
  payload = {},
  room,
  traceId,
  eventId = randomUUID(),
  version = '1.0',
  timestamp = new Date().toISOString()
}) {
  const envelope = {
    eventId,
    type,
    version,
    timestamp,
    room,
    payload,
    traceId
  };
  return EventEnvelopeSchema.parse(envelope);
}

/**
 * Parses and validates an inbound raw string, buffer, or object message.
 * @param {string | Buffer | object} rawMessage
 * @returns {{ success: true, data: object } | { success: false, error: string }}
 */
export function parseClientCommand(rawMessage) {
  let parsed;
  try {
    if (typeof rawMessage === 'object' && rawMessage !== null && !Buffer.isBuffer(rawMessage)) {
      parsed = rawMessage;
    } else {
      const text = typeof rawMessage === 'string' ? rawMessage : rawMessage.toString('utf8');
      parsed = JSON.parse(text);
    }
  } catch {
    return { success: false, error: 'MALFORMED_JSON' };
  }

  const result = ClientCommandSchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return {
      success: false,
      error: firstIssue ? `INVALID_COMMAND: ${firstIssue.message}` : 'INVALID_COMMAND'
    };
  }

  return { success: true, data: result.data };
}

export { ClientCommandSchema as clientCommandSchema, EventEnvelopeSchema as eventEnvelopeSchema };
