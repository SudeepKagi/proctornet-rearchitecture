import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMBEDDING_DIMENSION,
  validateVector,
  l2Norm,
  normalizeVector,
  cosineSimilarity,
  VectorMathError
} from '../../src/modules/biometrics/vectorMath.js';

describe('vectorMath (Phase 25 Biometric Vector Contract)', () => {
  it('validates a valid 128-dimensional vector', () => {
    const valid = Array.from({ length: 128 }, (_, i) => (i + 1) * 0.01);
    assert.equal(validateVector(valid), true);
  });

  it('rejects vectors with dimension other than 128', () => {
    const shortVec = Array.from({ length: 64 }, () => 0.5);
    const longVec = Array.from({ length: 512 }, () => 0.5);

    assert.throws(
      () => validateVector(shortVec),
      (err) => err instanceof VectorMathError && err.code === 'DIMENSION_MISMATCH'
    );

    assert.throws(
      () => validateVector(longVec),
      (err) => err instanceof VectorMathError && err.code === 'DIMENSION_MISMATCH'
    );
  });

  it('rejects vectors containing NaN or Infinity', () => {
    const nanVec = Array.from({ length: 128 }, () => 0.1);
    nanVec[42] = NaN;

    assert.throws(
      () => validateVector(nanVec),
      (err) => err instanceof VectorMathError && err.code === 'NON_FINITE_ELEMENT'
    );

    const infVec = Array.from({ length: 128 }, () => 0.1);
    infVec[10] = Infinity;

    assert.throws(
      () => validateVector(infVec),
      (err) => err instanceof VectorMathError && err.code === 'NON_FINITE_ELEMENT'
    );
  });

  it('rejects zero vectors', () => {
    const zeroVec = Array.from({ length: 128 }, () => 0.0);
    assert.throws(
      () => validateVector(zeroVec),
      (err) => err instanceof VectorMathError && err.code === 'ZERO_VECTOR'
    );
  });

  it('computes L2 norm and normalizes vector to unit length', () => {
    const rawVec = Array.from({ length: 128 }, () => 2.0);
    const norm = l2Norm(rawVec);
    // sqrt(128 * 4) = sqrt(512) ≈ 22.627
    assert.ok(Math.abs(norm - Math.sqrt(128 * 4)) < 1e-6);

    const unitVec = normalizeVector(rawVec);
    assert.equal(unitVec.length, 128);

    const unitNorm = l2Norm(unitVec);
    assert.ok(Math.abs(unitNorm - 1.0) < 1e-6);
  });

  it('computes cosine similarity accurately', () => {
    const v1 = Array.from({ length: 128 }, () => 1.0);
    const v2 = Array.from({ length: 128 }, () => 1.0);
    // Identical vectors -> similarity = 1.0
    const simIdentical = cosineSimilarity(v1, v2);
    assert.ok(Math.abs(simIdentical - 1.0) < 1e-6);

    // Opposite vectors -> similarity = -1.0
    const vOpposite = Array.from({ length: 128 }, () => -1.0);
    const simOpposite = cosineSimilarity(v1, vOpposite);
    assert.ok(Math.abs(simOpposite - -1.0) < 1e-6);

    // Orthogonal vectors -> similarity = 0.0
    const vOrth1 = Array.from({ length: 128 }, (_, i) => (i < 64 ? 1.0 : 0.0));
    const vOrth2 = Array.from({ length: 128 }, (_, i) => (i >= 64 ? 1.0 : 0.0));
    const simOrth = cosineSimilarity(vOrth1, vOrth2);
    assert.ok(Math.abs(simOrth - 0.0) < 1e-6);
  });
});
