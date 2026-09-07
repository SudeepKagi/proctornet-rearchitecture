/**
 * @file authApi.js
 * @description API service functions for authentication endpoints.
 */

import { apiClient, setAccessToken } from './client.js';

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

export async function register(userData) {
  const result = await apiClient('/api/v1/auth/register', {
    method: 'POST',
    body: userData,
  });
  return result.data;
}

export async function refresh() {
  const result = await apiClient('/api/v1/auth/refresh', {
    method: 'POST',
  });
  if (result?.data?.accessToken) {
    setAccessToken(result.data.accessToken);
  }
  return result.data;
}

export async function logout() {
  try {
    await apiClient('/api/v1/auth/logout', {
      method: 'POST',
    });
  } finally {
    setAccessToken(null);
  }
}

export async function getMe() {
  const result = await apiClient('/api/v1/auth/me', {
    method: 'GET',
  });
  return result.data?.user;
}
