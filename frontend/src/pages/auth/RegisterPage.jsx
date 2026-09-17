/**
 * @file RegisterPage.jsx
 * @description Institutional self-registration notice built with shadcn/ui.
 */

import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, ArrowLeft, Building2 } from 'lucide-react';
import { Button } from '../../components/ui/button.jsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/card.jsx';

export function RegisterPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 transition-colors">
      <div className="w-full max-w-md space-y-4">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Back to Sign In</span>
        </Link>

        <Card className="shadow-lg border-slate-200/90 dark:border-slate-800 dark:bg-slate-900 text-center">
          <CardHeader className="space-y-2 pb-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40">
              <Building2 className="h-7 w-7" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Institutional Provisioning Only
            </CardTitle>
            <CardDescription className="text-sm text-slate-500 dark:text-slate-400">
              In accordance with examination security protocol, accounts must be provisioned directly by your university administrator or academic office.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed border-t border-b border-slate-100 dark:border-slate-800 py-4 my-2">
            <p>
              If your department has already provisioned your account, please sign in with your institutional credentials to complete initial verification.
            </p>
          </CardContent>

          <CardFooter className="pt-2">
            <Button
              type="button"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium"
              onClick={() => navigate('/login')}
            >
              Proceed to Sign In
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default RegisterPage;
