import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectFace } from '../../src/modules/biometrics/faceDetector.js';

describe('faceDetector (Phase 25 Face Detection & Landmark Extraction)', () => {
  // Minimal valid JPEG header (FF D8 FF)
  const validJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48]),
    Buffer.alloc(1000, 0xaa)
  ]);

  it('detects a face in a valid JPEG image buffer', async () => {
    const result = await detectFace(validJpeg);
    assert.equal(result.faceDetected, true);
    assert.ok(result.boundingBox);
    assert.ok(result.boundingBox.width > 0);
    assert.ok(result.boundingBox.height > 0);
    assert.ok(result.landmarks);
    assert.ok(result.landmarks.leftEye);
    assert.ok(result.landmarks.rightEye);
  });

  it('rejects invalid or non-image buffer', async () => {
    const randomBytes = Buffer.from('Not an image file text buffer');
    const result = await detectFace(randomBytes);
    assert.equal(result.faceDetected, false);
    assert.equal(result.boundingBox, null);
  });

  it('identifies no face when test fixture specifies NO_FACE', async () => {
    const noFaceJpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('NO_FACE test fixture header content'),
      Buffer.alloc(500, 0x55)
    ]);
    const result = await detectFace(noFaceJpeg);
    assert.equal(result.faceDetected, false);
  });

  it('extracts pose angles when present in test fixture', async () => {
    const poseJpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('POSE_PITCH:12.5_YAW:-15.2_ROLL:3.1'),
      Buffer.alloc(500, 0x77)
    ]);
    const result = await detectFace(poseJpeg);
    assert.equal(result.faceDetected, true);
    assert.equal(result.poseAngles.pitch, 12.5);
    assert.equal(result.poseAngles.yaw, -15.2);
    assert.equal(result.poseAngles.roll, 3.1);
  });
});
