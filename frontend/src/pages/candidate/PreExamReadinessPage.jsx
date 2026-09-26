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
  Camera,
  Mic,
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
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');

  // Biometric gate state
  const [biometricVerified, setBiometricVerified] = useState(false);
  const [biometricLocked, setBiometricLocked] = useState(false);

  // Hardware readiness preview state
  const [previewStream, setPreviewStream] = useState(null);
  const [mediaCheckStatus, setMediaCheckStatus] = useState('IDLE'); // 'IDLE' | 'CHECKING' | 'READY' | 'FAILED'
  const [mediaError, setMediaError] = useState('');
  const previewVideoRef = useRef(null);

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

  const cleanupPreview = useCallback(() => {
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    stopMediaStream(previewStream);
    setPreviewStream(null);
  }, [previewStream]);

  const attachPreviewVideoRef = useCallback((node) => {
    previewVideoRef.current = node;
    if (node && previewStream) {
      if (node.srcObject !== previewStream) {
        node.srcObject = previewStream;
      }
      node.play().catch(() => {});
    }
  }, [previewStream]);

  useEffect(() => {
    if (previewStream && previewVideoRef.current) {
      if (previewVideoRef.current.srcObject !== previewStream) {
        previewVideoRef.current.srcObject = previewStream;
      }
      previewVideoRef.current.play().catch(() => {});
    }
  }, [previewStream]);

  // Clean up preview stream on unmount or beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupPreview();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanupPreview();
    };
  }, [cleanupPreview]);

  async function testCameraAndMic() {
    cleanupPreview();
    setMediaCheckStatus('CHECKING');
    setMediaError('');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera and microphone access not supported in this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 20 } },
        audio: true,
      });

      setPreviewStream(stream);
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        previewVideoRef.current.play().catch(() => {});
      }
      setMediaCheckStatus('READY');
    } catch (err) {
      setMediaCheckStatus('FAILED');
      setMediaError(
        err.name === 'NotAllowedError'
          ? 'Camera or microphone access denied. Please grant permissions in your browser.'
          : err.message
      );
      cleanupPreview();
    }
  }

  async function handleStartOrResume() {
    setError('');
    cleanupPreview();

    // If attempt already active, resume directly
    if (existingAttempt?.id && existingAttempt.status === 'ACTIVE') {
      navigate(`/candidate/attempts/${existingAttempt.id}`);
      return;
    }

    // If attempt already submitted, view results
    if (existingAttempt?.id && existingAttempt.status === 'SUBMITTED') {
      navigate(`/candidate/attempts/${existingAttempt.id}/result`);
      return;
    }

    setStarting(true);
    try {
      const attempt = await sessionsApi.startAttemptForSession(sessionId);
      if (attempt?.anti_tamper_token) {
        setAntiTamperToken(attempt.anti_tamper_token);
      }
      navigate(`/candidate/attempts/${attempt.id}`);
    } catch (err) {
      setError(err?.message || 'Could not start examination attempt');
    } finally {
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

  const isSessionLive = session.status === 'ACTIVE';
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
            cleanupPreview();
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

      {/* Step 2: System Diagnostic & Peripheral Test */}
      <Card className="border-slate-200 bg-white shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Camera size={16} className="text-slate-600" />
                2. Hardware & Peripheral Diagnostic
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Test your webcam and microphone before entering the proctored test environment.
              </CardDescription>
            </div>
            {mediaCheckStatus === 'READY' && (
              <Badge variant="success" size="sm">
                Peripherals Operational
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-800">
                <Mic size={14} className="text-slate-500" />
                <span>Webcam & Microphone Check</span>
              </div>
              <p className="text-xs text-slate-500">
                Continuous video feeds and audio telemetry are streamed during proctored sessions.
              </p>
            </div>

            <Button
              variant={mediaCheckStatus === 'READY' ? 'outline' : 'default'}
              size="sm"
              onClick={testCameraAndMic}
              disabled={mediaCheckStatus === 'CHECKING'}
              className="text-xs h-8 shrink-0"
            >
              {mediaCheckStatus === 'CHECKING' && <RefreshCw size={13} className="animate-spin" />}
              {mediaCheckStatus === 'READY' ? 'Retest Hardware' : 'Test Camera & Mic'}
            </Button>
          </div>

          {mediaError && (
            <Alert variant="destructive">
              <AlertCircle size={15} />
              <AlertDescription>{mediaError}</AlertDescription>
            </Alert>
          )}

          {previewStream && (
            <div className="flex flex-col items-center pt-2">
              <div className="relative w-full max-w-sm aspect-[4/3] bg-slate-900 rounded-md overflow-hidden border border-slate-300 shadow-inner">
                <video
                  ref={attachPreviewVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                  onLoadedMetadata={(e) => {
                    e.currentTarget.play().catch(() => {});
                  }}
                />
                <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-xs text-white text-[11px] px-2 py-0.5 rounded-sm flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Video Feed Active
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Biometric Identity Verification Gate */}
      {!isResuming && !isSubmitted && (
        <Card className="border-slate-200 bg-white shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck size={16} className="text-slate-600" />
              3. Biometric Identity Verification
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Automated facial identity match against your enrolled institutional reference profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            {!enrollment?.isEnrolled ? (
              <div className="p-6 text-center space-y-3 bg-amber-50/50 rounded-lg border border-amber-200">
                <ShieldAlert size={28} className="mx-auto text-amber-700" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-900">Reference Photo Enrollment Required</h4>
                  <p className="text-xs text-amber-800/80 max-w-md mx-auto mt-1">
                    You must enroll a reference face photo prior to entering this proctored examination.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    cleanupPreview();
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
                  <h4 className="text-xs font-semibold text-emerald-900">Biometric Identity Verified</h4>
                  <p className="text-xs text-emerald-800/80 mt-0.5">
                    Your facial liveness challenge has been verified authoritatively for this session.
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
            4. Academic Integrity & Proctored Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-3 text-xs text-slate-600 leading-relaxed">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 rounded-md border border-slate-200/60">
              <strong className="text-slate-900 block font-medium">Authoritative Countdown</strong>
              Remaining time is calculated authoritatively by the server. Local device clock adjustments will not extend test duration.
            </div>
            <div className="p-3 bg-slate-50 rounded-md border border-slate-200/60">
              <strong className="text-slate-900 block font-medium">Automatic Synchronization</strong>
              Your answers are debounced and autosaved securely with optimistic concurrency revision tracking.
            </div>
            <div className="p-3 bg-slate-50 rounded-md border border-slate-200/60">
              <strong className="text-slate-900 block font-medium">Proctoring Telemetry</strong>
              Fullscreen exits, tab changes, and audio anomalies are recorded and flagged for faculty review.
            </div>
            <div className="p-3 bg-slate-50 rounded-md border border-slate-200/60">
              <strong className="text-slate-900 block font-medium">Irreversible Submission</strong>
              Once submitted or when time expires, final answers cannot be modified or reopened.
            </div>
          </div>

          <Separator className="my-3" />

          <div className="flex items-start gap-2.5 pt-1 select-none">
            <Checkbox
              id="agree-honor-code"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(Boolean(checked))}
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
            onClick={() => {
              cleanupPreview();
              navigate('/candidate');
            }}
          >
            Cancel
          </Button>

          <Button
            size="default"
            disabled={
              !agreed ||
              (!isSessionLive && !existingAttempt) ||
              (!isResuming && !isSubmitted && !biometricVerified) ||
              biometricLocked ||
              starting
            }
            onClick={handleStartOrResume}
            className="gap-2 bg-slate-900 hover:bg-slate-800 text-white min-w-[180px]"
          >
            {starting ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : isResuming ? (
              <Play size={15} />
            ) : isSubmitted ? (
              <FileCheck size={15} />
            ) : (
              <Play size={15} />
            )}

            {isResuming
              ? 'Resume Active Attempt'
              : isSubmitted
              ? 'View Scorecard'
              : biometricLocked
              ? 'Biometrics Locked'
              : !biometricVerified
              ? 'Biometric Verification Required'
              : isSessionLive
              ? 'Begin Examination'
              : 'Session Not Live'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default PreExamReadinessPage;
