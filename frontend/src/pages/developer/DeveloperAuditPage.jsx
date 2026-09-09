/**
 * @file DeveloperAuditPage.jsx
 * @description Technical Audit Feed Screen for Developer Operations (Workspace 4).
 * Surfaces immutable audit events for security, authentication, and system changes with zero candidate PII.
 */

import React, { useState, useEffect } from 'react';
import { getDeveloperAudit } from '../../api/developerApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';

export function DeveloperAuditPage() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionFilter, setActionFilter] = useState('');
  const [expandedLogId, setExpandedLogId] = useState(null);

  async function loadAudit(page = 1) {
    try {
      setLoading(true);
      const filters = { page, limit: 20 };
      if (actionFilter.trim()) filters.action = actionFilter.trim();

      const res = await getDeveloperAudit(filters);
      setLogs(res.audit_logs || []);
      setPagination(res.pagination || { page: 1, limit: 20, totalPages: 1 });
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch technical audit logs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAudit(1);
  }, [actionFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Immutability Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.875rem 1.25rem',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{ fontSize: '1.125rem' }}>🔒</span>
          <div>
            <strong style={{ fontSize: '0.875rem' }}>Immutable Technical Audit Trail</strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Protected by PostgreSQL trigger prevent_audit_log_mutation() (SQLSTATE 20000). Updates and deletes are prohibited.
            </div>
          </div>
        </div>
        <Badge variant="primary" size="sm">APPEND-ONLY</Badge>
      </div>

      {/* Filter Bar */}
      <Card>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <Input
              placeholder="Filter by action (e.g. AUTH_LOGIN, SYSTEM_INCIDENT, CONFIG)..."
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            />
          </div>
          <Button variant="secondary" size="sm" onClick={() => loadAudit(pagination.page)}>
            Refresh
          </Button>
        </div>
      </Card>

      {/* Audit Log Table */}
      <Card>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
            <Spinner size="md" />
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-danger)' }}>
            {error}
          </div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--color-text-muted)' }}>
            No technical audit events found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {logs.map((log) => {
              const isExpanded = expandedLogId === log.audit_id;
              return (
                <div
                  key={log.audit_id}
                  style={{
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-surface)',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    onClick={() => setExpandedLogId(isExpanded ? null : log.audit_id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.625rem 0.875rem',
                      cursor: 'pointer',
                      fontSize: '0.8125rem'
                    }}
                  >
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', minWidth: '130px', fontFamily: 'monospace' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <Badge variant="primary" size="sm">
                      {log.action}
                    </Badge>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                      resource: <strong>{log.resource_type || log.resourceType}</strong> ({log.resource_id || log.resourceId})
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: 'var(--color-surface-sunken)',
                        borderTop: '1px solid var(--color-border-subtle)',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {JSON.stringify(log, null, 2)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border-subtle)' }}>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => loadAudit(pagination.page - 1)}
            >
              Previous
            </Button>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => loadAudit(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
