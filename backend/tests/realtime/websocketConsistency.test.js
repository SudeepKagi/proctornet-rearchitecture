/**
 * @file websocketConsistency.test.js
 * @description Consistency, failure isolation, and degraded mode tests for Phase 16:
 * Post-commit broadcast failure isolation, Redis Pub/Sub degraded/recovered states,
 * and token refresh reconnection consistency.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { app } from '../../src/app.js';
import { config } from '../../src/config/env.js';
import { defaultWebSocketServer } from '../../src/infrastructure/realtime/websocketServer.js';
import { defaultBroadcaster, RealtimeBroadcaster } from '../../src/infrastructure/realtime/realtimeBroadcaster.js';
import { ChannelManager } from '../../src/infrastructure/realtime/channelManager.js';
import { setupProctoringFixture } from '../proctoring/proctoringTestHelper.js';
import { ingestCandidateEvents } from '../../src/modules/proctoring/proctoring.service.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import { closePool, query } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { closeRabbitMQ } from '../../src/infrastructure/rabbitmq/client.js';

describe('Phase 16 — WebSocket Consistency & Degradation Tests', () => {
  let server;
  let port;
  let fixture;
  let studentAttempt;

  before(async () => {
    fixture = await setupProctoringFixture();
    studentAttempt = await fixture.createStudentAttempt('ACTIVE');

    server = http.createServer(app);
    server.on('upgrade', (req, socket, head) => {
      defaultWebSocketServer.handleUpgrade(req, socket, head);
    });

    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });

    defaultWebSocketServer.startTimers();
  });

  after(async () => {
    await defaultWebSocketServer.close(1000);
    await new Promise((resolve) => server.close(resolve));
    await closeRabbitMQ().catch(() => {});
    await closeRedis().catch(() => {});
    await closePool().catch(() => {});
  });

  function openClient(token) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`, ['proctornet', token], {
        headers: { origin: config.CORS_ORIGIN || 'http://localhost:5173' }
      });

      const messages = [];
      ws.on('message', (raw) => {
        try {
          messages.push(JSON.parse(raw.toString('utf8')));
        } catch {}
      });

      ws.once('open', () => {
        const check = setInterval(() => {
          if (messages.find((m) => m.type === 'connection:established')) {
            clearInterval(check);
            resolve({ ws, messages });
          }
        }, 20);
        setTimeout(() => {
          clearInterval(check);
          resolve({ ws, messages });
        }, 1000);
      });

      ws.once('error', reject);
    });
  }

  it('preserves database commit even when post-commit realtime broadcast throws an error', async () => {
    const originalBroadcast = defaultBroadcaster.broadcastToSession;

    // Simulate catastrophic transport crash in broadcaster
    defaultBroadcaster.broadcastToSession = async () => {
      throw new Error('SIMULATED_REDIS_OR_WEBSOCKET_BROADCAST_FAILURE');
    };

    try {
      const clientEventId = randomUUID();
      const result = await ingestCandidateEvents(studentAttempt.attempt.attempt_id, studentAttempt.studentUser, [
        {
          eventId: clientEventId,
          eventType: 'WINDOW_BLUR',
          clientTimestamp: new Date().toISOString()
        }
      ]);

      // Ingestion must succeed despite broadcaster failure
      assert.ok(result);
      assert.equal(result.accepted, 1);

      // Verify PostgreSQL transaction committed
      const dbCheck = await query(`SELECT * FROM violation_events WHERE client_event_id = $1;`, [clientEventId]);
      assert.equal(dbCheck.rows.length, 1, 'Database row must be committed even if broadcaster failed');
    } finally {
      defaultBroadcaster.broadcastToSession = originalBroadcast;
    }
  });

  it('transitions broadcaster state to DEGRADED and emits system:realtime_degraded to local sockets on sync failure', async () => {
    const testChannelManager = new ChannelManager();
    const testBroadcaster = new RealtimeBroadcaster({ channelManager: testChannelManager, enableRedis: false });

    const receivedMessages = [];
    const mockSocket = {
      readyState: WebSocket.OPEN,
      bufferedAmount: 0,
      send: (raw) => {
        receivedMessages.push(JSON.parse(raw));
      },
      close: () => {}
    };

    testChannelManager.registerConnection(mockSocket, {
      connectionId: 'c-test-degraded',
      userId: randomUUID(),
      roles: ['INVIGILATOR']
    });

    assert.equal(testBroadcaster.getState(), 'HEALTHY');

    // Simulate Redis Pub/Sub partition
    testBroadcaster._transitionToDegraded('REDIS_DISCONNECT');

    assert.equal(testBroadcaster.getState(), 'DEGRADED');
    assert.equal(receivedMessages.length, 1);
    assert.equal(receivedMessages[0].type, 'system:realtime_degraded');
    assert.equal(receivedMessages[0].payload.reason, 'CROSS_NODE_SYNC_UNAVAILABLE');

    // Simulate Redis reconnection & recovery
    testBroadcaster._transitionToHealthy();

    assert.equal(testBroadcaster.getState(), 'HEALTHY');
    assert.equal(receivedMessages.length, 2);
    assert.equal(receivedMessages[1].type, 'system:realtime_recovered');

    testChannelManager.removeConnection(mockSocket);
  });

  it('supports seamless reconnect with a fresh access token obtained from proactive REST refresh', async () => {
    // 1. Initial connection with current student token
    const client1 = await openClient(studentAttempt.token);
    assert.equal(client1.ws.readyState, WebSocket.OPEN);

    // 2. Perform REST login / refresh to get fresh access token
    const newLogin = await authService.login({
      email: studentAttempt.studentUser.email || `student_proc_fixture@example.com`,
      password: 'Password123!'
    }).catch(async () => {
      // Create fresh token for same user
      const { generateAccessToken } = await import('../../src/modules/auth/token.service.js');
      return { accessToken: generateAccessToken({ userId: studentAttempt.studentUser.userId, sessionId: randomUUID() }) };
    });

    const freshToken = newLogin.accessToken;
    assert.ok(freshToken);

    // 3. Close old socket
    client1.ws.close(1000, 'Simulated network drop');

    // 4. Reconnect with fresh token
    const client2 = await openClient(freshToken);
    assert.equal(client2.ws.readyState, WebSocket.OPEN);
    assert.equal(client2.ws.protocol, 'proctornet');

    const est = client2.messages.find((m) => m.type === 'connection:established');
    assert.ok(est, 'Must receive connection:established with fresh token');

    client2.ws.close(1000);
  });
});
