/**
 * @file UserDetailPage.jsx
 * @description Administrative inspector for single user account: roles, profiles, security lifecycle, sessions, and audit actions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  User,
  ArrowLeft,
  KeyRound,
  Shield,
  Copy,
  Check,
  ShieldAlert,
  AlertCircle,
  Lock,
  Unlock,
  LogOut,
  Plus,
  Trash2,
  GraduationCap,
  Briefcase,
  Building,
  Info,
} from 'lucide-react';

export function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Status modal
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('ACTIVE');
  const [statusReason, setStatusReason] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState(null);

  // Password reset modal
  const [tempPasswordModalOpen, setTempPasswordModalOpen] = useState(false);
  const [newTempPassword, setNewTempPassword] = useState('');
  const [copied, setCopied] = useState(false);

  // Role addition modal
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [selectedRoleToAdd, setSelectedRoleToAdd] = useState('INVIGILATOR');
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleError, setRoleError] = useState(null);

  // Inline action notice
  const [actionNotice, setActionNotice] = useState(null);

  // Confirmation modal
  const [confirmModal, setConfirmModal] = useState(null);

  function showNotice(type, message) {
    setActionNotice({ type, message });
    setTimeout(() => setActionNotice(null), 5000);
  }

  function openConfirm(message, onConfirm) {
    setConfirmModal({ message, onConfirm });
  }

  const loadUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminUsersApi.fetchUserDetail(id);
      setUser(data);
    } catch (err) {
      setError(err?.message || 'Failed to load user details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    setStatusLoading(true);
    setStatusError(null);
    try {
      await adminUsersApi.updateUserStatus(id, newStatus, statusReason);
      setStatusModalOpen(false);
      showNotice('success', `Status updated to ${newStatus}.`);
      loadUser();
    } catch (err) {
      setStatusError(err?.message || 'Status update failed');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleResetPassword = async () => {
    openConfirm(
      "Reset this user's password? A new temporary password will be generated and existing sessions revoked.",
      async () => {
        try {
          const res = await adminUsersApi.resetUserPassword(id);
          setNewTempPassword(res.temporaryPassword);
          setCopied(false);
          setTempPasswordModalOpen(true);
          loadUser();
        } catch (err) {
          showNotice('error', `Password reset failed: ${err?.message}`);
        }
      }
    );
  };

  const handleUnlockUser = async () => {
    try {
      await adminUsersApi.unlockUser(id);
      showNotice('success', 'User account unlocked successfully.');
      loadUser();
    } catch (err) {
      showNotice('error', `Failed to unlock account: ${err?.message}`);
    }
  };

  const handleAddRole = async (e) => {
    e.preventDefault();
    setRoleLoading(true);
    setRoleError(null);
    try {
      await adminUsersApi.assignUserRole(id, selectedRoleToAdd);
      setRoleModalOpen(false);
      showNotice('success', `Role ${selectedRoleToAdd} assigned.`);
      loadUser();
    } catch (err) {
      setRoleError(err?.message || 'Failed to assign role');
    } finally {
      setRoleLoading(false);
    }
  };

  const handleRemoveRole = async (roleToRemove) => {
    openConfirm(`Remove role ${roleToRemove} from this user?`, async () => {
      try {
        await adminUsersApi.removeUserRole(id, roleToRemove);
        showNotice('success', `Role ${roleToRemove} removed.`);
        loadUser();
      } catch (err) {
        showNotice('error', `Failed to remove role: ${err?.message}`);
      }
    });
  };

  const handleRevokeSessions = async () => {
    openConfirm(
      `Revoke all active sessions for ${user?.name}? The user will be required to sign in again.`,
      async () => {
        try {
          await adminUsersApi.revokeUserSessions(id);
          showNotice('success', 'Active sessions revoked successfully.');
          loadUser();
        } catch (err) {
          showNotice('error', `Failed to revoke sessions: ${err?.message}`);
        }
      }
    );
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(newTempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-3 text-sm text-muted-foreground">Loading account inspector...</span>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-xl space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Account Load Error</AlertTitle>
          <AlertDescription>{error || 'User not found in directory'}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => navigate('/admin/users')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Return to User Roster
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
      {/* Action Notice */}
      {actionNotice && (
        <Alert
          variant={actionNotice.type === 'error' ? 'destructive' : 'default'}
          className={actionNotice.type === 'success' ? 'border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30' : ''}
        >
          <Info className="h-4 w-4" />
          <AlertTitle className="font-semibold capitalize">{actionNotice.type}</AlertTitle>
          <AlertDescription>{actionNotice.message}</AlertDescription>
        </Alert>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={Boolean(confirmModal)} onOpenChange={(open) => !open && setConfirmModal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Confirm Administrative Action
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-2 text-sm text-muted-foreground">
              {confirmModal?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmModal(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const fn = confirmModal?.onConfirm;
                setConfirmModal(null);
                if (fn) await fn();
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
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

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <User className="h-7 w-7 text-primary" />
              {user.name}
            </h1>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
              <span className="font-mono">{user.email}</span>
              <span>•</span>
              <span>ID: <code className="font-mono text-foreground font-medium">{user.userId}</code></span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setStatusModalOpen(true)}>
              Change Status
            </Button>
            <Button variant="outline" size="sm" onClick={handleResetPassword}>
              <KeyRound className="h-3.5 w-3.5 mr-1 text-amber-500" />
              Reset Password
            </Button>
            <Button variant="outline" size="sm" onClick={handleRevokeSessions}>
              <LogOut className="h-3.5 w-3.5 mr-1" />
              Revoke Sessions
            </Button>
            {user.lockedUntil && new Date(user.lockedUntil) > new Date() && (
              <Button variant="destructive" size="sm" onClick={handleUnlockUser}>
                <Unlock className="h-3.5 w-3.5 mr-1" />
                Unlock Account
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Account Details & Academic Profiles */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-xs border-border/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Account & Security Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-lg border border-border bg-muted/20">
                  <span className="text-muted-foreground block uppercase font-semibold mb-1">Account Status</span>
                  <Badge variant={user.status === 'ACTIVE' ? 'default' : 'destructive'}>
                    {user.status}
                  </Badge>
                  {user.statusReason && (
                    <div className="text-muted-foreground mt-1.5 text-[11px]">
                      Reason: {user.statusReason}
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-lg border border-border bg-muted/20">
                  <span className="text-muted-foreground block uppercase font-semibold mb-1">Verification</span>
                  <Badge variant={user.verificationStatus === 'VERIFIED' ? 'default' : 'secondary'}>
                    {user.verificationStatus}
                  </Badge>
                </div>

                <div className="p-3 rounded-lg border border-border bg-muted/20">
                  <span className="text-muted-foreground block uppercase font-semibold mb-1">First Login Password Change</span>
                  <strong className="text-foreground text-sm font-medium">
                    {user.mustChangePassword ? '⚠️ Pending Change' : '✓ Completed'}
                  </strong>
                </div>

                <div className="p-3 rounded-lg border border-border bg-muted/20">
                  <span className="text-muted-foreground block uppercase font-semibold mb-1">Active Sessions</span>
                  <strong className="text-foreground text-sm font-medium">
                    {user.activeSessionsCount || 0} active token(s)
                  </strong>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Academic Profile Details */}
          {(user.studentProfile || user.facultyProfile) && (
            <Card className="shadow-xs border-border/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Academic Affiliation Profile
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 rounded-lg border border-border bg-muted/20">
                    <span className="text-muted-foreground block uppercase font-semibold mb-1">
                      Identifier (USN / Emp ID)
                    </span>
                    <strong className="font-mono text-sm text-foreground">
                      {user.studentProfile?.enrollmentNumber || user.facultyProfile?.employeeId || '—'}
                    </strong>
                  </div>

                  <div className="p-3 rounded-lg border border-border bg-muted/20">
                    <span className="text-muted-foreground block uppercase font-semibold mb-1">
                      Department / School
                    </span>
                    <strong className="text-sm text-foreground">
                      {user.studentProfile?.department || user.facultyProfile?.department || 'Not submitted'}
                    </strong>
                  </div>

                  {user.studentProfile && (
                    <div className="p-3 rounded-lg border border-border bg-muted/20">
                      <span className="text-muted-foreground block uppercase font-semibold mb-1">
                        Current Semester
                      </span>
                      <strong className="text-sm text-foreground">
                        {user.studentProfile.semester ? `Semester ${user.studentProfile.semester}` : 'Not submitted'}
                      </strong>
                    </div>
                  )}

                  {user.facultyProfile && (
                    <div className="p-3 rounded-lg border border-border bg-muted/20">
                      <span className="text-muted-foreground block uppercase font-semibold mb-1">
                        Official Designation
                      </span>
                      <strong className="text-sm text-foreground">
                        {user.facultyProfile.designation || 'Not submitted'}
                      </strong>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Role Management Card */}
        <div>
          <Card className="shadow-xs border-border/80">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Assigned Roles
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRoleModalOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Role
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {(user.roles || []).map((r) => (
                  <div
                    key={r}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border/70 bg-muted/20 text-xs"
                  >
                    <span className="font-semibold text-foreground">{r}</span>
                    {user.roles.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                        onClick={() => handleRemoveRole(r)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] text-muted-foreground space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  Last-Admin Protection
                </div>
                <p>The platform prevents removal or deactivation of the sole active institutional administrator.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Change Status Modal */}
      <Dialog open={statusModalOpen} onOpenChange={setStatusModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Change Account Lifecycle Status</DialogTitle>
            <DialogDescription>
              Update account status and access privileges for <span className="font-semibold text-foreground">{user?.name}</span>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleStatusSubmit} className="space-y-4 pt-2">
            {statusError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{statusError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Target Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
                <option value="DISABLED">DISABLED</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="detail-status-reason" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Reason (Recorded in Audit Trail)
              </label>
              <Input
                id="detail-status-reason"
                required
                placeholder="e.g. Administrative policy check"
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setStatusModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={statusLoading}>
                {statusLoading ? 'Updating...' : 'Update Status'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Role Addition Modal */}
      <Dialog open={roleModalOpen} onOpenChange={setRoleModalOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Assign Role to User</DialogTitle>
            <DialogDescription>
              Authorize new institutional capabilities for <span className="font-semibold text-foreground">{user?.name}</span>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddRole} className="space-y-4 pt-2">
            {roleError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{roleError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Select Role
              </label>
              <select
                value={selectedRoleToAdd}
                onChange={(e) => setSelectedRoleToAdd(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="STUDENT">STUDENT</option>
                <option value="FACULTY">FACULTY</option>
                <option value="INVIGILATOR">INVIGILATOR</option>
                <option value="ADMIN">ADMIN</option>
                <option value="DEVELOPER">DEVELOPER</option>
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setRoleModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={roleLoading}>
                {roleLoading ? 'Assigning...' : 'Assign Role'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Temporary Password Modal */}
      <Dialog open={tempPasswordModalOpen} onOpenChange={setTempPasswordModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-amber-500" />
              New Temporary Password Generated
            </DialogTitle>
            <DialogDescription>
              Account: <span className="font-semibold text-foreground">{user?.email}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <Alert variant="default" className="border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <AlertTitle className="font-semibold">Action Required</AlertTitle>
              <AlertDescription className="text-xs">
                Deliver this temporary password to the user. They will be forced to change it upon next login.
              </AlertDescription>
            </Alert>

            <div className="p-4 rounded-lg border border-border bg-muted/40 text-center">
              <div className="font-mono text-xl font-bold tracking-wider text-primary break-all">
                {newTempPassword}
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
              <Button type="button" onClick={() => setTempPasswordModalOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
