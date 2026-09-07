/**
 * @file audit.repository.js
 * @description Authoritative database access layer for the immutable audit_logs table.
 * Implements parameterized queries, transactional client support, and filtering per Phase 13 specifications.
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';

/**
 * Creates an immutable audit log record.
 * Supports both standalone queries and transactional pool clients.
 *
 * @param {object} auditData
 * @param {string} [auditData.actorUserId] - ID of the user performing the action (or actor_user_id)
 * @param {string} auditData.action - Action identifier enum (e.g. EXAM_CREATED, AUTH_LOGIN_SUCCESS)
 * @param {string} auditData.resourceType - Domain entity type (or resource_type)
 * @param {string} auditData.resourceId - ID of the entity affected (or resource_id)
 * @param {string} [auditData.attemptId] - Optional associated attempt ID (or attempt_id)
 * @param {string} [auditData.requestId] - Request correlation ID (or request_id)
 * @param {object} [auditData.metadata] - Additional contextual metadata (serialized to JSONB)
 * @param {import('pg').PoolClient} [client=null] - Optional active database transaction client
 * @returns {Promise<object>} The newly inserted audit record
 */
export async function createAuditLog(auditData, client = null) {
  const actorUserId = auditData.actorUserId ?? auditData.actor_user_id ?? null;
  const action = auditData.action;
  const resourceType = auditData.resourceType ?? auditData.resource_type;
  const resourceId = String(auditData.resourceId ?? auditData.resource_id ?? '');
  const attemptId = auditData.attemptId ?? auditData.attempt_id ?? null;
  const requestId = auditData.requestId ?? auditData.request_id ?? null;
  const metadata = auditData.metadata ?? {};

  const sql = `
    INSERT INTO audit_logs (
      actor_user_id,
      action,
      resource_type,
      resource_id,
      attempt_id,
      request_id,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING
      audit_id,
      actor_user_id,
      action,
      resource_type,
      resource_id,
      attempt_id,
      timestamp,
      request_id,
      metadata,
      created_at;
  `;

  const params = [
    actorUserId,
    action,
    resourceType,
    resourceId,
    attemptId,
    requestId,
    typeof metadata === 'string' ? metadata : JSON.stringify(metadata)
  ];

  const result = client ? await client.query(sql, params) : await query(sql, params);
  return result.rows[0];
}

/**
 * Builds dynamic WHERE clause and parameter array for audit log queries.
 * @private
 */
function buildFilterClause(filters = {}) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  const actorUserId = filters.actor_user_id ?? filters.actorUserId;
  if (actorUserId) {
    conditions.push(`actor_user_id = $${paramIndex++}`);
    params.push(actorUserId);
  }

  const action = filters.action;
  if (action) {
    conditions.push(`action = $${paramIndex++}`);
    params.push(action);
  }

  const resourceType = filters.resource_type ?? filters.resourceType;
  if (resourceType) {
    conditions.push(`resource_type = $${paramIndex++}`);
    params.push(resourceType);
  }

  const resourceId = filters.resource_id ?? filters.resourceId;
  if (resourceId) {
    conditions.push(`resource_id = $${paramIndex++}`);
    params.push(String(resourceId));
  }

  const attemptId = filters.attempt_id ?? filters.attemptId;
  if (attemptId) {
    conditions.push(`attempt_id = $${paramIndex++}`);
    params.push(attemptId);
  }

  const startDate = filters.start_date ?? filters.startDate;
  if (startDate) {
    conditions.push(`timestamp >= $${paramIndex++}`);
    params.push(new Date(startDate));
  }

  const endDate = filters.end_date ?? filters.endDate;
  if (endDate) {
    conditions.push(`timestamp <= $${paramIndex++}`);
    params.push(new Date(endDate));
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params, nextParamIndex: paramIndex };
}

/**
 * Queries audit logs with deterministic ordering and pagination.
 *
 * @param {object} [filters={}]
 * @param {object} [pagination={}]
 * @param {number} [pagination.limit=20]
 * @param {number} [pagination.offset=0]
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<Array<object>>}
 */
export async function findAuditLogs(filters = {}, { limit = 20, offset = 0 } = {}, client = null) {
  const { whereClause, params, nextParamIndex } = buildFilterClause(filters);

  const queryText = `
    SELECT
      audit_id,
      actor_user_id,
      action,
      resource_type,
      resource_id,
      attempt_id,
      timestamp,
      request_id,
      metadata,
      created_at
    FROM audit_logs
    ${whereClause}
    ORDER BY timestamp DESC, audit_id DESC
    LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1};
  `;

  params.push(limit, offset);

  const result = client ? await client.query(queryText, params) : await query(queryText, params);
  return result.rows;
}

/**
 * Counts the total number of audit logs matching the given filters.
 *
 * @param {object} [filters={}]
 * @param {import('pg').PoolClient} [client=null]
 * @returns {Promise<number>}
 */
export async function countAuditLogs(filters = {}, client = null) {
  const { whereClause, params } = buildFilterClause(filters);

  const queryText = `
    SELECT COUNT(*)::int AS count
    FROM audit_logs
    ${whereClause};
  `;

  const result = client ? await client.query(queryText, params) : await query(queryText, params);
  return result.rows[0]?.count ?? 0;
}
