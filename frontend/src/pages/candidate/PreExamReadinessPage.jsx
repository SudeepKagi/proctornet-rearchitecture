/**
 * @file PreExamReadinessPage.jsx
 * @description Pre-exam check-in screen with instructions, biometric identity verification gate, and attempt launch.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  MapPin,
  Calendar,
  Monitor,
  ScreenShare,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Lock,
  RefreshCw,
  Play,
  FileCheck,
} from 'lucide-react';
import * as sessionsApi from '../../api/sessionsApi.js';
import { getEnrollmentStatus } from '../../api/biometricsApi.js';
import { stopMediaStream } from '../../hooks/useMediaCapture.js';
import { setAntiTamperToken } from '../../api/client.js';
import BiometricGate from '../../components/biometrics/BiometricGate.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';
import { Separator } from '../../components/ui/separator.jsx';
import { Checkbox } from '../../components/ui/checkbox.jsx';

function formatDateTime(val) {
  if (!val) return 'TBA';
  return new Date(val).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PreExamReadinessPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [existingAttempt, setExistingAttempt] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);
  const [error, setError] = useState('');

  // Biometric gate state
  const [biometricVerified, setBiometricVerified] = useState(false);
  const [biometricLocked, setBiometricLocked] = useState(false);

  // Screen sharing diagnostic preview state (Screen Share Only)
  const [screenStream, setScreenStream] = useState(null);
  const [screenCheckStatus, setScreenCheckStatus] = useState('IDLE'); // 'IDLE' | 'CHECKING' | 'READY' | 'FAILED'
  const [screenError, setScreenError] = useState('');
  const screenVideoRef = useRef(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [sessionData, myAttempt, bioStatus] = await Promise.all([
          sessionsApi.getSession(sessionId),
          sessionsApi.getMyAttempt(sessionId).catch(() => null),
          getEnrollmentStatus().catch(() => null),
        ]);
        setSession(sessionData);
        setExistingAttempt(myAttempt);
        setEnrollment(bioStatus);

        // If resuming active attempt, biometric check is already validated
        if (myAttempt?.id && myAttempt.status === 'ACTIVE') {
          setBiometricVerified(true);
        }
      } catch (err) {
        setError(err?.message || 'Failed to load examination readiness information.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [sessionId]);

  const cleanupScreenPreview = useCallback(() => {
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
    if (screenStream) {
      try {
        screenStream.getTracks().forEach((track) => track.stop());
      } catch {}
    }
    setScreenStream(null);
  }, [screenStream]);

  const attachScreenVideoRef = useCallback((node) => {
    screenVideoRef.current = node;
    if (node && screenStream) {
      if (node.srcObject !== screenStream) {
        node.srcObject = screenStream;
      }
      node.play().catch(() => {});
    }
  }, [screenStream]);

  useEffect(() => {
    if (screenStream && screenVideoRef.current) {
      if (screenVideoRef.current.srcObject !== screenStream) {
        screenVideoRef.current.srcObject = screenStream;
      }
      screenVideoRef.current.play().catch(() => {});
    }
  }, [screenStream]);

  // Clean up screen stream on unmount or beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupScreenPreview();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanupScreenPreview();
    };
  }, [cleanupScreenPreview]);

  async function testScreenShare() {
    cleanupScreenPreview();
    setScreenCheckStatus('CHECKING');
    setScreenError('');

    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Screen sharing is not supported in this browser. Please use Chrome, Edge, or Firefox on desktop.');
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          cursor: 'always'
        },
        audio: false
      });

      setScreenStream(stream);

      // Listen for candidate stopping screen share from browser banner
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          setScreenCheckStatus('IDLE');
          setScreenStream(null);
        };
      }

      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
        screenVideoRef.current.play().catch(() => {});
      }
      setScreenCheckStatus('READY');
    } catch (err) {
      setScreenCheckStatus('FAILED');
      setScreenError(
        err.name === 'NotAllowedError'
          ? 'Screen sharing permission was denied. You must grant screen access to proceed.'
          : err.message
      );
      cleanupScreenPreview();
    }
  }

  async function handleStartOrResume() {
    if (starting) return;
    if (!isAgreed) {
      setError('Please acknowledge the Academic Integrity Honor Code checkbox to proceed.');
      return;
    }

    setError('');
    cleanupScreenPreview();

    const scheduledStart = session?.scheduled_start_time ? new Date(session.scheduled_start_time) : null;
    const isUpcoming = scheduledStart && new Date() < scheduledStart;

    // If upcoming scheduled exam window, route to waiting lobby
    if (isUpcoming && !existingAttempt) {
      navigate(`/candidate/lobby/${sessionId}`);
      return;
    }

    // If attempt already active, resume directly
    const existingId = existingAttempt?.attempt_id || existingAttempt?.id;
    if (existingId && existingAttempt.status === 'ACTIVE') {
      navigate(`/candidate/attempts/${existingId}`);
      return;
    }

    // If attempt already submitted, view results
    if (existingId && existingAttempt.status === 'SUBMITTED') {
      navigate(`/candidate/attempts/${existingId}/result`);
      return;
    }

    setStarting(true);
    try {
      const attempt = await sessionsApi.startAttemptForSession(sessionId);
      const attemptId = attempt?.attemptId || attempt?.attempt_id || attempt?.id;
      if (attempt?.anti_tamper_token) {
        setAntiTamperToken(attempt.anti_tamper_token);
      }

      if (attempt?.redirectUrl) {
        navigate(attempt.redirectUrl);
      } else if (attemptId) {
        navigate(`/candidate/attempts/${attemptId}`);
      } else {
        navigate(`/candidate/attempts/${sessionId}`);
      }
    } catch (err) {
      // 409 Conflict recovery: extract attemptId and navigate rather than stall!
      const fallbackAttemptId =
        err?.existingAttemptId ||
        err?.data?.attemptId ||
        err?.data?.attempt_id ||
        err?.data?.data?.attemptId ||
        err?.data?.data?.attempt_id;

      if (fallbackAttemptId) {
        navigate(`/candidate/attempts/${fallbackAttemptId}`);
        return;
      }

      if (
        err?.message?.toLowerCase()?.includes('window has not opened') ||
        err?.message?.toLowerCase()?.includes('not opened yet')
      ) {
        navigate(`/candidate/lobby/${sessionId}`);
        return;
      }

      setError(err?.message || 'Could not start examination attempt');
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full max-w-3xl mx-auto py-16 text-center space-y-3">
        <RefreshCw size={28} className="animate-spin mx-auto text-slate-400" />
        <p className="text-sm font-medium text-slate-600">Verifying assessment readiness and session security...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="w-full max-w-lg mx-auto py-12">
        <Card className="text-center p-8 border-slate-200">
          <AlertCircle size={36} className="mx-auto text-slate-400 stroke-1" />
          <h2 className="text-lg font-semibold text-slate-900 mt-3">Examination Session Not Found</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            The requested examination session could not be found or you are not enrolled in this roster.
          </p>
          <Button onClick={() => navigate('/candidate')}>Return to Dashboard</Button>
        </Card>
      </div>
    );
  }

  const scheduledStart = session.scheduled_start_time ? new Date(session.scheduled_start_time) : null;
  const isUpcoming = scheduledStart && new Date() < scheduledStart;
  const isSessionLive = session.status === 'ACTIVE' || (scheduledStart && new Date() >= scheduledStart);
  const isResuming = existingAttempt?.status === 'ACTIVE';
  const isSubmitted = existingAttempt?.status === 'SUBMITTED';

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-12">
      {/* Back Button */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            cleanupScreenPreview();
            navigate('/candidate');
          }}
          className="text-xs h-8 gap-1.5 text-slate-700"
        >
          <ArrowLeft size={13} />
          <span>Back to Dashboard</span>
        </Button>
      </div>

      {/* Header */}
      <div className="border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pre-Assessment</span>
          <span className="text-slate-300">•</span>
          <span className="text-xs font-medium text-slate-500">Readiness & Verification Gate</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {session.exam_title || 'Assigned Examination'}
          </h1>
          <Badge
            variant={isSessionLive ? 'success' : session.status === 'COMPLETED' ? 'outline' : 'secondary'}
            size="default"
            className="self-start sm:self-auto"
          >
            {isSessionLive ? 'Session Live' : session.status || 'SCHEDULED'}
          </Badge>
        </div>
        <p className="text-sm text-slate-600 mt-1">
          Verify your hardware peripherals, confirm biometric identity, and review exam guidelines before launching.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle size={16} />
          <AlertTitle>Assessment Gate Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step 1: Session & Schedule Parameters */}
      <Card className="border-slate-200 bg-white shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calendar size={16} className="text-slate-600" />
            1. Examination Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="space-y-0.5">
              <span className="text-slate-500">Duration</span>
              <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Clock size={14} className="text-slate-600" />
                {session.exam_duration_minutes || 60} Minutes
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-slate-500">Location / Room</span>
              <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <MapPin size={14} className="text-slate-600" />
                {session.room_name || 'Online Assessment'}
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-slate-500">Window Start</span>
              <p className="text-xs font-semibold text-slate-900">
                {formatDateTime(session.scheduled_start_time)}
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-slate-500">Window Close</span>
              <p className="text-xs font-semibold text-slate-900">
                {formatDateTime(session.scheduled_end_time)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Screen Sharing Diagnostic (Screen Share Only) */}
      <Card className="border-slate-200 bg-white shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Monitor size={16} className="text-slate-600" />
                2. Screen Sharing Diagnostic
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Verify your screen sharing permissions before entering the proctored test environment.
              </CardDescription>
            </div>
            {screenCheckStatus === 'READY' && (
              <Badge variant="success" size="sm">
                Screen Share Operational
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-800">
                <ScreenShare size={14} className="text-slate-500" />
                <span>Entire Screen Sharing Permission</span>
              </div>
              <p className="text-xs text-slate-500">
                Full-screen display capture is continuously monitored to detect unauthorized tab switching and secondary monitors.
              </p>
            </div>

            <Button
              variant={screenCheckStatus === 'READY' ? 'outline' : 'default'}
              size="sm"
              onClick={testScreenShare}
              disabled={screenCheckStatus === 'CHECKING'}
              className="text-xs h-8 shrink-0 cursor-pointer"
            >
              {screenCheckStatus === 'CHECKING' && <RefreshCw size={13} className="animate-spin" />}
              {screenCheckStatus === 'READY' ? 'Retest Screen Share' : 'Test Screen Share'}
            </Button>
          </div>

          {screenCheckStatus === 'CHECKING' && (
            <div className="flex items-center gap-3 p-4 bg-blue-50/60 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900/50">
              <RefreshCw size={18} className="animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-blue-950 dark:text-blue-200">Requesting screen share permission...</p>
                <p className="text-blue-800/80 dark:text-blue-300/80 mt-0.5">
                  Please select <strong>&quot;Entire Screen&quot;</strong> in your browser&apos;s permission prompt to ensure full proctoring compliance.
                </p>
              </div>
            </div>
          )}

          {screenError && (
            <Alert variant="destructive">
              <AlertCircle size={15} />
              <AlertDescription>{screenError}</AlertDescription>
            </Alert>
          )}

          {screenStream && (
            <div className="flex flex-col items-center pt-2 space-y-3">
              <div className="relative w-full max-w-lg aspect-video bg-slate-900 rounded-md overflow-hidden border border-slate-300 shadow-inner">
                <video
                  ref={attachScreenVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                  onLoadedMetadata={(e) => {
                    e.currentTarget.play().catch(() => {});
                  }}
                />
                <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-xs text-white text-[11px] px-2 py-0.5 rounded-sm flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Screen Capture Active
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={cleanupScreenPreview}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 h-7 cursor-pointer"
              >
                Stop Preview & Release Screen
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Face Check */}
      {!isResuming && !isSubmitted && (
        <Card className="border-slate-200 bg-white shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck size={16} className="text-slate-600" />
              3. Face Check
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Quick photo verification against your reference profile before entering.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            {!enrollment?.isEnrolled ? (
              <div className="p-6 text-center space-y-3 bg-amber-50/50 rounded-lg border border-amber-200">
                <ShieldAlert size={28} className="mx-auto text-amber-700" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-900">Reference Photo Enrollment Required</h4>
                  <p className="text-xs text-amber-800/80 max-w-md mx-auto mt-1">
                    You must enroll a reference face photo prior to entering this examination.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    cleanupScreenPreview();
                    navigate('/candidate/biometrics/enroll');
                  }}
                  className="bg-amber-800 hover:bg-amber-900 text-white"
                >
                  Enroll Reference Face Now
                </Button>
              </div>
            ) : biometricVerified ? (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-900">
                <CheckCircle2 size={20} className="text-emerald-700 shrink-0" />
                <div>
                  <h4 className="text-xs font-semibold text-emerald-900">Face Check Verified</h4>
                  <p className="text-xs text-emerald-800/80 mt-0.5">
                    Your identity has been verified for this exam session.
                  </p>
                </div>
              </div>
            ) : (
              <BiometricGate
                sessionId={sessionId}
                onVerified={() => {
                  setBiometricVerified(true);
                  setBiometricLocked(false);
                }}
                onLocked={() => {
                  setBiometricLocked(true);
                  setBiometricVerified(false);
                }}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Academic Integrity Acknowledgment */}
      <Card className="border-slate-200 bg-white shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Lock size={16} className="text-slate-600" />
            4. Academic Integrity & Exam Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-3 text-xs text-slate-600 leading-relaxed">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 rounded-md border border-slate-200/60">
              <strong className="text-slate-900 block font-medium">Exam Timer</strong>
              Remaining time counts down accurately. When the time expires, your exam submits automatically.
            </div>
            <div className="p-3 bg-slate-50 rounded-md border border-slate-200/60">
              <strong className="text-slate-900 block font-medium">Auto-saving</strong>
              Your answers are saved automatically as you work.
            </div>
            <div className="p-3 bg-slate-50 rounded-md border border-slate-200/60">
              <strong className="text-slate-900 block font-medium">Exam Rules</strong>
              Fullscreen exits, tab changes, and unexpected activity will be recorded for instructor review.
            </div>
            <div className="p-3 bg-slate-50 rounded-md border border-slate-200/60">
              <strong className="text-slate-900 block font-medium">Final Submission</strong>
              Once submitted or when time expires, final answers cannot be modified or reopened.
            </div>
          </div>

          <Separator className="my-3" />

          <div
            onClick={() => !starting && setIsAgreed((prev) => !prev)}
            className="flex items-start gap-2.5 pt-1 select-none cursor-pointer"
          >
            <Checkbox
              id="agree-honor-code"
              checked={isAgreed}
              onCheckedChange={(checked) => setIsAgreed(Boolean(checked))}
              disabled={starting}
              className="mt-0.5"
            />
            <label
              htmlFor="agree-honor-code"
              className="text-xs text-slate-800 dark:text-slate-200 font-medium cursor-pointer leading-relaxed"
            >
              I acknowledge that I am in a private space and agree to adhere strictly to the ProctorNet Assessment Honor Code and Institutional Examination Guidelines.
            </label>
          </div>
        </CardContent>

        <CardFooter className="p-5 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50">
          <Button
            variant="outline"
            size="default"
            disabled={starting}
            onClick={() => {
              cleanupScreenPreview();
              navigate('/candidate');
            }}
          >
            Cancel
          </Button>

          <Button
            size="default"
            disabled={
              !isAgreed ||
              starting ||
              (!isResuming && !isSubmitted && screenCheckStatus !== 'READY') ||
              (!isResuming && !isSubmitted && !biometricVerified) ||
              biometricLocked
            }
            onClick={handleStartOrResume}
            className="gap-2 bg-slate-900 hover:bg-slate-800 text-white min-w-[190px]"
          >
            {starting ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                <span>Launching Attempt...</span>
              </>
            ) : isResuming ? (
              <>
                <Play size={15} />
                <span>Resume Active Attempt</span>
              </>
            ) : isSubmitted ? (
              <>
                <FileCheck size={15} />
                <span>View Scorecard</span>
              </>
            ) : isUpcoming ? (
              <>
                <Clock size={15} />
                <span>Proceed to Exam Lobby</span>
              </>
            ) : (
              <>
                <Play size={15} />
                <span>Begin Examination</span>
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default PreExamReadinessPage;
