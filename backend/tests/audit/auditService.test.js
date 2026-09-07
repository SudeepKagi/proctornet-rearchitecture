import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordAuditEvent,
  queryAuditLogs,
  sanitizeMetadata
} from '../../src/modules/audit/audit.service.js';
import { BadRequestError, ForbiddenError } from '../../src/utils/errors.js';
import { checkDatabaseHealth, closePool, query } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { closeRabbitMQ } from '../../src/infrastructure/rabbitmq/client.js';

describe('Audit Service & Metadata Sanitization', () => {
  let dbAvailable = false;

  before(async () => {
    const health = await checkDatabaseHealth();
    dbAvailable = health.healthy;
  });

  after(async () => {
    await closeRabbitMQ();
    await closeRedis();
    await closePool();
  });

  describe('sanitizeMetadata Unit Tests', () => {
    it('should redact sensitive keys in nested objects and arrays', () => {
      const raw = {
        name: 'Test Event',
        password: 'super-secret-password',
        token: 'jwt-access-token',
        nested: {
          refreshToken: 'secret-refresh',
          normalField: 'allowed-value',
          authorization: 'Bearer token-here'
        },
        list: [
          { apiKey: 'secret-api-key', ok: 1 },
          'plain-string'
        ]
      };

      const cleaned = sanitizeMetadata(raw);

      assert.equal(cleaned.name, 'Test Event');
      assert.equal(cleaned.password, '[REDACTED]');
      assert.equal(cleaned.token, '[REDACTED]');
      assert.equal(cleaned.nested.refreshToken, '[REDACTED]');
      assert.equal(cleaned.nested.authorization, '[REDACTED]');
      assert.equal(cleaned.nested.normalField, 'allowed-value');
      assert.equal(cleaned.list[0].apiKey, '[REDACTED]');
      assert.equal(cleaned.list[0].ok, 1);
      assert.equal(cleaned.list[1], 'plain-string');
    });

    it('should handle null, undefined, and primitives gracefully', () => {
      assert.equal(sanitizeMetadata(null), null);
      assert.equal(sanitizeMetadata(undefined), undefined);
      assert.equal(sanitizeMetadata('string'), 'string');
      assert.equal(sanitizeMetadata(42), 42);
      assert.equal(sanitizeMetadata(true), true);
    });
  });

  describe('recordAuditEvent Validation', () => {
    it('should reject missing action', async () => {
      await assert.rejects(
        async () => {
          await recordAuditEvent({
            resourceType: 'EXAM',
            resourceId: 'exam-1'
          });
        },
        (err) => {
          assert.ok(err instanceof BadRequestError);
          assert.match(err.message, /action/i);
          return true;
        }
      );
    });

    it('should reject missing resourceType', async () => {
      await assert.rejects(
        async () => {
          await recordAuditEvent({
            action: 'EXAM_CREATED',
            resourceId: 'exam-1'
          });
        },
        (err) => {
          assert.ok(err instanceof BadRequestError);
          assert.match(err.message, /resourceType/i);
          return true;
        }
      );
    });

    it('should reject missing resourceId', async () => {
      await assert.rejects(
        async () => {
          await recordAuditEvent({
            action: 'EXAM_CREATED',
            resourceType: 'EXAM',
            resourceId: ''
          });
        },
        (err) => {
          assert.ok(err instanceof BadRequestError);
          assert.match(err.message, /resourceId/i);
          return true;
        }
      );
    });
  });

  describe('queryAuditLogs Authorization & Pagination', () => {
    it('should reject non-admin users with 403 Forbidden', async () => {
      const studentUser = { userId: 'student-1', roles: ['STUDENT'] };
      await assert.rejects(
        async () => {
          await queryAuditLogs({}, studentUser);
        },
        (err) => {
          assert.ok(err instanceof ForbiddenError);
          assert.match(err.message, /ADMIN role/i);
          return true;
        }
      );

      const facultyUser = { userId: 'faculty-1', roles: ['FACULTY'] };
      await assert.rejects(
        async () => {
          await queryAuditLogs({}, facultyUser);
        },
        (err) => {
          assert.ok(err instanceof ForbiddenError);
          assert.match(err.message, /ADMIN role/i);
          return true;
        }
      );
    });

    it('should allow admin and return paginated result structure', async (t) => {
      if (!dbAvailable) {
        t.skip('Database unavailable');
        return;
      }

      // Record a test event first
      await recordAuditEvent({
        action: 'TEST_ADMIN_QUERY_EVENT',
        resourceType: 'TEST_RES',
        resourceId: 'test-res-42',
        metadata: { info: 'query-check' }
      });

      const adminUser = { userId: 'admin-1', roles: ['ADMIN'] };
      const result = await queryAuditLogs(
        { action: 'TEST_ADMIN_QUERY_EVENT', limit: 10, page: 1 },
        adminUser
      );

      assert.ok(result);
      assert.ok(Array.isArray(result.audit_logs));
      assert.ok(result.audit_logs.length >= 1);
      assert.equal(result.audit_logs[0].action, 'TEST_ADMIN_QUERY_EVENT');
      assert.ok(result.pagination);
      assert.equal(result.pagination.page, 1);
      assert.equal(result.pagination.limit, 10);
      assert.ok(typeof result.pagination.total === 'number');
      assert.ok(typeof result.pagination.totalPages === 'number');
    });
  });
});
