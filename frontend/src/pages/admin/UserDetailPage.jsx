/**
 * @file UserDetailPage.jsx
 * @description Administrative inspector for single user account: roles, profiles, security lifecycle, sessions, and audit actions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Button } from '../../components/common/Button.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Alert } from '../../components/common/Alert.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { Input } from '../../components/common/Input.jsx';

export function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Status modal
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('ACTIVE');
  const [statusReason, setStatusReason] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState(null);

  // Password reset modal
  const [tempPasswordModalOpen, setTempPasswordModalOpen] = useState(false);
  const [newTempPassword, setNewTempPassword] = useState('');
  const [copied, setCopied] = useState(false);

  // Role addition modal
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [selectedRoleToAdd, setSelectedRoleToAdd] = useState('INVIGILATOR');
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleError, setRoleError] = useState(null);

  const loadUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminUsersApi.fetchUserDetail(id);
      setUser(data);
    } catch (err) {
      setError(err?.message || 'Failed to load user details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    setStatusLoading(true);
    setStatusError(null);
    try {
      await adminUsersApi.updateUserStatus(id, newStatus, statusReason);
      setStatusModalOpen(false);
      loadUser();
    } catch (err) {
      setStatusError(err?.message || 'Status update failed');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!window.confirm('Reset this user\'s password? A new temporary password will be generated and existing sessions revoked.')) {
      return;
    }
    try {
      const res = await adminUsersApi.resetUserPassword(id);
      setNewTempPassword(res.temporaryPassword);
      setCopied(false);
      setTempPasswordModalOpen(true);
      loadUser();
    } catch (err) {
      alert(`Password reset failed: ${err?.message}`);
    }
  };

  const handleUnlockUser = async () => {
    try {
      await adminUsersApi.unlockUser(id);
      alert('User account unlocked successfully.');
      loadUser();
    } catch (err) {
      alert(`Failed to unlock account: ${err?.message}`);
    }
  };

  const handleAddRole = async (e) => {
    e.preventDefault();
    setRoleLoading(true);
    setRoleError(null);
    try {
      await adminUsersApi.assignUserRole(id, selectedRoleToAdd);
      setRoleModalOpen(false);
      loadUser();
    } catch (err) {
      setRoleError(err?.message || 'Failed to assign role');
    } finally {
      setRoleLoading(false);
    }
  };

  const handleRemoveRole = async (roleToRemove) => {
    if (!window.confirm(`Remove role ${roleToRemove} from this user?`)) return;
    try {
      await adminUsersApi.removeUserRole(id, roleToRemove);
      loadUser();
    } catch (err) {
      alert(`Failed to remove role: ${err?.message}`);
    }
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(newTempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--color-text-muted)' }}>Loading account inspector...</div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div style={{ padding: 'var(--space-xl)', maxWidth: '800px', margin: '0 auto' }}>
        <Alert variant="danger" style={{ marginBottom: 'var(--space-md)' }}>
          {error || 'User not found'}
        </Alert>
        <Button variant="outline" onClick={() => navigate('/admin/users')}>
          ← Back to Users
        </Button>
      </div>
    );
  }

  return (
    <div style={{ padding: 'var(--space-xl)', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <button
          onClick={() => navigate('/admin/users')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-primary)',
            fontSize: '0.875rem',
            cursor: 'pointer',
            padding: 0,
            marginBottom: 'var(--space-xs)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          ← Back to User Roster
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--color-text-base)' }}>
              {user.name}
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
              {user.email} • ID: <code style={{ fontSize: '0.8125rem' }}>{user.userId}</code>
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="outline" onClick={() => setStatusModalOpen(true)}>
              Change Status
            </Button>
            <Button variant="outline" onClick={handleResetPassword}>
              Reset Password
            </Button>
            {user.lockedUntil && new Date(user.lockedUntil) > new Date() && (
              <Button variant="warning" onClick={handleUnlockUser}>
                Unlock Account
              </Button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-lg)' }}>
        {/* Left Column: Account Details & Academic Profiles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <Card style={{ padding: 'var(--space-lg)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 var(--space-md) 0' }}>
              Account & Security Status
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', fontSize: '0.875rem' }}>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.75rem' }}>ACCOUNT STATUS</span>
                <Badge variant={user.status === 'ACTIVE' ? 'success' : 'danger'}>{user.status}</Badge>
                {user.statusReason && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    Reason: {user.statusReason}
                  </div>
                )}
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.75rem' }}>VERIFICATION</span>
                <Badge variant={user.verificationStatus === 'VERIFIED' ? 'success' : 'warning'}>{user.verificationStatus}</Badge>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.75rem' }}>FIRST LOGIN PASSWORD CHANGE</span>
                <strong>{user.mustChangePassword ? '⚠️ Pending Change' : '✓ Completed'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.75rem' }}>ACTIVE SESSIONS</span>
                <strong>{user.activeSessionsCount || 0} active token(s)</strong>
              </div>
            </div>
          </Card>

          {/* Academic Profile Details */}
          {(user.studentProfile || user.facultyProfile) && (
            <Card style={{ padding: 'var(--space-lg)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 var(--space-md) 0' }}>
                Academic Affiliation Profile
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', fontSize: '0.875rem' }}>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.75rem' }}>IDENTIFIER (USN / EMP ID)</span>
                  <strong style={{ fontFamily: 'monospace' }}>
                    {user.studentProfile?.enrollmentNumber || user.facultyProfile?.employeeId || '—'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.75rem' }}>DEPARTMENT / SCHOOL</span>
                  <strong>{user.studentProfile?.department || user.facultyProfile?.department || 'Not submitted'}</strong>
                </div>
                {user.studentProfile && (
                  <div>
                    <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.75rem' }}>CURRENT SEMESTER</span>
                    <strong>{user.studentProfile.semester ? `Semester ${user.studentProfile.semester}` : 'Not submitted'}</strong>
                  </div>
                )}
                {user.facultyProfile && (
                  <div>
                    <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.75rem' }}>OFFICIAL DESIGNATION</span>
                    <strong>{user.facultyProfile.designation || 'Not submitted'}</strong>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Role Management Card */}
        <div>
          <Card style={{ padding: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                Assigned Roles
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setRoleModalOpen(true)}>
                + Add Role
              </Button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(user.roles || []).map((r) => (
                <div
                  key={r}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: 'var(--color-bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-subtle)'
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{r}</span>
                  {user.roles.length > 1 && (
                    <button
                      onClick={() => handleRemoveRole(r)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-danger)',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 'var(--space-md)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              🛡️ <strong>Last-Admin Protection:</strong> The system automatically prevents removal or suspension of the sole active administrator.
            </div>
          </Card>
        </div>
      </div>

      {/* Change Status Modal */}
      <Modal
        isOpen={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title="Change Account Lifecycle Status"
      >
        <form onSubmit={handleStatusSubmit}>
          {statusError && <Alert variant="danger" style={{ marginBottom: 'var(--space-md)' }}>{statusError}</Alert>}
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>Target Status</label>
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
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="DISABLED">DISABLED</option>
            </select>
          </div>
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>Reason (for Audit Log)</label>
            <Input
              id="detail-status-reason"
              required
              placeholder="e.g. Administrative policy check"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button type="button" variant="ghost" onClick={() => setStatusModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={statusLoading}>Update Status</Button>
          </div>
        </form>
      </Modal>

      {/* Role Addition Modal */}
      <Modal
        isOpen={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        title="Assign Role to User"
      >
        <form onSubmit={handleAddRole}>
          {roleError && <Alert variant="danger" style={{ marginBottom: 'var(--space-md)' }}>{roleError}</Alert>}
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>Role</label>
            <select
              value={selectedRoleToAdd}
              onChange={(e) => setSelectedRoleToAdd(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-bg-surface)',
                color: 'var(--color-text-base)'
              }}
            >
              <option value="STUDENT">STUDENT</option>
              <option value="FACULTY">FACULTY</option>
              <option value="INVIGILATOR">INVIGILATOR</option>
              <option value="ADMIN">ADMIN</option>
              <option value="DEVELOPER">DEVELOPER</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button type="button" variant="ghost" onClick={() => setRoleModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={roleLoading}>Assign Role</Button>
          </div>
        </form>
      </Modal>

      {/* Temporary Password Modal */}
      <Modal
        isOpen={tempPasswordModalOpen}
        onClose={() => setTempPasswordModalOpen(false)}
        title="New Temporary Password Generated"
      >
        <div>
          <Alert variant="warning" style={{ marginBottom: 'var(--space-md)' }}>
            <strong>Action Required:</strong> Deliver this temporary password to the user. They will be forced to change it upon first login.
          </Alert>
          <div style={{
            background: 'var(--color-bg-surface)',
            padding: 'var(--space-md)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-subtle)',
            marginBottom: 'var(--space-lg)',
            textAlign: 'center'
          }}>
            <div style={{
              fontFamily: 'monospace',
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--color-primary)'
            }}>
              {newTempPassword}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button type="button" variant="outline" onClick={copyPassword}>
              {copied ? '✓ Copied' : '📋 Copy Password'}
            </Button>
            <Button type="button" variant="primary" onClick={() => setTempPasswordModalOpen(false)}>Done</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
