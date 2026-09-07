/**
 * @file examsApi.js
 * @description API service functions for Exam Authoring, Topic Rules, and Publishing.
 */

import { apiClient } from './client.js';

export async function listExams(params = {}) {
  const query = new URLSearchParams(params).toString();
  const endpoint = `/api/v1/exams${query ? `?${query}` : ''}`;
  const result = await apiClient(endpoint, { method: 'GET' });
  return result.data?.exams || [];
}

export async function getExam(id) {
  const result = await apiClient(`/api/v1/exams/${id}`, { method: 'GET' });
  return result.data?.exam;
}

export async function createExam(data) {
  const result = await apiClient('/api/v1/exams', {
    method: 'POST',
    body: data,
  });
  return result.data?.exam;
}

export async function updateExam(id, data) {
  const result = await apiClient(`/api/v1/exams/${id}`, {
    method: 'PUT',
    body: data,
  });
  return result.data?.exam;
}

export async function addTopicRule(examId, ruleData) {
  const result = await apiClient(`/api/v1/exams/${examId}/rules`, {
    method: 'POST',
    body: ruleData,
  });
  return result.data?.rule;
}

export async function deleteTopicRule(examId, ruleId) {
  const result = await apiClient(`/api/v1/exams/${examId}/rules/${ruleId}`, {
    method: 'DELETE',
  });
  return result.data;
}

export async function publishExam(id) {
  const result = await apiClient(`/api/v1/exams/${id}/publish`, {
    method: 'POST',
  });
  return result.data?.exam;
}
