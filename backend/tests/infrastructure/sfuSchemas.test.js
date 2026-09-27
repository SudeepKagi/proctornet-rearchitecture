/**
 * @file sfuSchemas.test.js
 * @description Unit tests verifying WebRTC / SFU media signaling Zod schemas, payload sizing,
 * and boundary validation rules per ADR-0007.
 */

import { describe, it, expect } from 'vitest';
import {
  mediaConsumeBatchSchema,
  mediaCreateTransportSchema,
  mediaProduceSchema,
  parseMediaCommand
} from '../../src/infrastructure/media/media.schemas.js';

describe('SFU Media Signaling Schemas & Sizing Limits (ADR-0007)', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  describe('media:consume_batch bounds', () => {
    it('accepts valid batch request with 1 to 36 producerIds', () => {
      const payload = {
        transportId: validUuid,
        rtpCapabilities: { codecs: [] },
        producerIds: [validUuid]
      };
      const result = mediaConsumeBatchSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects empty producerIds array (minimum 1 required)', () => {
      const payload = {
        transportId: validUuid,
        rtpCapabilities: { codecs: [] },
        producerIds: []
      };
      const result = mediaConsumeBatchSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('At least one producerId required');
    });

    it('rejects batch requests exceeding 36 producerIds', () => {
      const producerIds = new Array(37).fill(validUuid);
      const payload = {
        transportId: validUuid,
        rtpCapabilities: { codecs: [] },
        producerIds
      };
      const result = mediaConsumeBatchSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Maximum 36 producerIds per batch');
    });

    it('strictly enforces root-level rtpCapabilities in batch consume', () => {
      const payload = {
        transportId: validUuid,
        producerIds: [validUuid]
      };
      const result = mediaConsumeBatchSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toContain('rtpCapabilities');
    });
  });

  describe('media:create_transport bounds', () => {
    it('validates send and recv directions', () => {
      expect(
        mediaCreateTransportSchema.safeParse({ sessionId: validUuid, direction: 'send' }).success
      ).toBe(true);
      expect(
        mediaCreateTransportSchema.safeParse({ sessionId: validUuid, direction: 'recv' }).success
      ).toBe(true);
      expect(
        mediaCreateTransportSchema.safeParse({ sessionId: validUuid, direction: 'invalid' }).success
      ).toBe(false);
    });
  });

  describe('media:produce bounds', () => {
    it('validates kind and trackType', () => {
      const valid = {
        transportId: validUuid,
        kind: 'video',
        rtpParameters: {},
        appData: { trackType: 'webcam' }
      };
      expect(mediaProduceSchema.safeParse(valid).success).toBe(true);

      const invalidKind = { ...valid, kind: 'screen' };
      expect(mediaProduceSchema.safeParse(invalidKind).success).toBe(false);
    });
  });

  describe('parseMediaCommand helper', () => {
    it('validates recognized command types', () => {
      const res = parseMediaCommand('media:create_transport', {
        sessionId: validUuid,
        direction: 'send'
      });
      expect(res.success).toBe(true);
    });

    it('rejects unknown media command types', () => {
      const res = parseMediaCommand('media:unsupported_action', {});
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unknown media action');
    });
  });
});
