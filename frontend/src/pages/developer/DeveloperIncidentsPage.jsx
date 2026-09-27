/**
 * @file DeveloperIncidentsPage.jsx
 * @description Technical Incident Triage & Alerts Dashboard (Workspace 6).
 * Surfaces operational service degradations with Acknowledge and Resolve workflows.
 */

import React, { useState, useEffect } from 'react';
import {
  getDeveloperIncidents,
  acknowledgeDeveloperIncident,
  resolveDeveloperIncident,
} from '../../api/developerApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { StateBoundary } from '@/components/common/StateBoundary.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  MessageSquare,
  AlertCircle,
  Activity,
  Check,
} from 'lucide-react';

const STATUS_TABS = ['ALL', 'TRIGGERED', 'ACKNOWLEDGED', 'RESOLVED'];

export function DeveloperIncidentsPage() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [actionNotes, setActionNotes] = useState('');
  const [activeModal, setActiveModal] = useState(null); // { type: 'ACK' | 'RESOLVE', incidentId: string }
  const [submitting, setSubmitting] = useState(false);

  async function loadIncidents() {
    try {
      setLoading(true);
      const filters = {};
      if (statusFilter !== 'ALL') filters.status = statusFilter;

      const res = await getDeveloperIncidents(filters);
      setIncidents(res.incidents || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch operational incidents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadIncidents();
  }, [statusFilter]);

  async function handleAcknowledge(incidentId) {
    try {
      setSubmitting(true);
      await acknowledgeDeveloperIncident(incidentId, actionNotes);
      setActiveModal(null);
      setActionNotes('');
      await loadIncidents();
    } catch (err) {
      setError(err.message || 'Failed to acknowledge incident');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve(incidentId) {
    try {
      setSubmitting(true);
      await resolveDeveloperIncident(incidentId, actionNotes);
      setActiveModal(null);
      setActionNotes('');
      await loadIncidents();
    } catch (err) {
      setError(err.message || 'Failed to resolve incident');
    } finally {
      setSubmitting(false);
    }
  }

  function getSeverityBadge(sev) {
    switch (sev?.toUpperCase()) {
      case 'CRITICAL':
        return <Badge variant="destructive" className="text-xs font-mono">CRITICAL</Badge>;
      case 'HIGH':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 text-xs font-mono">HIGH</Badge>;
      case 'MEDIUM':
        return <Badge variant="default" className="text-xs font-mono">MEDIUM</Badge>;
      default:
        return <Badge variant="outline" className="text-xs font-mono text-muted-foreground">LOW</Badge>;
    }
  }

  function getStatusBadge(status) {
    switch (status?.toUpperCase()) {
      case 'TRIGGERED':
        return <Badge variant="destructive" className="text-xs">TRIGGERED</Badge>;
      case 'ACKNOWLEDGED':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 text-xs">ACKNOWLEDGED</Badge>;
      case 'RESOLVED':
        return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-xs">RESOLVED</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ShieldAlert className="h-7 w-7 text-primary" />
          Technical Incident Triage & Alerts
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Surfaces operational service degradations with formal acknowledge and resolve workflows.
        </p>
      </div>

      {/* Header & Status Filters */}
      <Card className="shadow-xs border-border/80">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {STATUS_TABS.map((tab) => {
                const isSelected = statusFilter === tab;
                return (
                  <Button
                    key={tab}
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs font-mono px-3"
                    onClick={() => setStatusFilter(tab)}
                  >
                    {tab}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={loadIncidents}
              className="h-8 text-xs flex items-center gap-1.5 self-end sm:self-auto"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh Incidents</span>
            </Button>
          </div>
        </CardContent>
      </Card>



      {/* Incidents List */}
      <Card className="shadow-xs border-border/80 overflow-hidden">
        <CardContent className="p-4">
          <StateBoundary
            isLoading={loading}
            error={error}
            isEmpty={incidents.length === 0}
            loadingMessage="Loading active operational incidents..."
            emptyTitle="All Systems Operational"
            emptyDescription="No operational incidents matching the selected status."
            onRetry={loadIncidents}
          >
            <div className="space-y-3">
              {incidents.map((inc) => (
                <div
                  key={inc.id}
                  className="rounded-xl border border-border/70 bg-card p-4 space-y-3 transition-colors hover:border-border"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {getSeverityBadge(inc.severity)}
                      {getStatusBadge(inc.status)}
                      <span className="font-bold text-foreground text-sm">
                        {inc.component}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        ({inc.id})
                      </span>
                    </div>

                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Triggered: {new Date(inc.triggeredAt).toLocaleString()}</span>
                      {inc.occurrenceCount > 1 && (
                        <span className="font-semibold text-foreground">
                          (Seen {inc.occurrenceCount}x)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-foreground font-medium">
                    {inc.message}
                  </div>

                  {/* Status Metadata & Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-border/60 text-xs">
                    <div className="text-muted-foreground">
                      {inc.acknowledgedBy && (
                        <span className="mr-3">
                          Ack by: <strong className="text-foreground">{inc.acknowledgedBy}</strong> at {new Date(inc.acknowledgedAt).toLocaleTimeString()}
                        </span>
                      )}
                      {inc.resolvedBy && (
                        <span>
                          Resolved by: <strong className="text-foreground">{inc.resolvedBy}</strong> at {new Date(inc.resolvedAt).toLocaleTimeString()}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {inc.status === 'TRIGGERED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            setActiveModal({ type: 'ACK', incidentId: inc.id });
                            setActionNotes('');
                          }}
                        >
                          Acknowledge
                        </Button>
                      )}
                      {inc.status !== 'RESOLVED' && (
                        <Button
                          variant="default"
                          size="sm"
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
                          onClick={() => {
                            setActiveModal({ type: 'RESOLVE', incidentId: inc.id });
                            setActionNotes('');
                          }}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Mark Resolved
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Notes History */}
                  {inc.notes && inc.notes.length > 0 && (
                    <div className="rounded-lg bg-muted/30 border border-border/60 p-3 text-xs space-y-1.5">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-primary" />
                        Investigation Notes:
                      </div>
                      {inc.notes.map((note, idx) => (
                        <div key={idx} className="text-muted-foreground pl-5 border-l-2 border-primary/40 text-[11px]">
                          <span className="font-mono text-[10px] text-muted-foreground mr-1.5">
                            [{new Date(note.timestamp).toLocaleTimeString()}]
                          </span>
                          <strong className="text-foreground">{note.author}:</strong> {note.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </StateBoundary>
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={Boolean(activeModal)} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {activeModal?.type === 'ACK' ? 'Acknowledge Operational Incident' : 'Mark Incident Resolved'}
            </DialogTitle>
            <DialogDescription>
              Incident ID: <span className="font-mono font-semibold text-foreground">{activeModal?.incidentId}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
              Operational Notes / Root Cause (Optional)
            </label>
            <textarea
              rows={4}
              placeholder="Enter triage diagnosis, mitigation steps, or root-cause details..."
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              className="w-full p-3 rounded-md border border-input bg-background text-foreground text-xs font-mono shadow-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => setActiveModal(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={submitting}
                className={activeModal?.type === 'RESOLVE' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                onClick={() =>
                  activeModal?.type === 'ACK'
                    ? handleAcknowledge(activeModal.incidentId)
                    : handleResolve(activeModal.incidentId)
                }
              >
                {submitting ? 'Submitting...' : 'Confirm Action'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
