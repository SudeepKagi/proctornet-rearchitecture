/**
 * @file CandidateDashboardPage.jsx
 * @description Simplified Student Dashboard with exactly three capabilities:
 * 1. Upcoming assigned exams
 * 2. Attend live exam
 * 3. Results of finished exams
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  Award,
  Timer,
  Play,
} from 'lucide-react';
import * as sessionsApi from '../../api/sessionsApi.js';
import { useAuth } from '../../hooks/useAuth.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';

function formatDateTime(val) {
  if (!val) return 'To be announced';
  return new Date(val).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function useCountdown(targetDate) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!targetDate) return;
    const tick = () => {
      const diff = new Date(targetDate) - new Date();
      if (diff <= 0) {
        setRemaining('Starting now');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 48) {
        const days = Math.floor(h / 24);
        setRemaining(`${days}d ${h % 24}h`);
      } else if (h > 0) {
        setRemaining(`${h}h ${m}m`);
      } else {
        setRemaining(`${m}m ${s}s`);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);
  return remaining;
}

function UpcomingExamCard({ session, onAttend }) {
  const sid = session.session_id || session.id;
  const isLive = session.status === 'ACTIVE';
  const countdown = useCountdown(session.scheduled_start_time);

  return (
    <Card className="border border-slate-200 bg-white hover:border-blue-300 transition-colors shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="outline" className="text-xs border-blue-200 text-blue-700 bg-blue-50/50">
            Scheduled
          </Badge>
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
            <Clock size={12} />
            {formatDateTime(session.scheduled_start_time)}
          </span>
        </div>
        <CardTitle className="text-base font-bold text-slate-900 mt-2">
          {session.exam_title || 'Assigned Examination'}
        </CardTitle>
        {session.subject_name && (
          <CardDescription className="text-xs text-slate-500">
            {session.subject_name}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-3">
          <span className="flex items-center gap-1.5">
            <Timer size={13} className="text-slate-400" />
            {session.exam_duration_minutes || 60} Minutes
          </span>
          <span className="text-xs font-semibold text-blue-700">
            Starts in {countdown}
          </span>
        </div>

        <Button
          onClick={() => onAttend(sid)}
          variant={isLive ? 'default' : 'outline'}
          className={`w-full text-xs font-semibold h-9 gap-1.5 ${
            isLive
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {isLive ? 'Attend Exam Now' : 'View Exam Details'}
          <ArrowRight size={13} />
        </Button>
      </CardContent>
    </Card>
  );
}

export function CandidateDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadDashboard() {
    setLoading(true);
    setError('');
    try {
      const sessionData = await sessionsApi.listSessions();
      setSessions(Array.isArray(sessionData) ? sessionData : []);
    } catch (err) {
      setError(err?.message || 'Failed to load your examination dashboard. Please refresh.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const completed = sessions.filter(
    (s) => s.status === 'COMPLETED' || ['SUBMITTED', 'EXPIRED', 'COMPLETED'].includes(s.my_attempt_status)
  );
  const upcoming = sessions.filter(
    (s) =>
      !['COMPLETED', 'CANCELLED'].includes(s.status) &&
      !['SUBMITTED', 'EXPIRED', 'COMPLETED'].includes(s.my_attempt_status)
  );
  const activeExams = sessions.filter(
    (s) => s.status === 'ACTIVE' && !['SUBMITTED', 'EXPIRED', 'COMPLETED'].includes(s.my_attempt_status)
  );

  const firstName = (user?.name || 'Student').split(' ')[0];

  function handleAttendExam(sessionId) {
    navigate(`/candidate/readiness/${sessionId}`);
  }

  function handleViewResult(session) {
    if (session?.my_attempt_id) {
      navigate(`/candidate/attempts/${session.my_attempt_id}/result`);
      return;
    }
    navigate('/candidate/results');
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Student Examination Portal
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Welcome, {firstName}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Here are your upcoming examinations, active sessions, and test results.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadDashboard}
          disabled={loading}
          className="self-start sm:self-auto text-xs h-9 gap-1.5"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle size={16} />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={loadDashboard}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* 1. Attend Live Exam Section (Displayed prominently when an exam is currently active) */}
      {activeExams.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-base font-bold text-slate-900">
              Live Examination Ready to Attend
            </h2>
          </div>
          {activeExams.map((session) => {
            const sid = session.session_id || session.id;
            return (
              <Card
                key={sid}
                className="border-2 border-emerald-500 bg-emerald-50/70 shadow-md transition-all hover:shadow-lg"
              >
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="success" className="gap-1 font-semibold text-xs px-2.5 py-0.5">
                          Active Now
                        </Badge>
                        <span className="text-xs text-slate-600 font-medium">
                          Closes at{' '}
                          {new Date(session.scheduled_end_time).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-slate-900">
                        {session.exam_title || 'Assigned Examination'}
                      </h3>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Timer size={14} className="text-emerald-700" />
                          {session.exam_duration_minutes || 60} Minutes Duration
                        </span>
                        {session.subject_name && (
                          <span className="flex items-center gap-1.5 text-slate-600">
                            Subject: <strong className="text-slate-800">{session.subject_name}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleAttendExam(sid)}
                      className="shrink-0 h-11 px-8 font-bold text-sm bg-emerald-700 hover:bg-emerald-800 text-white gap-2 shadow-sm"
                    >
                      <Play size={16} className="fill-white" />
                      Attend Exam Now
                      <ArrowRight size={16} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 2. Upcoming Assigned Exams Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">Upcoming Assigned Exams</h2>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {upcoming.length} {upcoming.length === 1 ? 'Exam' : 'Exams'} Scheduled
          </span>
        </div>

        <StateBoundary
          isLoading={loading}
          error={error}
          isEmpty={upcoming.length === 0}
          loadingMessage="Loading assigned exams..."
          emptyTitle="No Upcoming Exams Assigned"
          emptyDescription="You currently have no scheduled examinations assigned to your branch and semester. New assignments will appear here."
          onRetry={loadDashboard}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {upcoming.map((session) => (
              <UpcomingExamCard
                key={session.session_id || session.id}
                session={session}
                onAttend={handleAttendExam}
              />
            ))}
          </div>
        </StateBoundary>
      </div>

      {/* 3. Results of Finished Exams Section */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award size={18} className="text-purple-600" />
            <h2 className="text-lg font-bold text-slate-900">Results of Finished Exams</h2>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {completed.length} {completed.length === 1 ? 'Result' : 'Results'} Available
          </span>
        </div>

        <StateBoundary
          isLoading={loading}
          error={error}
          isEmpty={completed.length === 0}
          loadingMessage="Loading completed examination results..."
          emptyTitle="No Finished Exams Yet"
          emptyDescription="When you submit an examination and scores are finalized, your results and performance scorecards will appear here."
          onRetry={loadDashboard}
        >
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-xs divide-y divide-slate-100">
            {completed.map((session) => {
              const sid = session.session_id || session.id;
              const hasScore = session.my_score !== undefined && session.my_score !== null;
              return (
                <div
                  key={sid}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">
                        {session.exam_title || 'Completed Examination'}
                      </h3>
                      <Badge variant="outline" className="text-[11px] border-emerald-300 text-emerald-800 bg-emerald-50">
                        <CheckCircle2 size={11} className="mr-1 text-emerald-600" />
                        Finished
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 text-xs text-slate-500">
                      <span>Submitted: {formatDateTime(session.scheduled_end_time || session.updated_at)}</span>
                      {hasScore && (
                        <span className="font-semibold text-slate-800">
                          Score: {session.my_score} / {session.total_marks || 100}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    onClick={() => handleViewResult(session)}
                    size="sm"
                    className="shrink-0 h-9 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                  >
                    <Award size={14} />
                    View Scorecard
                    <ArrowRight size={13} />
                  </Button>
                </div>
              );
            })}
          </div>
        </StateBoundary>
      </div>
    </div>
  );
}

export default CandidateDashboardPage;
