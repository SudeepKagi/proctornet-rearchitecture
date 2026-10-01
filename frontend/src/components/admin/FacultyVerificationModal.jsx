/**
 * @file FacultyVerificationModal.jsx
 * @description Dedicated administrative modal for inspecting faculty appointment credentials
 * and executing authoritative verification decisions (Approve / Reject).
 */

import React, { useState, useEffect } from 'react';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  GraduationCap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Building2,
  Mail,
  User,
  Hash,
  Briefcase,
  Phone,
  Clock,
  ShieldCheck,
} from 'lucide-react';

export function FacultyVerificationModal({ user, isOpen, onClose, onReviewSuccess }) {
  const [reviewNotes, setReviewNotes] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setReviewNotes('');
      setShowRejectBox(false);
      setRejectReason('');
      setError(null);
    }
  }, [isOpen, user]);

  if (!user) return null;

  const employeeId =
    user.identifier ||
    user.employeeId ||
    user.facultyProfile?.employeeId ||
    '-';

  const department =
    user.department ||
    user.facultyProfile?.department ||
    'Unassigned Department';

  const designation =
    user.designation ||
    user.facultyProfile?.designation ||
    'Faculty Member';

  const handleApprove = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const notes = reviewNotes.trim() || 'Faculty appointment verified and privileges approved';
      await adminUsersApi.reviewVerification(user.userId, 'VERIFIED', notes);
      if (onReviewSuccess) onReviewSuccess();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to approve faculty verification');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setError('Rejection reason is mandatory.');
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      await adminUsersApi.reviewVerification(user.userId, 'REJECTED', rejectReason.trim());
      if (onReviewSuccess) onReviewSuccess();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to return faculty onboarding submission');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Faculty Appointment Verification
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Verify academic department affiliation and approve examination management privileges.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Verification Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Faculty Profile Card */}
        <div className="space-y-4 pt-1">
          <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3 text-xs">
            <div className="flex justify-between items-center pb-2.5 border-b border-border/60">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm text-foreground">{user.name}</span>
              </div>
              <Badge
                variant={user.verificationStatus === 'VERIFIED' ? 'default' : 'secondary'}
                className={
                  user.verificationStatus === 'PENDING'
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200 border-amber-300 dark:border-amber-800 font-semibold gap-1 inline-flex items-center'
                    : ''
                }
              >
                {user.verificationStatus === 'PENDING' && (
                  <Clock className="h-3 w-3 animate-pulse text-amber-600 dark:text-amber-400" />
                )}
                {user.verificationStatus}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground/70" />
                  Institutional Email
                </span>
                <span className="font-mono text-foreground font-medium truncate block" title={user.email}>
                  {user.email}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground/70" />
                  Faculty / Employee ID
                </span>
                <span className="font-mono font-semibold text-foreground bg-primary/10 text-primary px-2 py-0.5 rounded text-[11px] inline-block">
                  {employeeId}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground/70" />
                  Academic Department
                </span>
                <span className="font-semibold text-foreground block">
                  {department}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                  <Briefcase className="h-3.5 w-3.5 text-muted-foreground/70" />
                  Designation
                </span>
                <Badge variant="outline" className="text-foreground font-medium">
                  {designation}
                </Badge>
              </div>

              {user.phone && (
                <div className="space-y-1 col-span-2">
                  <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground/70" />
                    Contact Phone
                  </span>
                  <span className="font-mono text-foreground">
                    {user.phone}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Verification Decision Panel */}
          <div className="border-t border-border/80 pt-3 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Administrative Verification Decision
            </div>

            {!showRejectBox ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Verification Notes (Optional)
                  </label>
                  <Input
                    placeholder="e.g. Verified appointment against department faculty roster."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    disabled={actionLoading}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <Button
                    type="button"
                    variant="default"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center gap-1.5"
                    onClick={handleApprove}
                    disabled={actionLoading}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-0.5" />
                    {actionLoading ? 'Approving...' : 'Approve Faculty'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 flex items-center justify-center gap-1.5"
                    onClick={() => setShowRejectBox(true)}
                    disabled={actionLoading}
                  >
                    <XCircle className="h-4 w-4 mr-0.5" />
                    Reject...
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 space-y-2.5">
                <label className="block text-xs font-semibold text-destructive">
                  Mandatory Rejection Reason *
                </label>
                <Input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Employee ID does not match registrar records."
                  disabled={actionLoading}
                  className="h-9 text-xs"
                  autoFocus
                />
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1 text-xs font-semibold"
                    onClick={handleReject}
                    disabled={actionLoading || !rejectReason.trim()}
                  >
                    {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setShowRejectBox(false)}
                    disabled={actionLoading}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={actionLoading}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
