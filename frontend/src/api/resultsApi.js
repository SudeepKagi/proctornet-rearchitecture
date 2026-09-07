/**
 * @file resultsApi.js
 * @description API service functions for Candidate Results and Staff Exam Results.
 */

import { apiClient } from './client.js';

export async function getCandidateResult(attemptId) {
  const result = await apiClient(`/api/v1/attempts/${attemptId}/result`, {
    method: 'GET',
  });
  return result.data?.result;
}

export async function getExamResults(examId, params = {}) {
  const query = new URLSearchParams(params).toString();
  const endpoint = `/api/v1/exams/${examId}/results${query ? `?${query}` : ''}`;
  const result = await apiClient(endpoint, { method: 'GET' });
  return result.data?.results || [];
}

export async function getExamResultsSummary(examId, params = {}) {
  const query = new URLSearchParams(params).toString();
  const endpoint = `/api/v1/exams/${examId}/results/summary${query ? `?${query}` : ''}`;
  const result = await apiClient(endpoint, { method: 'GET' });
  return result.data?.summary;
}

export async function publishExamResults(examId, data = {}) {
  const result = await apiClient(`/api/v1/exams/${examId}/results/publish`, {
    method: 'POST',
    body: data,
  });
  return result.data;
}

export async function updateReleasePolicy(examId, policyData) {
  const result = await apiClient(`/api/v1/exams/${examId}/results/policy`, {
    method: 'PATCH',
    body: policyData,
  });
  return result.data;
}
