import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, CheckCircle2, AlertCircle, RefreshCw, ArrowLeft, Shield, Eye, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import FaceOvalGuide from '../../components/biometrics/FaceOvalGuide.jsx';
import LightingIndicator from '../../components/biometrics/LightingIndicator.jsx';
import {
  getEnrollmentStatus,
  requestEnrollmentUrl,
  confirmEnrollment,
  uploadBlobToPresignedUrl,
} from '../../api/biometricsApi.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';
import { Separator } from '../../components/ui/separator.jsx';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';

/**
 * @component CandidateFaceEnrollmentPage
 * @description Academic candidate self-service portal for initial reference face enrollment and biometric profile inspection.
 */
export default function CandidateFaceEnrollmentPage() {
  const navigate = useNavigate();
  const [enrollment, setEnrollment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: string }

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getEnrollmentStatus();
      setEnrollment(res);
    } catch (err) {
      setError(err?.data || err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const attachVideoRef = useCallback((node) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      if (node.srcObject !== streamRef.current) {
        node.srcObject = streamRef.current;
      }
      node.play().catch((err) => {
        console.warn('Webcam stream play error:', err);
      });
    }
  }, []);

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
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = mediaStream;
      setCapturing(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch((err) => {
          console.warn('Direct play error:', err);
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err.name === 'NotAllowedError'
            ? 'Camera permission denied. Please allow camera access in your browser settings.'
            : 'Unable to access your camera. Please ensure no other application is using it.',
      });
    }
  };

  useEffect(() => {
    if (capturing && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch((err) => {
        console.warn('Playback error on capturing effect:', err);
      });
    }
  }, [capturing]);

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
        byteSize: capturedBlob.size,
      });

      // 2. Upload raw image directly to storage
      await uploadBlobToPresignedUrl(uploadUrl, capturedBlob, 'image/jpeg');

      // 3. Server-authoritative embedding extraction & validation
      const confirmRes = await confirmEnrollment({ biometricId });

      setFeedback({
        type: 'success',
        message: `Face enrolled successfully! Quality evaluation score: ${(
          confirmRes.qualityScore * 100
        ).toFixed(1)}%`,
      });

      // Refresh enrollment record
      await fetchStatus();
      setCapturedBlob(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    } catch (err) {
      const msg =
        err.data?.message || err.message || 'Failed to enroll face. Please ensure proper lighting and front-facing pose.';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Breadcrumb / Navigation */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/candidate')}
          className="text-xs h-8 gap-1.5 text-slate-700"
        >
          <ArrowLeft size={13} />
          <span>Back to Dashboard</span>
        </Button>
      </div>

      {/* Header */}
      <div className="border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Identity & Verification</span>
          <span className="text-slate-300">•</span>
          <span className="text-xs font-medium text-slate-500">Self-Service Profile</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Biometric Face Enrollment
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Enroll an official reference facial photo used by ProctorNet's automated liveness verification during exam check-in.
        </p>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <Alert variant={feedback.type === 'success' ? 'success' : 'destructive'}>
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <AlertTitle>{feedback.type === 'success' ? 'Enrollment Complete' : 'Verification Issue'}</AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      {/* Enrollment Status Card */}
      <StateBoundary
        isLoading={loading}
        error={error}
        isEmpty={!enrollment}
        emptyTitle="Biometric Status Unavailable"
        emptyDescription="Unable to retrieve candidate enrollment details from the biometric engine."
        onRetry={fetchStatus}
      >
        <Card className="border-slate-200 bg-white shadow-xs">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Current Enrollment Status
            </span>
            <div className="flex items-center gap-2.5">
              <Badge variant={enrollment?.isEnrolled ? 'success' : 'warning'} size="default">
                {enrollment?.isEnrolled ? 'Active Reference Enrolled' : 'Not Enrolled'}
              </Badge>
              {enrollment?.qualityScore && (
                <span className="text-xs font-mono text-slate-600">
                  Quality Score: {(enrollment.qualityScore * 100).toFixed(1)}%
                </span>
              )}
              {enrollment?.modelVersion && (
                <span className="text-xs font-mono text-slate-500">
                  Model: {enrollment.modelVersion}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {enrollment?.isEnrolled
                ? 'Your biometric profile is ready. You will be authenticated against this reference before proctored exams.'
                : 'A clean front-facing reference photo is required to participate in monitored assessments.'}
            </p>
          </div>

          {!capturing && !previewUrl && (
            <Button
              onClick={startCamera}
              className="sm:self-center shrink-0"
              size="default"
            >
              <Camera size={15} />
              {enrollment?.isEnrolled ? 'Update Reference Face' : 'Start Enrollment'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Live Camera Viewport */}
      {capturing && (
        <Card className="border-slate-200 bg-white shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Live Camera Alignment</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Center your face within the guide oval. Look directly at the camera with neutral expression.
                </CardDescription>
              </div>
              <LightingIndicator videoRef={videoRef} active={capturing} />
            </div>
          </CardHeader>
          <CardContent className="p-6 flex flex-col items-center">
            <div className="relative w-full max-w-md aspect-[4/3] bg-slate-900 rounded-lg overflow-hidden border border-slate-300 shadow-inner">
              <video
                ref={attachVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
                onLoadedMetadata={(e) => {
                  e.currentTarget.play().catch((err) => {
                    console.warn('onLoadedMetadata play error:', err);
                  });
                }}
              />
              <FaceOvalGuide status="aligning" message="Align face within the frame" />
            </div>

            <div className="flex items-center gap-3 mt-6">
              <Button
                variant="outline"
                size="default"
                onClick={stopCamera}
              >
                Cancel
              </Button>
              <Button
                size="default"
                onClick={handleCapturePhoto}
                className="gap-2 bg-slate-900 text-white hover:bg-slate-800"
              >
                <Camera size={16} />
                Capture Reference Photo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Photo Preview & Submission */}
      {previewUrl && (
        <Card className="border-slate-200 bg-white shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-base font-semibold">Review Reference Photo</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Ensure lighting is uniform across your face and features are unobstructed.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 flex flex-col items-center">
            <div className="relative w-full max-w-md aspect-[4/3] bg-slate-900 rounded-lg overflow-hidden border border-slate-300 shadow-sm">
              <img src={previewUrl} alt="Captured face preview" className="w-full h-full object-cover" />
            </div>

            <div className="flex items-center gap-3 mt-6">
              <Button
                variant="outline"
                size="default"
                disabled={processing}
                onClick={startCamera}
              >
                Retake Photo
              </Button>
              <Button
                size="default"
                disabled={processing}
                onClick={handleConfirmEnrollment}
                className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white"
              >
                {processing && <RefreshCw size={15} className="animate-spin" />}
                {processing ? 'Extracting Server Embedding...' : 'Confirm & Save Enrollment'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      </StateBoundary>

      {/* Institutional Privacy & Governance Standards */}
      <Card className="border-slate-200 bg-slate-50/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Lock size={13} />
            Institutional Biometric Standards & Privacy Safeguards
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0 text-xs text-slate-600 leading-relaxed">
          <p>
            • Biometric embeddings are extracted server-authoritatively and stored with AES-256 encryption.
          </p>
          <p>
            • Raw reference photographs are restricted to institutional identity matching and are never shared with third parties or external commercial platforms.
          </p>
          <p>
            • If you have approved institutional accommodations or require manual identity verification, please contact your university examinations coordinator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
