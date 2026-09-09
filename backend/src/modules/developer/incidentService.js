/**
 * @file incidentService.js
 * @description Technical incident triage and lifecycle state machine for Developer Operations.
 * Manages incident states (TRIGGERED, ACKNOWLEDGED, RESOLVED) backed immutably by audit_logs.
 */

import { recordAuditEvent } from '../audit/audit.service.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { sanitizeDeveloperPayload } from './developerPiiSanitizer.js';

// In-memory active incidents tracking map (reconciled with immutable audit_logs)
const incidents = new Map();

/**
 * Triggers a technical incident and records an immutable audit log entry.
 * @param {object} params
 * @param {string} params.component - Subsystem identifier
 * @param {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'} params.severity
 * @param {string} params.message - Failure description
 * @param {string} [params.actorId='SYSTEM'] - Actor UUID or 'SYSTEM'
 * @param {object} [params.metadata]
 * @returns {Promise<object>}
 */
export async function triggerIncident({
  component,
  severity = 'HIGH',
  message,
  actorId = 'SYSTEM',
  metadata = {}
}) {
  const existingActive = Array.from(incidents.values()).find(
    (inc) => inc.component === component && inc.status !== 'RESOLVED'
  );

  if (existingActive) {
    // Update existing active incident details without creating duplicates
    existingActive.lastSeenAt = new Date().toISOString();
    existingActive.occurrenceCount = (existingActive.occurrenceCount || 1) + 1;
    return existingActive;
  }

  const incidentId = `inc_${component}_${Date.now()}`;
  const now = new Date().toISOString();

  const incident = {
    id: incidentId,
    component,
    severity,
    status: 'TRIGGERED',
    message,
    triggeredAt: now,
    lastSeenAt: now,
    occurrenceCount: 1,
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedBy: null,
    resolvedAt: null,
    notes: []
  };

  incidents.set(incidentId, incident);

  try {
    await recordAuditEvent({
      action: 'SYSTEM_INCIDENT_TRIGGERED',
      actorUserId: actorId !== 'SYSTEM' ? actorId : null,
      resourceType: 'SYSTEM_INCIDENT',
      resourceId: incidentId,
      metadata: sanitizeDeveloperPayload({
        component,
        severity,
        message,
        ...metadata
      })
    });
  } catch (err) {
    logger.warn({ err }, 'Non-blocking audit log failure during incident trigger');
  }

  logger.warn(
    { incidentId, component, severity, message },
    'Technical operational incident triggered'
  );

  return incident;
}

/**
 * Acknowledges an active incident by an authorized developer.
 * @param {string} incidentId
 * @param {object} user - Authenticated user object { userId, email }
 * @param {string} [notes] - Optional acknowledgment notes
 * @returns {Promise<object>}
 */
export async function acknowledgeIncident(incidentId, user, notes = '') {
  const incident = incidents.get(incidentId);
  if (!incident) {
    throw new NotFoundError(`Incident '${incidentId}' not found`);
  }

  if (incident.status === 'RESOLVED') {
    throw new BadRequestError('Cannot acknowledge an already resolved incident');
  }

  const now = new Date().toISOString();
  incident.status = 'ACKNOWLEDGED';
  incident.acknowledgedBy = user.userId || user.email || 'DEVELOPER';
  incident.acknowledgedAt = now;

  if (notes) {
    incident.notes.push({
      author: user.userId || user.email || 'DEVELOPER',
      timestamp: now,
      text: notes
    });
  }

  try {
    await recordAuditEvent({
      action: 'SYSTEM_INCIDENT_ACKNOWLEDGED',
      actorUserId: user.userId || null,
      resourceType: 'SYSTEM_INCIDENT',
      resourceId: incidentId,
      metadata: sanitizeDeveloperPayload({
        component: incident.component,
        notes
      })
    });
  } catch (err) {
    logger.warn({ err }, 'Non-blocking audit log failure during incident acknowledgment');
  }

  return incident;
}

/**
 * Resolves an active or acknowledged incident.
 * @param {string} incidentId
 * @param {object} user - Authenticated user object { userId, email }
 * @param {string} [notes] - Optional resolution notes
 * @returns {Promise<object>}
 */
export async function resolveIncident(incidentId, user, notes = '') {
  const incident = incidents.get(incidentId);
  if (!incident) {
    throw new NotFoundError(`Incident '${incidentId}' not found`);
  }

  const now = new Date().toISOString();
  incident.status = 'RESOLVED';
  incident.resolvedBy = user.userId || user.email || 'DEVELOPER';
  incident.resolvedAt = now;

  if (notes) {
    incident.notes.push({
      author: user.userId || user.email || 'DEVELOPER',
      timestamp: now,
      text: notes
    });
  }

  try {
    await recordAuditEvent({
      action: 'SYSTEM_INCIDENT_RESOLVED',
      actorUserId: user.userId || null,
      resourceType: 'SYSTEM_INCIDENT',
      resourceId: incidentId,
      metadata: sanitizeDeveloperPayload({
        component: incident.component,
        notes
      })
    });
  } catch (err) {
    logger.warn({ err }, 'Non-blocking audit log failure during incident resolution');
  }

  return incident;
}

/**
 * Lists technical incidents with filtering.
 * @param {object} filters
 * @param {string} [filters.status]
 * @param {string} [filters.component]
 * @param {number} [filters.limit=50]
 * @returns {object[]}
 */
export function listIncidents(filters = {}) {
  const { status, component, limit = 50 } = filters;
  let all = Array.from(incidents.values());

  if (status) {
    all = all.filter((i) => i.status.toUpperCase() === status.toUpperCase());
  }

  if (component) {
    all = all.filter((i) => i.component.toLowerCase() === component.toLowerCase());
  }

  // Sort newest first
  all.sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());

  return all.slice(0, Math.min(Math.max(1, limit), 100));
}

/**
 * Syncs incidents from live health telemetry.
 * @param {object} healthData - Response from aggregateSystemHealth()
 */
export async function syncIncidentsFromHealth(healthData) {
  if (!healthData || !healthData.subsystems) return;

  for (const [component, sub] of Object.entries(healthData.subsystems)) {
    if (sub.status === 'DOWN') {
      await triggerIncident({
        component,
        severity: 'CRITICAL',
        message: sub.details?.error || `Subsystem ${component} reported DOWN status`,
        actorId: 'SYSTEM'
      });
    } else if (sub.status === 'DEGRADED') {
      await triggerIncident({
        component,
        severity: 'HIGH',
        message: sub.details?.error || `Subsystem ${component} reported DEGRADED status`,
        actorId: 'SYSTEM'
      });
    }
  }
}

/**
 * Clears all in-memory incidents (primarily for test isolation).
 */
export function clearIncidents() {
  incidents.clear();
}
