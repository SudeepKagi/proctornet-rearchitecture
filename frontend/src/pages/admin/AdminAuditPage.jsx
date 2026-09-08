/**
 * @file AdminAuditPage.jsx
 * @description Administrative viewer for immutable audit logs, administrative mutations, and security events.
 */

import React, { useState, useEffect, useCallback } from 'react';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { Alert } from '../../components/common/Alert.jsx';
import { Input } from '../../components/common/Input.jsx';

export function AdminAuditPage() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [actionFilter, setActionFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');

  // Metadata detail modal
  const [selectedLog, setSelectedLog] = useState(null);
  const [metaModalOpen, setMetaModalOpen] = useState(false);

  const loadLogs = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminUsersApi.fetchAuditLogs({
        page,
        limit: pagination.limit,
        action: actionFilter.trim() || undefined,
        resource_type: resourceTypeFilter.trim() || undefined
      });
      setLogs(data.logs || []);
      setPagination(data.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err?.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, actionFilter, resourceTypeFilter]);

  useEffect(() => {
    loadLogs(1);
  }, [loadLogs]);

  const handleOpenMeta = (log) => {
    setSelectedLog(log);
    setMetaModalOpen(true);
  };

  return (
    <div style={{ padding: 'var(--space-xl)', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--color-text-base)' }}>
          Immutable Security & Audit Logs
        </h1>
        <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0 0', fontSize: '0.875rem' }}>
          Tamper-evident audit trail recording all administrative mutations, user provisioning, and verification decisions.
        </p>
      </div>

      {error && <Alert variant="danger" style={{ marginBottom: 'var(--space-md)' }}>{error}</Alert>}

      {/* Filter Bar */}
      <Card style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-md)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-md)', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>
              FILTER BY ACTION
            </label>
            <Input
              id="audit-action"
              placeholder="e.g. USER_CREATED, USER_STATUS_UPDATED"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>
              RESOURCE TYPE
            </label>
            <Input
              id="audit-resource"
              placeholder="e.g. USER, SETTINGS"
              value={resourceTypeFilter}
              onChange={(e) => setResourceTypeFilter(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Timestamp</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Action</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Actor ID</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Resource</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Resource ID</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No audit records match query.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.audit_id || l.auditId} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(l.timestamp).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <Badge variant="primary" size="sm">{l.action}</Badge>
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
                      {l.actor_user_id || l.actorUserId || 'SYSTEM'}
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: 500 }}>
                      {l.resource_type || l.resourceType}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace' }}>
                      {l.resource_id || l.resourceId}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenMeta(l)}>
                        Metadata
                      </Button>
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
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} events recorded)
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => loadLogs(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => loadLogs(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Metadata Inspector Modal */}
      <Modal
        isOpen={metaModalOpen}
        onClose={() => setMetaModalOpen(false)}
        title="Audit Evidence Metadata"
      >
        <div>
          <div style={{ marginBottom: '12px', fontSize: '0.8125rem' }}>
            <div><strong>Action:</strong> {selectedLog?.action}</div>
            <div><strong>Resource:</strong> {selectedLog?.resource_type || selectedLog?.resourceType} ({selectedLog?.resource_id || selectedLog?.resourceId})</div>
            <div><strong>Timestamp:</strong> {selectedLog && new Date(selectedLog.timestamp).toISOString()}</div>
          </div>
          <pre style={{
            background: 'var(--color-bg-surface)',
            padding: 'var(--space-md)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-subtle)',
            fontSize: '0.75rem',
            overflowX: 'auto',
            maxHeight: '300px'
          }}>
            {JSON.stringify(selectedLog?.metadata || {}, null, 2)}
          </pre>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-md)' }}>
            <Button variant="primary" onClick={() => setMetaModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
