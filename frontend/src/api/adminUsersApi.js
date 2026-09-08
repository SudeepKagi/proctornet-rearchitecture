/**
 * @file adminUsersApi.js
 * @description API client for administrator user management, bulk import, verification review, and settings.
 */

import { apiClient } from './client.js';

export async function fetchUsers(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page);
  if (params.limit) query.set('limit', params.limit);
  if (params.search) query.set('search', params.search);
  if (params.role) query.set('role', params.role);
  if (params.status) query.set('status', params.status);
  if (params.verification_status) query.set('verification_status', params.verification_status);
  if (params.sort_by) query.set('sort_by', params.sort_by);
  if (params.sort_order) query.set('sort_order', params.sort_order);

  const qs = query.toString();
  return await apiClient(`/api/v1/admin/users${qs ? `?${qs}` : ''}`);
}

export async function fetchUserDetail(userId) {
  const result = await apiClient(`/api/v1/admin/users/${userId}`);
  return result?.user || result;
}

export async function createSingleUser(userData) {
  return await apiClient('/api/v1/admin/users', {
    method: 'POST',
    body: userData
  });
}

export async function previewBulkImport(file, defaultRole = 'STUDENT') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('defaultRole', defaultRole);

  return await apiClient('/api/v1/admin/users/bulk-import/preview', {
    method: 'POST',
    body: formData
  });
}

export async function commitBulkImport(file, defaultRole = 'STUDENT', atomic = false) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('defaultRole', defaultRole);
  formData.append('atomic', String(atomic));

  return await apiClient('/api/v1/admin/users/bulk-import', {
    method: 'POST',
    body: formData
  });
}

export async function updateUserStatus(userId, status, reason = '') {
  return await apiClient(`/api/v1/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: { status, reason }
  });
}

export async function resetUserPassword(userId) {
  return await apiClient(`/api/v1/admin/users/${userId}/reset-password`, {
    method: 'POST'
  });
}

export async function unlockUser(userId) {
  return await apiClient(`/api/v1/admin/users/${userId}/unlock`, {
    method: 'POST'
  });
}

export async function assignUserRole(userId, role) {
  return await apiClient(`/api/v1/admin/users/${userId}/roles`, {
    method: 'POST',
    body: { role }
  });
}

export async function removeUserRole(userId, role) {
  return await apiClient(`/api/v1/admin/users/${userId}/roles/${role}`, {
    method: 'DELETE'
  });
}

export async function fetchVerificationQueue(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page);
  if (params.limit) query.set('limit', params.limit);
  if (params.role) query.set('role', params.role);
  if (params.search) query.set('search', params.search);
  if (params.verification_status) query.set('verification_status', params.verification_status);

  const qs = query.toString();
  return await apiClient(`/api/v1/admin/verifications${qs ? `?${qs}` : ''}`);
}

export async function reviewVerification(userId, decision, reviewNotes = '') {
  return await apiClient(`/api/v1/admin/users/${userId}/verification`, {
    method: 'PATCH',
    body: {
      verificationStatus: decision,
      reviewNotes
    }
  });
}

export async function fetchOrganizationSettings() {
  const res = await apiClient('/api/v1/admin/organization');
  return res?.settings;
}

export async function updateOrganizationSettings(settings) {
  const res = await apiClient('/api/v1/admin/organization', {
    method: 'PUT',
    body: settings
  });
  return res?.settings;
}

export async function fetchAuditLogs(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page);
  if (params.limit) query.set('limit', params.limit);
  if (params.action) query.set('action', params.action);
  if (params.resource_type) query.set('resource_type', params.resource_type);
  if (params.resource_id) query.set('resource_id', params.resource_id);

  const qs = query.toString();
  const res = await apiClient(`/api/v1/admin/audit${qs ? `?${qs}` : ''}`);
  return res?.data || res;
}
