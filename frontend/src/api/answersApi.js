/**
 * @file answersApi.js
 * @description API service functions for candidate answers, OCC revision tracking, and batch synchronization.
 */

import { apiClient } from './client.js';

export async function saveAnswer(attemptId, attemptQuestionId, answerValue, expectedRevision) {
  const result = await apiClient(`/api/v1/attempts/${attemptId}/answers/${attemptQuestionId}`, {
    method: 'PUT',
    body: {
      answer_value: answerValue,
      expected_revision: expectedRevision,
    },
  });
  return result.data;
}

export async function clearAnswer(attemptId, attemptQuestionId, expectedRevision) {
  const result = await apiClient(`/api/v1/attempts/${attemptId}/answers/${attemptQuestionId}`, {
    method: 'DELETE',
    body: {
      expected_revision: expectedRevision,
    },
  });
  return result.data;
}

export async function batchSaveAnswers(attemptId, answers) {
  const result = await apiClient(`/api/v1/attempts/${attemptId}/answers/batch`, {
    method: 'POST',
    body: { answers },
  });
  return result.data;
}

export async function getAnswers(attemptId) {
  const result = await apiClient(`/api/v1/attempts/${attemptId}/answers`, {
    method: 'GET',
  });
  return result.data?.answers || [];
}
