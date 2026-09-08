/**
 * @file corsPolicy.test.js
 * @description Verifies CORS allowlist enforcement, origin reflection prevention, and preflight behavior.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import { config } from '../../src/config/env.js';

describe('Phase 18 Security: Strict CORS Allowlist Policy', () => {
  it('should allow requests from whitelisted origins with credentials enabled', async () => {
    const allowedOrigin = config.CORS_ALLOWED_ORIGINS?.[0] || config.CORS_ORIGIN || 'http://localhost:5173';

    const res = await request(app)
      .get('/health')
      .set('Origin', allowedOrigin);

    assert.equal(res.status, 200);
    assert.equal(res.headers['access-control-allow-origin'], allowedOrigin);
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
  });

  it('should reject requests from untrusted/unauthorized origins', async () => {
    const untrustedOrigin = 'https://malicious-attacker.evil.com';

    const res = await request(app)
      .get('/health')
      .set('Origin', untrustedOrigin);

    // Should NOT reflect the malicious origin
    assert.notEqual(res.headers['access-control-allow-origin'], untrustedOrigin);
    assert.notEqual(res.headers['access-control-allow-origin'], '*');
  });

  it('should handle preflight OPTIONS requests for allowed origins', async () => {
    const allowedOrigin = config.CORS_ALLOWED_ORIGINS?.[0] || config.CORS_ORIGIN || 'http://localhost:5173';

    const res = await request(app)
      .options('/health')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type,Authorization,X-Payload-Signature');

    assert.equal(res.status, 204);
    assert.equal(res.headers['access-control-allow-origin'], allowedOrigin);
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
    assert.ok(res.headers['access-control-allow-methods']);
  });

  it('should reject preflight OPTIONS requests from unauthorized origins', async () => {
    const untrustedOrigin = 'https://attacker.site';

    const res = await request(app)
      .options('/health')
      .set('Origin', untrustedOrigin)
      .set('Access-Control-Request-Method', 'POST');

    assert.notEqual(res.headers['access-control-allow-origin'], untrustedOrigin);
    assert.notEqual(res.headers['access-control-allow-origin'], '*');
  });

  it('should allow requests with no Origin header (same-origin, curl, server-to-server)', async () => {
    const res = await request(app).get('/health');

    assert.equal(res.status, 200);
    // When no Origin is sent, CORS does not attach allow-origin
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });
});
