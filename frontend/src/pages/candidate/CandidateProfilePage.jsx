import React, { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import { getCandidateProfile, updateCandidateProfile } from '../../api/candidateIdentityApi.js';
import { getEnrollmentStatus } from '../../api/biometricsApi.js';
import { useAuth } from '../../hooks/useAuth.js';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';
import { Separator } from '../../components/ui/separator.jsx';

function Field({ label, value, icon: Icon }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        {Icon && <Icon size={11} />}
        {label}
      </span>
      <span className="text-sm font-semibold text-slate-800">{value || <span className="text-slate-300 font-normal">Not set</span>}</span>
    </div>
  );
}

const DEPARTMENTS = [
  'Computer Science & Engineering',
  'Information Science & Engineering',
  'Electronics & Communication Engineering',
  'Electrical & Electronics Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Biotechnology',
  'Chemical Engineering',
  'Aerospace Engineering',
  'Artificial Intelligence & Machine Learning',
  'Data Science',
  'Cyber Security',
  'Master of Computer Applications (MCA)',
  'Master of Business Administration (MBA)',
  'Physics',
  'Mathematics',
  'Chemistry',
  'Other',
];

// semester label → backend integer value (1–12)
const SEMESTERS = [
  { label: '1st Semester', value: 1 },
  { label: '2nd Semester', value: 2 },
  { label: '3rd Semester', value: 3 },
  { label: '4th Semester', value: 4 },
  { label: '5th Semester', value: 5 },
  { label: '6th Semester', value: 6 },
  { label: '7th Semester', value: 7 },
  { label: '8th Semester', value: 8 },
  { label: '1st Year',     value: 9 },
  { label: '2nd Year',     value: 10 },
  { label: '3rd Year',     value: 11 },
  { label: '4th Year',     value: 12 },
];

/** Convert a raw backend semester number back to a display label */
function semesterToLabel(num) {
  return SEMESTERS.find(s => s.value === num)?.label || '';
}

/** Parse Zod / API error responses into a friendly string */
function parseApiError(err) {
  const msg = err?.message || '';
  // Try to parse Zod array errors: [{"code":"invalid_type","path":["field"],"message":"..."}]
  try {
    const parsed = JSON.parse(msg);
    if (Array.isArray(parsed)) {
      return parsed
        .map(e => {
          const field = Array.isArray(e.path) ? e.path.join('.') : '';
          const label = field === 'semester' ? 'Semester'
            : field === 'department' ? 'Department'
            : field === 'phone' ? 'Phone number'
            : field;
          return label ? `${label}: ${e.message}` : e.message;
        })
        .join(' · ');
    }
  } catch {/* not JSON, fall through */}
  return msg || 'An unexpected error occurred. Please try again.';
}

function SelectField({ label, name, value, onChange, options, placeholder, icon: Icon }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        {Icon && <Icon size={11} />}
        {label}
      </label>
      <div className="relative">
        <select
          name={name}
          value={value}
          onChange={onChange}
          className="w-full h-10 pl-3 pr-8 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none cursor-pointer"
        >
          <option value="">{placeholder || `Select ${label}`}</option>
          {options.map(opt => {
            const val = typeof opt === 'object' ? opt.value : opt;
            const lbl = typeof opt === 'object' ? opt.label : opt;
            return <option key={val} value={val}>{lbl}</option>;
          })}
        </select>
        <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
      </div>
    </div>
  );
}

function InputField({ label, name, value, onChange, type = 'text', placeholder, icon: Icon }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        {Icon && <Icon size={11} />}
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
      />
    </div>
  );
}

export function CandidateProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ department: '', semester: '', phone: '' });

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, enrollRes] = await Promise.all([
        getCandidateProfile().catch(() => null),
        getEnrollmentStatus().catch(() => null),
      ]);

      // apiClient returns the raw server JSON directly —
      // backend sends { userId, name, email, department, semester, ... } at the top level
      const p = profileRes?.userId
        ? profileRes
        : (profileRes?.data?.profile || profileRes?.profile || null);

      setProfile(p);
      setEnrollment(enrollRes);
      if (p) {
        setForm({
          department: p.department || '',
          // backend stores semester as integer 1-12; keep as number for the select
          semester: p.semester != null ? Number(p.semester) : '',
          phone: p.phone || '',
        });
      }
    } catch (err) {
      setError(err?.data || parseApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  function handleChange(e) {
    const { name, value } = e.target;
    // semester must be sent as an integer to the backend
    setForm(prev => ({ ...prev, [name]: name === 'semester' ? (value === '' ? '' : Number(value)) : value }));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      // Build the payload — only include fields that have a value
      const payload = {};
      if (form.department) payload.department = form.department;
      if (form.semester !== '') payload.semester = Number(form.semester);
      if (form.phone) payload.phone = form.phone;

      await updateCandidateProfile(payload);
      setSaved(true);
      setEditing(false);
      await loadProfile();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setSaving(false);
    }
  }

  const isEnrolled = Boolean(enrollment?.isEnrolled);
  const verificationStatus = profile?.verificationStatus || user?.verificationStatus || 'PENDING';

  const verificationBadge = {
    VERIFIED: <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1"><CheckCircle2 size={11} />Verified</Badge>,
    PENDING: <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1">Pending Review</Badge>,
    REJECTED: <Badge variant="destructive" className="gap-1">Rejected</Badge>,
  }[verificationStatus] || <Badge variant="secondary">Unknown</Badge>;

  return (
    <div className="space-y-6 pb-16 max-w-3xl">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Student Portal</p>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">My Profile</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your account details and identity verification.</p>
      </div>

      <StateBoundary
        isLoading={loading}
        error={error}
        isEmpty={!profile && !user}
        emptyTitle="Student Profile Not Found"
        emptyDescription="Unable to load your institutional profile information."
        onRetry={loadProfile}
      >
        {saved && (
          <Alert className="border-emerald-200 bg-emerald-50 mb-4">
            <CheckCircle2 size={15} className="text-emerald-600" />
            <AlertTitle className="text-emerald-700">Profile updated successfully.</AlertTitle>
          </Alert>
        )}

        {/* Account Info */}
        <Card className="border-slate-200 bg-white shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <User size={15} className="text-slate-500" />
              Account Information
            </CardTitle>
            <CardDescription className="text-xs">Basic details tied to your institution account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <Field label="Full Name" value={user?.name || profile?.name} icon={User} />
                <Field label="Email" value={user?.email || profile?.email} icon={Mail} />
                <Field label="User ID" value={user?.userId ? `#${user.userId.slice(0, 8).toUpperCase()}` : undefined} icon={Hash} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Account Status</span>
                  {verificationBadge}
                </div>
              </div>

              <Separator />

              {/* Editable Fields */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Academic Details</p>
                {!editing && (
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 text-xs gap-1.5 text-blue-600 hover:text-blue-700"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil size={12} /> Edit
                  </Button>
                )}
              </div>

              {editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SelectField
                      label="Department" name="department" value={form.department}
                      onChange={handleChange} icon={Building2}
                      options={DEPARTMENTS} placeholder="Select your department"
                    />
                    <SelectField
                      label="Semester / Year" name="semester" value={form.semester}
                      onChange={handleChange} icon={GraduationCap}
                      options={SEMESTERS} placeholder="Select semester / year"
                    />
                    <InputField
                      label="Phone Number" name="phone" value={form.phone} type="tel"
                      onChange={handleChange} placeholder="e.g. +91 9876543210" icon={Phone}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      onClick={handleSave}
                      disabled={saving}
                      size="sm"
                      className="h-9 px-5 text-sm gap-1.5"
                    >
                      {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                      {saving ? 'Saving…' : 'Save Changes'}
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="h-9 text-sm"
                      onClick={() => { setEditing(false); setError(''); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  <Field label="Department" value={profile?.department} icon={Building2} />
                  <Field label="Semester / Year" value={semesterToLabel(profile?.semester)} icon={GraduationCap} />
                  <Field label="Phone" value={profile?.phone} icon={Phone} />
                </div>
              )}
          </CardContent>
      </Card>

      {/* Identity Verification — only show the enrollment CTA if NOT done */}
      <Card className={`border-2 shadow-xs ${isEnrolled ? 'border-emerald-200 bg-emerald-50/30' : 'border-amber-200 bg-amber-50/30'}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            {isEnrolled
              ? <ShieldCheck size={15} className="text-emerald-600" />
              : <ShieldAlert size={15} className="text-amber-600" />
            }
            Biometric Identity Verification
          </CardTitle>
          <CardDescription className="text-xs">
            Required for proctored exam access. Face profile is used for automated liveness checks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEnrolled ? (
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-800">Face Profile Active</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Your reference facial embedding is active{enrollment?.modelVersion ? ` (Model ${enrollment.modelVersion})` : ''}. You are cleared for proctored exams.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-700 shrink-0">
                  <ShieldAlert size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Biometric Enrollment Required</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    A reference face capture is required before you can enter any proctored examination session. This is a one-time setup.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-amber-100 p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-600">What to expect:</p>
                <ul className="space-y-1 text-xs text-slate-500">
                  <li className="flex items-center gap-2"><CheckCircle2 size={11} className="text-emerald-500 shrink-0" />Allow camera access when prompted</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={11} className="text-emerald-500 shrink-0" />Ensure good lighting and face the camera directly</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={11} className="text-emerald-500 shrink-0" />Takes less than 2 minutes to complete</li>
                </ul>
              </div>

              <Button
                onClick={() => navigate('/candidate/enrollment')}
                className="w-full sm:w-auto h-10 px-6 font-semibold gap-2"
              >
                Complete Face Enrollment
                <ArrowRight size={14} />
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      </StateBoundary>
    </div>
  );
}
