/**
 * @file collect-metrics.js
 * @description Periodic runtime metrics collector sampling PostgreSQL connection saturation,
 * lock contention, Redis memory/ops, and Node/system utilization during benchmark runs.
 *
 * Usage:
 *   node scripts/load/collect-metrics.js --duration=60 --output=benchmarks/reports/metrics.json
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(new URL('../../backend/package.json', import.meta.url));

const pg = require('pg');
const Redis = require('ioredis');

// Parse CLI flags
const args = process.argv.slice(2);
let durationSec = 30;
let intervalMs = 1000;
let outputPath = path.resolve(__dirname, '../../benchmarks/reports/metrics-snapshot.json');

for (const arg of args) {
  if (arg.startsWith('--duration=')) {
    durationSec = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--interval=')) {
    intervalMs = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--output=')) {
    outputPath = path.resolve(process.cwd(), arg.split('=')[1]);
  }
}

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'proctornet',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 2
};

const pool = new pg.Pool(dbConfig);
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 1
});

const samples = [];
let isStopping = false;

async function sampleSnapshot() {
  const snapshot = {
    timestamp: new Date().toISOString(),
    system: {
      cpu_count: os.cpus().length,
      free_mem_mb: Math.round(os.freemem() / (1024 * 1024)),
      total_mem_mb: Math.round(os.totalmem() / (1024 * 1024))
    },
    postgres: {
      active_connections: 0,
      waiting_locks: 0,
      deadlocks: 0,
      commits: 0,
      rollbacks: 0
    },
    redis: {
      connected_clients: 0,
      used_memory_mb: 0,
      ops_per_sec: 0
    }
  };

  // 1. PostgreSQL Metrics
  try {
    const connRes = await pool.query(`
      SELECT 
        count(*) FILTER (WHERE state = 'active') AS active_conns,
        count(*) FILTER (WHERE wait_event_type IS NOT NULL) AS waiting_conns
      FROM pg_stat_activity
      WHERE datname = $1;
    `, [dbConfig.database]);

    const statRes = await pool.query(`
      SELECT xact_commit, xact_rollback, deadlocks
      FROM pg_stat_database
      WHERE datname = $1;
    `, [dbConfig.database]);

    if (connRes.rows[0]) {
      snapshot.postgres.active_connections = parseInt(connRes.rows[0].active_conns, 10);
      snapshot.postgres.waiting_locks = parseInt(connRes.rows[0].waiting_conns, 10);
    }
    if (statRes.rows[0]) {
      snapshot.postgres.commits = parseInt(statRes.rows[0].xact_commit, 10);
      snapshot.postgres.rollbacks = parseInt(statRes.rows[0].xact_rollback, 10);
      snapshot.postgres.deadlocks = parseInt(statRes.rows[0].deadlocks, 10);
    }
  } catch (err) {
    snapshot.postgres.error = err.message;
  }

  // 2. Redis Metrics
  try {
    const infoClients = await redis.info('clients');
    const infoMemory = await redis.info('memory');
    const infoStats = await redis.info('stats');

    const parseInfoField = (str, key) => {
      const match = str.match(new RegExp(`^${key}:(.+)$`, 'm'));
      return match ? match[1].trim() : null;
    };

    const clients = parseInfoField(infoClients, 'connected_clients');
    const memBytes = parseInfoField(infoMemory, 'used_memory');
    const ops = parseInfoField(infoStats, 'instantaneous_ops_per_sec');

    snapshot.redis.connected_clients = clients ? parseInt(clients, 10) : 0;
    snapshot.redis.used_memory_mb = memBytes ? +(parseInt(memBytes, 10) / (1024 * 1024)).toFixed(2) : 0;
    snapshot.redis.ops_per_sec = ops ? parseInt(ops, 10) : 0;
  } catch (err) {
    snapshot.redis.error = err.message;
  }

  samples.push(snapshot);
}

function calculateSummary(samples) {
  if (samples.length === 0) return {};

  const getStats = (arr) => {
    if (!arr || arr.length === 0) return { min: 0, max: 0, avg: 0, p95: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    const sum = sorted.reduce((s, v) => s + v, 0);
    const avg = +(sum / sorted.length).toFixed(2);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p95Idx = Math.floor(sorted.length * 0.95);
    const p95 = sorted[Math.min(p95Idx, sorted.length - 1)];
    return { min, max, avg, p95 };
  };

  const pgActiveConns = samples.map(s => s.postgres.active_connections);
  const pgWaiting = samples.map(s => s.postgres.waiting_locks);
  const redisClients = samples.map(s => s.redis.connected_clients);
  const redisMemory = samples.map(s => s.redis.used_memory_mb);
  const redisOps = samples.map(s => s.redis.ops_per_sec);

  return {
    sample_count: samples.length,
    duration_sec: samples.length * (intervalMs / 1000),
    postgres: {
      active_connections: getStats(pgActiveConns),
      waiting_locks: getStats(pgWaiting),
      total_deadlocks: samples[samples.length - 1]?.postgres.deadlocks || 0
    },
    redis: {
      connected_clients: getStats(redisClients),
      used_memory_mb: getStats(redisMemory),
      ops_per_sec: getStats(redisOps)
    }
  };
}

async function stopAndSave() {
  if (isStopping) return;
  isStopping = true;

  console.log(`\n[Collector] Finalizing metrics collection (${samples.length} samples)...`);

  const summary = calculateSummary(samples);
  const report = {
    generated_at: new Date().toISOString(),
    summary,
    samples
  };

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[Collector] Written metrics snapshot to: ${outputPath}`);

  console.log('\n================ SYSTEM METRICS SUMMARY ================');
  console.log(`PostgreSQL Active Connections: avg=${summary.postgres?.active_connections.avg}, max=${summary.postgres?.active_connections.max}, p95=${summary.postgres?.active_connections.p95}`);
  console.log(`PostgreSQL Waiting Locks:      avg=${summary.postgres?.waiting_locks.avg}, max=${summary.postgres?.waiting_locks.max}`);
  console.log(`PostgreSQL Cumulative Deadlocks: ${summary.postgres?.total_deadlocks}`);
  console.log(`Redis Connected Clients:       avg=${summary.redis?.connected_clients.avg}, max=${summary.redis?.connected_clients.max}`);
  console.log(`Redis Used Memory (MB):        avg=${summary.redis?.used_memory_mb.avg}, max=${summary.redis?.used_memory_mb.max}`);
  console.log(`Redis Operations / Sec:        avg=${summary.redis?.ops_per_sec.avg}, max=${summary.redis?.ops_per_sec.max}`);
  console.log('========================================================\n');

  try {
    await pool.end();
    redis.disconnect();
  } catch {}
}

async function main() {
  console.log(`[Collector] Connecting to PostgreSQL and Redis...`);
  try {
    await redis.connect();
  } catch (e) {
    console.warn(`[Collector] Redis connection warning: ${e.message}`);
  }

  console.log(`[Collector] Commencing collection every ${intervalMs}ms for ${durationSec}s...`);
  const endTime = Date.now() + durationSec * 1000;

  process.on('SIGINT', async () => {
    await stopAndSave();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await stopAndSave();
    process.exit(0);
  });

  const stopFilePath = path.resolve(path.dirname(outputPath), '.stop_collector');
  if (fs.existsSync(stopFilePath)) {
    try { fs.unlinkSync(stopFilePath); } catch {}
  }

  while (Date.now() < endTime && !isStopping) {
    if (fs.existsSync(stopFilePath)) {
      console.log('[Collector] Stop signal detected via .stop_collector');
      break;
    }
    await sampleSnapshot();
    await new Promise(r => setTimeout(r, intervalMs));
  }

  await stopAndSave();
  if (fs.existsSync(stopFilePath)) {
    try { fs.unlinkSync(stopFilePath); } catch {}
  }
}

main().catch(err => {
  console.error('[Collector] Fatal collector error:', err);
  process.exit(1);
});
