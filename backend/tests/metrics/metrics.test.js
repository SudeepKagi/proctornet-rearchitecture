import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import { register, getMetrics, getContentType } from '../../src/infrastructure/metrics/registry.js';
import { normalizeRoute } from '../../src/middleware/metricsMiddleware.js';
import { config } from '../../src/config/env.js';
import { closePool, getPool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { closeRabbitMQ } from '../../src/infrastructure/rabbitmq/client.js';

describe('Prometheus Metrics & Route Normalization', () => {
  after(async () => {
    await closeRabbitMQ();
    await closeRedis();
    await closePool();
  });

  describe('Route Normalization', () => {
    it('should normalize UUIDs into :id parameter tokens', () => {
      const rawPath = '/api/v1/attempts/123e4567-e89b-12d3-a456-426614174000/answers';
      const normalized = normalizeRoute(rawPath);
      assert.equal(normalized, '/api/v1/attempts/:id/answers');
    });

    it('should normalize numeric IDs into :id parameter tokens', () => {
      const rawPath = '/api/v1/exams/42/questions';
      const normalized = normalizeRoute(rawPath);
      assert.equal(normalized, '/api/v1/exams/:id/questions');
    });

    it('should preserve static paths without tokens', () => {
      assert.equal(normalizeRoute('/health'), '/health');
      assert.equal(normalizeRoute('/ready'), '/ready');
      assert.equal(normalizeRoute('/metrics'), '/metrics');
      assert.equal(normalizeRoute('/api/v1/auth/login'), '/api/v1/auth/login');
    });

    it('should handle root and empty paths', () => {
      assert.equal(normalizeRoute('/'), '/');
      assert.equal(normalizeRoute(''), '/');
    });
  });

  describe('Metrics Registry & Collectors', () => {
    it('should produce valid Prometheus text exposition output', async () => {
      const metricsText = await getMetrics();
      assert.ok(typeof metricsText === 'string');
      assert.ok(metricsText.includes('nodejs_'));
      assert.ok(getContentType().includes('text/plain'));
    });

    it('should not contain raw UUIDs in metric label dimensions', async () => {
      const metrics = await register.getMetricsAsJSON();
      for (const metric of metrics) {
        for (const value of metric.values || []) {
          for (const [k, v] of Object.entries(value.labels || {})) {
            assert.doesNotMatch(
              String(v),
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
              `Metric ${metric.name} label ${k} contains a raw UUID: ${v}`
            );
          }
        }
      }
    });
  });

  describe('GET /metrics Endpoint', () => {
    it('should return 200 with Prometheus text output and proper content-type', async () => {
      const res = await request(app).get('/metrics');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('http_request_duration_seconds'));
      assert.match(res.headers['content-type'], /text\/plain/);
    });

    it('should not execute synchronous database queries during /metrics scrape', async () => {
      const pool = getPool();
      let queryIntercepted = false;

      const originalQuery = pool.query;
      pool.query = function (...args) {
        queryIntercepted = true;
        return originalQuery.apply(this, args);
      };

      try {
        const res = await request(app).get('/metrics');
        assert.equal(res.status, 200);
        assert.equal(queryIntercepted, false, '/metrics scrape must NOT execute synchronous database queries');
      } finally {
        pool.query = originalQuery;
      }
    });

    it('should enforce METRICS_AUTH_TOKEN when configured', async () => {
      const originalEnvToken = process.env.METRICS_AUTH_TOKEN;
      try {
        process.env.METRICS_AUTH_TOKEN = 'secret-metrics-token-123';

        // 1. Scrape without token -> 401
        const resUnauthorized = await request(app).get('/metrics');
        assert.equal(resUnauthorized.status, 401);

        // 2. Scrape with invalid token -> 401
        const resWrongToken = await request(app)
          .get('/metrics')
          .set('Authorization', 'Bearer wrong-token');
        assert.equal(resWrongToken.status, 401);

        // 3. Scrape with valid Bearer token -> 200
        const resBearer = await request(app)
          .get('/metrics')
          .set('Authorization', 'Bearer secret-metrics-token-123');
        assert.equal(resBearer.status, 200);

        // 4. Scrape with valid query token -> 200
        const resQuery = await request(app).get('/metrics?token=secret-metrics-token-123');
        assert.equal(resQuery.status, 200);
      } finally {
        if (originalEnvToken !== undefined) {
          process.env.METRICS_AUTH_TOKEN = originalEnvToken;
        } else {
          delete process.env.METRICS_AUTH_TOKEN;
        }
      }
    });
  });
});
