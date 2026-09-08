import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { config } from '../src/config/env.js';

describe('Express Application Setup & Middleware', () => {
  it('should include Helmet security headers in HTTP responses', async () => {
    const res = await request(app).get('/health');

    assert.equal(res.status, 200);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(['DENY', 'SAMEORIGIN'].includes(res.headers['x-frame-options']));
    assert.ok(res.headers['content-security-policy']);
  });

  it('should handle CORS preflight requests correctly', async () => {
    const expectedOrigin = config.CORS_ORIGIN;
    const res = await request(app)
      .options('/health')
      .set('Origin', expectedOrigin)
      .set('Access-Control-Request-Method', 'GET');

    assert.equal(res.status, 204);
    assert.equal(res.headers['access-control-allow-origin'], expectedOrigin);
  });

  it('should return 404 for undefined routes using centralized error format', async () => {
    const res = await request(app).get('/undefined-route-endpoint');

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.match(res.body.error.message, /Route GET \/undefined-route-endpoint not found/);
    assert.ok(res.body.error.requestId);
  });
});
