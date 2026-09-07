/**
 * @file audit.service.js
 * @description Centralized business service for recording and querying immutable audit events.
 * Conforms to Step 13.5 and Phase 13 specifications.
 */

import * as auditRepository from './audit.repository.js';
import { ForbiddenError, BadRequestError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * List of sensitive keys to redact from audit metadata.
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'authorization',
  'credit_card',
  'creditcard',
  'cookie',
  'apikey',
  'api_key'
]);

/**
 * Recursively sanitizes metadata by redacting sensitive keys.
 * @param {*} value
 * @returns {*}
 */
export function sanitizeMetadata(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeMetadata);
  }

  if (typeof value === 'object' && !(value instanceof Date)) {
    const cleaned = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        cleaned[k] = '[REDACTED]';
      } else {
        cleaned[k] = sanitizeMetadata(v);
      }
    }
    return cleaned;
  }

  return value;
}

/**
 * Records an immutable audit log event.
 *
 * @param {object} auditData
 * @param {string} [auditData.actorUserId]
 * @param {string} auditData.action
 * @param {string} auditData.resourceType
 * @param {string} auditData.resourceId
 * @param {string} [auditData.attemptId]
 * @param {string} [auditData.requestId]
 * @param {object} [auditData.metadata]
 * @param {import('pg').PoolClient} [client=null] - Transactional client if recording within an active transaction
 * @returns {Promise<object>}
 */
export async function recordAuditEvent(auditData, client = null) {
  const action = auditData.action;
  const resourceType = auditData.resourceType ?? auditData.resource_type;
  const resourceId = auditData.resourceId ?? auditData.resource_id;

  if (!action || typeof action !== 'string') {
    throw new BadRequestError('Audit action must be a non-empty string');
  }

  if (!resourceType || typeof resourceType !== 'string') {
    throw new BadRequestError('Audit resourceType must be a non-empty string');
  }

  if (resourceId === undefined || resourceId === null || String(resourceId).trim() === '') {
    throw new BadRequestError('Audit resourceId must be provided');
  }

  const rawMetadata = auditData.metadata ?? {};
  const cleanedMetadata = sanitizeMetadata(rawMetadata);

  const payload = {
    ...auditData,
    action,
    resourceType,
    resourceId: String(resourceId),
    metadata: cleanedMetadata
  };

  try {
    const result = await auditRepository.createAuditLog(payload, client);
    return result;
  } catch (err) {
    logger.error(
      {
        err,
        action,
        resourceType,
        resourceId,
        actorUserId: auditData.actorUserId ?? auditData.actor_user_id
      },
      'Failed to record audit log event'
    );
    throw err;
  }
}

/**
 * Queries audit logs with filtering and pagination.
 * Strictly restricted to users with the ADMIN role.
 *
 * @param {object} filters
 * @param {string} [filters.actor_user_id]
 * @param {string} [filters.action]
 * @param {string} [filters.resource_type]
 * @param {string} [filters.resource_id]
 * @param {string} [filters.attempt_id]
 * @param {string} [filters.start_date]
 * @param {string} [filters.end_date]
 * @param {number|string} [filters.page=1]
 * @param {number|string} [filters.limit=20]
 * @param {object} user - Authenticated user object { userId, roles }
 * @returns {Promise<{ audit_logs: Array<object>, pagination: object }>}
 */
export async function queryAuditLogs(filters = {}, user) {
  const isAdmin = Array.isArray(user?.roles) && user.roles.includes('ADMIN');
  if (!isAdmin) {
    throw new ForbiddenError('Access denied: Audit log inspection requires ADMIN role');
  }

  const rawPage = parseInt(filters.page, 10);
  const page = !isNaN(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawLimit = parseInt(filters.limit, 10);
  const limit = !isNaN(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

  const offset = (page - 1) * limit;

  const [audit_logs, total] = await Promise.all([
    auditRepository.findAuditLogs(filters, { limit, offset }),
    auditRepository.countAuditLogs(filters)
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    audit_logs,
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  };
}
