/**
 * @file candidateIdentityApiContract.test.js
 * @description Targeted Contract Tests for Candidate Identity API and Phase 24 Admin Extensions.
 * Proves that every exported function in candidateIdentityApi.js and adminUsersApi.js constructs
 * the exact backend route paths, HTTP methods, headers, and JSON bodies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as candidateApi from '../../src/api/candidateIdentityApi.js';
import * as adminUsersApi from '../../src/api/adminUsersApi.js';
import { setAccessToken } from '../../src/api/client.js';

describe('Candidate Identity & Accommodations API Client Route Contracts', () => {
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
          documentId: 'doc-uuid-123',
          uploadUrl: 'https://s3.amazonaws.com/test-bucket/doc.jpg?signed=true',
          expiresInSeconds: 300,
          previewUrl: 'https://s3.amazonaws.com/test-bucket/preview.jpg?signed=true',
          verificationStatus: 'PENDING',
          extraTimeMultiplier: 1.50
        })
      };
    });
    global.fetch = mockFetch;
    setAccessToken('mock-auth-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setAccessToken(null);
    vi.clearAllMocks();
  });

  describe('Candidate Identity API Client (candidateIdentityApi.js)', () => {
    it('getCandidateIdentityStatus() calls GET /api/v1/candidate/identity/status', async () => {
      await candidateApi.getCandidateIdentityStatus();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, config] = mockFetch.mock.calls[0];

      expect(url).toBe('/api/v1/candidate/identity/status');
      expect(config.method || 'GET').toBe('GET');
      expect(config.headers['Authorization']).toBe('Bearer mock-auth-token');
    });

    it('requestDocumentUploadUrl() calls POST /api/v1/candidate/identity/document-url with exact payload', async () => {
      const payload = {
        documentType: 'PASSPORT',
        documentNumber: 'P12345678',
        fullNameOnDocument: 'Jane Doe',
        fileName: 'passport.jpg',
        mimeType: 'image/jpeg',
        byteSize: 102400,
        issueCountry: 'India'
      };

      await candidateApi.requestDocumentUploadUrl(payload);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, config] = mockFetch.mock.calls[0];

      expect(url).toBe('/api/v1/candidate/identity/document-url');
      expect(config.method).toBe('POST');
      expect(config.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(config.body)).toEqual(payload);
    });

    it('uploadBinaryToS3() executes direct HTTP PUT to presigned S3 URL without auth token', async () => {
      const dummyFile = new Blob(['binary-content'], { type: 'image/jpeg' });
      await candidateApi.uploadBinaryToS3('https://s3.amazonaws.com/mock-upload', dummyFile, 'image/jpeg');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, config] = mockFetch.mock.calls[0];

      expect(url).toBe('https://s3.amazonaws.com/mock-upload');
      expect(config.method).toBe('PUT');
      expect(config.headers['Content-Type']).toBe('image/jpeg');
      // Direct S3 upload must not have application Bearer token header
      expect(config.headers['Authorization']).toBeUndefined();
    });

    it('confirmDocumentUpload() calls POST /api/v1/candidate/identity/confirm-document with documentId', async () => {
      await candidateApi.confirmDocumentUpload('doc-uuid-123');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, config] = mockFetch.mock.calls[0];

      expect(url).toBe('/api/v1/candidate/identity/confirm-document');
      expect(config.method).toBe('POST');
      expect(JSON.parse(config.body)).toEqual({ documentId: 'doc-uuid-123' });
    });

    it('getCandidateProfile() calls GET /api/v1/candidate/profile', async () => {
      await candidateApi.getCandidateProfile();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, config] = mockFetch.mock.calls[0];

      expect(url).toBe('/api/v1/candidate/profile');
      expect(config.method || 'GET').toBe('GET');
    });

    it('updateCandidateProfile() calls PATCH /api/v1/candidate/profile with updates', async () => {
      await candidateApi.updateCandidateProfile({ department: 'CS', semester: 5 });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, config] = mockFetch.mock.calls[0];

      expect(url).toBe('/api/v1/candidate/profile');
      expect(config.method).toBe('PATCH');
      expect(JSON.parse(config.body)).toEqual({ department: 'CS', semester: 5 });
    });
  });

  describe('Phase 24 Admin Extensions (adminUsersApi.js)', () => {
    it('fetchStudentVerificationDossier() calls GET /api/v1/admin/students/:id/verification', async () => {
      await adminUsersApi.fetchStudentVerificationDossier('student-uuid-456');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, config] = mockFetch.mock.calls[0];

      expect(url).toBe('/api/v1/admin/students/student-uuid-456/verification');
      expect(config.method || 'GET').toBe('GET');
    });

    it('fetchStudentDocumentPreview() calls GET /api/v1/admin/students/:id/document-preview', async () => {
      await adminUsersApi.fetchStudentDocumentPreview('student-uuid-456');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, config] = mockFetch.mock.calls[0];

      expect(url).toBe('/api/v1/admin/students/student-uuid-456/document-preview');
      expect(config.method || 'GET').toBe('GET');
    });

    it('reviewStudentVerification() calls PATCH /api/v1/admin/students/:id/verification with decision and notes', async () => {
      await adminUsersApi.reviewStudentVerification('student-uuid-456', 'REJECTED', 'Blurry text');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, config] = mockFetch.mock.calls[0];

      expect(url).toBe('/api/v1/admin/students/student-uuid-456/verification');
      expect(config.method).toBe('PATCH');
      expect(JSON.parse(config.body)).toEqual({
        decision: 'REJECTED',
        reviewNotes: 'Blurry text'
      });
    });

    it('fetchStudentConfiguration() calls GET /api/v1/admin/students/:id/configuration', async () => {
      await adminUsersApi.fetchStudentConfiguration('student-uuid-456');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, config] = mockFetch.mock.calls[0];

      expect(url).toBe('/api/v1/admin/students/student-uuid-456/configuration');
      expect(config.method || 'GET').toBe('GET');
    });

    it('updateStudentConfiguration() calls PUT /api/v1/admin/students/:id/configuration with accommodation payload', async () => {
      const configData = {
        extraTimeMultiplier: 1.50,
        breakAllowanceMinutes: 20,
        maxBreaksAllowed: 3,
        assistiveTechnology: { screenReader: true, speechToText: false, keyboardOnly: false },
        proctoringStrictness: 'RELAXED'
      };

      await adminUsersApi.updateStudentConfiguration('student-uuid-456', configData);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, config] = mockFetch.mock.calls[0];

      expect(url).toBe('/api/v1/admin/students/student-uuid-456/configuration');
      expect(config.method).toBe('PUT');
      expect(JSON.parse(config.body)).toEqual(configData);
    });
  });
});
