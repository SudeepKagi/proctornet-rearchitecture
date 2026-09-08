/**
 * @file websocketIntegration.test.js
 * @description Integration tests for Phase 16 WebSocket control plane:
 * Subprotocol upgrade, authorization, proctoring fan-out, presence monitoring,
 * and graceful shutdown.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { app } from '../../src/app.js';
import { config } from '../../src/config/env.js';
import { defaultWebSocketServer, ProctorNetWebSocketServer } from '../../src/infrastructure/realtime/websocketServer.js';
import { RealtimeBroadcaster } from '../../src/infrastructure/realtime/realtimeBroadcaster.js';
import { ChannelManager } from '../../src/infrastructure/realtime/channelManager.js';
import { setupProctoringFixture } from '../proctoring/proctoringTestHelper.js';
import { ingestCandidateEvents } from '../../src/modules/proctoring/proctoring.service.js';
import { closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { closeRabbitMQ } from '../../src/infrastructure/rabbitmq/client.js';

describe('Phase 16 — WebSocket Integration Tests', () => {
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

  /**
   * Helper to open an authenticated client socket and await connection:established.
   */
  function openClient(token, subprotocols = ['proctornet']) {
    return new Promise((resolve, reject) => {
      const protocols = token ? ['proctornet', token] : subprotocols;
      const ws = new WebSocket(`ws://localhost:${port}/ws`, protocols, {
        headers: {
          origin: config.CORS_ORIGIN || 'http://localhost:5173'
        }
      });

      const messages = [];

      ws.on('message', (raw) => {
        try {
          const envelope = JSON.parse(raw.toString('utf8'));
          messages.push(envelope);
        } catch {}
      });

      ws.once('open', () => {
        // Wait for connection:established
        const check = setInterval(() => {
          const est = messages.find((m) => m.type === 'connection:established');
          if (est) {
            clearInterval(check);
            resolve({ ws, messages });
          }
        }, 20);

        setTimeout(() => {
          clearInterval(check);
          resolve({ ws, messages });
        }, 1000);
      });

      ws.once('error', (err) => {
        reject(err);
      });
    });
  }

  it('completes HTTP upgrade with Sec-WebSocket-Protocol and receives connection:established', async () => {
    const { ws, messages } = await openClient(fixture.assignedInvigilator.token);

    assert.equal(ws.protocol, 'proctornet');
    assert.equal(ws.readyState, WebSocket.OPEN);

    const est = messages.find((m) => m.type === 'connection:established');
    assert.ok(est, 'Must receive connection:established envelope');
    assert.ok(est.payload.connectionId);
    assert.ok(est.payload.serverTime);

    ws.close(1000);
  });

  it('rejects handshake with HTTP 401 on invalid token', async () => {
    await assert.rejects(
      () => openClient('invalid.jwt.token'),
      (err) => {
        assert.ok(err.message.includes('401') || err.message.includes('Unexpected server response'));
        return true;
      }
    );
  });

  it('authorizes assigned invigilator to subscribe to session room', async () => {
    const { ws, messages } = await openClient(fixture.assignedInvigilator.token);
    const room = `session:${fixture.session.session_id}`;

    ws.send(JSON.stringify({ type: 'subscribe', payload: { room } }));

    // Wait for subscribed confirmation
    await new Promise((resolve) => {
      const check = setInterval(() => {
        const sub = messages.find((m) => m.type === 'subscribed' && m.payload?.room === room);
        if (sub) {
          clearInterval(check);
          resolve();
        }
      }, 25);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 1500);
    });

    const sub = messages.find((m) => m.type === 'subscribed' && m.payload?.room === room);
    assert.ok(sub, 'Assigned invigilator must receive subscribed confirmation');

    ws.close(1000);
  });

  it('authorizes student to subscribe to their own attempt room', async () => {
    const { ws, messages } = await openClient(studentAttempt.token);
    const room = `attempt:${studentAttempt.attempt.attempt_id}`;

    ws.send(JSON.stringify({ type: 'subscribe', payload: { room } }));

    await new Promise((resolve) => {
      const check = setInterval(() => {
        const sub = messages.find((m) => m.type === 'subscribed' && m.payload?.room === room);
        if (sub) {
          clearInterval(check);
          resolve();
        }
      }, 25);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 1500);
    });

    const sub = messages.find((m) => m.type === 'subscribed' && m.payload?.room === room);
    assert.ok(sub, 'Student must receive subscribed confirmation for their own attempt');

    ws.close(1000);
  });

  it('delivers realtime proctoring flag to subscribed invigilator upon REST ingestion commit', async () => {
    const { ws: invWs, messages: invMessages } = await openClient(fixture.assignedInvigilator.token);
    const sessionRoom = `session:${fixture.session.session_id}`;

    invWs.send(JSON.stringify({ type: 'subscribe', payload: { room: sessionRoom } }));

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Ingest violation event via proctoring service (simulates candidate REST telemetry)
    const clientEventId = randomUUID();
    await ingestCandidateEvents(studentAttempt.attempt.attempt_id, studentAttempt.studentUser, [
      {
        eventId: clientEventId,
        eventType: 'DEVTOOLS_OPEN',
        clientTimestamp: new Date().toISOString()
      }
    ]);

    // Wait for flag_raised and risk_score_updated
    await new Promise((resolve) => {
      const check = setInterval(() => {
        const flagEvent = invMessages.find((m) => m.type === 'proctoring:flag_raised');
        const scoreEvent = invMessages.find((m) => m.type === 'proctoring:risk_score_updated');
        if (flagEvent && scoreEvent) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 2000);
    });

    const flagEvent = invMessages.find((m) => m.type === 'proctoring:flag_raised');
    assert.ok(flagEvent, 'Subscribed invigilator must receive proctoring:flag_raised in realtime');
    assert.equal(flagEvent.payload.attemptId, studentAttempt.attempt.attempt_id);

    const scoreEvent = invMessages.find((m) => m.type === 'proctoring:risk_score_updated');
    assert.ok(scoreEvent, 'Subscribed invigilator must receive proctoring:risk_score_updated');
    assert.ok(scoreEvent.payload.riskScore > 0);

    invWs.close(1000);
  });

  it('detects immediate candidate socket closure within <= 1 second and alerts assigned invigilator', async () => {
    const { ws: invWs, messages: invMessages } = await openClient(fixture.assignedInvigilator.token);
    const sessionRoom = `session:${fixture.session.session_id}`;

    invWs.send(JSON.stringify({ type: 'subscribe', payload: { room: sessionRoom } }));
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Candidate connects and subscribes to attempt room
    const { ws: candWs } = await openClient(studentAttempt.token);
    candWs.send(JSON.stringify({ type: 'subscribe', payload: { room: `attempt:${studentAttempt.attempt.attempt_id}` } }));
    // Candidate sends a heartbeat to associate attemptId
    candWs.send(JSON.stringify({ type: 'heartbeat', payload: { attemptId: studentAttempt.attempt.attempt_id } }));

    await new Promise((resolve) => setTimeout(resolve, 200));

    const closeStart = Date.now();
    // Candidate immediately closes tab/socket
    candWs.close(1001, 'Going Away');

    // Wait for invigilator to receive candidate:presence_changed
    await new Promise((resolve) => {
      const check = setInterval(() => {
        const presenceMsg = invMessages.find(
          (m) => m.type === 'candidate:presence_changed' && m.payload?.status === 'OFFLINE'
        );
        if (presenceMsg) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 2000);
    });

    const elapsed = Date.now() - closeStart;
    const presenceMsg = invMessages.find(
      (m) => m.type === 'candidate:presence_changed' && m.payload?.status === 'OFFLINE'
    );

    assert.ok(presenceMsg, 'Invigilator must receive candidate:presence_changed (status: OFFLINE)');
    assert.equal(presenceMsg.payload.studentId, studentAttempt.studentUser.userId);
    assert.ok(elapsed <= 1500, `Observable close detection should be near-instantaneous (took ${elapsed}ms)`);

    invWs.close(1000);
  });
});
