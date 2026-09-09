import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as biometricsApi from '../../src/api/biometricsApi.js';

describe('biometricsApi Contract Tests (Phase 25)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('getEnrollmentStatus: sends GET /api/v1/candidate/biometrics/status', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ isEnrolled: true, enrollmentStatus: 'ENROLLED' })
    });

    const res = await biometricsApi.getEnrollmentStatus();
    expect(res.isEnrolled).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/candidate/biometrics/status',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('requestEnrollmentUrl: sends POST /api/v1/candidate/biometrics/enroll-url with payload', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ biometricId: 'bio-123', uploadUrl: 'https://s3.example.com/upload' })
    });

    const res = await biometricsApi.requestEnrollmentUrl({
      fileName: 'test.jpg',
      mimeType: 'image/jpeg',
      byteSize: 1024
    });

    expect(res.biometricId).toBe('bio-123');
    const calledBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(calledBody.fileName).toBe('test.jpg');
    expect(calledBody.mimeType).toBe('image/jpeg');
    // Ensure no client embedding is ever transmitted
    expect('embedding' in calledBody).toBe(false);
    expect('vector' in calledBody).toBe(false);
  });

  it('confirmEnrollment: sends POST /api/v1/candidate/biometrics/enroll-confirm with biometricId only', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, enrollmentStatus: 'ENROLLED', qualityScore: 0.88 })
    });

    const res = await biometricsApi.confirmEnrollment({ biometricId: 'bio-123' });
    expect(res.success).toBe(true);
    const calledBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(calledBody).toEqual({ biometricId: 'bio-123' });
    // Zero client embedding invariant
    expect('embedding' in calledBody).toBe(false);
  });

  it('requestLivenessChallenge: sends POST /api/v1/candidate/biometrics/liveness-challenge with sessionId', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        challengeId: 'chal-123',
        nonce: 'nonce-abc',
        expectedActions: ['BLINK', 'SMILE'],
        expiresInSeconds: 8,
        liveMediaUploadUrl: 'https://s3.example.com/live-media'
      })
    });

    const res = await biometricsApi.requestLivenessChallenge({ sessionId: 'sess-123' });
    expect(res.challengeId).toBe('chal-123');
    expect(res.expectedActions).toHaveLength(2);
  });

  it('verifyLiveness: sends POST /api/v1/candidate/biometrics/verify-liveness with challenge credentials', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, livenessToken: 'token.hmac.123', verdict: 'PASSED' })
    });

    const res = await biometricsApi.verifyLiveness({
      sessionId: 'sess-123',
      challengeId: 'chal-123',
      nonce: 'nonce-abc'
    });

    expect(res.success).toBe(true);
    expect(res.livenessToken).toBe('token.hmac.123');
  });

  it('verifyFace: sends POST /api/v1/candidate/biometrics/verify-face without client embeddings', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        matchVerdict: 'MATCHED',
        similarityScore: 0.91,
        finalStatus: 'VERIFIED'
      })
    });

    const res = await biometricsApi.verifyFace({
      sessionId: 'sess-123',
      liveImageId: 'img-123',
      livenessToken: 'token.hmac.123'
    });

    expect(res.finalStatus).toBe('VERIFIED');
    const calledBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect('liveEmbedding' in calledBody).toBe(false);
    expect('embedding' in calledBody).toBe(false);
  });

  it('admin overrideBiometrics: sends POST /api/v1/admin/biometrics/override with documented reason', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, verificationId: 'ver-123', finalStatus: 'OVERRIDDEN' })
    });

    const res = await biometricsApi.overrideBiometrics({
      sessionId: 'sess-123',
      studentId: 'stud-123',
      reason: 'Identity confirmed by desk supervisor'
    });

    expect(res.finalStatus).toBe('OVERRIDDEN');
  });
});
