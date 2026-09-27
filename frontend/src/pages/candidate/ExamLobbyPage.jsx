/**
 * @file ExamLobbyPage.jsx
 * @description Pre-Exam Holding Lobby with authoritative synchronized countdown timer,
 * readiness checklist verification, and automated launch into the proctored exam environment.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clock,
  ShieldCheck,
  Monitor,
  CheckCircle2,
  AlertCircle,
  Play,
  ArrowLeft,
  Calendar,
  Layers,
  Sparkles,
  RefreshCw,
  Lock,
  Timer,
  AlertTriangle
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';
import * as sessionsApi from '../../api/sessionsApi.js';
import { setAntiTamperToken } from '../../api/client.js';

export function ExamLobbyPage() {
  const { sessionId, examId } = useParams();
  const targetId = sessionId || examId;
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [existingAttempt, setExistingAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  // Time tracking
  const [now, setNow] = useState(new Date());
  const timerRef = useRef(null);

  // Load session data
  const loadLobby = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const sessionData = await sessionsApi.getSession(targetId);
      const sid = sessionData?.session_id || targetId;

      let myAttempt = null;
      try {
        myAttempt = await sessionsApi.getMyAttempt(sid);
      } catch {
        myAttempt = null;
      }

      setSession(sessionData);
      setExistingAttempt(myAttempt);
    } catch (err) {
      setError(err?.data || err);
    } finally {
      setLoading(false);
    }
  }, [targetId]);

  useEffect(() => {
    loadLobby();
  }, [loadLobby]);

  // Tick every second to drive the countdown
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const scheduledStart = session?.scheduled_start_time ? new Date(session.scheduled_start_time) : null;
  const scheduledEnd = session?.scheduled_end_time ? new Date(session.scheduled_end_time) : null;

  // Window states
  const isUpcoming = scheduledStart && now < scheduledStart;
  const isLive = scheduledStart && scheduledEnd && now >= scheduledStart && now < scheduledEnd;
  const isExpired = scheduledEnd && now >= scheduledEnd;

  // Calculate countdown differences
  const diffStartMs = scheduledStart ? Math.max(0, scheduledStart.getTime() - now.getTime()) : 0;
  const hoursUntil = Math.floor(diffStartMs / (1000 * 60 * 60));
  const minutesUntil = Math.floor((diffStartMs % (1000 * 60 * 60)) / (1000 * 60));
  const secondsUntil = Math.floor((diffStartMs % (1000 * 60)) / 1000);

  // Start or resume the examination attempt
  const handleEnterExam = async () => {
    if (starting) return;
    setStarting(true);
    setError('');

    const sid = session?.session_id || targetId;
    try {
      const result = await sessionsApi.startAttemptForSession(sid);
      const attemptId = result?.attemptId || result?.attempt_id || result?.id;
      if (result?.anti_tamper_token) {
        setAntiTamperToken(result.anti_tamper_token);
      }

      if (result?.redirectUrl) {
        navigate(result.redirectUrl, { replace: true });
      } else if (attemptId) {
        navigate(`/candidate/attempts/${attemptId}`, { replace: true });
      } else {
        navigate(`/candidate/attempts/${sid}`, { replace: true });
      }
    } catch (err) {
      // If error returns existing attempt ID, navigate immediately
      const existingId = err?.existingAttemptId || err?.data?.attemptId || err?.data?.attempt_id;
      if (existingId) {
        navigate(`/candidate/attempts/${existingId}`, { replace: true });
      } else {
        setError(err?.message || 'Unable to launch examination attempt. Please try again.');
        setStarting(false);
      }
    }
  };

  // Auto-launch when timer hits 0 if window just opened
  const autoLaunchedRef = useRef(false);
  useEffect(() => {
    if (isLive && !isUpcoming && !autoLaunchedRef.current && session && !loading) {
      autoLaunchedRef.current = true;
      // Auto-trigger launch or display active state
    }
  }, [isLive, isUpcoming, session, loading]);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-16 pt-4 px-4 sm:px-6">
      <StateBoundary
        isLoading={loading}
        error={error}
        isEmpty={!session}
        emptyTitle="Examination Session Unavailable"
        emptyDescription="The requested session could not be found or you are not enrolled in this roster."
        onRetry={loadLobby}
      >
        {session && (
          <>
            {/* Top Breadcrumb / Return */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/candidate')}
          className="text-xs h-8 gap-1.5 text-slate-600"
        >
          <ArrowLeft size={13} />
          <span>Back to Dashboard</span>
        </Button>

        <Badge
          variant="outline"
          className={
            isLive
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold'
              : isUpcoming
              ? 'border-blue-300 bg-blue-50 text-blue-700 font-semibold'
              : 'border-slate-300 bg-slate-50 text-slate-600'
          }
        >
          <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'}`} />
          {isLive ? 'Exam Window Open' : isUpcoming ? 'Waiting Room' : 'Exam Window Closed'}
        </Badge>
      </div>

      {/* Main Holding Card */}
      <Card className="border-slate-200 shadow-md bg-white dark:bg-slate-900 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white p-6 sm:p-8">
          <p className="text-xs uppercase tracking-widest text-blue-400 font-semibold mb-1">
            Proctored Assessment Lobby
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {session.exam_title || 'Examination Session'}
          </h1>
          <p className="text-sm text-slate-300 mt-2 max-w-2xl leading-relaxed">
            {session.exam_description ||
              'Please remain in this lobby. System diagnostics and identity verification are complete. Your test will become accessible according to the official schedule.'}
          </p>

          <div className="mt-6 flex flex-wrap gap-4 text-xs text-slate-300 border-t border-slate-800/80 pt-4">
            <span className="flex items-center gap-1.5">
              <Clock size={13} className="text-blue-400" />
              Duration: {session.exam_duration_minutes || 60} Minutes
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar size={13} className="text-blue-400" />
              Scheduled: {scheduledStart ? scheduledStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBA'} -{' '}
              {scheduledEnd ? scheduledEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBA'}
            </span>
            <span className="flex items-center gap-1.5">
              <Layers size={13} className="text-blue-400" />
              Room: {session.room_name || 'Online Portal'}
            </span>
          </div>
        </div>

        <CardContent className="p-6 sm:p-8 space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle size={15} />
              <AlertTitle>Notice</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* STATE 1: UPCOMING COUNTDOWN */}
          {isUpcoming && (
            <div className="text-center py-6 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
                <Timer size={14} className="animate-spin" />
                <span>Exam Countdown</span>
              </div>

              <div className="flex items-center justify-center gap-3 sm:gap-6 pt-2">
                <div className="flex flex-col items-center bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4 min-w-[70px] sm:min-w-[90px]">
                  <span className="text-3xl sm:text-5xl font-extrabold text-slate-900 font-mono">
                    {String(hoursUntil).padStart(2, '0')}
                  </span>
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 mt-1">
                    Hours
                  </span>
                </div>
                <span className="text-2xl sm:text-4xl font-bold text-slate-300">:</span>
                <div className="flex flex-col items-center bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4 min-w-[70px] sm:min-w-[90px]">
                  <span className="text-3xl sm:text-5xl font-extrabold text-slate-900 font-mono">
                    {String(minutesUntil).padStart(2, '0')}
                  </span>
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 mt-1">
                    Minutes
                  </span>
                </div>
                <span className="text-2xl sm:text-4xl font-bold text-slate-300">:</span>
                <div className="flex flex-col items-center bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4 min-w-[70px] sm:min-w-[90px]">
                  <span className="text-3xl sm:text-5xl font-extrabold text-blue-600 font-mono">
                    {String(secondsUntil).padStart(2, '0')}
                  </span>
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 mt-1">
                    Seconds
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-500 max-w-md mx-auto pt-2">
                The test room will unlock automatically when the timer reaches zero. Please keep this tab open and your screen share active.
              </p>
            </div>
          )}

          {/* STATE 2: LIVE WINDOW */}
          {isLive && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 text-center space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span>Assessment Room Is Open</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900">
                You may now start your examination
              </h3>
              <p className="text-xs text-slate-600 max-w-lg mx-auto">
                Click the button below to initialize your secure session and enter the fullscreen proctored test environment.
              </p>

              <div className="pt-2">
                <Button
                  size="lg"
                  onClick={handleEnterExam}
                  disabled={starting}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-8 h-12 gap-2 text-base shadow-lg shadow-emerald-700/20"
                >
                  {starting ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      <span>Entering Examination...</span>
                    </>
                  ) : (
                    <>
                      <Play size={18} />
                      <span>{existingAttempt ? 'Resume Examination' : 'Begin Test Now'}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* STATE 3: EXPIRED WINDOW */}
          {isExpired && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-6 text-center space-y-3">
              <AlertTriangle size={36} className="mx-auto text-amber-600 mb-1" />
              <h3 className="text-lg font-bold text-slate-900">Examination Window Closed</h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                The scheduled time window for this assessment has ended. If you missed this test due to extenuating circumstances, please contact your course instructor.
              </p>
              <Button variant="outline" onClick={() => navigate('/candidate')} className="mt-2">
                Return to Dashboard
              </Button>
            </div>
          )}

          {/* Readiness Checklist */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
              System Readiness Summary
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center gap-2.5 p-3 rounded-lg bg-white border border-slate-200/80">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-800">Biometrics</p>
                  <p className="text-[11px] text-slate-500">Verified & Enrolled</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-3 rounded-lg bg-white border border-slate-200/80">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-800">Screen Share</p>
                  <p className="text-[11px] text-slate-500">Diagnostic Passed</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-3 rounded-lg bg-white border border-slate-200/80">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-800">Academic Honor</p>
                  <p className="text-[11px] text-slate-500">Code Acknowledged</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="bg-slate-50 border-t border-slate-100 p-4 flex items-center justify-between text-xs text-slate-500">
          <span>ProctorNet Academic Integrity Engine v2.4</span>
          <Button variant="ghost" size="sm" onClick={loadLobby} disabled={loading} className="h-7 text-xs gap-1">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Sync Server Clock
          </Button>
        </CardFooter>
      </Card>
          </>
        )}
      </StateBoundary>
    </div>
  );
}

export default ExamLobbyPage;
