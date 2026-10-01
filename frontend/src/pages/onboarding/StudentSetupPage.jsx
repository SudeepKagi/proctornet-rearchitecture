/**
 * @file StudentSetupPage.jsx
 * @description Simplified Student Profile & Verification Setup.
 * Asks for Full Name, Branch dropdown, Semester (1-8), Face Photo, and College ID.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as studentApi from '../../api/studentApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';
import {
  GraduationCap,
  Camera,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  X
} from 'lucide-react';

export function StudentSetupPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form inputs
  const [fullName, setFullName] = useState(user?.name || '');
  const [departmentId, setDepartmentId] = useState('');
  const [semester, setSemester] = useState('1');

  // Media files
  const [faceImageFile, setFaceImageFile] = useState(null);
  const [faceImagePreview, setFaceImagePreview] = useState(null);
  const [idDocumentFile, setIdDocumentFile] = useState(null);
  const [idDocumentPreview, setIdDocumentPreview] = useState(null);

  // Camera capture modal state
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        setError('');
        const [depts, status] = await Promise.all([
          studentApi.getDepartments(),
          studentApi.getStudentIdentityStatus().catch(() => null)
        ]);

        setDepartments(Array.isArray(depts) ? depts : []);
        if (depts && depts.length > 0 && !departmentId) {
          setDepartmentId(depts[0].department_id);
        }

        if (status?.verificationStatus === 'VERIFIED') {
          navigate('/student', { replace: true });
        } else if (status?.verificationStatus === 'PENDING_REVIEW' || status?.verificationStatus === 'PENDING') {
          navigate('/onboarding/pending', { replace: true });
        }
      } catch (err) {
        setError(err?.message || 'Failed to load setup form');
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();

    return () => {
      stopCamera();
    };
  }, [navigate]);

  function handleFaceFileChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      setFaceImageFile(file);
      setFaceImagePreview(URL.createObjectURL(file));
      setError('');
    }
  }

  function handleIdFileChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      setIdDocumentFile(file);
      if (file.type.startsWith('image/')) {
        setIdDocumentPreview(URL.createObjectURL(file));
      } else {
        setIdDocumentPreview('pdf');
      }
      setError('');
    }
  }

  async function startCamera() {
    try {
      setError('');
      setCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      setCameraActive(false);
      setError('Could not access camera. Please upload a photo from your device instead.');
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  function captureSnapshot() {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], 'webcam_photo.jpg', { type: 'image/jpeg' });
        setFaceImageFile(file);
        setFaceImagePreview(canvas.toDataURL('image/jpeg'));
        stopCamera();
      }
    }, 'image/jpeg', 0.9);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) {
      setError('Please enter your full legal name.');
      return;
    }
    if (!departmentId) {
      setError('Please select your academic branch / department.');
      return;
    }
    if (!faceImageFile) {
      setError('Please upload or take a clear face photo.');
      return;
    }
    if (!idDocumentFile) {
      setError('Please upload your college identity card document.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', fullName.trim());
      formData.append('departmentId', departmentId);
      formData.append('semester', semester);
      formData.append('faceImage', faceImageFile);
      formData.append('idDocument', idDocumentFile);

      await studentApi.submitStudentSetup(formData);
      if (refreshUser) await refreshUser().catch(() => {});
      navigate('/onboarding/pending', { replace: true });
    } catch (err) {
      setError(err?.data?.message || err?.message || 'Failed to submit profile setup. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <StateBoundary loading={true} loadingMessage="Loading setup details..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4 sm:px-6 flex justify-center items-center">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center space-y-1.5">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md mx-auto mb-2">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Student Profile Setup
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Please fill in your details and upload your ID so administrator can verify your account.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="py-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}

        <Card className="border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
          <CardContent className="p-6 sm:p-8 space-y-5">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Full Name *
                </label>
                <Input
                  required
                  placeholder="e.g. John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>

              {/* Branch / Department */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Academic Branch / Department *
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {departments.map((dept) => (
                    <option key={dept.department_id} value={dept.department_id}>
                      {dept.name} ({dept.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Semester */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Current Semester *
                </label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={String(s)}>
                      Semester {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Face Photo */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Face Photo * (Used for proctoring verification)
                </label>

                {cameraActive ? (
                  <div className="space-y-3 bg-slate-950 p-4 rounded-xl text-center">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full max-h-56 object-cover rounded-lg mx-auto bg-black"
                    />
                    <div className="flex justify-center gap-3">
                      <Button
                        type="button"
                        onClick={captureSnapshot}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5 h-9"
                      >
                        <Camera size={14} /> Capture Photo
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={stopCamera}
                        className="text-xs h-9"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : faceImagePreview ? (
                  <div className="flex items-center gap-4 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                    <img
                      src={faceImagePreview}
                      alt="Face Preview"
                      className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                    />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <CheckCircle2 size={13} className="text-emerald-500" /> Photo Selected
                      </p>
                      <p className="text-[11px] text-slate-500 truncate max-w-xs">{faceImageFile?.name || 'Captured snapshot'}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => { setFaceImageFile(null); setFaceImagePreview(null); }}
                      className="h-8 text-xs text-rose-600 hover:bg-rose-50"
                    >
                      <X size={14} /> Remove
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={startCamera}
                      className="h-14 flex flex-col items-center justify-center gap-1 border-dashed hover:border-blue-500 hover:bg-blue-50/50"
                    >
                      <Camera size={18} className="text-blue-600" />
                      <span className="text-xs font-medium">Take with Webcam</span>
                    </Button>
                    <label className="h-14 flex flex-col items-center justify-center gap-1 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-500 hover:bg-blue-50/50 cursor-pointer transition-colors">
                      <UploadCloud size={18} className="text-slate-500" />
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Upload Image File</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFaceFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* College ID Document */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  College ID Document * (Image or PDF)
                </label>

                {idDocumentPreview ? (
                  <div className="flex items-center gap-4 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                    {idDocumentPreview === 'pdf' ? (
                      <div className="w-14 h-14 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
                        <FileText size={24} />
                      </div>
                    ) : (
                      <img
                        src={idDocumentPreview}
                        alt="ID Document"
                        className="w-14 h-14 rounded-lg object-cover border border-slate-200"
                      />
                    )}
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <CheckCircle2 size={13} className="text-emerald-500" /> ID Document Uploaded
                      </p>
                      <p className="text-[11px] text-slate-500 truncate max-w-xs">{idDocumentFile?.name}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => { setIdDocumentFile(null); setIdDocumentPreview(null); }}
                      className="h-8 text-xs text-rose-600 hover:bg-rose-50"
                    >
                      <X size={14} /> Remove
                    </Button>
                  </div>
                ) : (
                  <label className="h-16 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-500 hover:bg-blue-50/50 cursor-pointer transition-colors p-3">
                    <UploadCloud size={20} className="text-blue-600" />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Click to upload College ID card (JPG, PNG, or PDF)
                    </span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleIdFileChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Submit */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Submitting Application...
                    </>
                  ) : (
                    <>
                      Submit Application for Verification <ArrowRight size={16} />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default StudentSetupPage;
