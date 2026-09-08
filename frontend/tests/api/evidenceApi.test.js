import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as evidenceApi from '../../src/api/evidenceApi.js';
import * as clientModule from '../../src/api/client.js';

vi.mock('../../src/api/client.js');

describe('evidenceApi (Frontend API Client)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requestUploadUrl sends POST to /api/v1/attempts/:attemptId/evidence/upload-url', async () => {
    clientModule.apiClient.mockResolvedValueOnce({
      status: 'success',
      data: {
        evidenceId: 'ev-123',
        uploadUrl: 'https://s3.example.com/put-url',
        objectKey: 'evidence/...',
        expiresIn: 300
      }
    });

    const payload = {
      evidenceType: 'WEBCAM_SNAPSHOT',
      contentType: 'image/jpeg',
      byteSize: 102400
    };

    const res = await evidenceApi.requestUploadUrl('att-1', payload);

    expect(clientModule.apiClient).toHaveBeenCalledWith(
      '/api/v1/attempts/att-1/evidence/upload-url',
      {
        method: 'POST',
        body: payload
      }
    );
    expect(res.evidenceId).toBe('ev-123');
    expect(res.uploadUrl).toBe('https://s3.example.com/put-url');
  });

  it('confirmUpload sends POST to /api/v1/attempts/:attemptId/evidence/:evidenceId/confirm', async () => {
    clientModule.apiClient.mockResolvedValueOnce({
      status: 'success',
      data: {
        evidenceId: 'ev-123',
        status: 'AVAILABLE',
        s3VersionId: 'v-alpha'
      }
    });

    const res = await evidenceApi.confirmUpload('att-1', 'ev-123', { byteSize: 102400 });

    expect(clientModule.apiClient).toHaveBeenCalledWith(
      '/api/v1/attempts/att-1/evidence/ev-123/confirm',
      {
        method: 'POST',
        body: { byteSize: 102400 }
      }
    );
    expect(res.status).toBe('AVAILABLE');
  });

  it('listEvidence sends GET to /api/v1/attempts/:attemptId/evidence with query params', async () => {
    clientModule.apiClient.mockResolvedValueOnce({
      status: 'success',
      data: {
        attemptId: 'att-1',
        evidence: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 1 }
      }
    });

    const res = await evidenceApi.listEvidence('att-1', { page: 1, limit: 10 });

    expect(clientModule.apiClient).toHaveBeenCalledWith(
      '/api/v1/attempts/att-1/evidence?page=1&limit=10',
      {
        method: 'GET'
      }
    );
    expect(res.attemptId).toBe('att-1');
  });

  it('getPlaybackUrl sends GET to /api/v1/attempts/:attemptId/evidence/:evidenceId/url', async () => {
    clientModule.apiClient.mockResolvedValueOnce({
      status: 'success',
      data: {
        evidenceId: 'ev-123',
        downloadUrl: 'https://s3.example.com/get-url?versionId=v-alpha',
        contentType: 'image/jpeg',
        expiresIn: 900
      }
    });

    const res = await evidenceApi.getPlaybackUrl('att-1', 'ev-123');

    expect(clientModule.apiClient).toHaveBeenCalledWith(
      '/api/v1/attempts/att-1/evidence/ev-123/url',
      {
        method: 'GET'
      }
    );
    expect(res.downloadUrl).toContain('versionId=v-alpha');
  });

  it('deleteEvidence sends DELETE to /api/v1/attempts/:attemptId/evidence/:evidenceId', async () => {
    clientModule.apiClient.mockResolvedValueOnce({
      status: 'success',
      message: 'Evidence artifact successfully purged'
    });

    const res = await evidenceApi.deleteEvidence('att-1', 'ev-123');

    expect(clientModule.apiClient).toHaveBeenCalledWith(
      '/api/v1/attempts/att-1/evidence/ev-123',
      {
        method: 'DELETE'
      }
    );
    expect(res.message).toBe('Evidence artifact successfully purged');
  });
});
