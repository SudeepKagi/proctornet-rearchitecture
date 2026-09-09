/**
 * @file qualityAnalyzer.js
 * @description Analyzes image quality metrics for biometric face captures:
 * Laplacian variance (sharpness), illumination balance, pose bounds, and composite Q score.
 * Conforms to Phase 25 §9 and §11 specification.
 */

export const QUALITY_WEIGHTS = {
  SHARPNESS: 0.40,
  ILLUMINATION: 0.35,
  POSE: 0.25
};

export const POSE_THRESHOLDS = {
  MAX_PITCH_DEG: 20.0,
  MAX_YAW_DEG: 20.0,
  MAX_ROLL_DEG: 15.0
};

export const SHARPNESS_BENCHMARKS = {
  MIN_ACCEPTABLE_LAPLACIAN_VAR: 80.0,
  OPTIMAL_LAPLACIAN_VAR: 300.0
};

/**
 * Computes the Laplacian variance across an 8-bit grayscale pixel grid.
 * Laplacian kernel:
 * [ 0,  1,  0]
 * [ 1, -4,  1]
 * [ 0,  1,  0]
 *
 * @param {Uint8Array|number[]} grayscale - Grayscale pixel array
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {number} Variance of the Laplacian (higher means sharper edges)
 */
export function computeLaplacianVariance(grayscale, width, height) {
  if (!grayscale || grayscale.length === 0) {
    return 0;
  }

  // Derive safe grid dimensions that do not exceed array length
  let w = width;
  let h = height;
  if (!w || !h || w * h > grayscale.length) {
    const dim = Math.floor(Math.sqrt(grayscale.length));
    w = dim;
    h = dim;
  }

  if (w < 3 || h < 3) {
    return 0;
  }

  const laplacian = [];
  let sum = 0;

  for (let y = 1; y < h - 1; y++) {
    const rowOffset = y * w;
    const prevRow = (y - 1) * w;
    const nextRow = (y + 1) * w;

    for (let x = 1; x < w - 1; x++) {
      const center = grayscale[rowOffset + x];
      const top = grayscale[prevRow + x];
      const bottom = grayscale[nextRow + x];
      const left = grayscale[rowOffset + x - 1];
      const right = grayscale[rowOffset + x + 1];

      if (
        center === undefined ||
        top === undefined ||
        bottom === undefined ||
        left === undefined ||
        right === undefined
      ) {
        continue;
      }

      const lapVal = top + bottom + left + right - 4 * center;
      laplacian.push(lapVal);
      sum += lapVal;
    }
  }


  const n = laplacian.length;
  if (n === 0) return 0;

  const mean = sum / n;
  let sumSquaredDiff = 0;
  for (let i = 0; i < n; i++) {
    const diff = laplacian[i] - mean;
    sumSquaredDiff += diff * diff;
  }

  return sumSquaredDiff / n;
}

/**
 * Evaluates illumination quality from grayscale pixel data.
 * Ideal lighting is in the 100-160 range, penalizing underexposure (<50) and overexposure (>210).
 *
 * @param {Uint8Array|number[]} grayscale
 * @returns {number} Illumination score in [0.000, 1.000]
 */
export function computeIlluminationScore(grayscale) {
  if (!grayscale || grayscale.length === 0) return 0;

  let sum = 0;
  for (let i = 0; i < grayscale.length; i++) {
    sum += grayscale[i];
  }
  const meanLuminance = sum / grayscale.length;

  // Ideal target: ~128
  // Quadratic falloff from 128 to 0 or 255
  const deviation = Math.abs(meanLuminance - 128);
  const score = Math.max(0, 1 - Math.pow(deviation / 128, 1.5));
  return Math.round(score * 1000) / 1000;
}

/**
 * Evaluates head pose compliance from pitch, yaw, and roll angles (in degrees).
 *
 * @param {{ pitch: number, yaw: number, roll: number }} poseAngles
 * @returns {number} Pose score in [0.000, 1.000]
 */
export function computePoseScore(poseAngles) {
  if (!poseAngles) return 0;

  const { pitch = 0, yaw = 0, roll = 0 } = poseAngles;

  const pitchRatio = Math.min(1.0, Math.abs(pitch) / POSE_THRESHOLDS.MAX_PITCH_DEG);
  const yawRatio = Math.min(1.0, Math.abs(yaw) / POSE_THRESHOLDS.MAX_YAW_DEG);
  const rollRatio = Math.min(1.0, Math.abs(roll) / POSE_THRESHOLDS.MAX_ROLL_DEG);

  // Mean adherence
  const penalty = (pitchRatio + yawRatio + rollRatio) / 3.0;
  const score = Math.max(0, 1.0 - penalty);
  return Math.round(score * 1000) / 1000;
}

/**
 * Computes composite quality score Q combining sharpness, illumination, and pose.
 *
 * @param {object} params
 * @param {number} params.sharpnessScore - Raw Laplacian variance
 * @param {number} params.illuminationScore - Illumination score [0, 1]
 * @param {{ pitch: number, yaw: number, roll: number }} params.poseAngles
 * @returns {{ qualityScore: number, sharpnessScore: number, illuminationScore: number, posePitch: number, poseYaw: number, poseRoll: number }}
 */
export function evaluateImageQuality({
  sharpnessScore,
  illuminationScore,
  poseAngles = { pitch: 0, yaw: 0, roll: 0 }
}) {
  const safeSharpness = Math.min(99999.99, Math.max(0, Number(sharpnessScore) || 0));

  // Normalize sharpness score into [0, 1]
  const normalizedSharpness = Math.min(
    1.0,
    Math.max(0, safeSharpness / SHARPNESS_BENCHMARKS.OPTIMAL_LAPLACIAN_VAR)
  );

  const poseScore = computePoseScore(poseAngles);

  const compositeQ =
    QUALITY_WEIGHTS.SHARPNESS * normalizedSharpness +
    QUALITY_WEIGHTS.ILLUMINATION * (Number(illuminationScore) || 0) +
    QUALITY_WEIGHTS.POSE * poseScore;

  const qualityScore = Math.max(0, Math.min(1.0, Math.round(compositeQ * 1000) / 1000));

  return {
    qualityScore,
    sharpnessScore: Math.round(safeSharpness * 100) / 100,
    illuminationScore: Math.round((Number(illuminationScore) || 0) * 1000) / 1000,
    posePitch: Math.round((poseAngles.pitch || 0) * 100) / 100,
    poseYaw: Math.round((poseAngles.yaw || 0) * 100) / 100,
    poseRoll: Math.round((poseAngles.roll || 0) * 100) / 100
  };
}

