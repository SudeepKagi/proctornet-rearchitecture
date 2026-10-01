/**
 * @file studentApi.js
 * @description API client for student self-service profile and identity onboarding.
 */

import { apiClient } from './client.js';

export async function getDepartments() {
  const res = await apiClient('/api/v1/student/departments');
  return res?.data?.departments || res?.departments || res?.data || res || [];
}

export async function getStudentIdentityStatus() {
  const res = await apiClient('/api/v1/student/identity/status');
  return res?.data || res;
}

export async function getStudentProfile() {
  const res = await apiClient('/api/v1/student/profile');
  return res?.data || res;
}

export async function submitStudentSetup(formData) {
  return await apiClient('/api/v1/student/setup', {
    method: 'POST',
    body: formData
  });
}
