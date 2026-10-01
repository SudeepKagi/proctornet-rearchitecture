/**
 * @file CreateUserPage.jsx
 * @description Administrative user provisioning page.
 * Creates an account with ONLY:
 * - Student: USN + email
 * - Teacher: Employee ID + email
 * Generates a temporary password and sends user to first-login profile setup.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  UserPlus,
  ArrowLeft,
  GraduationCap,
  Briefcase,
  KeyRound,
  Copy,
  Check,
  ShieldCheck,
  CheckCircle2,
  ShieldAlert
} from 'lucide-react';

export function CreateUserPage() {
  const navigate = useNavigate();

  const [role, setRole] = useState('STUDENT');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Success modal
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [createdData, setCreatedData] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanId = identifier.trim();

    if (!cleanEmail) {
      setError('Institutional email address is required');
      return;
    }

    if (!cleanId) {
      setError(
        role === 'STUDENT'
          ? 'University Seat Number (USN) is required'
          : 'Employee ID is required'
      );
      return;
    }

    setLoading(true);
    try {
      const res = await adminUsersApi.createSingleUser({
        email: cleanEmail,
        role,
        identifier: cleanId,
      });

      setCreatedData({
        user: res.user,
        temporaryPassword: res.temporaryPassword,
        role,
        identifier: cleanId,
      });
      setCopied(false);
      setSuccessModalOpen(true);
    } catch (err) {
      setError(err?.data || err?.message || 'Failed to create user account');
    } finally {
      setLoading(false);
    }
  };

  const copyPassword = () => {
    if (createdData?.temporaryPassword) {
      navigator.clipboard.writeText(createdData.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleModalClose = () => {
    setSuccessModalOpen(false);
    navigate('/admin/users');
  };

  const roleConfigs = [
    {
      id: 'STUDENT',
      label: 'Student',
      icon: GraduationCap,
      desc: 'USN + Email',
      idLabel: 'University Seat Number (USN) *',
      idPlaceholder: 'e.g. 1MS21CS042',
      idHelp: 'The student will enter their full name, branch, semester, face photo, and college ID upon first login.'
    },
    {
      id: 'FACULTY',
      label: 'Teacher',
      icon: Briefcase,
      desc: 'Employee ID + Email',
      idLabel: 'Teacher Employee ID *',
      idPlaceholder: 'e.g. EMP-CS-104',
      idHelp: 'The teacher will choose their designation and academic branch upon first login.'
    },
  ];

  const currentRoleConfig = roleConfigs.find((r) => r.id === role) || roleConfigs[0];

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          onClick={() => navigate('/admin/users')}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Accounts</span>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <UserPlus className="h-7 w-7 text-primary" />
          Create New Account
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Admin provisions student or teacher accounts with only their institutional email and identifier.
          The user will set up their password and profile information on their first login.
        </p>
      </div>

      {error && (
        <StateBoundary
          error={error}
          onRetry={handleSubmit}
        />
      )}

      <Card className="shadow-xs border-border/80">
        <form onSubmit={handleSubmit}>
          <CardContent className="p-6 space-y-6">
            {/* Role Selection: Restricted to Student / Teacher only */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Account Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                {roleConfigs.map((rc) => {
                  const Icon = rc.icon;
                  const isSelected = role === rc.id;
                  return (
                    <button
                      key={rc.id}
                      type="button"
                      onClick={() => {
                        setRole(rc.id);
                        setError(null);
                      }}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs ring-1 ring-primary'
                          : 'border-border/80 bg-background text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-6 w-6 mb-2" />
                      <span className="text-sm font-semibold">{rc.label}</span>
                      <span className="text-xs opacity-75 mt-0.5">{rc.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Identifier: USN for student, Employee ID for teacher */}
            <div className="space-y-1.5">
              <label htmlFor="user-identifier" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {currentRoleConfig.idLabel}
              </label>
              <Input
                id="user-identifier"
                required
                placeholder={currentRoleConfig.idPlaceholder}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="h-10 text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {currentRoleConfig.idHelp}
              </p>
            </div>

            {/* Institutional Email */}
            <div className="space-y-1.5">
              <label htmlFor="user-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Institutional Email Address *
              </label>
              <Input
                id="user-email"
                type="email"
                required
                placeholder={role === 'STUDENT' ? 'student@university.edu' : 'teacher@university.edu'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            {/* Lifecycle Rules Info Card */}
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3.5 space-y-2 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Account Setup Flow
              </div>
              <ul className="space-y-1 list-disc pl-5">
                <li>A secure temporary password will be generated automatically.</li>
                <li>On first login, the user is required to choose a new password.</li>
                <li>{role === 'STUDENT' ? 'The student then submits their name, branch, semester, face photo, and college ID.' : 'The teacher then selects their branch and designation.'}</li>
                <li>The account is reviewed by an administrator before exam access is granted.</li>
              </ul>
            </div>
          </CardContent>

          <CardFooter className="flex items-center justify-end gap-3 p-6 pt-0 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/admin/users')}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating Account...' : `Create ${currentRoleConfig.label} Account`}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Account Created Modal with Temporary Password */}
      <Dialog open={successModalOpen} onOpenChange={handleModalClose}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              Account Created Successfully
            </DialogTitle>
            <DialogDescription>
              The {createdData?.role === 'STUDENT' ? 'student' : 'teacher'} account has been created.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <Alert variant="default" className="border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <AlertTitle className="font-semibold">Temporary Credentials</AlertTitle>
              <AlertDescription className="text-xs">
                Copy and share this temporary password with the user. It will not be shown again.
              </AlertDescription>
            </Alert>

            <div className="p-4 rounded-lg border border-border bg-muted/40 space-y-2.5 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-border/50">
                <span className="text-muted-foreground uppercase font-semibold">Account Type</span>
                <span className="font-semibold text-foreground">{createdData?.role === 'STUDENT' ? 'Student' : 'Teacher'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/50">
                <span className="text-muted-foreground uppercase font-semibold">Identifier</span>
                <span className="font-mono font-semibold text-foreground">{createdData?.identifier}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/50">
                <span className="text-muted-foreground uppercase font-semibold">Email</span>
                <span className="font-mono text-foreground">{createdData?.user?.email}</span>
              </div>

              <div className="pt-2">
                <div className="text-muted-foreground uppercase font-semibold text-[11px] mb-1 flex items-center justify-between">
                  <span>Temporary Password</span>
                  <span className="text-emerald-600 font-medium">Valid for first login</span>
                </div>
                <div className="p-2.5 rounded bg-background border border-border font-mono text-lg font-bold tracking-wider text-primary text-center break-all select-all">
                  {createdData?.temporaryPassword}
                </div>
              </div>
            </div>

            <DialogFooter className="flex sm:justify-between items-center gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex items-center gap-2"
                onClick={copyPassword}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>Copy Password</span>
                  </>
                )}
              </Button>
              <Button type="button" onClick={handleModalClose}>
                Done & View Accounts
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
