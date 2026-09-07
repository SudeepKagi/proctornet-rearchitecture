/**
 * @file authApi.test.js
 * @description Integration tests for Auth REST API endpoints including rotation, abuse rate limiter, and role security.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { app } from '../../src/app.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { getRedisClient, closeRedis } from '../../src/infrastructure/redis/client.js';
import { resetRateLimits } from '../../src/middleware/authRateLimiter.js';

describe('Auth REST API Endpoints (Integration)', () => {
  const testEmail = `api_student_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  let accessToken;
  let refreshTokenCookie;
  let userId;

  before(() => {
    resetRateLimits();
  });

  after(async () => {
    resetRateLimits();
    try {
      if (userId) {
        await query('DELETE FROM users WHERE user_id = $1', [userId]);
      }
    } catch {
      // Ignore cleanup error
    } finally {
      await closeRedis();
      await closePool();
    }
  });

  it('POST /api/v1/auth/register — should register a new student user and return 201', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'API Test Student',
        email: testEmail,
        password: testPassword,
        student_profile: {
          enrollment_number: `API_ENR_${Date.now()}`,
          department: 'Information Science',
          semester: 6
        }
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.data.user.userId);
    assert.equal(res.body.data.user.email, testEmail.toLowerCase());
    assert.deepEqual(res.body.data.user.roles, ['STUDENT']);
    assert.equal(res.body.data.user.password_hash, undefined);

    userId = res.body.data.user.userId;
  });

  it('POST /api/v1/auth/register — should strip malicious role: ADMIN payload and register as STUDENT', async () => {
    const maliciousEmail = `api_malicious_${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Privilege Escalation Attacker',
        email: maliciousEmail,
        password: 'Password123!',
        role: 'ADMIN',
        roles: ['ADMIN'],
        status: 'ACTIVE'
      });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body.data.user.roles, ['STUDENT']);

    // Cleanup
    await query('DELETE FROM users WHERE user_id = $1', [res.body.data.user.userId]);
  });

  it('POST /api/v1/auth/register — should reject malformed payload with 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'invalid-email',
        password: 'short'
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'BAD_REQUEST');
  });

  it('POST /api/v1/auth/login — should log in user, return access token and set HttpOnly refresh cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: testPassword
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.data.accessToken);
    assert.equal(res.body.data.user.email, testEmail.toLowerCase());

    accessToken = res.body.data.accessToken;

    // Verify Set-Cookie header contains HttpOnly refreshToken
    const cookies = res.headers['set-cookie'];
    assert.ok(Array.isArray(cookies) && cookies.length > 0);
    const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
    assert.ok(refreshCookie);
    assert.ok(refreshCookie.includes('HttpOnly'));
    assert.ok(refreshCookie.includes('SameSite=Strict'));

    refreshTokenCookie = refreshCookie.split(';')[0];
  });

  it('POST /api/v1/auth/login — should return 401 with generic message on wrong password (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: 'WrongPassword999'
      });

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
    assert.equal(res.body.error.message, 'Invalid email or password');
  });

  it('GET /api/v1/auth/me — should return authenticated user profile with Bearer token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.user.userId, userId);
    assert.equal(res.body.data.user.email, testEmail.toLowerCase());
  });

  it('GET /api/v1/auth/me — should return 401 without Authorization header', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('POST /api/v1/auth/refresh — should refresh access token with rotation and issue new cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [refreshTokenCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.data.accessToken);
    assert.equal(res.body.data.user.userId, userId);

    // Verify a new rotated cookie was sent
    const newCookies = res.headers['set-cookie'];
    assert.ok(Array.isArray(newCookies) && newCookies.length > 0);
    const newRefreshCookie = newCookies.find((c) => c.startsWith('refreshToken='));
    assert.ok(newRefreshCookie);

    const rotatedCookieVal = newRefreshCookie.split(';')[0];
    assert.notEqual(rotatedCookieVal, refreshTokenCookie);

    // Old cookie must now fail on reuse
    const oldCookieRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [refreshTokenCookie]);
    assert.equal(oldCookieRes.status, 401);

    // Save rotated cookie for next steps
    refreshTokenCookie = rotatedCookieVal;
  });

  it('POST /api/v1/auth/logout — should revoke session and clear refresh cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [refreshTokenCookie]);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');

    // Subsequent refresh with that cookie must now fail
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [refreshTokenCookie]);

    assert.equal(refreshRes.status, 401);
    assert.ok(refreshRes.body.error.message.includes('revoked'));
  });

  it('POST /api/v1/auth/login — should enforce bounded abuse rate limit after rapid attempts', async () => {
    resetRateLimits();
    const redis = getRedisClient();
    if (redis && redis.status === 'ready') {
      await redis.del('v1:ratelimit:login:::ffff:127.0.0.1');
      await redis.del('v1:ratelimit:login:127.0.0.1');
    }

    // Make 10 requests within the limit
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: testEmail, password: 'WrongPassword' });
      assert.notEqual(res.status, 429);
    }

    // 11th request trips rate limit -> 429 Too Many Requests
    const rateLimitedRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'WrongPassword' });

    assert.equal(rateLimitedRes.status, 429);
    assert.equal(rateLimitedRes.body.error.code, 'TOO_MANY_REQUESTS');
    assert.ok(rateLimitedRes.headers['retry-after']);

    resetRateLimits();
    if (redis && redis.status === 'ready') {
      await redis.del('v1:ratelimit:login:::ffff:127.0.0.1');
      await redis.del('v1:ratelimit:login:127.0.0.1');
    }
  });
});
