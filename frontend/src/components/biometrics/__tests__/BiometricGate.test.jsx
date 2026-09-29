import { describe, it, expect } from 'vitest';
import { parseBiometricError } from '../BiometricGate.jsx';

describe('BiometricGate - parseBiometricError', () => {
  describe('Structured Error Code Resolution (authoritative contract)', () => {
    it('accurately resolves REFERENCE_DATA_UNAVAILABLE with no-retake guidance', () => {
      const err = {
        status: 422,
        data: {
          code: 'REFERENCE_DATA_UNAVAILABLE',
          message: 'Identity verification failed: Reference biometric data unavailable for match comparison.'
        }
      };
      const parsed = parseBiometricError(err);
      expect(parsed.category).toBe('reference_unavailable');
      expect(parsed.title).toBe('Reference Photo Missing');
      expect(parsed.message).toContain("We don't have a reference photo on file to check against");
      expect(parsed.message).toContain("this isn't something retaking the photo will fix");
    });

    it('accurately resolves SIMILARITY_BELOW_THRESHOLD with lighting and invigilator guidance', () => {
      const err = {
        status: 422,
        data: {
          code: 'SIMILARITY_BELOW_THRESHOLD',
          message: 'Facial match failed (27.6% match, required 88%). Exam entry is not permitted.'
        }
      };
      const parsed = parseBiometricError(err);
      expect(parsed.category).toBe('similarity');
      expect(parsed.title).toBe('Photo Match Inconclusive');
      expect(parsed.message).toContain("We couldn't match this photo to the one on file closely enough");
      expect(parsed.message).toContain('contact your invigilator for a manual check');
    });

    it('accurately resolves FACE_NOT_DETECTED', () => {
      const err = {
        status: 422,
        data: {
          code: 'FACE_NOT_DETECTED',
          message: 'No face detected in the captured snapshot.'
        }
      };
      const parsed = parseBiometricError(err);
      expect(parsed.category).toBe('face_detection');
      expect(parsed.title).toBe('Face Not Detected');
    });

    it('accurately resolves IMAGE_QUALITY_LOW', () => {
      const err = {
        status: 422,
        data: {
          code: 'IMAGE_QUALITY_LOW',
          message: 'Image quality did not meet minimum biometric threshold.'
        }
      };
      const parsed = parseBiometricError(err);
      expect(parsed.category).toBe('lighting');
      expect(parsed.title).toBe('Lighting Needs Adjustment');
    });

    it('accurately resolves IMAGE_FORMAT_INVALID', () => {
      const err = {
        status: 422,
        data: {
          code: 'IMAGE_FORMAT_INVALID',
          message: 'Captured snapshot must be a valid JPEG or PNG image'
        }
      };
      const parsed = parseBiometricError(err);
      expect(parsed.category).toBe('image_format');
      expect(parsed.title).toBe('Image Format Unsupported');
    });

    it('accurately resolves LIVENESS_CHALLENGE_EXPIRED', () => {
      const err = {
        status: 422,
        data: {
          code: 'LIVENESS_CHALLENGE_EXPIRED',
          message: 'Liveness challenge has expired.'
        }
      };
      const parsed = parseBiometricError(err);
      expect(parsed.category).toBe('liveness');
      expect(parsed.title).toBe('Challenge Expired');
    });

    it('accurately resolves MODEL_VERSION_MISMATCH', () => {
      const err = {
        status: 422,
        data: {
          code: 'MODEL_VERSION_MISMATCH',
          message: 'Biometric model version mismatch. Please re-enroll your reference face.'
        }
      };
      const parsed = parseBiometricError(err);
      expect(parsed.category).toBe('model_mismatch');
      expect(parsed.title).toBe('Biometric Profile Outdated');
    });

    it('accurately resolves 403 / BIOMETRIC_VERIFICATION_LOCKED', () => {
      const err = {
        status: 403,
        data: {
          code: 'BIOMETRIC_VERIFICATION_LOCKED',
          message: 'BIOMETRIC_VERIFICATION_LOCKED: Maximum verification attempts exceeded.'
        }
      };
      const parsed = parseBiometricError(err);
      expect(parsed.category).toBe('locked');
      expect(parsed.title).toBe('Identity Check Locked');
    });
  });

  describe('Legacy Free-Text Regex Fallbacks (when errorCode is missing)', () => {
    it('handles legacy reference photo missing message without code', () => {
      const err = {
        status: 422,
        message: 'Identity verification failed: Reference biometric data unavailable for match comparison.'
      };
      const parsed = parseBiometricError(err);
      expect(parsed.category).toBe('reference_unavailable');
      expect(parsed.title).toBe('Reference Photo Missing');
    });

    it('handles legacy facial match shortfall message without code', () => {
      const err = {
        status: 422,
        message: 'Facial match failed (27.6% match, required 88%). Exam entry is not permitted.'
      };
      const parsed = parseBiometricError(err);
      expect(parsed.category).toBe('similarity');
      expect(parsed.title).toBe('Photo Match Inconclusive');
    });

    it('falls back to generic message only when completely unrecognized', () => {
      const err = {
        status: 500,
        message: 'Some unparseable database timeout'
      };
      const parsed = parseBiometricError(err);
      expect(parsed.category).toBe('generic');
      expect(parsed.title).toBe('Verification Failed');
    });
  });
});
