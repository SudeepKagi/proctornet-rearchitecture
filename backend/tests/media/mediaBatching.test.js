/**
 * @file mediaBatching.test.js
 * @description Tests for media:consume_batch:
 * - Server-side deduplication of producer IDs
 * - Root-level rtpCapabilities
 * - Non-rollback partial-success semantics
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SfuManager } from '../../src/infrastructure/media/sfuManager.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';

describe('Phase 17 — media:consume_batch Batching & Partial-Success Tests', () => {
  let sfuManager;
  const testSessionId = randomUUID();
  let candidateTransport;
  let invigilatorTransport;
  let dummyProducer;

  before(async () => {
    sfuManager = new SfuManager();
    await sfuManager.init();
    await sfuManager.getOrCreateRouter(testSessionId);

    // Create Candidate send transport
    candidateTransport = await sfuManager.createTransport(
      testSessionId,
      randomUUID(),
      randomUUID(),
      'send'
    );

    // Connect Candidate transport with dummy DTLS
    await sfuManager.connectTransport(candidateTransport.id, {
      role: 'client',
      fingerprints: [
        {
          algorithm: 'sha-256',
          value: '00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF'
        }
      ]
    });

    // Produce a dummy audio track
    dummyProducer = await sfuManager.produce(
      testSessionId,
      candidateTransport.id,
      'audio',
      {
        mid: '0',
        codecs: [
          {
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2,
            payloadType: 111
          }
        ],
        encodings: [{ ssrc: 11111111 }]
      },
      { trackType: 'microphone' },
      randomUUID(),
      randomUUID()
    );

    // Create Invigilator recv transport
    invigilatorTransport = await sfuManager.createTransport(
      testSessionId,
      randomUUID(),
      randomUUID(),
      'recv'
    );

    // Connect Invigilator transport with dummy DTLS
    await sfuManager.connectTransport(invigilatorTransport.id, {
      role: 'client',
      fingerprints: [
        {
          algorithm: 'sha-256',
          value: '00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF'
        }
      ]
    });
  });

  after(async () => {
    if (sfuManager) {
      await sfuManager.close();
    }
    await closeRedis().catch(() => {});
  });

  it('deduplicates producer IDs before processing', async () => {
    const validRtpCapabilities = {
      codecs: [
        {
          mimeType: 'audio/opus',
          kind: 'audio',
          clockRate: 48000,
          channels: 2,
          preferredPayloadType: 111
        }
      ],
      headerExtensions: []
    };

    // Pass duplicate producer IDs
    const duplicateIds = [dummyProducer.id, dummyProducer.id, dummyProducer.id];

    const result = await sfuManager.consumeBatch(
      testSessionId,
      invigilatorTransport.id,
      duplicateIds,
      validRtpCapabilities,
      randomUUID(),
      randomUUID()
    );

    assert.equal(result.transportId, invigilatorTransport.id);
    // Even though 3 IDs were passed, results should only contain 1 entry due to deduplication
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].producerId, dummyProducer.id);
    assert.equal(result.results[0].status, 'fulfilled');
    assert.ok(result.results[0].consumerId);
  });

  it('enforces non-rollback partial-success semantics when batch contains invalid producers', async () => {
    const validRtpCapabilities = {
      codecs: [
        {
          mimeType: 'audio/opus',
          kind: 'audio',
          clockRate: 48000,
          channels: 2,
          preferredPayloadType: 111
        }
      ],
      headerExtensions: []
    };

    const nonExistentProducerId = randomUUID();
    const mixedBatch = [dummyProducer.id, nonExistentProducerId];

    const result = await sfuManager.consumeBatch(
      testSessionId,
      invigilatorTransport.id,
      mixedBatch,
      validRtpCapabilities,
      randomUUID(),
      randomUUID()
    );

    assert.equal(result.results.length, 2);

    // First producer should be fulfilled
    const fulfilled = result.results.find((r) => r.producerId === dummyProducer.id);
    assert.ok(fulfilled);
    assert.equal(fulfilled.status, 'fulfilled');
    assert.ok(fulfilled.consumerId);

    // Second non-existent producer should be rejected with PRODUCER_NOT_FOUND
    const rejected = result.results.find((r) => r.producerId === nonExistentProducerId);
    assert.ok(rejected);
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.error, 'PRODUCER_NOT_FOUND');
  });
});
