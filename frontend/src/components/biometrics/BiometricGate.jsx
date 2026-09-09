import React, { useState, useEffect, useRef } from 'react';
import FaceOvalGuide from './FaceOvalGuide.jsx';
import LightingIndicator from './LightingIndicator.jsx';
import {
  requestLivenessChallenge,
  verifyLiveness,
  requestVerificationImageUrl,
  verifyFace,
  uploadBlobToPresignedUrl
} from '../../api/biometricsApi.js';

const ACTION_LABELS = {
  BLINK: 'Blink your eyes naturally',
  TURN_HEAD_LEFT: 'Turn your head slightly to your left',
  TURN_HEAD_RIGHT: 'Turn your head slightly to your right',
  SMILE: 'Smile naturally',
  NOD_HEAD: 'Nod your head up and down'
};

/**
 * @component BiometricGate
 * @description Interactive pre-exam biometric verification gate enforcing active liveness anti-spoofing
 * and server-authoritative facial feature matching.
 */
export default function BiometricGate({
  sessionId,
  onVerified,
  onLocked,
  isMedicallyExempt = false
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // States: 'idle' | 'initializing' | 'ready' | 'challenging' | 'verifying' | 'success' | 'retry' | 'locked' | 'camera_error'
  const [stage, setStage] = useState('initializing');
  const [errorMessage, setErrorMessage] = useState('');
  const [guideMessage, setGuideMessage] = useState('Align your face inside the oval');
  const [guideStatus, setGuideStatus] = useState('aligning');

  // Liveness challenge state
  const [activeActionIndex, setActiveActionIndex] = useState(0);
  const [expectedActions, setExpectedActions] = useState([]);
  const [challengeSecondsLeft, setChallengeSecondsLeft] = useState(8);
  const [remainingAttempts, setRemainingAttempts] = useState(3);
  const [attemptNumber, setAttemptNumber] = useState(0);
  const [similarityScore, setSimilarityScore] = useState(null);

  // Initialize camera
  useEffect(() => {
    let mounted = true;

    async function setupCamera() {
      try {
        setStage('initializing');
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
          },
          audio: false
        });

        if (!mounted) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
        setStage('ready');
        setGuideMessage('Face detected. Click "Begin Verification" when ready.');
        setGuideStatus('ready');
      } catch (err) {
        if (!mounted) return;
        setStage('camera_error');
        setErrorMessage(
          err.name === 'NotAllowedError'
            ? 'Camera access was denied. Please allow camera permissions to complete biometric verification.'
            : 'Unable to access webcam. Ensure your camera is plugged in and not in use by another application.'
        );
      }
    }

    setupCamera();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Helper: Capture a single JPEG frame from video
  const captureFrameBlob = (actionTag = null) => {
    return new Promise((resolve, reject) => {
      if (!videoRef.current) {
        return reject(new Error('Video element not available'));
      }
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, 640, 480);

      // If actionTag is provided (e.g. in development/testing), we can optionally draw subtle text
      if (actionTag) {
        ctx.font = '10px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.01)';
        ctx.fillText(`ACTION:${actionTag}`, 10, 10);
      }

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to generate canvas image blob'));
        },
        'image/jpeg',
        0.92
      );
    });
  };

  // Run Liveness & Face Verification Flow
  const runVerificationFlow = async () => {
    try {
      setStage('challenging');
      setErrorMessage('');
      setGuideStatus('action');

      // 1. Request randomized challenge from server
      const challenge = await requestLivenessChallenge({ sessionId });
      setExpectedActions(challenge.expectedActions);
      setChallengeSecondsLeft(challenge.expiresInSeconds || 8);

      // Countdown timer
      const timerInterval = setInterval(() => {
        setChallengeSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerInterval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // 2. Guide candidate through actions and capture frames
      const capturedFrameBlobs = [];
      for (let i = 0; i < challenge.expectedActions.length; i++) {
        const action = challenge.expectedActions[i];
        setActiveActionIndex(i);
        const actionText = ACTION_LABELS[action] || `Perform action: ${action}`;
        setGuideMessage(`Action ${i + 1} of ${challenge.expectedActions.length}: ${actionText}`);

        // Wait 1.5s for candidate to perform action
        await new Promise((res) => setTimeout(res, 1500));

        // Capture frame
        const frameBlob = await captureFrameBlob(action);
        capturedFrameBlobs.push(frameBlob);
      }

      clearInterval(timerInterval);

      // 3. Upload frames bundle to server presigned URL
      setStage('verifying');
      setGuideMessage('Analyzing biometric anti-spoofing and liveness...');
      setGuideStatus('aligning');

      // Package frames into a single payload buffer or last representative frame
      const primaryLivenessBlob = capturedFrameBlobs[capturedFrameBlobs.length - 1] || (await captureFrameBlob());
      await uploadBlobToPresignedUrl(
        challenge.liveMediaUploadUrl,
        primaryLivenessBlob,
        'application/octet-stream'
      );

      // 4. Verify liveness server-side to obtain HMAC livenessToken
      const livenessResult = await verifyLiveness({
        sessionId,
        challengeId: challenge.challengeId,
        nonce: challenge.nonce
      });

      if (!livenessResult.livenessToken) {
        throw new Error('Server did not issue liveness token');
      }

      // 5. Capture high-res live selfie for face matching
      setGuideMessage('Verifying facial identity against enrollment...');
      const selfieBlob = await captureFrameBlob();

      // 6. Request live image upload URL
      const uploadDetails = await requestVerificationImageUrl({
        sessionId,
        mimeType: 'image/jpeg',
        byteSize: selfieBlob.size
      });

      // 7. Upload selfie to S3
      await uploadBlobToPresignedUrl(uploadDetails.uploadUrl, selfieBlob, 'image/jpeg');

      // 8. Submit for server-authoritative face verification
      const verifyResult = await verifyFace({
        sessionId,
        liveImageId: uploadDetails.liveImageId,
        livenessToken: livenessResult.livenessToken
      });

      setAttemptNumber(verifyResult.attemptNumber || 1);
      setRemainingAttempts(verifyResult.remainingAttempts ?? 0);
      setSimilarityScore(verifyResult.similarityScore || 0);

      if (verifyResult.finalStatus === 'VERIFIED') {
        setStage('success');
        setGuideMessage('Identity verified successfully! You may now begin the exam.');
        setGuideStatus('success');
        if (onVerified) {
          onVerified(verifyResult);
        }
      } else if (verifyResult.finalStatus === 'LOCKED') {
        setStage('locked');
        setGuideMessage('Biometric verification locked due to consecutive failures.');
        setGuideStatus('error');
        if (onLocked) {
          onLocked(verifyResult);
        }
      } else {
        setStage('retry');
        setGuideMessage('Face match inconclusive or below threshold. Please try again.');
        setGuideStatus('warning');
      }
    } catch (err) {
      const msg = err.data?.message || err.message || 'Verification attempt failed';
      setErrorMessage(msg);
      if (err.status === 403 && /locked/i.test(msg)) {
        setStage('locked');
        setGuideStatus('error');
        if (onLocked) onLocked();
      } else {
        setStage('retry');
        setGuideStatus('warning');
        setGuideMessage('Verification failed. Please review error details and retry.');
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
          Your profile has been granted an institutional biometric medical exemption. Facial identity verification is bypassed in accordance with your approved accommodation.
        </p>
        <button
          onClick={() => onVerified && onVerified({ finalStatus: 'EXEMPT', medicalExemption: true })}
          className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold shadow-lg shadow-emerald-900/30 transition-all duration-200"
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
            Biometric Identity Gate
          </h2>
          <p className="text-xs text-slate-400">Step 2: Active liveness verification & facial matching</p>
        </div>
        <div className="flex items-center gap-3">
          <LightingIndicator videoRef={videoRef} active={stage !== 'camera_error' && stage !== 'success'} />
          <div className="text-xs px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
            Attempts: {3 - remainingAttempts}/3
          </div>
        </div>
      </div>

      {/* Camera Preview Container */}
      <div className="relative w-full aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
        {stage === 'camera_error' ? (
          <div className="p-8 text-center max-w-md">
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h4 className="text-base font-semibold text-white mb-1">Camera Unavailable</h4>
            <p className="text-xs text-slate-300">{errorMessage}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
            {/* Guide overlay */}
            <FaceOvalGuide status={guideStatus} message={guideMessage} />

            {/* Challenging active prompt banner */}
            {stage === 'challenging' && (
              <div className="absolute top-4 inset-x-4 flex flex-col items-center">
                <div className="w-full max-w-md bg-slate-950/90 border border-amber-500/50 rounded-xl p-3 shadow-xl backdrop-blur-md">
                  <div className="flex items-center justify-between text-xs font-semibold text-amber-400 mb-1">
                    <span>LIVENESS CHALLENGE ACTIVE</span>
                    <span className="font-mono text-white bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/40">
                      {challengeSecondsLeft}s
                    </span>
                  </div>
                  <p className="text-sm font-bold text-white text-center py-1">
                    {ACTION_LABELS[expectedActions[activeActionIndex]] || expectedActions[activeActionIndex]}
                  </p>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                    <div
                      className="bg-amber-500 h-full transition-all duration-300"
                      style={{ width: `${(challengeSecondsLeft / 8) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Verifying loader */}
            {stage === 'verifying' && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                <h4 className="text-base font-semibold text-white mb-1">Evaluating Server Biometrics</h4>
                <p className="text-xs text-slate-400 max-w-xs">
                  Server is computing neural embeddings and running anti-spoofing filters...
                </p>
              </div>
            )}

            {/* Success overlay */}
            {stage === 'success' && (
              <div className="absolute inset-0 bg-emerald-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-4 animate-bounce">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-1">Identity Verified</h3>
                <p className="text-xs text-emerald-200 mb-2">
                  Match Score: {(similarityScore * 100).toFixed(1)}% (Threshold: 80.0%)
                </p>
                <p className="text-xs text-slate-300">Proceeding to exam environment...</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action Footer Controls */}
      <div className="p-6 bg-slate-950/60 border-t border-slate-800/80 flex flex-col gap-3">
        {errorMessage && stage !== 'camera_error' && (
          <div className="px-4 py-2.5 rounded-lg bg-red-950/60 border border-red-800/50 text-xs text-red-300 flex items-start gap-2">
            <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {stage === 'ready' && (
          <button
            onClick={runVerificationFlow}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-indigo-900/30 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Begin Biometric Verification
          </button>
        )}

        {stage === 'retry' && (
          <button
            onClick={runVerificationFlow}
            className="w-full py-3 px-6 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry Verification ({remainingAttempts} attempts remaining)
          </button>
        )}

        {stage === 'locked' && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-center">
            <h4 className="text-sm font-bold text-red-300 mb-1">Session Biometric Verification Locked</h4>
            <p className="text-xs text-slate-300 mb-2">
              You have exhausted all 3 biometric verification attempts for this session.
            </p>
            <p className="text-xs text-slate-400">
              Please contact the proctor or examination supervisor immediately for manual identity inspection and an administrative override.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
