/**
 * @file sfuManager.test.js
 * @description Unit & integration tests for Phase 17 SfuManager:
 * - Bounded worker pool initialization
 * - Deterministic session-to-worker pinning
 * - Per-worker generation context
 * - Router and transport lifecycle
 * - Clean shutdown
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SfuManager, deterministicHash } from '../../src/infrastructure/media/sfuManager.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';

describe('Phase 17 — SfuManager Unit & Integration Tests', () => {
  let sfuManager;

  before(async () => {
    sfuManager = new SfuManager();
    await sfuManager.init();
  });

  after(async () => {
    if (sfuManager) {
      await sfuManager.close();
    }
    await closeRedis().catch(() => {});
  });


  describe('Deterministic Pinning & Worker Pool', () => {
    it('deterministicHash produces non-negative integer and is consistent', () => {
      const id1 = 'session-test-uuid-1';
      const hash1a = deterministicHash(id1);
      const hash1b = deterministicHash(id1);
      assert.equal(hash1a, hash1b);
      assert.ok(hash1a >= 0);

      const id2 = 'session-test-uuid-2';
      const hash2 = deterministicHash(id2);
      assert.notEqual(hash1a, hash2);
    });

    it('initializes bounded worker pool with generation 1 and status ACTIVE', () => {
      assert.ok(sfuManager.isInitialized);
      assert.ok(sfuManager.workerContexts.length >= 1);
      assert.ok(sfuManager.workerContexts.length <= 4);

      for (const ctx of sfuManager.workerContexts) {
        assert.equal(ctx.generation, 1);
        assert.equal(ctx.status, 'ACTIVE');
        assert.ok(ctx.worker);
        assert.ok(ctx.assignedSessions instanceof Set);
      }
    });

    it('pins sessions deterministically to workers', () => {
      const sessionId = randomUUID();
      const idx1 = sfuManager.getWorkerIndexForSession(sessionId);
      const idx2 = sfuManager.getWorkerIndexForSession(sessionId);

      assert.equal(typeof idx1, 'number');
      assert.equal(idx1, idx2);
    });
  });

  describe('Session Router & Transport Lifecycle', () => {
    const testSessionId = randomUUID();
    let sendTransportInfo;
    let recvTransportInfo;

    it('creates a router for a session on its pinned worker', async () => {
      const { router, workerId, workerGeneration } = await sfuManager.getOrCreateRouter(testSessionId);
      assert.ok(router);
      assert.ok(router.rtpCapabilities);
      assert.equal(typeof workerId, 'number');
      assert.equal(workerGeneration, 1);

      const workerIdx = sfuManager.getWorkerIndexForSession(testSessionId);
      assert.equal(workerId, workerIdx);
      assert.ok(sfuManager.workerContexts[workerIdx].assignedSessions.has(testSessionId));
    });

    it('creates a send WebRTC transport for a candidate', async () => {
      const connectionId = randomUUID();
      const userId = randomUUID();

      sendTransportInfo = await sfuManager.createTransport(
        testSessionId,
        connectionId,
        userId,
        'send'
      );

      assert.ok(sendTransportInfo.id);
      assert.ok(sendTransportInfo.iceParameters);
      assert.ok(Array.isArray(sendTransportInfo.iceCandidates));
      assert.ok(sendTransportInfo.dtlsParameters);
    });

    it('creates a recv WebRTC transport for an invigilator', async () => {
      const connectionId = randomUUID();
      const userId = randomUUID();

      recvTransportInfo = await sfuManager.createTransport(
        testSessionId,
        connectionId,
        userId,
        'recv'
      );

      assert.ok(recvTransportInfo.id);
      assert.ok(recvTransportInfo.iceParameters);
      assert.ok(Array.isArray(recvTransportInfo.iceCandidates));
      assert.ok(recvTransportInfo.dtlsParameters);
    });

    it('connects WebRTC transport with client dtlsParameters', async () => {
      const dummyDtls = {
        role: 'client',
        fingerprints: [
          {
            algorithm: 'sha-256',
            value: '00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF'
          }
        ]
      };

      const result = await sfuManager.connectTransport(sendTransportInfo.id, dummyDtls);
      assert.equal(result.success, true);
    });

    it('restarts ICE on a transport', async () => {
      const iceResult = await sfuManager.restartIce(sendTransportInfo.id);
      assert.ok(iceResult.iceParameters);
      assert.notEqual(iceResult.iceParameters.usernameFragment, sendTransportInfo.iceParameters.usernameFragment);
    });

    it('closes a transport and removes it from registry', async () => {
      const closed = await sfuManager.closeTransport(recvTransportInfo.id);
      assert.equal(closed, true);
      assert.equal(sfuManager.transports.has(recvTransportInfo.id), false);
    });
  });
});
