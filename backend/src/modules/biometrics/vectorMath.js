/**
 * @file vectorMath.js
 * @description Biometric vector mathematics module for 128-dimensional float embeddings.
 * Provides L2 normalization, dimension and finiteness validation, and cosine similarity computation.
 * Conforms strictly to Phase 25 Biometric Vector Contract (§10).
 */

export const EMBEDDING_DIMENSION = 128;
const EPSILON = 1e-12;

export class VectorMathError extends Error {
  constructor(message, code = 'INVALID_VECTOR') {
    super(message);
    this.name = 'VectorMathError';
    this.code = code;
  }
}

/**
 * Validates that an embedding vector conforms strictly to the 128-d contract:
 * - Must be an array or typed array
 * - Length must be exactly 128
 * - All elements must be finite numbers (no NaN, Infinity, -Infinity)
 * - L2 norm must be strictly greater than 0 (zero vector is rejected)
 *
 * @param {number[]|Float32Array|Float64Array} vector
 * @returns {boolean} true if valid
 * @throws {VectorMathError} if vector violates contract
 */
export function validateVector(vector) {
  if (!vector || (!Array.isArray(vector) && !ArrayBuffer.isView(vector))) {
    throw new VectorMathError('Vector must be an array or typed array', 'INVALID_TYPE');
  }

  if (vector.length !== EMBEDDING_DIMENSION) {
    throw new VectorMathError(
      `Vector dimension mismatch: expected exactly ${EMBEDDING_DIMENSION}, got ${vector.length}`,
      'DIMENSION_MISMATCH'
    );
  }

  let sumSquares = 0;
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    const val = vector[i];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      throw new VectorMathError(
        `Vector contains non-finite or invalid element at index ${i}: ${val}`,
        'NON_FINITE_ELEMENT'
      );
    }
    sumSquares += val * val;
  }

  if (sumSquares <= EPSILON) {
    throw new VectorMathError('Vector norm is zero or near-zero', 'ZERO_VECTOR');
  }

  return true;
}

/**
 * Computes the Euclidean (L2) norm of a vector.
 *
 * @param {number[]|Float32Array|Float64Array} vector
 * @returns {number} L2 norm
 */
export function l2Norm(vector) {
  validateVector(vector);
  let sumSquares = 0;
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    sumSquares += vector[i] * vector[i];
  }
  return Math.sqrt(sumSquares);
}

/**
 * Computes the L2-normalized representation of a 128-d vector:
 * \hat{u} = u / ||u||_2
 *
 * @param {number[]|Float32Array|Float64Array} vector
 * @returns {number[]} 128-d array of normalized float numbers
 */
export function normalizeVector(vector) {
  validateVector(vector);
  const norm = l2Norm(vector);
  const normalized = new Array(EMBEDDING_DIMENSION);
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    normalized[i] = vector[i] / norm;
  }
  return normalized;
}

/**
 * Computes the cosine similarity between two 128-d vectors.
 * If vectors are already L2-normalized, cosine similarity equals their dot product:
 * cos(theta) = (u . v) / (||u|| * ||v||)
 * Result is clamped to [-1.0000, 1.0000].
 *
 * @param {number[]} v1 - First vector
 * @param {number[]} v2 - Second vector
 * @returns {number} Cosine similarity score in range [-1.0, 1.0]
 */
export function cosineSimilarity(v1, v2) {
  validateVector(v1);
  validateVector(v2);

  let dotProduct = 0;
  let norm1Sq = 0;
  let norm2Sq = 0;

  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    const a = v1[i];
    const b = v2[i];
    dotProduct += a * b;
    norm1Sq += a * a;
    norm2Sq += b * b;
  }

  const denominator = Math.sqrt(norm1Sq) * Math.sqrt(norm2Sq);
  if (denominator <= EPSILON) {
    return 0.0;
  }

  const similarity = dotProduct / denominator;
  // Numerical clamp to [-1.0, 1.0]
  return Math.max(-1.0, Math.min(1.0, similarity));
}
