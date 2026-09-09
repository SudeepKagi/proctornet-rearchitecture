/**
 * @file developerApi.js
 * @description API client for Developer Operations and Telemetry Control Plane.
 * Conforms to Phase 27 Track 1 specifications.
 */

import { apiClient } from './client.js';

/**
 * Fetches executive developer telemetry overview.
 * @returns {Promise<object>}
 */
export async function getDeveloperOverview() {
  const res = await apiClient('/api/v1/developer/overview');
  return res.data;
}

/**
 * Fetches 13-subsystem health telemetry matrix.
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<object>}
 */
export async function getDeveloperHealth(forceRefresh = false) {
  const url = forceRefresh ? '/api/v1/developer/health?refresh=true' : '/api/v1/developer/health';
  const res = await apiClient(url);
  return res.data;
}

/**
 * Fetches individual subsystem probe telemetry.
 * @param {string} component
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<object>}
 */
export async function getDeveloperComponentHealth(component, forceRefresh = false) {
  const url = forceRefresh
    ? `/api/v1/developer/health/${component}?refresh=true`
    : `/api/v1/developer/health/${component}`;
  const res = await apiClient(url);
  return res.data;
}

/**
 * Queries masked system logs from circular ring buffer with filtering.
 * @param {object} [filters={}]
 * @returns {Promise<{ logs: any[], totalMatching: number, nextCursor: string|null }>}
 */
export async function getDeveloperLogs(filters = {}) {
  const params = new URLSearchParams();
  if (filters.level) params.append('level', filters.level);
  if (filters.service) params.append('service', filters.service);
  if (filters.traceId) params.append('traceId', filters.traceId);
  if (filters.requestId) params.append('requestId', filters.requestId);
  if (filters.search) params.append('search', filters.search);
  if (filters.from) params.append('from', filters.from);
  if (filters.to) params.append('to', filters.to);
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.cursor) params.append('cursor', filters.cursor);

  const queryStr = params.toString();
  const url = queryStr ? `/api/v1/developer/logs?${queryStr}` : '/api/v1/developer/logs';
  const res = await apiClient(url);
  return res.data;
}

/**
 * Fetches technical audit event stream.
 * @param {object} [filters={}]
 * @returns {Promise<{ audit_logs: any[], pagination: object }>}
 */
export async function getDeveloperAudit(filters = {}) {
  const params = new URLSearchParams();
  if (filters.action) params.append('action', filters.action);
  if (filters.actorId) params.append('actorId', filters.actorId);
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.page) params.append('page', String(filters.page));

  const queryStr = params.toString();
  const url = queryStr ? `/api/v1/developer/audit?${queryStr}` : '/api/v1/developer/audit';
  const res = await apiClient(url);
  return res.data;
}

/**
 * Fetches live infrastructure topology graph nodes and edges.
 * @returns {Promise<object>}
 */
export async function getDeveloperTopology() {
  const res = await apiClient('/api/v1/developer/topology');
  return res.data;
}

/**
 * Lists technical operational incidents.
 * @param {object} [filters={}]
 * @returns {Promise<{ incidents: any[] }>}
 */
export async function getDeveloperIncidents(filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.append('status', filters.status);
  if (filters.component) params.append('component', filters.component);
  if (filters.limit) params.append('limit', String(filters.limit));

  const queryStr = params.toString();
  const url = queryStr ? `/api/v1/developer/incidents?${queryStr}` : '/api/v1/developer/incidents';
  const res = await apiClient(url);
  return res.data;
}

/**
 * Acknowledges a technical incident.
 * @param {string} incidentId
 * @param {string} [notes]
 * @returns {Promise<object>}
 */
export async function acknowledgeDeveloperIncident(incidentId, notes = '') {
  const res = await apiClient(`/api/v1/developer/incidents/${incidentId}/acknowledge`, {
    method: 'POST',
    body: { notes }
  });
  return res.data?.incident;
}

/**
 * Resolves a technical incident.
 * @param {string} incidentId
 * @param {string} [notes]
 * @returns {Promise<object>}
 */
export async function resolveDeveloperIncident(incidentId, notes = '') {
  const res = await apiClient(`/api/v1/developer/incidents/${incidentId}/resolve`, {
    method: 'POST',
    body: { notes }
  });
  return res.data?.incident;
}
