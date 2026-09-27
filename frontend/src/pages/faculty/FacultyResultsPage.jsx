/**
 * @file FacultyResultsPage.jsx
 * @description Detailed Examination Results & Analytics View for Faculty.
 * Displays overall summary statistics (Highest Score, Average Score, Pass/Fail ratio),
 * interactive visual charts (Pass/Fail donut & Score Distribution bar chart),
 * and a searchable, sortable data table with student roll numbers, scores, and status.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as facultyApi from '../../api/facultyApi.js';
import * as resultsApi from '../../api/resultsApi.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';
import {
  ArrowLeft,
  Award,
  Users,
  CheckCircle2,
  XCircle,
  BarChart3,
  Calendar,
  Clock,
  RefreshCw,
  Search,
  ArrowUpDown,
  GraduationCap,
  Building2,
  AlertCircle,
  ChevronRight,
  TrendingUp,
  SlidersHorizontal,
  Send,
  PieChart as PieIcon,
} from 'lucide-react';

function formatDateTime(val) {
  if (!val) return 'TBA';
  return new Date(val).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function FacultyResultsPage() {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Table Search & Sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortField, setSortField] = useState('score');
  const [sortAsc, setSortAsc] = useState(false);

  async function loadAnalytics() {
    setLoading(true);
    setError('');
    try {
      const res = await facultyApi.getExamAnalyticsSummary(examId);
      setData(res);
    } catch (err) {
      setError(err?.message || 'Failed to load examination analytics summary');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (examId) loadAnalytics();
  }, [examId]);

  const exam = data?.exam;
  const summary = data?.summary;
  const distribution = data?.distribution;
  const rawStudents = data?.students || [];

  // Filtered & Sorted student list
  const filteredStudents = useMemo(() => {
    let list = [...rawStudents];

    // Status filter
    if (statusFilter !== 'ALL') {
      list = list.filter((s) => s.status === statusFilter);
    }

    // Search query filter (name, roll_number, email)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (s) =>
          (s.student_name || '').toLowerCase().includes(q) ||
          (s.roll_number || '').toLowerCase().includes(q) ||
          (s.student_email || '').toLowerCase().includes(q)
      );
    }

    // Sorting
    list.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (sortField === 'score' || sortField === 'percentage') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      } else {
        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
      }

      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }, [rawStudents, searchTerm, statusFilter, sortField, sortAsc]);

  function handleSort(field) {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(false); // default desc for scores
    }
  }

  // Distribution chart max calculation for scaling
  const maxBinCount = Math.max(
    distribution?.bin_0_20 || 0,
    distribution?.bin_20_40 || 0,
    distribution?.bin_40_60 || 0,
    distribution?.bin_60_80 || 0,
    distribution?.bin_80_100 || 0,
    1
  );

  const evaluated = summary?.evaluated_count || 0;
  const passCount = summary?.pass_count || 0;
  const failCount = summary?.fail_count || 0;
  const passPercentage = summary?.pass_percentage ?? (evaluated > 0 ? Math.round((passCount / evaluated) * 100) : 0);

  if (loading || error || !data) {
    return (
      <div className="max-w-7xl mx-auto py-12">
        <StateBoundary
          isLoading={loading}
          error={error}
          isEmpty={!data}
          loadingMessage="Loading examination analytics and student score rosters..."
          emptyTitle="Examination Analytics Unavailable"
          emptyDescription="The requested examination analytics could not be retrieved. Please check the exam ID or retry."
          onRetry={loadAnalytics}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto">
      {/* Top Navigation */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/faculty/exams')}
          className="text-xs h-8 gap-1.5 text-slate-700 hover:text-slate-900 border-slate-300"
        >
          <ArrowLeft size={13} />
          <span>Back to Exams</span>
        </Button>
      </div>

      {/* Header Banner */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
            Results & Scoring Analytics
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-xs text-slate-500">
            Concluded {formatDateTime(exam?.scheduled_end_time || exam?.created_at)}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {exam?.title || 'Exam Results'}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 mt-1">
              <span className="flex items-center gap-1">
                <GraduationCap size={13} className="text-slate-400" />
                Target: {exam?.target_semester ? `${exam.target_semester}th Semester` : 'All'}
              </span>
              <span className="flex items-center gap-1">
                <Building2 size={13} className="text-slate-400" />
                {exam?.target_department || 'General Branch'}
              </span>
              <span>&bull;</span>
              <span>Total Marks: <strong>{exam?.total_marks || 100}</strong></span>
              <span>&bull;</span>
              <span>Passing Threshold: <strong>{exam?.passing_marks || 40}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={loadAnalytics}
              className="text-xs h-9 gap-1.5"
            >
              <RefreshCw size={13} /> Refresh
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Overall Results: Summary Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Highest Score */}
        <Card className="border border-slate-200 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Highest Score
              </span>
              <Award size={16} className="text-amber-500" />
            </div>
            <p className="text-2xl font-black text-slate-900">
              {summary?.highest_score ?? '—'} <span className="text-xs text-slate-400 font-medium">/ {exam?.total_marks}</span>
            </p>
            <p className="text-[11px] text-slate-400">Top candidate score</p>
          </CardContent>
        </Card>

        {/* Average Score */}
        <Card className="border border-slate-200 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Average Score
              </span>
              <TrendingUp size={16} className="text-blue-500" />
            </div>
            <p className="text-2xl font-black text-blue-600">
              {summary?.average_score ?? '—'} <span className="text-xs text-slate-400 font-medium">/ {exam?.total_marks}</span>
            </p>
            <p className="text-[11px] text-slate-400">Class mean score</p>
          </CardContent>
        </Card>

        {/* Total Candidates Evaluated */}
        <Card className="border border-slate-200 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Evaluated
              </span>
              <Users size={16} className="text-purple-500" />
            </div>
            <p className="text-2xl font-black text-purple-600">
              {evaluated}
            </p>
            <p className="text-[11px] text-slate-400">Total student submissions</p>
          </CardContent>
        </Card>

        {/* Pass Rate */}
        <Card className="border border-slate-200 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Overall Pass Rate
              </span>
              <CheckCircle2 size={16} className="text-emerald-500" />
            </div>
            <p className="text-2xl font-black text-emerald-600">
              {passPercentage}%
            </p>
            <p className="text-[11px] text-slate-400">{passCount} passed &bull; {failCount} failed</p>
          </CardContent>
        </Card>
      </div>

      {/* Visual Analytics Section: Pass/Fail Ratio & Score Distribution Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Pass vs Fail Ratio */}
        <Card className="border border-slate-200 shadow-xs bg-white">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PieIcon size={16} className="text-blue-600" /> Pass / Fail Ratio
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Proportion of students meeting the {exam?.passing_marks || 40} marks passing threshold.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 flex flex-col items-center justify-center space-y-5">
            {evaluated === 0 ? (
              <div className="py-8 text-xs text-slate-400">No evaluations yet</div>
            ) : (
              <>
                {/* Donut graphic representation */}
                <div className="relative w-36 h-36 rounded-full border-8 border-slate-100 flex items-center justify-center">
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `conic-gradient(#10b981 0% ${passPercentage}%, #ef4444 ${passPercentage}% 100%)`,
                      mask: 'radial-gradient(transparent 58%, black 60%)',
                      WebkitMask: 'radial-gradient(transparent 58%, black 60%)',
                    }}
                  />
                  <div className="text-center z-10">
                    <span className="text-2xl font-black text-slate-900">{passPercentage}%</span>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Pass Rate
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 w-full pt-2">
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                    <span className="text-xs font-semibold text-emerald-800">Passed</span>
                    <p className="text-lg font-black text-emerald-700">{passCount}</p>
                    <span className="text-[10px] text-emerald-600">{passPercentage}% of cohort</span>
                  </div>

                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-center">
                    <span className="text-xs font-semibold text-rose-800">Failed</span>
                    <p className="text-lg font-black text-rose-700">{failCount}</p>
                    <span className="text-[10px] text-rose-600">
                      {100 - passPercentage}% of cohort
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Chart 2: Score Distribution Bar Chart */}
        <Card className="border border-slate-200 shadow-xs bg-white lg:col-span-2">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 size={16} className="text-purple-600" /> Score Distribution Histogram
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Student percentage score allocation across 5 performance tiers.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6">
            {evaluated === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">No score distribution data</div>
            ) : (
              <div className="space-y-4">
                {[
                  { label: '81% - 100% (Distinction)', count: distribution?.bin_80_100 || 0, color: 'bg-emerald-500', barBg: 'bg-emerald-50' },
                  { label: '61% - 80% (First Class)', count: distribution?.bin_60_80 || 0, color: 'bg-blue-500', barBg: 'bg-blue-50' },
                  { label: '41% - 60% (Second Class)', count: distribution?.bin_40_60 || 0, color: 'bg-amber-500', barBg: 'bg-amber-50' },
                  { label: '21% - 40% (Pass / Remedial)', count: distribution?.bin_20_40 || 0, color: 'bg-orange-500', barBg: 'bg-orange-50' },
                  { label: '0% - 20% (Critical Risk)', count: distribution?.bin_0_20 || 0, countColor: 'text-rose-600', color: 'bg-rose-500', barBg: 'bg-rose-50' },
                ].map((tier, idx) => {
                  const pct = Math.round((tier.count / maxBinCount) * 100);
                  const cohortShare = evaluated > 0 ? Math.round((tier.count / evaluated) * 100) : 0;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">{tier.label}</span>
                        <span className="font-bold text-slate-900">
                          {tier.count} students <span className="text-slate-400 font-normal">({cohortShare}%)</span>
                        </span>
                      </div>
                      <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${tier.color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Individual Scores: Searchable, Sortable Data Table */}
      <Card className="border border-slate-200 shadow-xs bg-white">
        <CardHeader className="pb-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users size={17} className="text-slate-600" /> Individual Student Scores ({filteredStudents.length})
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Detailed roster of student submissions, institutional roll numbers (USN), and marks.
              </CardDescription>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-56">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                <Input
                  placeholder="Search name, USN, email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="PASSED">Passed Only</option>
                <option value="FAILED">Failed Only</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredStudents.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500 space-y-1">
              <Users size={28} className="mx-auto text-slate-300 stroke-1 mb-2" />
              <p className="font-semibold text-slate-800">No Student Records Found</p>
              <p>
                {searchTerm
                  ? `No students matched "${searchTerm}". Try clearing search filters.`
                  : 'Student submissions will appear here once candidates complete and submit the exam.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead
                      onClick={() => handleSort('student_name')}
                      className="text-xs font-bold text-slate-700 cursor-pointer hover:text-slate-900 select-none"
                    >
                      <div className="flex items-center gap-1">
                        Student Name <ArrowUpDown size={12} className="text-slate-400" />
                      </div>
                    </TableHead>

                    <TableHead
                      onClick={() => handleSort('roll_number')}
                      className="text-xs font-bold text-slate-700 cursor-pointer hover:text-slate-900 select-none"
                    >
                      <div className="flex items-center gap-1">
                        Roll Number (USN) <ArrowUpDown size={12} className="text-slate-400" />
                      </div>
                    </TableHead>

                    <TableHead className="text-xs font-bold text-slate-700">Email</TableHead>

                    <TableHead
                      onClick={() => handleSort('score')}
                      className="text-xs font-bold text-slate-700 cursor-pointer hover:text-slate-900 select-none text-right"
                    >
                      <div className="flex items-center justify-end gap-1">
                        Score <ArrowUpDown size={12} className="text-slate-400" />
                      </div>
                    </TableHead>

                    <TableHead
                      onClick={() => handleSort('percentage')}
                      className="text-xs font-bold text-slate-700 cursor-pointer hover:text-slate-900 select-none text-right"
                    >
                      <div className="flex items-center justify-end gap-1">
                        Percentage <ArrowUpDown size={12} className="text-slate-400" />
                      </div>
                    </TableHead>

                    <TableHead className="text-xs font-bold text-slate-700 text-center">Status</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">Breakdown</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredStudents.map((st) => (
                    <TableRow key={st.student_id} className="h-12 hover:bg-slate-50/50">
                      <TableCell className="font-bold text-slate-900 text-xs">
                        {st.student_name}
                      </TableCell>

                      <TableCell className="text-xs font-mono font-semibold text-blue-700">
                        {st.roll_number || 'N/A'}
                      </TableCell>

                      <TableCell className="text-xs text-slate-500 font-mono">
                        {st.student_email}
                      </TableCell>

                      <TableCell className="text-xs font-bold text-slate-900 text-right">
                        {st.score} <span className="text-slate-400 font-normal">/ {exam?.total_marks}</span>
                      </TableCell>

                      <TableCell className="text-xs font-bold text-slate-800 text-right">
                        {st.percentage !== undefined ? `${st.percentage}%` : '—'}
                      </TableCell>

                      <TableCell className="text-center">
                        <Badge
                          variant={st.status === 'PASSED' ? 'success' : 'destructive'}
                          className="text-[10px] uppercase font-bold"
                        >
                          {st.status}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-xs text-slate-500 text-center">
                        <span className="text-emerald-700 font-bold">{st.correct_count ?? 0}C</span> &bull;{' '}
                        <span className="text-rose-600 font-bold">{st.wrong_count ?? 0}W</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default FacultyResultsPage;
