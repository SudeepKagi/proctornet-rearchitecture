/**
 * @file OnboardingPages.test.jsx
 * @description Unit & integration tests for FirstLoginPasswordPage, StudentOnboardingPage,
 * FacultyOnboardingPage, VerificationPendingPage, VerificationRejectedPage, and disabled RegisterPage.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { FirstLoginPasswordPage } from '../../src/pages/onboarding/FirstLoginPasswordPage.jsx';
import { StudentOnboardingPage } from '../../src/pages/onboarding/StudentOnboardingPage.jsx';
import { FacultyOnboardingPage } from '../../src/pages/onboarding/FacultyOnboardingPage.jsx';
import { VerificationPendingPage } from '../../src/pages/onboarding/VerificationPendingPage.jsx';
import { VerificationRejectedPage } from '../../src/pages/onboarding/VerificationRejectedPage.jsx';
import { RegisterPage } from '../../src/pages/auth/RegisterPage.jsx';
import { AuthContext } from '../../src/context/AuthContext.jsx';
import * as onboardingApi from '../../src/api/onboardingApi.js';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null }),
  };
});

vi.mock('../../src/api/onboardingApi.js');

describe('Phase 23 Onboarding Pages (Frontend Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FirstLoginPasswordPage', () => {
    it('renders password change form and validates matching passwords with complexity', async () => {
      vi.mocked(onboardingApi.changeFirstLoginPassword).mockResolvedValueOnce({
        success: true,
        mustChangePassword: false
      });

      render(
        <MemoryRouter>
          <AuthContext.Provider
            value={{
              user: { userId: 'u1', name: 'New Student', roles: ['STUDENT'], mustChangePassword: true },
              loading: false,
              isAuthenticated: true,
              logout: vi.fn(),
            }}
          >
            <FirstLoginPasswordPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(screen.getByText('Security Setup Required')).toBeInTheDocument();
      expect(screen.getByText(/At least 12 characters long/i)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/Temporary Password/i), {
        target: { value: 'TempPass1234!' }
      });
      fireEvent.change(screen.getByLabelText(/^New Permanent Password/i), {
        target: { value: 'PermanentPass123!' }
      });
      fireEvent.change(screen.getByLabelText(/Confirm New Password/i), {
        target: { value: 'PermanentPass123!' }
      });

      fireEvent.click(screen.getByRole('button', { name: /Update Password & Continue/i }));

      await waitFor(() => {
        expect(onboardingApi.changeFirstLoginPassword).toHaveBeenCalledWith(
          'TempPass1234!',
          'PermanentPass123!'
        );
      });
    });

    it('rejects short passwords under 12 characters', async () => {
      render(
        <MemoryRouter>
          <AuthContext.Provider
            value={{
              user: { userId: 'u1', name: 'New Student', roles: ['STUDENT'] },
              loading: false,
              isAuthenticated: true,
              logout: vi.fn(),
            }}
          >
            <FirstLoginPasswordPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      fireEvent.change(screen.getByLabelText(/Temporary Password/i), {
        target: { value: 'Temp123!' }
      });
      fireEvent.change(screen.getByLabelText(/^New Permanent Password/i), {
        target: { value: 'Short1!' }
      });
      fireEvent.change(screen.getByLabelText(/Confirm New Password/i), {
        target: { value: 'Short1!' }
      });

      fireEvent.click(screen.getByRole('button', { name: /Update Password & Continue/i }));

      expect(screen.getByText(/Password must be at least 12 characters in length/i)).toBeInTheDocument();
      expect(onboardingApi.changeFirstLoginPassword).not.toHaveBeenCalled();
    });
  });

  describe('StudentOnboardingPage', () => {
    it('pre-fills candidate details, displays Phase 24/25 notice, and submits profile', async () => {
      vi.mocked(onboardingApi.getOnboardingStatus).mockResolvedValueOnce({
        userId: 'u1',
        name: 'Jane Student',
        email: 'jane@university.edu',
        identifier: 'USN-CS-101',
        verificationStatus: 'UNVERIFIED',
        department: null,
        semester: null
      });

      vi.mocked(onboardingApi.submitOnboardingProfile).mockResolvedValueOnce({
        user: { userId: 'u1', verificationStatus: 'PENDING' }
      });

      render(
        <MemoryRouter>
          <AuthContext.Provider
            value={{
              user: { userId: 'u1', name: 'Jane Student', roles: ['STUDENT'] },
              loading: false,
              isAuthenticated: true,
              logout: vi.fn(),
            }}
          >
            <StudentOnboardingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Jane Student')).toBeInTheDocument();
        expect(screen.getByText('USN-CS-101')).toBeInTheDocument();
      });

      // Verify Phase 24/25 identity stub notice is clearly communicated
      expect(screen.getByText(/Biometric & ID Verification Notice/i)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/Academic Department/i), {
        target: { value: 'Computer Science and Engineering' }
      });

      fireEvent.click(screen.getByRole('button', { name: /Submit for Verification/i }));

      await waitFor(() => {
        expect(onboardingApi.submitOnboardingProfile).toHaveBeenCalledWith({
          department: 'Computer Science and Engineering',
          semester: 1,
          phone: undefined
        });
        expect(mockNavigate).toHaveBeenCalledWith('/onboarding/pending', { replace: true });
      });
    });
  });

  describe('FacultyOnboardingPage', () => {
    it('pre-fills faculty details and submits department and designation', async () => {
      vi.mocked(onboardingApi.getOnboardingStatus).mockResolvedValueOnce({
        userId: 'u2',
        name: 'Dr. Alan Turing',
        email: 'turing@university.edu',
        identifier: 'FAC-MATH-01',
        verificationStatus: 'UNVERIFIED',
        department: null,
        designation: null
      });

      vi.mocked(onboardingApi.submitOnboardingProfile).mockResolvedValueOnce({
        user: { userId: 'u2', verificationStatus: 'PENDING' }
      });

      render(
        <MemoryRouter>
          <AuthContext.Provider
            value={{
              user: { userId: 'u2', name: 'Dr. Alan Turing', roles: ['FACULTY'] },
              loading: false,
              isAuthenticated: true,
              logout: vi.fn(),
            }}
          >
            <FacultyOnboardingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Dr. Alan Turing')).toBeInTheDocument();
        expect(screen.getByText('FAC-MATH-01')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/Academic Department/i), {
        target: { value: 'Mathematics & Computer Science' }
      });
      fireEvent.change(screen.getByLabelText(/Academic Designation/i), {
        target: { value: 'Professor' }
      });

      fireEvent.click(screen.getByRole('button', { name: /Submit for Administrative Verification/i }));

      await waitFor(() => {
        expect(onboardingApi.submitOnboardingProfile).toHaveBeenCalledWith({
          department: 'Mathematics & Computer Science',
          designation: 'Professor',
          phone: undefined
        });
        expect(mockNavigate).toHaveBeenCalledWith('/onboarding/pending', { replace: true });
      });
    });
  });

  describe('VerificationPendingPage & VerificationRejectedPage', () => {
    it('renders VerificationPendingPage with review status', async () => {
      vi.mocked(onboardingApi.getOnboardingStatus).mockResolvedValueOnce({
        userId: 'u1',
        verificationStatus: 'PENDING',
        department: 'CS',
        semester: 4
      });

      render(
        <MemoryRouter>
          <AuthContext.Provider
            value={{
              user: { userId: 'u1', roles: ['STUDENT'], verificationStatus: 'PENDING' },
              loading: false,
              isAuthenticated: true,
              logout: vi.fn(),
            }}
          >
            <VerificationPendingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(screen.getByText('Verification Pending')).toBeInTheDocument();
      expect(screen.getByText(/currently under administrative review/i)).toBeInTheDocument();
    });

    it('renders VerificationRejectedPage with reviewer notes and resubmit action', async () => {
      vi.mocked(onboardingApi.getOnboardingStatus).mockResolvedValueOnce({
        userId: 'u1',
        verificationStatus: 'REJECTED',
        verificationNotes: 'USN does not match the registrar records.'
      });

      render(
        <MemoryRouter>
          <AuthContext.Provider
            value={{
              user: { userId: 'u1', roles: ['STUDENT'], verificationStatus: 'REJECTED' },
              loading: false,
              isAuthenticated: true,
              logout: vi.fn(),
            }}
          >
            <VerificationRejectedPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Verification Returned')).toBeInTheDocument();
        expect(screen.getByText('USN does not match the registrar records.')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Update & Resubmit Profile/i }));
      expect(mockNavigate).toHaveBeenCalledWith('/onboarding/student');
    });
  });

  describe('RegisterPage (Public Self-Registration Disabled)', () => {
    it('informs user that self-registration is closed and provides direct sign-in button', () => {
      render(
        <MemoryRouter>
          <RegisterPage />
        </MemoryRouter>
      );

      expect(screen.getByText('Self-Registration Disabled')).toBeInTheDocument();
      expect(screen.getByText(/accounts must be provisioned directly by your institutional administrator/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Go to Sign In/i }));
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });
});
