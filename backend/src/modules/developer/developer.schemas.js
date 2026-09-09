/**
 * @file developer.schemas.js
 * @description Zod validation schemas for Developer Operations endpoints.
 */

import { z } from 'zod';

export const logQuerySchema = z.object({
  level: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .optional(),
  service: z.string().trim().max(100).optional(),
  traceId: z.string().trim().max(128).optional(),
  requestId: z.string().trim().max(128).optional(),
  search: z.string().trim().max(200).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional()
});

export const auditQuerySchema = z.object({
  action: z.string().trim().max(100).optional(),
  actorId: z.string().uuid().optional(),
  targetId: z.string().trim().max(100).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).default(1)
});

export const incidentActionSchema = z.object({
  notes: z.string().trim().max(1000).optional()
});

export const componentParamSchema = z.object({
  component: z.enum([
    'node_api',
    'postgres_primary',
    'postgres_replica',
    'redis',
    'rabbitmq',
    'websocket',
    'sfu',
    'coturn',
    'outbox_poller',
    'evaluation_consumer',
    's3_storage',
    'backup_service',
    'wireguard'
  ])
});
