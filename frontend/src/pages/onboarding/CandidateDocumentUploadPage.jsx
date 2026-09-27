/**
 * @file CandidateDocumentUploadPage.jsx
 * @description Candidate identity document onboarding screen with automated OCR extraction,
 * auto-filling, visual extraction verification, and presigned S3 uploads.
 * Rebuilt with shadcn/ui and Tailwind CSS.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as candidateApi from '../../api/candidateIdentityApi.js';
import { ACADEMIC_DEPARTMENTS, resolveDepartment } from '../../constants/departments.js';
import {
  UploadCloud,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Eye,
  FileCheck2,
  X,
  ScanLine,
  Building,
  GraduationCap,
  Calendar,
  UserCheck
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Select, SelectOption } from '../../components/ui/select.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Spinner } from '../../components/ui/spinner.jsx';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit

export function CandidateDocumentUploadPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [identityStatus, setIdentityStatus] = useState(null);
  const [candidateProfile, setCandidateProfile] = useState(null);

  // Form inputs
  const [documentType] = useState('STUDENT_ID');
  const [fullNameOnDocument, setFullNameOnDocument] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [department, setDepartment] = useState('');
  const [customDepartment, setCustomDepartment] = useState('');
  const [issueCountry, setIssueCountry] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // OCR Extraction state
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [verifiedByCandidate, setVerifiedByCandidate] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [statusRes, profileRes] = await Promise.all([
        candidateApi.getCandidateIdentityStatus().catch(() => null),
        candidateApi.getCandidateProfile().catch(() => null),
      ]);

      setIdentityStatus(statusRes);
      setCandidateProfile(profileRes);

      if (profileRes?.name && !fullNameOnDocument) {
        setFullNameOnDocument(profileRes.name);
      }
      if (profileRes?.enrollmentNumber && !documentNumber) {
        setDocumentNumber(profileRes.enrollmentNumber);
      }
      if (profileRes?.department && !department) {
        const { selectedOption, customValue } = resolveDepartment(profileRes.department);
        setDepartment(selectedOption);
        setCustomDepartment(customValue);
      }
    } catch (err) {
      setError(err?.data || err?.message || 'Failed to load candidate verification status');
    } finally {
      setLoading(false);
    }
  }, [department, documentNumber, fullNameOnDocument]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Cleanup object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const processFileExtraction = async (file) => {
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError('Invalid file format. Only JPEG, PNG, and PDF files are accepted.');
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError('File size exceeds the 5 MB maximum limit.');
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }

    setError(null);
    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }

    // Trigger OCR extraction automatically
    setExtracting(true);
    setVerifiedByCandidate(false);

    try {
      const result = await candidateApi.extractCardDetails(file);

      if (result) {
        setExtractedData(result);

        if (result.fullName) {
          setFullNameOnDocument(result.fullName);
        }
        if (result.studentId) {
          setDocumentNumber(result.studentId);
        }
        if (result.institution) {
          setIssueCountry(result.institution);
        }
        if (result.validity) {
          setExpiryDate(result.validity);
        }
        if (result.department) {
          const { selectedOption, customValue } = resolveDepartment(result.department);
          setDepartment(selectedOption);
          setCustomDepartment(customValue);
        } else if (result.branch) {
          const { selectedOption, customValue } = resolveDepartment(result.branch);
          setDepartment(selectedOption);
          setCustomDepartment(customValue);
        }
      }
    } catch (extractErr) {
      console.warn('[OCR] Auto-extraction notice:', extractErr?.message);
      // Non-blocking: if OCR fails, user can still review and enter values manually
    } finally {
      setExtracting(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processFileExtraction(file);
    }
  };

  const handleResetFile = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setExtractedData(null);
    setVerifiedByCandidate(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedFile) {
      setError('Please upload a Student ID card file.');
      return;
    }
    if (!fullNameOnDocument.trim()) {
      setError('Please provide full name as printed on the Student ID.');
      return;
    }
    if (!documentNumber.trim()) {
      setError('Please provide the Student ID or USN number.');
      return;
    }

    const effectiveDept = department === 'Other' ? customDepartment.trim() : department.trim();

    setSubmitting(true);
    setUploadStep('ticket');

    try {
      // 1. Synchronize candidate profile department if updated
      if (effectiveDept) {
        try {
          await candidateApi.updateCandidateProfile({ department: effectiveDept });
        } catch (profileErr) {
          console.warn('Profile sync notice:', profileErr.message);
        }
      }

      // 2. Request presigned upload ticket
      const ticketPayload = {
        documentType: 'STUDENT_ID',
        mimeType: selectedFile.type,
        byteSize: selectedFile.size,
        fileName: selectedFile.name,
        fullNameOnDocument: fullNameOnDocument.trim(),
        documentNumber: documentNumber.trim(),
        issueCountry: issueCountry.trim() ? issueCountry.trim().slice(0, 64) : undefined,
        dateOfBirth: dateOfBirth || undefined,
        expiryDate: expiryDate || undefined,
      };

      const ticket = await candidateApi.requestDocumentUploadUrl(ticketPayload);
      if (!ticket?.uploadUrl || !ticket?.documentId) {
        throw new Error('Upload authorization failed. Please try again.');
      }

      // 3. Direct S3 Upload via PUT
      setUploadStep('s3');
      await candidateApi.uploadBinaryToS3(ticket.uploadUrl, selectedFile, selectedFile.type);

      // 4. Confirm Document Upload
      setUploadStep('confirm');
      await candidateApi.confirmDocumentUpload(ticket.documentId);

      setSuccessMsg('Student ID card successfully verified, uploaded, and queued for administrative approval!');
      handleResetFile();
      if (refreshUser) {
        await refreshUser();
      }
      await loadStatus();

      // Automatically transition to next onboarding step
      setTimeout(() => {
        navigate('/onboarding/pending', { replace: true });
      }, 1000);
    } catch (err) {
      setError(err?.message || 'Failed to complete document upload. Please try again.');
    } finally {
      setSubmitting(false);
      setUploadStep('');
    }
  };

  const docStatus =
    identityStatus?.document?.verificationStatus ||
    identityStatus?.overallVerificationStatus ||
    identityStatus?.documentStatus ||
    'UNVERIFIED';
  const activeDoc = identityStatus?.document || identityStatus?.activeDocument;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4 sm:px-6 transition-colors">
      <div className="max-w-4xl mx-auto space-y-6">
        <StateBoundary
          loading={loading}
          error={error}
          onRetry={loadStatus}
          loadingMessage="Loading candidate verification status..."
        >
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <GraduationCap className="h-7 w-7 text-blue-600 dark:text-blue-500" />
            Candidate Identity Verification
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Institutional compliance requires verification of your official Student ID card prior to examination access.
          </p>
        </div>

        {/* 1. Status Overview Banners */}
        {docStatus === 'APPROVED' && (
          <Card className="border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="p-3 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
                    Identity Fully Verified
                  </h3>
                  <Badge variant="success">APPROVED</Badge>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Your Student ID card (ending in ****{activeDoc?.documentNumberLast4}) has been officially approved. You have full clearance for all assigned examinations.
                </p>
                <div className="pt-2">
                  <Button
                    type="button"
                    onClick={() => navigate('/candidate')}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9"
                  >
                    Go to Candidate Dashboard
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {docStatus === 'PENDING' && (
          <Card className="border-amber-200 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="p-3 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                <Clock className="h-6 w-6 animate-pulse" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-amber-900 dark:text-amber-200">
                    Student ID Under Administrative Review
                  </h3>
                  <Badge variant="warning">PENDING REVIEW</Badge>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Your Student ID card (ending in ****{activeDoc?.documentNumberLast4}) was uploaded and is currently being inspected by institutional staff.
                </p>
                <div className="pt-2 flex items-center gap-2.5">
                  <Button
                    type="button"
                    onClick={() => navigate('/onboarding/pending', { replace: true })}
                    className="text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs"
                  >
                    Go to Pending Review Page
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={loadStatus}
                    className="text-xs h-8"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Refresh Status
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {docStatus === 'REJECTED' && (
          <Card className="border-rose-200 dark:border-rose-800/80 bg-rose-50/50 dark:bg-rose-950/20">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="p-3 rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-rose-900 dark:text-rose-200">
                    Document Verification Rejected
                  </h3>
                  <Badge variant="destructive">REJECTED</Badge>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300">
                  <span className="font-semibold">Reviewer Notes: </span>
                  {activeDoc?.reviewerNotes || 'The uploaded file was illegible or could not be verified.'}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Please provide a clearer scan or photo of your official Student ID card below to resubmit.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 2. Upload & OCR Verification Form */}
        {(docStatus === 'UNVERIFIED' || docStatus === 'REJECTED') && (
          <Card className="shadow-md border-slate-200 dark:border-slate-800 dark:bg-slate-900">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <ScanLine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    {docStatus === 'REJECTED' ? 'Resubmit Student ID Card' : 'Upload Student ID Card'}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Upload your official college/university Student ID card. Our automated OCR scanner will read your details and auto-fill the verification form.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Auto-OCR Enabled
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}

              {successMsg && (
                <Alert variant="success">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription className="text-xs">{successMsg}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleUploadSubmit} className="space-y-6">
                {/* Step A: Primary Dropzone / File Picker */}
                {!selectedFile ? (
                  <div className="space-y-2 text-left">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Step 1: Upload Student ID Scan or Photo <span className="text-rose-500">*</span>
                    </label>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="group flex flex-col items-center justify-center p-8 sm:p-10 border-2 border-dashed border-blue-300 dark:border-blue-700/60 rounded-2xl bg-blue-50/30 dark:bg-blue-950/10 hover:bg-blue-50/70 dark:hover:bg-blue-950/25 transition-all cursor-pointer text-center"
                    >
                      <div className="p-3.5 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 mb-3 group-hover:scale-105 transition-transform">
                        <UploadCloud className="h-8 w-8" />
                      </div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Click to select or drag and drop your Student ID card
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                        Supports JPEG, PNG, or PDF up to 5 MB. Ensure the student name, USN/ID number, and institution are clearly legible.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-4 pointer-events-none"
                      >
                        Browse Files
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        id="doc-file-input"
                        accept=".jpg,.jpeg,.png,.pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </div>
                  </div>
                ) : (
                  /* Step B: Extracted Details & Verification Panel */
                  <div className="space-y-6">
                    {/* Scanning animation banner */}
                    {extracting && (
                      <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 flex items-center gap-3">
                        <Spinner size="md" />
                        <div>
                          <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-blue-600 animate-spin" />
                            Scanning Student ID Card with OCR...
                          </p>
                          <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">
                            Detecting Student Name, USN / ID Number, Department, and Institution details...
                          </p>
                        </div>
                      </div>
                    )}

                    {!extracting && extractedData && (
                      <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                            Student ID details successfully extracted! Please review and verify the details below.
                          </span>
                        </div>
                        <Badge variant="success" className="text-[10px] uppercase tracking-wider">
                          Auto-Filled
                        </Badge>
                      </div>
                    )}

                    {/* Side-by-side or stacked preview and verification */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                      {/* Left: ID Card Preview */}
                      <div className="md:col-span-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <Eye className="h-3.5 w-3.5 text-blue-600" />
                            Uploaded Student ID Card
                          </span>
                          <button
                            type="button"
                            onClick={handleResetFile}
                            className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 flex items-center gap-1 cursor-pointer font-medium"
                          >
                            <X className="h-3 w-3" />
                            Change Photo
                          </button>
                        </div>

                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900/5 dark:bg-slate-900/50 p-2 overflow-hidden flex flex-col items-center">
                          {previewUrl ? (
                            <img
                              src={previewUrl}
                              alt="Uploaded Student ID Preview"
                              className="max-h-72 w-auto object-contain rounded-lg shadow-xs"
                            />
                          ) : (
                            <div className="h-48 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                              <FileText className="h-10 w-10 text-slate-400 mb-2" />
                              <span className="text-xs font-mono">{selectedFile?.name}</span>
                              <span className="text-[10px] text-slate-500 mt-1">PDF Document Scan</span>
                            </div>
                          )}

                          <div className="w-full pt-2 px-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-800/60 mt-2">
                            <span className="truncate max-w-[150px]">{selectedFile?.name}</span>
                            <span>{selectedFile ? (selectedFile.size / 1024 / 1024).toFixed(2) : 0} MB</span>
                          </div>
                        </div>

                        {/* OCR Highlights Pill Card */}
                        {extractedData && (
                          <div className="p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-[11px] space-y-1.5 text-slate-600 dark:text-slate-300">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                              <FileCheck2 className="h-3.5 w-3.5 text-blue-600" />
                              OCR Extracted Metadata
                            </div>
                            {extractedData.course && (
                              <div><span className="text-slate-400">Course:</span> {extractedData.course}</div>
                            )}
                            {extractedData.branch && (
                              <div><span className="text-slate-400">Branch:</span> {extractedData.branch}</div>
                            )}
                            {extractedData.validityText && (
                              <div><span className="text-slate-400">Validity:</span> {extractedData.validityText}</div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right: Verification & Editable Form */}
                      <div className="md:col-span-7 space-y-4">
                        <div className="pb-1 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <UserCheck className="h-4 w-4 text-emerald-600" />
                            Step 2: Verify Extracted Information
                          </h3>
                          <span className="text-[11px] text-slate-400">Edit any field if required</span>
                        </div>

                        {/* Document Type (Fixed to Student ID) */}
                        <div className="space-y-1 text-left">
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            Document Type <span className="text-rose-500">*</span>
                          </label>
                          <Select
                            value={documentType}
                            disabled
                            className="bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 cursor-not-allowed opacity-90 text-xs sm:text-sm"
                          >
                            <SelectOption value="STUDENT_ID">Institutional Student ID Card</SelectOption>
                          </Select>
                        </div>

                        {/* Student ID / USN Number */}
                        <div className="space-y-1 text-left">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                              Student ID / USN Number <span className="text-rose-500">*</span>
                            </label>
                            {extractedData?.studentId && (
                              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono font-medium flex items-center gap-1">
                                <Sparkles className="h-2.5 w-2.5" />
                                OCR: {extractedData.studentId}
                              </span>
                            )}
                          </div>
                          <Input
                            value={documentNumber}
                            onChange={(e) => setDocumentNumber(e.target.value)}
                            placeholder="e.g. 1NT23EC158 or STU-2026-001"
                            required
                            className="font-mono text-sm"
                          />
                        </div>

                        {/* Full Name on Student ID */}
                        <div className="space-y-1 text-left">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                              Full Name on Student ID <span className="text-rose-500">*</span>
                            </label>
                            {extractedData?.fullName && (
                              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                                <Sparkles className="h-2.5 w-2.5" />
                                Auto-detected
                              </span>
                            )}
                          </div>
                          <Input
                            value={fullNameOnDocument}
                            onChange={(e) => setFullNameOnDocument(e.target.value)}
                            placeholder="As printed on Student ID"
                            required
                            className="text-sm"
                          />
                        </div>

                        {/* Academic Department Dropdown */}
                        <div className="space-y-1 text-left">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                              Academic Department <span className="text-rose-500">*</span>
                            </label>
                            {extractedData?.department && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                <Sparkles className="h-2.5 w-2.5" />
                                Mapped from ID
                              </span>
                            )}
                          </div>
                          <Select
                            value={department}
                            onChange={(e) => {
                              setDepartment(e.target.value);
                              if (e.target.value !== 'Other') {
                                setCustomDepartment('');
                              }
                            }}
                            required
                            className="text-xs sm:text-sm"
                          >
                            <SelectOption value="" disabled>
                              Select your academic department
                            </SelectOption>
                            {ACADEMIC_DEPARTMENTS.map((dept) => (
                              <SelectOption key={dept} value={dept}>
                                {dept}
                              </SelectOption>
                            ))}
                          </Select>
                          {department === 'Other' && (
                            <div className="pt-2">
                              <Input
                                value={customDepartment}
                                onChange={(e) => setCustomDepartment(e.target.value)}
                                placeholder="Specify your academic department"
                                required
                                className="text-xs sm:text-sm"
                              />
                            </div>
                          )}
                        </div>

                        {/* Issuing College / Institution */}
                        <div className="space-y-1 text-left">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                              Issuing College / Institution
                            </label>
                            {extractedData?.institution && (
                              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                                <Building className="h-2.5 w-2.5" />
                                Detected
                              </span>
                            )}
                          </div>
                          <Input
                            value={issueCountry}
                            onChange={(e) => setIssueCountry(e.target.value)}
                            placeholder="e.g. Nitte Meenakshi Institute of Technology"
                            className="text-sm"
                          />
                        </div>

                        {/* Card Expiry / Validity Date */}
                        <div className="space-y-1 text-left">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                              Card Validity / Expiry Date (Optional)
                            </label>
                            {extractedData?.validityText && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Calendar className="h-2.5 w-2.5" />
                                {extractedData.validityText}
                              </span>
                            )}
                          </div>
                          <Input
                            type="date"
                            value={expiryDate}
                            onChange={(e) => setExpiryDate(e.target.value)}
                            className="text-xs sm:text-sm"
                          />
                        </div>

                        {/* Explicit Verification Confirmation Checkbox */}
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                          <label className="flex items-start gap-2.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={verifiedByCandidate}
                              onChange={(e) => setVerifiedByCandidate(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="text-xs text-slate-700 dark:text-slate-300 leading-snug">
                              I confirm that the extracted details above accurately match my physical Student ID card and my university enrollment records.
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Submit Actions */}
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleResetFile}
                        disabled={submitting}
                        className="w-full sm:w-auto text-xs"
                      >
                        Cancel & Upload Different Photo
                      </Button>

                      <Button
                        type="submit"
                        disabled={submitting || !verifiedByCandidate}
                        className="w-full sm:w-auto h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs sm:text-sm shadow-sm"
                      >
                        {submitting ? (
                          <span className="flex items-center gap-2">
                            <Spinner size="sm" />
                            {uploadStep === 'ticket' && 'Granting upload authorization...'}
                            {uploadStep === 's3' && 'Uploading document to secure storage...'}
                            {uploadStep === 'confirm' && 'Verifying file integrity...'}
                            {!uploadStep && 'Submitting...'}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" />
                            Confirm & Submit for Review
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        )}
        </StateBoundary>
      </div>
    </div>
  );
}

export default CandidateDocumentUploadPage;
