import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { closePool } from '../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../src/infrastructure/redis/client.js';

describe('Health and Readiness Endpoints', () => {
  after(async () => {
    await closeRedis();
    await closePool();
  });
  describe('GET /health (Liveness Probe)', () => {
    it('should return 200 with status UP and uptime info', async () => {
      const res = await request(app).get('/health');

      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'UP');
      assert.equal(res.body.service, 'proctornet-backend');
      assert.ok(typeof res.body.uptimeSeconds === 'number');
      assert.ok(res.body.timestamp);
    });
  });

  describe('GET /ready (Readiness Probe)', () => {
    it('should return a readiness response with database checks', async () => {
      const res = await request(app).get('/ready');

      // In local testing without active DB, it should return 503 NOT_READY cleanly
      // Or 200 READY if DB happens to be running
      assert.ok([200, 503].includes(res.status));
      assert.ok(['READY', 'NOT_READY'].includes(res.body.status));
      assert.ok(res.body.checks);
      assert.ok(res.body.checks.database);
    });
  });

  describe('GET /api/v1 (API Base)', () => {
    it('should return 200 with active status', async () => {
      const res = await request(app).get('/api/v1');

      assert.equal(res.status, 200);
      assert.equal(res.body.name, 'ProctorNet API');
      assert.equal(res.body.version, 'v1');
      assert.equal(res.body.status, 'ACTIVE');
    });
  });
});
