/**
 * @file manualGradingApi.js
 * @description API client for subjective manual grading, rubrics, and score overrides.
 * Conforms to Phase 26 Track 1 Workstream C.
 */

import { apiClient } from './client.js';

export async function getEvaluationBreakdown(resultId) {
  const res = await apiClient(`/api/v1/results/${resultId}/evaluation`);
  return res.data?.evaluation;
}

export async function submitManualGrade(resultId, data) {
  const res = await apiClient(`/api/v1/results/${resultId}/manual-grade`, {
    method: 'POST',
    body: data
  });
  return res.data;
}

export async function overrideScore(resultId, data) {
  const res = await apiClient(`/api/v1/results/${resultId}/score-override`, {
    method: 'POST',
    body: data
  });
  return res.data;
}

export async function getGradeAudits(resultId) {
  const res = await apiClient(`/api/v1/results/${resultId}/manual-grade/audits`);
  return res.data?.audits || [];
}
