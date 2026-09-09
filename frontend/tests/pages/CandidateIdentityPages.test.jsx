/**
 * @file CandidateIdentityPages.test.jsx
 * @description Frontend component tests for CandidateDocumentUploadPage,
 * StudentConfigurationPage, and StudentVerificationDetailModal.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { CandidateDocumentUploadPage } from '../../src/pages/onboarding/CandidateDocumentUploadPage.jsx';
import { StudentConfigurationPage } from '../../src/pages/admin/StudentConfigurationPage.jsx';
import { StudentVerificationDetailModal } from '../../src/components/admin/StudentVerificationDetailModal.jsx';
import { AuthContext } from '../../src/context/AuthContext.jsx';
import * as candidateApi from '../../src/api/candidateIdentityApi.js';
import * as adminUsersApi from '../../src/api/adminUsersApi.js';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

vi.mock('../../src/api/candidateIdentityApi.js');
vi.mock('../../src/api/adminUsersApi.js');

describe('Phase 24 Candidate Identity & Accommodations Frontend UI Tests', () => {
  const mockAuthContext = {
    user: {
      userId: 'student-123',
      name: 'Alice Student',
      email: 'alice@uni.edu',
      roles: ['STUDENT'],
      verificationStatus: 'UNVERIFIED'
    },
    logout: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CandidateDocumentUploadPage', () => {
    it('renders upload form when candidate is unverified and executes full upload cycle', async () => {
      vi.mocked(candidateApi.getCandidateIdentityStatus).mockResolvedValue({
        hasSubmittedDocument: false,
        document: null,
        overallVerificationStatus: 'UNVERIFIED'
      });
      vi.mocked(candidateApi.getCandidateProfile).mockResolvedValue({
        userId: 'student-123',
        name: 'Alice Student',
        email: 'alice@uni.edu'
      });
      vi.mocked(candidateApi.requestDocumentUploadUrl).mockResolvedValue({
        documentId: 'doc-001',
        uploadUrl: 'https://s3.amazonaws.com/test-bucket/doc-001.jpg',
        expiresInSeconds: 300
      });
      vi.mocked(candidateApi.uploadBinaryToS3).mockResolvedValue();
      vi.mocked(candidateApi.confirmDocumentUpload).mockResolvedValue({
        message: 'Document confirmed',
        verificationStatus: 'PENDING'
      });

      render(
        <AuthContext.Provider value={mockAuthContext}>
          <MemoryRouter>
            <CandidateDocumentUploadPage />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      await waitFor(() => {
        expect(screen.getByText('Upload Identity Document')).toBeInTheDocument();
      });

      expect(screen.getByText('Document Type *')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. A12345678')).toBeInTheDocument();

      // Enter document number
      fireEvent.change(screen.getByPlaceholderText('e.g. A12345678'), {
        target: { value: 'PASS-98765' }
      });

      // Select valid file
      const file = new File(['fake-jpg-binary'], 'passport.jpg', { type: 'image/jpeg' });
      const fileInput = screen.getByLabelText(/Click to choose a file/i);
      fireEvent.change(fileInput, { target: { files: [file] } });

      // Click submit
      const submitBtn = screen.getByText('Submit Document for Verification');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(candidateApi.requestDocumentUploadUrl).toHaveBeenCalled();
        expect(candidateApi.uploadBinaryToS3).toHaveBeenCalled();
        expect(candidateApi.confirmDocumentUpload).toHaveBeenCalledWith('doc-001');
      });
    });

    it('renders pending review banner when document status is PENDING', async () => {
      vi.mocked(candidateApi.getCandidateIdentityStatus).mockResolvedValue({
        hasSubmittedDocument: true,
        document: {
          documentId: 'doc-002',
          documentType: 'PASSPORT',
          documentNumberLast4: '4321',
          fullNameOnDocument: 'Alice Student',
          verificationStatus: 'PENDING',
          submittedAt: new Date().toISOString()
        },
        overallVerificationStatus: 'PENDING'
      });
      vi.mocked(candidateApi.getCandidateProfile).mockResolvedValue({
        name: 'Alice Student'
      });

      render(
        <AuthContext.Provider value={mockAuthContext}>
          <MemoryRouter>
            <CandidateDocumentUploadPage />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      await waitFor(() => {
        expect(screen.getByText('Document Under Administrative Review')).toBeInTheDocument();
      });
      expect(screen.getByText('PENDING REVIEW')).toBeInTheDocument();
      expect(screen.getByText(/ending in \*\*\*\*4321/)).toBeInTheDocument();
    });

    it('renders approved status and accommodations when document is APPROVED', async () => {
      vi.mocked(candidateApi.getCandidateIdentityStatus).mockResolvedValue({
        hasSubmittedDocument: true,
        document: {
          documentId: 'doc-003',
          documentType: 'NATIONAL_ID',
          documentNumberLast4: '9999',
          fullNameOnDocument: 'Alice Student',
          verificationStatus: 'APPROVED'
        },
        overallVerificationStatus: 'VERIFIED'
      });
      vi.mocked(candidateApi.getCandidateProfile).mockResolvedValue({
        name: 'Alice Student',
        accommodations: {
          extraTimeMultiplier: 1.50,
          breakAllowanceMinutes: 15,
          maxBreaksAllowed: 2,
          proctoringStrictness: 'STANDARD'
        }
      });

      render(
        <AuthContext.Provider value={mockAuthContext}>
          <MemoryRouter>
            <CandidateDocumentUploadPage />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      await waitFor(() => {
        expect(screen.getByText('Identity Fully Verified')).toBeInTheDocument();
      });
      expect(screen.getByText('APPROVED')).toBeInTheDocument();
      expect(screen.getByText(/1.5x standard exam duration/)).toBeInTheDocument();
      expect(screen.getByText('Go to Candidate Dashboard')).toBeInTheDocument();
    });
  });

  describe('StudentConfigurationPage', () => {
    it('loads current accommodations, edits extra time and saves changes', async () => {
      vi.mocked(adminUsersApi.fetchStudentVerificationDossier).mockResolvedValue({
        user: { name: 'Bob Candidate', enrollmentNumber: 'USN-CS101', email: 'bob@uni.edu' }
      });
      vi.mocked(adminUsersApi.fetchStudentConfiguration).mockResolvedValue({
        extraTimeMultiplier: '1.25',
        breakAllowanceMinutes: 10,
        maxBreaksAllowed: 1,
        assistiveTechnology: { screenReader: false, speechToText: false, keyboardOnly: false },
        proctoringStrictness: 'STANDARD',
        updatedAt: new Date().toISOString()
      });
      vi.mocked(adminUsersApi.updateStudentConfiguration).mockResolvedValue({
        updatedAt: new Date().toISOString()
      });

      render(
        <MemoryRouter initialEntries={['/admin/students/bob-123/configuration']}>
          <Routes>
            <Route path="/admin/students/:id/configuration" element={<StudentConfigurationPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Per-Student Accommodations & Strictness')).toBeInTheDocument();
      });
      expect(screen.getByText(/Bob Candidate/)).toBeInTheDocument();

      // Change multiplier input
      const multiplierInput = screen.getByDisplayValue('1.25');
      fireEvent.change(multiplierInput, { target: { value: '1.50' } });

      // Save accommodations
      const saveBtn = screen.getByText('Save Accommodations');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(adminUsersApi.updateStudentConfiguration).toHaveBeenCalledWith('bob-123', expect.objectContaining({
          extraTimeMultiplier: 1.50
        }));
      });
    });
  });

  describe('StudentVerificationDetailModal', () => {
    it('renders candidate dossier, displays document preview and handles approval', async () => {
      vi.mocked(adminUsersApi.fetchStudentVerificationDossier).mockResolvedValue({
        user: { name: 'Carol Candidate', email: 'carol@uni.edu', enrollmentNumber: 'USN-C01', verificationStatus: 'PENDING' },
        activeDocument: {
          documentId: 'doc-carol',
          documentType: 'PASSPORT',
          documentNumberLast4: '7777',
          fullNameOnDocument: 'Carol Candidate',
          submittedAt: new Date().toISOString()
        }
      });
      vi.mocked(adminUsersApi.fetchStudentDocumentPreview).mockResolvedValue({
        previewUrl: 'https://s3.amazonaws.com/test-bucket/preview.jpg',
        mimeType: 'image/jpeg',
        expiresInSeconds: 300
      });
      vi.mocked(adminUsersApi.reviewStudentVerification).mockResolvedValue({
        verificationStatus: 'VERIFIED'
      });

      const onReviewSuccess = vi.fn();
      const onClose = vi.fn();

      render(
        <MemoryRouter>
          <StudentVerificationDetailModal
            studentId="carol-123"
            isOpen={true}
            onClose={onClose}
            onReviewSuccess={onReviewSuccess}
          />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Candidate Verification Dossier')).toBeInTheDocument();
      });
      expect(screen.getByText('Document Preview')).toBeInTheDocument();
      expect(screen.getByAltText('Candidate Identity Document')).toBeInTheDocument();
      expect(screen.getByText('****7777')).toBeInTheDocument();

      // Click Approve
      const approveBtn = screen.getByText('✓ Approve');
      fireEvent.click(approveBtn);

      await waitFor(() => {
        expect(adminUsersApi.reviewStudentVerification).toHaveBeenCalledWith('carol-123', 'APPROVED', expect.any(String));
        expect(onReviewSuccess).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      });
    });
  });
});
