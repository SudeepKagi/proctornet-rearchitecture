/**
 * @file UserManagementPage.jsx
 * @description Administrative user management dashboard: paginated user roster, filters, search, and user actions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Button } from '../../components/common/Button.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { Alert } from '../../components/common/Alert.jsx';

export function UserManagementPage() {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('');

  // Status Modal state
  const [selectedUser, setSelectedUser] = useState(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('SUSPENDED');
  const [statusReason, setStatusReason] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState(null);

  // Temporary password display modal
  const [tempPasswordModalOpen, setTempPasswordModalOpen] = useState(false);
  const [tempPasswordData, setTempPasswordData] = useState(null);
  const [copied, setCopied] = useState(false);

  const loadUsers = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminUsersApi.fetchUsers({
        page,
        limit: pagination.limit,
        search: search.trim() || undefined,
        role: role || undefined,
        status: status || undefined,
        verification_status: verificationStatus || undefined
      });
      setUsers(data.users || []);
      setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, search, role, status, verificationStatus]);

  useEffect(() => {
    loadUsers(1);
  }, [loadUsers]);

  const handleOpenStatusModal = (user) => {
    setSelectedUser(user);
    setNewStatus(user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');
    setStatusReason('');
    setStatusError(null);
    setStatusModalOpen(true);
  };

  const handleConfirmStatusChange = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    setStatusLoading(true);
    setStatusError(null);
    try {
      await adminUsersApi.updateUserStatus(selectedUser.userId, newStatus, statusReason);
      setStatusModalOpen(false);
      loadUsers(pagination.page);
    } catch (err) {
      setStatusError(err?.message || 'Failed to update account status');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleResetPassword = async (user) => {
    if (!window.confirm(`Generate a new temporary password for ${user.name} (${user.email})? Existing sessions will be revoked.`)) {
      return;
    }
    try {
      const res = await adminUsersApi.resetUserPassword(user.userId);
      setTempPasswordData({
        name: user.name,
        email: user.email,
        temporaryPassword: res.temporaryPassword
      });
      setCopied(false);
      setTempPasswordModalOpen(true);
    } catch (err) {
      alert(`Password reset failed: ${err?.message}`);
    }
  };

  const copyToClipboard = () => {
    if (tempPasswordData?.temporaryPassword) {
      navigator.clipboard.writeText(tempPasswordData.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStatusBadge = (userStatus) => {
    switch (userStatus) {
      case 'ACTIVE': return <Badge variant="success">ACTIVE</Badge>;
      case 'SUSPENDED': return <Badge variant="warning">SUSPENDED</Badge>;
      case 'LOCKED': return <Badge variant="danger">LOCKED</Badge>;
      case 'DISABLED': return <Badge variant="neutral">DISABLED</Badge>;
      default: return <Badge variant="neutral">{userStatus}</Badge>;
    }
  };

  const getVerificationBadge = (vStatus) => {
    switch (vStatus) {
      case 'VERIFIED': return <Badge variant="success">VERIFIED</Badge>;
      case 'PENDING': return <Badge variant="warning">PENDING</Badge>;
      case 'REJECTED': return <Badge variant="danger">REJECTED</Badge>;
      case 'UNVERIFIED': return <Badge variant="neutral">UNVERIFIED</Badge>;
      default: return <Badge variant="neutral">{vStatus}</Badge>;
    }
  };

  return (
    <div style={{ padding: 'var(--space-xl)', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-xl)',
        flexWrap: 'wrap',
        gap: 'var(--space-md)'
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--color-text-base)' }}>
            User & Account Administration
          </h1>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0 0', fontSize: '0.875rem' }}>
            Authoritative provisioning, lifecycle governance, and role security for students, faculty, and administrators.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <Button variant="outline" onClick={() => navigate('/admin/users/bulk')}>
            📁 Bulk Import (.xlsx / .csv)
          </Button>
          <Button variant="primary" onClick={() => navigate('/admin/users/create')}>
            + Create User
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" style={{ marginBottom: 'var(--space-md)' }}>
          {error}
        </Alert>
      )}

      {/* Filter and Search Bar */}
      <Card style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-md)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-md)',
          alignItems: 'end'
        }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>
              SEARCH USERS
            </label>
            <Input
              id="user-search"
              placeholder="Search by name, email, or USN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>
              ROLE
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-bg-surface)',
                color: 'var(--color-text-base)',
                fontSize: '0.875rem'
              }}
            >
              <option value="">All Roles</option>
              <option value="STUDENT">Student</option>
              <option value="FACULTY">Faculty</option>
              <option value="INVIGILATOR">Invigilator</option>
              <option value="ADMIN">Admin</option>
              <option value="DEVELOPER">Developer</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>
              ACCOUNT STATUS
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-bg-surface)',
                color: 'var(--color-text-base)',
                fontSize: '0.875rem'
              }}
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="LOCKED">Locked</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>
              VERIFICATION
            </label>
            <select
              value={verificationStatus}
              onChange={(e) => setVerificationStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-bg-surface)',
                color: 'var(--color-text-base)',
                fontSize: '0.875rem'
              }}
            >
              <option value="">All Verifications</option>
              <option value="VERIFIED">Verified</option>
              <option value="PENDING">Pending Review</option>
              <option value="UNVERIFIED">Unverified</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Users Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>User</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Identifier</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Roles</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Verification</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Created</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    Loading user directory...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No users matching criteria.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.userId}
                    style={{ borderBottom: '1px solid var(--color-border-subtle)', transition: 'background 0.15s' }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-text-base)' }}>{u.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{u.email}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>
                      {u.identifier || '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {(u.roles || []).map((r) => (
                          <Badge key={r} variant="primary" size="sm">{r}</Badge>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {getStatusBadge(u.status)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {getVerificationBadge(u.verificationStatus)}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/admin/users/${u.userId}`)}
                        >
                          Detail
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenStatusModal(u)}
                        >
                          Status
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResetPassword(u)}
                        >
                          Reset PW
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderTop: '1px solid var(--color-border-subtle)',
          background: 'var(--color-bg-surface)',
          fontSize: '0.8125rem',
          color: 'var(--color-text-muted)'
        }}>
          <div>
            Showing {users.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} users
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => loadUsers(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => loadUsers(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Account Status Modal */}
      <Modal
        isOpen={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title={`Change Account Status: ${selectedUser?.name}`}
      >
        <form onSubmit={handleConfirmStatusChange}>
          {statusError && (
            <Alert variant="danger" style={{ marginBottom: 'var(--space-md)' }}>
              {statusError}
            </Alert>
          )}

          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
              Target Status
            </label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-bg-surface)',
                color: 'var(--color-text-base)'
              }}
            >
              <option value="ACTIVE">ACTIVE (Full access)</option>
              <option value="SUSPENDED">SUSPENDED (Revokes active sessions)</option>
              <option value="DISABLED">DISABLED (Permanent deactivation)</option>
              <option value="LOCKED">LOCKED (Temporarily locked)</option>
            </select>
          </div>

          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
              Administrative Reason (Required for Audit Trail)
            </label>
            <Input
              id="status-reason"
              required
              placeholder="e.g. Disciplinary investigation, student leave of absence"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button type="button" variant="ghost" onClick={() => setStatusModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={statusLoading}>
              Save Status
            </Button>
          </div>
        </form>
      </Modal>

      {/* Generated Temporary Password Modal */}
      <Modal
        isOpen={tempPasswordModalOpen}
        onClose={() => setTempPasswordModalOpen(false)}
        title="Temporary Credentials Issued"
      >
        <div>
          <Alert variant="warning" style={{ marginBottom: 'var(--space-md)' }}>
            <strong>Important:</strong> This temporary password will not be displayed again. Transmit it securely to the account holder.
          </Alert>

          <div style={{
            background: 'var(--color-bg-surface)',
            padding: 'var(--space-md)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-subtle)',
            marginBottom: 'var(--space-lg)'
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>ACCOUNT</div>
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>{tempPasswordData?.email}</div>

            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>TEMPORARY PASSWORD</div>
            <div style={{
              fontFamily: 'monospace',
              fontSize: '1.25rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: 'var(--color-primary)',
              wordBreak: 'break-all'
            }}>
              {tempPasswordData?.temporaryPassword}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button type="button" variant="outline" onClick={copyToClipboard}>
              {copied ? '✓ Copied' : '📋 Copy Password'}
            </Button>
            <Button type="button" variant="primary" onClick={() => setTempPasswordModalOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
