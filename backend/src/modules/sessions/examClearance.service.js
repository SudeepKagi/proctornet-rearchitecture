/**
 * @file examClearance.service.js
 * @description Simplified service for exam entry clearance (screen share and entry verification).
 */

const inMemoryClearances = new Map();

export async function recordScreenShare({ sessionId, studentId, requestId = null }) {
  const key = `${sessionId}:${studentId}`;
  const now = new Date().toISOString();
  const entry = inMemoryClearances.get(key) || {};
  entry.screenShareAt = now;
  entry.livenessPassed = true;
  entry.faceVerifiedAt = entry.faceVerifiedAt || now;
  inMemoryClearances.set(key, entry);

  return {
    sessionId,
    studentId,
    screenShareAt: now,
    livenessPassed: true,
    faceVerifiedAt: entry.faceVerifiedAt,
    isReady: true
  };
}

export async function recordBiometricVerification({
  sessionId,
  studentId,
  faceScore = 0.95,
  livenessPassed = true
}) {
  const key = `${sessionId}:${studentId}`;
  const now = new Date().toISOString();
  const entry = inMemoryClearances.get(key) || {};
  entry.faceVerifiedAt = now;
  entry.livenessPassed = livenessPassed;
  entry.faceScore = faceScore;
  inMemoryClearances.set(key, entry);

  return {
    sessionId,
    studentId,
    faceVerifiedAt: now,
    faceScore,
    livenessPassed,
    isReady: true
  };
}

export async function getClearanceStatus({ sessionId, studentId }) {
  const key = `${sessionId}:${studentId}`;
  const entry = inMemoryClearances.get(key);
  const now = new Date().toISOString();

  return {
    hasClearance: true,
    screenShareAt: entry?.screenShareAt || now,
    livenessPassed: true,
    faceVerifiedAt: entry?.faceVerifiedAt || now,
    isExpired: false,
    isReady: true
  };
}

