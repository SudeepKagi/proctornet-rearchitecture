/**
 * @file mediaSchemas.test.js
 * @description Unit tests for Phase 17 media signaling Zod schemas:
 * media:get_router_capabilities, media:create_transport, media:connect_transport,
 * media:produce, media:consume, media:consume_batch (min 1, max 36, root rtpCapabilities),
 * media:consumer_set_layers, media:restart_ice, media:close_producer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  mediaGetRouterCapabilitiesSchema,
  mediaCreateTransportSchema,
  mediaConnectTransportSchema,
  mediaProduceSchema,
  mediaConsumeSchema,
  mediaConsumeBatchSchema,
  mediaConsumerSetLayersSchema,
  mediaConsumerPauseSchema,
  mediaConsumerResumeSchema,
  mediaRestartIceSchema,
  mediaCloseProducerSchema,
  parseMediaCommand
} from '../../src/infrastructure/media/media.schemas.js';

describe('Phase 17 — Media Schemas Unit Tests', () => {
  const validRtpCapabilities = {
    codecs: [
      {
        mimeType: 'video/VP8',
        clockRate: 90000,
        payloadType: 96
      }
    ],
    headerExtensions: []
  };

  const validDtlsParameters = {
    role: 'client',
    fingerprints: [
      {
        algorithm: 'sha-256',
        value: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99'
      }
    ]
  };

  describe('media:get_router_capabilities', () => {
    it('accepts empty object or valid sessionId', () => {
      assert.equal(mediaGetRouterCapabilitiesSchema.safeParse({}).success, true);
      assert.equal(mediaGetRouterCapabilitiesSchema.safeParse({ sessionId: randomUUID() }).success, true);
    });

    it('rejects invalid sessionId', () => {
      assert.equal(mediaGetRouterCapabilitiesSchema.safeParse({ sessionId: 'invalid' }).success, false);
    });
  });

  describe('media:create_transport', () => {
    it('accepts valid send and recv directions with sessionId', () => {
      const sId = randomUUID();
      assert.equal(mediaCreateTransportSchema.safeParse({ sessionId: sId, direction: 'send' }).success, true);
      assert.equal(mediaCreateTransportSchema.safeParse({ sessionId: sId, direction: 'recv' }).success, true);
    });

    it('rejects missing sessionId or invalid direction', () => {
      assert.equal(mediaCreateTransportSchema.safeParse({ direction: 'send' }).success, false);
      assert.equal(mediaCreateTransportSchema.safeParse({ sessionId: randomUUID(), direction: 'both' }).success, false);
    });
  });

  describe('media:connect_transport', () => {
    it('accepts valid payload', () => {
      const parsed = mediaConnectTransportSchema.safeParse({
        transportId: randomUUID(),
        dtlsParameters: validDtlsParameters
      });
      assert.equal(parsed.success, true);
    });

    it('rejects missing dtlsParameters or transportId', () => {
      assert.equal(mediaConnectTransportSchema.safeParse({ transportId: randomUUID() }).success, false);
      assert.equal(mediaConnectTransportSchema.safeParse({ dtlsParameters: validDtlsParameters }).success, false);
    });
  });

  describe('media:produce', () => {
    it('accepts valid audio and video tracks with trackType', () => {
      const webcam = mediaProduceSchema.safeParse({
        transportId: randomUUID(),
        kind: 'video',
        rtpParameters: { mid: '0', codecs: [] },
        appData: { trackType: 'webcam' }
      });
      assert.equal(webcam.success, true);

      const mic = mediaProduceSchema.safeParse({
        transportId: randomUUID(),
        kind: 'audio',
        rtpParameters: { mid: '1', codecs: [] },
        appData: { trackType: 'microphone' }
      });
      assert.equal(mic.success, true);

      const screen = mediaProduceSchema.safeParse({
        transportId: randomUUID(),
        kind: 'video',
        rtpParameters: { mid: '2', codecs: [] },
        appData: { trackType: 'screen' }
      });
      assert.equal(screen.success, true);
    });

    it('rejects invalid kind or trackType', () => {
      assert.equal(
        mediaProduceSchema.safeParse({
          transportId: randomUUID(),
          kind: 'data',
          rtpParameters: {}
        }).success,
        false
      );

      assert.equal(
        mediaProduceSchema.safeParse({
          transportId: randomUUID(),
          kind: 'video',
          rtpParameters: {},
          appData: { trackType: 'invalid_track' }
        }).success,
        false
      );
    });
  });

  describe('media:consume and media:consume_batch', () => {
    it('accepts valid single consume payload', () => {
      const parsed = mediaConsumeSchema.safeParse({
        transportId: randomUUID(),
        producerId: randomUUID(),
        rtpCapabilities: validRtpCapabilities
      });
      assert.equal(parsed.success, true);
    });

    it('accepts valid consume_batch with root rtpCapabilities and 1 to 36 producerIds', () => {
      const parsed = mediaConsumeBatchSchema.safeParse({
        transportId: randomUUID(),
        rtpCapabilities: validRtpCapabilities,
        producerIds: [randomUUID(), randomUUID()]
      });
      assert.equal(parsed.success, true);
      assert.equal(parsed.data.producerIds.length, 2);
    });

    it('accepts maximum allowed limit of 36 producerIds', () => {
      const producerIds = Array.from({ length: 36 }, () => randomUUID());
      const parsed = mediaConsumeBatchSchema.safeParse({
        transportId: randomUUID(),
        rtpCapabilities: validRtpCapabilities,
        producerIds
      });
      assert.equal(parsed.success, true);
      assert.equal(parsed.data.producerIds.length, 36);
    });

    it('rejects empty producerIds array (min 1)', () => {
      const parsed = mediaConsumeBatchSchema.safeParse({
        transportId: randomUUID(),
        rtpCapabilities: validRtpCapabilities,
        producerIds: []
      });
      assert.equal(parsed.success, false);
    });

    it('rejects over 36 producerIds (max 36)', () => {
      const producerIds = Array.from({ length: 37 }, () => randomUUID());
      const parsed = mediaConsumeBatchSchema.safeParse({
        transportId: randomUUID(),
        rtpCapabilities: validRtpCapabilities,
        producerIds
      });
      assert.equal(parsed.success, false);
    });

    it('rejects invalid or non-UUID items in producerIds', () => {
      const parsed = mediaConsumeBatchSchema.safeParse({
        transportId: randomUUID(),
        rtpCapabilities: validRtpCapabilities,
        producerIds: [randomUUID(), 'invalid-uuid-123']
      });
      assert.equal(parsed.success, false);
    });

    it('rejects missing root-level rtpCapabilities', () => {
      const parsed = mediaConsumeBatchSchema.safeParse({
        transportId: randomUUID(),
        producerIds: [randomUUID()]
      });
      assert.equal(parsed.success, false);
    });
  });

  describe('media:consumer_set_layers', () => {
    it('accepts valid consumer layer switching', () => {
      const parsed = mediaConsumerSetLayersSchema.safeParse({
        consumerId: randomUUID(),
        spatialLayer: 1,
        temporalLayer: 2
      });
      assert.equal(parsed.success, true);
    });

    it('rejects negative or out of bounds spatial/temporal layers', () => {
      assert.equal(
        mediaConsumerSetLayersSchema.safeParse({
          consumerId: randomUUID(),
          spatialLayer: -1,
          temporalLayer: 0
        }).success,
        false
      );

      assert.equal(
        mediaConsumerSetLayersSchema.safeParse({
          consumerId: randomUUID(),
          spatialLayer: 3, // max is 2
          temporalLayer: 0
        }).success,
        false
      );
    });
  });

  describe('media:consumer_pause / resume / restart_ice / close_producer', () => {
    it('validates pause, resume, restart_ice, close_producer', () => {
      const id = randomUUID();
      assert.equal(mediaConsumerPauseSchema.safeParse({ consumerId: id }).success, true);
      assert.equal(mediaConsumerResumeSchema.safeParse({ consumerId: id }).success, true);
      assert.equal(mediaRestartIceSchema.safeParse({ transportId: id }).success, true);
      assert.equal(mediaCloseProducerSchema.safeParse({ producerId: id }).success, true);

      assert.equal(mediaRestartIceSchema.safeParse({ transportId: 'not-a-uuid' }).success, false);
      assert.equal(mediaCloseProducerSchema.safeParse({}).success, false);
    });
  });

  describe('parseMediaCommand dispatcher', () => {
    it('routes media command correctly', () => {
      const sId = randomUUID();
      const result = parseMediaCommand('media:create_transport', { sessionId: sId, direction: 'send' });
      assert.equal(result.success, true);
      assert.equal(result.data.direction, 'send');
    });

    it('returns failure for unknown media command or invalid payload', () => {
      const unknown = parseMediaCommand('media:unknown_action', {});
      assert.equal(unknown.success, false);
      assert.equal(unknown.error, 'Unknown media action: media:unknown_action');

      const invalid = parseMediaCommand('media:create_transport', { direction: 'invalid' });
      assert.equal(invalid.success, false);
    });
  });
});
