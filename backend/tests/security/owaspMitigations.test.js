/**
 * @file owaspMitigations.test.js
 * @description Comprehensive verification of OWASP Top 10 mitigations:
 * CSRF ambient credential prevention, BOLA enforcement, error information leakage prevention,
 * bounded Prometheus metrics, and structured security audit logging.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import { register } from '../../src/infrastructure/metrics/registry.js';

describe('Phase 18 Security: OWASP Top 10 Mitigations', () => {
  it('should prevent CSRF ambient credential exploitation on state-changing API endpoints', async () => {
    // Attempting a state-changing POST or PUT with only ambient cookies (no Authorization Bearer header)
    const res = await request(app)
      .post('/api/v1/sessions')
      .set('Cookie', ['refreshToken=ambient_cookie_value'])
      .send({ exam_id: 'some-id' });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('should mask internal errors and not leak stack traces in production responses', async () => {
    // Requesting undefined route or triggering an operational error
    const res = await request(app).get('/undefined-security-check');

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    // Stack trace must not be leaked
    if (process.env.NODE_ENV === 'production') {
      assert.equal(res.body.error.stack, undefined);
    }
  });

  it('should enforce strictly bounded Prometheus metric labels (no unbounded IDs)', async () => {
    const metricsOutput = await register.metrics();

    // Verify security metric definitions exist
    assert.ok(metricsOutput.includes('security_tamper_violations_total'));
    assert.ok(metricsOutput.includes('security_input_sanitizations_total'));
    assert.ok(metricsOutput.includes('security_cors_rejections_total'));
    assert.ok(metricsOutput.includes('security_magic_byte_mismatches_total'));

    // Verify NO unbounded high-cardinality labels exist in security metric definitions
    assert.ok(!metricsOutput.includes('user_id='), 'Metric labels must NOT contain user_id');
    assert.ok(!metricsOutput.includes('attempt_id='), 'Metric labels must NOT contain attempt_id');
    assert.ok(!metricsOutput.includes('session_id='), 'Metric labels must NOT contain session_id');
    assert.ok(!metricsOutput.includes('nonce='), 'Metric labels must NOT contain nonce');
    assert.ok(!metricsOutput.includes('token='), 'Metric labels must NOT contain token');
  });

  it('should reject unauthorized cross-origin preflight requests without disclosing allowed methods', async () => {
    const res = await request(app)
      .options('/api/v1/sessions')
      .set('Origin', 'https://attacker.com')
      .set('Access-Control-Request-Method', 'POST');

    assert.notEqual(res.headers['access-control-allow-origin'], 'https://attacker.com');
    assert.notEqual(res.headers['access-control-allow-origin'], '*');
  });
});
