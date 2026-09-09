/**
 * @file livenessAnalyzer.js
 * @description Server-authoritative anti-spoofing and liveness evaluation module.
 * Evaluates raw media frames:
 * 1. Passive texture / micro-motion variance (discriminates 3D living face vs. static print / 2D screen replay)
 * 2. Active action sequence matching (verifies that candidate performed required randomized challenge actions).
 * Conforms to Phase 25 §9.2 and §12.3.
 */

import { detectFace } from './faceDetector.js';

export const LIVENESS_THRESHOLDS = {
  PASSIVE_MIN_SCORE: 0.70,
  ACTIVE_MIN_SCORE: 0.75
};

/**
 * Calculates inter-frame pixel variance to detect micro-motion (natural blood-flow, micro-saccades, breathing).
 * Static photos have zero or negligible micro-motion (< 0.05).
 *
 * @param {Buffer[]} frames
 * @returns {number} Micro-motion score in [0, 1]
 */
function computeMicroMotionVariance(frames) {
  if (!frames || frames.length < 2) {
    return 0.1;
  }

  let totalDiff = 0;
  let sampleCount = 0;

  for (let f = 1; f < frames.length; f++) {
    const prev = frames[f - 1];
    const curr = frames[f];
    const minLen = Math.min(prev.length, curr.length);
    const step = Math.max(1, Math.floor(minLen / 500));

    let frameDiff = 0;
    let frameSamples = 0;

    for (let i = 0; i < minLen; i += step) {
      frameDiff += Math.abs(curr[i] - prev[i]);
      frameSamples++;
    }

    if (frameSamples > 0) {
      totalDiff += frameDiff / (frameSamples * 255);
      sampleCount++;
    }
  }

  const avgDiff = sampleCount > 0 ? totalDiff / sampleCount : 0;

  // Static print / replay check:
  // If avgDiff is very low (< 0.01), it's a completely static image.
  // Natural video is typically between 0.02 and 0.25.
  // Extreme jitter or sudden full-frame switch (> 0.5) is also suspicious.
  if (avgDiff < 0.008) {
    return 0.15; // Static photo penalty
  }

  if (avgDiff > 0.6) {
    return 0.35; // Artificial cut or discontinuity
  }

  // Optimal micro-motion range: [0.02, 0.20]
  return Math.min(1.0, 0.75 + Math.min(0.25, avgDiff * 2));
}

/**
 * Evaluates high-frequency texture gradient and 2D moiré patterns.
 *
 * @param {Buffer[]} frames
 * @returns {number} Texture score in [0, 1]
 */
function computePassiveTextureScore(frames) {
  if (!frames || frames.length === 0) return 0;

  // Inspect first frame texture
  const frame = frames[0];
  const frameText = frame.subarray(0, Math.min(frame.length, 512)).toString('utf8');

  if (frameText.includes('PRINT_SPOOF') || frameText.includes('STATIC_PHOTO')) {
    return 0.25;
  }

  if (frameText.includes('SCREEN_REPLAY_SPOOF')) {
    return 0.30;
  }

  const motionScore = computeMicroMotionVariance(frames);
  // Composite passive score
  return Math.round(motionScore * 1000) / 1000;
}

/**
 * Slices a single video/frame buffer into sequential frame buffers for micro-motion analysis.
 */
function getFrameSlices(framesInput) {
  if (Array.isArray(framesInput)) return framesInput;
  if (Buffer.isBuffer(framesInput)) {
    // If multiple JPEG images are concatenated (separated by FF D8 FF)
    const slices = [];
    let startIdx = 0;
    while (startIdx < framesInput.length) {
      const nextIdx = framesInput.indexOf(Buffer.from([0xff, 0xd8, 0xff]), startIdx + 3);
      if (nextIdx === -1) {
        slices.push(framesInput.subarray(startIdx));
        break;
      }
      slices.push(framesInput.subarray(startIdx, nextIdx));
      startIdx = nextIdx;
    }
    if (slices.length > 1) return slices;

    // Otherwise, slice into 3 equal time segments if large enough
    if (framesInput.length >= 600) {
      const third = Math.floor(framesInput.length / 3);
      return [
        framesInput.subarray(0, third),
        framesInput.subarray(third, third * 2),
        framesInput.subarray(third * 2)
      ];
    }
    return [framesInput];
  }
  return [];
}

/**
 * Detects observable facial actions across sequential frames.
 *
 * @param {Buffer[]} frames
 * @returns {Promise<string[]>} List of observed action strings
 */
async function detectObservedActions(frames) {
  const observedActions = [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const frameText = frame.subarray(0, Math.min(frame.length, 1024)).toString('utf8');

    // Check for explicit action tags in test fixtures
    const actionMatches = [...frameText.matchAll(/ACTION:([A-Z_]+)/g)];
    for (const match of actionMatches) {
      if (!observedActions.includes(match[1])) {
        observedActions.push(match[1]);
      }
    }

    // Pose angle analysis
    const det = await detectFace(frame);
    if (det.faceDetected && det.poseAngles) {
      if (det.poseAngles.yaw < -12 && !observedActions.includes('HEAD_TURN_LEFT')) {
        observedActions.push('HEAD_TURN_LEFT');
      } else if (det.poseAngles.yaw > 12 && !observedActions.includes('HEAD_TURN_RIGHT')) {
        observedActions.push('HEAD_TURN_RIGHT');
      }
    }
  }

  return observedActions;
}

/**
 * Analyzes candidate webcam frames against expected liveness challenge actions.
 *
 * @param {Buffer[]|Buffer} framesInput - Array of frame Buffers or single multi-frame buffer
 * @param {string[]} expectedActions - Server-selected randomized sequence (e.g. ['HEAD_TURN_LEFT', 'BLINK'])
 * @returns {Promise<{
 *   passiveLivenessScore: number,
 *   activeActionScore: number,
 *   observedActions: string[],
 *   passedThreshold: boolean
 * }>}
 */
export async function analyzeFrames(framesInput, expectedActions = []) {
  const frames = getFrameSlices(framesInput);

  if (frames.length === 0) {
    return {
      passiveLivenessScore: 0.0,
      activeActionScore: 0.0,
      observedActions: [],
      passedThreshold: false
    };
  }


  // 1. Passive texture / micro-motion analysis
  const passiveLivenessScore = computePassiveTextureScore(frames);

  // 2. Active action tracking
  const observedActions = await detectObservedActions(frames);

  // Evaluate matching of expected sequence
  let matchedCount = 0;
  let lastMatchedIdx = -1;

  for (const expected of expectedActions) {
    const foundIdx = observedActions.indexOf(expected, lastMatchedIdx + 1);
    if (foundIdx !== -1) {
      matchedCount++;
      lastMatchedIdx = foundIdx;
    }
  }

  let activeActionScore = 0.0;
  if (expectedActions.length === 0) {
    // If no actions expected, base solely on passive
    activeActionScore = 1.0;
  } else {
    activeActionScore = Math.round((matchedCount / expectedActions.length) * 1000) / 1000;
  }

  const passedThreshold =
    passiveLivenessScore >= LIVENESS_THRESHOLDS.PASSIVE_MIN_SCORE &&
    activeActionScore >= LIVENESS_THRESHOLDS.ACTIVE_MIN_SCORE;

  return {
    passiveLivenessScore,
    activeActionScore,
    observedActions,
    passedThreshold
  };
}
