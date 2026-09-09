import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FaceOvalGuide from '../../src/components/biometrics/FaceOvalGuide.jsx';
import LightingIndicator from '../../src/components/biometrics/LightingIndicator.jsx';
import BiometricGate from '../../src/components/biometrics/BiometricGate.jsx';

describe('Biometrics Components (Phase 25)', () => {
  describe('FaceOvalGuide', () => {
    it('renders guidance message and oval guideline SVG', () => {
      render(<FaceOvalGuide status="aligning" message="Center your face inside the oval" />);
      expect(screen.getByText('Center your face inside the oval')).toBeInTheDocument();
      expect(screen.getByText('Ensure your eyes are visible and lighting is even')).toBeInTheDocument();
    });

    it('displays custom status message', () => {
      render(<FaceOvalGuide status="ready" message="Face detected. Keep still." />);
      expect(screen.getByText('Face detected. Keep still.')).toBeInTheDocument();
    });
  });

  describe('LightingIndicator', () => {
    it('renders lighting indicator badge', () => {
      const dummyVideoRef = { current: null };
      render(<LightingIndicator videoRef={dummyVideoRef} active={false} />);
      expect(screen.getByText('Lighting Good')).toBeInTheDocument();
    });
  });

  describe('BiometricGate', () => {
    beforeEach(() => {
      // Mock getUserMedia
      navigator.mediaDevices = {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }]
        })
      };
    });

    it('renders medical exemption bypass view when isMedicallyExempt is true', () => {
      const onVerified = vi.fn();
      render(
        <BiometricGate
          sessionId="session-123"
          isMedicallyExempt={true}
          onVerified={onVerified}
        />
      );

      expect(screen.getByText('Medical Accommodation Approved')).toBeInTheDocument();
      expect(screen.getByText(/Your profile has been granted an institutional biometric medical exemption/i)).toBeInTheDocument();

      const proceedBtn = screen.getByText('Proceed with Medical Exemption');
      fireEvent.click(proceedBtn);
      expect(onVerified).toHaveBeenCalledWith(expect.objectContaining({ finalStatus: 'EXEMPT', medicalExemption: true }));
    });

    it('initializes camera and renders Begin Biometric Verification button when camera succeeds', async () => {
      render(
        <BiometricGate
          sessionId="session-123"
          isMedicallyExempt={false}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Begin Biometric Verification')).toBeInTheDocument();
      });
      expect(screen.getByText('Biometric Identity Gate')).toBeInTheDocument();
    });
  });
});
