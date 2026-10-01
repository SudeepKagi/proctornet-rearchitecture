import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Phone,
  Building2,
  GraduationCap,
  ShieldCheck,
  ShieldAlert,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Pencil,
  Hash,
  Camera,
  KeyRound,
  Lock,
  Clock,
  Eye,
  EyeOff,
  AlertTriangle
} from 'lucide-react';
import {
  getCandidateProfile,
  updateCandidateProfile,
  changePassword,
  reEnrollFacePhoto
} from '../../api/candidateIdentityApi.js';
import { getEnrollmentStatus } from '../../api/biometricsApi.js';
import { useAuth } from '../../hooks/useAuth.js';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';
import { Separator } from '../../components/ui/separator.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../../components/ui/dialog.jsx';
import FaceOvalGuide from '../../components/biometrics/FaceOvalGuide.jsx';
import LightingIndicator from '../../components/biometrics/LightingIndicator.jsx';

function Field({ label, value, icon: Icon, readOnlyBadge }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          {Icon && <Icon size={12} className="text-slate-400" />}
          {label}
        </span>
        {readOnlyBadge && (
          <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {readOnlyBadge}
          </span>
        )}
      </div>
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
        {value || <span className="text-slate-400 font-normal">Not provided</span>}
      </span>
    </div>
  );
}

const SEMESTERS = [
  { label: '1st Semester', value: 1 },
  { label: '2nd Semester', value: 2 },
  { label: '3rd Semester', value: 3 },
  { label: '4th Semester', value: 4 },
  { label: '5th Semester', value: 5 },
  { label: '6th Semester', value: 6 },
  { label: '7th Semester', value: 7 },
  { label: '8th Semester', value: 8 },
  { label: '1st Year', value: 9 },
  { label: '2nd Year', value: 10 },
  { label: '3rd Year', value: 11 },
  { label: '4th Year', value: 12 }
];

function semesterToLabel(num) {
  if (!num) return 'Not set';
  return SEMESTERS.find((s) => s.value === Number(num))?.label || `Semester ${num}`;
}

export function CandidateProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editable Profile Form (name, phone) + OCC versioning
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSavedSuccess, setProfileSavedSuccess] = useState(false);
  const [versionConflict, setVersionConflict] = useState(null);

  const [form, setForm] = useState({ name: '', phone: '' });
  const [initialForm, setInitialForm] = useState({ name: '', phone: '' });

  // Password Change Form
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Photo Re-enrollment Modal
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoSuccess, setPhotoSuccess] = useState('');
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    setVersionConflict(null);
    try {
      const [profileRes, enrollRes] = await Promise.all([
        getCandidateProfile(),
        getEnrollmentStatus().catch(() => null)
      ]);

      const raw = profileRes?.data?.profile || profileRes?.profile || profileRes?.data || profileRes;
      const p = (raw?.user_id || raw?.userId) ? raw : null;

      if (!p) {
        throw new Error('Unable to retrieve candidate profile records.');
      }

      const normalized = {
        ...p,
        userId: p.userId || p.user_id,
        enrollmentNumber: p.enrollmentNumber || p.enrollment_number,
        department: p.department || p.department_name,
        verificationStatus: p.verificationStatus || p.verification_status,
        enrolledFacePhotoUrl: p.face_photo_url || p.enrolledFacePhotoUrl || p.facePhotoUrl,
        photoReviewStatus: p.photo_review_status || p.photoReviewStatus || 'NONE'
      };

      setProfile(normalized);
      setEnrollment(enrollRes);

      const formData = {
        name: normalized.name || '',
        phone: normalized.phone || ''
      };
      setForm(formData);
      setInitialForm(formData);
    } catch (err) {
      setError(err?.data?.message || err?.message || 'Failed to load candidate profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Dirty tracking for profile edit
  const isProfileDirty =
    form.name.trim() !== initialForm.name.trim() ||
    (form.phone || '').trim() !== (initialForm.phone || '').trim();

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveProfile = async () => {
    if (!form.name.trim()) {
      setError('Full name cannot be empty');
      return;
    }

    setSavingProfile(true);
    setError('');
    setVersionConflict(null);

    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        expected_version: profile?.version || 1
      };

      const updated = await updateCandidateProfile(payload);
      setProfile((prev) => ({
        ...prev,
        ...updated,
        name: updated.name,
        phone: updated.phone,
        version: updated.version
      }));
      setInitialForm({
        name: updated.name || '',
        phone: updated.phone || ''
      });
      setProfileSavedSuccess(true);
      setEditingProfile(false);
      setTimeout(() => setProfileSavedSuccess(false), 4000);
    } catch (err) {
      const errCode = err?.data?.code || err?.code;
      if (errCode === 'VERSION_CONFLICT' || err?.status === 409 || err?.statusCode === 409) {
        setVersionConflict({
          message:
            err?.data?.message ||
            'Profile was updated concurrently in another session. Please reload to view the latest version.'
        });
      } else {
        setError(err?.data?.message || err?.message || 'Failed to update profile.');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  // Password change handling
  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!passwordForm.currentPassword) {
      setPasswordError('Current password is required');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters in length');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setPasswordSaving(true);
    try {
      await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });

      setPasswordSuccess('Password updated successfully. Other active sessions have been signed out.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPasswordSuccess(''), 5000);
    } catch (err) {
      const msg = err?.data?.message || err?.message || 'Failed to update password.';
      setPasswordError(msg);
    } finally {
      setPasswordSaving(false);
    }
  };

  // Camera capture lifecycle for Photo Re-enrollment
  const startCamera = async () => {
    try {
      setPhotoError('');
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
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch((err) => {
          console.warn('Camera stream play error:', err);
        });
      }
    } catch (err) {
      setPhotoError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : 'Unable to access your camera. Ensure no other application is using it.'
      );
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const openPhotoModal = () => {
    setPhotoError('');
    setPhotoSuccess('');
    setCapturedBlob(null);
    setPreviewUrl(null);
    setPhotoModalOpen(true);
    setTimeout(() => {
      startCamera();
    }, 100);
  };

  const closePhotoModal = () => {
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedBlob(null);
    setPreviewUrl(null);
    setPhotoModalOpen(false);
  };

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

  const handleRetakePhoto = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedBlob(null);
    setPreviewUrl(null);
    startCamera();
  };

  const handleSubmitReEnrollment = async () => {
    if (!capturedBlob) return;

    setPhotoProcessing(true);
    setPhotoError('');

    try {
      const res = await reEnrollFacePhoto(capturedBlob);
      setPhotoSuccess(
        'Photo submitted! Your updated photo is awaiting administrator approval before becoming your active reference.'
      );
      setProfile((prev) => ({
        ...prev,
        photoReviewStatus: 'PENDING'
      }));
      setTimeout(() => {
        closePhotoModal();
        loadProfile();
      }, 2000);
    } catch (err) {
      const code = err?.data?.code || err?.code;
      let msg = err?.data?.message || err?.message || 'Biometric re-enrollment failed.';
      if (code === 'ACTIVE_ATTEMPT_LOCK') {
        msg = 'Cannot update reference photo while an examination attempt is actively in progress.';
      } else if (code === 'UPCOMING_EXAM_LOCK') {
        msg = 'Cannot change reference photo within 24 hours of a scheduled examination session.';
      } else if (code === 'FACE_NOT_DETECTED') {
        msg = 'No face detected in photo. Please ensure good lighting and face the camera directly.';
      } else if (code === 'IMAGE_QUALITY_LOW') {
        msg = 'Image quality below minimum biometric threshold. Please improve room lighting.';
      }
      setPhotoError(msg);
    } finally {
      setPhotoProcessing(false);
    }
  };

  const isEnrolled = Boolean(enrollment?.isEnrolled || profile?.enrolledFacePhotoUrl);
  const verificationStatus = profile?.verificationStatus || user?.verificationStatus || 'PENDING';

  const verificationBadge = {
    VERIFIED: (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 dark:bg-emerald-950 dark:text-emerald-300">
        <CheckCircle2 size={12} /> Verified
      </Badge>
    ),
    PENDING_REVIEW: (
      <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1 bg-amber-50/50 dark:bg-amber-950/30">
        <Clock size={12} /> Pending Review
      </Badge>
    ),
    PENDING: (
      <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1 bg-amber-50/50 dark:bg-amber-950/30">
        <Clock size={12} /> Verification Pending
      </Badge>
    ),
    REJECTED: (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle size={12} /> Verification Rejected
      </Badge>
    )
  }[verificationStatus] || (
    <Badge variant="secondary" className="gap-1">
      <ShieldAlert size={12} /> Unverified
    </Badge>
  );

  return (
    <div className="space-y-6 pb-16 max-w-4xl mx-auto">
      {/* Page Title */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
          Candidate Portal
        </p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          Candidate Profile & Account
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your personal details, biometric reference photo, and account security.
        </p>
      </div>

      <StateBoundary
        isLoading={loading}
        error={error}
        isEmpty={!profile && !user}
        emptyTitle="Student Profile Not Found"
        emptyDescription="Unable to load your institutional profile information."
        onRetry={loadProfile}
      >
        {/* Success Alert */}
        {profileSavedSuccess && (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-800">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <AlertTitle className="text-emerald-800 dark:text-emerald-300 font-semibold">
              Profile updated successfully
            </AlertTitle>
            <AlertDescription className="text-xs text-emerald-700 dark:text-emerald-400">
              Your display name and phone number have been saved.
            </AlertDescription>
          </Alert>
        )}

        {/* 409 Version Conflict Alert */}
        {versionConflict && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:border-amber-700">
            <AlertTriangle size={16} className="text-amber-600" />
            <div className="flex-1">
              <AlertTitle className="font-semibold text-amber-900 dark:text-amber-200">
                Profile Concurrency Conflict
              </AlertTitle>
              <AlertDescription className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                {versionConflict.message}
              </AlertDescription>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-8 text-xs font-semibold border-amber-400 text-amber-900 hover:bg-amber-100 dark:hover:bg-amber-900"
                onClick={loadProfile}
              >
                <RefreshCw size={12} className="mr-1.5" /> Reload Latest Profile
              </Button>
            </div>
          </Alert>
        )}

        {/* 1. Header Profile Card with Biometric Reference Avatar */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              {/* Reference Face Avatar */}
              <div className="relative group shrink-0">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center shadow-inner">
                  {profile?.enrolledFacePhotoUrl ? (
                    <img
                      src={profile.enrolledFacePhotoUrl}
                      alt="Biometric Reference Face"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={40} className="text-slate-400" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={openPhotoModal}
                  aria-label="Update Reference Photo"
                  className="absolute bottom-0 right-0 p-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-md transition transform hover:scale-105 cursor-pointer"
                  title="Update Reference Face Photo"
                >
                  <Camera size={14} />
                </button>
              </div>

              {/* Identity & Status Overview */}
              <div className="flex-1 text-center sm:text-left space-y-1.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {profile?.name || user?.name || 'Candidate'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center sm:justify-start gap-1 mt-0.5">
                      <Mail size={12} /> {profile?.email || user?.email}
                    </p>
                  </div>
                  <div className="flex items-center justify-center sm:justify-end gap-2">
                    {verificationBadge}
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs text-slate-600 dark:text-slate-400">
                  <span className="flex items-center gap-1 font-medium bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md">
                    <Hash size={12} className="text-slate-400" />
                    Reg: {profile?.enrollmentNumber || 'Pending'}
                  </span>
                  <span className="flex items-center gap-1 font-medium bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md">
                    <GraduationCap size={12} className="text-slate-400" />
                    {semesterToLabel(profile?.semester)}
                  </span>
                  <span className="flex items-center gap-1 font-medium bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md">
                    <ShieldCheck size={12} className="text-slate-400" />
                    Profile Version: {profile?.version || 1}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Personal Information (Student-Editable: Display Name, Phone) */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <User size={15} className="text-blue-600" />
                Personal Information
              </CardTitle>
              <CardDescription className="text-xs">
                Candidate-editable contact and display preferences.
              </CardDescription>
            </div>
            {!editingProfile && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-400"
                onClick={() => setEditingProfile(true)}
              >
                <Pencil size={12} /> Edit Details
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {editingProfile ? (
              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <User size={12} /> Display Full Name
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleProfileChange}
                      placeholder="Your full legal name"
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Phone size={12} /> Phone Number
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={form.phone}
                      onChange={handleProfileChange}
                      placeholder="+91 9876543210"
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    onClick={handleSaveProfile}
                    disabled={!isProfileDirty || savingProfile || !form.name.trim()}
                    size="sm"
                    className="h-9 px-5 text-xs font-semibold gap-1.5"
                  >
                    {savingProfile ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Save size={13} />
                    )}
                    {savingProfile ? 'Saving…' : 'Save Changes'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={() => {
                      setForm(initialForm);
                      setEditingProfile(false);
                      setError('');
                    }}
                  >
                    Cancel
                  </Button>
                  {!isProfileDirty && (
                    <span className="text-xs text-slate-400 italic">No unsaved changes</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <Field label="Full Name" value={profile?.name} icon={User} />
                <Field label="Phone Number" value={profile?.phone} icon={Phone} />
                <Field
                  label="Institutional Email"
                  value={profile?.email}
                  icon={Mail}
                  readOnlyBadge="Institutional / Read-only"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Academic Affiliation & Accommodations (Admin-Controlled / Read-Only) */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Building2 size={15} className="text-slate-600 dark:text-slate-400" />
              Academic & Accommodations Profile
            </CardTitle>
            <CardDescription className="text-xs">
              Institutional records managed exclusively by university administration.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
              <Field
                label="Enrollment / Reg No."
                value={profile?.enrollmentNumber}
                icon={Hash}
                readOnlyBadge="Admin Locked"
              />
              <Field
                label="Academic Department"
                value={profile?.department}
                icon={Building2}
                readOnlyBadge="Admin Locked"
              />
              <Field
                label="Semester / Year"
                value={semesterToLabel(profile?.semester)}
                icon={GraduationCap}
                readOnlyBadge="Admin Locked"
              />
            </div>

            <Separator />

            {/* Approved Accommodations */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={12} className="text-slate-400" />
                Examination Accommodations
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                  <p className="text-[11px] font-medium text-slate-400">Time Allowance</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    {profile?.accommodations?.extraTimeMultiplier
                      ? `${profile.accommodations.extraTimeMultiplier}x standard time`
                      : 'Standard 1.0x'}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                  <p className="text-[11px] font-medium text-slate-400">Rest Breaks</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    {profile?.accommodations?.maxBreaksAllowed > 0
                      ? `${profile.accommodations.maxBreaksAllowed} breaks (${profile.accommodations.breakAllowanceMinutes}m)`
                      : 'No extra breaks'}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                  <p className="text-[11px] font-medium text-slate-400">Proctoring Strictness</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    {profile?.accommodations?.proctoringStrictness || 'STANDARD'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. Biometric Reference Photo Re-Enrollment CTA Card */}
        <Card
          className={`border-2 shadow-xs ${
            isEnrolled
              ? 'border-emerald-200 bg-emerald-50/20 dark:border-emerald-800/50 dark:bg-emerald-950/10'
              : 'border-amber-200 bg-amber-50/30 dark:border-amber-800/50 dark:bg-amber-950/10'
          }`}
        >
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                {isEnrolled ? (
                  <ShieldCheck size={16} className="text-emerald-600" />
                ) : (
                  <ShieldAlert size={16} className="text-amber-600" />
                )}
                Biometric Reference Identity Photo
              </CardTitle>
              <CardDescription className="text-xs">
                Your high-resolution facial reference used to verify candidate identity before examinations.
              </CardDescription>
            </div>
            <Button
              onClick={openPhotoModal}
              size="sm"
              variant={isEnrolled ? 'outline' : 'default'}
              className="h-8 text-xs font-semibold gap-1.5"
            >
              <Camera size={13} />
              {isEnrolled ? 'Update Photo' : 'Enroll Photo'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  isEnrolled
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                }`}
              >
                {isEnrolled ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              </div>
              <div className="space-y-0.5">
                <p
                  className={`text-sm font-semibold ${
                    isEnrolled
                      ? 'text-emerald-800 dark:text-emerald-300'
                      : 'text-amber-800 dark:text-amber-300'
                  }`}
                >
                  {isEnrolled ? 'Reference Photo Active on File' : 'Photo Setup Required'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isEnrolled
                    ? 'Your face template is registered for exam verification. You can re-enroll a fresh capture anytime before your 24-hour examination lockout.'
                    : 'You must capture a reference photo before you can access supervised exams. Requires live camera access.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 5. Account Security / Password Change */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <KeyRound size={15} className="text-slate-600 dark:text-slate-400" />
                Account Security & Password
              </CardTitle>
              <CardDescription className="text-xs">
                Update your login password and revoke previous active browser sessions.
              </CardDescription>
            </div>
            {!showPasswordSection && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-400"
                onClick={() => setShowPasswordSection(true)}
              >
                <Lock size={12} /> Change Password
              </Button>
            )}
          </CardHeader>
          {showPasswordSection && (
            <CardContent className="space-y-4 pt-1">
              {passwordSuccess && (
                <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50">
                  <CheckCircle2 size={15} className="text-emerald-600" />
                  <AlertTitle className="text-xs font-semibold">{passwordSuccess}</AlertTitle>
                </Alert>
              )}
              {passwordError && (
                <Alert variant="destructive">
                  <AlertCircle size={15} />
                  <AlertTitle className="text-xs font-semibold">{passwordError}</AlertTitle>
                </Alert>
              )}

              <form onSubmit={handleSavePassword} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        name="currentPassword"
                        value={passwordForm.currentPassword}
                        onChange={handlePasswordChange}
                        placeholder="••••••••"
                        className="w-full h-10 px-3 pr-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords(!showPasswords)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        tabIndex={-1}
                      >
                        {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      New Password
                    </label>
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      name="newPassword"
                      value={passwordForm.newPassword}
                      onChange={handlePasswordChange}
                      placeholder="Min. 8 characters"
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Confirm New Password
                    </label>
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      name="confirmPassword"
                      value={passwordForm.confirmPassword}
                      onChange={handlePasswordChange}
                      placeholder="Re-type new password"
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    type="submit"
                    disabled={passwordSaving}
                    size="sm"
                    className="h-9 px-5 text-xs font-semibold gap-1.5"
                  >
                    {passwordSaving ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Lock size={13} />
                    )}
                    {passwordSaving ? 'Updating Password…' : 'Update Password'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={() => {
                      setShowPasswordSection(false);
                      setPasswordError('');
                      setPasswordSuccess('');
                      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          )}
        </Card>
      </StateBoundary>

      {/* 6. Photo Re-Enrollment Modal Dialog */}
      <Dialog open={photoModalOpen} onOpenChange={closePhotoModal}>
        <DialogContent className="max-w-xl" onClose={closePhotoModal}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera size={18} className="text-blue-600" />
              Capture Reference Face Photo
            </DialogTitle>
            <DialogDescription className="text-xs">
              Live webcam capture is required. To protect exam integrity, any updated photo must be reviewed and approved by an administrator before it becomes your active verification photo.
            </DialogDescription>
          </DialogHeader>

          {photoError && (
            <Alert variant="destructive" className="mb-3">
              <AlertCircle size={15} />
              <AlertTitle className="text-xs font-semibold">{photoError}</AlertTitle>
            </Alert>
          )}

          {photoSuccess && (
            <Alert className="mb-3 border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50">
              <CheckCircle2 size={15} className="text-emerald-600" />
              <AlertTitle className="text-xs font-semibold">{photoSuccess}</AlertTitle>
            </Alert>
          )}

          <div className="relative aspect-4/3 w-full rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center border border-slate-800 shadow-inner">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Captured Snapshot Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover mirror"
                  style={{ transform: 'scaleX(-1)' }}
                />
                <FaceOvalGuide status={cameraActive ? 'ready' : 'aligning'} />
                <LightingIndicator videoRef={videoRef} active={cameraActive} />
              </>
            )}
          </div>

          <DialogFooter className="mt-4">
            {previewUrl ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetakePhoto}
                  disabled={photoProcessing}
                  className="text-xs font-semibold"
                >
                  Retake Photo
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmitReEnrollment}
                  disabled={photoProcessing}
                  className="text-xs font-semibold gap-1.5"
                >
                  {photoProcessing ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={13} />
                  )}
                  {photoProcessing ? 'Submitting Photo…' : 'Submit for Admin Review'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={closePhotoModal}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCapturePhoto}
                  disabled={!cameraActive}
                  className="text-xs font-semibold gap-1.5"
                >
                  <Camera size={13} />
                  Capture Photo
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CandidateProfilePage;
