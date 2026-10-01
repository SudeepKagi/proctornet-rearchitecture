/**
 * @file LoginPage.jsx
 * @description Modern, accessible academic authentication portal for ProctorNet built with shadcn/ui.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { resolvePostLoginDestination } from '../../routes/roleNavigation.js';
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { useToast } from '../../components/ui/toast.jsx';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, user: currentUser, isAuthenticated, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  usePageMeta({
    title: 'Login',
    description: 'Sign in to your ProctorNet academic examination account.',
    canonical: '/login',
  });

  useEffect(() => {
    if (!authLoading && isAuthenticated && currentUser) {
      const destination = resolvePostLoginDestination(currentUser, location.state?.from?.pathname);
      navigate(destination, { replace: true, state: null });
    }
  }, [authLoading, isAuthenticated, currentUser, navigate, location.state]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <StateBoundary loading={true} loadingMessage="Verifying academic session..." />
      </div>
    );
  }

  const formatErrorMessage = (rawError) => {
    if (!rawError) return 'Unable to sign in. Please check your credentials and try again.';
    const str = String(rawError);
    if (
      str.toLowerCase().includes('sql') ||
      str.toLowerCase().includes('connect') ||
      str.toLowerCase().includes('socket') ||
      str.toLowerCase().includes('database') ||
      str.toLowerCase().includes('internal') ||
      str.includes('500') ||
      str.includes('ECONNREFUSED')
    ) {
      return 'Unable to sign in. Please check your credentials and try again.';
    }
    return str;
  };

  async function handleSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your institutional email address or username.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      const data = await login({ email: trimmedEmail, password });
      const user = data.user;
      const destination = resolvePostLoginDestination(user, location.state?.from?.pathname);
      navigate(destination, { replace: true, state: null });
    } catch (err) {
      const message = formatErrorMessage(err?.message);
      setError(message);
      toast({ variant: 'error', title: 'Authentication Failed', description: message });
    } finally {
      setLoading(false);
    }
  }

  const fillDemo = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError('');
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 transition-colors">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-between items-center px-1">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Return to Home</span>
          </Link>
          <Badge variant="secondary" className="text-[11px] font-medium">
            Academic Platform
          </Badge>
        </div>

        <Card className="shadow-lg border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardHeader className="text-center space-y-2 pb-4 pt-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Sign In to ProctorNet
            </CardTitle>
            <CardDescription className="text-sm text-slate-500 dark:text-slate-400">
              Enter your institutional credentials to access your portal.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 px-6 pb-6">
            {error && (
              <Alert variant="destructive" className="py-2.5">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5 text-left">
                <label
                  htmlFor="login-email"
                  className="text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Email or Username
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@proctornet.edu"
                    required
                    autoComplete="username"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5 text-left">
                <div className="flex justify-between items-center">
                  <label
                    htmlFor="login-password"
                    className="text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Password
                  </label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    autoComplete="current-password"
                    className="pl-9 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium cursor-pointer"
                disabled={loading}
              >
                {loading ? 'Authenticating...' : 'Sign In'}
                {!loading && <ArrowRight className="h-4 w-4 ml-1" />}
              </Button>
            </form>

            {/* Quick Demo Credentials */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Sparkles size={13} className="text-amber-500" />
                  <span>Quick-Fill Evaluation Accounts</span>
                </div>
                <span className="text-[10px] text-slate-400">Click to fill</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Admin', email: 'admin@proctornet.edu', pass: 'Admin#2026_SecureExams!' },
                  { label: 'Developer', email: 'developer@proctornet.edu', pass: 'Dev#2026_SecureExams!' },
                ].map((demo) => (
                  <Button
                    key={demo.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fillDemo(demo.email, demo.pass)}
                    className="text-xs h-8 py-1 px-2 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium cursor-pointer justify-center truncate"
                    title={`Click to fill ${demo.email}`}
                  >
                    {demo.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-xs text-slate-500 dark:text-slate-400">
          Need an institutional account?{' '}
          <Link to="/register" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
            Institutional Provisioning Policy
          </Link>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
