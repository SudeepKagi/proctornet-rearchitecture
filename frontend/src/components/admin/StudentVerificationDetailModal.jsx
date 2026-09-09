/**
 * @file StudentVerificationDetailModal.jsx
 * @description Administrative modal for inspecting candidate identity verification dossier,
 * previewing private S3 document via short-lived URL, and executing approval/rejection decisions.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';
import { Alert } from '../common/Alert.jsx';
import { Input } from '../common/Input.jsx';

export function StudentVerificationDetailModal({ studentId, isOpen, onClose, onReviewSuccess }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dossier, setDossier] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Rejection dialog state
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (!isOpen || !studentId) return;

    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setError(null);
      setShowRejectBox(false);
      setRejectReason('');

      try {
        const [dossierData, previewData] = await Promise.all([
          adminUsersApi.fetchStudentVerificationDossier(studentId),
          adminUsersApi.fetchStudentDocumentPreview(studentId).catch(() => null)
        ]);

        if (isMounted) {
          setDossier(dossierData);
          setPreview(previewData);
        }
      } catch (err) {
        if (isMounted) {
          setError(err?.message || 'Failed to load student verification dossier');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [isOpen, studentId]);

  if (!isOpen) return null;

  const handleApprove = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await adminUsersApi.reviewStudentVerification(studentId, 'APPROVED', 'Document verified successfully');
      if (onReviewSuccess) onReviewSuccess();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to approve verification');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setError('Rejection reason is mandatory.');
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      await adminUsersApi.reviewStudentVerification(studentId, 'REJECTED', rejectReason.trim());
      if (onReviewSuccess) onReviewSuccess();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to reject verification');
    } finally {
      setActionLoading(false);
    }
  };

  const user = dossier?.user;
  const activeDoc = dossier?.activeDocument;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1.5rem'
    }}>
      <div style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: '12px',
        maxWidth: '900px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
        border: '1px solid var(--color-border)'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text)' }}>
              Candidate Verification Dossier
            </h2>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              {user ? `${user.name} (${user.enrollmentNumber || user.email})` : 'Loading candidate...'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              color: 'var(--color-text-muted)',
              cursor: 'pointer'
            }}
          >
            ×
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{ marginBottom: '1rem' }}>
              <Alert variant="danger">{error}</Alert>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
              Loading identity credentials and private preview...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem' }}>
              {/* Left Column: Document Preview */}
              <div>
                <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600 }}>
                  Document Preview
                </h3>
                {preview?.previewUrl ? (
                  <div style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    backgroundColor: '#000',
                    height: '380px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {preview.mimeType?.includes('pdf') ? (
                      <iframe
                        src={preview.previewUrl}
                        title="Document PDF Preview"
                        style={{ width: '100%', height: '100%', border: 'none' }}
                      />
                    ) : (
                      <img
                        src={preview.previewUrl}
                        alt="Candidate Identity Document"
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      />
                    )}
                  </div>
                ) : (
                  <div style={{
                    height: '380px',
                    border: '1px dashed var(--color-border)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-muted)',
                    fontSize: '0.9rem'
                  }}>
                    No previewable document binary found.
                  </div>
                )}
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                  🔒 Short-lived preview link (300s TTL). Document access is logged for audit compliance.
                </div>
              </div>

              {/* Right Column: Metadata & Decision Box */}
              <div>
                <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600 }}>
                  Identity Details
                </h3>

                <div style={{
                  backgroundColor: 'var(--color-surface-hover)',
                  borderRadius: '8px',
                  padding: '1rem',
                  fontSize: '0.875rem',
                  marginBottom: '1rem',
                  border: '1px solid var(--color-border)'
                }}>
                  <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Status:</span>
                    <Badge variant={user?.verificationStatus === 'VERIFIED' ? 'success' : user?.verificationStatus === 'REJECTED' ? 'danger' : 'warning'}>
                      {user?.verificationStatus}
                    </Badge>
                  </div>
                  <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Document Type:</span>
                    <span style={{ fontWeight: 500 }}>{activeDoc?.documentType || 'None'}</span>
                  </div>
                  <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Masked ID:</span>
                    <span style={{ fontWeight: 500 }}>****{activeDoc?.documentNumberLast4 || 'N/A'}</span>
                  </div>
                  <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Name on ID:</span>
                    <span style={{ fontWeight: 500 }}>{activeDoc?.fullNameOnDocument || 'N/A'}</span>
                  </div>
                  <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Department:</span>
                    <span style={{ fontWeight: 500 }}>{user?.department || 'Unassigned'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Submitted:</span>
                    <span style={{ fontWeight: 500 }}>
                      {activeDoc?.submittedAt ? new Date(activeDoc.submittedAt).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Accommodations Shortcut */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    style={{ width: '100%' }}
                    onClick={() => {
                      onClose();
                      navigate(`/admin/students/${studentId}/configuration`);
                    }}
                  >
                    ⚙️ Configure Student Accommodations
                  </Button>
                </div>

                {/* Decision Panel */}
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--color-text)' }}>
                    Review Decision
                  </h4>

                  {!showRejectBox ? (
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <Button
                        variant="primary"
                        style={{ flex: 1, backgroundColor: '#059669', borderColor: '#059669' }}
                        onClick={handleApprove}
                        disabled={actionLoading || !activeDoc}
                      >
                        ✓ Approve
                      </Button>
                      <Button
                        variant="outline"
                        style={{ flex: 1, color: '#ef4444', borderColor: '#ef4444' }}
                        onClick={() => setShowRejectBox(true)}
                        disabled={actionLoading || !activeDoc}
                      >
                        ✕ Reject...
                      </Button>
                    </div>
                  ) : (
                    <div style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.05)',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(239, 68, 68, 0.2)'
                    }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#ef4444', marginBottom: '0.35rem' }}>
                        Mandatory Rejection Reason *
                      </label>
                      <Input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="e.g. Document image is blurry or expired"
                        disabled={actionLoading}
                        style={{ marginBottom: '0.75rem' }}
                      />
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button
                          variant="primary"
                          style={{ flex: 1, backgroundColor: '#dc2626', borderColor: '#dc2626' }}
                          onClick={handleReject}
                          disabled={actionLoading || !rejectReason.trim()}
                        >
                          Confirm Rejection
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowRejectBox(false)}
                          disabled={actionLoading}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
