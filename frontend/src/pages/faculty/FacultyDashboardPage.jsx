/**
 * @file FacultyDashboardPage.jsx
 * @description Modern, responsive overview dashboard for Faculty examination management.
 * Features statistical KPI cards, quick-glance concluded exam pass rate widget, and recent examinations.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import * as facultyApi from '../../api/facultyApi.js';
import { ScheduleExamModal } from '../../components/faculty/ScheduleExamModal.jsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';
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
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);

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
            <span>Faculty Workspace</span> &bull; <span>Academic Session 2026</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Faculty Examination Suite
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Welcome back, {user?.name || 'Professor'}. Monitor live cohort metrics, build question pools, and author exams.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadStats}
            disabled={loading}
            className="gap-1.5 h-9 text-xs"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setIsScheduleOpen(true)}
            className="gap-1.5 h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs"
          >
            <Plus size={14} /> Schedule New Exam
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
                {loading ? '—' : stats?.totalExamsConducted ?? 0}
              </h3>
              <p className="text-[11px] text-slate-400">Past evaluated evaluations</p>
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
                {loading ? '—' : stats?.upcomingExamsScheduled ?? 0}
              </h3>
              <p className="text-[11px] text-slate-400">Scheduled & active cohorts</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Calendar size={24} />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Total Question Pools Created */}
        <Card className="border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Question Pools
              </p>
              <h3 className="text-2xl font-black text-purple-600">
                {loading ? '—' : stats?.totalQuestionPools ?? 0}
              </h3>
              <p className="text-[11px] text-slate-400">Topic-based MCQ banks</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Layers size={24} />
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
                {loading ? '—' : `${stats?.averageStudentPerformance ?? 0}%`}
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
        <Card className="border border-blue-200/90 bg-gradient-to-r from-blue-50/40 via-white to-indigo-50/40 shadow-xs overflow-hidden">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 bg-blue-50 font-semibold gap-1">
                    <Award size={12} /> Most Recently Concluded Exam
                  </Badge>
                  <span className="text-xs text-slate-400">
                    Concluded {formatDateTime(recentExam.concluded_at)}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 leading-snug">
                  {recentExam.title}
                </h3>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    <GraduationCap size={13} className="text-slate-400" />
                    {recentExam.target_semester ? `${recentExam.target_semester}th Semester` : 'All Semesters'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Building2 size={13} className="text-slate-400" />
                    {recentExam.target_department || 'General Branch'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users size={13} className="text-slate-400" />
                    {recentExam.evaluated_count} Candidates Evaluated
                  </span>
                </div>
              </div>

              {/* Pass percentage highlight and CTA */}
              <div className="flex items-center gap-6 self-start lg:self-center shrink-0">
                <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <div className="w-14 h-14 rounded-full border-4 border-emerald-500 bg-emerald-50/50 flex flex-col items-center justify-center shrink-0">
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
                  className="bg-slate-900 hover:bg-slate-800 text-white h-10 px-4 text-xs font-semibold gap-1.5 shadow-xs"
                >
                  <BarChart3 size={14} /> View Analytics <ArrowRight size={14} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Action Navigation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => setIsScheduleOpen(true)}
          className="p-5 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-sm cursor-pointer transition-all space-y-2 group"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Calendar size={20} />
          </div>
          <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
            Schedule New Exam
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            Create an examination blueprint, pull questions from topic pools, and target specific academic cohorts.
          </p>
        </div>

        <div
          onClick={() => navigate('/faculty/question-pools')}
          className="p-5 rounded-xl border border-slate-200 bg-white hover:border-purple-400 hover:shadow-sm cursor-pointer transition-all space-y-2 group"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Sparkles size={20} />
          </div>
          <h4 className="text-sm font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
            Question Pools (AI Powered)
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            Upload PDF course material to automatically generate and curate rigorous MCQs categorized by topic.
          </p>
        </div>

        <div
          onClick={() => navigate('/faculty/exams')}
          className="p-5 rounded-xl border border-slate-200 bg-white hover:border-emerald-400 hover:shadow-sm cursor-pointer transition-all space-y-2 group"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
            <FileText size={20} />
          </div>
          <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
            Exams Management
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            Manage upcoming scheduled examinations or review comprehensive score analytics for completed cohorts.
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
            className="text-xs h-8 gap-1"
          >
            View All Exams <ArrowRight size={13} />
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading examinations...</div>
          ) : !stats?.recentExams || stats.recentExams.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <BookOpen className="mx-auto h-9 w-9 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No Examinations Authored Yet</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Schedule your first examination to distribute questions from your Topic Pools to student cohorts.
              </p>
              <Button
                size="sm"
                onClick={() => setIsScheduleOpen(true)}
                className="h-8 text-xs bg-blue-600 text-white font-medium gap-1"
              >
                <Plus size={13} /> Schedule New Exam
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {stats.recentExams.map((ex) => (
                <div
                  key={ex.exam_id}
                  className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(ex.status)}
                      <span className="text-xs text-slate-400 font-medium">
                        {formatDateTime(ex.scheduled_start_time)}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 truncate">{ex.title}</h4>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{ex.duration_minutes} min duration</span>
                      <span>&bull;</span>
                      <span>Target: {ex.target_semester ? `${ex.target_semester}th Sem` : 'All'}</span>
                      <span>&bull;</span>
                      <span>{ex.target_department || 'General Branch'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {ex.session_id && (
                      <Button
                        size="sm"
                        onClick={() => navigate(`/invigilator/sessions/${ex.session_id}`)}
                        className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
                      >
                        <Shield size={13} /> Invigilate
                      </Button>
                    )}

                    {['ENDED', 'EVALUATED', 'RESULT_PUBLISHED'].includes(ex.status) ||
                    (ex.scheduled_end_time && new Date(ex.scheduled_end_time) < new Date()) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate(`/faculty/exams/${ex.exam_id}/results`)}
                        className="h-8 text-xs gap-1 font-semibold"
                      >
                        <BarChart3 size={13} /> View Results
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate('/faculty/exams')}
                        className="h-8 text-xs gap-1"
                      >
                        Manage <ArrowRight size={13} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exam Scheduling Wizard Modal */}
      <ScheduleExamModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        onSuccess={() => {
          loadStats();
        }}
      />
    </div>
  );
}

export default FacultyDashboardPage;
