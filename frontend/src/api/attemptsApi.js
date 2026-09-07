/**
 * @file attemptsApi.js
 * @description API service functions for candidate attempts, question fetching, and idempotent submission.
 */

import { apiClient } from './client.js';
import { generateUUID } from '../utils/uuid.js';

export async function getAttempt(attemptId) {
  const result = await apiClient(`/api/v1/attempts/${attemptId}`, { method: 'GET' });
  return result.data;
}

export async function getAttemptQuestions(attemptId) {
  const result = await apiClient(`/api/v1/attempts/${attemptId}/questions`, { method: 'GET' });
  return result.data?.questions || [];
}

/**
 * Submits an exam attempt authoritatively to the backend.
 * Uses a mandatory Idempotency-Key header.
 * For retries of the same logical submission, callers pass the existing idempotencyKey.
 */
export async function submitAttempt(attemptId, payload = {}, idempotencyKey = null) {
  const key = idempotencyKey || generateUUID();
  const headers = {
    'Idempotency-Key': key,
  };

  const result = await apiClient(`/api/v1/attempts/${attemptId}/submit`, {
    method: 'POST',
    headers,
    body: payload,
  });

  return {
    ...result.data,
    idempotencyKey: key,
  };
}
