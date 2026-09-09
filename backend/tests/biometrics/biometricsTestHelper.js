/**
 * @file biometricsTestHelper.js
 * @description Test helpers and in-memory S3 storage mock for Phase 25 Biometric tests.
 */

import crypto from 'node:crypto';
import { S3Client } from '@aws-sdk/client-s3';
import { setS3Client } from '../../src/infrastructure/storage/s3Storage.js';
import { getPool } from '../../src/infrastructure/postgres/pool.js';
import { generateAccessToken } from '../../src/modules/auth/token.service.js';
import { setSessionRevocationChecker, resetSessionRevocationChecker } from '../../src/middleware/authenticate.js';

export const mockS3Storage = new Map();

/**
 * Creates a mock S3 client backed by an in-memory buffer map.
 */
export function setupMockBiometricS3() {
  mockS3Storage.clear();
  setSessionRevocationChecker(async (id) => ({ session_id: id, is_revoked: false }));

  const client = new S3Client({

    region: 'ap-south-1',
    credentials: {
      accessKeyId: 'test-key-mock',
      secretAccessKey: 'test-secret-mock'
    }
  });

  client.send = async (command) => {
    const name = command.constructor.name;
    const input = command.input;

    if (name === 'PutObjectCommand') {
      mockS3Storage.set(input.Key, {
        body: input.Body,
        contentType: input.ContentType,
        length: input.ContentLength || (input.Body ? input.Body.length : 0)
      });
      return {};
    }

    if (name === 'HeadObjectCommand') {
      const stored = mockS3Storage.get(input.Key);
      if (!stored) {
        const error = new Error('NotFound');
        error.name = 'NotFound';
        error.$metadata = { httpStatusCode: 404 };
        throw error;
      }
      return {
        ContentLength: stored.length,
        ContentType: stored.contentType,
        VersionId: 'mock-version-1',
        ETag: '"mock-etag"'
      };
    }

    if (name === 'GetObjectCommand') {
      const stored = mockS3Storage.get(input.Key);
      if (!stored) {
        const error = new Error('NotFound');
        error.name = 'NotFound';
        error.$metadata = { httpStatusCode: 404 };
        throw error;
      }

      let bodyBuffer = stored.body;
      if (typeof bodyBuffer === 'string') {
        bodyBuffer = Buffer.from(bodyBuffer);
      }

      if (input.Range) {
        const match = input.Range.match(/bytes=(\d+)-(\d+)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = parseInt(match[2], 10);
          bodyBuffer = bodyBuffer.subarray(start, end + 1);
        }
      }

      async function* streamBody() {
        yield bodyBuffer;
      }

      return {
        Body: streamBody(),
        ContentLength: bodyBuffer.length,
        ContentType: stored.contentType
      };
    }

    if (name === 'ListObjectVersionsCommand') {
      const versions = [];
      for (const key of mockS3Storage.keys()) {
        if (key.startsWith(input.Prefix)) {
          versions.push({ Key: key, VersionId: 'mock-version-1' });
        }
      }
      return {
        IsTruncated: false,
        Versions: versions,
        DeleteMarkers: []
      };
    }

    if (name === 'DeleteObjectsCommand') {
      for (const obj of input.Delete?.Objects || []) {
        mockS3Storage.delete(obj.Key);
      }
      return {
        Deleted: (input.Delete?.Objects || []).map((o) => ({ Key: o.Key })),
        Errors: []
      };
    }

    return {};
  };

  setS3Client(client);
  return client;
}

export function teardownMockBiometricS3() {
  mockS3Storage.clear();
  setS3Client(null);
  resetSessionRevocationChecker();
}


/**
 * Creates a valid synthetic JPEG image buffer for biometric testing.
 */
export function createSyntheticFaceJpeg(options = {}) {
  const { isSpoof = null, noFace = false, pose = null, seed = 42, actionTag = null } = options;

  // Standard JPEG header
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01]);

  let markers = '';
  if (actionTag) markers += `ACTION:${actionTag} `;
  if (noFace) markers += 'TEST_FIXTURE_NO_FACE ';
  if (isSpoof) markers += `${isSpoof} `;
  if (pose) markers += `POSE_PITCH:${pose.pitch || 0}_YAW:${pose.yaw || 0}_ROLL:${pose.roll || 0} `;

  const markerBuf = Buffer.from(markers, 'utf8');


  // Realistic payload size (~4000 bytes) with varied pixel gradients
  const body = Buffer.alloc(4000);
  for (let i = 0; i < body.length; i++) {
    body[i] = ((i * 17) + (seed * 31)) % 256;
  }

  return Buffer.concat([header, markerBuf, body]);
}

/**
 * Creates a valid synthetic PNG image buffer.
 */
export function createSyntheticFacePng(options = {}) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(16);
  ihdr.writeUInt32BE(640, 0);
  ihdr.writeUInt32BE(480, 4);

  const body = Buffer.alloc(2000, 0x66);
  return Buffer.concat([header, ihdr, body]);
}

/**
 * Creates test user in PostgreSQL and returns tokens.
 */
export async function createTestUser({ email, role = 'STUDENT', name = 'Test User' }) {
  const pool = getPool();
  const userId = crypto.randomUUID();
  const passwordHash = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUU1234567890'; // dummy bcrypt

  await pool.query(
    `INSERT INTO users (user_id, email, name, password_hash, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE')
     ON CONFLICT (email) DO NOTHING;`,
    [userId, email, name, passwordHash]
  );

  await pool.query(
    `INSERT INTO user_roles (user_id, role)
     VALUES ($1, $2)
     ON CONFLICT (user_id, role) DO NOTHING;`,
    [userId, role]
  );

  const authSessionId = crypto.randomUUID();
  const refreshHash = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO user_sessions (session_id, user_id, refresh_token_hash, is_revoked, expires_at)
     VALUES ($1, $2, $3, false, NOW() + INTERVAL '1 day')
     ON CONFLICT (session_id) DO NOTHING;`,
    [authSessionId, userId, refreshHash]
  );

  const token = generateAccessToken({
    userId,
    roles: [role],
    sessionId: authSessionId
  });

  return { userId, email, role, token, authSessionId };
}

