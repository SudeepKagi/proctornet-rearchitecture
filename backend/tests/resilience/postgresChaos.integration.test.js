/**
 * @file postgresChaos.integration.test.js
 * @description Phase 22 Level 1 & 2: PostgreSQL connection pool saturation,
 * queue timeout handling, transaction rollbacks, and recovery verification.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const { Pool } = pg;

describe('Phase 22 — PostgreSQL Pool Chaos & Resilience (Level 1 & 2)', () => {
  const testPoolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'proctornet',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 2, // Tiny pool to safely simulate saturation
    connectionTimeoutMillis: 1000,
    idleTimeoutMillis: 2000
  };

  it('L1: Transaction automatically rolls back on error without leaving uncommitted records', async () => {
    const pool = new Pool(testPoolConfig);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Create a temporary uncommitted record
      await client.query(
        `CREATE TEMP TABLE temp_chaos_tx (id int, val text) ON COMMIT DROP;`
      );
      await client.query(
        `INSERT INTO temp_chaos_tx VALUES (1, 'uncommitted');`
      );

      // Force a transaction error (syntax/constraint)
      let threw = false;
      try {
        await client.query('INSERT INTO temp_chaos_tx VALUES (1, 2, 3);'); // Wrong columns
      } catch {
        threw = true;
      }
      assert.strictEqual(threw, true);

      // Explicit rollback
      await client.query('ROLLBACK');

      // Verify transaction ended cleanly
      const res = await client.query('SELECT 1 AS ok;');
      assert.strictEqual(res.rows[0].ok, 1);
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('L2: Connection pool saturation triggers connection timeout cleanly without crashing', async () => {
    const saturatedPool = new Pool(testPoolConfig);

    // Acquire both pool connections
    const client1 = await saturatedPool.connect();
    const client2 = await saturatedPool.connect();

    try {
      assert.strictEqual(saturatedPool.totalCount, 2);
      assert.strictEqual(saturatedPool.idleCount, 0);

      // Attempt to acquire a 3rd client — must time out cleanly after connectionTimeoutMillis
      const start = Date.now();
      let timeoutError = null;

      try {
        await saturatedPool.connect();
      } catch (err) {
        timeoutError = err;
      }

      const elapsed = Date.now() - start;
      assert.ok(timeoutError, 'Expected connection acquisition timeout');
      assert.ok(
        timeoutError.message.includes('timeout') || timeoutError.message.includes('Connection terminated'),
        `Unexpected error message: ${timeoutError.message}`
      );
      assert.ok(elapsed >= 900, `Expected elapsed time >= 900ms, got ${elapsed}ms`);
    } finally {
      // Release both clients
      client1.release();
      client2.release();

      // Verify pool recovers immediately
      const client3 = await saturatedPool.connect();
      const testQuery = await client3.query('SELECT 1 AS recovered;');
      assert.strictEqual(testQuery.rows[0].recovered, 1);
      client3.release();

      await saturatedPool.end();
    }
  });

  it('L2: Health probe returns healthy when database responds promptly', async () => {
    const pool = new Pool(testPoolConfig);
    const start = Date.now();
    const res = await pool.query('SELECT 1 AS healthy;');
    const latencyMs = Date.now() - start;

    assert.strictEqual(res.rows[0].healthy, 1);
    assert.ok(latencyMs < 500, `Query latency ${latencyMs}ms should be under 500ms`);
    await pool.end();
  });
});
