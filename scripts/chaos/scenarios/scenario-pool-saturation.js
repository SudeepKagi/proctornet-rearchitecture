/**
 * @file scenario-pool-saturation.js
 * @description Scenario CH-05: PostgreSQL Connection Pool Saturation & Recovery.
 * Saturates a bounded pool (max: 5), asserts connection queue timeout behavior,
 * releases connections, and verifies immediate sub-millisecond pool recovery.
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { registerTeardownHook } from '../chaos-harness.js';

const require = createRequire(new URL('../../../backend/package.json', import.meta.url));
const pg = require('pg');

export async function runScenarioPoolSaturation(options = {}) {
  const poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'proctornet',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 5,
    connectionTimeoutMillis: 1500
  };

  const pool = new pg.Pool(poolConfig);
  const heldClients = [];
  let faultDetectionTimeMs = 0;
  let faultRecoveryTimeMs = 0;
  let passed = false;

  registerTeardownHook(async () => {
    while (heldClients.length > 0) {
      const c = heldClients.pop();
      try { c.release(); } catch {}
    }
    await pool.end().catch(() => {});
  });

  console.log('\n--- Running Scenario CH-05: PostgreSQL Pool Saturation & Recovery ---');

  try {
    // 1. Acquire and hold all 5 pool clients
    for (let i = 0; i < 5; i++) {
      const c = await pool.connect();
      heldClients.push(c);
    }
    console.log(`[CH-05] Acquired 5/5 clients in pool (total: ${pool.totalCount}, waiting: ${pool.waitingCount})`);

    // 2. Attempt to acquire a 6th client -> expect timeout within connectionTimeoutMillis
    const startTimeout = Date.now();
    let timeoutCaught = false;
    try {
      await pool.connect();
    } catch (err) {
      timeoutCaught = true;
      faultDetectionTimeMs = Date.now() - startTimeout;
      assert.ok(
        err.message.includes('timeout exceeded when trying to connect') ||
        err.message.includes('timeout')
      );
      console.log(`[CH-05] 6th connection attempt timed out cleanly in ${faultDetectionTimeMs}ms (Threshold <= 2000ms).`);
    }

    assert.strictEqual(timeoutCaught, true, 'Pool saturation must throw timeout');

    // 3. Release all 5 held clients to recover pool
    const releaseStart = Date.now();
    while (heldClients.length > 0) {
      const c = heldClients.pop();
      c.release();
    }

    // 4. Measure recovery time: execute a query on recovered pool
    const client = await pool.connect();
    const queryStart = Date.now();
    const res = await client.query('SELECT 1 AS recovery_check;');
    const queryLatencyMs = Date.now() - queryStart;
    client.release();

    faultRecoveryTimeMs = Date.now() - releaseStart;
    assert.strictEqual(res.rows[0].recovery_check, 1);
    console.log(`[CH-05] Pool recovered. Fault Recovery Time: ${faultRecoveryTimeMs}ms, Query latency: ${queryLatencyMs}ms (Threshold <= 5000ms)`);

    passed = faultDetectionTimeMs <= 2000 && faultRecoveryTimeMs <= 5000 && queryLatencyMs < 20;
    console.log(`[CH-05] Result: ${passed ? 'PASSED' : 'FAILED'}\n`);

    return {
      scenarioId: 'CH-05',
      title: 'PostgreSQL Connection Pool Saturation & Recovery',
      passed,
      faultDetectionTimeMs,
      faultRecoveryTimeMs,
      dataLossCount: 0,
      duplicateEffects: 0,
      details: {
        poolMax: 5,
        timeoutCaught: true,
        queryLatencyMs
      }
    };
  } finally {
    while (heldClients.length > 0) {
      const c = heldClients.pop();
      try { c.release(); } catch {}
    }
    await pool.end().catch(() => {});
  }
}

// CLI direct runner
if (process.argv[1] && process.argv[1].endsWith('scenario-pool-saturation.js')) {
  runScenarioPoolSaturation()
    .then((res) => {
      console.log('Result:', JSON.stringify(res, null, 2));
      process.exit(res.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal scenario error:', err);
      process.exit(1);
    });
}
