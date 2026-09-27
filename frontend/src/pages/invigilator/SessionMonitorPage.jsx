/**
 * @file SessionMonitorPage.jsx
 * @description Invigilator monitor displaying real-time candidate roster attempt statuses,
 * 12-stream SFU video grid, candidate detail drawer, realtime intervention controls,
 * incident reporting, and formal session sign-off.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Shield,
  Clock,
  Radio,
  Wifi,
  WifiOff,
  AlertTriangle,
  AlertCircle,
  Megaphone,
  FileWarning,
  CheckCircle2,
  RefreshCw,
  Eye,
  Users,
  Video,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import * as sessionsApi from '../../api/sessionsApi.js';
import * as resultsApi from '../../api/resultsApi.js';
import * as proctoringApi from '../../api/proctoringApi.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';
import { useRealtime } from '../../hooks/useRealtime.js';
import { CandidateMediaGrid } from '../../components/media/CandidateMediaGrid.jsx';
import CandidateDetailDrawer from '../../components/invigilator/CandidateDetailDrawer.jsx';
import {
  AnnouncementModal,
  CandidateMessageModal,
  PauseAttemptModal,
  ResumeAttemptModal,
  TerminateAttemptModal,
} from '../../components/invigilator/InterventionModals.jsx';
import EvidenceModal from '../../components/invigilator/EvidenceModal.jsx';
import { SessionSignOffModal, IncidentReportModal } from '../../components/invigilator/SessionSignOffModal.jsx';

function getSessionStatusBadge(status) {
  switch (status) {
    case 'ACTIVE':
      return <Badge variant="success">Active Session</Badge>;
    case 'CONCLUDED':
    case 'COMPLETED':
      return <Badge variant="outline">Concluded</Badge>;
    case 'CANCELLED':
      return <Badge variant="destructive">Cancelled</Badge>;
    default:
      return <Badge variant="secondary">{status || 'Scheduled'}</Badge>;
  }
}

function getRiskBadge(score) {
  const num = Number(score) || 0;
  if (num >= 80) return <Badge variant="destructive">{num} / 100</Badge>;
  if (num >= 50) return <Badge variant="warning">{num} / 100</Badge>;
  if (num > 0) return <Badge variant="default">{num} / 100</Badge>;
  return <Badge variant="outline">{num} / 100</Badge>;
}

export function SessionMonitorPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [results, setResults] = useState([]);
  const [proctoringSummary, setProctoringSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('media');

  // Modal and Drawer States
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [activeModal, setActiveModal] = useState(null); // 'announcement' | 'message' | 'pause' | 'resume' | 'terminate' | 'evidence' | 'incident' | 'signoff'

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const sessionData = await sessionsApi.getSession(sessionId);
        setSession(sessionData);

        const [scopedResults, proctorData] = await Promise.all([
          sessionData?.exam_id
            ? resultsApi.getExamResults(sessionData.exam_id, { sessionId }).catch(() => [])
            : Promise.resolve([]),
          proctoringApi.getSessionProctoringSummary(sessionId).catch(() => null),
        ]);
        setResults(Array.isArray(scopedResults) ? scopedResults : []);
        setProctoringSummary(proctorData);
      } catch (err) {
        setError(err.message || 'Failed to load session monitor data');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [sessionId]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const [presenceMap, setPresenceMap] = useState({});

  const handleRiskScoreUpdated = useCallback((payload) => {
    setProctoringSummary((prev) => {
      if (!prev || !prev.candidates) return prev;
      const nextCandidates = prev.candidates.map((c) => {
        if (c.studentId === payload.studentId) {
          return {
            ...c,
            riskScore: payload.riskScore,
            violationCount: (c.violationCount || 0) + 1,
          };
        }
        return c;
      });
      const highRiskCount = nextCandidates.filter((c) => (Number(c.riskScore) || 0) >= 50).length;
      return {
        ...prev,
        candidates: nextCandidates,
        highRiskAttemptsCount: highRiskCount,
      };
    });
  }, []);

  const handleFlagRaised = useCallback((payload) => {
    setProctoringSummary((prev) => {
      if (!prev || !prev.candidates) return prev;
      const nextCandidates = prev.candidates.map((c) => {
        if (c.studentId === payload.studentId) {
          const activeFlags = Array.isArray(c.activeFlags) ? [...c.activeFlags] : [];
          if (!activeFlags.some((f) => f.flagId === payload.flagId)) {
            activeFlags.push(payload);
          }
          return {
            ...c,
            activeFlags,
            activeFlagsCount: (c.activeFlagsCount || 0) + 1,
            latestViolation: { eventType: payload.flagType, severity: payload.severity },
          };
        }
        return c;
      });
      return {
        ...prev,
        candidates: nextCandidates,
      };
    });
  }, []);

  const handleFlagReviewed = useCallback((payload) => {
    setProctoringSummary((prev) => {
      if (!prev || !prev.candidates) return prev;
      const nextCandidates = prev.candidates.map((c) => {
        if (c.studentId === payload.studentId && Array.isArray(c.activeFlags)) {
          const activeFlags = c.activeFlags.filter((f) => f.flagId !== payload.flagId);
          return {
            ...c,
            activeFlags,
            activeFlagsCount: Math.max(0, (c.activeFlagsCount || 1) - 1),
          };
        }
        return c;
      });
      return {
        ...prev,
        candidates: nextCandidates,
      };
    });
  }, []);

  const handlePresenceChanged = useCallback((payload) => {
    if (payload?.studentId) {
      setPresenceMap((prev) => ({
        ...prev,
        [payload.studentId]: payload.status,
      }));
    }
  }, []);

  const handleInterventionEvent = useCallback(() => {
    loadData(true);
  }, [loadData]);

  const realtimeHandlers = useMemo(
    () => ({
      'proctoring:risk_score_updated': handleRiskScoreUpdated,
      'proctoring:flag_raised': handleFlagRaised,
      'proctoring:flag_reviewed': handleFlagReviewed,
      'candidate:presence_changed': handlePresenceChanged,
      'candidate:paused': handleInterventionEvent,
      'candidate:resumed': handleInterventionEvent,
      'candidate:terminated': handleInterventionEvent,
      'invigilator:intervention_logged': handleInterventionEvent,
      'session:concluded': handleInterventionEvent,
    }),
    [
      handleRiskScoreUpdated,
      handleFlagRaised,
      handleFlagReviewed,
      handlePresenceChanged,
      handleInterventionEvent,
    ]
  );

  const { status: wsStatus, isDegraded } = useRealtime(
    sessionId ? `session:${sessionId}` : null,
    realtimeHandlers
  );

  // Fallback to 10s REST polling when cross-node Redis synchronization is degraded
  useEffect(() => {
    if (!isDegraded) return;
    const pollTimer = setInterval(() => {
      loadData(true);
    }, 10000);
    return () => clearInterval(pollTimer);
  }, [isDegraded, loadData]);

  const candidateProctorMap = useMemo(() => {
    const map = {};
    if (proctoringSummary?.candidates) {
      for (const c of proctoringSummary.candidates) {
        map[c.studentId] = c;
      }
    }
    return map;
  }, [proctoringSummary]);

  const students = session?.students || [];

  const selectedCandidate = useMemo(() => {
    if (!selectedCandidateId) return null;
    const st = students.find((s) => (s.student_id || s.id) === selectedCandidateId) || {};
    const pData = candidateProctorMap[selectedCandidateId] || {};
    return {
      ...st,
      studentId: selectedCandidateId,
      name: st.name || st.student_name || 'Candidate',
      attemptId: pData.attemptId || st.attempt_id,
      attemptStatus: pData.attemptStatus || st.attempt_status || 'READY',
      riskScore: pData.riskScore ?? 0,
      violationCount: pData.violationCount ?? 0,
      activeFlags: pData.activeFlags || [],
      latestViolation: pData.latestViolation,
    };
  }, [selectedCandidateId, students, candidateProctorMap]);

  if (loading || error || !session) {
    return (
      <div className="w-full max-w-5xl mx-auto py-12 px-4 space-y-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/invigilator')}
          className="text-xs h-8 gap-1.5 text-slate-700 dark:text-slate-300"
        >
          <ArrowLeft size={13} />
          <span>Back to Dashboard</span>
        </Button>
        <StateBoundary
          isLoading={loading}
          error={error}
          isEmpty={!session}
          loadingMessage="Connecting to session monitor & telemetry pipeline..."
          emptyTitle="Proctoring Session Not Found"
          emptyDescription="The requested invigilation session does not exist or you do not have permission to view it."
          onRetry={() => loadData(false)}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-12">
      {/* Back Button */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/invigilator')}
          className="text-xs h-8 gap-1.5 text-slate-700 dark:text-slate-300"
        >
          <ArrowLeft size={13} />
          <span>Back to Dashboard</span>
        </Button>
      </div>

      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Live Monitoring Console
          </span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Room: {session?.room_name || 'Online / Virtual Room'}
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {session?.exam_title || `Session #${sessionId.slice(0, 8)}`}
              </h1>
              {getSessionStatusBadge(session?.status)}
              {isDegraded ? (
                <Badge variant="warning" size="sm" className="gap-1">
                  <AlertTriangle size={12} />
                  Realtime Degraded (10s Polling)
                </Badge>
              ) : wsStatus === 'CONNECTED' ? (
                <Badge variant="success" size="sm" className="gap-1">
                  <Radio size={12} className="animate-pulse" />
                  Live WebSocket Sync
                </Badge>
              ) : (
                <Badge variant="outline" size="sm">
                  Realtime: {wsStatus}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Proctoring supervisor portal with multi-stream WebRTC feeds, anomaly flags, and authoritative intervention triggers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveModal('announcement')}
              className="text-xs h-9 gap-1.5"
            >
              <Megaphone size={14} />
              <span>Announcement</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveModal('incident')}
              className="text-xs h-9 gap-1.5"
            >
              <FileWarning size={14} />
              <span>File Incident</span>
            </Button>
            {session?.status !== 'CONCLUDED' && (
              <Button
                size="sm"
                onClick={() => setActiveModal('signoff')}
                className="text-xs h-9 gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
              >
                <CheckCircle2 size={14} />
                <span>Sign-Off & Conclude</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => loadData(true)}
              className="text-xs h-9 gap-1"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>
      </div>

      {isDegraded && (
        <Alert variant="warning">
          <AlertTriangle size={16} />
          <AlertTitle>Cross-Node Synchronization Notice</AlertTitle>
          <AlertDescription>
            Realtime WebSocket connection is operating in degraded mode. The invigilator console has automatically fallen back to 10-second REST synchronization.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle size={16} />
          <AlertTitle>Telemetry Stream Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Proctoring Summary KPI Cards */}
      {proctoringSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardContent className="p-4 space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Assigned Candidates
              </span>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {proctoringSummary.totalAssignedCandidates}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardContent className="p-4 space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Active Ingesting Attempts
              </span>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {proctoringSummary.activeAttemptCount}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardContent className="p-4 space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
                High-Risk Candidates (Score &ge; 80)
              </span>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {proctoringSummary.highRiskAttemptCount || 0}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
          <TabsList>
            <TabsTrigger value="media" className="gap-1.5">
              <Video size={14} />
              <span>Live Media Monitor (12-Stream SFU)</span>
            </TabsTrigger>
            <TabsTrigger value="roster" className="gap-1.5">
              <Users size={14} />
              <span>Candidate Roster & Status ({students.length})</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Live Media Grid */}
        <TabsContent value="media" className="pt-2">
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs p-4">
            <CandidateMediaGrid
              sessionId={sessionId}
              onSelectCandidate={(candidateId) => setSelectedCandidateId(candidateId)}
            />
          </Card>
        </TabsContent>

        {/* Tab 2: Candidate Roster Table */}
        <TabsContent value="roster" className="pt-2">
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users size={16} className="text-slate-600 dark:text-slate-400" />
                Enrolled Candidates & Live Telemetry ({students.length})
              </CardTitle>
            </CardHeader>

            <CardContent className="p-0">
              <StateBoundary
                isEmpty={students.length === 0}
                emptyTitle="No Candidates Enrolled"
                emptyDescription="Assign candidate roster from the faculty session management portal."
              >
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[24%]">Candidate</TableHead>
                        <TableHead className="w-[18%]">Email</TableHead>
                        <TableHead className="w-[12%]">Attempt State</TableHead>
                        <TableHead className="w-[12%]">Risk Score</TableHead>
                        <TableHead className="w-[10%]">Violations</TableHead>
                        <TableHead className="w-[12%]">Active Flags</TableHead>
                        <TableHead className="w-[12%] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {students.map((st) => {
                        const candidateId = st.student_id || st.id;
                        const pData = candidateProctorMap[candidateId] || {};
                        const riskScore = pData.riskScore ?? 0;
                        const violationCount = pData.violationCount ?? 0;
                        const activeFlags = pData.activeFlags || [];
                        const isOffline = presenceMap[candidateId] === 'OFFLINE';

                        return (
                          <TableRow key={candidateId} className="h-12">
                            <TableCell className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                              <div className="flex items-center gap-2">
                                <span>{st.name || st.student_name || 'Candidate'}</span>
                                <Badge
                                  variant={isOffline ? 'destructive' : 'success'}
                                  size="sm"
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {isOffline ? 'OFFLINE' : 'ONLINE'}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                              {st.email || '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" size="sm">
                                {pData.attemptStatus || st.attempt_status || 'READY'}
                              </Badge>
                            </TableCell>
                            <TableCell>{getRiskBadge(riskScore)}</TableCell>
                            <TableCell className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {violationCount}
                            </TableCell>
                            <TableCell>
                              {activeFlags.length === 0 ? (
                                <span className="text-xs text-slate-400">None</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {activeFlags.map((f) => (
                                    <Badge
                                      key={f.flagId}
                                      variant={f.severity === 'CRITICAL' ? 'destructive' : 'warning'}
                                      size="sm"
                                      className="text-[10px]"
                                    >
                                      {f.flagType}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedCandidateId(candidateId)}
                                className="h-7 text-xs px-2.5 gap-1"
                              >
                                <span>Inspect</span>
                                <ChevronRight size={12} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </StateBoundary>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Session-Scoped Results Record (if concluded/evaluated) */}
      {results.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 size={16} className="text-slate-600 dark:text-slate-400" />
              Session Evaluated Scores ({results.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Percentage</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => (
                    <TableRow key={r.attempt_id} className="h-11">
                      <TableCell className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                        {r.student_name || 'Candidate'}
                      </TableCell>
                      <TableCell className="text-xs font-semibold">
                        {r.score} / {r.total_marks}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 dark:text-slate-400">
                        {r.percentage !== undefined ? `${Number(r.percentage).toFixed(2)}%` : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.is_passed ? 'success' : 'destructive'} size="sm">
                          {r.is_passed ? 'PASSED' : 'FAILED'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Candidate Detail Drawer */}
      <CandidateDetailDrawer
        isOpen={Boolean(selectedCandidateId)}
        onClose={() => setSelectedCandidateId(null)}
        candidate={selectedCandidate}
        onOpenMessage={() => setActiveModal('message')}
        onOpenPause={() => setActiveModal('pause')}
        onOpenResume={() => setActiveModal('resume')}
        onOpenTerminate={() => setActiveModal('terminate')}
        onOpenEvidence={() => setActiveModal('evidence')}
        onOpenIncident={() => setActiveModal('incident')}
        onFlagUpdated={() => loadData(true)}
      />

      {/* Realtime Intervention Modals */}
      <AnnouncementModal
        isOpen={activeModal === 'announcement'}
        onClose={() => setActiveModal(null)}
        sessionId={sessionId}
      />

      {selectedCandidate && (
        <>
          <CandidateMessageModal
            isOpen={activeModal === 'message'}
            onClose={() => setActiveModal(null)}
            attemptId={selectedCandidate.attemptId}
            candidateName={selectedCandidate.name}
          />
          <PauseAttemptModal
            isOpen={activeModal === 'pause'}
            onClose={() => setActiveModal(null)}
            attemptId={selectedCandidate.attemptId}
            candidateName={selectedCandidate.name}
            onSuccess={() => loadData(true)}
          />
          <ResumeAttemptModal
            isOpen={activeModal === 'resume'}
            onClose={() => setActiveModal(null)}
            attemptId={selectedCandidate.attemptId}
            candidateName={selectedCandidate.name}
            onSuccess={() => loadData(true)}
          />
          <TerminateAttemptModal
            isOpen={activeModal === 'terminate'}
            onClose={() => setActiveModal(null)}
            attemptId={selectedCandidate.attemptId}
            candidateName={selectedCandidate.name}
            onSuccess={() => loadData(true)}
          />
          <EvidenceModal
            isOpen={activeModal === 'evidence'}
            onClose={() => setActiveModal(null)}
            attemptId={selectedCandidate.attemptId}
            candidateName={selectedCandidate.name}
          />
        </>
      )}

      <SessionSignOffModal
        isOpen={activeModal === 'signoff'}
        onClose={() => setActiveModal(null)}
        sessionId={sessionId}
        onSignedOff={() => loadData(true)}
      />

      <IncidentReportModal
        isOpen={activeModal === 'incident'}
        onClose={() => setActiveModal(null)}
        sessionId={sessionId}
        candidates={students}
        preselectedCandidateId={selectedCandidate?.studentId || null}
        onReported={() => loadData(true)}
      />
    </div>
  );
}

export default SessionMonitorPage;
