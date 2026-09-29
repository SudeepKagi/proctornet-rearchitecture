/**
 * @file PreExamReadinessPage.jsx
 * @description 3-Step Exam Entry Gate Stepper:
 * Step 1: Mandatory full-screen share capture (displaySurface: 'monitor') -> recordScreenShareClearance
 * Step 2: Live webcam snapshot & server-authoritative facial biometric verification -> verifyIdentitySnapshot
 * Step 3: Academic Integrity Honor Code agreement and authoritative attempt launch.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Calendar,
  Monitor,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Lock,
  Camera,
  ArrowRight,
  RefreshCw,
  Play,
  FileCheck,
  ShieldAlert,
} from 'lucide-react';
import * as sessionsApi from '../../api/sessionsApi.js';
import * as biometricsApi from '../../api/biometricsApi.js';
import { useScreenStream } from '../../context/ScreenStreamContext.jsx';
import { setAntiTamperToken } from '../../api/client.js';
import FaceOvalGuide from '../../components/biometrics/FaceOvalGuide.jsx';
import LightingIndicator from '../../components/biometrics/LightingIndicator.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';
import { Checkbox } from '../../components/ui/checkbox.jsx';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';

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
  const {
    screenStream,
    isScreenSharing,
    startScreenCapture,
    screenError: contextScreenError,
  } = useScreenStream();

  // Core Page State
  const [session, setSession] = useState(null);
  const [existingAttempt, setExistingAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [pageError, setPageError] = useState('');

  // Stepper State: 1 = Screen Share, 2 = Biometric Face Verification, 3 = Honor Code & Start
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Screen Share
  const [screenCleared, setScreenCleared] = useState(false);
  const [screenShareLoading, setScreenShareLoading] = useState(false);
  const [screenShareError, setScreenShareError] = useState('');
  const screenPreviewVideoRef = useRef(null);

  // Step 2: Biometric Verification
  const [webcamStream, setWebcamStream] = useState(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricVerified, setBiometricVerified] = useState(false);
  const [biometricError, setBiometricError] = useState('');
  const [similarityScore, setSimilarityScore] = useState(null);
  const webcamVideoRef = useRef(null);
  const canvasRef = useRef(null);

  // Step 3: Honor Code Agreement
  const [isAgreed, setIsAgreed] = useState(false);

  // 1. Load Session Data & Check Existing Clearances
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setPageError('');
      const [sessionData, myAttempt, clearanceData] = await Promise.all([
        sessionsApi.getSession(sessionId),
        sessionsApi.getMyAttempt(sessionId).catch(() => null),
        sessionsApi.getClearanceStatus(sessionId).catch(() => null),
      ]);

      setSession(sessionData);
      setExistingAttempt(myAttempt);

      // If clearance already has parts satisfied, update stepper state
      if (clearanceData?.screenShareAt) {
        setScreenCleared(true);
      }
      if (clearanceData?.faceVerifiedAt && clearanceData?.livenessPassed) {
        setBiometricVerified(true);
      }

      // If resuming active attempt, biometric check is already established
      if (myAttempt?.id && myAttempt.status === 'ACTIVE') {
        setBiometricVerified(true);
      }
    } catch (err) {
      setPageError(err?.message || 'Failed to load examination details.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Attach active screen stream to video preview element
  useEffect(() => {
    if (screenPreviewVideoRef.current && screenStream) {
      screenPreviewVideoRef.current.srcObject = screenStream;
      screenPreviewVideoRef.current.play().catch(() => {});
    }
  }, [screenStream, currentStep]);

  // Manage Webcam Lifecycle for Step 2
  useEffect(() => {
    let localStream = null;

    async function initWebcam() {
      if (currentStep === 2 && !biometricVerified) {
        setCameraLoading(true);
        setBiometricError('');
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
            audio: false,
          });
          setWebcamStream(localStream);
          if (webcamVideoRef.current) {
            webcamVideoRef.current.srcObject = localStream;
            webcamVideoRef.current.play().catch(() => {});
          }
        } catch (err) {
          setBiometricError('Camera access denied or unavailable. Please enable webcam permissions.');
        } finally {
          setCameraLoading(false);
        }
      }
    }

    initWebcam();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
      if (webcamStream) {
        webcamStream.getTracks().forEach((t) => t.stop());
        setWebcamStream(null);
      }
    };
  }, [currentStep, biometricVerified]);

  useEffect(() => {
    if (webcamVideoRef.current && webcamStream) {
      webcamVideoRef.current.srcObject = webcamStream;
      webcamVideoRef.current.play().catch(() => {});
    }
  }, [webcamStream]);

  // Step 1: Trigger Screen Sharing
  async function handleStartScreenShare() {
    setScreenShareLoading(true);
    setScreenShareError('');

    try {
      const stream = await startScreenCapture();
      if (!stream) {
        throw new Error('Screen capture was cancelled or failed.');
      }

      // Authoritatively record screen share timestamp in database clearance gate
      await sessionsApi.recordScreenShareClearance(sessionId);
      setScreenCleared(true);
    } catch (err) {
      setScreenShareError(err?.message || contextScreenError || 'Failed to initialize screen sharing.');
      setScreenCleared(false);
    } finally {
      setScreenShareLoading(false);
    }
  }

  // Step 2: Capture Snapshot & Perform Biometric Verification
  async function handleVerifyBiometrics() {
    if (!webcamVideoRef.current) return;
    setBiometricLoading(true);
    setBiometricError('');

    try {
      const video = webcamVideoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = video?.videoWidth || 640;
      canvas.height = video?.videoHeight || 480;
      const ctx = canvas.getContext ? canvas.getContext('2d') : null;
      if (ctx && video) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      const snapshotBase64 = canvas.toDataURL ? canvas.toDataURL('image/jpeg', 0.9) : 'data:image/jpeg;base64,mock';

      // Verify against enrolled reference profile photo
      const verificationRes = await biometricsApi.verifyIdentitySnapshot({
        sessionId,
        image: snapshotBase64,
      });

      if (verificationRes.verified || verificationRes.finalStatus === 'VERIFIED') {
        setBiometricVerified(true);
        setSimilarityScore(verificationRes.similarityScore);
        // Stop webcam once verified to release camera for live proctoring
        if (webcamStream) {
          webcamStream.getTracks().forEach((t) => t.stop());
          setWebcamStream(null);
        }
      } else {
        throw new Error(verificationRes.message || 'Facial identity verification failed. Please try again.');
      }
    } catch (err) {
      setBiometricError(err?.message || 'Biometric verification failed. Please ensure proper lighting and look directly at the camera.');
    } finally {
      setBiometricLoading(false);
    }
  }

  // Step 3: Start or Resume Exam
  async function handleStartOrResumeExam() {
    if (starting) return;
    if (!isAgreed) {
      setPageError('Please agree to the Academic Integrity Honor Code to begin.');
      return;
    }

    setStarting(true);
    setPageError('');

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

      setPageError(err?.message || 'Could not start examination attempt. Please check your clearances.');
      setStarting(false);
    }
  }

  const isResuming = existingAttempt?.status === 'ACTIVE';

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-16">
      <StateBoundary
        isLoading={loading}
        error={pageError}
        isEmpty={!session}
        emptyTitle="Examination Session Not Found"
        emptyDescription="The requested examination session could not be found or you are not enrolled."
        onRetry={loadData}
      >
        {session && (
          <>
            {/* Header Navigation */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/candidate')}
                className="text-xs h-8 gap-1.5"
              >
                <ArrowLeft size={13} />
                <span>Return to Portal</span>
              </Button>
              <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5">
                {isResuming ? 'Exam Recovery & Resumption' : 'Pre-Exam Readiness Gate'}
              </Badge>
            </div>

            {/* Title & Info */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
                Security Verification Gate
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {session.exam_title || 'Assigned Examination'}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-2">
                <span className="flex items-center gap-1.5">
                  <Calendar size={13} />
                  {formatDateTime(session.scheduled_start_time)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={13} />
                  {session.exam_duration_minutes || 60} Minutes
                </span>
                {session.target_department && (
                  <span className="flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400">
                    Dept: {session.target_department}
                  </span>
                )}
              </div>
            </div>

            {/* Stepper Progress Bar */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4 py-2">
              {[
                { step: 1, title: 'Screen Share', done: screenCleared },
                { step: 2, title: 'Biometrics', done: biometricVerified },
                { step: 3, title: isResuming ? 'Resume' : 'Start Exam', done: false },
              ].map(({ step, title, done }) => (
                <div
                  key={step}
                  onClick={() => {
                    if (step === 1 || (step === 2 && screenCleared) || (step === 3 && screenCleared && biometricVerified)) {
                      setCurrentStep(step);
                    }
                  }}
                  className={`flex items-center gap-2.5 p-3 rounded-lg border text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                    currentStep === step
                      ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 shadow-xs'
                      : done
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-white border-slate-200 text-slate-400 dark:bg-slate-900 dark:border-slate-800'
                  }`}
                >
                  <span
                    className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${
                      done
                        ? 'bg-emerald-600 text-white'
                        : currentStep === step
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {done ? '✓' : step}
                  </span>
                  <span className="truncate">{title}</span>
                </div>
              ))}
            </div>

            {/* STEP 1: Screen Share */}
            {currentStep === 1 && (
              <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Monitor className="text-blue-600" size={20} />
                    Step 1: Screen Sharing Permission
                  </CardTitle>
                  <CardDescription>
                    To maintain academic integrity, you must grant permission to share your entire screen.
                    Window or application tab sharing is not permitted.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {screenShareError && (
                    <Alert variant="destructive">
                      <AlertCircle size={15} />
                      <AlertTitle>Screen Share Required</AlertTitle>
                      <AlertDescription>{screenShareError}</AlertDescription>
                    </Alert>
                  )}

                  {screenCleared ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold">
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                        <span>Screen sharing active and authoritatively verified for this session.</span>
                      </div>
                      <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 aspect-video max-h-64 flex items-center justify-center">
                        <video
                          ref={screenPreviewVideoRef}
                          autoPlay
                          muted
                          playsInline
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-4 bg-slate-50/50 dark:bg-slate-900/50">
                      <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
                        <Monitor size={24} />
                      </div>
                      <div className="max-w-md mx-auto space-y-1">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                          Select Entire Screen when prompted
                        </p>
                        <p className="text-xs text-slate-500">
                          Your browser will ask which screen to share. Select "Entire Screen" to fulfill proctoring clearance.
                        </p>
                      </div>
                      <Button
                        onClick={handleStartScreenShare}
                        disabled={screenShareLoading}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2"
                      >
                        {screenShareLoading ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            Authorizing...
                          </>
                        ) : (
                          <>
                            <Monitor size={15} />
                            Share Entire Screen
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-4">
                  <Button
                    onClick={() => setCurrentStep(2)}
                    disabled={!screenCleared}
                    className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <span>Proceed to Biometric Check</span>
                    <ArrowRight size={14} />
                  </Button>
                </CardFooter>
              </Card>
            )}

            {/* STEP 2: Biometric Face Verification */}
            {currentStep === 2 && (
              <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldCheck className="text-blue-600" size={20} />
                    Step 2: Biometric Facial Identity Verification
                  </CardTitle>
                  <CardDescription>
                    Verify your live identity against your enrolled reference profile photo. Ensure adequate lighting and look straight ahead.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {biometricError && (
                    <Alert variant="destructive">
                      <AlertCircle size={15} />
                      <AlertTitle>Verification Failed</AlertTitle>
                      <AlertDescription>{biometricError}</AlertDescription>
                    </Alert>
                  )}

                  {biometricVerified ? (
                    <div className="p-6 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center space-y-2">
                      <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-xs">
                        <CheckCircle2 size={24} />
                      </div>
                      <h4 className="font-bold text-emerald-900 dark:text-emerald-100 text-base">
                        Biometric Clearance Granted
                      </h4>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 max-w-sm mx-auto">
                        Your live webcam snapshot matched your enrolled biometric profile photo
                        {similarityScore ? ` (${Math.round(similarityScore * 100)}% match)` : ''}.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="relative aspect-video max-w-lg mx-auto rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner flex items-center justify-center">
                        <video
                          ref={webcamVideoRef}
                          autoPlay
                          muted
                          playsInline
                          className="w-full h-full object-cover transform -scale-x-100"
                        />
                        <FaceOvalGuide
                          status={biometricLoading ? 'action' : 'aligning'}
                          message={biometricLoading ? 'Analyzing facial match...' : 'Position face inside the oval'}
                        />
                        <div className="absolute bottom-3 left-3 z-10">
                          <LightingIndicator videoRef={webcamVideoRef} />
                        </div>
                        {cameraLoading && (
                          <div className="absolute inset-0 z-20 bg-slate-950/80 flex items-center justify-center text-slate-400 text-xs gap-2">
                            <RefreshCw size={14} className="animate-spin" />
                            Connecting to camera...
                          </div>
                        )}
                      </div>

                      <div className="flex justify-center">
                        <Button
                          onClick={handleVerifyBiometrics}
                          disabled={biometricLoading || cameraLoading || !webcamStream}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2 px-6"
                        >
                          {biometricLoading ? (
                            <>
                              <RefreshCw size={15} className="animate-spin" />
                              Verifying Facial Match...
                            </>
                          ) : (
                            <>
                              <Camera size={15} />
                              Verify Live Face
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                  <Button variant="outline" size="sm" onClick={() => setCurrentStep(1)}>
                    Back to Screen Share
                  </Button>
                  <Button
                    onClick={() => setCurrentStep(3)}
                    disabled={!biometricVerified}
                    className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <span>Proceed to Final Step</span>
                    <ArrowRight size={14} />
                  </Button>
                </CardFooter>
              </Card>
            )}

            {/* STEP 3: Honor Code Agreement & Entry */}
            {currentStep === 3 && (
              <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileCheck className="text-blue-600" size={20} />
                    Step 3: Honor Code & Final Examination Entry
                  </CardTitle>
                  <CardDescription>
                    All required clearances are verified. Review and accept the Academic Integrity code to start your attempt.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {pageError && (
                    <Alert variant="destructive">
                      <AlertCircle size={15} />
                      <AlertTitle>Entry Gate Error</AlertTitle>
                      <AlertDescription>{pageError}</AlertDescription>
                    </Alert>
                  )}

                  {/* Summary of Clearance Badges */}
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 size={16} />
                      <span>Screen Sharing Authorized</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 size={16} />
                      <span>Biometric Face Cleared</span>
                    </div>
                  </div>

                  {/* Honor Code Checkbox */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-950">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Lock size={15} className="text-blue-600" />
                      Academic Integrity Honor Code
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      I solemnly affirm that I will complete this examination independently without unauthorized aids,
                      external communication, or supplementary devices. I acknowledge that proctoring AI, screen sharing,
                      and audio-visual signals are continuously monitored and logged.
                    </p>
                    <div className="flex items-center gap-2 pt-2">
                      <Checkbox
                        id="honor-code"
                        checked={isAgreed}
                        onCheckedChange={(checked) => setIsAgreed(Boolean(checked))}
                      />
                      <label
                        htmlFor="honor-code"
                        className="text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer select-none"
                      >
                        I understand and agree to the Academic Integrity Honor Code.
                      </label>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                  <Button variant="outline" size="sm" onClick={() => setCurrentStep(2)}>
                    Back to Biometrics
                  </Button>
                  <Button
                    onClick={handleStartOrResumeExam}
                    disabled={!isAgreed || starting || !screenCleared || !biometricVerified}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 px-6 h-10"
                  >
                    {starting ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        Initializing Attempt...
                      </>
                    ) : (
                      <>
                        <Play size={15} />
                        {isResuming ? 'Resume Examination' : 'Start Examination'}
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            )}
          </>
        )}
      </StateBoundary>
    </div>
  );
}
