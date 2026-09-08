/**
 * @file iceService.test.js
 * @description Unit tests for Phase 17 ICE/TURN credential service.
 * Verifies STUN fallback, HMAC-SHA1 Coturn ephemeral credentials, and production failure modes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getIceServersForSession } from '../../src/infrastructure/media/iceService.js';

describe('Phase 17 — ICE / TURN Service Unit Tests', () => {
  it('returns STUN server configuration in development when TURN is unconfigured', () => {
    const mockConfig = {
      STUN_SERVER_URL: 'stun:stun.l.google.com:19302',
      TURN_SERVER_URL: undefined,
      TURN_STATIC_AUTH_SECRET: undefined,
      NODE_ENV: 'development',
      MEDIA_ENABLED: true
    };

    const result = getIceServersForSession('session-123', { userId: 'user-abc', roles: ['STUDENT'] }, mockConfig);
    assert.ok(Array.isArray(result.iceServers));
    assert.equal(result.iceServers.length, 1);
    assert.ok(result.iceServers[0].urls.includes(mockConfig.STUN_SERVER_URL));
    assert.equal(result.iceServers[0].username, undefined);
    assert.equal(result.iceServers[0].credential, undefined);
  });

  it('generates valid ephemeral HMAC-SHA1 credentials when TURN is configured', () => {
    const mockConfig = {
      STUN_SERVER_URL: 'stun:stun.l.google.com:19302',
      TURN_SERVER_URL: 'turn:turn.proctornet.test:3478?transport=udp',
      TURN_STATIC_AUTH_SECRET: 'test-secret-key-1234567890abcdef',
      TURN_CREDENTIAL_TTL_SEC: 600,
      NODE_ENV: 'development',
      MEDIA_ENABLED: true
    };

    const userId = 'student-test-uuid-456';
    const beforeTimestamp = Math.floor(Date.now() / 1000) + 600;

    const result = getIceServersForSession('session-xyz', { userId, roles: ['STUDENT'] }, mockConfig);
    assert.equal(result.iceServers.length, 2);

    const turnServer = result.iceServers[1];
    assert.ok(turnServer.urls.includes(mockConfig.TURN_SERVER_URL));
    assert.ok(turnServer.username);
    assert.ok(turnServer.credential);

    // Verify username format: <expiryTimestamp>:<userId>
    const [expiryStr, parsedUserId] = turnServer.username.split(':');
    assert.equal(parsedUserId, userId);
    const expiry = parseInt(expiryStr, 10);
    assert.ok(expiry >= beforeTimestamp - 1 && expiry <= beforeTimestamp + 2);

    // Verify HMAC-SHA1 credential
    const hmac = crypto.createHmac('sha1', mockConfig.TURN_STATIC_AUTH_SECRET);
    hmac.update(turnServer.username);
    const expectedCred = hmac.digest('base64');
    assert.equal(turnServer.credential, expectedCred);
  });

  it('defaults to 900-second (15 minutes) TTL when TURN_CREDENTIAL_TTL_SEC is not explicitly provided', () => {
    const mockConfig = {
      STUN_SERVER_URL: 'stun:stun.l.google.com:19302',
      TURN_SERVER_URL: 'turn:turn.proctornet.test:3478?transport=udp',
      TURN_STATIC_AUTH_SECRET: 'test-secret-key-1234567890abcdef',
      NODE_ENV: 'development',
      MEDIA_ENABLED: true
    };

    const userId = 'student-test-uuid-default-ttl';
    const beforeTimestamp = Math.floor(Date.now() / 1000) + 900;

    const result = getIceServersForSession('session-xyz', { userId, roles: ['STUDENT'] }, mockConfig);
    assert.equal(result.iceServers.length, 2);

    const turnServer = result.iceServers[1];
    const [expiryStr, parsedUserId] = turnServer.username.split(':');
    assert.equal(parsedUserId, userId);
    const expiry = parseInt(expiryStr, 10);
    assert.ok(expiry >= beforeTimestamp - 1 && expiry <= beforeTimestamp + 2, `Expected expiry ~${beforeTimestamp}, got ${expiry}`);
  });

  it('throws RELAY_UNAVAILABLE when in production with MEDIA_ENABLED and TURN is missing', () => {
    const mockConfig = {
      STUN_SERVER_URL: 'stun:stun.l.google.com:19302',
      TURN_SERVER_URL: undefined,
      TURN_STATIC_AUTH_SECRET: undefined,
      NODE_ENV: 'production',
      MEDIA_ENABLED: true
    };

    assert.throws(
      () => {
        getIceServersForSession('session-123', { userId: 'user-abc', roles: ['STUDENT'] }, mockConfig);
      },
      (err) => {
        assert.equal(err.code, 'RELAY_UNAVAILABLE');
        return true;
      }
    );
  });
});
