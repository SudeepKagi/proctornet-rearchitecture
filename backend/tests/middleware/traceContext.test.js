import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import {
  parseTraceparent,
  generateTraceparent,
  createChildSpanId,
  isValidTraceId,
  isValidSpanId
} from '../../src/utils/traceContext.js';
import { closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { closeRabbitMQ } from '../../src/infrastructure/rabbitmq/client.js';

describe('W3C Trace Context & Correlation Middleware', () => {
  after(async () => {
    await closeRabbitMQ();
    await closeRedis();
    await closePool();
  });

  describe('traceContext.js Unit Tests', () => {
    it('should parse valid W3C traceparent correctly', () => {
      const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      const parentId = '00f067aa0ba902b7';
      const header = `00-${traceId}-${parentId}-01`;

      const parsed = parseTraceparent(header);
      assert.ok(parsed);
      assert.equal(parsed.version, '00');
      assert.equal(parsed.traceId, traceId);
      assert.equal(parsed.parentId, parentId);
      assert.equal(parsed.traceFlags, '01');
    });

    it('should reject non-00 versions', () => {
      const header = 'ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      assert.equal(parseTraceparent(header), null);
    });

    it('should reject all-zero traceId or parentId', () => {
      const zeroTrace = '00-00000000000000000000000000000000-00f067aa0ba902b7-01';
      assert.equal(parseTraceparent(zeroTrace), null);

      const zeroSpan = '00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01';
      assert.equal(parseTraceparent(zeroSpan), null);
    });

    it('should reject invalid lengths or non-hex characters', () => {
      assert.equal(parseTraceparent('00-xyz-123-01'), null);
      assert.equal(parseTraceparent('not-a-traceparent'), null);
      assert.equal(parseTraceparent(''), null);
      assert.equal(parseTraceparent(null), null);
      assert.equal(parseTraceparent(undefined), null);
    });

    it('should generate valid W3C traceparent strings', () => {
      const traceparent = generateTraceparent();
      assert.match(traceparent, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
      const parsed = parseTraceparent(traceparent);
      assert.ok(parsed);
      assert.ok(isValidTraceId(parsed.traceId));
      assert.ok(isValidSpanId(parsed.spanId));
    });

    it('should create valid 16-hex character child span IDs', () => {
      const spanId = createChildSpanId();
      assert.equal(spanId.length, 16);
      assert.match(spanId, /^[0-9a-f]{16}$/);
      assert.ok(isValidSpanId(spanId));
      assert.notEqual(spanId, '0000000000000000');
    });
  });

  describe('HTTP Ingress Trace Context Middleware', () => {
    it('should emit X-Request-ID and traceparent in response headers when missing', async () => {
      const res = await request(app).get('/health');
      assert.equal(res.status, 200);

      const requestId = res.headers['x-request-id'];
      const traceparent = res.headers['traceparent'];

      assert.ok(requestId, 'Response should contain X-Request-ID');
      assert.ok(traceparent, 'Response should contain traceparent');
      assert.match(traceparent, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    });

    it('should propagate incoming traceId with a new child spanId', async () => {
      const incomingTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      const incomingSpanId = '00f067aa0ba902b7';
      const incomingTraceparent = `00-${incomingTraceId}-${incomingSpanId}-01`;

      const res = await request(app)
        .get('/health')
        .set('traceparent', incomingTraceparent);

      assert.equal(res.status, 200);
      const responseTraceparent = res.headers['traceparent'];
      assert.ok(responseTraceparent);

      const parsed = parseTraceparent(responseTraceparent);
      assert.ok(parsed);
      assert.equal(parsed.traceId, incomingTraceId, 'Should preserve incoming traceId');
      assert.notEqual(parsed.spanId, incomingSpanId, 'Should generate new child spanId');
    });

    it('should recover gracefully when incoming traceparent is corrupted', async () => {
      const res = await request(app)
        .get('/health')
        .set('traceparent', 'corrupted-and-invalid-header');

      assert.equal(res.status, 200);
      const responseTraceparent = res.headers['traceparent'];
      assert.ok(responseTraceparent);
      assert.match(
        responseTraceparent,
        /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/,
        'Should fall back to valid fresh traceparent'
      );
    });
  });
});
