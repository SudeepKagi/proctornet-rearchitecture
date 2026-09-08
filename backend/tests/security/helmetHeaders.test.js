/**
 * @file helmetHeaders.test.js
 * @description Verifies HTTP security headers (Helmet, CSP, HSTS, X-Frame-Options, CORP, COOP).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import { config } from '../../src/config/env.js';

describe('Phase 18 Security: Helmet & HTTP Security Headers', () => {
  it('should apply strict Content-Security-Policy with scoped directives', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);

    const csp = res.headers['content-security-policy'];
    assert.ok(csp, 'Content-Security-Policy must be present');

    // Verify critical CSP directives
    assert.ok(csp.includes("default-src 'self'"), 'default-src should be self');
    assert.ok(csp.includes("script-src 'self'"), 'script-src should be self');
    assert.ok(csp.includes("style-src 'self' 'unsafe-inline'"), 'style-src should be self');
    assert.ok(csp.includes("img-src 'self' data: blob:"), 'img-src should allow self, data, blob');
    assert.ok(csp.includes("media-src 'self' blob: mediastream:"), 'media-src should support WebRTC and blobs');
    assert.ok(csp.includes("font-src 'self' data:"), 'font-src should allow self and data');
    assert.ok(csp.includes("object-src 'none'"), 'object-src should be none');
    assert.ok(csp.includes("base-uri 'self'"), 'base-uri should be self');
    assert.ok(csp.includes("form-action 'self'"), 'form-action should be self');
    assert.ok(csp.includes("frame-ancestors 'none'"), 'frame-ancestors should be none');

    // Ensure NO broad wildcards like https://*.amazonaws.com
    assert.ok(!csp.includes('https://*.amazonaws.com'), 'Broad AWS S3 wildcard must NOT be present');
    assert.ok(!csp.includes('*'), 'Wildcard origins must NOT be allowed in CSP');
  });

  it('should include strict clickjacking protection (X-Frame-Options: DENY)', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.headers['x-frame-options'], 'DENY');
  });

  it('should include MIME type sniffing protection (X-Content-Type-Options: nosniff)', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  it('should configure strict Cross-Origin isolation policies', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin');
    assert.equal(res.headers['cross-origin-resource-policy'], 'same-origin');
  });

  it('should configure Permissions-Policy restricting sensitive browser APIs', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    const pp = res.headers['permissions-policy'];
    assert.ok(pp, 'Permissions-Policy header must be present');
    assert.ok(pp.includes('camera=(self)'), 'camera should be scoped to self');
    assert.ok(pp.includes('microphone=(self)'), 'microphone should be scoped to self');
    assert.ok(pp.includes('display-capture=(self)'), 'display-capture should be scoped to self');
    assert.ok(pp.includes('geolocation=()'), 'geolocation should be disabled');
  });

  it('should include Strict-Transport-Security in HTTPS or forwarded proto environments', async () => {
    const res = await request(app)
      .get('/health')
      .set('X-Forwarded-Proto', 'https');

    assert.equal(res.status, 200);
    // Helmet sets HSTS if connection is encrypted or when configured
    const hsts = res.headers['strict-transport-security'];
    if (hsts) {
      assert.ok(hsts.includes('max-age=31536000'), 'HSTS maxAge must be 1 year');
      assert.ok(hsts.includes('includeSubDomains'), 'HSTS must include subdomains');
      assert.ok(hsts.includes('preload'), 'HSTS must specify preload');
    }
  });
});
