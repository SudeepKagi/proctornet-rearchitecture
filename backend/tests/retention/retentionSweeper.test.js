import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import {
  verifyAuditLogImmutability,
  sweepBiometricRawImages,
  sweepLivenessChallengeArtifacts,
  sweepStudentIdentityDocuments,
  runAllRetentionSweepers
} from '../../../scripts/retention/run-retention-sweepers.js';

describe('Data Retention & Immutability Sweepers', () => {
  after(async () => {
    await closePool();
    await closeRedis();
  });
  it('strictly verifies audit_logs immutability (SQLSTATE 20000)', async () => {
    const check = await verifyAuditLogImmutability();
    assert.equal(check.category, 'AUDIT_LOG_IMMUTABILITY');
    assert.equal(check.enforced, true, 'SQLSTATE 20000 trigger must block truncation/deletion');
    assert.ok(check.verifiedAt);
  });

  it('runs biometric raw image sweeper safely without throwing', async () => {
    const res = await sweepBiometricRawImages({ retentionDays: 7, batchSize: 10, dryRun: true });
    assert.equal(res.category, 'FACE_BIOMETRIC_RAW_IMAGES');
    assert.equal(typeof res.evaluated, 'number');
    assert.equal(typeof res.purged, 'number');
    assert.equal(res.errors, 0);
  });

  it('runs liveness challenge artifacts sweeper safely without throwing', async () => {
    const res = await sweepLivenessChallengeArtifacts({ batchSize: 10, dryRun: true });
    assert.equal(res.category, 'LIVENESS_CHALLENGE_ARTIFACTS');
    assert.equal(typeof res.evaluated, 'number');
    assert.equal(typeof res.purged, 'number');
    assert.equal(res.errors, 0);
  });

  it('runs student identity documents sweeper safely without throwing', async () => {
    const res = await sweepStudentIdentityDocuments({ retentionDays: 180, batchSize: 10, dryRun: true });
    assert.equal(res.category, 'STUDENT_IDENTITY_DOCUMENTS');
    assert.equal(typeof res.evaluated, 'number');
    assert.equal(typeof res.purged, 'number');
    assert.equal(res.errors, 0);
  });

  it('executes runAllRetentionSweepers orchestrator in dry-run mode', async () => {
    const summary = await runAllRetentionSweepers({ dryRun: true });
    assert.equal(summary.dryRun, true);
    assert.ok(summary.startedAt);
    assert.ok(summary.completedAt);
    assert.equal(summary.results.length, 5);

    const auditResult = summary.results.find(r => r.category === 'AUDIT_LOG_IMMUTABILITY');
    assert.ok(auditResult);
    assert.equal(auditResult.enforced, true);
  });
});
