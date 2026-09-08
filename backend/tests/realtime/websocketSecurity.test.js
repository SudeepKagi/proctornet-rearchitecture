/**
 * @file websocketSecurity.test.js
 * @description Security, RBAC, BOLA, and abuse protection tests for Phase 16:
 * Room scope authorization, peer attempt isolation, unassigned invigilator rejection,
 * oversized payload protection, connection cap enforcement, and token redaction.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { app } from '../../src/app.js';
import { config } from '../../src/config/env.js';
import { defaultWebSocketServer } from '../../src/infrastructure/realtime/websocketServer.js';
import { setupProctoringFixture } from '../proctoring/proctoringTestHelper.js';
import { sanitizeUrl } from '../../src/middleware/requestLogger.js';
import { closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { closeRabbitMQ } from '../../src/infrastructure/rabbitmq/client.js';

describe('Phase 16 — WebSocket Security & BOLA Tests', () => {
  let server;
  let port;
  let fixture;
  let student1Attempt;
  let student2Attempt;

  before(async () => {
    fixture = await setupProctoringFixture();
    student1Attempt = await fixture.createStudentAttempt('ACTIVE');
    student2Attempt = await fixture.createStudentAttempt('ACTIVE');

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

  it('BOLA Defense: rejects candidate attempting to subscribe to another candidate attempt room', async () => {
    const { ws, messages } = await openClient(student1Attempt.token);
    const peerRoom = `attempt:${student2Attempt.attempt.attempt_id}`;

    ws.send(JSON.stringify({ type: 'subscribe', payload: { room: peerRoom } }));

    await new Promise((resolve) => {
      const check = setInterval(() => {
        const err = messages.find((m) => m.type === 'error' && m.payload?.code === 'SUBSCRIPTION_FORBIDDEN');
        if (err) {
          clearInterval(check);
          resolve();
        }
      }, 25);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 1500);
    });

    const err = messages.find((m) => m.type === 'error' && m.payload?.code === 'SUBSCRIPTION_FORBIDDEN');
    assert.ok(err, 'Server must reject candidate accessing peer attempt room');
    assert.equal(err.payload.room, peerRoom);

    ws.close(1000);
  });

  it('RBAC Defense: rejects candidate attempting to subscribe to invigilator telemetry room', async () => {
    const { ws, messages } = await openClient(student1Attempt.token);
    const invigilatorRoom = `session:${fixture.session.session_id}`;

    ws.send(JSON.stringify({ type: 'subscribe', payload: { room: invigilatorRoom } }));

    await new Promise((resolve) => {
      const check = setInterval(() => {
        const err = messages.find((m) => m.type === 'error' && m.payload?.code === 'SUBSCRIPTION_FORBIDDEN');
        if (err) {
          clearInterval(check);
          resolve();
        }
      }, 25);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 1500);
    });

    const err = messages.find((m) => m.type === 'error' && m.payload?.code === 'SUBSCRIPTION_FORBIDDEN');
    assert.ok(err, 'Server must reject candidate accessing invigilator session room');

    ws.close(1000);
  });

  it('BOLA Defense: rejects unassigned invigilator attempting to subscribe to session room', async () => {
    const { ws, messages } = await openClient(fixture.unassignedInvigilator.token);
    const sessionRoom = `session:${fixture.session.session_id}`;

    ws.send(JSON.stringify({ type: 'subscribe', payload: { room: sessionRoom } }));

    await new Promise((resolve) => {
      const check = setInterval(() => {
        const err = messages.find((m) => m.type === 'error' && m.payload?.code === 'SUBSCRIPTION_FORBIDDEN');
        if (err) {
          clearInterval(check);
          resolve();
        }
      }, 25);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 1500);
    });

    const err = messages.find((m) => m.type === 'error' && m.payload?.code === 'SUBSCRIPTION_FORBIDDEN');
    assert.ok(err, 'Server must reject unassigned invigilator from session room');

    ws.close(1000);
  });

  it('Payload Protection: terminates socket with close code 1009 when inbound frame exceeds 16 KB', async () => {
    const { ws } = await openClient(student1Attempt.token);

    const closePromise = new Promise((resolve) => {
      ws.once('close', (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    // Construct oversized message (> 16384 bytes)
    const oversizedPayload = 'X'.repeat(17000);
    ws.send(JSON.stringify({ type: 'heartbeat', payload: { data: oversizedPayload } }));

    const { code } = await closePromise;
    assert.equal(code, 1009, 'Oversized message must terminate socket with code 1009 (Message Too Big)');
  });

  it('Connection Cap: terminates oldest socket with code 4429 when user exceeds 3 concurrent sockets', async () => {
    const token = student1Attempt.token;

    const s1 = await openClient(token);
    const s2 = await openClient(token);
    const s3 = await openClient(token);

    const s1ClosedPromise = new Promise((resolve) => {
      s1.ws.once('close', (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    // Opening 4th concurrent socket for the same user must close the oldest (s1)
    const s4 = await openClient(token);

    const s1Result = await s1ClosedPromise;
    assert.equal(s1Result.code, 4429, 'Oldest socket must be closed with 4429 (Too Many Connections)');

    s2.ws.close(1000);
    s3.ws.close(1000);
    s4.ws.close(1000);
  });

  it('Logging Security: verifies query string tokens are sanitized and redacted from logged URLs', () => {
    const rawUrl = '/api/v1/ws?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sensitive.payload&debug=true';
    const sanitized = sanitizeUrl(rawUrl);

    assert.ok(!sanitized.includes('sensitive.payload'), 'Raw JWT must not be present in sanitized URL');
    assert.ok(sanitized.includes('token=%5BREDACTED%5D') || sanitized.includes('token=[REDACTED]'));
    assert.ok(sanitized.includes('debug=true'));
  });
});
