/**
 * @file FacultyExamsPage.jsx
 * @description Dedicated Exams Management Section for Faculty.
 * Features tabs for "Upcoming Exams" and "Past Exams", Edit/Cancel actions,
 * and quick access to Exam Results and the Scheduler wizard.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as facultyApi from '../../api/facultyApi.js';
import { ScheduleExamModal } from '../../components/faculty/ScheduleExamModal.jsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';
import {
  Calendar,
  Clock,
  Plus,
  RefreshCw,
  Ban,
  BarChart3,
  Building2,
  GraduationCap,
  Users,
  AlertCircle,
  CheckCircle2,
  FileEdit,
  ArrowRight,
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

export function FacultyExamsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('upcoming');
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  async function loadExams(tab = activeTab) {
    setLoading(true);
    setError('');
    try {
      const data = await facultyApi.listFacultyExams({ tab });
      setExams(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || 'Failed to load examinations');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExams(activeTab);
  }, [activeTab]);

  async function handleCancelExam(examId) {
    if (!window.confirm('Are you sure you want to cancel this scheduled examination? Students will no longer be able to attempt it.')) {
      return;
    }
    setCancellingId(examId);
    try {
      await facultyApi.cancelExam(examId);
      await loadExams(activeTab);
    } catch (err) {
      setError(err?.message || 'Failed to cancel exam');
      alert(err?.message || 'Failed to cancel exam');
    } finally {
      setCancellingId(null);
    }
  }

  const upcomingCount = activeTab === 'upcoming' ? exams.length : 0;
  const pastCount = activeTab === 'past' ? exams.length : 0;

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto">
      {/* Page Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <span>Faculty Workspace</span> &bull; <span>Governance</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Exams Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage upcoming scheduled examinations, adjust test windows, or review results for past cohorts.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadExams(activeTab)}
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

      {/* Main Tabs Container */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val)} className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200">
          <TabsList className="bg-transparent p-0 h-auto gap-4">
            <TabsTrigger
              value="upcoming"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent px-3 pb-3 pt-2 text-sm font-bold text-slate-600 data-[state=active]:text-blue-600 cursor-pointer"
            >
              Upcoming Exams
            </TabsTrigger>
            <TabsTrigger
              value="past"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent px-3 pb-3 pt-2 text-sm font-bold text-slate-600 data-[state=active]:text-blue-600 cursor-pointer"
            >
              Past Exams
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Upcoming Exams */}
        <TabsContent value="upcoming" className="m-0 space-y-3">
          <StateBoundary
            isLoading={loading}
            error={error}
            isEmpty={exams.length === 0}
            loadingMessage="Loading upcoming examinations..."
            emptyTitle="No Upcoming Exams Scheduled"
            emptyDescription="Schedule a new examination targeting a semester cohort using questions from your topic pools."
            onRetry={() => loadExams(activeTab)}
          >
            <div className="grid grid-cols-1 gap-3.5">
              {exams.map((ex) => (
                <Card
                  key={ex.exam_id}
                  className="border border-slate-200 shadow-xs hover:border-slate-300 transition-all bg-white"
                >
                  <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getStatusBadge(ex.status)}
                        <span className="text-xs font-semibold text-slate-600">
                          {formatDateTime(ex.scheduled_start_time)} &bull; {ex.duration_minutes} min duration
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-900 leading-snug">
                        {ex.title}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <GraduationCap size={13} className="text-slate-400" />
                          {ex.target_semester ? `${ex.target_semester}th Semester` : 'All Semesters'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 size={13} className="text-slate-400" />
                          {ex.target_department || 'General Branch'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users size={13} className="text-slate-400" />
                          {ex.student_count || 0} Eligible Students Assigned
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 self-end md:self-center shrink-0">
                      {ex.session_id && (
                        <Button
                          size="sm"
                          onClick={() => navigate(`/invigilator/sessions/${ex.session_id}`)}
                          className="h-9 px-3.5 text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                        >
                          <Shield size={13} /> Invigilate Live
                        </Button>
                      )}

                      {ex.status !== 'CANCELLED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancelExam(ex.exam_id)}
                          disabled={cancellingId === ex.exam_id}
                          className="h-9 px-3 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 gap-1.5"
                        >
                          <Ban size={13} /> {cancellingId === ex.exam_id ? 'Cancelling...' : 'Cancel Exam'}
                        </Button>
                      )}

                      <Button
                        size="sm"
                        onClick={() => navigate(`/faculty/exams/${ex.exam_id}`)}
                        className="h-9 px-4 text-xs font-semibold gap-1 bg-slate-900 text-white hover:bg-slate-800"
                      >
                        <FileEdit size={13} /> Blueprint Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </StateBoundary>
        </TabsContent>

        {/* Tab 2: Past Exams */}
        <TabsContent value="past" className="m-0 space-y-3">
          <StateBoundary
            isLoading={loading}
            error={error}
            isEmpty={exams.length === 0}
            loadingMessage="Loading concluded examinations..."
            emptyTitle="No Concluded Examinations Found"
            emptyDescription="Completed tests and student performance analytics will be archived here automatically once exam windows close."
            onRetry={() => loadExams(activeTab)}
          >
            <div className="grid grid-cols-1 gap-3.5">
              {exams.map((ex) => (
                <Card
                  key={ex.exam_id}
                  className="border border-slate-200 shadow-xs hover:border-slate-300 transition-all bg-white"
                >
                  <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getStatusBadge(ex.status)}
                        <span className="text-xs text-slate-400 font-medium">
                          {ex.status === 'CANCELLED' ? 'Cancelled ' : 'Concluded '}
                          {formatDateTime(ex.scheduled_end_time || ex.created_at)}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-900 leading-snug">
                        {ex.title}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <GraduationCap size={13} className="text-slate-400" />
                          {ex.target_semester ? `${ex.target_semester}th Sem` : 'All'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 size={13} className="text-slate-400" />
                          {ex.target_department || 'General Branch'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users size={13} className="text-slate-400" />
                          {ex.attempt_count || 0} Submissions Evaluated
                        </span>
                        {ex.average_score != null && (
                          <span className="font-semibold text-slate-700">
                            Avg Score: {ex.average_score} / {ex.total_marks}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 self-end md:self-center shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/faculty/exams/${ex.exam_id}`)}
                        className="h-9 px-3.5 text-xs font-semibold gap-1 bg-white text-slate-700 hover:bg-slate-50 border-slate-200"
                      >
                        <FileEdit size={13} /> Blueprint Details
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => navigate(`/faculty/exams/${ex.exam_id}/results`)}
                        className="h-9 px-4 text-xs font-semibold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                      >
                        <BarChart3 size={14} /> View Results & Analytics <ArrowRight size={13} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </StateBoundary>
        </TabsContent>
      </Tabs>

      {/* Schedule Wizard Modal */}
      <ScheduleExamModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        onSuccess={() => loadExams(activeTab)}
      />
    </div>
  );
}

export default FacultyExamsPage;
