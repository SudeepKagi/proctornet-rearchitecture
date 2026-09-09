/**
 * @file evidenceTestHelper.js
 * @description Shared test fixture factory and mock S3 client for Phase 15 Evidence Storage tests.
 */

import { S3Client } from '@aws-sdk/client-s3';
import { setS3Client } from '../../src/infrastructure/storage/s3Storage.js';
import { setupProctoringFixture } from '../proctoring/proctoringTestHelper.js';

export { setupProctoringFixture };

/**
 * Creates and registers a mock S3 client that generates real presigned URLs locally
 * and routes S3 commands (HeadObject, ListObjectVersions, DeleteObjects) to custom handlers.
 *
 * @param {object} [handlerMap={}] - Map of CommandName -> async (input) => response
 * @returns {S3Client}
 */
export function setupMockS3(handlerMap = {}) {
  const client = new S3Client({
    region: 'ap-south-1',
    credentials: {
      accessKeyId: 'test-key-mock',
      secretAccessKey: 'test-secret-mock'
    }
  });

  client.send = async (command) => {
    const name = command.constructor.name;
    if (handlerMap[name]) {
      return handlerMap[name](command.input);
    }

    if (name === 'HeadObjectCommand') {
      const isPng = command.input.Key?.endsWith('.png');
      return {
        ContentLength: 102400,
        ContentType: isPng ? 'image/png' : 'image/jpeg',
        VersionId: 'v-test-version-001',
        ETag: '"mock-etag-abc"'
      };
    }

    if (name === 'ListObjectVersionsCommand') {
      return {
        IsTruncated: false,
        Versions: [
          { Key: command.input.Prefix, VersionId: 'v-test-version-001' }
        ],
        DeleteMarkers: []
      };
    }

    if (name === 'DeleteObjectsCommand') {
      return {
        Deleted: (command.input.Delete?.Objects || []).map((o) => ({
          Key: o.Key,
          VersionId: o.VersionId
        })),
        Errors: []
      };
    }

    if (name === 'GetObjectCommand') {
      const isPng = command.input.Key?.endsWith('.png');
      const isPdf = command.input.Key?.endsWith('.pdf');
      const isWebp = command.input.Key?.endsWith('.webp');
      const isWebm = command.input.Key?.endsWith('.webm');
      const isOgg = command.input.Key?.endsWith('.ogg');
      const isWav = command.input.Key?.endsWith('.wav');

      let magicBytes;
      if (isPng) {
        magicBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
      } else if (isPdf) {
        magicBytes = Buffer.from('%PDF-1.7\n%mock pdf header\n');
      } else if (isWebp) {
        magicBytes = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
      } else if (isWebm) {
        magicBytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81]);
      } else if (isOgg) {
        magicBytes = Buffer.from('OggS\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00');
      } else if (isWav) {
        magicBytes = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]);
      } else {
        magicBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60]);
      }

      async function* generateStream() {
        yield magicBytes;
      }

      return {
        Body: generateStream(),
        ContentLength: magicBytes.length,
        ContentType: isPng ? 'image/png' : isPdf ? 'application/pdf' : 'image/jpeg'
      };
    }

    throw new Error(`Unhandled mock S3 command: ${name}`);
  };

  setS3Client(client);
  return client;
}

/**
 * Resets S3Client to default.
 */
export function resetMockS3() {
  setS3Client(null);
}
