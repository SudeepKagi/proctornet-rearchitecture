/**
 * @file StudentOnboardingPage.jsx
 * @description Candidate academic onboarding form built with shadcn/ui.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as onboardingApi from '../../api/onboardingApi.js';
import { GraduationCap, ArrowRight, ShieldAlert } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Select, SelectOption } from '../../components/ui/select.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';
import { Spinner } from '../../components/ui/spinner.jsx';

export function StudentOnboardingPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [department, setDepartment] = useState('');
  const [semester, setSemester] = useState('1');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    async function loadStatus() {
      try {
        const data = await onboardingApi.getOnboardingStatus();
        if (data.department) setDepartment(data.department);
        if (data.semester) setSemester(String(data.semester));
        if (data.phone) setPhone(data.phone);

        if (data.verificationStatus === 'PENDING') {
          navigate('/onboarding/pending', { replace: true });
        } else if (data.verificationStatus === 'VERIFIED') {
          navigate('/candidate', { replace: true });
        }
      } catch (err) {
        setError(err?.message || 'Failed to load onboarding status');
      } finally {
        setLoading(false);
      }
    }
    loadStatus();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!department.trim()) {
      setError('Department is required');
      return;
    }

    const semNum = parseInt(semester, 10);
    if (isNaN(semNum) || semNum < 1 || semNum > 8) {
      setError('Semester must be between 1 and 8');
      return;
    }

    setSubmitting(true);
    try {
      await onboardingApi.submitOnboardingProfile({
        department: department.trim(),
        semester: semNum,
        phone: phone.trim() || undefined,
      });
      navigate('/onboarding/document-upload', { replace: true });
    } catch (err) {
      setError(err?.message || 'Failed to submit profile details');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 transition-colors">
      <div className="w-full max-w-md space-y-4">
        <Card className="shadow-lg border-slate-200/90 dark:border-slate-800 dark:bg-slate-900">
          <CardHeader className="text-center space-y-2 pb-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <GraduationCap className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Student Academic Profile
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
              Step 1 of 3: Provide your departmental affiliation and semester for examination enrollment.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive" className="py-2.5">
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1 text-left">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Academic Department <span className="text-rose-500">*</span>
                </label>
                <Input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Computer Science and Engineering"
                  required
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Current Semester <span className="text-rose-500">*</span>
                </label>
                <Select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  required
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <SelectOption key={s} value={String(s)}>
                      Semester {s}
                    </SelectOption>
                  ))}
                </Select>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Contact Phone Number (Optional)
                </label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                disabled={submitting}
              >
                {submitting ? 'Saving Profile...' : 'Next: Upload Identity Document'}
                {!submitting && <ArrowRight className="h-4 w-4 ml-1" />}
              </Button>
            </form>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => logout()}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default StudentOnboardingPage;
