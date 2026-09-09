/**
 * @file interventionsApi.js
 * @description API client for invigilator realtime interventions, incident reports, and session sign-off.
 * Conforms to Phase 26 Track 2 Workstreams F & H.
 */

import { apiClient } from './client.js';

export async function broadcastAnnouncement(sessionId, message) {
  const res = await apiClient(`/api/v1/interventions/sessions/${sessionId}/announcements`, {
    method: 'POST',
    body: { message }
  });
  return res.data;
}

export async function sendCandidateMessage(attemptId, { message, reason, isWarning = false }) {
  const res = await apiClient(`/api/v1/interventions/attempts/${attemptId}/message`, {
    method: 'POST',
    body: { message, reason, isWarning }
  });
  return res.data;
}

export async function pauseAttempt(attemptId, reason) {
  const res = await apiClient(`/api/v1/interventions/attempts/${attemptId}/pause`, {
    method: 'POST',
    body: { reason }
  });
  return res.data;
}

export async function resumeAttempt(attemptId, { reason, extensionSeconds = 0 }) {
  const res = await apiClient(`/api/v1/interventions/attempts/${attemptId}/resume`, {
    method: 'POST',
    body: { reason, extensionSeconds }
  });
  return res.data;
}

export async function terminateAttempt(attemptId, reason) {
  const res = await apiClient(`/api/v1/interventions/attempts/${attemptId}/terminate`, {
    method: 'POST',
    body: { reason }
  });
  return res.data;
}

export async function getSessionInterventions(sessionId) {
  const res = await apiClient(`/api/v1/interventions/sessions/${sessionId}/history`);
  return res.data?.interventions || [];
}

export async function getAttemptInterventions(attemptId) {
  const res = await apiClient(`/api/v1/interventions/attempts/${attemptId}/history`);
  return res.data?.interventions || [];
}

export async function getAttemptTimeline(attemptId) {
  const res = await apiClient(`/api/v1/interventions/attempts/${attemptId}/timeline`);
  return res.data?.timeline || [];
}

export async function reportIncident(sessionId, data) {
  const res = await apiClient(`/api/v1/interventions/sessions/${sessionId}/incidents`, {
    method: 'POST',
    body: data
  });
  return res.data;
}

export async function getSessionIncidents(sessionId) {
  const res = await apiClient(`/api/v1/interventions/sessions/${sessionId}/incidents`);
  return res.data?.incidents || [];
}

export async function signOffSession(sessionId, data) {
  const res = await apiClient(`/api/v1/interventions/sessions/${sessionId}/sign-off`, {
    method: 'POST',
    body: data
  });
  return res.data;
}

export async function getSessionSignOffStatus(sessionId) {
  const res = await apiClient(`/api/v1/interventions/sessions/${sessionId}/sign-off`);
  return res.data;
}
