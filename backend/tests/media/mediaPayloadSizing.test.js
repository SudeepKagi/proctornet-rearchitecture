/**
 * @file mediaPayloadSizing.test.js
 * @description Tests enforcing decoupled payload sizing between generic control traffic (16 KB)
 * and authenticated media signaling traffic (64 KB).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { app } from '../../src/app.js';
import { config } from '../../src/config/env.js';
import { defaultWebSocketServer } from '../../src/infrastructure/realtime/websocketServer.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import { generateAccessToken } from '../../src/modules/auth/token.service.js';
import { closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';


describe('Phase 17 — Media Payload Sizing Tests', () => {
  let server;
  let port;
  let testToken;

  before(async () => {
    // Register and login valid user
    const email = `payload_user_${Date.now()}@example.com`;
    const password = 'Password123!';
    await authService.register({
      name: 'Payload Test User',
      email,
      password
    });

    const loginRes = await authService.login({
      email,
      password,
      ipAddress: '127.0.0.1',
      userAgent: 'MediaPayloadTest'
    });

    testToken = loginRes.accessToken;

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
  });


  after(async () => {
    await defaultWebSocketServer.close(1000);
    await new Promise((resolve) => server.close(resolve));
    await closeRedis().catch(() => {});
    await closePool().catch(() => {});
  });

  function connectClient(token) {
    return new Promise((resolve, reject) => {
      const protocols = token ? ['proctornet', token] : ['proctornet'];
      const ws = new WebSocket(`ws://localhost:${port}/ws`, protocols, {
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
        }, 1500);
      });
      ws.once('error', reject);
    });
  }

  it('terminates connection with close code 1009 when generic control payload exceeds 16 KB', async () => {
    const { ws } = await connectClient(testToken);

    const closePromise = new Promise((resolve) => {
      ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });

    // Send a 20 KB generic control payload (exceeds WS_MAX_PAYLOAD_BYTES of 16 KB)
    const largePadding = 'X'.repeat(20 * 1024);
    const oversizedGenericMsg = JSON.stringify({
      type: 'heartbeat',
      payload: { padding: largePadding }
    });

    ws.send(oversizedGenericMsg);

    const result = await Promise.race([
      closePromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 2500))
    ]);

    assert.ok(result, 'Expected socket to close on oversized generic payload');
    assert.equal(result.code, 1009, 'Close code must be 1009 Message Too Big');
  });

  it('allows authenticated media signaling payload up to 64 KB (exceeding 16 KB)', async () => {
    const { ws } = await connectClient(testToken);

    // Send a 25 KB media command (larger than 16 KB, smaller than 64 KB)
    const padding = 'Y'.repeat(25 * 1024);
    const mediaMsg = JSON.stringify({
      type: 'media:get_router_capabilities',
      payload: { padding }
    });

    ws.send(mediaMsg);

    // Give the server time to process
    await new Promise((resolve) => setTimeout(resolve, 400));

    // The socket must still be open and NOT closed with 1009
    assert.equal(ws.readyState, WebSocket.OPEN, 'Authenticated media payload under 64 KB must be accepted');
    ws.close(1000);
  });

  it('terminates connection with close code 1009 when media signaling payload exceeds 64 KB', async () => {
    const { ws } = await connectClient(testToken);

    const closePromise = new Promise((resolve) => {
      ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });

    // Send a 70 KB media payload (exceeds WS_MEDIA_MAX_PAYLOAD_BYTES of 64 KB)
    const largePadding = 'Z'.repeat(70 * 1024);
    const oversizedMediaMsg = JSON.stringify({
      type: 'media:get_router_capabilities',
      payload: { padding: largePadding }
    });

    ws.send(oversizedMediaMsg);

    const result = await Promise.race([
      closePromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 2500))
    ]);

    assert.ok(result, 'Expected socket to close on oversized media payload');
    assert.equal(result.code, 1009, 'Close code must be 1009 Message Too Big');
  });
});
