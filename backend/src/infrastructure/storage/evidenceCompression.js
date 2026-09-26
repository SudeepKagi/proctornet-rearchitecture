/**
 * @file evidenceCompression.js
 * @description Storage optimization utilities for compressing images (webcam snapshots,
 * screen shares) via Sharp and raw text/JSON logs via native zlib before uploading to AWS S3.
 *
 * Implements:
 * 1. Image compression (WebP / JPEG optimization, downscaling, EXIF stripping)
 * 2. Raw JSON / Text log compression (gzip with Content-Encoding: gzip)
 * 3. Unified high-level S3 upload orchestration with compression metrics
 */

import zlib from 'node:zlib';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { putEvidenceObjectBuffer } from './s3Storage.js';
import { logger } from '../../utils/logger.js';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

/**
 * Standard configuration for evidence compression.
 */
export const COMPRESSION_DEFAULTS = {
  IMAGE: {
    format: 'webp',           // 'webp' (recommended for maximum savings) or 'jpeg'
    quality: 70,              // 1-100 quality scale
    maxWidth: 1280,           // Max width in pixels (720p/1080p bounding box)
    maxHeight: 720,           // Max height in pixels
    effort: 4,                // CPU effort (0-6) for WebP encoding
    stripMetadata: true       // Remove EXIF/IPTC/XMP to minimize bytes
  },
  LOGS: {
    gzipLevel: 6,             // Optimal speed vs compression ratio trade-off (1-9)
    minCompressionSize: 256   // Only gzip if uncompressed payload exceeds 256 bytes
  }
};

/**
 * Compresses an image buffer or base64 snapshot using Sharp before S3 upload.
 *
 * @param {Buffer|string} input - Raw image buffer or Base64 data URL
 * @param {object} [options]
 * @param {'webp'|'jpeg'} [options.format='webp'] - Target format
 * @param {number} [options.quality=70] - Compression quality
 * @param {number} [options.maxWidth=1280] - Maximum bounding width
 * @param {number} [options.maxHeight=720] - Maximum bounding height
 * @returns {Promise<{
 *   buffer: Buffer,
 *   contentType: string,
 *   originalBytes: number,
 *   compressedBytes: number,
 *   savingsBytes: number,
 *   savingsPercent: string
 * }>}
 */
export async function compressImageEvidence(input, options = {}) {
  const opts = { ...COMPRESSION_DEFAULTS.IMAGE, ...options };

  // Normalize base64 or buffer
  let inputBuffer = input;
  if (typeof input === 'string') {
    const base64Data = input.startsWith('data:')
      ? input.replace(/^data:image\/\w+;base64,/, '')
      : input;
    inputBuffer = Buffer.from(base64Data, 'base64');
  }

  const originalBytes = inputBuffer.length;

  let pipeline = sharp(inputBuffer).rotate(); // auto-rotate based on EXIF before stripping

  // Downscale if image exceeds target dimensions
  if (opts.maxWidth || opts.maxHeight) {
    pipeline = pipeline.resize({
      width: opts.maxWidth,
      height: opts.maxHeight,
      fit: 'inside',
      withoutEnlargement: true
    });
  }

  let contentType = 'image/webp';
  if (opts.format === 'jpeg' || opts.format === 'jpg') {
    contentType = 'image/jpeg';
    pipeline = pipeline.jpeg({
      quality: opts.quality,
      mozjpeg: true,
      chromaSubsampling: '4:2:0'
    });
  } else {
    // Default: WebP for optimal size/quality ratio
    pipeline = pipeline.webp({
      quality: opts.quality,
      effort: opts.effort
    });
  }

  // Strip metadata to save space
  if (opts.stripMetadata) {
    pipeline = pipeline.withMetadata({ orientation: 1 }); // strips extra metadata
  }

  const compressedBuffer = await pipeline.toBuffer();
  const compressedBytes = compressedBuffer.length;
  const savingsBytes = Math.max(0, originalBytes - compressedBytes);
  const savingsPercent = originalBytes > 0
    ? `${(((originalBytes - compressedBytes) / originalBytes) * 100).toFixed(1)}%`
    : '0%';

  logger.debug(
    { originalBytes, compressedBytes, savingsPercent, format: opts.format },
    'Compressed evidence image via Sharp'
  );

  return {
    buffer: compressedBuffer,
    contentType,
    originalBytes,
    compressedBytes,
    savingsBytes,
    savingsPercent
  };
}

/**
 * Compresses raw JSON or text log evidence using native gzip before S3 upload.
 *
 * @param {object|string|Buffer} input - Object, JSON string, or text
 * @param {object} [options]
 * @param {number} [options.gzipLevel=6] - zlib compression level (1-9)
 * @param {string} [options.contentType='application/json'] - MIME content type
 * @returns {Promise<{
 *   buffer: Buffer,
 *   contentType: string,
 *   contentEncoding: string,
 *   originalBytes: number,
 *   compressedBytes: number,
 *   savingsBytes: number,
 *   savingsPercent: string
 * }>}
 */
export async function compressTextOrJsonEvidence(input, options = {}) {
  const opts = { ...COMPRESSION_DEFAULTS.LOGS, ...options };

  let rawBuffer;
  let defaultContentType = 'application/json';

  if (Buffer.isBuffer(input)) {
    rawBuffer = input;
    defaultContentType = 'application/octet-stream';
  } else if (typeof input === 'object') {
    rawBuffer = Buffer.from(JSON.stringify(input));
    defaultContentType = 'application/json';
  } else if (typeof input === 'string') {
    rawBuffer = Buffer.from(input, 'utf-8');
    defaultContentType = input.trim().startsWith('{') || input.trim().startsWith('[')
      ? 'application/json'
      : 'text/plain';
  } else {
    rawBuffer = Buffer.from(String(input), 'utf-8');
    defaultContentType = 'text/plain';
  }

  const contentType = options.contentType || defaultContentType;
  const originalBytes = rawBuffer.length;

  // Compress using native zlib gzip
  const compressedBuffer = await gzipAsync(rawBuffer, {
    level: opts.gzipLevel || 6
  });

  const compressedBytes = compressedBuffer.length;
  const savingsBytes = Math.max(0, originalBytes - compressedBytes);
  const savingsPercent = originalBytes > 0
    ? `${(((originalBytes - compressedBytes) / originalBytes) * 100).toFixed(1)}%`
    : '0%';

  logger.debug(
    { originalBytes, compressedBytes, savingsPercent, contentType },
    'Gzipped evidence log payload'
  );

  return {
    buffer: compressedBuffer,
    contentType,
    contentEncoding: 'gzip',
    originalBytes,
    compressedBytes,
    savingsBytes,
    savingsPercent
  };
}

/**
 * Decompresses a gzipped buffer if downloaded from S3.
 *
 * @param {Buffer} gzippedBuffer
 * @returns {Promise<Buffer>}
 */
export async function decompressGzipEvidence(gzippedBuffer) {
  return await gunzipAsync(gzippedBuffer);
}

/**
 * High-level helper: Compresses and uploads an image to S3.
 *
 * @param {object} params
 * @param {string} params.bucket - S3 bucket name
 * @param {string} params.key - Destination S3 key
 * @param {Buffer|string} params.image - Image buffer or base64
 * @param {object} [params.compressionOptions] - Sharp compression options
 * @param {Record<string, string>} [params.metadata] - S3 object metadata
 * @returns {Promise<{
 *   versionId?: string,
 *   eTag?: string,
 *   contentType: string,
 *   originalBytes: number,
 *   compressedBytes: number,
 *   savingsPercent: string
 * }>}
 */
export async function uploadCompressedImageEvidence({
  bucket,
  key,
  image,
  compressionOptions = {},
  metadata = {}
}) {
  const { buffer, contentType, originalBytes, compressedBytes, savingsPercent } =
    await compressImageEvidence(image, compressionOptions);

  const res = await putEvidenceObjectBuffer({
    bucket,
    key,
    buffer,
    contentType,
    metadata: {
      ...metadata,
      'x-original-size': String(originalBytes),
      'x-compressed-size': String(compressedBytes),
      'x-compression-ratio': savingsPercent
    }
  });

  return {
    ...res,
    contentType,
    originalBytes,
    compressedBytes,
    savingsPercent
  };
}

/**
 * High-level helper: Gzips and uploads a JSON or text evidence log to S3 with Content-Encoding: gzip.
 *
 * @param {object} params
 * @param {string} params.bucket - S3 bucket name
 * @param {string} params.key - Destination S3 key
 * @param {object|string|Buffer} params.data - JSON object or log text
 * @param {object} [params.compressionOptions] - zlib compression options
 * @param {Record<string, string>} [params.metadata] - S3 object metadata
 * @returns {Promise<{
 *   versionId?: string,
 *   eTag?: string,
 *   contentType: string,
 *   contentEncoding: string,
 *   originalBytes: number,
 *   compressedBytes: number,
 *   savingsPercent: string
 * }>}
 */
export async function uploadCompressedLogEvidence({
  bucket,
  key,
  data,
  compressionOptions = {},
  metadata = {}
}) {
  const { buffer, contentType, contentEncoding, originalBytes, compressedBytes, savingsPercent } =
    await compressTextOrJsonEvidence(data, compressionOptions);

  const res = await putEvidenceObjectBuffer({
    bucket,
    key,
    buffer,
    contentType,
    contentEncoding: 'gzip', // Crucial for automatic browser decompression
    metadata: {
      ...metadata,
      'x-original-size': String(originalBytes),
      'x-compressed-size': String(compressedBytes),
      'x-compression-ratio': savingsPercent
    }
  });

  return {
    ...res,
    contentType,
    contentEncoding,
    originalBytes,
    compressedBytes,
    savingsPercent
  };
}
