/**
 * @file CandidateDocumentUploadPage.jsx
 * @description Candidate identity document onboarding screen.
 * Handles presigned S3 uploads, client-side validation, server-side magic byte verification,
 * and displays document review status and approved accommodations.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as candidateApi from '../../api/candidateIdentityApi.js';
import { Button } from '../../components/common/Button.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Alert } from '../../components/common/Alert.jsx';
import { Badge } from '../../components/common/Badge.jsx';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export function CandidateDocumentUploadPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStep, setUploadStep] = useState(''); // 'ticket', 's3', 'confirm'
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [identityStatus, setIdentityStatus] = useState(null);
  const [candidateProfile, setCandidateProfile] = useState(null);

  // Form inputs
  const [documentType, setDocumentType] = useState('PASSPORT');
  const [fullNameOnDocument, setFullNameOnDocument] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issueCountry, setIssueCountry] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const loadStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const [statusRes, profileRes] = await Promise.all([
        candidateApi.getCandidateIdentityStatus().catch(() => null),
        candidateApi.getCandidateProfile().catch(() => null)
      ]);

      setIdentityStatus(statusRes);
      setCandidateProfile(profileRes);

      if (profileRes?.name && !fullNameOnDocument) {
        setFullNameOnDocument(profileRes.name);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load candidate verification status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError('Invalid file format. Only JPEG, PNG, and PDF files are accepted.');
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError('File size exceeds the 10 MB maximum limit.');
      setSelectedFile(null);
      return;
    }

    setError(null);
    setSelectedFile(file);
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!fullNameOnDocument.trim()) {
      setError('Full legal name on document is required.');
      return;
    }

    if (!documentNumber.trim()) {
      setError('Document number is required.');
      return;
    }

    if (!selectedFile) {
      setError('Please select an identity document file (JPEG, PNG, or PDF).');
      return;
    }

    setSubmitting(true);
    try {
      // Step 1: Request presigned upload URL from backend
      setUploadStep('Requesting secure upload authorization ticket...');
      const ticket = await candidateApi.requestDocumentUploadUrl({
        documentType,
        documentNumber: documentNumber.trim(),
        fullNameOnDocument: fullNameOnDocument.trim(),
        fileName: selectedFile.name,
        mimeType: selectedFile.type,
        byteSize: selectedFile.size,
        issueCountry: issueCountry.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        expiryDate: expiryDate || undefined
      });

      // Step 2: Direct HTTP PUT to private S3 bucket
      setUploadStep('Transferring document directly to secure private storage...');
      await candidateApi.uploadBinaryToS3(ticket.uploadUrl, selectedFile, selectedFile.type);

      // Step 3: Confirm upload with backend for server-side magic byte validation
      setUploadStep('Verifying binary integrity and magic-byte signature...');
      await candidateApi.confirmDocumentUpload(ticket.documentId);

      setSuccessMsg('Document successfully uploaded and submitted for administrative review!');
      setSelectedFile(null);
      setDocumentNumber('');
      await loadStatus();
    } catch (err) {
      setError(err?.message || 'Failed to upload and submit document. Please check file and try again.');
    } finally {
      setSubmitting(false);
      setUploadStep('');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--color-text-muted)', fontSize: '1rem' }}>
          Loading candidate onboarding status...
        </div>
      </div>
    );
  }

  const activeDoc = identityStatus?.document;
  const docStatus = activeDoc?.verificationStatus || identityStatus?.overallVerificationStatus || 'UNVERIFIED';

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--color-bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '2.5rem 1rem'
    }}>
      <div style={{ maxWidth: '720px', width: '100%' }}>
        {/* Header Branding */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
              Candidate Identity Verification
            </h1>
            <p style={{ margin: '0.25rem 0 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              Institutional examination onboarding and accommodations portal
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => logout()}>
            Sign Out
          </Button>
        </div>

        {error && (
          <div style={{ marginBottom: '1.5rem' }}>
            <Alert variant="danger">{error}</Alert>
          </div>
        )}

        {successMsg && (
          <div style={{ marginBottom: '1.5rem' }}>
            <Alert variant="success">{successMsg}</Alert>
          </div>
        )}

        {/* 1. Status Overview Banner */}
        {docStatus === 'APPROVED' && (
          <Card style={{ marginBottom: '2rem', border: '1px solid #059669' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
              <div style={{
                fontSize: '1.8rem',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                padding: '0.75rem',
                borderRadius: '50%'
              }}>
                ✓
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#10b981' }}>
                    Identity Fully Verified
                  </h3>
                  <Badge variant="success">APPROVED</Badge>
                </div>
                <p style={{ margin: '0 0 1rem 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  Your {activeDoc?.documentType?.replace('_', ' ')} (ending in ****{activeDoc?.documentNumberLast4})
                  has been reviewed and approved. You have full clearance to take assigned examinations.
                </p>

                {/* Accommodations Card */}
                {candidateProfile?.accommodations && (
                  <div style={{
                    backgroundColor: 'var(--color-surface-hover)',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginTop: '1rem',
                    border: '1px solid var(--color-border)'
                  }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: 'var(--color-text)' }}>
                      Approved Exam Accommodations:
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                      <li>
                        <strong>Extra Time:</strong> {candidateProfile.accommodations.extraTimeMultiplier}x standard exam duration
                      </li>
                      {candidateProfile.accommodations.breakAllowanceMinutes > 0 && (
                        <li>
                          <strong>Rest Breaks:</strong> Up to {candidateProfile.accommodations.maxBreaksAllowed} breaks ({candidateProfile.accommodations.breakAllowanceMinutes} mins total)
                        </li>
                      )}
                      <li>
                        <strong>Proctoring Mode:</strong> {candidateProfile.accommodations.proctoringStrictness}
                      </li>
                    </ul>
                  </div>
                )}

                <div style={{ marginTop: '1.5rem' }}>
                  <Button variant="primary" onClick={() => navigate('/candidate')}>
                    Go to Candidate Dashboard
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {docStatus === 'PENDING' && (
          <Card style={{ marginBottom: '2rem', border: '1px solid #d97706' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
              <div style={{
                fontSize: '1.8rem',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                padding: '0.75rem',
                borderRadius: '50%'
              }}>
                ⏳
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#f59e0b' }}>
                    Document Under Administrative Review
                  </h3>
                  <Badge variant="warning">PENDING REVIEW</Badge>
                </div>
                <p style={{ margin: '0 0 0.5rem 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  Your {activeDoc?.documentType?.replace('_', ' ')} (ending in ****{activeDoc?.documentNumberLast4})
                  was received on {activeDoc?.submittedAt ? new Date(activeDoc.submittedAt).toLocaleDateString() : 'today'}.
                  Our institutional verification team is currently verifying the credentials.
                </p>
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  You will receive an automated notification once review is complete.
                </p>
                <div style={{ marginTop: '1rem' }}>
                  <Button variant="outline" size="sm" onClick={loadStatus}>
                    Refresh Status
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {docStatus === 'REJECTED' && (
          <Card style={{ marginBottom: '2rem', border: '1px solid #ef4444' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
              <div style={{
                fontSize: '1.8rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                padding: '0.75rem',
                borderRadius: '50%'
              }}>
                ⚠️
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#ef4444' }}>
                    Document Verification Rejected
                  </h3>
                  <Badge variant="danger">REJECTED</Badge>
                </div>
                <div style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.05)',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  marginBottom: '1rem',
                  borderLeft: '4px solid #ef4444'
                }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ef4444', marginBottom: '0.25rem' }}>
                    Reason for Rejection:
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--color-text)' }}>
                    {activeDoc?.reviewerNotes || 'The uploaded document was illegible or could not be verified.'}
                  </div>
                </div>
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  Please submit a clearer, valid scan of your government or student ID using the form below.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* 2. Upload Form (Displayed when UNVERIFIED or REJECTED) */}
        {(docStatus === 'UNVERIFIED' || docStatus === 'REJECTED') && (
          <Card>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: 0, marginBottom: '1rem' }}>
              {docStatus === 'REJECTED' ? 'Resubmit Identity Document' : 'Upload Identity Document'}
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
              Please provide official identification (Passport, National ID, Driving License, or Student ID).
              Documents are stored encrypted in private storage and strictly inspected for authenticity.
            </p>

            <form onSubmit={handleUploadSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                  Document Type *
                </label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.75rem',
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    color: 'var(--color-text)',
                    fontSize: '0.9rem'
                  }}
                  disabled={submitting}
                >
                  <option value="PASSPORT">Passport</option>
                  <option value="NATIONAL_ID">National ID Card</option>
                  <option value="DRIVING_LICENSE">Driving License</option>
                  <option value="STUDENT_ID">Institutional Student ID</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                  Full Legal Name on Document *
                </label>
                <Input
                  value={fullNameOnDocument}
                  onChange={(e) => setFullNameOnDocument(e.target.value)}
                  placeholder="e.g. Jane Mary Doe"
                  disabled={submitting}
                  required
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                  Document Identification Number *
                </label>
                <Input
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  placeholder="e.g. A12345678"
                  disabled={submitting}
                  required
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  🔒 Plaintext document numbers are never persisted. Only a secure one-way cryptographic hash (SHA-256) and last 4 characters are retained.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                    Issuing Country
                  </label>
                  <Input
                    value={issueCountry}
                    onChange={(e) => setIssueCountry(e.target.value)}
                    placeholder="e.g. India, USA"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                    Date of Birth
                  </label>
                  <Input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                    Expiration Date
                  </label>
                  <Input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* File Upload Box */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                  Document File (JPEG, PNG, or PDF, max 10MB) *
                </label>
                <div style={{
                  border: '2px dashed var(--color-border)',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  textAlign: 'center',
                  backgroundColor: selectedFile ? 'rgba(59, 130, 246, 0.05)' : 'var(--color-surface)',
                  cursor: 'pointer'
                }}>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                    id="doc-file-input"
                    disabled={submitting}
                  />
                  <label htmlFor="doc-file-input" style={{ cursor: 'pointer' }}>
                    <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>📄</div>
                    {selectedFile ? (
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                          {selectedFile.name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • {selectedFile.type}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                          Click to change file
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontWeight: 500, color: 'var(--color-text)' }}>
                          Click to choose a file or drag and drop
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                          Supported formats: JPEG, PNG, PDF up to 10 MB
                        </div>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {submitting && uploadStep && (
                <div style={{
                  marginBottom: '1.5rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--color-surface-hover)',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span className="spinner" style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%' }} />
                  {uploadStep}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                disabled={submitting || !selectedFile}
                style={{ width: '100%', padding: '0.75rem' }}
              >
                {submitting ? 'Uploading & Verifying...' : 'Submit Document for Verification'}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
