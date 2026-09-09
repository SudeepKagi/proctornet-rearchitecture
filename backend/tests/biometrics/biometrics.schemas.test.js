import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  enrollUrlSchema,
  enrollConfirmSchema,
  livenessChallengeSchema,
  verifyLivenessSchema,
  verifyImageUrlSchema,
  verifyFaceSchema,
  adminOverrideSchema,
  adminSessionVerificationsQuerySchema
} from '../../src/modules/biometrics/biometrics.schemas.js';

describe('biometrics.schemas (Phase 25 Biometric Schemas & Rejection of Client Embeddings)', () => {
  const sampleUuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const dummyVector = Array.from({ length: 128 }, () => 0.05);

  describe('enrollUrlSchema', () => {
    it('accepts valid photo upload metadata', () => {
      const result = enrollUrlSchema.safeParse({
        fileName: 'face.jpg',
        mimeType: 'image/jpeg',
        byteSize: 1024 * 500
      });
      assert.equal(result.success, true);
    });

    it('rejects client-supplied embedding fields', () => {
      const result = enrollUrlSchema.safeParse({
        fileName: 'face.jpg',
        mimeType: 'image/jpeg',
        byteSize: 1024 * 500,
        embedding: dummyVector
      });
      assert.equal(result.success, false);
      const msg = result.error.errors.map((e) => e.message).join(' ');
      assert.match(msg, /Client-supplied biometric field 'embedding' is strictly forbidden/);
    });

    it('rejects client-supplied faceVector fields', () => {
      const result = enrollUrlSchema.safeParse({
        fileName: 'face.jpg',
        mimeType: 'image/jpeg',
        byteSize: 1024 * 500,
        faceVector: dummyVector
      });
      assert.equal(result.success, false);
    });
  });

  describe('enrollConfirmSchema', () => {
    it('accepts valid payload with only biometricId', () => {
      const result = enrollConfirmSchema.safeParse({
        biometricId: sampleUuid
      });
      assert.equal(result.success, true);
    });

    it('rejects payload with extra fields (strict schema)', () => {
      const result = enrollConfirmSchema.safeParse({
        biometricId: sampleUuid,
        extraField: 'not_allowed'
      });
      assert.equal(result.success, false);
    });

    it('rejects payload with embedding injection', () => {
      const result = enrollConfirmSchema.safeParse({
        biometricId: sampleUuid,
        embedding: dummyVector
      });
      assert.equal(result.success, false);
    });
  });

  describe('verifyLivenessSchema', () => {
    it('accepts valid liveness verification payload', () => {
      const result = verifyLivenessSchema.safeParse({
        challengeId: sampleUuid,
        nonce: 'a1b2c3d4e5f6',
        sessionId: sampleUuid
      });
      assert.equal(result.success, true);
    });

    it('rejects client-supplied motionDelta or actionVerdicts', () => {
      const result = verifyLivenessSchema.safeParse({
        challengeId: sampleUuid,
        nonce: 'a1b2c3d4e5f6',
        motionDelta: [1.2, 0.4, -0.5]
      });
      assert.equal(result.success, false);
      const msg = result.error.errors.map((e) => e.message).join(' ');
      assert.match(msg, /Client-supplied biometric field 'motionDelta' is strictly forbidden/);
    });
  });

  describe('verifyFaceSchema', () => {
    it('accepts valid verify-face payload', () => {
      const result = verifyFaceSchema.safeParse({
        liveImageId: sampleUuid,
        livenessToken: 'valid.hmac.token'
      });
      assert.equal(result.success, true);
    });

    it('rejects client-supplied liveEmbedding', () => {
      const result = verifyFaceSchema.safeParse({
        liveImageId: sampleUuid,
        livenessToken: 'valid.hmac.token',
        liveEmbedding: dummyVector
      });
      assert.equal(result.success, false);
      const msg = result.error.errors.map((e) => e.message).join(' ');
      assert.match(msg, /Client-supplied biometric field 'liveEmbedding' is strictly forbidden/);
    });
  });

  describe('adminOverrideSchema', () => {
    it('accepts valid admin override with reason >= 10 chars', () => {
      const result = adminOverrideSchema.safeParse({
        sessionId: sampleUuid,
        studentId: sampleUuid,
        reason: 'Manual identity confirmed via physical passport inspection by proctor'
      });
      assert.equal(result.success, true);
    });

    it('rejects reason shorter than 10 characters', () => {
      const result = adminOverrideSchema.safeParse({
        sessionId: sampleUuid,
        studentId: sampleUuid,
        reason: 'Short'
      });
      assert.equal(result.success, false);
    });
  });
});
