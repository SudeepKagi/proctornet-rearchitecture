/**
 * @file DeveloperLogsPage.jsx
 * @description Centralized Masked System Logs Viewer (Workspace 3).
 * Queries the in-memory circular ring buffer with sub-second response times and multi-layer PII masking.
 */

import React, { useState, useEffect } from 'react';
import { getDeveloperLogs } from '../../api/developerApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';

const LEVELS = ['ALL', 'FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG'];

export function DeveloperLogsPage() {
  const [logs, setLogs] = useState([]);
  const [totalMatching, setTotalMatching] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState('ALL');
  const [search, setSearch] = useState('');
  const [traceId, setTraceId] = useState('');
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  async function loadLogs() {
    try {
      setLoading((prev) => (logs.length === 0 ? true : false));
      const filters = {};
      if (selectedLevel !== 'ALL') filters.level = selectedLevel.toLowerCase();
      if (search.trim()) filters.search = search.trim();
      if (traceId.trim()) filters.traceId = traceId.trim();
      filters.limit = 100;

      const res = await getDeveloperLogs(filters);
      setLogs(res.logs || []);
      setTotalMatching(res.totalMatching || 0);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, [selectedLevel, search, traceId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadLogs, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedLevel, search, traceId]);

  function getLevelBadgeVariant(lvl) {
    switch (lvl?.toLowerCase()) {
      case 'fatal':
      case 'error':
        return 'danger';
      case 'warn':
        return 'warning';
      case 'info':
        return 'primary';
      case 'debug':
      default:
        return 'neutral';
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Search & Filter Toolbar */}
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            {/* Level Selector Pills */}
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSelectedLevel(lvl)}
                  style={{
                    padding: '0.375rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border-subtle)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor:
                      selectedLevel === lvl
                        ? 'var(--color-primary)'
                        : 'var(--color-surface)',
                    color:
                      selectedLevel === lvl
                        ? 'var(--color-text-inverse)'
                        : 'var(--color-text-secondary)'
                  }}
                >
                  {lvl}
                </button>
              ))}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Live stream (3s)
              </label>
              <Button variant="secondary" size="sm" onClick={loadLogs}>
                Refresh
              </Button>
            </div>
          </div>

          {/* Search Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <Input
              placeholder="Search message or payload (e.g. timeout, redis)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Input
              placeholder="Filter by W3C Trace ID..."
              value={traceId}
              onChange={(e) => setTraceId(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Logs Table */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Showing {logs.length} of {totalMatching} matching entries in buffer
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            PII &amp; credentials redacted at source &amp; serialization
          </span>
        </div>

        {loading && logs.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
            <Spinner size="md" />
          </div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--color-text-muted)' }}>
            No logs matching the current criteria in the circular buffer.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {logs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              return (
                <div
                  key={log.id}
                  style={{
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-surface)',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.625rem 0.875rem',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                      fontFamily: 'monospace'
                    }}
                  >
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', minWidth: '140px' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <Badge variant={getLevelBadgeVariant(log.level)} size="sm">
                      {log.level.toUpperCase()}
                    </Badge>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                      [{log.service}]
                    </span>
                    {log.traceId && (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                        trace: {log.traceId.slice(0, 8)}...
                      </span>
                    )}
                    <span
                      style={{
                        flex: 1,
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {log.message}
                    </span>
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
                      {JSON.stringify(
                        {
                          id: log.id,
                          timestamp: log.timestamp,
                          level: log.level,
                          service: log.service,
                          message: log.message,
                          traceId: log.traceId,
                          requestId: log.requestId,
                          context: log.context
                        },
                        null,
                        2
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
