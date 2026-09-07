import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import { query, closePool, checkDatabaseHealth } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { closeRabbitMQ } from '../../src/infrastructure/rabbitmq/client.js';
import * as authService from '../../src/modules/auth/auth.service.js';
import * as auditService from '../../src/modules/audit/audit.service.js';

describe('Audit Logs REST API Endpoints (Integration)', () => {
  let dbAvailable = false;
  let adminToken;
  let adminUserId;
  let studentToken;
  let facultyToken;

  before(async () => {
    const health = await checkDatabaseHealth();
    dbAvailable = health.healthy;
    if (!dbAvailable) return;

    // 1. Create Admin
    const admin = await authService.register({
      name: 'System Admin',
      email: `admin_audit_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'ADMIN')
      ON CONFLICT DO NOTHING;
    `, [admin.userId]);
    adminUserId = admin.userId;

    const adminLogin = await authService.login({
      email: admin.email,
      password: 'Password123!'
    });
    adminToken = adminLogin.accessToken;

    // 2. Create Student
    const student = await authService.register({
      name: 'Test Student',
      email: `student_audit_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    const studentLogin = await authService.login({
      email: student.email,
      password: 'Password123!'
    });
    studentToken = studentLogin.accessToken;

    // 3. Create Faculty
    const faculty = await authService.register({
      name: 'Test Faculty',
      email: `faculty_audit_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    await query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'FACULTY')
      ON CONFLICT DO NOTHING;
    `, [faculty.userId]);
    const facultyLogin = await authService.login({
      email: faculty.email,
      password: 'Password123!'
    });
    facultyToken = facultyLogin.accessToken;

    // Seed some test audit logs
    await auditService.recordAuditEvent({
      actorUserId: adminUserId,
      action: 'TEST_API_AUDIT_ACTION_1',
      resourceType: 'EXAM',
      resourceId: 'res-api-1',
      metadata: { source: 'api-test-1' }
    });

    await auditService.recordAuditEvent({
      actorUserId: adminUserId,
      action: 'TEST_API_AUDIT_ACTION_2',
      resourceType: 'SESSION',
      resourceId: 'res-api-2',
      metadata: { source: 'api-test-2' }
    });
  });

  after(async () => {
    await closeRabbitMQ();
    await closeRedis();
    await closePool();
  });

  it('should reject unauthenticated request with 401 Unauthorized', async (t) => {
    if (!dbAvailable) {
      t.skip('Database unavailable');
      return;
    }

    const res = await request(app).get('/api/v1/audit-logs');
    assert.equal(res.status, 401);
  });

  it('should reject STUDENT role with 403 Forbidden', async (t) => {
    if (!dbAvailable) {
      t.skip('Database unavailable');
      return;
    }

    const res = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(res.status, 403);
  });

  it('should reject FACULTY role with 403 Forbidden', async (t) => {
    if (!dbAvailable) {
      t.skip('Database unavailable');
      return;
    }

    const res = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${facultyToken}`);
    assert.equal(res.status, 403);
  });

  it('should allow ADMIN role with 200 and paginated envelope', async (t) => {
    if (!dbAvailable) {
      t.skip('Database unavailable');
      return;
    }

    const res = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.ok(Array.isArray(res.body.data.audit_logs));
    assert.ok(res.body.data.pagination);
    assert.equal(res.body.data.pagination.page, 1);
    assert.ok(typeof res.body.data.pagination.total === 'number');
  });

  it('should filter audit logs by action query parameter', async (t) => {
    if (!dbAvailable) {
      t.skip('Database unavailable');
      return;
    }

    const res = await request(app)
      .get('/api/v1/audit-logs?action=TEST_API_AUDIT_ACTION_1')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.audit_logs));
    assert.ok(res.body.data.audit_logs.length >= 1);
    for (const log of res.body.data.audit_logs) {
      assert.equal(log.action, 'TEST_API_AUDIT_ACTION_1');
    }
  });

  it('should enforce pagination limits', async (t) => {
    if (!dbAvailable) {
      t.skip('Database unavailable');
      return;
    }

    const res = await request(app)
      .get('/api/v1/audit-logs?limit=2&page=1')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.pagination.limit, 2);
    assert.ok(res.body.data.audit_logs.length <= 2);
  });
});
