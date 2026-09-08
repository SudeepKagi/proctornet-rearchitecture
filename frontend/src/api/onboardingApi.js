/**
 * @file onboardingApi.js
 * @description API client for candidate and faculty self-service onboarding flows and forced first-login password change.
 */

import { apiClient } from './client.js';

export async function getOnboardingStatus() {
  return await apiClient('/api/v1/users/me/onboarding-status');
}

export async function changeFirstLoginPassword(currentPassword, newPassword) {
  return await apiClient('/api/v1/users/me/first-login/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword }
  });
}

export async function submitOnboardingProfile(profileData) {
  return await apiClient('/api/v1/users/me/onboarding', {
    method: 'POST',
    body: profileData
  });
}
