/**
 * @file sfuCrashRecovery.test.js
 * @description Tests per-worker generation scoping, worker crash isolation,
 * generation fencing, and zero blast-radius on healthy workers and sessions.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SfuManager } from '../../src/infrastructure/media/sfuManager.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';

describe('Phase 17 — SFU Crash Recovery & Generation Fencing Tests', () => {
  let sfuManager;
  let resetNotifications = [];

  before(async () => {
    sfuManager = new SfuManager();
    sfuManager.setSessionResetBroadcaster(async (sessionId, payload) => {
      resetNotifications.push({ sessionId, payload });
    });
    await sfuManager.init();
  });

  after(async () => {
    if (sfuManager) {
      await sfuManager.close();
    }
    await closeRedis().catch(() => {});
  });


  it('isolates worker crash: only affected worker generation increments, healthy workers unaffected', async () => {
    assert.ok(sfuManager.workerContexts.length >= 2, 'Requires at least 2 workers for isolation test');

    // Find sessions that map to Worker 0 and Worker 1
    let sessionOnWorker0 = null;
    let sessionOnWorker1 = null;

    for (let i = 0; i < 1000; i++) {
      const sId = randomUUID();
      const wIdx = sfuManager.getWorkerIndexForSession(sId);
      if (wIdx === 0 && !sessionOnWorker0) {
        sessionOnWorker0 = sId;
      } else if (wIdx === 1 && !sessionOnWorker1) {
        sessionOnWorker1 = sId;
      }
      if (sessionOnWorker0 && sessionOnWorker1) break;
    }

    assert.ok(sessionOnWorker0, 'Found session for Worker 0');
    assert.ok(sessionOnWorker1, 'Found session for Worker 1');

    // Initialize routers for both sessions
    const router0 = await sfuManager.getOrCreateRouter(sessionOnWorker0);
    const router1 = await sfuManager.getOrCreateRouter(sessionOnWorker1);

    assert.equal(router0.workerId, 0);
    assert.equal(router0.workerGeneration, 1);
    assert.equal(router1.workerId, 1);
    assert.equal(router1.workerGeneration, 1);

    // Initial worker states
    const ctx0 = sfuManager.workerContexts[0];
    const ctx1 = sfuManager.workerContexts[1];

    assert.equal(ctx0.generation, 1);
    assert.equal(ctx1.generation, 1);
    assert.equal(ctx0.status, 'ACTIVE');
    assert.equal(ctx1.status, 'ACTIVE');

    // Crash Worker 1 by invoking _handleWorkerDied
    await sfuManager._handleWorkerDied(1, new Error('Simulated process SIGSEGV'));

    // Verify Worker 0 (HEALTHY) IS COMPLETELY UNAFFECTED
    assert.equal(ctx0.generation, 1, 'Worker 0 generation must remain 1');
    assert.equal(ctx0.status, 'ACTIVE', 'Worker 0 status must remain ACTIVE');
    const session0Obj = sfuManager.sessions.get(sessionOnWorker0);
    assert.ok(session0Obj, 'Worker 0 session must still exist');
    assert.equal(session0Obj.status, 'ACTIVE', 'Worker 0 session must remain ACTIVE');

    // Verify Worker 1 (AFFECTED) recovered and incremented generation
    assert.equal(ctx1.generation, 2, 'Worker 1 generation must increment to 2');
    assert.equal(ctx1.status, 'ACTIVE', 'Worker 1 status must return to ACTIVE after respawn');

    // Verify session reset notification was broadcast for sessionOnWorker1, NOT for sessionOnWorker0
    const reset1 = resetNotifications.find((n) => n.sessionId === sessionOnWorker1);
    assert.ok(reset1, 'Must broadcast reset for Worker 1 session');
    assert.equal(reset1.payload.epoch, 2);
    assert.equal(reset1.payload.workerId, 1);

    const reset0 = resetNotifications.find((n) => n.sessionId === sessionOnWorker0);
    assert.equal(reset0, undefined, 'Must NOT broadcast reset for healthy Worker 0 session');
  });

  it('enforces generation fencing: stale generation operations are rejected with MEDIA_SESSION_RESETTING', () => {
    // Find a session on Worker 1
    let sessionOnWorker1 = null;
    for (let i = 0; i < 1000; i++) {
      const sId = randomUUID();
      if (sfuManager.getWorkerIndexForSession(sId) === 1) {
        sessionOnWorker1 = sId;
        break;
      }
    }

    // Attempt signaling with stale generation 1 (Worker 1 is now at generation 2)
    assert.throws(
      () => {
        sfuManager.assertWorkerAndSession(sessionOnWorker1, 1, 1); // clientGeneration = 1 < 2
      },
      (err) => {
        assert.equal(err.code, 'MEDIA_SESSION_RESETTING');
        assert.equal(err.workerId, 1);
        assert.equal(err.epoch, 2);
        return true;
      }
    );

    // Valid generation 2 succeeds
    const res = sfuManager.assertWorkerAndSession(sessionOnWorker1, 1, 2);
    assert.equal(res.workerIndex, 1);
    assert.equal(res.workerCtx.generation, 2);
  });

  it('rejects worker ID mismatch with MEDIA_WORKER_MISMATCH', () => {
    let sessionOnWorker1 = null;
    for (let i = 0; i < 1000; i++) {
      const sId = randomUUID();
      if (sfuManager.getWorkerIndexForSession(sId) === 1) {
        sessionOnWorker1 = sId;
        break;
      }
    }

    // Claiming session is on worker 0 when it is pinned to worker 1
    assert.throws(
      () => {
        sfuManager.assertWorkerAndSession(sessionOnWorker1, 0, 2);
      },
      (err) => {
        assert.equal(err.code, 'MEDIA_WORKER_MISMATCH');
        return true;
      }
    );
  });
});
