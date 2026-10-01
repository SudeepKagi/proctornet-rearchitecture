/**
 * @file facultyApi.js
 * @description API client service for the Faculty Portal module.
 */

import { apiClient } from './client.js';

export async function getDashboardStats() {
  const res = await apiClient('/api/v1/faculty/dashboard/stats');
  return res?.data || res;
}

export async function listFacultyExams(params = {}) {
  const query = new URLSearchParams();
  if (params.tab) query.append('tab', params.tab);
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await apiClient(`/api/v1/faculty/exams${qs}`);
  return res?.data || res;
}

export async function getExamDetails(examId) {
  const res = await apiClient(`/api/v1/faculty/exams/${examId}`);
  return res?.data || res;
}

export async function scheduleExam(payload) {
  const res = await apiClient('/api/v1/faculty/exams/schedule', {
    method: 'POST',
    body: payload
  });
  return res?.data || res;
}

export async function updateExam(examId, payload) {
  const res = await apiClient(`/api/v1/faculty/exams/${examId}`, {
    method: 'PUT',
    body: payload
  });
  return res?.data || res;
}

export async function cancelExam(examId) {
  const res = await apiClient(`/api/v1/faculty/exams/${examId}/cancel`, {
    method: 'PUT'
  });
  return res?.data || res;
}

export async function getExamAnalyticsSummary(examId) {
  const res = await apiClient(`/api/v1/faculty/exams/${examId}/analytics-summary`);
  return res?.data || res;
}

export async function generateMCQsFromPdf({ file, topicName = 'General', questionCount = 5, difficulty = 'MEDIUM' }) {
  const formData = new FormData();
  formData.append('pdf', file);
  formData.append('topicName', topicName);
  formData.append('questionCount', String(questionCount));
  formData.append('difficulty', difficulty);

  const res = await apiClient('/api/v1/faculty/exams/generate-from-pdf', {
    method: 'POST',
    body: formData
  });

  return res?.data || res;
}

// Backward-compatible question pool shims
export async function listQuestionPools() {
  return [];
}
export async function createQuestionPool() {
  return {};
}
export async function getTopicPoolQuestions() {
  return [];
}
export async function saveQuestionsToPool() {
  return { savedCount: 0 };
}
