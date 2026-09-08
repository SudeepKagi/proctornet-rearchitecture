/**
 * @file AdminVerificationPage.jsx
 * @description Administrative verification queue: review, approve, or reject candidate and faculty onboarding submissions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Button } from '../../components/common/Button.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { Alert } from '../../components/common/Alert.jsx';
import { Input } from '../../components/common/Input.jsx';

export function AdminVerificationPage() {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');

  // Review modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [reviewDecision, setReviewDecision] = useState('VERIFIED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState(null);

  const loadQueue = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminUsersApi.fetchVerificationQueue({
        page,
        limit: pagination.limit,
        verification_status: statusFilter || undefined,
        role: roleFilter || undefined,
        search: search.trim() || undefined
      });
      setUsers(data.users || []);
      setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err?.message || 'Failed to load verification queue');
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, statusFilter, roleFilter, search]);

  useEffect(() => {
    loadQueue(1);
  }, [loadQueue]);

  const handleOpenReview = (user, decision = 'VERIFIED') => {
    setSelectedUser(user);
    setReviewDecision(decision);
    setReviewNotes('');
    setReviewError(null);
    setReviewModalOpen(true);
  };

  const handleConfirmReview = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (reviewDecision === 'REJECTED' && !reviewNotes.trim()) {
      setReviewError('Mandatory review notes are required when returning or rejecting a verification request');
      return;
    }

    setReviewLoading(true);
    setReviewError(null);
    try {
      await adminUsersApi.reviewVerification(selectedUser.userId, reviewDecision, reviewNotes.trim());
      setReviewModalOpen(false);
      loadQueue(pagination.page);
    } catch (err) {
      setReviewError(err?.message || 'Failed to submit verification decision');
    } finally {
      setReviewLoading(false);
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
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--color-text-base)' }}>
          Academic Verification Queue
        </h1>
        <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0 0', fontSize: '0.875rem' }}>
          Inspect academic submissions, verify university credentials, and approve access to exam dashboards.
        </p>
      </div>

      {error && (
        <Alert variant="danger" style={{ marginBottom: 'var(--space-md)' }}>
          {error}
        </Alert>
      )}

      {/* Filter Bar */}
      <Card style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-md)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>
              SEARCH
            </label>
            <Input
              id="verification-search"
              placeholder="Search candidate name or USN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>
              VERIFICATION STATUS
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
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
              <option value="">All Verification States</option>
              <option value="PENDING">Pending Review (Action Required)</option>
              <option value="VERIFIED">Verified (Approved)</option>
              <option value="REJECTED">Rejected (Returned to Candidate)</option>
              <option value="UNVERIFIED">Unverified (Profile Incomplete)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>
              ROLE
            </label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
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
              <option value="STUDENT">Student Only</option>
              <option value="FACULTY">Faculty Only</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Queue Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Candidate / Faculty</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Identifier</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Role</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Department & Details</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Verification Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    Loading verification queue...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No users pending verification in this category.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.userId} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600 }}>{u.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{u.email}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600 }}>
                      {u.identifier || '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge variant="primary" size="sm">{u.roles?.[0]}</Badge>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div>{u.department || '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {u.semester ? `Semester ${u.semester}` : u.designation || '—'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {getVerificationBadge(u.verificationStatus)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleOpenReview(u, 'VERIFIED')}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenReview(u, 'REJECTED')}
                        >
                          Reject
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
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} records
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => loadQueue(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => loadQueue(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Review Modal */}
      <Modal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title={reviewDecision === 'VERIFIED' ? `Approve Verification: ${selectedUser?.name}` : `Return Submission: ${selectedUser?.name}`}
      >
        <form onSubmit={handleConfirmReview}>
          {reviewError && (
            <Alert variant="danger" style={{ marginBottom: 'var(--space-md)' }}>
              {reviewError}
            </Alert>
          )}

          <div style={{
            background: 'var(--color-bg-surface)',
            padding: 'var(--space-md)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-subtle)',
            marginBottom: 'var(--space-md)',
            fontSize: '0.8125rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Name:</span>
              <span style={{ fontWeight: 600 }}>{selectedUser?.name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Email:</span>
              <span>{selectedUser?.email}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Identifier:</span>
              <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{selectedUser?.identifier || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Department:</span>
              <span>{selectedUser?.department || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Affiliation:</span>
              <span>{selectedUser?.semester ? `Semester ${selectedUser.semester}` : selectedUser?.designation || '—'}</span>
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
              Decision
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setReviewDecision('VERIFIED')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${reviewDecision === 'VERIFIED' ? 'var(--color-success)' : 'var(--color-border-subtle)'}`,
                  background: reviewDecision === 'VERIFIED' ? 'var(--color-success-subtle)' : 'var(--color-bg-surface)',
                  color: reviewDecision === 'VERIFIED' ? 'var(--color-success)' : 'var(--color-text-base)',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Approve (VERIFIED)
              </button>
              <button
                type="button"
                onClick={() => setReviewDecision('REJECTED')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${reviewDecision === 'REJECTED' ? 'var(--color-danger)' : 'var(--color-border-subtle)'}`,
                  background: reviewDecision === 'REJECTED' ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-bg-surface)',
                  color: reviewDecision === 'REJECTED' ? 'var(--color-danger)' : 'var(--color-text-base)',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Reject (Return to User)
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
              Review Notes {reviewDecision === 'REJECTED' ? '(Mandatory)' : '(Optional)'}
            </label>
            <Input
              id="review-notes"
              required={reviewDecision === 'REJECTED'}
              placeholder={reviewDecision === 'REJECTED' ? 'e.g. USN does not match the CS department roster. Please correct your semester.' : 'e.g. Verified against university registrar records.'}
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button type="button" variant="ghost" onClick={() => setReviewModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={reviewDecision === 'VERIFIED' ? 'primary' : 'danger'}
              loading={reviewLoading}
            >
              Submit Decision
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
