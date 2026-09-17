/**
 * @file FacultyDashboardPage.jsx
 * @description Faculty portal listing authored exams, creation dialog, and lifecycle navigation.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  BookOpen,
  Clock,
  Award,
  Calendar,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  FileEdit,
  GraduationCap,
  Layers,
  ChevronRight,
} from 'lucide-react';
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
import { Input } from '../../components/ui/input.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';

function getExamStatusBadge(status) {
  switch (status) {
    case 'DRAFT':
      return <Badge variant="secondary">Draft Blueprint</Badge>;
    case 'PUBLISHED':
      return <Badge variant="success">Published & Locked</Badge>;
    case 'ACTIVE':
      return <Badge variant="success">Active Session</Badge>;
    case 'COMPLETED':
      return <Badge variant="outline">Concluded</Badge>;
    case 'CANCELLED':
      return <Badge variant="destructive">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function FacultyDashboardPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Subjects for the subject picker
  const [subjects, setSubjects] = useState([]);

  // Create exam dialog state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [duration, setDuration] = useState('60');
  const [totalMarks, setTotalMarks] = useState('100');
  const [passingMarks, setPassingMarks] = useState('40');
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState('');

  async function loadData() {
    try {
      setLoading(true);
      setError('');
      const [examData, subjectData] = await Promise.all([
        examsApi.listExams(),
        examsApi.listSubjects(),
      ]);
      setExams(Array.isArray(examData) ? examData : []);
      setSubjects(Array.isArray(subjectData) ? subjectData : []);
      if (subjectData && subjectData.length > 0) {
        setSubjectId(subjectData[0].subject_id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load faculty examinations');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function openModal() {
    setModalError('');
    setTitle('');
    setDuration('60');
    setTotalMarks('100');
    setPassingMarks('40');
    if (subjects.length > 0) setSubjectId(subjects[0].subject_id);
    setIsModalOpen(true);
  }

  async function handleCreateExam(e) {
    e.preventDefault();
    setModalError('');

    if (!subjectId) {
      setModalError('Please select an academic subject.');
      return;
    }

    const durationNum = parseInt(duration, 10);
    const totalMarksNum = parseInt(totalMarks, 10);
    const passingMarksNum = parseInt(passingMarks, 10);

    if (passingMarksNum > totalMarksNum) {
      setModalError('Passing marks cannot exceed total marks.');
      return;
    }

    setCreating(true);

    try {
      const newExam = await examsApi.createExam({
        title,
        subject_id: subjectId,
        duration_minutes: durationNum,
        total_marks: totalMarksNum,
        passing_marks: passingMarksNum,
      });

      setIsModalOpen(false);
      navigate(`/faculty/exams/${newExam.exam_id}`);
    } catch (err) {
      setModalError(err.message || 'Failed to create exam blueprint.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Faculty Workspace
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Exam Authoring & Governance
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Faculty Examination Suite
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Author exam blueprints, balance topic allocation rules, and monitor grading workflows.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="text-xs h-9 gap-1.5 text-slate-700 dark:text-slate-300"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </Button>
          <Button
            onClick={openModal}
            className="text-xs h-9 gap-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            <Plus size={14} />
            <span>Create Blueprint</span>
          </Button>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle size={16} />
          <AlertTitle>Error Loading Exams</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4 mt-1">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={loadData}>
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Loading Skeleton / State */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <RefreshCw size={28} className="animate-spin mx-auto text-slate-400" />
          <p className="text-sm text-slate-500 font-medium">Loading authored examination blueprints...</p>
        </div>
      ) : exams.length === 0 ? (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center py-16 px-4">
          <CardContent className="space-y-4 max-w-md mx-auto">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 mx-auto flex items-center justify-center">
              <BookOpen size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">No Authored Exams Yet</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Create your first examination blueprint to specify topics, question distributions, and passing thresholds.
              </p>
            </div>
            <Button onClick={openModal} className="gap-2">
              <Plus size={15} />
              Create Exam Blueprint
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {exams.map((exam) => {
            const id = exam.exam_id || exam.id;
            const isDraft = exam.status === 'DRAFT';

            return (
              <Card
                key={id}
                className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      {getExamStatusBadge(exam.status)}
                      {exam.subject_name && (
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <GraduationCap size={13} className="text-slate-400 dark:text-slate-500" />
                          {exam.subject_name}
                        </span>
                      )}
                    </div>

                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                      {exam.title}
                    </h2>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Clock size={13} className="text-slate-400 dark:text-slate-500" />
                        Duration: <strong className="font-semibold text-slate-800 dark:text-slate-200">{exam.duration_minutes} mins</strong>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Award size={13} className="text-slate-400 dark:text-slate-500" />
                        Marks: <strong className="font-semibold text-slate-800 dark:text-slate-200">{exam.passing_marks} / {exam.total_marks}</strong> (Pass / Total)
                      </span>
                      {exam.results_release_policy && (
                        <span className="flex items-center gap-1.5">
                          <Layers size={13} className="text-slate-400 dark:text-slate-500" />
                          Policy: <strong className="font-semibold text-slate-800 dark:text-slate-200">{exam.results_release_policy}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
                    <Button
                      variant={isDraft ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => navigate(`/faculty/exams/${id}`)}
                      className="gap-1.5 h-8 text-xs font-medium"
                    >
                      <FileEdit size={13} />
                      {isDraft ? 'Edit Blueprint' : 'View Blueprint'}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/faculty/exams/${id}/results`)}
                      className="gap-1.5 h-8 text-xs font-medium"
                    >
                      <span>Results & Grading</span>
                      <ChevronRight size={13} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Exam Blueprint Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Create Exam Blueprint</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Define the academic parameters and target curriculum for this new examination blueprint.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateExam} className="space-y-4 pt-2">
            {modalError && (
              <Alert variant="destructive">
                <AlertCircle size={15} />
                <AlertDescription>{modalError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <label htmlFor="exam-title" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Exam Title *
              </label>
              <Input
                id="exam-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. CS201 Midterm Examination 2026"
                required
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="exam-subject" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Academic Subject *
              </label>
              {subjects.length === 0 ? (
                <p className="text-xs text-slate-500">Loading academic subjects catalog...</p>
              ) : (
                <select
                  id="exam-subject"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  required
                  className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-slate-400"
                >
                  {subjects.map((s) => (
                    <option key={s.subject_id} value={s.subject_id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="exam-duration" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Duration (min)
                </label>
                <Input
                  id="exam-duration"
                  type="number"
                  min="1"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="exam-total-marks" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Total Marks
                </label>
                <Input
                  id="exam-total-marks"
                  type="number"
                  min="1"
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(e.target.value)}
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="exam-passing-marks" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Passing Marks
                </label>
                <Input
                  id="exam-passing-marks"
                  type="number"
                  min="0"
                  value={passingMarks}
                  onChange={(e) => setPassingMarks(e.target.value)}
                  required
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-3 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={creating}
                className="h-9 text-xs gap-1.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {creating && <RefreshCw size={13} className="animate-spin" />}
                {creating ? 'Creating Blueprint...' : 'Create Blueprint'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FacultyDashboardPage;
