import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSslConfig } from '../src/infrastructure/postgres/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Database Connection Pool SSL Configuration', () => {
  it('returns false when DB_SSL is disabled (local development mode)', () => {
    const sslConfig = resolveSslConfig({ DB_SSL: false });
    assert.equal(sslConfig, false);
  });

  it('configures rejectUnauthorized and CA when DB_SSL is enabled with inline CA', () => {
    const ca = '-----BEGIN CERTIFICATE-----\nTEST_CA_DATA\n-----END CERTIFICATE-----';
    const sslConfig = resolveSslConfig({
      DB_SSL: true,
      DB_SSL_CA: ca,
      DB_SSL_REJECT_UNAUTHORIZED: true,
      NODE_ENV: 'production'
    });

    assert.equal(typeof sslConfig, 'object');
    assert.equal(sslConfig.rejectUnauthorized, true);
    assert.equal(sslConfig.ca, ca);
  });

  it('reads CA from file path when DB_SSL_CA points to an existing file', () => {
    const tempCaPath = path.join(__dirname, 'temp-ca.pem');
    try {
      fs.writeFileSync(tempCaPath, '-----BEGIN CERTIFICATE-----\nFILE_CA_DATA\n-----END CERTIFICATE-----');
      const sslConfig = resolveSslConfig({
        DB_SSL: true,
        DB_SSL_CA: tempCaPath,
        DB_SSL_REJECT_UNAUTHORIZED: true,
        NODE_ENV: 'production'
      });

      assert.equal(typeof sslConfig, 'object');
      assert.equal(sslConfig.rejectUnauthorized, true);
      assert.match(sslConfig.ca, /FILE_CA_DATA/);
    } finally {
      if (fs.existsSync(tempCaPath)) {
        fs.unlinkSync(tempCaPath);
      }
    }
  });

  it('throws fatal error in production if DB_SSL is true but DB_SSL_CA is missing', () => {
    assert.throws(
      () => resolveSslConfig({
        DB_SSL: true,
        DB_SSL_CA: '',
        NODE_ENV: 'production',
        DB_SSL_REJECT_UNAUTHORIZED: true
      }),
      /FATAL: DB_SSL is enabled with rejectUnauthorized in production, but DB_SSL_CA is not configured/
    );
  });

  it('allows DB_SSL without CA in development when rejectUnauthorized is false', () => {
    const sslConfig = resolveSslConfig({
      DB_SSL: true,
      DB_SSL_CA: '',
      NODE_ENV: 'development',
      DB_SSL_REJECT_UNAUTHORIZED: false
    });

    assert.equal(typeof sslConfig, 'object');
    assert.equal(sslConfig.rejectUnauthorized, false);
    assert.equal(sslConfig.ca, undefined);
  });
});
