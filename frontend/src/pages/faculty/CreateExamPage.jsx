/**
 * @file CreateExamPage.jsx
 * @description All-in-one exam creation and editing page for Faculty.
 * Asks for exam info & schedule, assigns to branch & semester,
 * and allows building questions manually or generating them with AI from a PDF.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as facultyApi from '../../api/facultyApi.js';
import * as studentApi from '../../api/studentApi.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';
import {
  Calendar,
  Clock,
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  FileText,
  UploadCloud,
  Check,
  HelpCircle,
  Save,
  BookOpen
} from 'lucide-react';

export function CreateExamPage() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const isEditing = Boolean(examId);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [departments, setDepartments] = useState([]);

  // Exam Information
  const [title, setTitle] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [targetSemester, setTargetSemester] = useState('1');
  const [scheduledStartTime, setScheduledStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [totalMarks, setTotalMarks] = useState(100);
  const [passingMarks, setPassingMarks] = useState(40);
  const [description, setDescription] = useState('');

  // Questions List
  const [questions, setQuestions] = useState([]);

  // Question Creation Tab: 'manual' | 'ai'
  const [activeQuestionTab, setActiveQuestionTab] = useState('manual');

  // Manual Question Form State
  const [manualPrompt, setManualPrompt] = useState('');
  const [manualPoints, setManualPoints] = useState(1);
  const [manualOptions, setManualOptions] = useState([
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false }
  ]);

  // AI PDF Generation State
  const [pdfFile, setPdfFile] = useState(null);
  const [aiQuestionCount, setAiQuestionCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState('MEDIUM');
  const [generatingAi, setGeneratingAi] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState([]);

  // Load departments and existing exam if editing
  useEffect(() => {
    async function loadData() {
      try {
        if (isEditing) setLoading(true);
        const depts = await studentApi.getDepartments();
        setDepartments(Array.isArray(depts) ? depts : []);

        if (depts && depts.length > 0 && !departmentId) {
          setDepartmentId(depts[0].department_id);
        }

        if (isEditing) {
          const data = await facultyApi.getExamDetails(examId);
          const exam = data.exam || data;
          setTitle(exam.title || '');
          setSubjectName(exam.subject_name || '');
          if (exam.department_id) setDepartmentId(exam.department_id);
          if (exam.target_semester) setTargetSemester(String(exam.target_semester));
          if (exam.duration_minutes) setDurationMinutes(exam.duration_minutes);
          if (exam.total_marks) setTotalMarks(exam.total_marks);
          if (exam.passing_marks) setPassingMarks(exam.passing_marks);
          if (exam.description) setDescription(exam.description);
          if (exam.scheduled_start_time) {
            const d = new Date(exam.scheduled_start_time);
            setScheduledStartTime(d.toISOString().slice(0, 16));
          }

          if (Array.isArray(data.questions)) {
            setQuestions(
              data.questions.map((q) => ({
                prompt_text: q.prompt_text,
                points: q.default_points || 1,
                options: (q.options || []).map((o) => ({
                  option_text: o.option_text,
                  is_correct: o.is_correct
                }))
              }))
            );
          }
        } else {
          // Set default start time to tomorrow 10:00 AM
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(10, 0, 0, 0);
          setScheduledStartTime(tomorrow.toISOString().slice(0, 16));
        }
      } catch (err) {
        setError(err?.message || 'Failed to load details');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [examId, isEditing]);

  // Handle Manual Option Text Change
  function handleOptionTextChange(index, value) {
    const next = [...manualOptions];
    next[index].text = value;
    setManualOptions(next);
  }

  // Handle Correct Option Selection
  function handleSetCorrectOption(index) {
    const next = manualOptions.map((opt, i) => ({
      ...opt,
      isCorrect: i === index
    }));
    setManualOptions(next);
  }

  // Add Manual Question to Exam
  function handleAddManualQuestion() {
    if (!manualPrompt.trim()) {
      alert('Please enter question prompt text');
      return;
    }
    const validOptions = manualOptions.filter((o) => o.text.trim().length > 0);
    if (validOptions.length < 2) {
      alert('Please enter at least 2 options for this question');
      return;
    }
    const hasCorrect = manualOptions.some((o) => o.isCorrect && o.text.trim().length > 0);
    if (!hasCorrect) {
      alert('Please select which option is the correct answer');
      return;
    }

    const newQ = {
      prompt_text: manualPrompt.trim(),
      points: Number(manualPoints) || 1,
      options: manualOptions.map((o) => ({
        option_text: o.text.trim(),
        is_correct: o.isCorrect
      }))
    };

    setQuestions([...questions, newQ]);

    // Reset form
    setManualPrompt('');
    setManualOptions([
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false }
    ]);
  }

  // Generate Questions from PDF via AI
  async function handleGenerateAiQuestions() {
    if (!pdfFile) {
      alert('Please select a PDF file first');
      return;
    }
    setGeneratingAi(true);
    try {
      const res = await facultyApi.generateMCQsFromPdf({
        file: pdfFile,
        topicName: subjectName || title || 'Course Content',
        questionCount: aiQuestionCount,
        difficulty: aiDifficulty
      });

      const aiQuestions = res?.data?.questions || res?.questions || [];
      if (aiQuestions.length === 0) {
        alert('No questions could be extracted from this PDF. Try another document or increase question count.');
        return;
      }

      setGeneratedQuestions(
        aiQuestions.map((q) => ({
          ...q,
          selected: true
        }))
      );
    } catch (err) {
      alert(err?.data?.message || err?.message || 'Failed to generate AI questions from PDF');
    } finally {
      setGeneratingAi(false);
    }
  }

  // Add Selected AI Questions to Exam
  function handleAddSelectedAiQuestions() {
    const selected = generatedQuestions.filter((q) => q.selected);
    if (selected.length === 0) {
      alert('Please select at least one question to add');
      return;
    }

    const formatted = selected.map((q) => {
      const opts = Array.isArray(q.options)
        ? q.options.map((optText) => ({
            option_text: String(optText).trim(),
            is_correct: String(optText).trim().toLowerCase() === String(q.correct_answer || '').trim().toLowerCase()
          }))
        : [];

      return {
        prompt_text: q.question_text || q.prompt_text,
        points: q.points || 1,
        options: opts
      };
    });

    setQuestions([...questions, ...formatted]);
    setGeneratedQuestions([]);
    setPdfFile(null);
  }

  // Remove Question from Exam
  function handleRemoveQuestion(index) {
    setQuestions(questions.filter((_, i) => i !== index));
  }

  // Submit & Save Exam
  async function handleSubmitExam(e) {
    if (e && e.preventDefault) e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Please provide an exam title');
      return;
    }
    if (!departmentId) {
      setError('Please select a target branch/department');
      return;
    }
    if (!scheduledStartTime) {
      setError('Please select scheduled start date and time');
      return;
    }
    if (questions.length === 0) {
      setError('Please add at least 1 question to the exam');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        subject_name: (subjectName || title).trim(),
        description: description.trim() || undefined,
        department_id: departmentId,
        target_semester: Number(targetSemester),
        scheduled_start_time: new Date(scheduledStartTime).toISOString(),
        duration_minutes: Number(durationMinutes) || 60,
        total_marks: Number(totalMarks) || 100,
        passing_marks: Number(passingMarks) || 40,
        questions
      };

      if (isEditing) {
        await facultyApi.updateExam(examId, payload);
      } else {
        await facultyApi.scheduleExam(payload);
      }

      navigate('/faculty/exams');
    } catch (err) {
      setError(err?.data?.message || err?.message || 'Failed to save examination');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <StateBoundary loading={true} loadingMessage="Loading examination builder..." />
      </div>
    );
  }

  const totalExamPoints = questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/faculty/exams')}
            className="mb-1 -ml-2 text-slate-500 hover:text-slate-900 gap-1.5"
          >
            <ArrowLeft size={14} /> Back to Exams
          </Button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BookOpen className="text-blue-600" />
            {isEditing ? 'Edit Examination' : 'Create New Examination'}
          </h1>
          <p className="text-sm text-slate-500">
            Define exam schedule, assign target branch & semester, and add questions.
          </p>
        </div>

        <Button
          onClick={handleSubmitExam}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2 h-10 px-6 cursor-pointer shadow-sm"
        >
          <Save size={16} />
          {saving ? 'Saving Exam...' : isEditing ? 'Save Changes' : 'Schedule & Publish Exam'}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle size={16} />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Section 1: Exam Info */}
      <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">1. Exam Information & Target Class</CardTitle>
          <CardDescription className="text-xs">
            The exam will automatically appear on the dashboards of all students matching this Branch and Semester.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Exam Title *
              </label>
              <Input
                required
                placeholder="e.g. Data Structures Midterm Exam"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Subject Name *
              </label>
              <Input
                required
                placeholder="e.g. Data Structures & Algorithms (CS301)"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Target Branch / Dept *
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {departments.map((d) => (
                  <option key={d.department_id} value={d.department_id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Target Semester *
              </label>
              <select
                value={targetSemester}
                onChange={(e) => setTargetSemester(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={String(s)}>
                    Semester {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Start Date & Time *
              </label>
              <Input
                type="datetime-local"
                value={scheduledStartTime}
                onChange={(e) => setScheduledStartTime(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Duration (Minutes) *
              </label>
              <Input
                type="number"
                min="10"
                max="360"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Marks
              </label>
              <Input
                type="number"
                min="1"
                value={totalMarks}
                onChange={(e) => setTotalMarks(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Passing Marks
              </label>
              <Input
                type="number"
                min="1"
                value={passingMarks}
                onChange={(e) => setPassingMarks(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Exam Instructions / Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Fullscreen mode is required. Webcam proctoring is enabled. No external tabs permitted."
              className="w-full p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Questions Builder */}
      <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">2. Exam Questions</CardTitle>
              <CardDescription className="text-xs">
                Add multiple choice questions manually or generate them directly from your course syllabus PDF.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-medium">
                {questions.length} Question{questions.length === 1 ? '' : 's'}
              </Badge>
              <Badge variant="secondary" className="text-xs font-medium">
                {totalExamPoints} Total Points
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Question Mode Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveQuestionTab('manual')}
              className={`pb-2.5 px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeQuestionTab === 'manual'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Plus size={16} /> Add Question Manually
            </button>
            <button
              type="button"
              onClick={() => setActiveQuestionTab('ai')}
              className={`pb-2.5 px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeQuestionTab === 'ai'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Sparkles size={16} className="text-amber-500" /> AI Generate from PDF
            </button>
          </div>

          {/* TAB 1: Manual Question Creator */}
          {activeQuestionTab === 'manual' && (
            <div className="space-y-4 bg-slate-50/70 dark:bg-slate-900/40 p-4 sm:p-5 rounded-xl border border-slate-200/80 dark:border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3 space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-slate-600">Question Text *</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Which data structure operates on a Last-In, First-Out (LIFO) principle?"
                    value={manualPrompt}
                    onChange={(e) => setManualPrompt(e.target.value)}
                    className="w-full p-2.5 rounded-md border border-slate-200 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-slate-600">Points *</label>
                  <Input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={manualPoints}
                    onChange={(e) => setManualPoints(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-slate-600 block">
                  Options (Select radio for the correct answer) *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {manualOptions.map((opt, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-2.5 p-2 rounded-lg border transition-colors ${
                        opt.isCorrect
                          ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20'
                          : 'border-slate-200 bg-white dark:bg-slate-950'
                      }`}
                    >
                      <input
                        type="radio"
                        name="correctOption"
                        checked={opt.isCorrect}
                        onChange={() => handleSetCorrectOption(idx)}
                        className="w-4 h-4 text-emerald-600 cursor-pointer"
                        title="Mark as correct answer"
                      />
                      <span className="text-xs font-bold text-slate-500 w-4">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <Input
                        placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                        value={opt.text}
                        onChange={(e) => handleOptionTextChange(idx, e.target.value)}
                        className="h-8 text-xs border-0 shadow-none focus-visible:ring-0 px-1 bg-transparent"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  onClick={handleAddManualQuestion}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5 h-9"
                >
                  <Plus size={14} /> Add Question to Exam
                </Button>
              </div>
            </div>
          )}

          {/* TAB 2: AI PDF Generator */}
          {activeQuestionTab === 'ai' && (
            <div className="space-y-4 bg-slate-50/70 dark:bg-slate-900/40 p-4 sm:p-5 rounded-xl border border-slate-200/80 dark:border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div className="space-y-1.5 sm:col-span-1">
                  <label className="text-xs font-semibold uppercase text-slate-600">Select Syllabus / Notes PDF *</label>
                  <Input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                    className="h-10 text-xs cursor-pointer"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-slate-600">Number of Questions</label>
                  <select
                    value={aiQuestionCount}
                    onChange={(e) => setAiQuestionCount(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white dark:bg-slate-950 text-sm focus:outline-none"
                  >
                    {[3, 5, 8, 10, 15, 20].map((n) => (
                      <option key={n} value={n}>{n} MCQs</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Button
                    type="button"
                    onClick={handleGenerateAiQuestions}
                    disabled={generatingAi || !pdfFile}
                    className="w-full h-10 bg-amber-600 hover:bg-amber-700 text-white text-xs gap-2 font-semibold shadow-xs"
                  >
                    <Sparkles size={16} />
                    {generatingAi ? 'Reading PDF & Generating...' : 'Generate Questions with AI'}
                  </Button>
                </div>
              </div>

              {/* Preview Generated Questions */}
              {generatedQuestions.length > 0 && (
                <div className="mt-4 space-y-3 pt-3 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Generated {generatedQuestions.length} Questions: Review & Select
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddSelectedAiQuestions}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 h-8"
                    >
                      <Check size={14} /> Add Selected to Exam
                    </Button>
                  </div>

                  <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
                    {generatedQuestions.map((q, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border transition-colors ${
                          q.selected
                            ? 'border-blue-300 bg-blue-50/30 dark:bg-blue-950/20'
                            : 'border-slate-200 bg-white opacity-60'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={Boolean(q.selected)}
                            onChange={(e) => {
                              const next = [...generatedQuestions];
                              next[idx].selected = e.target.checked;
                              setGeneratedQuestions(next);
                            }}
                            className="w-4 h-4 mt-1 rounded text-blue-600 cursor-pointer"
                          />
                          <div className="flex-1 space-y-1.5">
                            <p className="text-xs font-semibold text-slate-900 leading-snug">
                              {idx + 1}. {q.question_text || q.prompt_text}
                            </p>
                            <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                              {(q.options || []).map((opt, oIdx) => (
                                <div
                                  key={oIdx}
                                  className={`p-1 rounded ${
                                    String(opt).toLowerCase() === String(q.correct_answer || '').toLowerCase()
                                      ? 'text-emerald-700 font-semibold'
                                      : ''
                                  }`}
                                >
                                  {String.fromCharCode(65 + oIdx)}. {String(opt)}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Current Exam Questions List */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Exam Questions List ({questions.length})
            </h3>

            {questions.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50">
                <HelpCircle size={28} className="text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No questions added yet.
                </p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-0.5">
                  Use the manual form above or generate questions from a course PDF to populate your exam.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {questions.map((q, qIndex) => (
                  <div
                    key={qIndex}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-blue-100 text-blue-700 text-xs font-bold shrink-0">
                          {qIndex + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {q.prompt_text}
                          </p>
                          <span className="text-[11px] text-slate-400 font-medium">
                            {q.points || 1} mark{(q.points || 1) === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveQuestion(qIndex)}
                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 h-8 px-2"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 pl-8">
                      {(q.options || []).map((opt, optIndex) => (
                        <div
                          key={optIndex}
                          className={`p-2 rounded-lg text-xs flex items-center gap-2 border ${
                            opt.is_correct
                              ? 'border-emerald-300 bg-emerald-50/70 text-emerald-800 font-semibold'
                              : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 text-slate-600'
                          }`}
                        >
                          <span className="font-bold">{String.fromCharCode(65 + optIndex)}.</span>
                          <span className="truncate">{opt.option_text}</span>
                          {opt.is_correct && (
                            <CheckCircle2 size={13} className="text-emerald-600 ml-auto shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default CreateExamPage;
