/**
 * @file s3Storage.js
 * @description AWS S3 storage client abstraction for presigned URL generation,
 * authoritative object metadata verification, and version-aware permanent object deletion.
 * Conforms to Phase 15 specification and ADR-0005.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  DeleteObjectsCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { evidenceStorageLatencySeconds } from '../metrics/registry.js';

let cachedS3Client = null;

/**
 * Returns or initializes the S3Client singleton using the default credential provider chain.
 * @returns {S3Client}
 */
export function getS3Client() {
  if (cachedS3Client) {
    return cachedS3Client;
  }

  const clientConfig = {
    region: config.AWS_REGION
  };

  if (config.S3_ENDPOINT) {
    clientConfig.endpoint = config.S3_ENDPOINT;
  }

  if (config.S3_FORCE_PATH_STYLE) {
    clientConfig.forcePathStyle = true;
  }

  cachedS3Client = new S3Client(clientConfig);
  return cachedS3Client;
}

/**
 * Allows setting or mocking the S3Client instance (primarily for testing).
 * @param {S3Client|null} client
 */
export function setS3Client(client) {
  cachedS3Client = client;
}

/**
 * Generates an AWS Signature Version 4 presigned PUT URL for direct-to-S3 binary evidence upload.
 *
 * @param {object} params
 * @param {string} params.bucket
 * @param {string} params.key
 * @param {string} params.contentType
 * @param {number} params.byteSize
 * @param {number} [params.expiresInSeconds=300]
 * @returns {Promise<string>} Presigned PUT URL
 */
export async function generatePresignedUploadUrl({
  bucket,
  key,
  contentType,
  byteSize,
  expiresInSeconds = config.EVIDENCE_UPLOAD_TTL_SECONDS
}) {
  const timer = evidenceStorageLatencySeconds.startTimer({ operation: 'presign_put' });
  try {
    const s3 = getS3Client();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: byteSize
    });

    return await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  } finally {
    timer();
  }
}

/**
 * Generates an AWS Signature Version 4 presigned GET URL for authorized evidence playback.
 * Pins retrieval to the specific S3 VersionId validated during confirmation.
 *
 * @param {object} params
 * @param {string} params.bucket
 * @param {string} params.key
 * @param {string} params.contentType
 * @param {string} [params.versionId] - Explicit S3 VersionId pinned at confirmation
 * @param {number} [params.expiresInSeconds=900]
 * @returns {Promise<string>} Presigned GET URL
 */
export async function generatePresignedDownloadUrl({
  bucket,
  key,
  contentType,
  versionId,
  expiresInSeconds = config.EVIDENCE_PLAYBACK_TTL_SECONDS
}) {
  const timer = evidenceStorageLatencySeconds.startTimer({ operation: 'presign_get' });
  try {
    const s3 = getS3Client();
    const commandParams = {
      Bucket: bucket,
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: 'inline'
    };

    if (versionId) {
      commandParams.VersionId = versionId;
    }

    const command = new GetObjectCommand(commandParams);
    return await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  } finally {
    timer();
  }
}

/**
 * Calls S3 HeadObject to authoritatively verify object existence, exact ContentLength,
 * ContentType, and captured VersionId.
 *
 * @param {object} params
 * @param {string} params.bucket
 * @param {string} params.key
 * @returns {Promise<{contentLength: number, contentType: string, versionId?: string, eTag?: string}>}
 */
export async function headEvidenceObject({ bucket, key }) {
  const timer = evidenceStorageLatencySeconds.startTimer({ operation: 'head_object' });
  try {
    const s3 = getS3Client();
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const response = await s3.send(command);

    return {
      contentLength: response.ContentLength ?? 0,
      contentType: response.ContentType ?? '',
      versionId: response.VersionId,
      eTag: response.ETag
    };
  } finally {
    timer();
  }
}

/**
 * Permanently deletes all versions and delete markers for an object key from a version-enabled S3 bucket.
 * Handles pagination and batches deletions in chunks of at most 1,000 identifiers.
 * Validates that zero errors occurred during deletion.
 *
 * @param {object} params
 * @param {string} params.bucket
 * @param {string} params.key
 * @returns {Promise<{deletedCount: number}>}
 */
export async function deleteEvidenceObjectVersions({ bucket, key }) {
  const timer = evidenceStorageLatencySeconds.startTimer({ operation: 'delete_versions' });
  try {
    const s3 = getS3Client();
    let isTruncated = true;
    let keyMarker = undefined;
    let versionIdMarker = undefined;
    let totalDeleted = 0;

    while (isTruncated) {
      const listParams = {
        Bucket: bucket,
        Prefix: key,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker
      };

      const listResult = await s3.send(new ListObjectVersionsCommand(listParams));

      const toDelete = [];

      if (Array.isArray(listResult.Versions)) {
        for (const version of listResult.Versions) {
          if (version.Key === key && version.VersionId) {
            toDelete.push({ Key: version.Key, VersionId: version.VersionId });
          }
        }
      }

      if (Array.isArray(listResult.DeleteMarkers)) {
        for (const marker of listResult.DeleteMarkers) {
          if (marker.Key === key && marker.VersionId) {
            toDelete.push({ Key: marker.Key, VersionId: marker.VersionId });
          }
        }
      }

      // S3 DeleteObjectsCommand supports at most 1,000 objects per call
      for (let i = 0; i < toDelete.length; i += 1000) {
        const batch = toDelete.slice(i, i + 1000);
        if (batch.length > 0) {
          const deleteResult = await s3.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: {
                Objects: batch,
                Quiet: true
              }
            })
          );

          if (Array.isArray(deleteResult.Errors) && deleteResult.Errors.length > 0) {
            const errorSummary = deleteResult.Errors.map(
              (e) => `[${e.Key} (${e.VersionId}): ${e.Code} - ${e.Message}]`
            ).join(', ');
            logger.error({ errors: deleteResult.Errors, key, bucket }, 'S3 DeleteObjects partial failure');
            throw new Error(`S3 DeleteObjects partial failure for key ${key}: ${errorSummary}`);
          }

          totalDeleted += batch.length;
        }
      }

      isTruncated = listResult.IsTruncated || false;
      keyMarker = listResult.NextKeyMarker;
      versionIdMarker = listResult.NextVersionIdMarker;
    }

    return { deletedCount: totalDeleted };
  } finally {
    timer();
  }
}

/**
 * Retrieves the first N bytes of an S3 object via a minimal HTTP Range request.
 * Used for binary file signature (magic bytes) verification without downloading full objects.
 *
 * @param {object} params
 * @param {string} params.bucket
 * @param {string} params.key
 * @param {number} [params.byteCount=16]
 * @returns {Promise<Buffer>}
 */
export async function getEvidenceObjectHeader({ bucket, key, byteCount = 16 }) {
  const timer = evidenceStorageLatencySeconds.startTimer({ operation: 'get_header' });
  try {
    const s3 = getS3Client();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: `bytes=0-${byteCount - 1}`
    });

    const response = await s3.send(command);
    const stream = response.Body;
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } finally {
    timer();
  }
}

/**
 * Retrieves the full binary content of an S3 object as a Buffer.
 * Used by the server-side biometric pipeline for face detection, quality analysis, and embedding extraction.
 *
 * @param {object} params
 * @param {string} params.bucket
 * @param {string} params.key
 * @returns {Promise<Buffer>}
 */
export async function getEvidenceObjectBuffer({ bucket, key }) {
  const timer = evidenceStorageLatencySeconds.startTimer({ operation: 'get_buffer' });
  try {
    const s3 = getS3Client();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const response = await s3.send(command);
    const stream = response.Body;
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } finally {
    timer();
  }
}


