import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../../../src/app.js';
import { generateAccessToken } from '../../../src/modules/auth/token.service.js';
import { setSessionRevocationChecker, resetSessionRevocationChecker } from '../../../src/middleware/authenticate.js';
import { logBuffer } from '../../../src/modules/developer/logBuffer.js';
import * as incidentService from '../../../src/modules/developer/incidentService.js';

import { checkDatabaseHealth, query, closePool } from '../../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../../src/infrastructure/redis/index.js';
import { closeRabbitMQ } from '../../../src/infrastructure/rabbitmq/client.js';

describe('Developer Operations API Integration', () => {
  let developerUserId = randomUUID();
  let studentUserId = randomUUID();
  let facultyUserId = randomUUID();

  let devToken;
  let studentToken;
  let facultyToken;

  before(async () => {
    setSessionRevocationChecker(async () => ({ is_revoked: false }));

    const health = await checkDatabaseHealth(1000);
    if (health.healthy) {
      const devRes = await query(`
        INSERT INTO users (email, password_hash, name, status)
        VALUES ('dev_phase27@test.com', 'hash', 'Developer Phase 27', 'ACTIVE')
        ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
        RETURNING user_id;
      `);
      developerUserId = devRes.rows[0].user_id;
      await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'DEVELOPER') ON CONFLICT DO NOTHING`, [developerUserId]);

      const stuRes = await query(`
        INSERT INTO users (email, password_hash, name, status)
        VALUES ('stu_phase27@test.com', 'hash', 'Student Phase 27', 'ACTIVE')
        ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
        RETURNING user_id;
      `);
      studentUserId = stuRes.rows[0].user_id;
      await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT') ON CONFLICT DO NOTHING`, [studentUserId]);

      const facRes = await query(`
        INSERT INTO users (email, password_hash, name, status)
        VALUES ('fac_phase27@test.com', 'hash', 'Faculty Phase 27', 'ACTIVE')
        ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
        RETURNING user_id;
      `);
      facultyUserId = facRes.rows[0].user_id;
      await query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY') ON CONFLICT DO NOTHING`, [facultyUserId]);
    }

    devToken = generateAccessToken({
      userId: developerUserId,
      roles: ['DEVELOPER'],
      sessionId: randomUUID()
    });

    studentToken = generateAccessToken({
      userId: studentUserId,
      roles: ['STUDENT'],
      sessionId: randomUUID()
    });

    facultyToken = generateAccessToken({
      userId: facultyUserId,
      roles: ['FACULTY'],
      sessionId: randomUUID()
    });

    // Populate logBuffer with sample entries
    logBuffer.addEntry({
      level: 'info',
      msg: 'Server startup sequence complete',
      service: 'proctornet-backend'
    });
    logBuffer.addEntry({
      level: 'error',
      msg: 'Sample network timeout warning',
      service: 'proctornet-backend',
      traceId: 'tr-sample-123'
    });
  });

  describe('RBAC & Role Isolation', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/developer/overview');
      assert.equal(res.status, 401);
    });

    it('rejects STUDENT role with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/developer/overview')
        .set('Authorization', `Bearer ${studentToken}`);
      assert.equal(res.status, 403);
    });

    it('rejects FACULTY role with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/developer/health')
        .set('Authorization', `Bearer ${facultyToken}`);
      assert.equal(res.status, 403);
    });

    it('allows DEVELOPER role access to /api/v1/developer/overview', async () => {
      const res = await request(app)
        .get('/api/v1/developer/overview')
        .set('Authorization', `Bearer ${devToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.service, 'proctornet-backend');
      assert.ok(res.body.data.healthSummary);
      assert.equal(res.body.data.managementPlane.wireguardSubnet, '10.100.0.0/24');
    });

    it('strictly DENIES DEVELOPER role from accessing candidate PII / admin verifications', async () => {
      const res = await request(app)
        .get('/api/v1/admin/verifications')
        .set('Authorization', `Bearer ${devToken}`);

      assert.equal(res.status, 403);
    });
  });

  describe('Developer Health Probes', () => {
    it('returns full 13-subsystem health matrix', async () => {
      const res = await request(app)
        .get('/api/v1/developer/health?refresh=true')
        .set('Authorization', `Bearer ${devToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.totalSubsystems, 13);
      assert.ok(res.body.data.subsystems.node_api);
      assert.ok(res.body.data.subsystems.postgres_primary);
      assert.ok(res.body.data.subsystems.wireguard);
    });

    it('returns individual subsystem health probe', async () => {
      const res = await request(app)
        .get('/api/v1/developer/health/postgres_primary')
        .set('Authorization', `Bearer ${devToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.component, 'postgres_primary');
      assert.ok(['UP', 'DOWN'].includes(res.body.data.status));
    });

    it('returns 400 for unknown component probe', async () => {
      const res = await request(app)
        .get('/api/v1/developer/health/unknown_subsystem')
        .set('Authorization', `Bearer ${devToken}`);

      assert.equal(res.status, 400);
    });
  });

  describe('Developer Logs', () => {
    it('queries in-memory log stream with sub-second latency', async () => {
      const start = Date.now();
      const res = await request(app)
        .get('/api/v1/developer/logs?level=error')
        .set('Authorization', `Bearer ${devToken}`);

      const elapsed = Date.now() - start;
      assert.ok(elapsed < 1000); // Sub-second requirement
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.logs.length >= 1);
      assert.equal(res.body.data.logs[0].level, 'error');
    });

    it('filters logs by traceId', async () => {
      const res = await request(app)
        .get('/api/v1/developer/logs?traceId=tr-sample-123')
        .set('Authorization', `Bearer ${devToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.logs.length, 1);
      assert.equal(res.body.data.logs[0].traceId, 'tr-sample-123');
    });
  });

  describe('Developer Topology', () => {
    it('returns live infrastructure nodes and dependency edges', async () => {
      const res = await request(app)
        .get('/api/v1/developer/topology')
        .set('Authorization', `Bearer ${devToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.nodes.length >= 10);
      assert.ok(res.body.data.edges.length >= 10);

      // Assert presence of canonical WireGuard gateway node
      const wgNode = res.body.data.nodes.find((n) => n.id === 'wireguard');
      assert.ok(wgNode);
      assert.equal(wgNode.subnet, '10.100.0.0/24');
    });
  });

  describe('Incident Triage & Lifecycle', () => {
    let incidentId;

    it('triggers a technical incident and lists it', async () => {
      const inc = await incidentService.triggerIncident({
        component: 'redis',
        severity: 'HIGH',
        message: 'Redis connection latency spike detected',
        actorId: developerUserId
      });
      incidentId = inc.id;

      const res = await request(app)
        .get('/api/v1/developer/incidents?status=TRIGGERED')
        .set('Authorization', `Bearer ${devToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.data.incidents.some((i) => i.id === incidentId));
    });

    it('acknowledges the incident', async () => {
      const res = await request(app)
        .post(`/api/v1/developer/incidents/${incidentId}/acknowledge`)
        .set('Authorization', `Bearer ${devToken}`)
        .send({ notes: 'Investigating Redis memory and connection pool' });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.incident.status, 'ACKNOWLEDGED');
      assert.equal(res.body.data.incident.acknowledgedBy, developerUserId);
    });

    it('resolves the incident', async () => {
      const res = await request(app)
        .post(`/api/v1/developer/incidents/${incidentId}/resolve`)
        .set('Authorization', `Bearer ${devToken}`)
        .send({ notes: 'Evicted stale keys; latency normalized' });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.incident.status, 'RESOLVED');
      assert.equal(res.body.data.incident.resolvedBy, developerUserId);
    });
  });

  after(async () => {
    resetSessionRevocationChecker();
    await closePool().catch(() => {});
    await closeRedis().catch(() => {});
    await closeRabbitMQ().catch(() => {});
  });
});
