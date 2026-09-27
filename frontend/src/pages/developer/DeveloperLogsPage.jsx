/**
 * @file DeveloperLogsPage.jsx
 * @description Centralized Masked System Logs Viewer (Workspace 3).
 * Queries the in-memory circular ring buffer with sub-second response times and multi-layer PII masking.
 */

import React, { useState, useEffect } from 'react';
import { getDeveloperLogs } from '../../api/developerApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { StateBoundary } from '@/components/common/StateBoundary.jsx';
import {
  Terminal,
  Search,
  RefreshCw,
  Clock,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  FileCode2,
} from 'lucide-react';

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

  function getLevelBadge(lvl) {
    switch (lvl?.toLowerCase()) {
      case 'fatal':
      case 'error':
        return <Badge variant="destructive" className="text-[10px] font-mono font-bold">ERROR</Badge>;
      case 'warn':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 text-[10px] font-mono">WARN</Badge>;
      case 'info':
        return <Badge variant="default" className="bg-primary/90 text-[10px] font-mono">INFO</Badge>;
      case 'debug':
      default:
        return <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">DEBUG</Badge>;
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Terminal className="h-7 w-7 text-primary" />
          Centralized Masked System Logs
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          High-throughput 5,000-entry in-memory ring buffer with source-level PII redaction and W3C trace correlation.
        </p>
      </div>



      {/* Search & Filter Toolbar */}
      <Card className="shadow-xs border-border/80">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Level Selector Pills */}
            <div className="flex flex-wrap gap-1.5">
              {LEVELS.map((lvl) => {
                const isSelected = selectedLevel === lvl;
                return (
                  <Button
                    key={lvl}
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs font-mono px-3"
                    onClick={() => setSelectedLevel(lvl)}
                  >
                    {lvl}
                  </Button>
                );
              })}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="live-stream-logs"
                  checked={autoRefresh}
                  onCheckedChange={(checked) => setAutoRefresh(Boolean(checked))}
                />
                <label htmlFor="live-stream-logs" className="text-xs font-medium text-foreground cursor-pointer">
                  Live Stream (3s)
                </label>
              </div>
              <Button variant="outline" size="sm" onClick={loadLogs} className="h-8 text-xs">
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Search Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search log message or context..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm font-mono"
              />
            </div>
            <div className="relative">
              <FileCode2 className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by W3C Trace ID..."
                value={traceId}
                onChange={(e) => setTraceId(e.target.value)}
                className="pl-9 h-9 text-sm font-mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card className="shadow-xs border-border/80 overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-border/60 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              Showing {logs.length} of {totalMatching} matching entries in buffer
            </span>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              PII, passwords & tokens redacted at source
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          <StateBoundary
            isLoading={loading && logs.length === 0}
            error={error}
            isEmpty={logs.length === 0}
            loadingMessage="Streaming circular buffer logs..."
            emptyTitle="No Matching Logs"
            emptyDescription="No logs matching current criteria in the circular buffer."
            onRetry={loadLogs}
          >
            <div className="space-y-1.5 font-mono text-xs">
              {logs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                return (
                  <div
                    key={log.id}
                    className="rounded-lg border border-border/70 bg-card overflow-hidden transition-colors hover:border-border"
                  >
                    <div
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/30 select-none"
                    >
                      <span className="text-muted-foreground text-[11px] shrink-0 w-24">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      {getLevelBadge(log.level)}
                      <span className="text-primary font-bold shrink-0">
                        [{log.service}]
                      </span>
                      {log.traceId && (
                        <span className="text-muted-foreground text-[11px] shrink-0 hidden md:inline">
                          trace:{log.traceId.slice(0, 8)}
                        </span>
                      )}
                      <span className="text-foreground truncate flex-1">
                        {log.message}
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
                          {JSON.stringify(
                            {
                              id: log.id,
                              timestamp: log.timestamp,
                              level: log.level,
                              service: log.service,
                              message: log.message,
                              traceId: log.traceId,
                              requestId: log.requestId,
                              context: log.context,
                            },
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </StateBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
