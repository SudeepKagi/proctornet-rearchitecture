/**
 * @file websocketUnit.test.js
 * @description Unit tests for Phase 16 WebSocket control plane components:
 * schemas, token parsing, pre-upgrade rate limiting, ChannelManager reference counting,
 * and user connection limits.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  validateRoomFormat,
  parseClientCommand,
  createEventEnvelope,
  clientCommandSchema,
  eventEnvelopeSchema
} from '../../src/infrastructure/realtime/realtime.schemas.js';
import {
  extractUpgradeToken,
  checkPreUpgradeRateLimit,
  getClientIp
} from '../../src/infrastructure/realtime/websocketServer.js';
import { ChannelManager } from '../../src/infrastructure/realtime/channelManager.js';

describe('Phase 16 — WebSocket Unit Tests', () => {
  describe('Schema Validation', () => {
    it('validates correct room formats: session, session:candidate, attempt', () => {
      const validSession = `session:${randomUUID()}`;
      const validCandidate = `session:${randomUUID()}:candidate`;
      const validAttempt = `attempt:${randomUUID()}`;

      assert.equal(validateRoomFormat(validSession), true);
      assert.equal(validateRoomFormat(validCandidate), true);
      assert.equal(validateRoomFormat(validAttempt), true);
    });

    it('rejects invalid or malformed room formats', () => {
      assert.equal(validateRoomFormat('session:'), false);
      assert.equal(validateRoomFormat('session:not-a-uuid'), false);
      assert.equal(validateRoomFormat('attempt:123'), false);
      assert.equal(validateRoomFormat('admin:global'), false);
      assert.equal(validateRoomFormat('random_string'), false);
      assert.equal(validateRoomFormat(''), false);
      assert.equal(validateRoomFormat(null), false);
    });

    it('parses valid client commands: subscribe, unsubscribe, heartbeat', () => {
      const sessionId = randomUUID();
      const attemptId = randomUUID();

      const subRes = parseClientCommand({ type: 'subscribe', payload: { room: `session:${sessionId}` } });
      assert.equal(subRes.success, true);
      assert.equal(subRes.data.type, 'subscribe');
      assert.equal(subRes.data.payload.room, `session:${sessionId}`);

      const unsubRes = parseClientCommand({ type: 'unsubscribe', payload: { room: `session:${sessionId}` } });
      assert.equal(unsubRes.success, true);
      assert.equal(unsubRes.data.type, 'unsubscribe');

      const hbRes = parseClientCommand({ type: 'heartbeat', payload: { attemptId } });
      assert.equal(hbRes.success, true);
      assert.equal(hbRes.data.type, 'heartbeat');
      assert.equal(hbRes.data.payload.attemptId, attemptId);
    });

    it('rejects malformed client commands with descriptive error', () => {
      assert.equal(parseClientCommand({ type: 'unknown_cmd' }).success, false);
      assert.equal(parseClientCommand({ type: 'subscribe' }).success, false);
      assert.equal(parseClientCommand({ type: 'heartbeat', payload: { attemptId: 'not-a-uuid' } }).success, false);
      assert.equal(parseClientCommand('{invalid-json').success, false);
    });

    it('creates and validates standardized event envelopes', () => {
      const envelope = createEventEnvelope({
        type: 'proctoring:risk_score_updated',
        room: `session:${randomUUID()}`,
        payload: { studentId: randomUUID(), riskScore: 75 }
      });

      assert.ok(envelope.eventId);
      assert.equal(envelope.type, 'proctoring:risk_score_updated');
      assert.equal(envelope.version, '1.0');
      assert.ok(envelope.timestamp);
      assert.equal(envelope.payload.riskScore, 75);

      const parsed = eventEnvelopeSchema.safeParse(envelope);
      assert.equal(parsed.success, true);
    });
  });

  describe('Handshake Token Extraction & Redaction', () => {
    it('extracts token from Sec-WebSocket-Protocol header without touching URL', () => {
      const token = 'header.jwt.token';
      const req = {
        url: '/ws',
        headers: {
          'sec-websocket-protocol': `proctornet, ${token}`
        }
      };

      const extracted = extractUpgradeToken(req);
      assert.deepEqual(extracted, { token, isSubprotocol: true });
      assert.equal(req.url, '/ws');
    });

    it('extracts token from query fallback and immediately redacts it from req.url', () => {
      const token = 'query.jwt.token';
      const req = {
        url: `/ws?token=${token}&debug=true`,
        headers: {}
      };

      const extracted = extractUpgradeToken(req);
      assert.equal(extracted.token, token);
      assert.equal(extracted.isSubprotocol, false);
      assert.ok(!req.url.includes(token), 'Raw JWT must be redacted from req.url');
      assert.ok(req.url.includes('token=%5BREDACTED%5D') || req.url.includes('token=[REDACTED]'));
    });

    it('returns null when no authentication token is present', () => {
      const req = {
        url: '/ws',
        headers: {}
      };
      assert.equal(extractUpgradeToken(req), null);
    });

    it('resolves source IP correctly using x-forwarded-for or remoteAddress', () => {
      const req1 = {
        headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
        socket: { remoteAddress: '10.0.0.1' }
      };
      assert.equal(getClientIp(req1), '70.41.3.18');

      const req2 = {
        headers: {},
        socket: { remoteAddress: '192.168.1.50' }
      };
      assert.equal(getClientIp(req2), '192.168.1.50');
    });
  });

  describe('Pre-Upgrade IP Rate Limiting', () => {
    it('allows up to 30 upgrade attempts per minute and blocks the 31st', () => {
      const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;

      for (let i = 0; i < 30; i++) {
        const allowed = checkPreUpgradeRateLimit(testIp);
        assert.equal(allowed, true, `Attempt ${i + 1} should be allowed`);
      }

      // 31st attempt must be rejected
      const blocked = checkPreUpgradeRateLimit(testIp);
      assert.equal(blocked, false, '31st attempt within 1 minute must be blocked');
    });
  });

  describe('ChannelManager Reference Counting & Connection Limits', () => {
    let channelManager;

    beforeEach(() => {
      channelManager = new ChannelManager();
    });

    it('tracks room subscriptions and cleans up on unsubscription', () => {
      const mockWs = { readyState: 1, send: () => {}, close: () => {} };
      const room = `session:${randomUUID()}`;

      channelManager.registerConnection(mockWs, { connectionId: 'c1', userId: 'u1', roles: ['INVIGILATOR'] });

      channelManager.subscribe(mockWs, room);
      assert.equal(channelManager.getSubscribers(room).has(mockWs), true);
      assert.equal(channelManager.getRoomsForSocket(mockWs).has(room), true);

      channelManager.unsubscribe(mockWs, room);
      assert.equal(channelManager.getSubscribers(room).has(mockWs), false);
      assert.equal(channelManager.getRoomsForSocket(mockWs).has(room), false);
    });

    it('enforces maximum 3 connections per user and terminates oldest connection', () => {
      const userId = randomUUID();
      const closedSockets = [];

      const createMockSocket = (id) => ({
        id,
        readyState: 1,
        send: () => {},
        close: (code, reason) => {
          closedSockets.push({ id, code, reason });
        }
      });

      const ws1 = createMockSocket('s1');
      const ws2 = createMockSocket('s2');
      const ws3 = createMockSocket('s3');
      const ws4 = createMockSocket('s4');

      channelManager.registerConnection(ws1, { connectionId: 'c1', userId, roles: ['STUDENT'] });
      channelManager.registerConnection(ws2, { connectionId: 'c2', userId, roles: ['STUDENT'] });
      channelManager.registerConnection(ws3, { connectionId: 'c3', userId, roles: ['STUDENT'] });

      assert.equal(channelManager.getUserSockets(userId).length, 3);
      assert.equal(closedSockets.length, 0);

      // Registering 4th connection for same user must close the oldest (ws1)
      channelManager.registerConnection(ws4, { connectionId: 'c4', userId, roles: ['STUDENT'] });

      assert.equal(closedSockets.length, 1);
      assert.equal(closedSockets[0].id, 's1');
      assert.equal(closedSockets[0].code, 4429);
      assert.equal(channelManager.getUserSockets(userId).length, 3);
    });

    it('removes socket completely from all indexes upon removeConnection', () => {
      const mockWs = { readyState: 1, send: () => {}, close: () => {} };
      const room1 = `session:${randomUUID()}`;
      const room2 = `session:${randomUUID()}`;

      channelManager.registerConnection(mockWs, { connectionId: 'c1', userId: 'u1', roles: ['INVIGILATOR'] });
      channelManager.subscribe(mockWs, room1);
      channelManager.subscribe(mockWs, room2);

      assert.equal(channelManager.getConnectionCount(), 1);
      assert.equal(channelManager.getSubscribers(room1).size, 1);

      channelManager.removeConnection(mockWs);

      assert.equal(channelManager.getConnectionCount(), 0);
      assert.equal(channelManager.getSubscribers(room1).size, 0);
      assert.equal(channelManager.getSubscribers(room2).size, 0);
    });
  });
});
