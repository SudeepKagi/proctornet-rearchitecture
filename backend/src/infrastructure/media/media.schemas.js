/**
 * @file media.schemas.js
 * @description Zod validation schemas for WebRTC / SFU media signaling commands (Phase 17).
 */

import { z } from 'zod';

export const mediaGetRouterCapabilitiesSchema = z.object({
  sessionId: z.string().uuid('Invalid sessionId UUID').optional()
});

export const mediaCreateTransportSchema = z.object({
  sessionId: z.string().uuid('Invalid sessionId UUID'),
  direction: z.enum(['send', 'recv'], {
    required_error: 'direction is required',
    invalid_type_error: "direction must be 'send' or 'recv'"
  })
});

export const mediaConnectTransportSchema = z.object({
  transportId: z.string().uuid('Invalid transportId UUID'),
  dtlsParameters: z.record(z.any(), {
    required_error: 'dtlsParameters is required'
  })
});

export const mediaProduceSchema = z.object({
  transportId: z.string().uuid('Invalid transportId UUID'),
  kind: z.enum(['audio', 'video'], {
    required_error: 'kind is required',
    invalid_type_error: "kind must be 'audio' or 'video'"
  }),
  rtpParameters: z.record(z.any(), {
    required_error: 'rtpParameters is required'
  }),
  appData: z
    .object({
      trackType: z.enum(['webcam', 'microphone', 'screen']).optional()
    })
    .optional()
});

export const mediaConsumeSchema = z.object({
  transportId: z.string().uuid('Invalid transportId UUID'),
  producerId: z.string().uuid('Invalid producerId UUID'),
  rtpCapabilities: z.record(z.any(), {
    required_error: 'rtpCapabilities is required'
  })
});

export const mediaConsumeBatchSchema = z.object({
  transportId: z.string().uuid('Invalid transportId UUID'),
  rtpCapabilities: z.record(z.any(), {
    required_error: 'rtpCapabilities is required at root level'
  }),
  producerIds: z
    .array(z.string().uuid('Each producerId must be a valid UUID'))
    .min(1, 'At least one producerId required')
    .max(36, 'Maximum 36 producerIds per batch')
});

export const mediaConsumerSetLayersSchema = z.object({
  consumerId: z.string().uuid('Invalid consumerId UUID'),
  spatialLayer: z.number().int().min(0).max(2),
  temporalLayer: z.number().int().min(0).max(2).optional()
});

export const mediaConsumerPauseSchema = z.object({
  consumerId: z.string().uuid('Invalid consumerId UUID')
});

export const mediaConsumerResumeSchema = z.object({
  consumerId: z.string().uuid('Invalid consumerId UUID')
});

export const mediaRestartIceSchema = z.object({
  transportId: z.string().uuid('Invalid transportId UUID')
});

export const mediaCloseProducerSchema = z.object({
  producerId: z.string().uuid('Invalid producerId UUID')
});

export const mediaCommandSchemas = {
  'media:get_router_capabilities': mediaGetRouterCapabilitiesSchema,
  'media:create_transport': mediaCreateTransportSchema,
  'media:connect_transport': mediaConnectTransportSchema,
  'media:produce': mediaProduceSchema,
  'media:consume': mediaConsumeSchema,
  'media:consume_batch': mediaConsumeBatchSchema,
  'media:consumer_set_layers': mediaConsumerSetLayersSchema,
  'media:consumer_pause': mediaConsumerPauseSchema,
  'media:consumer_resume': mediaConsumerResumeSchema,
  'media:restart_ice': mediaRestartIceSchema,
  'media:close_producer': mediaCloseProducerSchema
};

/**
 * Validates a media command payload against its corresponding Zod schema.
 * @param {string} action
 * @param {unknown} payload
 * @returns {{ success: boolean, data?: any, error?: string }}
 */
export function parseMediaCommand(action, payload) {
  const schema = mediaCommandSchemas[action];
  if (!schema) {
    return { success: false, error: `Unknown media action: ${action}` };
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    return { success: false, error: result.error.errors.map((e) => e.message).join(', ') };
  }
  return { success: true, data: result.data };
}

