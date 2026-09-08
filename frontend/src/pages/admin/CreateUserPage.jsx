/**
 * @file CreateUserPage.jsx
 * @description Administrative user provisioning page for individual Student, Faculty, Invigilator, or Admin accounts.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Button } from '../../components/common/Button.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Alert } from '../../components/common/Alert.jsx';
import { Modal } from '../../components/common/Modal.jsx';

export function CreateUserPage() {
  const navigate = useNavigate();

  const [role, setRole] = useState('STUDENT');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [phone, setPhone] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Success modal
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [createdData, setCreatedData] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (role === 'STUDENT' && !identifier.trim()) {
      setError('USN / Enrollment Number is required for students');
      return;
    }

    if (role === 'FACULTY' && !identifier.trim()) {
      setError('Employee / Faculty ID is required for faculty');
      return;
    }

    setLoading(true);
    try {
      const res = await adminUsersApi.createSingleUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        identifier: identifier.trim() || undefined,
        phone: phone.trim() || undefined
      });

      setCreatedData({
        user: res.user,
        temporaryPassword: res.temporaryPassword
      });
      setCopied(false);
      setSuccessModalOpen(true);
    } catch (err) {
      setError(err?.message || 'Failed to provision user');
    } finally {
      setLoading(false);
    }
  };

  const copyPassword = () => {
    if (createdData?.temporaryPassword) {
      navigator.clipboard.writeText(createdData.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleModalClose = () => {
    setSuccessModalOpen(false);
    navigate('/admin/users');
  };

  return (
    <div style={{ padding: 'var(--space-xl)', maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--space-lg)' }}>
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
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--color-text-base)' }}>
          Provision User Account
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: '4px' }}>
          Create an institutional account. The user will complete onboarding and administrative verification after first login.
        </p>
      </div>

      {error && (
        <Alert variant="danger" style={{ marginBottom: 'var(--space-md)' }}>
          {error}
        </Alert>
      )}

      <Card style={{ padding: 'var(--space-xl)' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
              Account Role
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {['STUDENT', 'FACULTY', 'INVIGILATOR', 'ADMIN'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${role === r ? 'var(--color-primary)' : 'var(--color-border-subtle)'}`,
                    background: role === r ? 'var(--color-primary-subtle)' : 'var(--color-bg-surface)',
                    color: role === r ? 'var(--color-primary)' : 'var(--color-text-base)',
                    fontWeight: 600,
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    textAlign: 'center'
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <Input
            id="user-name"
            label="Full Name"
            required
            placeholder="e.g. Johnathan Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Input
            id="user-email"
            label="Institutional Email"
            type="email"
            required
            placeholder="e.g. jdoe@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {(role === 'STUDENT' || role === 'FACULTY') && (
            <Input
              id="user-identifier"
              label={role === 'STUDENT' ? 'USN / Enrollment Number' : 'Employee / Faculty ID'}
              required
              placeholder={role === 'STUDENT' ? 'e.g. 1MS21CS001' : 'e.g. FAC-CS-402'}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          )}

          <Input
            id="user-phone"
            label="Phone Number (Optional)"
            type="tel"
            placeholder="+1 555-0199"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <div style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-md)',
            fontSize: '0.8125rem',
            color: 'var(--color-text-muted)'
          }}>
            <strong>Automatic Lifecycle Initialization:</strong>
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              <li>Status initializes to <strong>ACTIVE</strong></li>
              <li>Verification status initializes to <strong>UNVERIFIED</strong></li>
              <li>Forces password change upon first login (<code>must_change_password=true</code>)</li>
              <li>Normal dashboard and exam entry blocked until profile completion and admin verification</li>
            </ul>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: 'var(--space-sm)' }}>
            <Button type="button" variant="ghost" onClick={() => navigate('/admin/users')}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading}>
              Create Account & Generate Password
            </Button>
          </div>
        </form>
      </Card>

      {/* Account Created Modal */}
      <Modal
        isOpen={successModalOpen}
        onClose={handleModalClose}
        title="Account Provisioned Successfully"
      >
        <div>
          <Alert variant="warning" style={{ marginBottom: 'var(--space-md)' }}>
            <strong>Action Required:</strong> Copy the temporary password below. For security reasons, plaintext passwords are never stored and cannot be retrieved again.
          </Alert>

          <div style={{
            background: 'var(--color-bg-surface)',
            padding: 'var(--space-md)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-subtle)',
            marginBottom: 'var(--space-lg)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>NAME:</span>
              <span style={{ fontWeight: 600 }}>{createdData?.user?.name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>EMAIL:</span>
              <span style={{ fontWeight: 600 }}>{createdData?.user?.email}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>ROLE:</span>
              <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{createdData?.user?.roles?.[0]}</span>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>TEMPORARY PASSWORD</div>
            <div style={{
              fontFamily: 'monospace',
              fontSize: '1.25rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: 'var(--color-primary)',
              wordBreak: 'break-all',
              marginTop: '4px'
            }}>
              {createdData?.temporaryPassword}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button type="button" variant="outline" onClick={copyPassword}>
              {copied ? '✓ Copied' : '📋 Copy Password'}
            </Button>
            <Button type="button" variant="primary" onClick={handleModalClose}>
              Done & Return to List
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
