/**
 * @file UserManagementPage.jsx
 * @description Administrative user management dashboard: paginated user roster, filters, search, and user actions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { StateBoundary } from '@/components/common/StateBoundary.jsx';
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
import { StudentVerificationDetailModal } from '../../components/admin/StudentVerificationDetailModal.jsx';
import { FacultyVerificationModal } from '../../components/admin/FacultyVerificationModal.jsx';
import {
  Users,
  UserPlus,
  FileSpreadsheet,
  Search,
  Filter,
  KeyRound,
  Shield,
  ShieldCheck,
  Eye,
  Sliders,
  Clock,
  ArrowRight,
  CheckCircle2,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ShieldAlert,
  Info,
} from 'lucide-react';

export function UserManagementPage() {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('');

  // Identity verification modals
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [selectedStudentForVerification, setSelectedStudentForVerification] = useState(null);
  const [facultyModalOpen, setFacultyModalOpen] = useState(false);
  const [selectedFacultyForVerification, setSelectedFacultyForVerification] = useState(null);

  // Status Modal state
  const [selectedUser, setSelectedUser] = useState(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('SUSPENDED');
  const [statusReason, setStatusReason] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState(null);

  // Temporary password display modal
  const [tempPasswordModalOpen, setTempPasswordModalOpen] = useState(false);
  const [tempPasswordData, setTempPasswordData] = useState(null);
  const [copied, setCopied] = useState(false);

  // Inline action notice
  const [actionNotice, setActionNotice] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  function showNotice(type, message) {
    setActionNotice({ type, message });
    setTimeout(() => setActionNotice(null), 5000);
  }

  function openConfirm(message, onConfirm) {
    setConfirmModal({ message, onConfirm });
  }

  const loadUsers = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminUsersApi.fetchUsers({
        page,
        limit: pagination.limit,
        search: search.trim() || undefined,
        role: role || undefined,
        status: status || undefined,
        verification_status: verificationStatus || undefined,
      });
      setUsers(data.users || []);
      setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, search, role, status, verificationStatus]);

  useEffect(() => {
    loadUsers(1);
  }, [loadUsers]);

  const handleOpenStatusModal = (user) => {
    setSelectedUser(user);
    setNewStatus(user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');
    setStatusReason('');
    setStatusError(null);
    setStatusModalOpen(true);
  };

  const handleOpenVerification = (user) => {
    if (user.roles?.includes('FACULTY')) {
      setSelectedFacultyForVerification(user);
      setFacultyModalOpen(true);
    } else {
      setSelectedStudentForVerification(user);
      setVerificationModalOpen(true);
    }
  };

  const handleConfirmStatusChange = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    setStatusLoading(true);
    setStatusError(null);
    try {
      await adminUsersApi.updateUserStatus(selectedUser.userId, newStatus, statusReason);
      setStatusModalOpen(false);
      showNotice('success', `Status for ${selectedUser.name} updated to ${newStatus}.`);
      loadUsers(pagination.page);
    } catch (err) {
      setStatusError(err?.message || 'Failed to update account status');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleResetPassword = async (user) => {
    openConfirm(
      `Generate a new temporary password for ${user.name} (${user.email})? Any existing user sessions will be immediately revoked.`,
      async () => {
        try {
          const res = await adminUsersApi.resetUserPassword(user.userId);
          setTempPasswordData({
            name: user.name,
            email: user.email,
            temporaryPassword: res.temporaryPassword,
          });
          setCopied(false);
          setTempPasswordModalOpen(true);
        } catch (err) {
          showNotice('error', `Password reset failed: ${err?.message}`);
        }
      }
    );
  };

  const copyToClipboard = () => {
    if (tempPasswordData?.temporaryPassword) {
      navigator.clipboard.writeText(tempPasswordData.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStatusBadge = (userStatus) => {
    switch (userStatus) {
      case 'ACTIVE':
        return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">ACTIVE</Badge>;
      case 'SUSPENDED':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">SUSPENDED</Badge>;
      case 'LOCKED':
        return <Badge variant="destructive">LOCKED</Badge>;
      case 'DISABLED':
        return <Badge variant="outline" className="text-muted-foreground">DISABLED</Badge>;
      default:
        return <Badge variant="outline">{userStatus || 'UNKNOWN'}</Badge>;
    }
  };

  const getVerificationBadge = (vStatus) => {
    switch (vStatus) {
      case 'VERIFIED':
        return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">VERIFIED</Badge>;
      case 'PENDING':
        return (
          <Badge
            variant="secondary"
            className="bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200 border border-amber-300 dark:border-amber-800 font-semibold gap-1 inline-flex items-center cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/80 transition-colors"
            title="Click to review student ID verification"
          >
            <Clock className="h-3 w-3 animate-pulse text-amber-600 dark:text-amber-400" />
            PENDING
          </Badge>
        );
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
      {/* Inline Action Notice */}
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

      {/* Confirmation Alert Dialog */}
      <AlertDialog open={Boolean(confirmModal)} onOpenChange={(open) => !open && setConfirmModal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Confirm Administrative Action
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground pt-2">
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

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" />
            User & Account Administration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Authoritative provisioning, lifecycle governance, and role security for candidates, faculty, and administrators.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="flex items-center gap-2 border-amber-300 bg-amber-50/60 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            onClick={() => navigate('/admin/verifications')}
          >
            <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span>Verification Queue</span>
            {users.some((u) => u.verificationStatus === 'PENDING') && (
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </Button>
          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={() => navigate('/admin/users/bulk')}
          >
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <span>Bulk Import (.xlsx / .csv)</span>
          </Button>
          <Button
            className="flex items-center gap-2 shadow-xs"
            onClick={() => navigate('/admin/users/create')}
          >
            <UserPlus className="h-4 w-4" />
            <span>Provision User</span>
          </Button>
        </div>
      </div>

      {/* Pending Verifications Notice */}
      {users.some((u) => u.verificationStatus === 'PENDING') && (
        <Alert className="border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
            <div>
              <div className="text-xs font-semibold">Student Identity Documents Pending Approval</div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                Candidates have uploaded physical Student ID cards. Click <strong>Review & Verify</strong> in the table below to inspect and approve.
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs font-semibold border-amber-300 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 ml-4 shrink-0"
            onClick={() => navigate('/admin/verifications')}
          >
            Open Full Queue
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Directory Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filter and Search Bar */}
      <Card className="shadow-xs border-border/80">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="user-search" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Search Directory
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="user-search"
                  placeholder="Search name, email, identifier..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Role Filter
              </label>
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="">All Roles</option>
                <option value="STUDENT">Student / Candidate</option>
                <option value="FACULTY">Faculty</option>
                <option value="INVIGILATOR">Invigilator</option>
                <option value="ADMIN">Administrator</option>
                <option value="DEVELOPER">Developer</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Account Status
              </label>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="LOCKED">Locked</option>
                <option value="DISABLED">Disabled</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Verification State
              </label>
              <Select
                value={verificationStatus}
                onChange={(e) => setVerificationStatus(e.target.value)}
              >
                <option value="">All Verification States</option>
                <option value="VERIFIED">Verified</option>
                <option value="PENDING">Pending Review</option>
                <option value="UNVERIFIED">Unverified</option>
                <option value="REJECTED">Rejected</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="shadow-xs border-border/80 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent bg-muted/40">
                <TableHead>User</TableHead>
                <TableHead>Identifier</TableHead>
                <TableHead>Assigned Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Verification</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading || error || users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <StateBoundary
                      isLoading={loading}
                      error={error}
                      isEmpty={users.length === 0}
                      loadingMessage="Loading institutional user directory..."
                      emptyTitle="No Users Found"
                      emptyDescription="No institutional accounts match the specified filter criteria."
                      onRetry={() => loadUsers(pagination.page)}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.userId} className="transition-colors">
                    <TableCell>
                      <div className="font-semibold text-foreground">{u.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{u.email}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground font-medium">
                      {u.identifier || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(u.roles || []).map((r) => (
                          <Badge key={r} variant="secondary" className="text-xs font-mono">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(u.status)}
                    </TableCell>
                    <TableCell>
                      <div
                        onClick={() => u.verificationStatus === 'PENDING' && handleOpenVerification(u)}
                        className={u.verificationStatus === 'PENDING' ? 'cursor-pointer' : ''}
                      >
                        {getVerificationBadge(u.verificationStatus)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        {u.verificationStatus === 'PENDING' && (
                          <Button
                            size="sm"
                            className="h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1.5"
                            onClick={() => handleOpenVerification(u)}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Review & Verify
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-medium border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
                          onClick={() => navigate(`/admin/users/${u.userId}`)}
                        >
                          <Eye className="h-3.5 w-3.5 text-slate-500" />
                          Detail
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-medium border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
                          onClick={() => handleOpenStatusModal(u)}
                        >
                          <Sliders className="h-3.5 w-3.5 text-slate-500" />
                          Status
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-medium border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-950/40 flex items-center gap-1"
                          onClick={() => handleResetPassword(u)}
                        >
                          <KeyRound className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          Reset PW
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
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} users
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs flex items-center gap-1"
              disabled={pagination.page <= 1 || loading}
              onClick={() => loadUsers(pagination.page - 1)}
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
              onClick={() => loadUsers(pagination.page + 1)}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Account Status Modal */}
      <Dialog open={statusModalOpen} onOpenChange={setStatusModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Change Account Status</DialogTitle>
            <DialogDescription>
              Modify lifecycle status and active session privileges for <span className="font-semibold text-foreground">{selectedUser?.name}</span>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmStatusChange} className="space-y-4 pt-2">
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
              <Select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              >
                <option value="ACTIVE">ACTIVE (Full access)</option>
                <option value="SUSPENDED">SUSPENDED (Revokes active sessions)</option>
                <option value="DISABLED">DISABLED (Permanent deactivation)</option>
                <option value="LOCKED">LOCKED (Temporarily locked)</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="status-reason" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Administrative Reason (Required for Audit Trail)
              </label>
              <Input
                id="status-reason"
                required
                placeholder="e.g. Disciplinary investigation, student leave of absence"
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
                {statusLoading ? 'Updating...' : 'Save Status'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generated Temporary Password Modal */}
      <Dialog open={tempPasswordModalOpen} onOpenChange={setTempPasswordModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-amber-500" />
              Temporary Credentials Issued
            </DialogTitle>
            <DialogDescription>
              New credentials for <span className="font-semibold text-foreground">{tempPasswordData?.name}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <Alert variant="default" className="border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <AlertTitle className="font-semibold">Security Warning</AlertTitle>
              <AlertDescription className="text-xs">
                This temporary password will not be displayed again. Transmit it securely to the account holder.
              </AlertDescription>
            </Alert>

            <div className="p-4 rounded-lg border border-border bg-muted/40 space-y-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account Email</div>
                <div className="text-sm font-semibold text-foreground font-mono">{tempPasswordData?.email}</div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Temporary Password</div>
                <div className="mt-1 font-mono text-xl font-bold tracking-wider text-primary break-all">
                  {tempPasswordData?.temporaryPassword}
                </div>
              </div>
            </div>

            <DialogFooter className="flex sm:justify-between items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex items-center gap-2"
                onClick={copyToClipboard}
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

      {/* Student Identity Verification & Approval Modal */}
      <StudentVerificationDetailModal
        studentId={selectedStudentForVerification?.userId}
        isOpen={verificationModalOpen}
        onClose={() => {
          setVerificationModalOpen(false);
          setSelectedStudentForVerification(null);
        }}
        onReviewSuccess={() => {
          showNotice('success', `Identity verification approved for ${selectedStudentForVerification?.name || 'student'}.`);
          loadUsers(pagination.page);
        }}
      />

      {/* Faculty Appointment Verification & Approval Modal */}
      <FacultyVerificationModal
        user={selectedFacultyForVerification}
        isOpen={facultyModalOpen}
        onClose={() => {
          setFacultyModalOpen(false);
          setSelectedFacultyForVerification(null);
        }}
        onReviewSuccess={() => {
          showNotice('success', `Faculty appointment verified and privileges approved for ${selectedFacultyForVerification?.name || 'faculty member'}.`);
          loadUsers(pagination.page);
        }}
      />
    </div>
  );
}
