import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLaplacianVariance,
  computeIlluminationScore,
  computePoseScore,
  evaluateImageQuality
} from '../../src/modules/biometrics/qualityAnalyzer.js';

describe('qualityAnalyzer (Phase 25 Biometric Quality Pre-Flight)', () => {
  it('computes low Laplacian variance on flat uniform image and higher on checkerboard', () => {
    const width = 10;
    const height = 10;

    // Flat uniform pixels -> variance should be 0
    const flat = new Uint8Array(width * height).fill(128);
    const flatVar = computeLaplacianVariance(flat, width, height);
    assert.equal(flatVar, 0);

    // High frequency pattern -> variance > 0
    const checker = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        checker[y * width + x] = (x + y) % 2 === 0 ? 255 : 0;
      }
    }
    const checkerVar = computeLaplacianVariance(checker, width, height);
    assert.ok(checkerVar > 100);
  });

  it('computes illumination score penalizing underexposure and overexposure', () => {
    // Optimal lighting (~128)
    const optimal = new Uint8Array(100).fill(128);
    const optimalScore = computeIlluminationScore(optimal);
    assert.ok(optimalScore >= 0.95);

    // Underexposed (~20)
    const dark = new Uint8Array(100).fill(20);
    const darkScore = computeIlluminationScore(dark);
    assert.ok(darkScore < 0.4);

    // Overexposed (~245)
    const bright = new Uint8Array(100).fill(245);
    const brightScore = computeIlluminationScore(bright);
    assert.ok(brightScore < 0.4);
  });

  it('computes pose score rewarding frontal alignment and penalizing extreme tilt', () => {
    // Frontal: 0, 0, 0
    const frontal = computePoseScore({ pitch: 0, yaw: 0, roll: 0 });
    assert.equal(frontal, 1.0);

    // Extreme turn: yaw = 30 deg (exceeds max 20)
    const turned = computePoseScore({ pitch: 0, yaw: 30, roll: 0 });
    assert.ok(turned < 0.7);
  });

  it('evaluates composite image quality Q', () => {
    const quality = evaluateImageQuality({
      sharpnessScore: 350.0,
      illuminationScore: 0.95,
      poseAngles: { pitch: 2.0, yaw: 1.5, roll: 0.5 }
    });

    assert.ok(quality.qualityScore >= 0.85);
    assert.ok(quality.sharpnessScore === 350.0);
    assert.ok(quality.illuminationScore === 0.95);
  });
});
