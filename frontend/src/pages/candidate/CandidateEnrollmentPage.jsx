/**
 * @file CandidateEnrollmentPage.jsx
 * @description First-time student candidate onboarding component for reference face capture
 * and Government ID document upload. Directly uploads evidence to S3 and transitions
 * account status to VERIFIED upon successful completion.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileText,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  Sparkles,
  Lock,
  X,
  FileCheck
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { enrollCandidate } from '../../api/candidateIdentityApi.js';

export function CandidateEnrollmentPage() {
  const navigate = useNavigate();
  const { user, setUser, refreshUser } = useAuth();

  // Active step: 1 = Face Capture, 2 = ID Document, 3 = Confirmation & Review
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Webcam State
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturedFaceImage, setCapturedFaceImage] = useState(null);

  // Step 2: ID Document State
  const [documentType, setDocumentType] = useState('NATIONAL_ID');
  const [idFile, setIdFile] = useState(null);
  const [idPreview, setIdPreview] = useState(null);
  const fileInputRef = useRef(null);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [enrolledSuccess, setEnrolledSuccess] = useState(false);

  // Start webcam
  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch (err) {
      setCameraError(
        'Unable to access your camera. Please ensure camera permissions are granted in your browser settings.'
      );
      setCameraActive(false);
    }
  }, []);

  // Stop webcam
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Manage camera lifecycle
  useEffect(() => {
    if (currentStep === 1 && !capturedFaceImage) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [currentStep, capturedFaceImage, startCamera, stopCamera]);

  // Capture face snapshot from video feed
  const captureSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    // Mirror horizontally for natural webcam feel
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64Data = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedFaceImage(base64Data);
    stopCamera();
  };

  const retakeSnapshot = () => {
    setCapturedFaceImage(null);
    startCamera();
  };

  // Handle ID document file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setSubmitError('ID document file size must be less than 10MB');
      return;
    }

    setIdFile(file);
    setSubmitError('');

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setIdPreview(reader.result);
      reader.readAsDataURL(file);
    } else {
      // PDF or non-image
      setIdPreview(null);
    }
  };

  // Submit enrollment
  const handleSubmit = async () => {
    if (!capturedFaceImage) {
      setSubmitError('Reference face photo is required. Please capture a photo.');
      setCurrentStep(1);
      return;
    }
    if (!idFile && !idPreview) {
      setSubmitError('Government ID document is required. Please select a file.');
      setCurrentStep(2);
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const response = await enrollCandidate({
        faceImage: capturedFaceImage,
        idDocument: idFile || idPreview,
        documentType
      });

      // Update AuthContext user state with the verified profile
      if (response?.user) {
        setUser(response.user);
      }
      if (refreshUser) {
        await refreshUser().catch(() => {});
      }

      setEnrolledSuccess(true);
      setTimeout(() => {
        navigate('/candidate', { replace: true });
      }, 2000);
    } catch (err) {
      setSubmitError(
        err?.message || 'Failed to complete candidate enrollment. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <Badge variant="outline" className="text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 gap-1.5 py-1 px-3">
            <ShieldCheck size={14} />
            Mandatory Student Onboarding
          </Badge>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Identity & Biometric Enrollment
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
            Before entering proctored examinations, institutional security requires you to enroll your official reference face photo and submit a Government ID.
          </p>
        </div>

        {/* Stepper Progress */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { step: 1, title: 'Face Photo', desc: 'Webcam snapshot' },
            { step: 2, title: 'Government ID', desc: 'Document upload' },
            { step: 3, title: 'Verification', desc: 'Activate profile' }
          ].map((item) => (
            <button
              key={item.step}
              type="button"
              disabled={submitting}
              onClick={() => {
                if (item.step === 1 || (item.step === 2 && capturedFaceImage) || (item.step === 3 && capturedFaceImage && idFile)) {
                  setCurrentStep(item.step);
                }
              }}
              className={`p-3 rounded-xl border text-left transition-all ${
                currentStep === item.step
                  ? 'bg-white dark:bg-slate-900 border-blue-600 shadow-sm'
                  : currentStep > item.step
                  ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                  : 'bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Step {item.step}
                </span>
                {currentStep > item.step ? (
                  <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <span className={`w-2 h-2 rounded-full ${currentStep === item.step ? 'bg-blue-600' : 'bg-slate-300'}`} />
                )}
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">
                {item.title}
              </p>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                {item.desc}
              </p>
            </button>
          ))}
        </div>

        {/* Error Alert */}
        {submitError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Enrollment Error</AlertTitle>
            <AlertDescription className="text-xs">{submitError}</AlertDescription>
          </Alert>
        )}

        {/* Success Alert */}
        {enrolledSuccess && (
          <Alert className="bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-100">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <AlertTitle className="text-sm font-bold">Enrollment Complete!</AlertTitle>
            <AlertDescription className="text-xs">
              Your reference face photo and ID have been saved to secure AWS S3. Your account is verified. Redirecting to candidate dashboard...
            </AlertDescription>
          </Alert>
        )}

        {/* Main Step Cards */}
        <Card className="shadow-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {/* ================= STEP 1: REFERENCE FACE PHOTO ================= */}
          {currentStep === 1 && (
            <>
              <CardHeader>
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Camera className="h-5 w-5" />
                  <CardTitle className="text-lg">Step 1: Capture Reference Face Photo</CardTitle>
                </div>
                <CardDescription>
                  This photo will be compared against your live webcam during exam verification to ensure only you can take your tests.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {cameraError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">{cameraError}</AlertDescription>
                  </Alert>
                )}

                <div className="relative mx-auto w-full max-w-md aspect-4/3 rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center border-2 border-slate-300 dark:border-slate-800 shadow-inner">
                  {capturedFaceImage ? (
                    <img
                      src={capturedFaceImage}
                      alt="Captured Face Reference"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        className="w-full h-full object-cover -scale-x-100"
                      />
                      {/* Facial target guide oval */}
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <div className="w-52 h-64 border-2 border-dashed border-blue-400/80 rounded-[50%] shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]" />
                      </div>
                      <div className="absolute bottom-3 left-0 right-0 text-center pointer-events-none">
                        <span className="text-xs font-medium text-white/90 bg-black/60 px-3 py-1 rounded-full backdrop-blur-xs">
                          Position your face inside the oval
                        </span>
                      </div>
                    </>
                  )}
                  <canvas ref={canvasRef} className="hidden" />
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Instructions for accurate matching:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Look directly into the camera with good lighting</li>
                    <li>Avoid hats, sunglasses, or heavy masks</li>
                    <li>Ensure your face is clearly centered</li>
                  </ul>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <Button variant="ghost" disabled={true} className="opacity-0">
                  Back
                </Button>
                {capturedFaceImage ? (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={retakeSnapshot}>
                      <RefreshCw size={14} className="mr-1.5" />
                      Retake
                    </Button>
                    <Button
                      onClick={() => setCurrentStep(2)}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Continue to Step 2
                      <ArrowRight size={14} className="ml-1.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={captureSnapshot}
                    disabled={!cameraActive}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6"
                  >
                    <Camera size={16} className="mr-2" />
                    Capture Photo
                  </Button>
                )}
              </CardFooter>
            </>
          )}

          {/* ================= STEP 2: GOVERNMENT ID UPLOAD ================= */}
          {currentStep === 2 && (
            <>
              <CardHeader>
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <FileText className="h-5 w-5" />
                  <CardTitle className="text-lg">Step 2: Upload Government ID Document</CardTitle>
                </div>
                <CardDescription>
                  Upload your official institutional or government-issued ID card (JPEG, PNG, or PDF up to 10MB).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Document Type Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Document Type
                  </label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="NATIONAL_ID">National ID / Aadhaar Card</option>
                    <option value="PASSPORT">Passport</option>
                    <option value="DRIVING_LICENSE">Driver's License</option>
                    <option value="STUDENT_ID">University Student ID Card</option>
                  </select>
                </div>

                {/* Upload Box */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-800/30 group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {idPreview ? (
                    <div className="space-y-3">
                      <div className="relative mx-auto max-w-sm max-h-56 rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                        <img src={idPreview} alt="Document Preview" className="w-full h-auto object-contain" />
                      </div>
                      <div className="flex items-center justify-center gap-2 text-xs font-medium text-emerald-600">
                        <CheckCircle2 size={14} />
                        <span>{idFile?.name || 'Document Attached'}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">Click to change file</p>
                    </div>
                  ) : idFile ? (
                    <div className="space-y-2">
                      <div className="mx-auto w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                        <FileCheck size={24} />
                      </div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{idFile.name}</p>
                      <p className="text-xs text-slate-500">{(idFile.size / 1024).toFixed(1)} KB</p>
                      <p className="text-[11px] text-slate-400">Click to replace file</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="mx-auto w-12 h-12 rounded-xl bg-blue-50 dark:bg-slate-800 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <UploadCloud size={24} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          Click or drag and drop your document
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">JPEG, PNG, or PDF (Max 10MB)</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  Back to Face Capture
                </Button>
                <Button
                  onClick={() => setCurrentStep(3)}
                  disabled={!idFile && !idPreview}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                >
                  Review & Submit
                  <ArrowRight size={14} className="ml-1.5" />
                </Button>
              </CardFooter>
            </>
          )}

          {/* ================= STEP 3: REVIEW & ACTIVATE ================= */}
          {currentStep === 3 && (
            <>
              <CardHeader>
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <UserCheck className="h-5 w-5" />
                  <CardTitle className="text-lg">Step 3: Review & Activate Account</CardTitle>
                </div>
                <CardDescription>
                  Review your reference biometrics and document details before uploading to the secure AWS cloud repository.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Face Preview Card */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-800/40 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Reference Face
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600 p-0" onClick={() => setCurrentStep(1)}>
                        Change
                      </Button>
                    </div>
                    {capturedFaceImage && (
                      <div className="aspect-4/3 rounded-lg overflow-hidden bg-slate-900 border border-slate-300">
                        <img src={capturedFaceImage} alt="Captured Face" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>

                  {/* ID Document Preview Card */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-800/40 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Government ID
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600 p-0" onClick={() => setCurrentStep(2)}>
                        Change
                      </Button>
                    </div>
                    <div className="aspect-4/3 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-300">
                      {idPreview ? (
                        <img src={idPreview} alt="ID Document" className="w-full h-full object-contain" />
                      ) : (
                        <div className="text-center p-3">
                          <FileText size={32} className="mx-auto text-blue-600 mb-1" />
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{idFile?.name || 'Document'}</p>
                          <p className="text-[10px] text-slate-400">PDF Document</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 p-3.5 flex gap-3 items-start">
                  <Lock size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-900 dark:text-blue-200 space-y-0.5">
                    <p className="font-semibold">Privacy & Encryption Commitment</p>
                    <p className="text-blue-700 dark:text-blue-300">
                      Evidence files are compressed, encrypted in transit and at rest in AWS S3 (Mumbai). Biometrics are strictly used for academic verification.
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(2)} disabled={submitting}>
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || enrolledSuccess}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6"
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={14} className="mr-2 animate-spin" />
                      Uploading to AWS S3 & Activating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} className="mr-1.5" />
                      Submit & Activate Profile
                    </>
                  )}
                </Button>
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

export default CandidateEnrollmentPage;
