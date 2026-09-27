/**
 * @file AdminAuditPage.jsx
 * @description Administrative viewer for immutable audit logs, administrative mutations, and security events.
 */

import React, { useState, useEffect, useCallback } from 'react';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { StateBoundary } from '@/components/common/StateBoundary.jsx';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ScrollText,
  Search,
  FileJson,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ShieldCheck,
  Calendar,
} from 'lucide-react';

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
        resource_type: resourceTypeFilter.trim() || undefined,
      });
      setLogs(data.audit_logs || data.logs || []);
      setPagination(data.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 });
    } catch (err) {
      setError(typeof err?.message === 'string' ? err.message : 'Failed to load audit logs');
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
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ScrollText className="h-7 w-7 text-primary" />
          Immutable Security & Audit Logs
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tamper-evident audit trail recording all administrative mutations, user provisioning, and verification decisions.
        </p>
      </div>



      {/* Filter Bar */}
      <Card className="shadow-xs border-border/80">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="audit-action" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Filter by Action
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="audit-action"
                  placeholder="e.g. USER_CREATED, USER_STATUS_UPDATED..."
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="audit-resource" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Resource Type
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="audit-resource"
                  placeholder="e.g. USER, SETTINGS, EXAM..."
                  value={resourceTypeFilter}
                  onChange={(e) => setResourceTypeFilter(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-xs border-border/80 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Timestamp</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor ID</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Resource ID</TableHead>
                <TableHead className="text-right">Evidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading || error || logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <StateBoundary
                      isLoading={loading}
                      error={error}
                      isEmpty={logs.length === 0}
                      loadingMessage="Loading audit trail records..."
                      emptyTitle="No Audit Records Found"
                      emptyDescription="No audit records match the selected query criteria."
                      onRetry={() => loadLogs(pagination.page)}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((l) => (
                  <TableRow key={l.audit_id || l.auditId} className="transition-colors">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                      {(() => {
                        const raw = l.timestamp || l.created_at;
                        if (!raw) return 'N/A';
                        const d = new Date(raw);
                        return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString();
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs font-mono">
                        {l.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {l.actor_user_id || l.actorUserId || 'SYSTEM'}
                    </TableCell>
                    <TableCell className="text-xs font-medium text-foreground">
                      {l.resource_type || l.resourceType}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {l.resource_id || l.resourceId}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs font-medium"
                        onClick={() => handleOpenMeta(l)}
                      >
                        <FileJson className="h-3.5 w-3.5 mr-1 text-primary" />
                        Metadata
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/60 bg-muted/20 text-xs text-muted-foreground">
          <div>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} events recorded)
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs flex items-center gap-1"
              disabled={pagination.page <= 1 || loading}
              onClick={() => loadLogs(pagination.page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Button>
            <span className="px-2 font-medium text-foreground">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs flex items-center gap-1"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => loadLogs(pagination.page + 1)}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Metadata Inspector Modal */}
      <Dialog open={metaModalOpen} onOpenChange={setMetaModalOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-primary" />
              Audit Evidence Metadata
            </DialogTitle>
            <DialogDescription>
              Action: <span className="font-mono font-semibold text-foreground">{selectedLog?.action}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-1">
              <div>
                <span className="text-muted-foreground font-semibold">Resource: </span>
                <span className="font-mono text-foreground">
                  {selectedLog?.resource_type || selectedLog?.resourceType} ({selectedLog?.resource_id || selectedLog?.resourceId})
                </span>
              </div>
              <div>
                <span className="text-muted-foreground font-semibold">Timestamp: </span>
                <span className="font-mono text-foreground">
                  {selectedLog && (selectedLog.timestamp || selectedLog.created_at)}
                </span>
              </div>
            </div>

            <pre className="p-4 rounded-lg border border-border bg-muted/30 text-xs font-mono overflow-x-auto max-h-[320px] text-foreground">
              {JSON.stringify(selectedLog?.metadata || {}, null, 2)}
            </pre>

            <DialogFooter className="pt-2">
              <Button type="button" onClick={() => setMetaModalOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
