/**
 * @file InvigilatorDashboardPage.jsx
 * @description Invigilator portal listing assigned proctoring sessions.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Clock,
  MapPin,
  Calendar,
  AlertCircle,
  RefreshCw,
  Eye,
  ArrowRight,
} from 'lucide-react';
import * as sessionsApi from '../../api/sessionsApi.js';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';

function getSessionStatusBadge(status) {
  switch (status) {
    case 'ACTIVE':
      return <Badge variant="success">Active Session</Badge>;
    case 'SCHEDULED':
      return <Badge variant="secondary">Scheduled</Badge>;
    case 'COMPLETED':
      return <Badge variant="outline">Concluded</Badge>;
    case 'CANCELLED':
      return <Badge variant="destructive">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function InvigilatorDashboardPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadSessions() {
    try {
      setLoading(true);
      setError('');
      const data = await sessionsApi.listSessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load assigned sessions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Invigilation Operations
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Live Proctoring Hub
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Invigilator Proctoring Dashboard
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Monitor enrolled candidate attempt status, view multi-stream telemetry, and oversee in-session academic integrity.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={loadSessions}
            disabled={loading}
            className="text-xs h-9 gap-1.5 text-slate-700 dark:text-slate-300"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      <StateBoundary
        isLoading={loading}
        error={error}
        isEmpty={sessions.length === 0}
        loadingMessage="Loading invigilation assignments..."
        emptyTitle="No Assigned Invigilation Sessions"
        emptyDescription="You do not currently have any proctoring duties assigned to your account. You will be alerted when new sessions are rostered."
        onRetry={loadSessions}
      >
        <div className="grid gap-4">
          {sessions.map((sess) => {
            const sid = sess.session_id || sess.id || '';
            const sStart = sess.scheduled_start_time || sess.start_time;
            const sEnd = sess.scheduled_end_time || sess.end_time;
            const isLive = sess.status === 'ACTIVE';

            return (
              <Card
                key={sid}
                className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      {getSessionStatusBadge(sess.status)}
                      <span className="text-xs font-mono text-slate-400">
                        #{sid.slice(0, 8)}
                      </span>
                    </div>

                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                      {sess.exam_title || `Session ${sid.slice(0, 8)}`}
                    </h2>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <MapPin size={13} className="text-slate-400 dark:text-slate-500" />
                        Room: <strong className="font-semibold text-slate-800 dark:text-slate-200">{sess.room_name || 'Virtual / Unassigned'}</strong>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock size={13} className="text-slate-400 dark:text-slate-500" />
                        Start: <strong className="font-semibold text-slate-800 dark:text-slate-200">{sStart ? new Date(sStart).toLocaleString() : 'TBA'}</strong>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock size={13} className="text-slate-400 dark:text-slate-500" />
                        End: <strong className="font-semibold text-slate-800 dark:text-slate-200">{sEnd ? new Date(sEnd).toLocaleString() : 'TBA'}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
                    <Button
                      variant={isLive ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => navigate(`/invigilator/sessions/${sid}`)}
                      className={`gap-1.5 h-9 text-xs font-medium ${
                        isLive
                          ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                          : ''
                      }`}
                    >
                      <Eye size={13} />
                      <span>Launch Session Monitor</span>
                      <ArrowRight size={13} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </StateBoundary>
    </div>
  );
}

export default InvigilatorDashboardPage;
