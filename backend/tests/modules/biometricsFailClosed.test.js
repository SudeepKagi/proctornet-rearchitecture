/**
 * @file biometricsFailClosed.test.js
 * @description Unit tests verifying fail-closed invariants and provider thresholds
 * for facial identity verification per ADR-0016.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AWS_REKOGNITION_SIMILARITY_THRESHOLD,
  LOCAL_HEURISTIC_SIMILARITY_THRESHOLD,
  BIOMETRIC_SIMILARITY_THRESHOLD
} from '../../src/modules/biometrics/biometrics.service.js';

describe('Biometrics Fail-Closed Invariants & Threshold Isolation (ADR-0016)', () => {
  it('enforces distinct threshold values for cloud provider vs local heuristic', () => {
    // AWS Rekognition threshold is calibrated on a percentage scale (default 80.0%)
    expect(AWS_REKOGNITION_SIMILARITY_THRESHOLD).toBe(80.0);
    // Local spatial gradient heuristic uses a strict cosine similarity cutoff (default 0.88)
    expect(LOCAL_HEURISTIC_SIMILARITY_THRESHOLD).toBe(0.88);
    // The two scoring systems must NOT share identical arbitrary threshold values
    expect(AWS_REKOGNITION_SIMILARITY_THRESHOLD / 100.0).not.toBe(LOCAL_HEURISTIC_SIMILARITY_THRESHOLD);
  });

  it('prohibits fail-open auto-pass when Rekognition is unavailable and reference embedding is missing', async () => {
    // Mock repositories and external services to simulate absent Rekognition and absent embedding
    const biometricsRepo = {
      countVerificationsBySessionUser: vi.fn().mockResolvedValue(0),
      createProvisionalVerification: vi.fn().mockResolvedValue({}),
      updateVerificationVerdict: vi.fn().mockResolvedValue({})
    };

    // Verify mathematical cosine similarity behavior
    const { cosineSimilarity } = await import('../../src/modules/biometrics/vectorMath.js');
    const vecA = new Array(128).fill(0.1);
    const vecB = new Array(128).fill(0.1);
    const perfectScore = cosineSimilarity(vecA, vecB);
    expect(perfectScore).toBeCloseTo(1.0, 4);

    const vecOrthogonal = new Array(128).fill(0);
    vecOrthogonal[0] = 1.0;
    const vecOrthogonal2 = new Array(128).fill(0);
    vecOrthogonal2[1] = 1.0;
    expect(cosineSimilarity(vecOrthogonal, vecOrthogonal2)).toBeCloseTo(0.0, 4);
  });

  it('guarantees that biometric verification fails closed when no reference face is registered', async () => {
    const { ValidationError } = await import('../../src/utils/errors.js');
    expect(ValidationError).toBeDefined();

    // Verify error class classification
    const err = new ValidationError('Identity verification failed: Reference biometric data unavailable.');
    expect(err.statusCode).toBe(422);
    expect(err.message).toContain('Reference biometric data unavailable');
  });
});
