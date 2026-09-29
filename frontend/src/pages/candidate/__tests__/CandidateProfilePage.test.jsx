import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CandidateProfilePage } from '../CandidateProfilePage.jsx';
import * as candidateIdentityApi from '../../../api/candidateIdentityApi.js';
import * as biometricsApi from '../../../api/biometricsApi.js';
import * as authHook from '../../../hooks/useAuth.js';

describe('CandidateProfilePage Component', () => {
  const mockUser = {
    userId: 'user-123',
    name: 'Alice Student',
    email: 'alice@institution.edu',
    roles: ['STUDENT'],
    verificationStatus: 'VERIFIED'
  };

  const mockProfile = {
    userId: 'user-123',
    name: 'Alice Student',
    email: 'alice@institution.edu',
    phone: '+1 555-0100',
    enrollmentNumber: 'ENR-2026-001',
    department: 'Computer Science',
    semester: 4,
    version: 1,
    verificationStatus: 'VERIFIED',
    enrolledFacePhotoUrl: 'https://s3.example.com/presigned-photo-get-url',
    accommodations: {
      extraTimeMultiplier: 1.0,
      breakAllowanceMinutes: 0,
      maxBreaksAllowed: 0,
      proctoringStrictness: 'STANDARD'
    }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authHook, 'useAuth').mockReturnValue({ user: mockUser });
    vi.spyOn(candidateIdentityApi, 'getCandidateProfile').mockResolvedValue(mockProfile);
    vi.spyOn(biometricsApi, 'getEnrollmentStatus').mockResolvedValue({
      isEnrolled: true,
      enrollmentStatus: 'ENROLLED'
    });
  });

  it('renders student profile details with read-only badges for academic and email info', async () => {
    render(
      <MemoryRouter>
        <CandidateProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Alice Student' })).toBeInTheDocument();
    });

    expect(screen.getAllByText('alice@institution.edu').length).toBeGreaterThan(0);
    expect(screen.getByText('ENR-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.getAllByText(/4th Semester/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Profile Version: 1')).toBeInTheDocument();

    // Verify Admin-Locked or Read-Only badges
    const adminLockedBadges = screen.getAllByText('Admin Locked');
    expect(adminLockedBadges.length).toBeGreaterThan(0);
    expect(screen.getByText('Institutional / Read-only')).toBeInTheDocument();
  });

  it('handles dirty tracking on profile edit and submits expected_version', async () => {
    const updateSpy = vi.spyOn(candidateIdentityApi, 'updateCandidateProfile').mockResolvedValue({
      ...mockProfile,
      name: 'Alice Updated',
      phone: '+1 555-9999',
      version: 2
    });

    render(
      <MemoryRouter>
        <CandidateProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Edit Details')).toBeInTheDocument();
    });

    // Enter edit mode
    fireEvent.click(screen.getByText('Edit Details'));

    const nameInput = screen.getByPlaceholderText('Your full legal name');
    const saveButton = screen.getByRole('button', { name: /save changes/i });

    // Initially clean -> Save button should be disabled
    expect(saveButton).toBeDisabled();

    // Modify name -> marks dirty
    fireEvent.change(nameInput, { target: { value: 'Alice Updated' } });
    expect(saveButton).not.toBeDisabled();

    // Submit save
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({
        name: 'Alice Updated',
        phone: '+1 555-0100',
        expected_version: 1
      });
    });
  });

  it('handles 409 OCC version conflict and renders reload prompt', async () => {
    const conflictErr = new Error('Profile conflict');
    conflictErr.status = 409;
    conflictErr.data = {
      code: 'VERSION_CONFLICT',
      message: 'Profile was updated concurrently in another session. Please reload.'
    };

    vi.spyOn(candidateIdentityApi, 'updateCandidateProfile').mockRejectedValue(conflictErr);

    render(
      <MemoryRouter>
        <CandidateProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Edit Details')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Edit Details'));
    const nameInput = screen.getByPlaceholderText('Your full legal name');
    fireEvent.change(nameInput, { target: { value: 'Conflicting Name' } });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Profile Concurrency Conflict')).toBeInTheDocument();
      expect(screen.getByText(/Profile was updated concurrently/i)).toBeInTheDocument();
      expect(screen.getByText('Reload Latest Profile')).toBeInTheDocument();
    });
  });

  it('validates password requirements and changes password successfully', async () => {
    const changePasswordSpy = vi.spyOn(candidateIdentityApi, 'changePassword').mockResolvedValue({
      success: true,
      revokedOtherSessionsCount: 2
    });

    render(
      <MemoryRouter>
        <CandidateProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Change Password')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Change Password'));

    const currentPwd = screen.getByPlaceholderText('••••••••');
    const newPwd = screen.getByPlaceholderText('Min. 8 characters');
    const confirmPwd = screen.getByPlaceholderText('Re-type new password');
    const submitBtn = screen.getByRole('button', { name: /update password/i });

    // Fill mismatch
    fireEvent.change(currentPwd, { target: { value: 'OldPass123' } });
    fireEvent.change(newPwd, { target: { value: 'NewPass123' } });
    fireEvent.change(confirmPwd, { target: { value: 'MismatchPass' } });
    fireEvent.click(submitBtn);

    expect(screen.getByText('New passwords do not match')).toBeInTheDocument();
    expect(changePasswordSpy).not.toHaveBeenCalled();

    // Fill valid matching
    fireEvent.change(confirmPwd, { target: { value: 'NewPass123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(changePasswordSpy).toHaveBeenCalledWith({
        currentPassword: 'OldPass123',
        newPassword: 'NewPass123'
      });
      expect(screen.getByText(/Password updated successfully/i)).toBeInTheDocument();
    });
  });

  it('opens photo re-enrollment modal with live webcam capture prompt', async () => {
    // Mock navigator.mediaDevices.getUserMedia
    const mockGetUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }]
    });
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      configurable: true
    });

    render(
      <MemoryRouter>
        <CandidateProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update photo/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /update photo/i }));

    await waitFor(() => {
      expect(screen.getByText('Capture Reference Face Photo')).toBeInTheDocument();
      expect(screen.getByText(/Live webcam capture is required/i)).toBeInTheDocument();
    });
  });
});
