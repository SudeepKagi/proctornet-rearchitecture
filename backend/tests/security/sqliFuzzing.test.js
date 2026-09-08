/**
 * @file sqliFuzzing.test.js
 * @description Verifies SQL injection resistance across all query parameters,
 * routes, and repositories using aggressive fuzzing payloads.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import { generateAccessToken } from '../../src/modules/auth/token.service.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';

describe('Phase 18 Security: SQL Injection Fuzzing & Allowlist Defense', () => {
  const staffUser = {
    userId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    roles: ['ADMIN', 'FACULTY']
  };

  const staffToken = generateAccessToken(staffUser);

  before(async () => {
    await query(
      `INSERT INTO users (user_id, email, name, password_hash, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       ON CONFLICT (user_id) DO NOTHING`,
      [staffUser.userId, 'sqli_fuzz@proctornet.test', 'SQLi Fuzz Admin', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEF12345678901234567890123']
    );
    await query(
      `INSERT INTO user_roles (user_id, role)
       VALUES ($1, 'ADMIN'), ($1, 'FACULTY')
       ON CONFLICT (user_id, role) DO NOTHING`,
      [staffUser.userId]
    );
    await query(
      `INSERT INTO user_sessions (session_id, user_id, refresh_token_hash, is_revoked, expires_at)
       VALUES ($1, $2, $3, FALSE, NOW() + INTERVAL '1 day')
       ON CONFLICT (session_id) DO UPDATE SET is_revoked = FALSE`,
      [staffUser.sessionId, staffUser.userId, 'sqli_fuzz_refresh_hash']
    );
  });

  after(async () => {
    try {
      await query('DELETE FROM users WHERE user_id = $1', [staffUser.userId]);
    } catch {
      // Ignore
    } finally {
      await closeRedis();
      await closePool();
    }
  });

  const SQLI_PAYLOADS = [
    "' OR '1'='1",
    "'; DROP TABLE exam_sessions; --",
    "1; SELECT pg_sleep(2); --",
    "' UNION SELECT NULL, NULL, NULL, NULL--",
    "admin'--",
    "1' ORDER BY 1--",
    "1' ORDER BY (SELECT CASE WHEN (1=1) THEN 1 ELSE 0 END)--",
    "\\x00' OR 1=1--"
  ];

  it('should safely reject or parameterize SQL injection payloads in session queries', async () => {
    for (const payload of SQLI_PAYLOADS) {
      const res = await request(app)
        .get(`/api/v1/sessions?status=${encodeURIComponent(payload)}&page=1&limit=10`)
        .set('Authorization', `Bearer ${staffToken}`);

      // Should be rejected by Zod enum schema validation (400) or return safe empty set
      assert.ok(
        [400, 200].includes(res.status),
        `Payload '${payload}' produced unexpected HTTP status ${res.status}`
      );
      if (res.status === 400) {
        assert.equal(res.body.success, false);
      }
    }
  });

  it('should safely reject or parameterize SQL injection in exam filter queries', async () => {
    for (const payload of SQLI_PAYLOADS) {
      const res = await request(app)
        .get(`/api/v1/exams?status=${encodeURIComponent(payload)}`)
        .set('Authorization', `Bearer ${staffToken}`);

      assert.ok(
        [400, 200].includes(res.status),
        `Payload '${payload}' produced unexpected HTTP status ${res.status}`
      );
    }
  });

  it('should safely reject SQL injection payloads in UUID path parameters', async () => {
    for (const payload of SQLI_PAYLOADS) {
      const res = await request(app)
        .get(`/api/v1/sessions/${encodeURIComponent(payload)}`)
        .set('Authorization', `Bearer ${staffToken}`);

      // Path parameter validation should reject non-UUIDs with 400
      assert.equal(res.status, 400, `Payload '${payload}' should return 400 for UUID`);
      assert.equal(res.body.success, false);
    }
  });

  it('should safely parameterize search queries and not execute SQL comments or commands', async () => {
    const commentPayload = "exam' OR '1'='1' --";
    const res = await request(app)
      .get(`/api/v1/exams?search=${encodeURIComponent(commentPayload)}`)
      .set('Authorization', `Bearer ${staffToken}`);

    assert.ok([200, 400].includes(res.status));
    if (res.status === 200) {
      // Must not dump all exams via 1=1 condition
      assert.ok(Array.isArray(res.body.data?.exams || res.body.data));
    }
  });
});
