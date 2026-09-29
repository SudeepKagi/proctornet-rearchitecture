/**
 * @file biometricsFailClosed.test.js
 * @description Unit tests verifying fail-closed invariants, provider thresholds,
 * and exact score scaling for facial identity verification per ADR-0016.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AWS_REKOGNITION_SIMILARITY_THRESHOLD,
  LOCAL_HEURISTIC_SIMILARITY_THRESHOLD,
  BIOMETRIC_SIMILARITY_THRESHOLD,
  evaluateIdentityMatch
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

  describe('Identity Verification Scoring & Provider Normalization (evaluateIdentityMatch)', () => {
    const dummyRefBuffer = Buffer.from('fake-ref-image-bytes');
    const dummySnapBuffer = Buffer.from('fake-snapshot-image-bytes');

    it('correctly passes legitimate AWS Rekognition match (0.95 similarity) without double-scaling regression', async () => {
      // compareFacesWithRekognition returns normalized similarity: 0.95
      const mockRekognitionMatcher = vi.fn().mockResolvedValue({
        matched: true,
        similarity: 0.95,
        faceMatches: [{ Similarity: 95.0 }]
      });

      const res = await evaluateIdentityMatch({
        referenceBuffer: dummyRefBuffer,
        snapshotBuffer: dummySnapBuffer,
        enrolled: null,
        rekognitionMatcher: mockRekognitionMatcher,
        rekThreshold: 80.0
      });

      expect(mockRekognitionMatcher).toHaveBeenCalledTimes(1);
      expect(res.matchMethod).toBe('AWS_REKOGNITION');
      expect(res.matchVerdict).toBe('MATCHED');
      expect(res.isHeuristic).toBe(false);
      // Critical assertion: similarityScore MUST be ~0.95, NOT 0.0095
      expect(res.similarityScore).toBeCloseTo(0.95, 2);
      // isVerified MUST be true against the 0.8 applied threshold
      expect(res.isVerified).toBe(true);
    });

    it('correctly rejects AWS Rekognition match when similarity is below threshold (0.3 similarity)', async () => {
      const mockRekognitionMatcher = vi.fn().mockResolvedValue({
        matched: false,
        similarity: 0.30,
        faceMatches: []
      });

      const res = await evaluateIdentityMatch({
        referenceBuffer: dummyRefBuffer,
        snapshotBuffer: dummySnapBuffer,
        enrolled: null,
        rekognitionMatcher: mockRekognitionMatcher,
        rekThreshold: 80.0
      });

      expect(res.matchMethod).toBe('AWS_REKOGNITION');
      expect(res.matchVerdict).toBe('MISMATCH');
      expect(res.similarityScore).toBeCloseTo(0.30, 2);
      expect(res.isVerified).toBe(false);
    });

    it('fails closed when Rekognition throws and enrolled reference embedding is missing', async () => {
      const mockRekognitionMatcher = vi.fn().mockRejectedValue(new Error('AWS Rekognition service unavailable'));
      const mockFaceDetector = vi.fn().mockResolvedValue({
        faceDetected: true,
        boundingBox: { top: 10, left: 10, width: 100, height: 100 }
      });

      const res = await evaluateIdentityMatch({
        referenceBuffer: dummyRefBuffer,
        snapshotBuffer: dummySnapBuffer,
        enrolled: null, // No reference embedding enrolled!
        rekognitionMatcher: mockRekognitionMatcher,
        faceDetector: mockFaceDetector
      });

      expect(res.matchMethod).toBe('NONE');
      expect(res.matchVerdict).toBe('REFERENCE_DATA_UNAVAILABLE');
      expect(res.similarityScore).toBe(0.0);
      expect(res.isVerified).toBe(false);
      expect(res.isHeuristic).toBe(false);
    });

    it('routes to local heuristic projection when Rekognition is unavailable but reference embedding exists', async () => {
      const mockRekognitionMatcher = vi.fn().mockRejectedValue(new Error('Network timeout'));
      const mockFaceDetector = vi.fn().mockResolvedValue({
        faceDetected: true,
        boundingBox: { top: 10, left: 10, width: 100, height: 100 }
      });
      const dummyEmbedding = new Array(128).fill(0.1);
      const mockEmbeddingExtractor = vi.fn().mockResolvedValue({
        embedding: dummyEmbedding
      });

      const res = await evaluateIdentityMatch({
        referenceBuffer: dummyRefBuffer,
        snapshotBuffer: dummySnapBuffer,
        enrolled: { embedding: dummyEmbedding },
        rekognitionMatcher: mockRekognitionMatcher,
        faceDetector: mockFaceDetector,
        embeddingExtractor: mockEmbeddingExtractor,
        heuristicThreshold: 0.88
      });

      expect(res.matchMethod).toBe('LOCAL_HEURISTIC_PROJECTION');
      expect(res.isHeuristic).toBe(true);
      expect(res.similarityScore).toBeCloseTo(1.0, 4);
      expect(res.matchVerdict).toBe('MATCHED');
      expect(res.isVerified).toBe(true);
    });
  });

  describe('ValidationError Structured Codes & Backward Compatibility', () => {
    it('defaults code to VALIDATION_ERROR when unspecified', async () => {
      const { ValidationError } = await import('../../src/utils/errors.js');
      const err = new ValidationError('Generic issue');
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.message).toBe('Generic issue');
    });

    it('sets specific code when provided as 2nd parameter', async () => {
      const { ValidationError } = await import('../../src/utils/errors.js');
      const refErr = new ValidationError('Ref missing', 'REFERENCE_DATA_UNAVAILABLE');
      expect(refErr.statusCode).toBe(422);
      expect(refErr.code).toBe('REFERENCE_DATA_UNAVAILABLE');

      const simErr = new ValidationError('Low match', 'SIMILARITY_BELOW_THRESHOLD');
      expect(simErr.statusCode).toBe(422);
      expect(simErr.code).toBe('SIMILARITY_BELOW_THRESHOLD');

      const faceErr = new ValidationError('No face', 'FACE_NOT_DETECTED');
      expect(faceErr.statusCode).toBe(422);
      expect(faceErr.code).toBe('FACE_NOT_DETECTED');
    });

    it('preserves backward compatibility when details object is passed as 2nd parameter', async () => {
      const { ValidationError } = await import('../../src/utils/errors.js');
      const err = new ValidationError('Invalid payload', [{ field: 'image', reason: 'empty' }]);
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details).toEqual([{ field: 'image', reason: 'empty' }]);
    });
  });
});
