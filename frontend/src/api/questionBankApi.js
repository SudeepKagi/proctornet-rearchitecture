/**
 * @file questionBankApi.js
 * @description API client for Question Bank CRUD, rich question authoring, taxonomies, and cloning.
 * Conforms to Phase 26 Track 1 Workstream A.
 */

import { apiClient } from './client.js';

export async function listQuestionBanks() {
  const res = await apiClient('/api/v1/faculty/question-bank/banks');
  return res.data?.banks || [];
}

export async function createQuestionBank(data) {
  const res = await apiClient('/api/v1/faculty/question-bank/banks', {
    method: 'POST',
    body: data
  });
  return res.data?.bank;
}

export async function updateQuestionBank(bankId, data) {
  const res = await apiClient(`/api/v1/faculty/question-bank/banks/${bankId}`, {
    method: 'PUT',
    body: data
  });
  return res.data?.bank;
}

export async function listQuestions(params = {}) {
  const searchParams = new URLSearchParams();
  if (params.bankId) searchParams.set('bankId', params.bankId);
  if (params.topicId) searchParams.set('topicId', params.topicId);
  if (params.difficulty) searchParams.set('difficulty', params.difficulty);
  if (params.bloomLevel) searchParams.set('bloomLevel', params.bloomLevel);
  if (params.questionType) searchParams.set('questionType', params.questionType);
  if (params.status) searchParams.set('status', params.status);
  if (params.query) searchParams.set('query', params.query);
  if (params.tags) searchParams.set('tags', params.tags);
  if (params.limit) searchParams.set('limit', params.limit);
  if (params.offset) searchParams.set('offset', params.offset);

  const queryStr = searchParams.toString();
  const endpoint = `/api/v1/faculty/question-bank/questions${queryStr ? `?${queryStr}` : ''}`;
  const res = await apiClient(endpoint);
  return res.data;
}

export async function getQuestion(questionId) {
  const res = await apiClient(`/api/v1/faculty/question-bank/questions/${questionId}`);
  return res.data?.question;
}

export async function createQuestion(data) {
  const res = await apiClient('/api/v1/faculty/question-bank/questions', {
    method: 'POST',
    body: data
  });
  return res.data?.question;
}

export async function updateQuestion(questionId, data) {
  const res = await apiClient(`/api/v1/faculty/question-bank/questions/${questionId}`, {
    method: 'PUT',
    body: data
  });
  return res.data?.question;
}

export async function cloneQuestion(questionId) {
  const res = await apiClient(`/api/v1/faculty/question-bank/questions/${questionId}/clone`, {
    method: 'POST'
  });
  return res.data?.question;
}

export async function archiveQuestion(questionId) {
  const res = await apiClient(`/api/v1/faculty/question-bank/questions/${questionId}/archive`, {
    method: 'POST'
  });
  return res.data?.question;
}
