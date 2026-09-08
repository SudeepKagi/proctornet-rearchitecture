/**
 * @file evidenceUnit.test.js
 * @description Unit tests for Phase 15 Evidence Storage.
 * Covers schema validation, MIME allowlists, size bounds, checksum formats, and object key generation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  requestUploadUrlSchema,
  confirmEvidenceSchema,
  listEvidenceQuerySchema,
  getExtensionForMime,
  validateEvidenceSize,
  MIME_EXTENSION_MAP,
  MAX_BYTE_SIZES
} from '../../src/modules/evidence/evidence.schemas.js';

describe('Phase 15 Evidence Storage — Unit Tests', () => {
  describe('MIME to Extension Mapping & Derivation', () => {
    it('correctly maps all allowed image and audio MIME types', () => {
      assert.equal(getExtensionForMime('image/jpeg'), 'jpg');
      assert.equal(getExtensionForMime('image/png'), 'png');
      assert.equal(getExtensionForMime('image/webp'), 'webp');
      assert.equal(getExtensionForMime('audio/webm'), 'webm');
      assert.equal(getExtensionForMime('audio/ogg'), 'ogg');
      assert.equal(getExtensionForMime('audio/wav'), 'wav');
    });

    it('rejects disallowed or malicious MIME types', () => {
      const invalidTypes = [
        'application/pdf',
        'application/x-executable',
        'text/html',
        'image/gif',
        'video/mp4',
        'application/javascript'
      ];

      for (const mime of invalidTypes) {
        assert.throws(() => getExtensionForMime(mime), {
          name: 'BadRequestError'
        });
      }
    });
  });

  describe('Evidence Size Validation & Limits', () => {
    it('accepts sizes within maximum bounds', () => {
      assert.doesNotThrow(() => validateEvidenceSize('WEBCAM_SNAPSHOT', 1024));
      assert.doesNotThrow(() => validateEvidenceSize('WEBCAM_SNAPSHOT', MAX_BYTE_SIZES.WEBCAM_SNAPSHOT));
      assert.doesNotThrow(() => validateEvidenceSize('SCREEN_CAPTURE', MAX_BYTE_SIZES.SCREEN_CAPTURE));
      assert.doesNotThrow(() => validateEvidenceSize('AUDIO_SNIPPET', MAX_BYTE_SIZES.AUDIO_SNIPPET));
    });

    it('rejects sizes exceeding maximum thresholds', () => {
      assert.throws(
        () => validateEvidenceSize('WEBCAM_SNAPSHOT', MAX_BYTE_SIZES.WEBCAM_SNAPSHOT + 1),
        /exceeds maximum allowed size/
      );
      assert.throws(
        () => validateEvidenceSize('SCREEN_CAPTURE', MAX_BYTE_SIZES.SCREEN_CAPTURE + 1),
        /exceeds maximum allowed size/
      );
      assert.throws(
        () => validateEvidenceSize('AUDIO_SNIPPET', MAX_BYTE_SIZES.AUDIO_SNIPPET + 1),
        /exceeds maximum allowed size/
      );
    });

    it('rejects zero or negative sizes', () => {
      assert.throws(() => validateEvidenceSize('WEBCAM_SNAPSHOT', 0), /greater than 0/);
      assert.throws(() => validateEvidenceSize('WEBCAM_SNAPSHOT', -100), /greater than 0/);
    });
  });

  describe('Zod Schema Validation — requestUploadUrlSchema', () => {
    const validChecksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    it('validates a complete, compliant upload-url request', () => {
      const payload = {
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 102400,
        sha256Checksum: validChecksum,
        violationId: randomUUID(),
        flagId: null,
        metadata: { clientResolution: '1280x720' }
      };

      const parsed = requestUploadUrlSchema.parse(payload);
      assert.equal(parsed.evidenceType, 'WEBCAM_SNAPSHOT');
      assert.equal(parsed.contentType, 'image/jpeg');
      assert.equal(parsed.byteSize, 102400);
      assert.equal(parsed.sha256Checksum, validChecksum);
    });

    it('rejects invalid evidenceType', () => {
      const payload = {
        evidenceType: 'UNKNOWN_TYPE',
        contentType: 'image/jpeg',
        byteSize: 1024
      };
      assert.throws(() => requestUploadUrlSchema.parse(payload));
    });

    it('rejects oversized payload via schema superRefine', () => {
      const payload = {
        evidenceType: 'WEBCAM_SNAPSHOT',
        contentType: 'image/jpeg',
        byteSize: 6 * 1024 * 1024 // 6 MB > 5 MB limit
      };
      assert.throws(() => requestUploadUrlSchema.parse(payload), /exceeds maximum limit/);
    });

    it('rejects malformed SHA-256 checksum strings', () => {
      const invalidChecksums = [
        'short',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85', // 63 chars
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855aa', // 66 chars
        'g3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // non-hex 'g'
        'e3b0c442-8fc1-c149-afbf-4c8996fb92427ae41e4649b934ca495991b7852b855' // contains hyphens
      ];

      for (const badChecksum of invalidChecksums) {
        assert.throws(
          () =>
            requestUploadUrlSchema.parse({
              evidenceType: 'WEBCAM_SNAPSHOT',
              contentType: 'image/jpeg',
              byteSize: 1024,
              sha256Checksum: badChecksum
            }),
          /64-character hexadecimal string/i
        );
      }
    });
  });

  describe('Server Object Key Generation Format', () => {
    it('constructs server-controlled object key adhering strictly to taxonomy format', () => {
      const sessionId = randomUUID();
      const attemptId = randomUUID();
      const evidenceType = 'WEBCAM_SNAPSHOT';
      const evidenceId = randomUUID();
      const extension = getExtensionForMime('image/jpeg');

      const objectKey = `evidence/${sessionId}/${attemptId}/${evidenceType}/${evidenceId}.${extension}`;

      assert.match(
        objectKey,
        /^evidence\/[0-9a-fA-F-]{36}\/[0-9a-fA-F-]{36}\/(WEBCAM_SNAPSHOT|SCREEN_CAPTURE|AUDIO_SNIPPET)\/[0-9a-fA-F-]{36}\.(jpg|png|webp|webm|ogg|wav)$/
      );
      assert.ok(!objectKey.includes('@'));
      assert.ok(!objectKey.includes('student'));
      assert.ok(!objectKey.includes('..'));
    });
  });
});
