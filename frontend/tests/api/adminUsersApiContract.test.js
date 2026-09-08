/**
 * @file adminUsersApiContract.test.js
 * @description Targeted Contract Tests for Frontend Admin API Client Helpers.
 * Proves that every exported function in adminUsersApi.js constructs the exact intended
 * URL paths, HTTP methods, headers, JSON bodies, and multipart FormData payloads.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as adminUsersApi from '../../src/api/adminUsersApi.js';
import { setAccessToken } from '../../src/api/client.js';

describe('Admin Users API Client Helpers — Exact Contract Tests', () => {
  let originalFetch;
  let mockFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = vi.fn().mockImplementation(async (url, config = {}) => {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          status: 'success',
          data: {},
          settings: { institutionName: 'Test Uni', featureFlags: { allowSelfRegistration: false } }
        })
      };
    });
    global.fetch = mockFetch;
    setAccessToken('mock-admin-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setAccessToken(null);
    vi.clearAllMocks();
  });

  // 1. Bulk Preview Route Contract
  it('previewBulkImport() calls POST /api/v1/admin/users/bulk-import/preview with multipart FormData "file"', async () => {
    const file = new File(['name,email\nAlice,alice@uni.edu'], 'students.csv', { type: 'text/csv' });
    await adminUsersApi.previewBulkImport(file, 'STUDENT');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, config] = mockFetch.mock.calls[0];

    expect(url).toBe('/api/v1/admin/users/bulk-import/preview');
    expect(config.method).toBe('POST');
    expect(config.body).toBeInstanceOf(FormData);
    expect(config.body.get('file')).toBeTruthy();
    expect(config.body.get('defaultRole')).toBe('STUDENT');
    // Boundary must not be overridden by a manual application/json header
    expect(config.headers['Content-Type']).toBeUndefined();
    expect(config.headers['Authorization']).toBe('Bearer mock-admin-token');
  });

  // 2. Bulk Commit Route Contract
  it('commitBulkImport() calls POST /api/v1/admin/users/bulk-import with multipart FormData "file" and atomic flag', async () => {
    const file = new File(['name,email\nBob,bob@uni.edu'], 'roster.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await adminUsersApi.commitBulkImport(file, 'FACULTY', true);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, config] = mockFetch.mock.calls[0];

    expect(url).toBe('/api/v1/admin/users/bulk-import');
    expect(config.method).toBe('POST');
    expect(config.body).toBeInstanceOf(FormData);
    expect(config.body.get('file')).toBeTruthy();
    expect(config.body.get('defaultRole')).toBe('FACULTY');
    expect(config.body.get('atomic')).toBe('true');
    expect(config.headers['Content-Type']).toBeUndefined();
  });

  // 3. Verification Review Route Contract
  it('reviewVerification() calls PATCH /api/v1/admin/users/:userId/verification with review payload', async () => {
    await adminUsersApi.reviewVerification('usr-student-42', 'VERIFIED', 'Credentials checked');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, config] = mockFetch.mock.calls[0];

    expect(url).toBe('/api/v1/admin/users/usr-student-42/verification');
    expect(config.method).toBe('PATCH');
    expect(config.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(config.body)).toEqual({
      verificationStatus: 'VERIFIED',
      reviewNotes: 'Credentials checked'
    });
  });

  // 4. Organization Settings GET Route Contract
  it('fetchOrganizationSettings() calls GET /api/v1/admin/organization', async () => {
    await adminUsersApi.fetchOrganizationSettings();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, config] = mockFetch.mock.calls[0];

    expect(url).toBe('/api/v1/admin/organization');
    expect(config.headers['Authorization']).toBe('Bearer mock-admin-token');
  });

  // 5. Organization Settings PUT Route Contract
  it('updateOrganizationSettings() calls PUT /api/v1/admin/organization with authoritative payload', async () => {
    const payload = {
      institutionName: 'State Tech',
      supportEmail: 'help@statetech.edu',
      allowedDomains: ['statetech.edu'],
      passwordPolicy: { minLength: 12, maxFailedAttempts: 5, lockoutDurationMinutes: 15 },
      sessionPolicy: { accessTokenTtlMinutes: 15, refreshTokenTtlDays: 7 },
      featureFlags: { allowSelfRegistration: false, requireVerificationBeforeExam: true }
    };

    await adminUsersApi.updateOrganizationSettings(payload);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, config] = mockFetch.mock.calls[0];

    expect(url).toBe('/api/v1/admin/organization');
    expect(config.method).toBe('PUT');
    expect(config.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(config.body)).toEqual(payload);
  });

  // 6. Audit Feed Route Contract
  it('fetchAuditLogs() calls GET /api/v1/admin/audit with formatted query parameters', async () => {
    await adminUsersApi.fetchAuditLogs({
      page: 2,
      limit: 25,
      action: 'USER_CREATED',
      resource_type: 'USER'
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];

    expect(url).toBe('/api/v1/admin/audit?page=2&limit=25&action=USER_CREATED&resource_type=USER');
  });

  // 7. Revoke User Sessions Route Contract
  it('revokeUserSessions() calls POST /api/v1/admin/users/:userId/revoke-sessions', async () => {
    await adminUsersApi.revokeUserSessions('usr-faculty-99');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, config] = mockFetch.mock.calls[0];

    expect(url).toBe('/api/v1/admin/users/usr-faculty-99/revoke-sessions');
    expect(config.method).toBe('POST');
  });
});
