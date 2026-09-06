/**
 * @file attempts.shuffler.js
 * @description Pure deterministic seeded PRNG and Fisher-Yates permutation for exam question mapping.
 * Conforms to Step 13.5 & Master Development Plan Phase 6 requirements.
 * Free of external I/O, database access, Math.random(), or non-deterministic behavior.
 */

import crypto from 'node:crypto';

/**
 * Computes a 32-bit MurmurHash3 hash of a string.
 * @param {string} key
 * @param {number} [seed=0]
 * @returns {number} 32-bit unsigned integer
 */
export function murmurhash3_32_gc(key, seed = 0) {
  let remainder = key.length & 3;
  let bytes = key.length - remainder;
  let h1 = seed;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  let i = 0;

  while (i < bytes) {
    let k1 =
      (key.charCodeAt(i) & 0xff) |
      ((key.charCodeAt(++i) & 0xff) << 8) |
      ((key.charCodeAt(++i) & 0xff) << 16) |
      ((key.charCodeAt(++i) & 0xff) << 24);
    ++i;

    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = Math.imul(h1, 5) + 0xe6546b64;
  }

  let k1 = 0;

  switch (remainder) {
    case 3:
      k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
    // falls through
    case 2:
      k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
    // falls through
    case 1:
      k1 ^= key.charCodeAt(i) & 0xff;
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      h1 ^= k1;
  }

  h1 ^= key.length;

  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}

/**
 * Generates a deterministic 32-bit unsigned integer seed from composite context strings.
 * Combines SHA-256 hashing with MurmurHash3_32.
 * @param {string} sessionId
 * @param {string} studentId
 * @param {string} topicId
 * @returns {number} 32-bit unsigned integer seed
 */
export function generateSeed(sessionId, studentId, topicId) {
  const combinedKey = `${sessionId}:${studentId}:${topicId}`;
  const shaHash = crypto.createHash('sha256').update(combinedKey).digest('hex');
  return murmurhash3_32_gc(shaHash, 0);
}

/**
 * Creates a deterministic Mulberry32 pseudo-random number generator.
 * @param {number} seed - 32-bit unsigned integer
 * @returns {() => number} Function returning uniform float in [0, 1)
 */
export function createMulberry32PRNG(seed) {
  let s = seed >>> 0;
  return function nextRandom() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically shuffles an array using the Fisher-Yates algorithm and a seeded PRNG.
 * Does not mutate the original array.
 * @template T
 * @param {readonly T[]} array
 * @param {number} seed
 * @returns {T[]} Deterministically shuffled copy of array
 */
export function seededFisherYatesShuffle(array, seed) {
  const copy = [...array];
  if (copy.length <= 1) {
    return copy;
  }

  const rng = createMulberry32PRNG(seed);

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }

  return copy;
}

/**
 * Selects count questions from a candidate question pool using deterministic seeded shuffling.
 * @template T
 * @param {readonly T[]} candidateQuestions - Pre-sorted stable candidate question pool
 * @param {number} count - Required question count
 * @param {number} seed - Deterministic 32-bit seed
 * @returns {T[]} Exactly count selected questions in deterministic order
 */
export function selectQuestionsDeterministically(candidateQuestions, count, seed) {
  if (count <= 0) {
    return [];
  }
  if (candidateQuestions.length < count) {
    throw new Error(
      `Insufficient question pool size (${candidateQuestions.length}) for requested count (${count})`
    );
  }

  const shuffled = seededFisherYatesShuffle(candidateQuestions, seed);
  return shuffled.slice(0, count);
}
