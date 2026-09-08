/**
 * @file BulkImportPage.jsx
 * @description Administrative bulk ingestion interface for rosters (.xlsx, .xls, .csv) with validation preview,
 * atomic vs resilient transactional options, and credentials manifest export.
 */

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Button } from '../../components/common/Button.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Alert } from '../../components/common/Alert.jsx';

export function BulkImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [defaultRole, setDefaultRole] = useState('STUDENT');
  const [atomic, setAtomic] = useState(false);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  const [commitLoading, setCommitLoading] = useState(false);
  const [commitResult, setCommitResult] = useState(null);
  const [commitError, setCommitError] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewData(null);
      setCommitResult(null);
      setPreviewError(null);
      setCommitError(null);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      setPreviewError('Please select a spreadsheet file (.xlsx, .xls, .csv)');
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const data = await adminUsersApi.previewBulkImport(selectedFile, defaultRole);
      setPreviewData(data);
    } catch (err) {
      setPreviewError(err?.message || 'Failed to parse spreadsheet file');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!selectedFile) return;

    setCommitLoading(true);
    setCommitError(null);
    try {
      const result = await adminUsersApi.commitBulkImport(selectedFile, defaultRole, atomic);
      setCommitResult(result);
    } catch (err) {
      setCommitError(err?.message || 'Bulk ingestion failed');
    } finally {
      setCommitLoading(false);
    }
  };

  const downloadCredentialsCsv = () => {
    if (!commitResult?.credentials || commitResult.credentials.length === 0) return;

    const headers = ['Email', 'Name', 'Role', 'TemporaryPassword'];
    const rows = commitResult.credentials.map((c) => [
      `"${c.email}"`,
      `"${c.name}"`,
      `"${c.role || defaultRole}"`,
      `"${c.temporaryPassword}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `credentials_manifest_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: 'var(--space-xl)', maxWidth: '1000px', margin: '0 auto' }}>
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
          Bulk User Spreadsheet Ingestion
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: '4px' }}>
          Batch provision students or faculty from Excel (.xlsx, .xls) or CSV files with pre-commit validation.
        </p>
      </div>

      {/* Step 1: Upload and Configuration */}
      <Card style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-xl)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 var(--space-md) 0' }}>
          1. Select File & Mode
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
              Target Role Roster
            </label>
            <select
              value={defaultRole}
              onChange={(e) => setDefaultRole(e.target.value)}
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
              <option value="STUDENT">Student Roster (USN / EnrollmentNumber, Name, Email, Phone)</option>
              <option value="FACULTY">Faculty Roster (EmployeeID / FacultyID, Name, Email, Phone)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
              Transaction Mode
            </label>
            <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="atomicMode"
                  checked={!atomic}
                  onChange={() => setAtomic(false)}
                />
                <span><strong>Resilient:</strong> Commit valid, report invalid</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="atomicMode"
                  checked={atomic}
                  onChange={() => setAtomic(true)}
                />
                <span><strong>Atomic:</strong> Roll back if any row fails</span>
              </label>
            </div>
          </div>
        </div>

        {/* File Dropzone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: '2px dashed var(--color-border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-xl)',
            textAlign: 'center',
            cursor: 'pointer',
            background: selectedFile ? 'var(--color-primary-subtle)' : 'var(--color-bg-surface)',
            transition: 'border-color 0.2s'
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📑</div>
          <div style={{ fontWeight: 600, color: 'var(--color-text-base)' }}>
            {selectedFile ? selectedFile.name : 'Click to upload Excel or CSV file'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Supported formats: .xlsx, .xls, .csv (Max 10,000 rows). Password column is strictly forbidden.
          </div>
        </div>

        {previewError && (
          <Alert variant="danger" style={{ marginTop: 'var(--space-md)' }}>
            {previewError}
          </Alert>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-lg)' }}>
          <Button
            variant="primary"
            loading={previewLoading}
            disabled={!selectedFile}
            onClick={handleAnalyze}
          >
            Analyze & Validate Spreadsheet
          </Button>
        </div>
      </Card>

      {/* Step 2: Validation Preview */}
      {previewData && !commitResult && (
        <Card style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
              2. Pre-Commit Validation Summary
            </h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Badge variant="neutral">Total: {previewData.summary?.total}</Badge>
              <Badge variant="success">Valid: {previewData.summary?.valid}</Badge>
              {previewData.summary?.invalid > 0 && <Badge variant="danger">Invalid: {previewData.summary?.invalid}</Badge>}
              {previewData.summary?.duplicatesInFile > 0 && <Badge variant="warning">Duplicates: {previewData.summary?.duplicatesInFile}</Badge>}
            </div>
          </div>

          {previewData.errors?.length > 0 && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-md)',
              marginBottom: 'var(--space-md)',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              <strong style={{ color: '#ef4444', fontSize: '0.875rem' }}>Row Validation Issues Detected:</strong>
              <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                {previewData.errors.map((err, idx) => (
                  <li key={idx}>
                    Row {err.row}: <strong>{err.email || 'Unknown'}</strong> — {err.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {atomic && previewData.summary?.invalid > 0 && (
            <Alert variant="warning" style={{ marginBottom: 'var(--space-md)' }}>
              <strong>Atomic Mode Active:</strong> Ingestion cannot proceed because {previewData.summary?.invalid} invalid row(s) were found. Fix the spreadsheet or switch to Resilient Mode.
            </Alert>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button
              variant="primary"
              loading={commitLoading}
              disabled={atomic && previewData.summary?.invalid > 0}
              onClick={handleCommit}
            >
              Commit Ingestion & Issue Credentials ({previewData.summary?.valid} Accounts)
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Ingestion Result & Credentials Manifest */}
      {commitResult && (
        <Card style={{ padding: 'var(--space-xl)' }}>
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-lg)' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'var(--color-success-subtle)',
              color: 'var(--color-success)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 'var(--space-sm)'
            }}>
              ✓
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>
              Ingestion Completed Successfully
            </h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: '4px' }}>
              Created <strong>{commitResult.summary?.created}</strong> accounts. Failed: <strong>{commitResult.summary?.failed}</strong>.
            </p>
          </div>

          <Alert variant="warning" style={{ marginBottom: 'var(--space-lg)' }}>
            <strong>Security Notice:</strong> The temporary passwords below were generated at runtime and are never persisted in plaintext. Download the manifest now to distribute credentials to candidates.
          </Alert>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
              Generated Credentials Manifest ({commitResult.credentials?.length} accounts)
            </div>
            <Button variant="primary" onClick={downloadCredentialsCsv}>
              📥 Download Manifest (.csv)
            </Button>
          </div>

          <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Name</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Email</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Temporary Password</th>
                </tr>
              </thead>
              <tbody>
                {commitResult.credentials?.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{c.name}</td>
                    <td style={{ padding: '8px 12px' }}>{c.email}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: 'var(--color-primary)', fontWeight: 600 }}>
                      {c.temporaryPassword}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-lg)' }}>
            <Button variant="outline" onClick={() => navigate('/admin/users')}>
              Return to User Roster
            </Button>
          </div>
        </Card>
      )}

      {commitError && (
        <Alert variant="danger" style={{ marginTop: 'var(--space-md)' }}>
          {commitError}
        </Alert>
      )}
    </div>
  );
}
