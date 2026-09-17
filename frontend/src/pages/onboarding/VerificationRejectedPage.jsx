/**
 * @file VerificationRejectedPage.jsx
 * @description Informs candidate/faculty that their onboarding profile was rejected with review notes, allowing correction and resubmission.
 * Redesigned with shadcn/ui.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as onboardingApi from '../../api/onboardingApi.js';
import { AlertTriangle, LogOut, ArrowRight, UploadCloud } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';
import { Spinner } from '../../components/ui/spinner.jsx';

export function VerificationRejectedPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState(null);

  useEffect(() => {
    async function loadStatus() {
      try {
        const data = await onboardingApi.getOnboardingStatus();
        setStatusData(data);
        if (data.verificationStatus === 'VERIFIED') {
          if (user?.roles?.includes('FACULTY')) {
            navigate('/faculty', { replace: true });
          } else {
            navigate('/candidate', { replace: true });
          }
        } else if (data.verificationStatus === 'PENDING') {
          navigate('/onboarding/pending', { replace: true });
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    }
    loadStatus();
  }, [navigate, user]);

  const handleResubmit = () => {
    if (user?.roles?.includes('FACULTY')) {
      navigate('/onboarding/faculty');
    } else {
      navigate('/onboarding/student');
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
        <Card className="shadow-lg border-slate-200/90 dark:border-slate-800 dark:bg-slate-900 text-center">
          <CardHeader className="space-y-2 pb-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 shadow-xs">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Verification Needs Attention
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
              Your institutional profile or uploaded documentation could not be verified by the administrator.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Alert variant="destructive" className="text-left py-3">
              <div className="font-semibold text-xs mb-1">Administrator Review Notes:</div>
              <AlertDescription className="text-xs leading-relaxed">
                {statusData?.verificationNotes ||
                  'The uploaded documentation or department details did not match official university records. Please review and resubmit.'}
              </AlertDescription>
            </Alert>
          </CardContent>

          <CardFooter className="flex flex-col gap-2 pt-0">
            <Button
              type="button"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium"
              onClick={handleResubmit}
            >
              <span>Update Profile & Resubmit</span>
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>

            {user?.roles?.includes('STUDENT') && (
              <Button
                type="button"
                variant="outline"
                className="w-full border-slate-200 dark:border-slate-800"
                onClick={() => navigate('/onboarding/document-upload')}
              >
                <UploadCloud className="h-4 w-4 mr-1.5" />
                Upload New Document
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              className="w-full text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
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

export default VerificationRejectedPage;
