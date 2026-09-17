/**
 * @file DeveloperAuditPage.jsx
 * @description Technical Audit Feed Screen for Developer Operations (Workspace 4).
 * Surfaces immutable audit events for security, authentication, and system changes with zero candidate PII.
 */

import React, { useState, useEffect } from 'react';
import { getDeveloperAudit } from '../../api/developerApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  ScrollText,
  Lock,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

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
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ScrollText className="h-7 w-7 text-primary" />
          Technical Audit Feed
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Immutable audit events for operational configuration changes, service authentication, and system events.
        </p>
      </div>

      {/* Immutability Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-xl border border-border/80 bg-muted/20 gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              Immutable Append-Only Technical Audit Trail
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Protected by PostgreSQL trigger <code className="font-mono text-primary font-medium">prevent_audit_log_mutation()</code> (SQLSTATE 20000). Updates and deletes are prohibited.
            </div>
          </div>
        </div>
        <Badge variant="outline" className="font-mono text-xs w-fit">
          APPEND-ONLY
        </Badge>
      </div>

      {/* Filter Bar */}
      <Card className="shadow-xs border-border/80">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by action (e.g. AUTH_LOGIN, SYSTEM_INCIDENT, CONFIG)..."
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="pl-9 h-9 text-sm font-mono"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadAudit(pagination.page)}
              className="h-9 text-xs flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card className="shadow-xs border-border/80 overflow-hidden">
        <CardContent className="p-4">
          {loading ? (
            <div className="flex h-[240px] items-center justify-center">
              <Spinner size="md" className="text-primary" />
              <span className="ml-3 text-sm text-muted-foreground">Loading audit records...</span>
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Audit Ingestion Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No technical audit events found matching query.
            </div>
          ) : (
            <div className="space-y-1.5 font-mono text-xs">
              {logs.map((log) => {
                const isExpanded = expandedLogId === log.audit_id;
                return (
                  <div
                    key={log.audit_id}
                    className="rounded-lg border border-border/70 bg-card overflow-hidden transition-colors hover:border-border"
                  >
                    <div
                      onClick={() => setExpandedLogId(isExpanded ? null : log.audit_id)}
                      className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/30 select-none"
                    >
                      <span className="text-muted-foreground text-[11px] shrink-0 w-24">
                        {(() => {
                          const raw = log.timestamp || log.created_at;
                          if (!raw) return 'N/A';
                          const d = new Date(raw);
                          return isNaN(d.getTime()) ? 'N/A' : d.toLocaleTimeString();
                        })()}
                      </span>
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {log.action}
                      </Badge>
                      <span className="text-muted-foreground text-[11px] truncate flex-1 font-sans">
                        Resource: <strong className="text-foreground font-mono">{log.resource_type || log.resourceType}</strong> ({log.resource_id || log.resourceId})
                      </span>
                      <span className="text-muted-foreground shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="p-3 bg-muted/40 border-t border-border/60 text-[11px] overflow-x-auto">
                        <pre className="m-0 whitespace-pre-wrap text-foreground font-mono">
                          {JSON.stringify(log, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 mt-3 border-t border-border/60 text-xs text-muted-foreground">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs flex items-center gap-1"
                disabled={pagination.page <= 1}
                onClick={() => loadAudit(pagination.page - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </Button>
              <span className="font-medium text-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs flex items-center gap-1"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadAudit(pagination.page + 1)}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
