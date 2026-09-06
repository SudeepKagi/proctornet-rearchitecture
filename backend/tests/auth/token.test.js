/**
 * @file token.test.js
 * @description Unit tests for JWT signing, verification, claims, and SHA-256 hashing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken
} from '../../src/modules/auth/token.service.js';
import { config } from '../../src/config/env.js';

describe('Token Service (JWT & Hashing)', () => {
  const testPayload = {
    userId: '99999999-9999-9999-9999-999999999999',
    roles: ['STUDENT'],
    sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  };

  describe('Access Tokens', () => {
    it('should generate and verify a valid access token with required claims', () => {
      const token = generateAccessToken(testPayload);
      assert.ok(typeof token === 'string');

      const decoded = verifyAccessToken(token);
      assert.equal(decoded.userId, testPayload.userId);
      assert.deepEqual(decoded.roles, ['STUDENT']);
      assert.equal(decoded.sessionId, testPayload.sessionId);
      assert.equal(decoded.tokenType, 'access');
      assert.equal(decoded.sub, testPayload.userId);
      assert.equal(decoded.iss, 'proctornet-auth');
    });

    it('should reject access token with invalid signature', () => {
      const forgedToken = jwt.sign(
        { userId: testPayload.userId, tokenType: 'access' },
        'wrong-secret-key-1234567890',
        { issuer: 'proctornet-auth' }
      );

      assert.throws(() => verifyAccessToken(forgedToken));
    });

    it('should reject expired access token', () => {
      const expiredToken = jwt.sign(
        { userId: testPayload.userId, tokenType: 'access' },
        config.JWT_ACCESS_SECRET,
        { expiresIn: '-1s', issuer: 'proctornet-auth' }
      );

      assert.throws(() => verifyAccessToken(expiredToken));
    });

    it('should reject when tokenType is not access', () => {
      const invalidTypeToken = jwt.sign(
        { userId: testPayload.userId, sessionId: testPayload.sessionId, tokenType: 'refresh' },
        config.JWT_ACCESS_SECRET,
        { expiresIn: '15m', issuer: 'proctornet-auth' }
      );
      assert.throws(
        () => verifyAccessToken(invalidTypeToken),
        { message: 'Invalid token type' }
      );
    });

    it('should throw when generating access token without required fields', () => {
      assert.throws(() => generateAccessToken({ roles: ['STUDENT'] }));
      assert.throws(() => generateAccessToken({ userId: 'abc' }));
    });
  });

  describe('Refresh Tokens', () => {
    it('should generate and verify a valid refresh token with unique tokenId', () => {
      const token1 = generateRefreshToken(testPayload);
      const token2 = generateRefreshToken(testPayload);
      assert.ok(typeof token1 === 'string');
      assert.ok(typeof token2 === 'string');
      assert.notEqual(token1, token2); // Guaranteed distinct

      const decoded = verifyRefreshToken(token1);
      assert.equal(decoded.userId, testPayload.userId);
      assert.equal(decoded.sessionId, testPayload.sessionId);
      assert.ok(decoded.tokenId);
      assert.equal(decoded.tokenType, 'refresh');
      assert.equal(decoded.iss, 'proctornet-auth');
    });

    it('should reject refresh token with wrong secret or expired', () => {
      const forgedToken = jwt.sign(
        { userId: testPayload.userId, tokenType: 'refresh' },
        'wrong-secret-key-1234567890',
        { issuer: 'proctornet-auth' }
      );

      assert.throws(() => verifyRefreshToken(forgedToken));
    });

    it('should reject when tokenType is not refresh', () => {
      const invalidTypeToken = jwt.sign(
        { userId: testPayload.userId, sessionId: testPayload.sessionId, tokenType: 'access' },
        config.JWT_REFRESH_SECRET,
        { expiresIn: '7d', issuer: 'proctornet-auth' }
      );
      assert.throws(
        () => verifyRefreshToken(invalidTypeToken),
        { message: 'Invalid token type' }
      );
    });
  });

  describe('Token Hashing', () => {
    it('should compute consistent deterministic SHA-256 hash', () => {
      const token = 'sample-token-string-value-12345';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);

      assert.equal(hash1, hash2);
      assert.equal(hash1.length, 64);
    });
  });
});
