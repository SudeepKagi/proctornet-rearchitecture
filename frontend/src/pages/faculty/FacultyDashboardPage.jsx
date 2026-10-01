/**
 * @file FacultyDashboardPage.jsx
 * @description Modern, responsive overview dashboard for Faculty examination management.
 * Features statistical KPI cards, quick-glance concluded exam pass rate widget, and recent examinations.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as facultyApi from '../../api/facultyApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Award,
  Users,
  Layers,
  GraduationCap,
  Building2,
  AlertCircle,
  FileText,
  BarChart3,
  BookOpen,
  Shield,
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

function getStatusBadge(status) {
  switch (status) {
    case 'SCHEDULED':
      return <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">Scheduled</Badge>;
    case 'LIVE':
      return <Badge variant="success" className="gap-1 animate-pulse">● Live Now</Badge>;
    case 'ENDED':
    case 'EVALUATED':
    case 'RESULT_PUBLISHED':
      return <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50/50">Concluded</Badge>;
    case 'CANCELLED':
      return <Badge variant="destructive">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function FacultyDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadStats() {
    setLoading(true);
    setError('');
    try {
      const data = await facultyApi.getDashboardStats();
      setStats(data);
    } catch (err) {
      setError(err?.message || 'Failed to load faculty metrics. Please refresh.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  const recentExam = stats?.recentExam;

  return (
    <div className="space-y-7 pb-16 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <span>Teacher Workspace</span> &bull; <span>Academic Portal</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Teacher Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Welcome back, {user?.name || 'Professor'}. Create exams, monitor live test sessions, and view student results.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadStats}
            disabled={loading}
            className="gap-1.5 h-9 text-xs cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => navigate('/faculty/exams/create')}
            className="gap-1.5 h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs cursor-pointer"
          >
            <Plus size={14} /> Create Exam
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* 4 Statistical KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Exams Conducted */}
        <Card className="border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Exams Conducted
              </p>
              <h3 className="text-2xl font-black text-slate-900">
                {loading ? '-' : stats?.totalExamsConducted ?? 0}
              </h3>
              <p className="text-[11px] text-slate-400">Past concluded exams</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <CheckCircle2 size={24} />
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Upcoming Exams Scheduled */}
        <Card className="border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Upcoming Exams
              </p>
              <h3 className="text-2xl font-black text-blue-600">
                {loading ? '-' : stats?.upcomingExamsScheduled ?? 0}
              </h3>
              <p className="text-[11px] text-slate-400">Scheduled & active cohorts</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Calendar size={24} />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Total Exams Created */}
        <Card className="border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Exams Created
              </p>
              <h3 className="text-2xl font-black text-purple-600">
                {loading ? '-' : stats?.totalExamsCreated ?? stats?.totalQuestionPools ?? 0}
              </h3>
              <p className="text-[11px] text-slate-400">Authored by you</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <BookOpen size={24} />
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Average Student Performance */}
        <Card className="border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Avg. Performance
              </p>
              <h3 className="text-2xl font-black text-emerald-600">
                {loading ? '-' : `${stats?.averageStudentPerformance ?? 0}%`}
              </h3>
              <p className="text-[11px] text-slate-400">Across student submissions</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <TrendingUp size={24} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick-Glance Widget: Most Recently Concluded Exam */}
      {recentExam && (
        <Card className="border-2 border-emerald-200/80 bg-gradient-to-r from-emerald-50/40 to-slate-50 shadow-xs">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-white font-semibold">
                    Recently Concluded
                  </Badge>
                  <span className="text-xs text-slate-500">
                    Concluded {formatDateTime(recentExam.concluded_at)}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-slate-900 leading-snug">
                  {recentExam.title}
                </h3>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <GraduationCap size={14} className="text-slate-400" />
                    Semester {recentExam.target_semester}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Building2 size={14} className="text-slate-400" />
                    {recentExam.department_name || 'General Branch'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users size={14} className="text-slate-400" />
                    {recentExam.evaluated_count} Students Evaluated
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-5 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full border-4 border-emerald-500 flex flex-col items-center justify-center bg-white shadow-xs">
                    <span className="text-sm font-black text-emerald-700 leading-none">
                      {recentExam.pass_percentage}%
                    </span>
                    <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-tighter">Pass</span>
                  </div>
                  <div className="text-xs space-y-0.5">
                    <p className="font-semibold text-slate-900">
                      {recentExam.pass_count} Passed &bull; {recentExam.fail_count} Failed
                    </p>
                    <p className="text-slate-500">Avg Score: {recentExam.average_score ?? 0} / {recentExam.total_marks}</p>
                  </div>
                </div>

                <Button
                  onClick={() => navigate(`/faculty/exams/${recentExam.exam_id}/results`)}
                  className="bg-slate-900 hover:bg-slate-800 text-white h-10 px-4 text-xs font-semibold gap-1.5 shadow-xs cursor-pointer"
                >
                  <BarChart3 size={14} /> View Results <ArrowRight size={14} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Action Navigation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => navigate('/faculty/exams/create')}
          className="p-5 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-sm cursor-pointer transition-all space-y-2 group"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Plus size={20} />
          </div>
          <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
            Create New Exam
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            Set exam info, time limit, select branch & semester, and build questions manually or with AI from PDF.
          </p>
        </div>

        <div
          onClick={() => navigate('/faculty/exams')}
          className="p-5 rounded-xl border border-slate-200 bg-white hover:border-emerald-400 hover:shadow-sm cursor-pointer transition-all space-y-2 group"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Calendar size={20} />
          </div>
          <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
            Manage Examinations
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            View scheduled tests, monitor live student sessions, edit details, or cancel upcoming exams.
          </p>
        </div>

        <div
          onClick={() => navigate('/faculty/exams')}
          className="p-5 rounded-xl border border-slate-200 bg-white hover:border-purple-400 hover:shadow-sm cursor-pointer transition-all space-y-2 group"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
            <BarChart3 size={20} />
          </div>
          <h4 className="text-sm font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
            Student Results & Analytics
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            Inspect individual student scores, pass/fail status, and proctoring violations for completed tests.
          </p>
        </div>
      </div>

      {/* Recent Examinations List */}
      <Card className="border border-slate-200 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-bold text-slate-900">Recent Examinations</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Active, upcoming, and recently concluded examination schedules.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/faculty/exams')}
            className="text-xs h-8 gap-1 cursor-pointer"
          >
            View All Exams <ArrowRight size={13} />
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          <StateBoundary
            isLoading={loading}
            error={error}
            isEmpty={!stats?.recentExams || stats.recentExams.length === 0}
            loadingMessage="Loading recent examinations..."
            emptyTitle="No Examinations Authored Yet"
            emptyDescription="Create your first examination to assign questions to students of a specific branch & semester."
            onRetry={loadStats}
          >
            <div className="divide-y divide-slate-100">
              {(stats?.recentExams || []).map((exam) => (
                <div
                  key={exam.exam_id}
                  className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(exam.status)}
                      <span className="text-xs text-slate-400 font-medium">
                        {formatDateTime(exam.scheduled_start_time)}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 leading-snug">
                      {exam.title}
                    </h4>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Sem {exam.target_semester}</span>
                      <span>&bull;</span>
                      <span>{exam.department_name || 'General Branch'}</span>
                      <span>&bull;</span>
                      <span>{exam.duration_minutes} mins</span>
                      <span>&bull;</span>
                      <span>{exam.student_count || 0} students assigned</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {exam.session_id && (
                      <Button
                        size="sm"
                        onClick={() => navigate(`/faculty/monitor/${exam.session_id}`)}
                        className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1 cursor-pointer"
                      >
                        <Shield size={12} /> Live Monitor
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/faculty/exams/${exam.exam_id}/edit`)}
                      className="h-8 px-3 text-xs font-semibold cursor-pointer"
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </StateBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

export default FacultyDashboardPage;
