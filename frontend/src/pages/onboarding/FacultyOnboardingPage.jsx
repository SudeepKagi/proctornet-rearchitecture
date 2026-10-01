/**
 * @file FacultyOnboardingPage.jsx
 * @description Teacher onboarding form with canonical branch dropdown and designation dropdown.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as onboardingApi from '../../api/onboardingApi.js';
import * as studentApi from '../../api/studentApi.js';
import { GraduationCap, ArrowRight, LogOut } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Select, SelectOption } from '../../components/ui/select.jsx';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';

const DESIGNATIONS = [
  'Professor',
  'Associate Professor',
  'Assistant Professor',
  'Lecturer',
  'Teaching Assistant',
  'Visiting Faculty'
];

export function FacultyOnboardingPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [departments, setDepartments] = useState([]);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [status, depts] = await Promise.all([
        onboardingApi.getOnboardingStatus(),
        studentApi.getDepartments().catch(() => [])
      ]);

      const deptList = Array.isArray(depts) ? depts : [];
      setDepartments(deptList);

      if (status.departmentId) {
        setSelectedDeptId(status.departmentId);
      } else if (status.department && deptList.length > 0) {
        const match = deptList.find(d => d.name === status.department || d.code === status.department);
        if (match) setSelectedDeptId(match.department_id);
      }

      if (status.designation) setDesignation(status.designation);
      if (status.phone) setPhone(status.phone);

      if (status.verificationStatus === 'PENDING') {
        navigate('/onboarding/pending', { replace: true });
      } else if (status.verificationStatus === 'VERIFIED') {
        navigate('/faculty', { replace: true });
      }
    } catch (err) {
      setError(err?.data || err?.message || 'Failed to load teacher setup details');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!selectedDeptId) {
      setError('Please select your academic branch');
      return;
    }

    if (!designation) {
      setError('Please select your designation');
      return;
    }

    const matchedDept = departments.find(d => d.department_id === selectedDeptId);

    setSubmitting(true);
    try {
      await onboardingApi.submitOnboardingProfile({
        departmentId: selectedDeptId,
        department: matchedDept ? matchedDept.name : undefined,
        designation: designation,
        phone: phone.trim() || undefined,
      });
      navigate('/onboarding/pending', { replace: true });
    } catch (err) {
      setError(err?.data || err?.message || 'Failed to submit profile details');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 transition-colors">
      <div className="w-full max-w-md space-y-4">
        <StateBoundary
          loading={loading}
          error={error}
          onRetry={loadData}
          loadingMessage="Loading teacher profile setup..."
        >
          <Card className="shadow-lg border-slate-200/90 dark:border-slate-800 dark:bg-slate-900">
            <CardHeader className="text-center space-y-2 pb-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
                <GraduationCap className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Teacher Profile Setup
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                Select your academic branch and designation to complete your account setup.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1 text-left">
                  <label htmlFor="teacher-branch" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Academic Branch <span className="text-rose-500">*</span>
                  </label>
                  <Select
                    id="teacher-branch"
                    value={selectedDeptId}
                    onChange={(e) => setSelectedDeptId(e.target.value)}
                    required
                  >
                    <SelectOption value="" disabled>
                      Select your branch
                    </SelectOption>
                    {departments.map((dept) => (
                      <SelectOption key={dept.department_id} value={dept.department_id}>
                        {dept.name} ({dept.code})
                      </SelectOption>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1 text-left">
                  <label htmlFor="teacher-designation" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Designation <span className="text-rose-500">*</span>
                  </label>
                  <Select
                    id="teacher-designation"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    required
                  >
                    <SelectOption value="" disabled>
                      Select your designation
                    </SelectOption>
                    {DESIGNATIONS.map((desig) => (
                      <SelectOption key={desig} value={desig}>
                        {desig}
                      </SelectOption>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1 text-left">
                  <label htmlFor="teacher-phone" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Phone Number (Optional)
                  </label>
                  <Input
                    id="teacher-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  disabled={submitting}
                >
                  {submitting ? 'Submitting Details...' : 'Complete Profile'}
                  {!submitting && <ArrowRight className="h-4 w-4 ml-1" />}
                </Button>
              </form>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => logout()}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </CardContent>
          </Card>
        </StateBoundary>
      </div>
    </div>
  );
}

export default FacultyOnboardingPage;
