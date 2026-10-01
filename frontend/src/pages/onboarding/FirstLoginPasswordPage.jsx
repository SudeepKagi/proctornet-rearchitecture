/**
 * @file FirstLoginPasswordPage.jsx
 * @description Mandatory first-login password change page built with shadcn/ui.
 * Provides real-time interactive validation, live warnings during typing,
 * and guarded submission so no unhandled errors or full-page boundaries trigger upon clicking.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as onboardingApi from '../../api/onboardingApi.js';
import { resolvePostLoginDestination } from '../../routes/roleNavigation.js';
import {
  KeyRound,
  Check,
  CheckCircle2,
  X as XIcon,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';

export function FirstLoginPasswordPage() {
  const navigate = useNavigate();
  const { user, setUser, refreshUser, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [apiError, setApiError] = useState(null);
  const [loading, setLoading] = useState(false);

  // If password was already updated (or user doesn't require password change), redirect to proper dashboard
  useEffect(() => {
    if (user && !user.mustChangePassword) {
      const destination = resolvePostLoginDestination(user);
      navigate(destination, { replace: true });
    }
  }, [user, navigate]);

  // Clear API errors whenever any input changes
  useEffect(() => {
    if (apiError) setApiError(null);
  }, [currentPassword, newPassword, confirmPassword]);

  // Live security validation rules
  const rules = useMemo(() => [
    {
      id: 'length',
      label: 'At least 12 characters',
      pass: newPassword.length >= 12,
      detail: newPassword.length > 0 ? `${newPassword.length}/12` : 'min 12'
    },
    {
      id: 'case',
      label: 'Uppercase & lowercase letters',
      pass: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)
    },
    {
      id: 'number',
      label: 'At least one number (0-9)',
      pass: /\d/.test(newPassword)
    },
    {
      id: 'special',
      label: 'Special character (@$!%*?&#)',
      pass: /[^A-Za-z0-9]/.test(newPassword)
    },
  ], [newPassword]);

  const passedRules = rules.filter((r) => r.pass).length;
  const isLengthValid = newPassword.length >= 12;
  const isAllRulesPassed = passedRules === rules.length;
  const isMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const isMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const isSameAsCurrent = currentPassword.length > 0 && newPassword.length > 0 && currentPassword === newPassword;

  // Fully validated state required to enable the submit button
  const isFormValid =
    currentPassword.trim().length > 0 &&
    isAllRulesPassed &&
    isMatch &&
    !isSameAsCurrent;

  const strengthLabels = ['Too weak', 'Weak', 'Fair', 'Strong', 'Excellent'];
  const strengthColors = [
    'bg-slate-300 dark:bg-slate-700',
    'bg-rose-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-emerald-500'
  ];

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (loading) return;

    // Guard against premature or invalid submission
    if (!currentPassword.trim()) {
      setApiError('Please enter your current temporary password.');
      return;
    }
    if (!isLengthValid) {
      setApiError('Password must be at least 12 characters in length.');
      return;
    }
    if (!isAllRulesPassed) {
      setApiError('Please meet all password complexity requirements.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setApiError('New passwords do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      setApiError('New password must differ from your current temporary password.');
      return;
    }

    setLoading(true);
    setApiError(null);

    try {
      await onboardingApi.changeFirstLoginPassword(currentPassword, newPassword);
      // Immediately refresh authoritative user in context
      const refreshedUser = await refreshUser();
      const targetUser = refreshedUser || (user ? { ...user, mustChangePassword: false } : null);
      if (targetUser) {
        setUser(targetUser);
      }
      const destination = resolvePostLoginDestination(targetUser);
      navigate(destination, { replace: true });
    } catch (err) {
      setApiError(err?.data?.message || err?.message || 'Failed to update temporary password. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 transition-colors">
      <div className="w-full max-w-md space-y-4">
        <Card className="shadow-lg border-slate-200/90 dark:border-slate-800 dark:bg-slate-900">
          <CardHeader className="text-center space-y-2 pb-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <KeyRound className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Set New Password
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
              Your account was provisioned with a temporary password. Establish a permanent, secure password to continue.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Server-side or submission error alert */}
            {apiError && (
              <Alert variant="destructive" className="py-2.5">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs font-medium">
                  {apiError}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Current Temporary Password */}
              <div className="space-y-1 text-left">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Current (Temporary) Password
                </label>
                <div className="relative">
                  <Input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter temporary password"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none"
                    aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                  >
                    {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-1 text-left">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  New Password
                </label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Create new password (min. 12 chars)"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none"
                    aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Real-time warning during password adding: Length Requirement */}
                {newPassword.length > 0 && !isLengthValid && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium pt-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>Password must be at least 12 characters in length ({newPassword.length}/12)</span>
                  </div>
                )}

                {/* Real-time warning during password adding: Cannot match temporary password */}
                {isSameAsCurrent && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium pt-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>New password cannot be the same as your current temporary password</span>
                  </div>
                )}
              </div>

              {/* Real-time Password Strength Meter */}
              {newPassword.length > 0 && (
                <div className="space-y-1.5 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Password Strength</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {strengthLabels[passedRules]}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 h-1.5">
                    {[0, 1, 2, 3].map((idx) => (
                      <div
                        key={idx}
                        className={`rounded-full transition-colors ${
                          idx < passedRules ? strengthColors[passedRules] : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Live Password Requirements Checklist */}
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <span>Security Criteria</span>
                  <span className="text-[10px] lowercase font-normal">
                    {passedRules} of {rules.length} met
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`flex items-center gap-1.5 transition-colors ${
                        rule.pass
                          ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                          : newPassword.length > 0
                          ? 'text-slate-500 dark:text-slate-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {rule.pass ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <XIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      )}
                      <span>{rule.label}</span>
                      {rule.detail && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto">
                          {rule.detail}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Confirm New Password */}
              <div className="space-y-1 text-left">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-type new password"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Real-time warning during confirmation typing */}
                {isMismatch && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-medium pt-1">
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>Passwords do not match</span>
                  </div>
                )}
                {isMatch && isLengthValid && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium pt-1">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Passwords match</span>
                  </div>
                )}
              </div>

              {/* Submit Button guarded: disabled until all validation passes */}
              <Button
                type="submit"
                className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                disabled={loading || !isFormValid}
              >
                {loading ? 'Updating Credentials...' : 'Reset & Save Password'}
                {!loading && <ArrowRight className="h-4 w-4 ml-1.5" />}
              </Button>

              {/* Helper text when button is disabled */}
              {!isFormValid && (newPassword.length > 0 || confirmPassword.length > 0) && (
                <p className="text-[11px] text-center text-slate-500 dark:text-slate-400">
                  {!isLengthValid
                    ? 'Password must have at least 12 characters to continue'
                    : !isAllRulesPassed
                    ? 'Please fulfill all password security criteria above'
                    : isMismatch
                    ? 'Passwords do not match'
                    : isSameAsCurrent
                    ? 'New password cannot match temporary password'
                    : !currentPassword.trim()
                    ? 'Enter your current temporary password'
                    : 'Complete requirements to enable password update'}
                </p>
              )}
            </form>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => logout()}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
              >
                Sign out and return later
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default FirstLoginPasswordPage;
