import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFrames } from '../../src/modules/biometrics/livenessAnalyzer.js';

describe('livenessAnalyzer (Phase 25 Anti-Spoofing & Liveness Analysis)', () => {
  function createMockFrame(actionTag = null, isSpoof = null, seed = 1) {
    const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    let tag = '';
    if (actionTag) tag += `ACTION:${actionTag} `;
    if (isSpoof) tag += `${isSpoof} `;
    const tagBuf = Buffer.from(tag);

    // Frame body with minor dynamic variance
    const body = Buffer.alloc(1000);
    for (let i = 0; i < 1000; i++) {
      body[i] = (i * 7 + seed * 13) % 256;
    }

    return Buffer.concat([header, tagBuf, body]);
  }

  it('passes when valid natural frames match expected actions', async () => {
    const frames = [
      createMockFrame(null, null, 1),
      createMockFrame('HEAD_TURN_LEFT', null, 2),
      createMockFrame('BLINK', null, 3),
      createMockFrame(null, null, 4)
    ];

    const expectedActions = ['HEAD_TURN_LEFT', 'BLINK'];
    const result = await analyzeFrames(frames, expectedActions);

    assert.ok(result.passiveLivenessScore >= 0.70);
    assert.ok(result.activeActionScore >= 0.75);
    assert.equal(result.passedThreshold, true);
    assert.deepEqual(result.observedActions, ['HEAD_TURN_LEFT', 'BLINK']);
  });

  it('fails active check when candidate performs wrong action sequence', async () => {
    const frames = [
      createMockFrame('HEAD_TURN_RIGHT', null, 1),
      createMockFrame('SMILE', null, 2)
    ];

    const expectedActions = ['HEAD_TURN_LEFT', 'BLINK'];
    const result = await analyzeFrames(frames, expectedActions);

    assert.equal(result.passedThreshold, false);
    assert.ok(result.activeActionScore < 0.50);
  });

  it('fails passive check on printed photo spoof fixture', async () => {
    // Static identical frames with PRINT_SPOOF tag
    const staticFrame = createMockFrame(null, 'PRINT_SPOOF', 1);
    const frames = [staticFrame, staticFrame, staticFrame];

    const result = await analyzeFrames(frames, ['BLINK']);
    assert.equal(result.passedThreshold, false);
    assert.ok(result.passiveLivenessScore < 0.50);
  });

  it('fails passive check on screen replay spoof fixture', async () => {
    const screenFrame = createMockFrame(null, 'SCREEN_REPLAY_SPOOF', 1);
    const frames = [screenFrame, screenFrame];

    const result = await analyzeFrames(frames, []);
    assert.equal(result.passedThreshold, false);
    assert.ok(result.passiveLivenessScore < 0.50);
  });
});
