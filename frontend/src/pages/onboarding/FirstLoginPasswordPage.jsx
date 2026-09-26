/**
 * @file FirstLoginPasswordPage.jsx
 * @description Mandatory first-login password change page built with shadcn/ui.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as onboardingApi from '../../api/onboardingApi.js';
import { resolvePostLoginDestination } from '../../routes/roleNavigation.js';
import { KeyRound, ShieldAlert, Check, X as XIcon, ArrowRight } from 'lucide-react';
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
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // If password was already updated (or user doesn't require password change), redirect to proper dashboard
  useEffect(() => {
    if (user && !user.mustChangePassword) {
      const destination = resolvePostLoginDestination(user);
      navigate(destination, { replace: true });
    }
  }, [user, navigate]);

  const rules = [
    { label: 'At least 12 characters', pass: newPassword.length >= 12 },
    { label: 'Uppercase & lowercase letters', pass: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) },
    { label: 'At least one number', pass: /\d/.test(newPassword) },
    { label: 'Special character (@$!%*?&)', pass: /[^A-Za-z0-9]/.test(newPassword) },
  ];

  const passedRules = rules.filter((r) => r.pass).length;
  const strengthLabels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Excellent'];
  const strengthColors = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-600'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 12) {
      setError('Password must be at least 12 characters in length');
      return;
    }

    setLoading(true);
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
      setError(err?.message || 'Failed to update temporary password');
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
              Your account was provisioned with a temporary password. Please establish a permanent, secure password to continue.
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
                  Current (Temporary) Password
                </label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter temporary password"
                  required
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  New Password
                </label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Create new password"
                  required
                />
              </div>

              {/* Password Strength Indicator */}
              {newPassword && (
                <div className="space-y-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Strength</span>
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
                  <div className="grid grid-cols-2 gap-1 pt-1 text-[11px]">
                    {rules.map((rule, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-1 ${
                          rule.pass
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {rule.pass ? <Check size={12} /> : <XIcon size={12} />}
                        <span>{rule.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1 text-left">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Confirm New Password
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                disabled={loading || passedRules < 2}
              >
                {loading ? 'Updating Credentials...' : 'Save & Continue'}
                {!loading && <ArrowRight className="h-4 w-4 ml-1" />}
              </Button>
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
