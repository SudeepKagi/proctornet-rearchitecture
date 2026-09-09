/**
 * @file documentMagicBytes.test.js
 * @description Level 1 unit tests for binary file signature (magic byte) validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateDocumentMagicBytes } from '../../../src/modules/candidate/candidateIdentity.schemas.js';

describe('Document Magic Bytes Validation (Level 1)', () => {
  it('validates JPEG files with FF D8 FF signature', () => {
    const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    assert.equal(validateDocumentMagicBytes(validJpeg, 'image/jpeg'), true);

    const invalidJpeg = Buffer.from([0x00, 0xd8, 0xff, 0xe0]);
    assert.equal(validateDocumentMagicBytes(invalidJpeg, 'image/jpeg'), false);
  });

  it('validates PNG files with 89 50 4E 47 0D 0A 1A 0A signature', () => {
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    assert.equal(validateDocumentMagicBytes(validPng, 'image/png'), true);

    const corruptPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
    assert.equal(validateDocumentMagicBytes(corruptPng, 'image/png'), false);
  });

  it('validates PDF files with 25 50 44 46 (%PDF) signature', () => {
    const validPdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]); // %PDF-1.5
    assert.equal(validateDocumentMagicBytes(validPdf, 'application/pdf'), true);

    const invalidPdf = Buffer.from([0x25, 0x50, 0x00, 0x00]);
    assert.equal(validateDocumentMagicBytes(invalidPdf, 'application/pdf'), false);
  });

  it('rejects text or script files disguised as images or PDFs', () => {
    const textFile = Buffer.from('<!DOCTYPE html><html><body>malicious</body></html>');
    assert.equal(validateDocumentMagicBytes(textFile, 'image/jpeg'), false);
    assert.equal(validateDocumentMagicBytes(textFile, 'image/png'), false);
    assert.equal(validateDocumentMagicBytes(textFile, 'application/pdf'), false);

    const bashScript = Buffer.from('#!/bin/bash\necho test\n');
    assert.equal(validateDocumentMagicBytes(bashScript, 'image/jpeg'), false);
    assert.equal(validateDocumentMagicBytes(bashScript, 'application/pdf'), false);
  });

  it('handles empty or truncated buffers safely without throwing', () => {
    assert.equal(validateDocumentMagicBytes(Buffer.alloc(0), 'image/jpeg'), false);
    assert.equal(validateDocumentMagicBytes(Buffer.from([0xff]), 'image/jpeg'), false);
    assert.equal(validateDocumentMagicBytes(null, 'image/jpeg'), false);
    assert.equal(validateDocumentMagicBytes(undefined, 'image/png'), false);
  });
});
