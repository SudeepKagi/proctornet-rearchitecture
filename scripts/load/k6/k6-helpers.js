/**
 * @file k6-helpers.js
 * @description Reusable helper functions for ProctorNet k6 load test scenarios.
 * Implements anti-tamper payload signing, deterministic candidate assignment,
 * and standard header generation.
 */

import crypto from 'k6/crypto';
import http from 'k6/http';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
export const BENCHMARK_PASSWORD = __ENV.BENCHMARK_PASSWORD || 'BenchPass#123!';

/**
 * Generates an RFC4122 v4 compliant UUID in pure JavaScript for k6.
 * @returns {string} UUID string
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Canonical JSON stringifier matching backend canonical serialization.
 * Ensures consistent key ordering and no extraneous whitespaces.
 * @param {any} val
 * @returns {string}
 */
export function canonicalJson(val) {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return `[${val.map(canonicalJson).join(',')}]`;
  }
  const sortedKeys = Object.keys(val).sort();
  const items = sortedKeys
    .filter((k) => val[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(val[k])}`);
  return `{${items.join(',')}}`;
}

/**
 * Generates valid ProctorNet anti-tamper signature headers.
 * Conforms to Step 13.5 HMAC-SHA256 protocol.
 *
 * @param {string} signingKey Candidate attempt signing key
 * @param {string} method HTTP method (e.g. 'PUT', 'POST')
 * @param {string} path Endpoint path (e.g. '/api/v1/attempts/:id/answers/:qid')
 * @param {object|string} body Request payload
 * @returns {{ header: string, bodyStr: string }}
 */
export function generateAntiTamperHeader(signingKey, method, path, body) {
  const timestamp = Date.now();
  const nonce = generateUUID();
  const bodyStr = typeof body === 'string' ? body : canonicalJson(body);
  const bodySha256 = crypto.sha256(bodyStr, 'hex');
  const stringToSign = `${timestamp}.${nonce}.${method.toUpperCase()}.${path}.${bodySha256}`;
  const signature = crypto.hmac('sha256', signingKey, stringToSign, 'hex');

  return {
    header: `t=${timestamp},nonce=${nonce},v1=${signature}`,
    bodyStr
  };
}

/**
 * Deterministically maps a virtual user (VU ID) to a candidate in the fixture pool.
 * @param {Array} candidates
 * @param {number} vuId
 * @returns {object} Candidate record
 */
export function getCandidateForVU(candidates, vuId) {
  if (!candidates || candidates.length === 0) {
    throw new Error('Candidate fixtures are empty or uninitialized');
  }
  const idx = (vuId - 1) % candidates.length;
  return candidates[idx];
}

/**
 * Returns a random integer between min and max inclusive.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns a random item from an array.
 * @param {Array} arr
 * @returns {any}
 */
export function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Authenticates a benchmark candidate dynamically at runtime.
 * Tokens are never persisted to disk or artifacts.
 *
 * @param {string} email
 * @param {string} password
 * @param {string} [baseUrl]
 * @returns {{ token: string, userId: string }}
 */
export function loginCandidate(email, password, baseUrl) {
  const url = `${baseUrl || BASE_URL}/api/v1/auth/login`;
  const res = http.post(url, JSON.stringify({ email, password: password || BENCHMARK_PASSWORD }), {
    headers: { 'Content-Type': 'application/json' }
  });
  if (res.status !== 200) {
    throw new Error(`Login failed for candidate ${email}: ${res.status} ${res.body}`);
  }
  const body = res.json();
  const token = body?.data?.accessToken || body?.data?.tokens?.accessToken;
  const userId = body?.data?.user?.userId || body?.data?.user?.user_id;
  if (!token) {
    throw new Error(`Login response missing accessToken for ${email}: ${res.body}`);
  }
  return { token, userId };
}

/**
 * Retrieves attempt context and runtime anti-tamper signing token.
 *
 * @param {string} token JWT access token
 * @param {string} attemptId Attempt UUID
 * @param {string} [baseUrl]
 * @returns {{ antiTamperToken: string, questions: Array }}
 */
export function getAttemptContext(token, attemptId, baseUrl) {
  const url = `${baseUrl || BASE_URL}/api/v1/attempts/${attemptId}`;
  const res = http.get(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status !== 200) {
    throw new Error(`Get attempt failed for ${attemptId}: ${res.status} ${res.body}`);
  }
  const body = res.json();
  return {
    antiTamperToken: body.data.anti_tamper_token,
    questions: body.data.questions || []
  };
}

/**
 * Starts an exam attempt for Mode B (Real Lifecycle Benchmark).
 *
 * @param {string} token JWT access token
 * @param {string} sessionId Session UUID
 * @param {string} [baseUrl]
 * @returns {{ attemptId: string, antiTamperToken: string, totalQuestions: number }}
 */
export function startAttempt(token, sessionId, baseUrl) {
  const url = `${baseUrl || BASE_URL}/api/v1/attempts/start`;
  const res = http.post(url, JSON.stringify({ sessionId: sessionId }), {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Start attempt failed: ${res.status} ${res.body}`);
  }
  const body = res.json();
  return {
    attemptId: body.data.attempt_id,
    antiTamperToken: body.data.anti_tamper_token,
    totalQuestions: body.data.total_questions
  };
}
