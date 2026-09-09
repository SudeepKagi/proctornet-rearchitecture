/**
 * @file screenAI.test.js
 * @description Phase 28 Track 2 Screen Inference Engine tests.
 * Validates:
 *  - TEST D: Model asset SHA-256 integrity verification (corrupt payload fails gracefully)
 *  - TEST E: Normal exam false-positive protection (navigation, scrolling, timer, answer options)
 *  - TEST F: UNKNOWN_CONTEXT as low-confidence advisory output
 *  - Non-exam context detection (gaming/social media chromatic dispersion)
 *  - Resource disposal and raw frame lifecycle minimization
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ScreenInferenceEngine,
  DEFAULT_MODEL_CONFIG,
  verifyModelIntegrity,
  computeSha256
} from '../../src/services/screenInferenceEngine.js';

describe('Phase 28 Track 2: ScreenInferenceEngine & False-Positive Protection', () => {
  let engine;

  beforeEach(() => {
    engine = new ScreenInferenceEngine();
  });

  afterEach(() => {
    if (engine) {
      engine.dispose();
    }
  });

  describe('Model Integrity Verification (TEST D)', () => {
    it('initializes successfully with genuine model asset and valid SHA-256', async () => {
      const manifest = await engine.initialize();
      expect(engine.isInitialized).toBe(true);
      expect(manifest.modelId).toBe('mobilenetv3-small-screen-v1');
      expect(manifest.architecture).toContain('MobileNetV3-Small');
    });

    it('TEST D: rejects execution when model asset bytes are corrupted (SHA-256 mismatch)', async () => {
      const corruptConfig = {
        modelUrl: DEFAULT_MODEL_CONFIG.modelUrl,
        expectedSha256: '0000000000000000000000000000000000000000000000000000000000000000'
      };

      await expect(engine.initialize(corruptConfig)).rejects.toThrow(
        /MODEL_INTEGRITY_VERIFICATION_FAILED/
      );
      expect(engine.isInitialized).toBe(false);
    });

    it('computes consistent SHA-256 hashes for strings and buffers', async () => {
      const sample = JSON.stringify({ test: 'proctornet-screen-ai' });
      const hash1 = await computeSha256(sample);
      const hash2 = await computeSha256(new TextEncoder().encode(sample).buffer);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });

  describe('False-Positive Protection (TEST E & TEST F)', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('TEST E: classifies normal examination canvas (question navigation, answers, timer) as EXAM_CONTEXT', async () => {
      // Create representative exam screen: white/light canvas with question text and navigation elements
      const width = 224;
      const height = 224;
      const pixels = new Uint8ClampedArray(width * height * 4);

      for (let i = 0; i < width * height; i++) {
        // High luminance exam canvas (#f8fafc to #ffffff) with some dark text lines
        const isTextLine = (Math.floor(i / width) % 20 === 0) && (i % width > 40 && i % width < 180);
        if (isTextLine) {
          pixels[i * 4] = 30;     // R
          pixels[i * 4 + 1] = 40; // G
          pixels[i * 4 + 2] = 50; // B
        } else {
          pixels[i * 4] = 248;     // R
          pixels[i * 4 + 1] = 250; // G
          pixels[i * 4 + 2] = 252; // B
        }
        pixels[i * 4 + 3] = 255; // Alpha
      }

      const result = await engine.classify({ pixels, width, height });
      expect(result.contextState).toBe('EXAM_CONTEXT');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.inferenceDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('TEST E: normal exam UI transitions (question palette click, answer toggle) do not trigger false anomalies', async () => {
      // Simulate answer selection highlight (blue radio/checkbox accent on light background)
      const width = 224;
      const height = 224;
      const pixels = new Uint8ClampedArray(width * height * 4);

      for (let i = 0; i < width * height; i++) {
        const isSelectedOption = i % width < 30 && Math.floor(i / width) > 80 && Math.floor(i / width) < 110;
        if (isSelectedOption) {
          pixels[i * 4] = 37;      // R (primary blue #2563eb)
          pixels[i * 4 + 1] = 99;  // G
          pixels[i * 4 + 2] = 235; // B
        } else {
          pixels[i * 4] = 255;
          pixels[i * 4 + 1] = 255;
          pixels[i * 4 + 2] = 255;
        }
        pixels[i * 4 + 3] = 255;
      }

      const result = await engine.classify({ pixels, width, height });
      expect(result.contextState).toBe('EXAM_CONTEXT');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('classifies non-exam foreign application screen (gaming/video/social media) as NON_EXAM_CONTEXT', async () => {
      // Dark saturated visual dispersion
      const width = 224;
      const height = 224;
      const pixels = new Uint8ClampedArray(width * height * 4);

      for (let i = 0; i < width * height; i++) {
        pixels[i * 4] = 220;    // Deep red/orange chromatic dispersion
        pixels[i * 4 + 1] = 20;
        pixels[i * 4 + 2] = 10;
        pixels[i * 4 + 3] = 255;
      }

      const result = await engine.classify({ pixels, width, height });
      expect(result.contextState).toBe('NON_EXAM_CONTEXT');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('TEST F: classifies ambiguous or indeterminate layout as UNKNOWN_CONTEXT advisory', async () => {
      // Intermediate luminance and mild saturation
      const width = 224;
      const height = 224;
      const pixels = new Uint8ClampedArray(width * height * 4);

      for (let i = 0; i < width * height; i++) {
        pixels[i * 4] = 80;
        pixels[i * 4 + 1] = 130;
        pixels[i * 4 + 2] = 90;
        pixels[i * 4 + 3] = 255;
      }

      const result = await engine.classify({ pixels, width, height });
      expect(result.contextState).toBe('UNKNOWN_CONTEXT');
      expect(result.confidence).toBeLessThanOrEqual(0.7);
    });

    it('disposes resources and prevents subsequent classification until re-initialized', async () => {
      engine.dispose();
      expect(engine.isInitialized).toBe(false);

      await expect(
        engine.classify({ pixels: new Uint8ClampedArray(10), width: 224, height: 224 })
      ).rejects.toThrow(/not initialized/);
    });
  });
});
