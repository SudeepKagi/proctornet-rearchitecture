import React, { useState, useEffect, useRef, useCallback } from 'react';
import FaceOvalGuide from './FaceOvalGuide.jsx';
import LightingIndicator from './LightingIndicator.jsx';
import { verifyIdentitySnapshot } from '../../api/biometricsApi.js';

/**
 * Parses raw errors from biometric verification flow into actionable user-friendly messages.
 * Prioritizes structured errorCode, falling back to message regex inspection if code is absent.
 * @param {any} err
 * @returns {{ title: string, message: string, category: string }}
 */
export function parseBiometricError(err) {
  if (!err) {
    return {
      title: 'Verification Failed',
      message: 'An unexpected identity check error occurred. Please retry.',
      category: 'generic'
    };
  }

  const rawMsg = err.data?.message || err.data?.error?.message || err.message || '';
  const errorCode = err.data?.code || err.data?.error?.code || err.code || '';
  const status = err.status || err.response?.status || err.statusCode;

  // 1. Session or Account Locked
  if (
    status === 403 ||
    errorCode === 'BIOMETRIC_VERIFICATION_LOCKED' ||
    errorCode === 'BIOMETRIC_LOCKED' ||
    /BIOMETRIC_VERIFICATION_LOCKED/i.test(rawMsg) ||
    /Maximum (verification )?attempts exceeded/i.test(rawMsg) ||
    /locked/i.test(rawMsg)
  ) {
    return {
      title: 'Identity Check Locked',
      message: 'Maximum attempts reached. Your session has been flagged for proctor review. Please contact your invigilator.',
      category: 'locked'
    };
  }

  // 2. Structured Error Code Switch (authoritative backend contract)
  if (errorCode && typeof errorCode === 'string') {
    switch (errorCode) {
      case 'REFERENCE_DATA_UNAVAILABLE':
        return {
          title: 'Reference Photo Missing',
          message: "We don't have a reference photo on file to check against. Please contact your instructor or administrator — this isn't something retaking the photo will fix.",
          category: 'reference_unavailable'
        };

      case 'SIMILARITY_BELOW_THRESHOLD':
        return {
          title: 'Photo Match Inconclusive',
          message: "We couldn't match this photo to the one on file closely enough. Try better, even lighting facing the camera directly. If this keeps failing, contact your invigilator for a manual check.",
          category: 'similarity'
        };

      case 'FACE_NOT_DETECTED':
      case 'FACE_NOT_FOUND':
        return {
          title: 'Face Not Detected',
          message: 'No clear face was detected in the photo. Please look directly into the camera inside the oval guide.',
          category: 'face_detection'
        };

      case 'MULTIPLE_FACES_DETECTED':
        return {
          title: 'Multiple Faces Detected',
          message: 'Multiple faces were detected in the photo. Please ensure you are alone in the room.',
          category: 'multiple_faces'
        };

      case 'IMAGE_QUALITY_LOW':
      case 'POOR_LIGHTING':
        return {
          title: 'Lighting Needs Adjustment',
          message: 'Lighting is too dim or uneven. Please ensure good lighting facing your camera directly.',
          category: 'lighting'
        };

      case 'IMAGE_FORMAT_INVALID':
      case 'IMAGE_DATA_INVALID':
      case 'IMAGE_SIZE_INVALID':
        return {
          title: 'Image Format Unsupported',
          message: 'The captured image format is invalid. Please retry with a standard camera stream.',
          category: 'image_format'
        };

      case 'LIVENESS_CHALLENGE_EXPIRED':
        return {
          title: 'Challenge Expired',
          message: 'The liveness check challenge expired. Please retry within the allocated time.',
          category: 'liveness'
        };

      case 'LIVENESS_FAILED':
        return {
          title: 'Liveness Check Failed',
          message: 'Liveness anti-spoofing evaluation failed or action sequence did not match. Please follow the on-screen prompts.',
          category: 'liveness'
        };

      case 'MODEL_VERSION_MISMATCH':
        return {
          title: 'Biometric Profile Outdated',
          message: 'Your enrolled reference photo uses an outdated template. Please re-enroll your reference face or contact support.',
          category: 'model_mismatch'
        };

      case 'IMAGE_NOT_FOUND':
      case 'LIVENESS_MEDIA_NOT_FOUND':
      case 'NETWORK_ERROR':
        return {
          title: 'Connection Issue',
          message: 'Failed to communicate with the verification server. Please check your network connection and retry.',
          category: 'network'
        };

      default:
        break;
    }
  }

  // 3. Fallback: free-text message regex matching (legacy/cached responses)
  if (
    /Reference (biometric )?data unavailable/i.test(rawMsg) ||
    /reference photo/i.test(rawMsg) ||
    /No enrolled biometric/i.test(rawMsg)
  ) {
    return {
      title: 'Reference Photo Missing',
      message: "We don't have a reference photo on file to check against. Please contact your instructor or administrator — this isn't something retaking the photo will fix.",
      category: 'reference_unavailable'
    };
  }

  if (
    /Facial match failed/i.test(rawMsg) ||
    /similarity/i.test(rawMsg) ||
    /threshold/i.test(rawMsg) ||
    /mismatch/i.test(rawMsg) ||
    /inconclusive/i.test(rawMsg) ||
    /match comparison/i.test(rawMsg)
  ) {
    return {
      title: 'Photo Match Inconclusive',
      message: "We couldn't match this photo to the one on file closely enough. Try better, even lighting facing the camera directly. If this keeps failing, contact your invigilator for a manual check.",
      category: 'similarity'
    };
  }

  if (
    /Failed to fetch/i.test(rawMsg) ||
    /NetworkError/i.test(rawMsg) ||
    /ERR_FAILED/i.test(rawMsg) ||
    /CORS/i.test(rawMsg) ||
    /storage/i.test(rawMsg)
  ) {
    return {
      title: 'Connection Issue',
      message: 'Failed to communicate with the verification server. Please check your network connection and retry.',
      category: 'network'
    };
  }

  if (/no face/i.test(rawMsg) || /face not detected/i.test(rawMsg)) {
    return {
      title: 'Face Not Detected',
      message: 'No clear face was detected in the photo. Please look directly into the camera inside the oval guide.',
      category: 'face_detection'
    };
  }

  if (/multiple faces/i.test(rawMsg)) {
    return {
      title: 'Multiple Faces Detected',
      message: 'Multiple faces were detected in the photo. Please ensure you are alone in the room.',
      category: 'multiple_faces'
    };
  }

  if (/light/i.test(rawMsg) || /dim/i.test(rawMsg) || /dark/i.test(rawMsg) || /quality/i.test(rawMsg)) {
    return {
      title: 'Lighting Needs Adjustment',
      message: 'Lighting is too dim. Turn on room lights and avoid bright lights behind you.',
      category: 'lighting'
    };
  }

  if (/liveness.*expired/i.test(rawMsg)) {
    return {
      title: 'Challenge Expired',
      message: 'The liveness check challenge expired. Please retry within the allocated time.',
      category: 'liveness'
    };
  }

  if (/liveness.*fail/i.test(rawMsg) || /spoof/i.test(rawMsg)) {
    return {
      title: 'Liveness Check Failed',
      message: 'Liveness anti-spoofing evaluation failed or action sequence did not match. Please follow the on-screen prompts.',
      category: 'liveness'
    };
  }

  if (/model.*mismatch/i.test(rawMsg) || /re-enroll/i.test(rawMsg)) {
    return {
      title: 'Biometric Profile Outdated',
      message: 'Your enrolled reference photo uses an outdated template. Please re-enroll your reference face or contact support.',
      category: 'model_mismatch'
    };
  }

  return {
    title: 'Verification Failed',
    message: 'Identity check could not be completed. Please ensure clear lighting and try again.',
    category: 'generic'
  };
}

/**
 * @component BiometricGate
 * @description Single-snapshot facial identity verification gate.
 * Captures a clear webcam frame, immediately releases hardware tracks, and sends
 * the snapshot to the backend for server-authoritative AWS Rekognition / embedding comparison.
 */
export default function BiometricGate({
  sessionId,
  onVerified,
  onLocked,
  isMedicallyExempt = false
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // States: 'initializing' | 'ready' | 'verifying' | 'success' | 'retry' | 'locked' | 'camera_error'
  const [stage, setStage] = useState('initializing');
  const [errorMessage, setErrorMessage] = useState('');
  const [parsedError, setParsedError] = useState(null);
  const [guideMessage, setGuideMessage] = useState('Align your face inside the oval');
  const [guideStatus, setGuideStatus] = useState('aligning');

  const [remainingAttempts, setRemainingAttempts] = useState(3);
  const [attemptNumber, setAttemptNumber] = useState(0);
  const [similarityScore, setSimilarityScore] = useState(null);
  const [capturedSnapshotUrl, setCapturedSnapshotUrl] = useState(null);

  // Safely stop all camera tracks and release hardware
  const stopCameraStream = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const s = videoRef.current.srcObject;
      if (typeof s.getTracks === 'function') {
        s.getTracks().forEach((track) => track.stop());
      }
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch {}
      streamRef.current = null;
    }
  }, []);

  // Initialize camera preview
  const setupCamera = useCallback(async () => {
    try {
      setStage('initializing');
      setErrorMessage('');
      setParsedError(null);
      setCapturedSnapshotUrl(null);

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
      setStage('ready');
      setGuideMessage('Look directly at the camera. Click "Capture & Verify Identity" when ready.');
      setGuideStatus('ready');
    } catch (err) {
      setStage('camera_error');
      setErrorMessage(
        err.name === 'NotAllowedError'
          ? 'Camera access was denied. Please allow camera permissions in your browser to complete identity verification.'
          : 'Unable to access webcam. Ensure your camera is plugged in and not in use by another application.'
      );
    }
  }, []);

  useEffect(() => {
    setupCamera();

    return () => {
      stopCameraStream();
    };
  }, [setupCamera, stopCameraStream]);

  // Capture single JPEG snapshot as base64 data URL
  const captureSnapshot = () => {
    if (!videoRef.current) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, 640, 480);
    return canvas.toDataURL('image/jpeg', 0.92);
  };

  // Perform single-snapshot verification flow
  const handleCaptureAndVerify = async () => {
    try {
      // 1. Capture snapshot from active video feed
      const snapshotBase64 = captureSnapshot();
      if (!snapshotBase64) {
        throw new Error('Could not capture frame from camera.');
      }

      setCapturedSnapshotUrl(snapshotBase64);

      // 2. Immediately close webcam tracks to free camera hardware
      stopCameraStream();

      // 3. Switch to verifying stage
      setStage('verifying');
      setErrorMessage('');
      setParsedError(null);
      setGuideMessage('Sending photo to server to confirm your identity...');
      setGuideStatus('aligning');

      // 4. Send snapshot directly to backend API (zero browser-to-S3 CORS issues!)
      const result = await verifyIdentitySnapshot({
        sessionId,
        image: snapshotBase64
      });

      setAttemptNumber(result.attemptNumber || 1);
      setRemainingAttempts(result.remainingAttempts ?? 0);
      setSimilarityScore(result.similarityScore ?? 0);

      if (result.finalStatus === 'VERIFIED' || result.verified) {
        setStage('success');
        setGuideMessage('Identity confirmed successfully! You may now proceed.');
        setGuideStatus('success');
        if (onVerified) {
          onVerified(result);
        }
      } else if (result.finalStatus === 'LOCKED') {
        setStage('locked');
        const lockedErr = {
          title: 'Identity Check Locked',
          message: 'Too many unsuccessful attempts. Your session has been flagged for invigilator check-in. Please contact your proctor.',
          category: 'locked'
        };
        setParsedError(lockedErr);
        setErrorMessage(lockedErr.message);
        setGuideMessage(lockedErr.message);
        setGuideStatus('error');
        if (onLocked) {
          onLocked(result);
        }
      } else {
        setStage('retry');
        const mismatchErr = {
          title: 'Photo Match Inconclusive',
          message: "We couldn't match this photo to the one on file closely enough. Try better, even lighting facing the camera directly. If this keeps failing, contact your invigilator for a manual check.",
          category: 'similarity'
        };
        setParsedError(mismatchErr);
        setErrorMessage(mismatchErr.message);
        setGuideMessage(mismatchErr.message);
        setGuideStatus('warning');
      }
    } catch (err) {
      const parsed = parseBiometricError(err);
      setParsedError(parsed);
      setErrorMessage(parsed.message);

      if (parsed.category === 'locked') {
        setStage('locked');
        setGuideStatus('error');
        setGuideMessage(parsed.message);
        if (onLocked) onLocked();
      } else {
        setStage('retry');
        setGuideStatus('warning');
        setGuideMessage(`${parsed.title}: ${parsed.message}`);
      }
    }
  };

  // If candidate is medically exempt, show immediate bypass card
  if (isMedicallyExempt) {
    return (
      <div className="rounded-2xl bg-slate-900 border border-emerald-500/30 p-8 text-center max-w-xl mx-auto shadow-2xl backdrop-blur-xl">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4 border border-emerald-500/40">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Medical Accommodation Approved</h3>
        <p className="text-sm text-slate-300 mb-6 leading-relaxed">
          Your profile has an approved accommodation on file. Photo identity verification is bypassed for your exam session.
        </p>
        <button
          onClick={() => onVerified && onVerified({ finalStatus: 'EXEMPT', medicalExemption: true })}
          className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold shadow-lg shadow-emerald-900/30 transition-all duration-200 cursor-pointer"
        >
          Proceed with Medical Exemption
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl overflow-hidden backdrop-blur-xl flex flex-col">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            Identity Check
          </h2>
          <p className="text-xs text-slate-400">Step 2: Take a quick photo to verify your identity</p>
        </div>
        <div className="flex items-center gap-3">
          {stage === 'ready' && <LightingIndicator videoRef={videoRef} active={true} />}
          {parsedError?.category !== 'reference_unavailable' && (
            <div className="text-xs px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
              Attempts: {3 - remainingAttempts}/3
            </div>
          )}
        </div>
      </div>

      {/* Camera / Snapshot Preview Container */}
      <div className="relative w-full aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
        {stage === 'camera_error' ? (
          <div className="p-8 text-center max-w-md">
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Camera Unavailable</h3>
            <p className="text-xs text-slate-300 mb-6">{errorMessage}</p>
            <button
              onClick={setupCamera}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Retry Camera Connection
            </button>
          </div>
        ) : (
          <>
            {/* Live Video (shown during camera ready stage) */}
            {(stage === 'ready' || stage === 'initializing') && (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
                <FaceOvalGuide status={guideStatus} message={guideMessage} />
              </>
            )}

            {/* Frozen Snapshot (shown during verifying, retry, or success) */}
            {capturedSnapshotUrl && stage !== 'ready' && stage !== 'initializing' && (
              <img
                src={capturedSnapshotUrl}
                alt="Captured Snapshot"
                className="w-full h-full object-cover transform -scale-x-100"
              />
            )}

            {/* In-Frame Error Notification Banner */}
            {parsedError && stage === 'retry' && (
              <div className="absolute top-4 left-4 right-4 z-20 bg-slate-950/90 border border-amber-500/80 rounded-xl p-3 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-start gap-2.5">
                  <div className="p-1 rounded-full bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="text-xs font-bold text-amber-300">{parsedError.title}</h5>
                    <p className="text-[11px] text-slate-200 mt-0.5 leading-snug">{parsedError.message}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Verifying loader */}
            {stage === 'verifying' && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                <h4 className="text-base font-semibold text-white mb-1">Confirming Your Identity</h4>
                <p className="text-xs text-slate-400 max-w-xs">
                  Checking that your photo matches your registered student profile...
                </p>
              </div>
            )}

            {/* Success overlay */}
            {stage === 'success' && (
              <div className="absolute inset-0 bg-emerald-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
                <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-4 animate-bounce">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-1">Identity Verified</h3>
                <p className="text-xs text-slate-300">Identity check complete. You may now start the exam.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action Footer Controls */}
      <div className="p-6 bg-slate-950/60 border-t border-slate-800/80 flex flex-col gap-3">
        {parsedError && stage !== 'camera_error' && stage !== 'locked' && (
          <div className="px-4 py-3 rounded-lg bg-amber-950/40 border border-amber-800/50 text-xs text-amber-200 flex items-start gap-2.5">
            <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <span className="font-semibold block text-amber-300 mb-0.5">{parsedError.title}</span>
              <span className="text-slate-300">{parsedError.message}</span>
            </div>
          </div>
        )}

        {stage === 'ready' && (
          <button
            onClick={handleCaptureAndVerify}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-indigo-900/30 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Capture & Verify Identity
          </button>
        )}

        {stage === 'retry' && parsedError?.category === 'reference_unavailable' ? (
          <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 text-center">
            <h4 className="text-sm font-bold text-amber-300 mb-1">Reference Photo Required</h4>
            <p className="text-xs text-slate-300 mb-2">
              We don't have a reference photo on file to check against. Retaking this photo will not resolve the issue.
            </p>
            <p className="text-xs text-slate-400">
              Please contact your instructor or exam administrator to complete identity onboarding.
            </p>
          </div>
        ) : stage === 'retry' && (
          <button
            onClick={setupCamera}
            className="w-full py-3 px-6 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retake Photo & Try Again ({remainingAttempts} attempts remaining)
          </button>
        )}

        {stage === 'locked' && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-center">
            <h4 className="text-sm font-bold text-red-300 mb-1">Identity Check Locked</h4>
            <p className="text-xs text-slate-300 mb-2">
              You have reached the maximum number of photo attempts for this session.
            </p>
            <p className="text-xs text-slate-400">
              Please contact your invigilator or instructor for manual verification and an administrative check-in.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
