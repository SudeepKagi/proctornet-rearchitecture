/**
 * @file CandidateDocumentUploadPage.jsx
 * @description Candidate identity document onboarding screen with presigned S3 uploads.
 * Rebuilt with shadcn/ui and Tailwind CSS.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as candidateApi from '../../api/candidateIdentityApi.js';
import {
  UploadCloud,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Info,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Select, SelectOption } from '../../components/ui/select.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Spinner } from '../../components/ui/spinner.jsx';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit

export function CandidateDocumentUploadPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [identityStatus, setIdentityStatus] = useState(null);
  const [candidateProfile, setCandidateProfile] = useState(null);

  // Form inputs
  const [documentType, setDocumentType] = useState('PASSPORT');
  const [fullNameOnDocument, setFullNameOnDocument] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issueCountry, setIssueCountry] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const loadStatus = async () => {
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
    } catch (err) {
      setError(err?.message || 'Failed to load candidate verification status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const validateAndSelectFile = (file) => {
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError('Invalid file format. Only JPEG, PNG, and PDF files are accepted.');
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError('File size exceeds the 5 MB maximum limit.');
      setSelectedFile(null);
      return;
    }

    setError(null);
    setSelectedFile(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    validateAndSelectFile(file);
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedFile) {
      setError('Please select a document scan or photo to upload.');
      return;
    }
    if (!fullNameOnDocument.trim()) {
      setError('Please provide full name as printed on the document.');
      return;
    }
    if (!documentNumber.trim()) {
      setError('Please provide the document number.');
      return;
    }

    setSubmitting(true);
    setUploadStep('ticket');

    try {
      // 1. Request presigned upload ticket
      const ticketPayload = {
        documentType,
        mimeType: selectedFile.type,
        byteSize: selectedFile.size,
        fileName: selectedFile.name,
        fullNameOnDocument: fullNameOnDocument.trim(),
        documentNumber: documentNumber.trim(),
        issueCountry: issueCountry.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        expiryDate: expiryDate || undefined,
      };

      const ticket = await candidateApi.requestDocumentUploadUrl(ticketPayload);
      if (!ticket?.uploadUrl || !ticket?.documentId) {
        throw new Error('Upload ticket grant failed. Please try again.');
      }

      // 2. Direct S3 Upload via PUT
      setUploadStep('s3');
      await candidateApi.uploadBinaryToS3(ticket.uploadUrl, selectedFile, selectedFile.type);

      // 3. Confirm Document Upload
      setUploadStep('confirm');
      await candidateApi.confirmDocumentUpload(ticket.documentId);

      setSuccessMsg('Document successfully uploaded and queued for administrative review!');
      setSelectedFile(null);
      await loadStatus();
    } catch (err) {
      setError(err?.message || 'Failed to complete document upload. Please try again.');
    } finally {
      setSubmitting(false);
      setUploadStep('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Spinner size="lg" />
      </div>
    );
  }

  const docStatus = identityStatus?.documentStatus || 'UNVERIFIED';
  const activeDoc = identityStatus?.activeDocument;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4 sm:px-6 transition-colors">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Candidate Identity Verification
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Institutional compliance requires identity verification prior to examination access.
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
                  Your {activeDoc?.documentType?.replace('_', ' ')} (ending in ****{activeDoc?.documentNumberLast4})
                  has been verified. You have clearance for all assigned examinations.
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
                    Document Under Administrative Review
                  </h3>
                  <Badge variant="warning">PENDING REVIEW</Badge>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Your {activeDoc?.documentType?.replace('_', ' ')} (ending in ****{activeDoc?.documentNumberLast4})
                  was uploaded and is currently being inspected by institutional staff.
                </p>
                <div className="pt-2">
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
                  Please provide a clearer scan or alternate ID below to resubmit.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 2. Document Upload Form */}
        {(docStatus === 'UNVERIFIED' || docStatus === 'REJECTED') && (
          <Card className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {docStatus === 'REJECTED' ? 'Resubmit Identity Document' : 'Upload Government ID or Student Badge'}
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                Supported formats: JPG, PNG, PDF (Max size 5 MB). File is stored securely in encrypted private storage.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-4">
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

              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1 text-left">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Document Type <span className="text-rose-500">*</span>
                    </label>
                    <Select
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value)}
                      required
                    >
                      <SelectOption value="PASSPORT">Passport</SelectOption>
                      <SelectOption value="NATIONAL_ID">National Identity Card</SelectOption>
                      <SelectOption value="DRIVERS_LICENSE">Driving License</SelectOption>
                      <SelectOption value="STUDENT_ID">Institutional Student Badge</SelectOption>
                    </Select>
                  </div>

                  <div className="space-y-1 text-left">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Document Number <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      value={documentNumber}
                      onChange={(e) => setDocumentNumber(e.target.value)}
                      placeholder="e.g. A12345678"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1 text-left">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Full Name on Document <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      value={fullNameOnDocument}
                      onChange={(e) => setFullNameOnDocument(e.target.value)}
                      placeholder="As printed on document"
                      required
                    />
                  </div>

                  <div className="space-y-1 text-left">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Issuing Country (Optional)
                    </label>
                    <Input
                      value={issueCountry}
                      onChange={(e) => setIssueCountry(e.target.value)}
                      placeholder="e.g. United States"
                    />
                  </div>
                </div>

                {/* File Upload Drop Zone */}
                <div className="space-y-1 text-left">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Document File Scan <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-colors">
                    <UploadCloud className="h-10 w-10 text-slate-400 dark:text-slate-500 mb-2" />
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {selectedFile ? (
                        <span className="text-blue-600 dark:text-blue-400 font-semibold">{selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                      ) : (
                        'Click to select or drag and drop document scan'
                      )}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">JPEG, PNG, or PDF up to 5 MB</p>
                    <input
                      type="file"
                      id="doc-file-input"
                      accept=".jpg,.jpeg,.png,.pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('doc-file-input')?.click()}
                      className="mt-3 text-xs"
                    >
                      Browse Files
                    </Button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  disabled={submitting || !selectedFile}
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
                    'Upload & Submit for Review'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default CandidateDocumentUploadPage;
