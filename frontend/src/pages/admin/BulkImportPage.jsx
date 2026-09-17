/**
 * @file BulkImportPage.jsx
 * @description Administrative bulk ingestion interface for rosters (.xlsx, .xls, .csv) with validation preview,
 * atomic vs resilient transactional options, and credentials manifest export.
 */

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  AlertCircle,
  ShieldAlert,
  FileText,
  Layers,
} from 'lucide-react';

export function BulkImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [defaultRole, setDefaultRole] = useState('STUDENT');
  const [atomic, setAtomic] = useState(false);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  const [commitLoading, setCommitLoading] = useState(false);
  const [commitResult, setCommitResult] = useState(null);
  const [commitError, setCommitError] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewData(null);
      setCommitResult(null);
      setPreviewError(null);
      setCommitError(null);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      setPreviewError('Please select a spreadsheet file (.xlsx, .xls, .csv)');
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const data = await adminUsersApi.previewBulkImport(selectedFile, defaultRole);
      setPreviewData(data);
    } catch (err) {
      setPreviewError(err?.message || 'Failed to parse spreadsheet file');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!selectedFile) return;

    setCommitLoading(true);
    setCommitError(null);
    try {
      const result = await adminUsersApi.commitBulkImport(selectedFile, defaultRole, atomic);
      setCommitResult(result);
    } catch (err) {
      setCommitError(err?.message || 'Bulk ingestion failed');
    } finally {
      setCommitLoading(false);
    }
  };

  const downloadCredentialsCsv = () => {
    if (!commitResult?.credentials || commitResult.credentials.length === 0) return;

    const headers = ['Email', 'Name', 'Role', 'TemporaryPassword'];
    const rows = commitResult.credentials.map((c) => [
      `"${c.email}"`,
      `"${c.name}"`,
      `"${c.role || defaultRole}"`,
      `"${c.temporaryPassword}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `credentials_manifest_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
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
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <FileSpreadsheet className="h-7 w-7 text-primary" />
          Bulk User Spreadsheet Ingestion
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Batch provision students or faculty from Excel (.xlsx, .xls) or CSV files with pre-commit validation.
        </p>
      </div>

      {/* Step 1: Upload and Configuration */}
      <Card className="shadow-xs border-border/80">
        <CardHeader>
          <CardTitle className="text-base font-semibold">1. Select File & Transaction Mode</CardTitle>
          <CardDescription>
            Specify target institutional role and choose error handling strategy before processing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Target Role Roster
              </label>
              <select
                value={defaultRole}
                onChange={(e) => setDefaultRole(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="STUDENT">Student Roster (USN, Name, Email, Phone)</option>
                <option value="FACULTY">Faculty Roster (Employee ID, Name, Email, Phone)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Transaction Mode
              </label>
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="atomicMode"
                    checked={!atomic}
                    onChange={() => setAtomic(false)}
                    className="text-primary focus:ring-primary h-4 w-4"
                  />
                  <span>
                    <strong>Resilient:</strong> Commit valid, report invalid
                  </span>
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="atomicMode"
                    checked={atomic}
                    onChange={() => setAtomic(true)}
                    className="text-primary focus:ring-primary h-4 w-4"
                  />
                  <span>
                    <strong>Atomic:</strong> Roll back if any row fails
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* File Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              selectedFile
                ? 'border-primary bg-primary/5 dark:bg-primary/10'
                : 'border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <UploadCloud className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <div className="font-semibold text-foreground text-sm">
              {selectedFile ? selectedFile.name : 'Click to select Excel or CSV file'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Supported formats: .xlsx, .xls, .csv (Up to 10,000 rows). Passwords must never be included.
            </p>
          </div>

          {previewError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Validation Error</AlertTitle>
              <AlertDescription>{previewError}</AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="flex justify-end border-t border-border/60 p-4">
          <Button
            disabled={!selectedFile || previewLoading}
            onClick={handleAnalyze}
            className="flex items-center gap-2"
          >
            {previewLoading && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            <span>Analyze & Validate Spreadsheet</span>
          </Button>
        </CardFooter>
      </Card>

      {/* Step 2: Validation Preview */}
      {previewData && !commitResult && (
        <Card className="shadow-xs border-border/80">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold">2. Pre-Commit Validation Summary</CardTitle>
                <CardDescription>
                  Review spreadsheet parsing diagnostics before generating user credentials.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Total: {previewData.summary?.total}</Badge>
                <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
                  Valid: {previewData.summary?.valid}
                </Badge>
                {previewData.summary?.invalid > 0 && (
                  <Badge variant="destructive">Invalid: {previewData.summary?.invalid}</Badge>
                )}
                {previewData.summary?.duplicatesInFile > 0 && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                    Duplicates: {previewData.summary?.duplicatesInFile}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {previewData.errors?.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 max-h-[220px] overflow-y-auto">
                <div className="flex items-center gap-2 text-destructive text-sm font-semibold mb-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>Row Validation Issues Detected ({previewData.errors.length}):</span>
                </div>
                <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-5">
                  {previewData.errors.map((err, idx) => (
                    <li key={idx}>
                      Row {err.row}: <span className="font-semibold text-foreground">{err.email || 'Unknown'}</span> — {err.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {atomic && previewData.summary?.invalid > 0 && (
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Atomic Mode Invariant Violated</AlertTitle>
                <AlertDescription className="text-xs">
                  Ingestion is blocked because {previewData.summary?.invalid} invalid row(s) were found. Fix the spreadsheet or switch to Resilient Mode.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="flex justify-end border-t border-border/60 p-4">
            <Button
              disabled={(atomic && previewData.summary?.invalid > 0) || commitLoading}
              onClick={handleCommit}
              className="flex items-center gap-2"
            >
              {commitLoading && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              <span>Commit Ingestion & Issue Credentials ({previewData.summary?.valid || 0} Accounts)</span>
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 3: Ingestion Result & Credentials Manifest */}
      {commitResult && (
        <Card className="shadow-xs border-border/80">
          <CardContent className="p-6 space-y-6">
            <div className="text-center py-4 space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Ingestion Completed Successfully</h2>
              <p className="text-sm text-muted-foreground">
                Successfully created <strong className="text-foreground">{commitResult.summary?.created}</strong> accounts.
                {commitResult.summary?.failed > 0 && (
                  <> Failed: <strong className="text-destructive">{commitResult.summary?.failed}</strong>.</>
                )}
              </p>
            </div>

            <Alert variant="default" className="border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <AlertTitle className="font-semibold">Security Warning</AlertTitle>
              <AlertDescription className="text-xs">
                Generated temporary passwords are only available right now and cannot be retrieved later. Download the manifest now to distribute credentials to candidates.
              </AlertDescription>
            </Alert>

            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-foreground">
                Generated Credentials Manifest ({commitResult.credentials?.length || 0} accounts)
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadCredentialsCsv}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4 text-primary" />
                <span>Download Manifest (.csv)</span>
              </Button>
            </div>

            <div className="rounded-lg border border-border/80 overflow-hidden max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Temporary Password</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commitResult.credentials?.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-foreground text-xs">{c.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{c.email}</TableCell>
                      <TableCell className="font-mono font-bold text-xs text-primary">{c.temporaryPassword}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => navigate('/admin/users')}>
                Return to User Roster
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {commitError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Ingestion Error</AlertTitle>
          <AlertDescription>{commitError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
