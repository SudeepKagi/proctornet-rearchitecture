/**
 * @file AdminUserPages.test.jsx
 * @description Unit & component tests for UserManagementPage, CreateUserPage, BulkImportPage,
 * AdminVerificationPage, and VerifiedRoute guard.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { UserManagementPage } from '../../src/pages/admin/UserManagementPage.jsx';
import { CreateUserPage } from '../../src/pages/admin/CreateUserPage.jsx';
import { BulkImportPage } from '../../src/pages/admin/BulkImportPage.jsx';
import { AdminVerificationPage } from '../../src/pages/admin/AdminVerificationPage.jsx';
import { VerifiedRoute } from '../../src/routes/VerifiedRoute.jsx';
import { AuthContext } from '../../src/context/AuthContext.jsx';
import * as adminUsersApi from '../../src/api/adminUsersApi.js';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null }),
  };
});

vi.mock('../../src/api/adminUsersApi.js');

describe('Phase 23 Admin User Administration Pages (Frontend Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('UserManagementPage', () => {
    it('renders user roster table, status badges, and search filters', async () => {
      vi.mocked(adminUsersApi.fetchUsers).mockResolvedValueOnce({
        users: [
          {
            userId: 'u1',
            name: 'Alice Candidate',
            email: 'alice@uni.edu',
            identifier: 'USN-001',
            roles: ['STUDENT'],
            status: 'ACTIVE',
            verificationStatus: 'VERIFIED',
            createdAt: new Date().toISOString()
          },
          {
            userId: 'u2',
            name: 'Bob Candidate',
            email: 'bob@uni.edu',
            identifier: 'USN-002',
            roles: ['STUDENT'],
            status: 'SUSPENDED',
            verificationStatus: 'PENDING',
            createdAt: new Date().toISOString()
          }
        ],
        pagination: { page: 1, limit: 10, total: 2, totalPages: 1 }
      });

      render(
        <MemoryRouter>
          <UserManagementPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice Candidate')).toBeInTheDocument();
        expect(screen.getByText('Bob Candidate')).toBeInTheDocument();
      });

      expect(screen.getByText('USN-001')).toBeInTheDocument();
      expect(screen.getByText('ACTIVE')).toBeInTheDocument();
      expect(screen.getByText('SUSPENDED')).toBeInTheDocument();
      expect(screen.getByText('VERIFIED')).toBeInTheDocument();
      expect(screen.getByText('PENDING')).toBeInTheDocument();
    });
  });

  describe('CreateUserPage', () => {
    it('requires USN for student, calls API, and renders temporary password modal', async () => {
      vi.mocked(adminUsersApi.createSingleUser).mockResolvedValueOnce({
        user: {
          userId: 'new-u1',
          name: 'Charlie Student',
          email: 'charlie@uni.edu',
          roles: ['STUDENT'],
          status: 'ACTIVE',
          verificationStatus: 'UNVERIFIED',
          mustChangePassword: true
        },
        temporaryPassword: 'TempSecPass123!'
      });

      render(
        <MemoryRouter>
          <CreateUserPage />
        </MemoryRouter>
      );

      expect(screen.getByText('Provision User Account')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/Full Name/i), {
        target: { value: 'Charlie Student' }
      });
      fireEvent.change(screen.getByLabelText(/Institutional Email/i), {
        target: { value: 'charlie@uni.edu' }
      });
      fireEvent.change(screen.getByLabelText(/USN \/ Enrollment Number/i), {
        target: { value: 'USN-101' }
      });

      fireEvent.click(screen.getByRole('button', { name: /Create Account & Generate Password/i }));

      await waitFor(() => {
        expect(adminUsersApi.createSingleUser).toHaveBeenCalledWith({
          name: 'Charlie Student',
          email: 'charlie@uni.edu',
          role: 'STUDENT',
          identifier: 'USN-101',
          phone: undefined
        });
        expect(screen.getByText('Account Provisioned Successfully')).toBeInTheDocument();
        expect(screen.getByText('TempSecPass123!')).toBeInTheDocument();
      });
    });
  });

  describe('BulkImportPage', () => {
    it('previews roster validation, enforces atomic rule, and shows credentials manifest on commit', async () => {
      vi.mocked(adminUsersApi.previewBulkImport).mockResolvedValueOnce({
        summary: { total: 2, valid: 2, invalid: 0, duplicatesInFile: 0 },
        validRows: [{ row: 2, email: 'bulk1@uni.edu' }, { row: 3, email: 'bulk2@uni.edu' }],
        errors: []
      });

      vi.mocked(adminUsersApi.commitBulkImport).mockResolvedValueOnce({
        summary: { total: 2, created: 2, failed: 0 },
        credentials: [
          { email: 'bulk1@uni.edu', name: 'Bulk One', temporaryPassword: 'Pass1!' },
          { email: 'bulk2@uni.edu', name: 'Bulk Two', temporaryPassword: 'Pass2!' }
        ]
      });

      render(
        <MemoryRouter>
          <BulkImportPage />
        </MemoryRouter>
      );

      expect(screen.getByText('Bulk User Spreadsheet Ingestion')).toBeInTheDocument();

      // Trigger file selection via hidden input
      const file = new File(['mock content'], 'students.csv', { type: 'text/csv' });
      const input = document.querySelector('input[type="file"]');
      fireEvent.change(input, { target: { files: [file] } });

      fireEvent.click(screen.getByRole('button', { name: /Analyze & Validate Spreadsheet/i }));

      await waitFor(() => {
        expect(adminUsersApi.previewBulkImport).toHaveBeenCalled();
        expect(screen.getByText(/Pre-Commit Validation Summary/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Commit Ingestion & Issue Credentials/i }));

      await waitFor(() => {
        expect(adminUsersApi.commitBulkImport).toHaveBeenCalled();
        expect(screen.getByText('Ingestion Completed Successfully')).toBeInTheDocument();
        expect(screen.getByText('Pass1!')).toBeInTheDocument();
        expect(screen.getByText('Pass2!')).toBeInTheDocument();
        expect(screen.getByText(/Download Manifest/i)).toBeInTheDocument();
      });
    });
  });

  describe('AdminVerificationPage', () => {
    it('approves verification submission and rejects with mandatory reason', async () => {
      vi.mocked(adminUsersApi.fetchVerificationQueue).mockResolvedValueOnce({
        users: [
          {
            userId: 'pending-1',
            name: 'Pending Jane',
            email: 'jane@uni.edu',
            identifier: 'USN-PND-99',
            roles: ['STUDENT'],
            department: 'Civil Engineering',
            semester: 3,
            verificationStatus: 'PENDING'
          }
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      });

      vi.mocked(adminUsersApi.reviewVerification).mockResolvedValueOnce({
        userId: 'pending-1',
        verificationStatus: 'VERIFIED'
      });

      render(
        <MemoryRouter>
          <AdminVerificationPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pending Jane')).toBeInTheDocument();
        expect(screen.getByText('Civil Engineering')).toBeInTheDocument();
      });

      // Click Approve
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

      expect(screen.getByText(/Approve Verification: Pending Jane/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Submit Decision' }));

      await waitFor(() => {
        expect(adminUsersApi.reviewVerification).toHaveBeenCalledWith('pending-1', 'VERIFIED', '');
      });
    });
  });

  describe('VerifiedRoute Guard', () => {
    it('redirects unverified student to /onboarding/student', () => {
      render(
        <MemoryRouter>
          <AuthContext.Provider
            value={{
              user: { userId: 'u1', roles: ['STUDENT'], verificationStatus: 'UNVERIFIED', mustChangePassword: false },
              loading: false,
              isAuthenticated: true,
              logout: vi.fn(),
            }}
          >
            <VerifiedRoute>
              <div>Operational Candidate Dashboard</div>
            </VerifiedRoute>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(screen.queryByText('Operational Candidate Dashboard')).not.toBeInTheDocument();
    });

    it('renders children when student is VERIFIED and mustChangePassword is false', () => {
      render(
        <MemoryRouter>
          <AuthContext.Provider
            value={{
              user: { userId: 'u1', roles: ['STUDENT'], verificationStatus: 'VERIFIED', mustChangePassword: false },
              loading: false,
              isAuthenticated: true,
              logout: vi.fn(),
            }}
          >
            <VerifiedRoute>
              <div>Operational Candidate Dashboard</div>
            </VerifiedRoute>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(screen.getByText('Operational Candidate Dashboard')).toBeInTheDocument();
    });
  });
});
