/**
 * @file StudentVerificationDetailModal.jsx
 * @description Administrative modal for inspecting candidate identity verification dossier,
 * previewing private S3 document via short-lived URL, and executing approval/rejection decisions.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  FileCheck,
  CheckCircle2,
  XCircle,
  Lock,
  Sliders,
  AlertCircle,
  FileText,
  ShieldCheck,
  Clock,
} from 'lucide-react';

export function StudentVerificationDetailModal({ studentId, isOpen, onClose, onReviewSuccess }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dossier, setDossier] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Rejection dialog state
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (!isOpen || !studentId) return;

    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setError(null);
      setShowRejectBox(false);
      setRejectReason('');

      try {
        const dossierData = await adminUsersApi.fetchStudentVerificationDossier(studentId);
        let previewData = null;
        const hasDoc = Boolean(
          dossierData?.idDocumentUrl ||
          dossierData?.profile?.idDocumentUrl ||
          dossierData?.student?.idDocumentUrl ||
          dossierData?.document?.s3Key ||
          dossierData?.hasDocument
        );

        if (hasDoc) {
          previewData = await adminUsersApi.fetchStudentDocumentPreview(studentId).catch(() => null);
        }

        if (isMounted) {
          setDossier(dossierData);
          setPreview(previewData);
        }
      } catch (err) {
        if (isMounted) {
          setError(err?.message || 'Failed to load student verification dossier');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [isOpen, studentId]);

  const handleApprove = async () => {
    setActionLoading(true);
    setError(null);
    try {
      if (activeDoc) {
        await adminUsersApi.reviewStudentVerification(studentId, 'APPROVED', 'Document verified successfully');
      } else {
        await adminUsersApi.reviewVerification(studentId, 'VERIFIED', 'Verified by administrator without physical ID document');
      }
      if (onReviewSuccess) onReviewSuccess();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to approve verification');
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
      if (activeDoc) {
        await adminUsersApi.reviewStudentVerification(studentId, 'REJECTED', rejectReason.trim());
      } else {
        await adminUsersApi.reviewVerification(studentId, 'REJECTED', rejectReason.trim());
      }
      if (onReviewSuccess) onReviewSuccess();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to reject verification');
    } finally {
      setActionLoading(false);
    }
  };

  const user = dossier?.user;
  const activeDoc = dossier?.activeDocument;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[850px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <FileCheck className="h-6 w-6 text-primary" />
            Candidate Verification Dossier
          </DialogTitle>
          <DialogDescription>
            {user ? `${user.name} (${user.enrollmentNumber || user.email})` : 'Loading candidate dossier...'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Verification Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex h-[320px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="ml-3 text-sm text-muted-foreground">
              Loading identity credentials and private preview...
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-2">
            {/* Left Column: Document Preview */}
            <div className="md:col-span-7 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Identity Document Preview</span>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-normal">
                  <Lock className="h-3 w-3 text-amber-500" />
                  300s TTL Pre-signed S3 URL
                </span>
              </div>

              {preview?.previewUrl ? (
                <div className="border border-border rounded-xl overflow-hidden bg-black/90 h-[360px] flex items-center justify-center">
                  {preview.mimeType?.includes('pdf') ? (
                    <iframe
                      src={preview.previewUrl}
                      title="Document PDF Preview"
                      className="w-full h-full border-0"
                    />
                  ) : (
                    <img
                      src={preview.previewUrl}
                      alt="Candidate Identity Document"
                      className="max-w-full max-h-full object-contain"
                    />
                  )}
                </div>
              ) : (
                <div className="h-[360px] border border-dashed border-border rounded-xl flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-muted/20">
                  <FileText className="h-10 w-10 mb-2 opacity-40" />
                  <p className="text-sm font-medium">No previewable document binary found.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Candidate has not uploaded or completed identity document submission.
                  </p>
                </div>
              )}
            </div>

            {/* Right Column: Metadata & Decision Box */}
            <div className="md:col-span-5 space-y-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Document Details
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-3.5 space-y-2.5 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-border/50">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={user?.verificationStatus === 'VERIFIED' ? 'default' : 'secondary'}>
                    {user?.verificationStatus}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Document Type:</span>
                  <span className="font-semibold text-foreground">{activeDoc?.documentType || 'None'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Masked ID:</span>
                  <span className="font-mono text-foreground font-medium">****{activeDoc?.documentNumberLast4 || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Name on ID:</span>
                  <span className="font-semibold text-foreground">{activeDoc?.fullNameOnDocument || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Department:</span>
                  <span className="text-foreground">{user?.department || 'Unassigned'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Submitted:</span>
                  <span className="text-muted-foreground">
                    {activeDoc?.submittedAt ? new Date(activeDoc.submittedAt).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Accommodations Shortcut */}
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs flex items-center justify-center gap-2"
                onClick={() => {
                  onClose();
                  navigate(`/admin/students/${studentId}/configuration`);
                }}
              >
                <Sliders className="h-3.5 w-3.5 text-primary" />
                <span>Configure Student Accommodations</span>
              </Button>

              {/* Decision Panel */}
              <div className="border-t border-border/80 pt-3 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Verification Decision
                </div>

                {!showRejectBox ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={handleApprove}
                      disabled={actionLoading}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setShowRejectBox(true)}
                      disabled={actionLoading}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject...
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2.5">
                    <label className="block text-xs font-semibold text-destructive">
                      Mandatory Rejection Reason *
                    </label>
                    <Input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="e.g. Document photo is illegible or expired"
                      disabled={actionLoading}
                      className="h-9 text-xs"
                    />
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={handleReject}
                        disabled={actionLoading || !rejectReason.trim()}
                      >
                        Confirm Rejection
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
