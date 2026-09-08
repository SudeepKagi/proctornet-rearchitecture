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
