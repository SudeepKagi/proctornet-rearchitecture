/**
 * @file authApi.js
 * @description API service functions for authentication endpoints.
 */

import { apiClient, setAccessToken, clearAuthSession, refreshAuthToken } from './client.js';

export async function login(credentials) {
  const result = await apiClient('/api/v1/auth/login', {
    method: 'POST',
    body: credentials,
  });
  if (result?.data?.accessToken) {
    setAccessToken(result.data.accessToken);
  }
  return result.data;
}

export async function refresh() {
  return await refreshAuthToken();
}

export async function logout() {
  try {
    await apiClient('/api/v1/auth/logout', {
      method: 'POST',
    });
  } finally {
    clearAuthSession();
  }
}

export async function getMe() {
  const result = await apiClient('/api/v1/auth/me', {
    method: 'GET',
  });
  return result.data?.user;
}
