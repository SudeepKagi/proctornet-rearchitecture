import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { closePool } from '../../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../../src/infrastructure/redis/index.js';
import { closeRabbitMQ } from '../../../src/infrastructure/rabbitmq/client.js';
import {
  probeNodeApi,
  probePostgresPrimary,
  probePostgresReplica,
  probeRedis,
  probeRabbitMQ,
  probeWebSocket,
  probeSfu,
  probeCoturn,
  probeOutboxPoller,
  probeEvaluationConsumer,
  probeS3Storage,
  probeBackupService,
  probeWireGuard,
  aggregateSystemHealth
} from '../../../src/modules/developer/healthAggregator.js';

describe('healthAggregator & 13 Subsystem Probes', () => {
  it('probeNodeApi returns UP with process details', async () => {
    const res = await probeNodeApi();
    assert.equal(res.status, 'UP');
    assert.ok(res.details.uptimeSeconds >= 0);
    assert.ok(res.details.nodeVersion);
    assert.ok(res.details.heapUsedMb > 0);
  });

  it('probePostgresPrimary returns health status and connection metrics', async () => {
    const res = await probePostgresPrimary();
    assert.ok(['UP', 'DOWN'].includes(res.status));
    assert.ok(res.details);
  });

  it('probePostgresReplica detects standalone or replica mode cleanly', async () => {
    const res = await probePostgresReplica();
    assert.ok(['UP', 'DEGRADED', 'DOWN'].includes(res.status));
    assert.ok(res.details);
  });

  it('probeRedis returns health and connection details', async () => {
    const res = await probeRedis();
    assert.ok(['UP', 'DOWN'].includes(res.status));
    assert.ok(res.details);
  });

  it('probeRabbitMQ returns broker connection status', async () => {
    const res = await probeRabbitMQ();
    assert.ok(['UP', 'DEGRADED', 'DOWN'].includes(res.status));
    assert.ok(res.details);
  });

  it('probeWebSocket checks real-time server readiness', async () => {
    const res = await probeWebSocket();
    assert.ok(['UP', 'DEGRADED'].includes(res.status));
    assert.ok(res.details);
  });

  it('probeSfu checks Mediasoup worker pool metrics', async () => {
    const res = await probeSfu();
    assert.ok(['UP', 'DEGRADED'].includes(res.status));
    assert.ok(res.details.workersTotal !== undefined);
  });

  it('probeCoturn verifies STUN and TURN configuration', async () => {
    const res = await probeCoturn();
    assert.ok(['UP', 'DEGRADED'].includes(res.status));
    assert.ok(res.details);
  });

  it('probeOutboxPoller checks pending event backlog', async () => {
    const res = await probeOutboxPoller();
    assert.ok(['UP', 'DEGRADED', 'DOWN'].includes(res.status));
    assert.ok(res.details);
  });

  it('probeEvaluationConsumer returns consumer mode', async () => {
    const res = await probeEvaluationConsumer();
    assert.equal(res.status, 'UP');
    assert.ok(res.details.mode);
  });

  it('probeS3Storage verifies storage client configuration', async () => {
    const res = await probeS3Storage();
    assert.ok(['UP', 'DEGRADED', 'DOWN'].includes(res.status));
    assert.ok(res.details);
  });

  it('probeBackupService returns backup directory status', async () => {
    const res = await probeBackupService();
    assert.equal(res.status, 'UP');
    assert.ok(res.details.lastBackupTimestamp);
  });

  it('probeWireGuard returns 10.100.0.0/24 management network status', async () => {
    const res = await probeWireGuard();
    assert.equal(res.status, 'UP');
    assert.equal(res.details.subnet, '10.100.0.0/24');
    assert.equal(res.details.port, 51820);
  });

  it('aggregateSystemHealth aggregates all 13 subsystems with caching', async () => {
    const health1 = await aggregateSystemHealth(true);
    assert.equal(health1.totalSubsystems, 13);
    assert.ok(['UP', 'DEGRADED', 'DOWN'].includes(health1.status));
    assert.equal(Object.keys(health1.subsystems).length, 13);
    assert.equal(health1.cached, false);

    // Immediate second call should hit the 5s in-memory cache
    const health2 = await aggregateSystemHealth(false);
    assert.equal(health2.cached, true);
    assert.equal(health2.timestamp, health1.timestamp);
  });

  after(async () => {
    await closePool().catch(() => {});
    await closeRedis().catch(() => {});
    await closeRabbitMQ().catch(() => {});
  });
});
