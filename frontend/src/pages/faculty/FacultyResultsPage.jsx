/**
 * @file FacultyResultsPage.jsx
 * @description Staff results portal with KPI summary cards, candidate scores, manual grading entry points,
 * psychometric analytics (item difficulty P-value, discrimination index Di/r_pbis, 10-bin score histograms),
 * and release policies.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  Users,
  CheckCircle2,
  XCircle,
  BarChart3,
  Calendar,
  Layers,
  RefreshCw,
  Clock,
  Send,
  SlidersHorizontal,
  AlertCircle,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import * as resultsApi from '../../api/resultsApi.js';
import * as examsApi from '../../api/examsApi.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';
import { Input } from '../../components/ui/input.jsx';

function getExamStatusBadge(status) {
  switch (status) {
    case 'RESULT_PUBLISHED':
      return <Badge variant="success">Results Published</Badge>;
    case 'COMPLETED':
      return <Badge variant="outline">Exam Concluded</Badge>;
    case 'ACTIVE':
      return <Badge variant="default">Active Exam</Badge>;
    default:
      return <Badge variant="secondary">{status || 'Draft'}</Badge>;
  }
}

export function FacultyResultsPage() {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [exam, setExam] = useState(null);
  const [summary, setSummary] = useState(null);
  const [results, setResults] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('roster');

  // Publication Modal
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState('');

  // Policy Modal
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [policyType, setPolicyType] = useState('IMMEDIATE');
  const [scheduledTime, setScheduledTime] = useState('');
  const [updatingPolicy, setUpdatingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [examData, summaryData, resultsData] = await Promise.all([
        examsApi.getExam(examId),
        resultsApi.getExamResultsSummary(examId).catch(() => null),
        resultsApi.getExamResults(examId).catch(() => []),
      ]);
      setExam(examData);
      setSummary(summaryData);
      setResults(Array.isArray(resultsData) ? resultsData : []);
      if (examData?.results_release_policy) {
        setPolicyType(examData.results_release_policy);
      }
    } catch (err) {
      setError(err.message || 'Failed to load exam results data');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoadingAnalytics(true);
      const data = await examsApi.getExamAnalytics(examId);
      setAnalytics(data);
    } catch (err) {
      setError(err.message || 'Failed to load psychometric analytics');
    } finally {
      setLoadingAnalytics(false);
    }
  }, [examId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'analytics' && !analytics) {
      loadAnalytics();
    }
  }, [activeTab, analytics, loadAnalytics]);

  async function handlePublish() {
    setPublishing(true);
    setPublishMessage('');
    try {
      await resultsApi.publishExamResults(examId);
      setIsPublishOpen(false);
      await loadData();
    } catch (err) {
      setPublishMessage(err.message || 'Failed to trigger result publication');
    } finally {
      setPublishing(false);
    }
  }

  async function handleUpdatePolicy(e) {
    e.preventDefault();
    setPolicyError('');
    setUpdatingPolicy(true);

    try {
      const payload = {
        results_release_policy: policyType,
        scheduled_publish_at: policyType === 'SCHEDULED' ? new Date(scheduledTime).toISOString() : null,
      };
      await resultsApi.updateReleasePolicy(examId, payload);
      setIsPolicyOpen(false);
      await loadData();
    } catch (err) {
      setPolicyError(err.message || 'Failed to update result release policy');
    } finally {
      setUpdatingPolicy(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full max-w-5xl mx-auto py-20 text-center space-y-3">
        <RefreshCw size={28} className="animate-spin mx-auto text-slate-400" />
        <p className="text-sm font-medium text-slate-500">Loading examination results and evaluation data...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-12">
      {/* Back Button */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/faculty')}
          className="text-xs h-8 gap-1.5 text-slate-700 dark:text-slate-300"
        >
          <ArrowLeft size={13} />
          <span>Back to Faculty Dashboard</span>
        </Button>
      </div>

      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Assessment Analytics
          </span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Results & Scoring Summary
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {exam?.title || 'Exam Results'}
              </h1>
              {getExamStatusBadge(exam?.status)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
              <span>Release Policy: <strong className="font-semibold text-slate-700 dark:text-slate-300">{exam?.results_release_policy || 'IMMEDIATE'}</strong></span>
              <span>•</span>
              <span>Total Marks: <strong className="font-semibold text-slate-700 dark:text-slate-300">{exam?.total_marks || 100}</strong></span>
              <span>•</span>
              <span>Passing: <strong className="font-semibold text-slate-700 dark:text-slate-300">{exam?.passing_marks || 40}</strong></span>
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPolicyOpen(true)}
              className="text-xs h-9 gap-1.5"
            >
              <SlidersHorizontal size={13} />
              <span>Configure Policy</span>
            </Button>
            <Button
              size="sm"
              disabled={exam?.status === 'DRAFT' || exam?.status === 'RESULT_PUBLISHED'}
              onClick={() => setIsPublishOpen(true)}
              className="text-xs h-9 gap-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              <Send size={13} />
              <span>Publish Results</span>
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle size={16} />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardContent className="p-4 space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Attempts
              </span>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {summary.total_attempts}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardContent className="p-4 space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Evaluated
              </span>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {summary.evaluated_count}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardContent className="p-4 space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Passed
              </span>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {summary.pass_count}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardContent className="p-4 space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">
                Failed
              </span>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {summary.fail_count}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardContent className="p-4 space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Average Score
              </span>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {summary.average_score !== null && summary.average_score !== undefined
                  ? Number(summary.average_score).toFixed(1)
                  : '—'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
          <TabsList>
            <TabsTrigger value="roster">
              Candidate Records ({results.length})
            </TabsTrigger>
            <TabsTrigger value="analytics">
              Psychometrics & Histograms
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Candidates Roster */}
        <TabsContent value="roster" className="pt-2">
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users size={16} className="text-slate-600 dark:text-slate-400" />
                Candidate Performance Records ({results.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Review automated scores, percentage rankings, and proceed to subjective manual grading.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0">
              {results.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
                  <Users size={28} className="mx-auto text-slate-400 dark:text-slate-600 stroke-1 mb-2" />
                  <p className="font-semibold text-slate-800 dark:text-slate-200">No Candidate Records Yet</p>
                  <p>Evaluated attempts and submitted responses will appear here as students complete the exam.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[30%]">Candidate</TableHead>
                        <TableHead className="w-[25%]">Email</TableHead>
                        <TableHead className="w-[15%]">Score</TableHead>
                        <TableHead className="w-[12%]">Percentage</TableHead>
                        <TableHead className="w-[10%]">Status</TableHead>
                        <TableHead className="w-[8%] text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((r) => {
                        const id = r.id || r.attempt_id;
                        return (
                          <TableRow key={r.attempt_id} className="h-12">
                            <TableCell className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                              {r.student_name || 'Candidate'}
                            </TableCell>
                            <TableCell className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                              {r.student_email || '—'}
                            </TableCell>
                            <TableCell className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {r.score} / {r.total_marks}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 dark:text-slate-400">
                              {r.percentage !== undefined ? `${Number(r.percentage).toFixed(2)}%` : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={r.is_passed ? 'success' : 'destructive'} size="sm">
                                {r.is_passed ? 'PASSED' : 'FAILED'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/faculty/grading/${id}`)}
                                className="h-8 text-xs font-medium gap-1"
                              >
                                <span>Grade</span>
                                <ChevronRight size={12} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Analytics & Histograms */}
        <TabsContent value="analytics" className="pt-2 space-y-4">
          {loadingAnalytics ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw size={28} className="animate-spin mx-auto text-slate-400" />
              <p className="text-sm font-medium text-slate-500">Computing psychometric item analytics...</p>
            </div>
          ) : !analytics ? (
            <Card className="border-slate-200 dark:border-slate-800 p-12 text-center text-xs text-slate-500">
              No psychometric analytics computed yet.
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Timing and Sample Size KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                  <CardContent className="p-4 space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Sample Size
                    </span>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {analytics.sampleSize} Attempts
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                  <CardContent className="p-4 space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Mean Duration
                    </span>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {analytics.completionTimeStats?.meanMinutes ?? '—'} mins
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                  <CardContent className="p-4 space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Median Duration
                    </span>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {analytics.completionTimeStats?.medianMinutes ?? '—'} mins
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                  <CardContent className="p-4 space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      P90 Duration
                    </span>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {analytics.completionTimeStats?.p90Minutes ?? '—'} mins
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* 10-Bin Score Histogram */}
              <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 size={16} className="text-slate-600 dark:text-slate-400" />
                    10-Bin Score Distribution Histogram
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="flex items-end h-44 gap-2 pt-6">
                    {analytics.scoreHistogram?.bins?.map((b) => {
                      const maxCount = Math.max(1, ...(analytics.scoreHistogram.bins.map((x) => x.count) || [1]));
                      const heightPct = Math.round((b.count / maxCount) * 100);
                      return (
                        <div key={b.bin} className="flex-1 flex flex-col items-center h-full justify-end">
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            {b.count}
                          </span>
                          <div
                            style={{ height: `${Math.max(4, heightPct)}%` }}
                            className={`w-full rounded-t-sm transition-all duration-300 ${
                              b.count > 0
                                ? 'bg-blue-600 dark:bg-blue-500'
                                : 'bg-slate-100 dark:bg-slate-800'
                            }`}
                          />
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 rotate-[-25deg] whitespace-nowrap">
                            {b.bin}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Psychometric Item Metrics Table */}
              <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp size={16} className="text-slate-600 dark:text-slate-400" />
                    Item Difficulty (P-Value) & Upper/Lower 27% Discrimination Index
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Evaluates question quality and ability to discriminate top-performing candidates.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {analytics.itemMetrics && analytics.itemMetrics.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40%]">Question Prompt</TableHead>
                            <TableHead className="w-[12%]">P-Value</TableHead>
                            <TableHead className="w-[14%]">Difficulty</TableHead>
                            <TableHead className="w-[12%]">Di (Discrim.)</TableHead>
                            <TableHead className="w-[12%]">r_pbis</TableHead>
                            <TableHead className="w-[10%]">Rating</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analytics.itemMetrics.map((item) => (
                            <TableRow key={item.questionId} className="h-12">
                              <TableCell className="font-medium text-xs text-slate-900 dark:text-slate-100 max-w-xs truncate">
                                {item.prompt}
                              </TableCell>
                              <TableCell className="text-xs font-semibold">
                                {item.pValue !== undefined ? Number(item.pValue).toFixed(2) : '—'}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    item.difficultyRating === 'HARD'
                                      ? 'destructive'
                                      : item.difficultyRating === 'MODERATE'
                                      ? 'secondary'
                                      : 'success'
                                  }
                                  size="sm"
                                >
                                  {item.difficultyRating}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs font-semibold">
                                {item.discriminationIndex !== undefined ? Number(item.discriminationIndex).toFixed(2) : '—'}
                              </TableCell>
                              <TableCell className="text-xs text-slate-600 dark:text-slate-400">
                                {item.pointBiserial !== undefined ? Number(item.pointBiserial).toFixed(2) : '—'}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    item.discriminationRating === 'EXCELLENT'
                                      ? 'success'
                                      : item.discriminationRating === 'GOOD'
                                      ? 'secondary'
                                      : 'warning'
                                  }
                                  size="sm"
                                >
                                  {item.discriminationRating}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No item difficulty metrics recorded yet.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Manual Publish Dialog */}
      <Dialog open={isPublishOpen} onOpenChange={setIsPublishOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Publish Assessment Results</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Publishing will make scores, rank percentiles, and performance breakdowns visible to all candidates who completed this examination.
            </DialogDescription>
          </DialogHeader>

          {publishMessage && (
            <Alert variant="destructive">
              <AlertCircle size={15} />
              <AlertDescription>{publishMessage}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPublishOpen(false)}
              disabled={publishing}
              className="h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handlePublish}
              disabled={publishing}
              className="h-9 text-xs gap-1.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
            >
              {publishing && <RefreshCw size={13} className="animate-spin" />}
              <span>Confirm Publication</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Policy Configuration Dialog */}
      <Dialog open={isPolicyOpen} onOpenChange={setIsPolicyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Configure Release Policy</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Select how and when candidate scorecards become accessible.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdatePolicy} className="space-y-4 pt-1">
            {policyError && (
              <Alert variant="destructive">
                <AlertCircle size={15} />
                <AlertDescription>{policyError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 p-2.5 rounded-md border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850">
                <input
                  type="radio"
                  name="policyType"
                  value="IMMEDIATE"
                  checked={policyType === 'IMMEDIATE'}
                  onChange={() => setPolicyType('IMMEDIATE')}
                  className="accent-slate-900"
                />
                <div>
                  <strong className="block font-semibold text-slate-900 dark:text-slate-100">Immediate Auto-Release</strong>
                  <span className="text-slate-500">Scorecard unlocks immediately after automated scoring completes.</span>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-md border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850">
                <input
                  type="radio"
                  name="policyType"
                  value="SCHEDULED"
                  checked={policyType === 'SCHEDULED'}
                  onChange={() => setPolicyType('SCHEDULED')}
                  className="accent-slate-900"
                />
                <div>
                  <strong className="block font-semibold text-slate-900 dark:text-slate-100">Scheduled Release Window</strong>
                  <span className="text-slate-500">Scorecard unlocks at an institutional future date and time.</span>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-md border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850">
                <input
                  type="radio"
                  name="policyType"
                  value="MANUAL"
                  checked={policyType === 'MANUAL'}
                  onChange={() => setPolicyType('MANUAL')}
                  className="accent-slate-900"
                />
                <div>
                  <strong className="block font-semibold text-slate-900 dark:text-slate-100">Manual Department Approval</strong>
                  <span className="text-slate-500">Results remain private until faculty manually clicks 'Publish'.</span>
                </div>
              </label>
            </div>

            {policyType === 'SCHEDULED' && (
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Scheduled Release Date & Time *
                </label>
                <Input
                  type="datetime-local"
                  required
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            )}

            <DialogFooter className="gap-2 pt-3">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setIsPolicyOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={updatingPolicy}
                className="h-9 text-xs gap-1.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
              >
                {updatingPolicy && <RefreshCw size={13} className="animate-spin" />}
                <span>Save Policy</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FacultyResultsPage;
