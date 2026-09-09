import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractEmbedding,
  loadAndVerifyModel,
  PINNED_MODEL_VERSION,
  PINNED_MODEL_SHA256,
  EmbeddingExtractionError
} from '../../src/modules/biometrics/embeddingExtractor.js';
import { validateVector, l2Norm } from '../../src/modules/biometrics/vectorMath.js';

describe('embeddingExtractor (Phase 25 Server-Side Biometric Embedding Extraction)', () => {
  const validJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
    Buffer.alloc(2000, 0x88)
  ]);

  const boundingBox = { x: 100, y: 80, width: 320, height: 380 };

  it('loads and validates model artifact against pinned SHA-256 hash', () => {
    const model = loadAndVerifyModel();
    assert.equal(model.version, PINNED_MODEL_VERSION);
    assert.equal(model.dimension, 128);
    assert.ok(Array.isArray(model.projectionMatrix));
    assert.equal(model.projectionMatrix.length, 128);
  });

  it('extracts exactly 128-d L2-normalized float embedding', async () => {
    const result = await extractEmbedding(validJpeg, boundingBox);
    assert.ok(result.embedding);
    assert.equal(result.embedding.length, 128);
    assert.equal(result.modelVersion, PINNED_MODEL_VERSION);
    assert.ok(typeof result.inferenceMs === 'number');

    // Strictly validate 128-d contract
    assert.equal(validateVector(result.embedding), true);

    // Verify unit norm (L2 norm = 1.0)
    const norm = l2Norm(result.embedding);
    assert.ok(Math.abs(norm - 1.0) < 1e-5);
  });

  it('is completely deterministic on identical image input', async () => {
    const res1 = await extractEmbedding(validJpeg, boundingBox);
    const res2 = await extractEmbedding(validJpeg, boundingBox);

    assert.deepEqual(res1.embedding, res2.embedding);
  });

  it('rejects missing or invalid bounding box', async () => {
    await assert.rejects(
      () => extractEmbedding(validJpeg, null),
      (err) => err instanceof EmbeddingExtractionError && err.code === 'INVALID_BOUNDING_BOX'
    );

    await assert.rejects(
      () => extractEmbedding(validJpeg, { x: 0, y: 0, width: 0, height: 0 }),
      (err) => err instanceof EmbeddingExtractionError && err.code === 'INVALID_BOUNDING_BOX'
    );
  });
});
