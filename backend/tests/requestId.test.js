import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Request ID Middleware', () => {
  it('should generate a UUIDv4 request ID if none is provided in headers', async () => {
    const res = await request(app).get('/health');

    assert.equal(res.status, 200);
    const requestId = res.headers['x-request-id'];
    assert.ok(requestId, 'X-Request-ID header should be present in response');
    assert.match(
      requestId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      'Generated request ID should be a valid UUIDv4'
    );
  });

  it('should preserve and propagate a valid incoming X-Request-ID', async () => {
    const customId = 'test-client-correlation-id-12345';
    const res = await request(app)
      .get('/health')
      .set('X-Request-ID', customId);

    assert.equal(res.status, 200);
    assert.equal(res.headers['x-request-id'], customId);
  });

  it('should sanitize and replace an invalid/unsafe incoming X-Request-ID', async () => {
    const invalidId = '<script>alert(1)</script>';
    const res = await request(app)
      .get('/health')
      .set('X-Request-ID', invalidId);

    assert.equal(res.status, 200);
    const sanitizedId = res.headers['x-request-id'];
    assert.notEqual(sanitizedId, invalidId);
    assert.match(
      sanitizedId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});
