/**
 * @file proctoringApi.js
 * @description API service functions for proctoring event telemetry ingestion,
 * timeline queries, session monitoring summaries, and flag lifecycle management.
 */

import { apiClient } from './client.js';

/**
 * Submits a batch of telemetry and violation events for an attempt.
 * @param {string} attemptId
 * @param {Array<Object>} events
 */
export async function ingestEvents(attemptId, events) {
  const result = await apiClient(`/api/v1/attempts/${attemptId}/events`, {
    method: 'POST',
    body: { events }
  });
  return result.data;
}

/**
 * Queries violation event timeline and flags for an attempt (Invigilator/Faculty/Admin).
 * @param {string} attemptId
 * @param {Object} [params]
 */
export async function getAttemptEvents(attemptId, params = {}) {
  const query = new URLSearchParams(params).toString();
  const endpoint = `/api/v1/attempts/${attemptId}/events${query ? `?${query}` : ''}`;
  const result = await apiClient(endpoint, { method: 'GET' });
  return result.data;
}

/**
 * Retrieves session proctoring summary across all candidates.
 * @param {string} sessionId
 */
export async function getSessionProctoringSummary(sessionId) {
  const result = await apiClient(`/api/v1/sessions/${sessionId}/proctoring/summary`, {
    method: 'GET'
  });
  return result.data;
}

/**
 * Creates a manual flag for an attempt.
 * @param {string} attemptId
 * @param {Object} flagData
 */
export async function createManualFlag(attemptId, flagData) {
  const result = await apiClient(`/api/v1/attempts/${attemptId}/proctoring/flags`, {
    method: 'POST',
    body: flagData
  });
  return result.data;
}

/**
 * Updates status of a flag (ACTIVE -> REVIEWED / DISMISSED).
 * @param {string} attemptId
 * @param {string} flagId
 * @param {Object} updateData
 */
export async function updateFlagStatus(attemptId, flagId, updateData) {
  const result = await apiClient(`/api/v1/attempts/${attemptId}/proctoring/flags/${flagId}`, {
    method: 'PATCH',
    body: updateData
  });
  return result.data;
}
