/**
 * @file mediaRateLimiting.test.js
 * @description Integration tests for Phase 17 Two-Tier rate limiting:
 * Dedicated Media Signaling Token Bucket (240 msgs/min, burst 60) and flood protection.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { app } from '../../src/app.js';
import { config } from '../../src/config/env.js';
import { defaultWebSocketServer } from '../../src/infrastructure/realtime/websocketServer.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import { closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';

describe('Phase 17 — Media Rate Limiting Integration Tests', () => {
  let server;
  let port;
  let testToken;

  before(async () => {
    const email = `ratelimit_user_${Date.now()}@example.com`;
    const password = 'Password123!';
    await authService.register({
      name: 'RateLimit User',
      email,
      password
    });

    const loginRes = await authService.login({
      email,
      password,
      ipAddress: '127.0.0.1',
      userAgent: 'MediaRateLimitTest'
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
        }, 1500);
      });
      ws.once('error', reject);
    });
  }

  it('allows a burst of up to 60 media signaling messages without rate limiting', async () => {
    const { ws, messages } = await connectClient(testToken);

    // Send 60 media get_router_capabilities messages
    for (let i = 0; i < 60; i++) {
      ws.send(JSON.stringify({ type: 'media:get_router_capabilities', payload: {} }));
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Connection must still be open
    assert.equal(ws.readyState, WebSocket.OPEN, 'Socket must remain open after 60 burst media messages');

    // No RATE_LIMIT_EXCEEDED error
    const rateLimitErrors = messages.filter((m) => m.payload?.code === 'RATE_LIMIT_EXCEEDED');
    assert.equal(rateLimitErrors.length, 0, 'Burst of 60 should not trigger RATE_LIMIT_EXCEEDED');
    ws.close(1000);
  });

  it('returns MEDIA_RATE_LIMIT_EXCEEDED error frame when media token bucket is exhausted', async () => {
    const { ws, messages } = await connectClient(testToken);

    // Send 85 media messages (exhausting burst capacity of 60)
    for (let i = 0; i < 85; i++) {
      ws.send(JSON.stringify({ type: 'media:get_router_capabilities', payload: {} }));
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check that we received at least one rate limit error
    const rateLimitErrors = messages.filter(
      (m) => m.type === 'error' && m.payload?.code === 'MEDIA_RATE_LIMIT_EXCEEDED'
    );
    assert.ok(rateLimitErrors.length > 0, 'Exceeding burst capacity must return MEDIA_RATE_LIMIT_EXCEEDED');
    assert.equal(ws.readyState, WebSocket.OPEN, 'Socket should remain open for minor rate limit exceedance');
    ws.close(1000);
  });


  it('terminates connection with close code 1008 on severe media signaling flood (>120 over limit)', async () => {
    const { ws } = await connectClient(testToken);

    const closePromise = new Promise((resolve) => {
      ws.once('close', (code) => resolve(code));
    });

    // Send 200 media messages rapidly (60 capacity + 140 excess > 120 flood ceiling)
    for (let i = 0; i < 200; i++) {
      ws.send(JSON.stringify({ type: 'media:get_router_capabilities', payload: {} }));
    }

    const closeCode = await Promise.race([
      closePromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 3000))
    ]);

    assert.equal(closeCode, 1008, 'Severe flood must terminate connection with code 1008 Policy Violation');
  });
});
