/**
 * @file evidenceMagicBytes.test.js
 * @description Verifies binary file signature (magic bytes) validation across all 6 Phase 15 evidence types
 * and verifies that spoofed MIME types, PDFs, and malformed binaries are rejected.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateMagicBytes, MIME_EXTENSION_MAP } from '../../src/modules/evidence/evidence.schemas.js';

describe('Phase 18 Security: Evidence Magic Bytes Verification', () => {
  it('should validate valid JPEG magic bytes (FF D8 FF)', () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    assert.equal(validateMagicBytes(jpegBuffer, 'image/jpeg'), true);
  });

  it('should validate valid PNG magic bytes (89 50 4E 47 0D 0A 1A 0A)', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    assert.equal(validateMagicBytes(pngBuffer, 'image/png'), true);
  });

  it('should validate valid WebP magic bytes (RIFF....WEBP)', () => {
    const webpBuffer = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]), // 4 bytes file length
      Buffer.from('WEBP', 'ascii'),
      Buffer.from('VP8 ', 'ascii')
    ]);
    assert.equal(validateMagicBytes(webpBuffer, 'image/webp'), true);
  });

  it('should validate valid WebM audio magic bytes (1A 45 DF A3)', () => {
    const webmBuffer = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]);
    assert.equal(validateMagicBytes(webmBuffer, 'audio/webm'), true);
  });

  it('should validate valid Ogg audio magic bytes (OggS)', () => {
    const oggBuffer = Buffer.concat([
      Buffer.from('OggS', 'ascii'),
      Buffer.from([0x00, 0x02, 0x00, 0x00, 0x00, 0x00])
    ]);
    assert.equal(validateMagicBytes(oggBuffer, 'audio/ogg'), true);
  });

  it('should validate valid WAV audio magic bytes (RIFF....WAVE)', () => {
    const wavBuffer = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]), // 4 bytes file length
      Buffer.from('WAVE', 'ascii'),
      Buffer.from('fmt ', 'ascii')
    ]);
    assert.equal(validateMagicBytes(wavBuffer, 'audio/wav'), true);
  });

  it('should reject spoofed MIME types (e.g. declared image/png but uploaded plain text or HTML)', () => {
    const fakePng = Buffer.from('<script>alert("evil")</script>');
    assert.equal(validateMagicBytes(fakePng, 'image/png'), false);
  });

  it('should reject PDF files spoofed as image or audio (%PDF-1.4)', () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 some pdf binary content');
    assert.equal(validateMagicBytes(pdfBuffer, 'image/jpeg'), false);
    assert.equal(validateMagicBytes(pdfBuffer, 'image/png'), false);
    assert.equal(validateMagicBytes(pdfBuffer, 'image/webp'), false);
    assert.equal(validateMagicBytes(pdfBuffer, 'audio/webm'), false);
    assert.equal(validateMagicBytes(pdfBuffer, 'audio/ogg'), false);
    assert.equal(validateMagicBytes(pdfBuffer, 'audio/wav'), false);
  });

  it('should reject truncated buffers (< 3 bytes)', () => {
    const tinyBuffer = Buffer.from([0xff, 0xd8]);
    assert.equal(validateMagicBytes(tinyBuffer, 'image/jpeg'), false);
  });

  it('should reject unknown or disallowed MIME types', () => {
    const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // 'MZ' executable
    assert.equal(validateMagicBytes(exeBuffer, 'application/x-msdownload'), false);
    assert.equal(validateMagicBytes(exeBuffer, 'application/pdf'), false);
  });

  it('should confirm exact Phase 15 evidence MIME allowlist taxonomy', () => {
    const expectedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'audio/webm',
      'audio/ogg',
      'audio/wav'
    ];
    assert.deepEqual(Object.keys(MIME_EXTENSION_MAP).sort(), expectedTypes.sort());
    assert.equal(MIME_EXTENSION_MAP['application/pdf'], undefined, 'PDF must NOT be present in Phase 15 evidence taxonomy');
  });
});
