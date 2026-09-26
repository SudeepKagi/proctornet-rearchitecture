/**
 * @file VerificationPendingPage.jsx
 * @description Informs candidate/faculty that their submitted onboarding profile is pending administrative approval.
 * Redesigned with shadcn/ui.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as onboardingApi from '../../api/onboardingApi.js';
import { Clock, RefreshCw, LogOut } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';

export function VerificationPendingPage() {
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuth();
  const [checking, setChecking] = useState(false);
  const [statusData, setStatusData] = useState(null);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const data = await onboardingApi.getOnboardingStatus();
      setStatusData(data);
      if (data.verificationStatus === 'VERIFIED') {
        if (refreshUser) {
          await refreshUser();
        }
        if (user?.roles?.includes('FACULTY')) {
          navigate('/faculty', { replace: true });
        } else {
          navigate('/candidate', { replace: true });
        }
      } else if (data.verificationStatus === 'REJECTED') {
        navigate('/onboarding/rejected', { replace: true });
      }
    } catch {
      // Ignore poll error
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 transition-colors">
      <div className="w-full max-w-md space-y-4">
        <Card className="shadow-lg border-slate-200/90 dark:border-slate-800 dark:bg-slate-900 text-center">
          <CardHeader className="space-y-2 pb-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40 shadow-xs">
              <Clock className="h-7 w-7 animate-pulse" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Identity Verification Pending
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
              Your profile has been submitted and is awaiting administrative approval from your institution.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {statusData && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3.5 text-xs text-left space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Review Status:</span>
                  <Badge variant="warning">Under Review</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Department:</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{statusData.facultyProfile?.department || statusData.studentProfile?.department || statusData.department || '—'}</span>
                </div>
                {(statusData.studentProfile?.enrollmentNumber) && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Student ID / USN:</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{statusData.studentProfile.enrollmentNumber}</span>
                  </div>
                )}
                {(statusData.facultyProfile?.employeeId || (user?.roles?.includes('FACULTY') && statusData.identifier)) && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Faculty / Employee ID:</span>
                    <span className="font-semibold font-mono text-slate-900 dark:text-slate-100">{statusData.facultyProfile?.employeeId || statusData.identifier}</span>
                  </div>
                )}
                {(statusData.studentProfile?.semester || statusData.semester) && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Semester:</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">Semester {statusData.studentProfile?.semester || statusData.semester}</span>
                  </div>
                )}
                {(statusData.facultyProfile?.designation || statusData.designation) && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Designation:</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{statusData.facultyProfile?.designation || statusData.designation}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-2 pt-0">
            <Button
              type="button"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium"
              disabled={checking}
              onClick={checkStatus}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking Status...' : 'Check Status Now'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full border-slate-200 dark:border-slate-800"
              onClick={logout}
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              Sign Out
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default VerificationPendingPage;
