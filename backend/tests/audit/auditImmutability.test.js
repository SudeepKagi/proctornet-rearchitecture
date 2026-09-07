import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, closePool, checkDatabaseHealth } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { closeRabbitMQ } from '../../src/infrastructure/rabbitmq/client.js';

describe('Audit Logs Database Immutability & Tamper Resistance', () => {
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

  it('should allow INSERT into audit_logs', async (t) => {
    if (!dbAvailable) {
      t.skip('Database unavailable');
      return;
    }

    const insertSql = `
      INSERT INTO audit_logs (action, resource_type, resource_id, metadata)
      VALUES ($1, $2, $3, $4)
      RETURNING audit_id, action, resource_type, resource_id;
    `;
    const res = await query(insertSql, [
      'TEST_AUDIT_INSERT',
      'TEST_RESOURCE',
      'res-12345',
      JSON.stringify({ test: true })
    ]);

    assert.ok(res.rows[0]);
    assert.ok(res.rows[0].audit_id);
    assert.equal(res.rows[0].action, 'TEST_AUDIT_INSERT');
  });

  it('should prohibit UPDATE on audit_logs with SQLSTATE 20000', async (t) => {
    if (!dbAvailable) {
      t.skip('Database unavailable');
      return;
    }

    // First insert a test row
    const insertRes = await query(`
      INSERT INTO audit_logs (action, resource_type, resource_id)
      VALUES ('TEST_AUDIT_FOR_UPDATE', 'TEST_RESOURCE', 'res-update')
      RETURNING audit_id;
    `);
    const auditId = insertRes.rows[0].audit_id;

    // Attempt to update the row
    await assert.rejects(
      async () => {
        await query(
          `UPDATE audit_logs SET action = 'MUTATED' WHERE audit_id = $1`,
          [auditId]
        );
      },
      (err) => {
        assert.equal(err.code, '20000', `Expected SQLSTATE 20000, received ${err.code}: ${err.message}`);
        assert.match(err.message, /Audit logs are immutable/i);
        return true;
      }
    );
  });

  it('should prohibit DELETE on audit_logs with SQLSTATE 20000', async (t) => {
    if (!dbAvailable) {
      t.skip('Database unavailable');
      return;
    }

    // First insert a test row
    const insertRes = await query(`
      INSERT INTO audit_logs (action, resource_type, resource_id)
      VALUES ('TEST_AUDIT_FOR_DELETE', 'TEST_RESOURCE', 'res-delete')
      RETURNING audit_id;
    `);
    const auditId = insertRes.rows[0].audit_id;

    // Attempt to delete the row
    await assert.rejects(
      async () => {
        await query(`DELETE FROM audit_logs WHERE audit_id = $1`, [auditId]);
      },
      (err) => {
        assert.equal(err.code, '20000', `Expected SQLSTATE 20000, received ${err.code}: ${err.message}`);
        assert.match(err.message, /Audit logs are immutable/i);
        return true;
      }
    );
  });

  it('should prohibit TRUNCATE on audit_logs with SQLSTATE 20000', async (t) => {
    if (!dbAvailable) {
      t.skip('Database unavailable');
      return;
    }

    // Attempt to truncate the audit_logs table
    await assert.rejects(
      async () => {
        await query(`TRUNCATE TABLE audit_logs`);
      },
      (err) => {
        assert.equal(err.code, '20000', `Expected SQLSTATE 20000, received ${err.code}: ${err.message}`);
        assert.match(err.message, /Audit logs are immutable/i);
        return true;
      }
    );
  });

  it('should prohibit deleting an entity that has referenced audit logs (Audit Entity Deletion Protection)', async (t) => {
    if (!dbAvailable) {
      t.skip('Database unavailable');
      return;
    }

    // 1. Create temporary user
    const userRes = await query(`
      INSERT INTO users (name, email, password_hash, status)
      VALUES ('Protected User', 'protected_${Date.now()}@example.com', 'dummyhash', 'ACTIVE')
      RETURNING user_id;
    `);
    const userId = userRes.rows[0].user_id;

    // 2. Insert audit log referencing this user
    await query(`
      INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id)
      VALUES ($1, 'TEST_PROTECTION_ACTION', 'USER', $2);
    `, [userId, String(userId)]);

    // 3. Attempt to delete the user -> fails because foreign key ON DELETE SET NULL triggers immutable audit log UPDATE
    await assert.rejects(
      async () => {
        await query(`DELETE FROM users WHERE user_id = $1`, [userId]);
      },
      (err) => {
        assert.equal(err.code, '20000', `Expected SQLSTATE 20000, received ${err.code}`);
        assert.match(err.message, /Audit logs are immutable/i);
        return true;
      }
    );
  });
});
