/**
 * @file CreateUserPage.jsx
 * @description Administrative user provisioning page for individual Student, Faculty, Invigilator, or Admin accounts.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
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
  Eye,
  ShieldAlert,
  KeyRound,
  Copy,
  Check,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

export function CreateUserPage() {
  const navigate = useNavigate();

  const [role, setRole] = useState('STUDENT');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [phone, setPhone] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Success modal
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [createdData, setCreatedData] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (role === 'STUDENT' && !identifier.trim()) {
      setError('USN / Enrollment Number is required for students');
      return;
    }

    if (role === 'FACULTY' && !identifier.trim()) {
      setError('Employee / Faculty ID is required for faculty');
      return;
    }

    setLoading(true);
    try {
      const res = await adminUsersApi.createSingleUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        identifier: identifier.trim() || undefined,
        phone: phone.trim() || undefined,
      });

      setCreatedData({
        user: res.user,
        temporaryPassword: res.temporaryPassword,
      });
      setCopied(false);
      setSuccessModalOpen(true);
    } catch (err) {
      setError(err?.message || 'Failed to provision user');
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
    { id: 'STUDENT', label: 'Student', icon: GraduationCap, desc: 'Examinee / Candidate' },
    { id: 'FACULTY', label: 'Faculty', icon: Briefcase, desc: 'Author & Examiner' },
    { id: 'INVIGILATOR', label: 'Invigilator', icon: Eye, desc: 'Proctoring Sentinel' },
    { id: 'ADMIN', label: 'Admin', icon: ShieldCheck, desc: 'Institutional Ops' },
  ];

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
          <span>Back to User Roster</span>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <UserPlus className="h-7 w-7 text-primary" />
          Provision User Account
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create an institutional account. The user will complete verification and setup upon first login.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Provisioning Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="shadow-xs border-border/80">
        <form onSubmit={handleSubmit}>
          <CardContent className="p-6 space-y-5">
            {/* Role Selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Account Role
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {roleConfigs.map((rc) => {
                  const Icon = rc.icon;
                  const isSelected = role === rc.id;
                  return (
                    <button
                      key={rc.id}
                      type="button"
                      onClick={() => setRole(rc.id)}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-semibold shadow-xs'
                          : 'border-border/80 bg-background text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-5 w-5 mb-1.5" />
                      <span className="text-xs font-medium">{rc.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Full Name */}
            <div className="space-y-1.5">
              <label htmlFor="user-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Full Legal Name *
              </label>
              <Input
                id="user-name"
                required
                placeholder="e.g. Eleanor Vance"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 text-sm"
              />
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
                placeholder="e.g. evance@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            {/* Identifier (USN or Employee ID) */}
            {(role === 'STUDENT' || role === 'FACULTY') && (
              <div className="space-y-1.5">
                <label htmlFor="user-identifier" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {role === 'STUDENT' ? 'USN / Enrollment Number *' : 'Employee / Faculty ID *'}
                </label>
                <Input
                  id="user-identifier"
                  required
                  placeholder={role === 'STUDENT' ? 'e.g. 1MS21CS042' : 'e.g. FAC-CS-204'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="h-10 text-sm font-mono"
                />
              </div>
            )}

            {/* Phone Number */}
            <div className="space-y-1.5">
              <label htmlFor="user-phone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contact Phone (Optional)
              </label>
              <Input
                id="user-phone"
                type="tel"
                placeholder="+1 555-0199"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            {/* Lifecycle Rules Info Card */}
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3.5 space-y-2 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Automatic Lifecycle Initialization
              </div>
              <ul className="space-y-1 list-disc pl-5">
                <li>Account status activates immediately (<code>ACTIVE</code>)</li>
                <li>Institutional verification begins at <code>UNVERIFIED</code></li>
                <li>Mandatory password change enforced upon initial login</li>
                <li>Exam dashboards remain restricted until ID verification completes</li>
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
              {loading ? 'Provisioning...' : 'Create Account & Issue Credentials'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Account Created Modal */}
      <Dialog open={successModalOpen} onOpenChange={handleModalClose}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              Account Provisioned Successfully
            </DialogTitle>
            <DialogDescription>
              A new institutional account has been initialized in the directory.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <Alert variant="default" className="border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <AlertTitle className="font-semibold">Action Required</AlertTitle>
              <AlertDescription className="text-xs">
                Copy the temporary credentials below. Plaintext passwords are not persisted and cannot be recovered.
              </AlertDescription>
            </Alert>

            <div className="p-4 rounded-lg border border-border bg-muted/40 space-y-2.5 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-border/50">
                <span className="text-muted-foreground uppercase font-semibold">Name</span>
                <span className="font-semibold text-foreground">{createdData?.user?.name}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/50">
                <span className="text-muted-foreground uppercase font-semibold">Email</span>
                <span className="font-mono text-foreground">{createdData?.user?.email}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/50">
                <span className="text-muted-foreground uppercase font-semibold">Role</span>
                <span className="font-semibold text-primary">{createdData?.user?.roles?.[0]}</span>
              </div>

              <div className="pt-2">
                <div className="text-muted-foreground uppercase font-semibold text-[11px] mb-1">
                  Temporary Password
                </div>
                <div className="p-2.5 rounded bg-background border border-border font-mono text-lg font-bold tracking-wider text-primary text-center break-all">
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
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>Copy Password</span>
                  </>
                )}
              </Button>
              <Button type="button" onClick={handleModalClose}>
                Done & Return to List
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
