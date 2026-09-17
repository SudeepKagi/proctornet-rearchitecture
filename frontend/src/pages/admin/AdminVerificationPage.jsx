/**
 * @file AdminVerificationPage.jsx
 * @description Administrative verification queue: review, approve, or reject candidate and faculty onboarding submissions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { StudentVerificationDetailModal } from '../../components/admin/StudentVerificationDetailModal.jsx';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  FileCheck,
  Sliders,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  FileText,
} from 'lucide-react';

export function AdminVerificationPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');

  // Student Identity Dossier & Preview modal
  const [dossierModalOpen, setDossierModalOpen] = useState(false);
  const [selectedStudentIdForDossier, setSelectedStudentIdForDossier] = useState(null);

  // General Review modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [reviewDecision, setReviewDecision] = useState('VERIFIED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState(null);

  const loadQueue = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminUsersApi.fetchVerificationQueue({
        page,
        limit: pagination.limit,
        verification_status: statusFilter || undefined,
        role: roleFilter || undefined,
        search: search.trim() || undefined,
      });
      setUsers(data.users || []);
      setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err?.message || 'Failed to load verification queue');
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, statusFilter, roleFilter, search]);

  useEffect(() => {
    loadQueue(1);
  }, [loadQueue]);

  const handleOpenReview = (user, decision = 'VERIFIED') => {
    setSelectedUser(user);
    setReviewDecision(decision);
    setReviewNotes('');
    setReviewError(null);
    setReviewModalOpen(true);
  };

  const handleConfirmReview = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (reviewDecision === 'REJECTED' && !reviewNotes.trim()) {
      setReviewError('Mandatory review notes are required when returning or rejecting a verification request');
      return;
    }

    setReviewLoading(true);
    setReviewError(null);
    try {
      await adminUsersApi.reviewVerification(selectedUser.userId, reviewDecision, reviewNotes.trim());
      setReviewModalOpen(false);
      loadQueue(pagination.page);
    } catch (err) {
      setReviewError(err?.message || 'Failed to submit verification decision');
    } finally {
      setReviewLoading(false);
    }
  };

  const getVerificationBadge = (vStatus) => {
    switch (vStatus) {
      case 'VERIFIED':
        return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">VERIFIED</Badge>;
      case 'PENDING':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">PENDING</Badge>;
      case 'REJECTED':
        return <Badge variant="destructive">REJECTED</Badge>;
      case 'UNVERIFIED':
        return <Badge variant="outline" className="text-muted-foreground">UNVERIFIED</Badge>;
      default:
        return <Badge variant="outline">{vStatus || 'UNKNOWN'}</Badge>;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-primary" />
          Academic Verification Queue
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Inspect academic submissions, verify institutional identity credentials, and approve access to exam operations.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Queue Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filter Bar */}
      <Card className="shadow-xs border-border/80">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="verification-search" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Search Submissions
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="verification-search"
                  placeholder="Candidate name or USN..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Verification State
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">All Verification States</option>
                <option value="PENDING">Pending Review (Action Required)</option>
                <option value="VERIFIED">Verified (Approved)</option>
                <option value="REJECTED">Rejected (Returned to Candidate)</option>
                <option value="UNVERIFIED">Unverified (Profile Incomplete)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Role
              </label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">All Roles</option>
                <option value="STUDENT">Student Only</option>
                <option value="FACULTY">Faculty Only</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue Table */}
      <Card className="shadow-xs border-border/80 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Candidate / Faculty</TableHead>
                <TableHead>Identifier</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department & Details</TableHead>
                <TableHead>Verification Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <div className="inline-flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <span>Loading verification queue...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No users pending verification in this category.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.userId} className="transition-colors">
                    <TableCell>
                      <div className="font-semibold text-foreground">{u.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{u.email}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-foreground">
                      {u.identifier || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs font-mono">
                        {u.roles?.[0]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-foreground text-xs font-medium">{u.department || '—'}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {u.semester ? `Semester ${u.semester}` : u.designation || '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getVerificationBadge(u.verificationStatus)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {u.roles?.includes('STUDENT') && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs font-medium"
                              onClick={() => {
                                setSelectedStudentIdForDossier(u.userId);
                                setDossierModalOpen(true);
                              }}
                            >
                              <FileCheck className="h-3.5 w-3.5 mr-1 text-primary" />
                              Review ID
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs font-medium"
                              onClick={() => navigate(`/admin/students/${u.userId}/configuration`)}
                            >
                              <Sliders className="h-3.5 w-3.5 mr-1" />
                              Accommodations
                            </Button>
                          </>
                        )}
                        <Button
                          variant="default"
                          size="sm"
                          className="h-8 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => handleOpenReview(u, 'VERIFIED')}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-medium text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleOpenReview(u, 'REJECTED')}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/60 bg-muted/20 text-xs text-muted-foreground">
          <div>
            Showing {users.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} records
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs flex items-center gap-1"
              disabled={pagination.page <= 1 || loading}
              onClick={() => loadQueue(pagination.page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Button>
            <span className="px-2 font-medium text-foreground">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs flex items-center gap-1"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => loadQueue(pagination.page + 1)}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Review Modal */}
      <Dialog open={reviewModalOpen} onOpenChange={setReviewModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {reviewDecision === 'VERIFIED'
                ? `Approve Verification: ${selectedUser?.name}`
                : `Return Submission: ${selectedUser?.name}`}
            </DialogTitle>
            <DialogDescription>
              Submit an authoritative verification review decision for this institutional user.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmReview} className="space-y-4 pt-2">
            {reviewError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{reviewError}</AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-semibold text-foreground">{selectedUser?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-mono text-foreground">{selectedUser?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Identifier:</span>
                <span className="font-mono font-semibold text-foreground">{selectedUser?.identifier || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Department:</span>
                <span className="text-foreground">{selectedUser?.department || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Affiliation:</span>
                <span className="text-foreground">
                  {selectedUser?.semester ? `Semester ${selectedUser.semester}` : selectedUser?.designation || '—'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Review Decision
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={reviewDecision === 'VERIFIED' ? 'default' : 'outline'}
                  className={reviewDecision === 'VERIFIED' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                  onClick={() => setReviewDecision('VERIFIED')}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Approve (VERIFIED)
                </Button>
                <Button
                  type="button"
                  variant={reviewDecision === 'REJECTED' ? 'destructive' : 'outline'}
                  onClick={() => setReviewDecision('REJECTED')}
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Reject (Return)
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="review-notes" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Review Notes {reviewDecision === 'REJECTED' ? '(Mandatory *)' : '(Optional)'}
              </label>
              <Input
                id="review-notes"
                required={reviewDecision === 'REJECTED'}
                placeholder={
                  reviewDecision === 'REJECTED'
                    ? 'e.g. USN does not match department records. Please correct semester.'
                    : 'e.g. Verified against university registrar records.'
                }
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setReviewModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={reviewDecision === 'VERIFIED' ? 'default' : 'destructive'}
                className={reviewDecision === 'VERIFIED' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                disabled={reviewLoading}
              >
                {reviewLoading ? 'Submitting...' : 'Submit Decision'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Student Identity Verification Detail Modal */}
      <StudentVerificationDetailModal
        studentId={selectedStudentIdForDossier}
        isOpen={dossierModalOpen}
        onClose={() => setDossierModalOpen(false)}
        onReviewSuccess={() => loadQueue(pagination.page)}
      />
    </div>
  );
}
