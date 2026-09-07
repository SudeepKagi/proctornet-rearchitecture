/**
 * @file sessionsApi.js
 * @description API service functions for Sessions, Rooms, Rosters, and Invigilation.
 */

import { apiClient } from './client.js';

export async function listSessions(params = {}) {
  const query = new URLSearchParams(params).toString();
  const endpoint = `/api/v1/sessions${query ? `?${query}` : ''}`;
  const result = await apiClient(endpoint, { method: 'GET' });
  return result.data?.sessions || [];
}

export async function getSession(id) {
  const result = await apiClient(`/api/v1/sessions/${id}`, { method: 'GET' });
  return result.data?.session;
}

export async function createSession(data) {
  const result = await apiClient('/api/v1/sessions', {
    method: 'POST',
    body: data,
  });
  return result.data?.session;
}

export async function updateSession(id, data) {
  const result = await apiClient(`/api/v1/sessions/${id}`, {
    method: 'PUT',
    body: data,
  });
  return result.data?.session;
}

export async function listRooms() {
  const result = await apiClient('/api/v1/sessions/rooms', { method: 'GET' });
  return result.data?.rooms || [];
}

export async function createRoom(data) {
  const result = await apiClient('/api/v1/sessions/rooms', {
    method: 'POST',
    body: data,
  });
  return result.data?.room;
}

export async function assignStudents(sessionId, studentIds) {
  const result = await apiClient(`/api/v1/sessions/${sessionId}/students`, {
    method: 'POST',
    body: { student_ids: studentIds },
  });
  return result.data;
}

export async function removeStudent(sessionId, studentId) {
  const result = await apiClient(`/api/v1/sessions/${sessionId}/students/${studentId}`, {
    method: 'DELETE',
  });
  return result.data;
}

export async function assignInvigilator(sessionId, data) {
  const result = await apiClient(`/api/v1/sessions/${sessionId}/invigilators`, {
    method: 'POST',
    body: data,
  });
  return result.data;
}

export async function removeInvigilator(sessionId, userId) {
  const result = await apiClient(`/api/v1/sessions/${sessionId}/invigilators/${userId}`, {
    method: 'DELETE',
  });
  return result.data;
}

export async function getMyAttempt(sessionId) {
  const result = await apiClient(`/api/v1/sessions/${sessionId}/my-attempt`, {
    method: 'GET',
  });
  return result.data?.attempt;
}

export async function startAttemptForSession(sessionId) {
  const result = await apiClient(`/api/v1/sessions/${sessionId}/attempts`, {
    method: 'POST',
  });
  return result.data?.attempt;
}
