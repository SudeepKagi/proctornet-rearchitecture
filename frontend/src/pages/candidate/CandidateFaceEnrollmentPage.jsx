import React, { useState, useEffect, useRef } from 'react';
import FaceOvalGuide from '../../components/biometrics/FaceOvalGuide.jsx';
import LightingIndicator from '../../components/biometrics/LightingIndicator.jsx';
import {
  getEnrollmentStatus,
  requestEnrollmentUrl,
  confirmEnrollment,
  uploadBlobToPresignedUrl
} from '../../api/biometricsApi.js';

/**
 * @component CandidateFaceEnrollmentPage
 * @description Dedicated candidate self-service portal for initial reference face enrollment and status inspection.
 */
export default function CandidateFaceEnrollmentPage() {
  const [enrollment, setEnrollment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: string }

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await getEnrollmentStatus();
      setEnrollment(res);
    } catch (err) {
      console.error('Failed to fetch biometric status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Camera start / stop management
  const startCamera = async () => {
    try {
      setFeedback(null);
      setCapturedBlob(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }

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
      }
      setCapturing(true);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow access in browser settings.'
          : 'Failed to access camera. Please check your video device.'
      });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCapturing(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleCapturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, 640, 480);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        stopCamera();
      },
      'image/jpeg',
      0.95
    );
  };

  const handleConfirmEnrollment = async () => {
    if (!capturedBlob) return;

    try {
      setProcessing(true);
      setFeedback(null);

      // 1. Request presigned upload URL
      const { biometricId, uploadUrl } = await requestEnrollmentUrl({
        fileName: 'reference_face.jpg',
        mimeType: 'image/jpeg',
        byteSize: capturedBlob.size
      });

      // 2. Upload raw image to S3
      await uploadBlobToPresignedUrl(uploadUrl, capturedBlob, 'image/jpeg');

      // 3. Server-authoritative embedding extraction & quality evaluation
      const confirmRes = await confirmEnrollment({ biometricId });

      setFeedback({
        type: 'success',
        message: `Face enrolled successfully! Quality Score: ${(confirmRes.qualityScore * 100).toFixed(1)}%`
      });

      // Refresh enrollment record
      await fetchStatus();
      setCapturedBlob(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    } catch (err) {
      const msg = err.data?.message || err.message || 'Failed to enroll face. Please ensure clear lighting and pose.';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
            Biometric Face Enrollment
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Enroll your reference facial identity for automated pre-exam identity verification.
          </p>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-4 rounded-xl border text-sm flex items-start gap-3 backdrop-blur-md ${
              feedback.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-200'
                : 'bg-red-950/60 border-red-800/60 text-red-200'
            }`}
          >
            <span className="text-lg">{feedback.type === 'success' ? '✓' : '⚠'}</span>
            <div>{feedback.message}</div>
          </div>
        )}

        {/* Current Enrollment Status Card */}
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 backdrop-blur-xl shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Current Enrollment Status
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                    enrollment?.isEnrolled
                      ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300'
                      : 'bg-amber-950/80 border-amber-700/60 text-amber-300'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      enrollment?.isEnrolled ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  {enrollment?.isEnrolled ? 'ENROLLED' : 'NOT ENROLLED'}
                </span>
                {enrollment?.qualityScore && (
                  <span className="text-xs text-slate-400 font-mono">
                    Quality: {(enrollment.qualityScore * 100).toFixed(1)}%
                  </span>
                )}
                {enrollment?.modelVersion && (
                  <span className="text-xs text-slate-500 font-mono">
                    Model: {enrollment.modelVersion}
                  </span>
                )}
              </div>
            </div>

            {!capturing && !previewUrl && (
              <button
                onClick={startCamera}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all duration-200 shadow-lg shadow-indigo-900/30 cursor-pointer"
              >
                {enrollment?.isEnrolled ? 'Update Enrolled Face' : 'Start Enrollment'}
              </button>
            )}
          </div>
        </div>

        {/* Camera / Capture Section */}
        {capturing && (
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 backdrop-blur-xl shadow-xl flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">Live Camera Capture</h2>
              <LightingIndicator videoRef={videoRef} active={capturing} />
            </div>

            <div className="relative w-full max-w-md aspect-[4/3] bg-black rounded-xl overflow-hidden shadow-inner">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
              <FaceOvalGuide status="aligning" message="Center your face inside the oval" />
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={stopCamera}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCapturePhoto}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-indigo-900/40 transition cursor-pointer flex items-center gap-2"
              >
                <span className="w-3 h-3 rounded-full bg-white animate-ping" />
                Capture Reference Photo
              </button>
            </div>
          </div>
        )}

        {/* Preview & Confirmation Section */}
        {previewUrl && (
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 backdrop-blur-xl shadow-xl flex flex-col items-center">
            <h2 className="text-sm font-semibold text-white mb-4">Review Reference Photo</h2>
            <div className="relative w-full max-w-md aspect-[4/3] bg-black rounded-xl overflow-hidden shadow-md">
              <img src={previewUrl} alt="Captured face preview" className="w-full h-full object-cover" />
            </div>

            <p className="text-xs text-slate-400 mt-4 max-w-md text-center">
              Ensure your face is clearly illuminated, eyes are open and looking at the camera, and no hats or sunglasses are worn.
            </p>

            <div className="flex gap-4 mt-6">
              <button
                onClick={startCamera}
                disabled={processing}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition disabled:opacity-50 cursor-pointer"
              >
                Retake Photo
              </button>
              <button
                onClick={handleConfirmEnrollment}
                disabled={processing}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-900/30 transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {processing && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {processing ? 'Processing Server Extraction...' : 'Confirm & Save Enrollment'}
              </button>
            </div>
          </div>
        )}

        {/* Enrollment Instructions Guideline */}
        <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-6 text-xs text-slate-400 space-y-3">
          <h3 className="font-semibold text-slate-300 text-sm">Enrollment Guidelines & Privacy Safeguards</h3>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Your facial photo is securely stored in an encrypted institutional storage bucket.</li>
            <li>Raw facial embeddings (128-dimensional vectors) are generated strictly on the server and are never exposed to clients.</li>
            <li>Biometric matching occurs only when entering scheduled proctored exam sessions.</li>
            <li>Candidates with institutional medical accommodations are exempt from biometric verification.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
