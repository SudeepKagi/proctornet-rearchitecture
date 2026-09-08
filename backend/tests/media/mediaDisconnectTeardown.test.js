/**
 * @file mediaDisconnectTeardown.test.js
 * @description Tests idempotent cleanup on connection termination via closeTransportsForConnection.
 * Verifies that send/recv transports, producers, and consumers are completely cleaned up
 * while sibling connections on the same session remain unaffected.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SfuManager } from '../../src/infrastructure/media/sfuManager.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';

describe('Phase 17 — Media Disconnect Teardown Tests', () => {
  let sfuManager;
  const testSessionId = randomUUID();

  before(async () => {
    sfuManager = new SfuManager();
    await sfuManager.init();
    await sfuManager.getOrCreateRouter(testSessionId);
  });

  after(async () => {
    if (sfuManager) {
      await sfuManager.close();
    }
    await closeRedis().catch(() => {});
  });

  it('tears down all transports for disconnected connection while preserving sibling connections', async () => {
    const conn1 = randomUUID();
    const conn2 = randomUUID();
    const user1 = randomUUID();
    const user2 = randomUUID();

    // Create transports for conn1 (send and recv)
    const t1Send = await sfuManager.createTransport(testSessionId, conn1, user1, 'send');
    const t1Recv = await sfuManager.createTransport(testSessionId, conn1, user1, 'recv');

    // Create transport for conn2 (send)
    const t2Send = await sfuManager.createTransport(testSessionId, conn2, user2, 'send');

    assert.ok(sfuManager.transports.has(t1Send.id));
    assert.ok(sfuManager.transports.has(t1Recv.id));
    assert.ok(sfuManager.transports.has(t2Send.id));
    assert.equal(sfuManager.connectionTransports.get(conn1).size, 2);
    assert.equal(sfuManager.connectionTransports.get(conn2).size, 1);

    // Teardown conn1
    await sfuManager.closeTransportsForConnection(conn1);

    // conn1 transports must be gone
    assert.equal(sfuManager.transports.has(t1Send.id), false, 'conn1 send transport must be removed');
    assert.equal(sfuManager.transports.has(t1Recv.id), false, 'conn1 recv transport must be removed');
    assert.equal(sfuManager.connectionTransports.has(conn1), false, 'conn1 must be evicted from connectionTransports');

    // conn2 transport must still be intact
    assert.equal(sfuManager.transports.has(t2Send.id), true, 'conn2 send transport must be preserved');
    assert.equal(sfuManager.connectionTransports.get(conn2).has(t2Send.id), true);

    // Teardown conn1 again (idempotence verification)
    await sfuManager.closeTransportsForConnection(conn1);
    assert.equal(sfuManager.transports.has(t2Send.id), true, 'Idempotent call must not affect conn2');

    // Teardown conn2
    await sfuManager.closeTransportsForConnection(conn2);
    assert.equal(sfuManager.transports.has(t2Send.id), false, 'conn2 transport must now be removed');
  });

  it('handles closeTransportsForConnection for non-existent connection gracefully', async () => {
    const nonExistentConn = randomUUID();
    await sfuManager.closeTransportsForConnection(nonExistentConn);
    assert.ok(true, 'Must not throw for non-existent connection');
  });
});
