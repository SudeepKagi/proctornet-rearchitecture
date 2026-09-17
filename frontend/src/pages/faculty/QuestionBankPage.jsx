/**
 * @file QuestionBankPage.jsx
 * @description Faculty Question Bank & Rich Question Authoring Workspace.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  BookOpen,
  Search,
  Filter,
  Layers,
  Copy,
  Archive,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Tag,
  Code,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Input } from '../../components/ui/input.jsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.jsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';
import * as qbApi from '../../api/questionBankApi.js';

export function QuestionBankPage() {
  const [banks, setBanks] = useState([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterBloom, setFilterBloom] = useState('');
  const [filterType, setFilterType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);

  // Bank Form State
  const [bankFormData, setBankFormData] = useState({ name: '', description: '', is_shared: false });

  // Question Form State
  const [questionFormData, setQuestionFormData] = useState({
    prompt: '',
    question_type: 'MCQ',
    difficulty: 'MEDIUM',
    bloom_level: 'APPLY',
    points: 1,
    tags: '',
    options: [
      { text: '', is_correct: true },
      { text: '', is_correct: false },
    ],
    numeric_tolerance: 0,
    rubric_criteria: [],
    grading_guidelines: '',
  });

  const loadBanks = useCallback(async () => {
    try {
      const data = await qbApi.listQuestionBanks();
      setBanks(Array.isArray(data) ? data : []);
      if (data && data.length > 0 && !selectedBankId) {
        setSelectedBankId(data[0].id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load question banks');
    }
  }, [selectedBankId]);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await qbApi.listQuestions({
        bankId: selectedBankId || undefined,
        difficulty: filterDifficulty || undefined,
        bloomLevel: filterBloom || undefined,
        questionType: filterType || undefined,
        query: searchQuery || undefined,
      });
      setQuestions(data?.questions || []);
    } catch (err) {
      setError(err.message || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  }, [selectedBankId, filterDifficulty, filterBloom, filterType, searchQuery]);

  useEffect(() => {
    loadBanks();
  }, [loadBanks]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const handleCreateBank = async (e) => {
    e.preventDefault();
    try {
      const newBank = await qbApi.createQuestionBank(bankFormData);
      setIsBankModalOpen(false);
      setBankFormData({ name: '', description: '', is_shared: false });
      await loadBanks();
      if (newBank) setSelectedBankId(newBank.id);
    } catch (err) {
      setError(err.message || 'Failed to create question bank');
    }
  };

  const handleOpenCreateQuestion = () => {
    setEditingQuestion(null);
    setQuestionFormData({
      prompt: '',
      question_type: 'MCQ',
      difficulty: 'MEDIUM',
      bloom_level: 'APPLY',
      points: 1,
      tags: '',
      options: [
        { text: 'Option A', is_correct: true },
        { text: 'Option B', is_correct: false },
      ],
      numeric_tolerance: 0,
      rubric_criteria: [
        { name: 'Core Concept & Accuracy', max_points: 3, description: 'Demonstrates deep conceptual understanding' },
        { name: 'Clarity & Justification', max_points: 2, description: 'Clear structured reasoning' },
      ],
      grading_guidelines: '',
    });
    setIsQuestionModalOpen(true);
  };

  const handleOpenEditQuestion = (q) => {
    setEditingQuestion(q);
    setQuestionFormData({
      prompt: q.prompt,
      question_type: q.question_type,
      difficulty: q.difficulty || 'MEDIUM',
      bloom_level: q.bloom_level || 'APPLY',
      points: q.points || 1,
      tags: Array.isArray(q.tags) ? q.tags.join(', ') : '',
      options:
        q.options && q.options.length > 0
          ? q.options
          : [
              { text: 'Option A', is_correct: true },
              { text: 'Option B', is_correct: false },
            ],
      numeric_tolerance: q.numeric_tolerance || 0,
      rubric_criteria: q.rubric?.criteria || [],
      grading_guidelines: q.rubric?.guidelines || '',
    });
    setIsQuestionModalOpen(true);
  };

  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        bankId: selectedBankId,
        prompt: questionFormData.prompt,
        questionType: questionFormData.question_type,
        difficulty: questionFormData.difficulty,
        bloomLevel: questionFormData.bloom_level,
        points: Number(questionFormData.points),
        tags: questionFormData.tags
          ? questionFormData.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
      };

      if (questionFormData.question_type === 'MCQ' || questionFormData.question_type === 'TRUE_FALSE') {
        payload.options = questionFormData.options;
      } else if (questionFormData.question_type === 'NUMERIC') {
        payload.tolerance = Number(questionFormData.numeric_tolerance) || 0;
      } else {
        payload.rubric = {
          criteria: questionFormData.rubric_criteria,
          guidelines: questionFormData.grading_guidelines,
        };
      }

      if (editingQuestion) {
        await qbApi.updateQuestion(editingQuestion.id, payload);
      } else {
        await qbApi.createQuestion(payload);
      }

      setIsQuestionModalOpen(false);
      loadQuestions();
    } catch (err) {
      setError(err.message || 'Failed to save question');
    }
  };

  // Confirmation for archiving
  const [questionToArchive, setQuestionToArchive] = useState(null);
  const [archiving, setArchiving] = useState(false);

  const handleCloneQuestion = async (qId) => {
    try {
      await qbApi.cloneQuestion(qId);
      loadQuestions();
    } catch (err) {
      setError(err.message || 'Failed to clone question');
    }
  };

  const confirmArchive = async () => {
    if (!questionToArchive) return;
    setArchiving(true);
    try {
      await qbApi.archiveQuestion(questionToArchive);
      setQuestionToArchive(null);
      loadQuestions();
    } catch (err) {
      setError(err.message || 'Failed to archive question');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Curriculum Bank
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Assessment Item Authoring
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Question Banks & Item Authoring
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Author curriculum questions with Bloom taxonomies, rubrics, and LaTeX formulas.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsBankModalOpen(true)}
            className="text-xs h-9 gap-1.5"
          >
            <Plus size={14} />
            <span>New Bank</span>
          </Button>
          <Button
            size="sm"
            onClick={handleOpenCreateQuestion}
            disabled={!selectedBankId}
            className="text-xs h-9 gap-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
          >
            <Plus size={14} />
            <span>Author Question</span>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle size={16} />
          <AlertTitle>Question Bank Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filter and Bank Selector Bar */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
              Active Question Bank
            </label>
            <select
              value={selectedBankId}
              onChange={(e) => setSelectedBankId(e.target.value)}
              className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
            >
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.is_shared ? '(Shared)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
              Question Type
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
            >
              <option value="">All Item Types</option>
              <option value="MCQ">Multiple Choice (MCQ)</option>
              <option value="TRUE_FALSE">True / False</option>
              <option value="NUMERIC">Numeric</option>
              <option value="SHORT_ANSWER">Short Answer</option>
              <option value="ESSAY">Essay</option>
              <option value="CODE">Source Code</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
              Difficulty
            </label>
            <select
              value={filterDifficulty}
              onChange={(e) => setFilterDifficulty(e.target.value)}
              className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
            >
              <option value="">All Difficulties</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
              Bloom Taxonomy
            </label>
            <select
              value={filterBloom}
              onChange={(e) => setFilterBloom(e.target.value)}
              className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
            >
              <option value="">All Bloom Levels</option>
              <option value="REMEMBER">Remember</option>
              <option value="UNDERSTAND">Understand</option>
              <option value="APPLY">Apply</option>
              <option value="ANALYZE">Analyze</option>
              <option value="EVALUATE">Evaluate</option>
              <option value="CREATE">Create</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
              Search Keywords
            </label>
            <Input
              type="text"
              placeholder="Search prompt, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Questions List */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <RefreshCw size={28} className="animate-spin mx-auto text-slate-400" />
          <p className="text-sm font-medium text-slate-500">Loading curriculum items...</p>
        </div>
      ) : questions.length === 0 ? (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center py-16 px-4">
          <CardContent className="space-y-3 max-w-md mx-auto">
            <BookOpen size={28} className="mx-auto text-slate-400 dark:text-slate-600 stroke-1" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">No Questions Found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No questions match your current bank and filter criteria. Author new questions to build your pool.
            </p>
            <Button size="sm" onClick={handleOpenCreateQuestion} className="gap-1.5 text-xs">
              <Plus size={13} />
              Author First Question
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <Card
              key={q.id}
              className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            >
              <CardContent className="p-4 flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="default" size="sm">
                      {q.question_type}
                    </Badge>
                    <Badge
                      variant={
                        q.difficulty === 'HARD'
                          ? 'destructive'
                          : q.difficulty === 'MEDIUM'
                          ? 'secondary'
                          : 'success'
                      }
                      size="sm"
                    >
                      {q.difficulty}
                    </Badge>
                    <Badge variant="outline" size="sm">
                      Bloom: {q.bloom_level}
                    </Badge>
                    <span className="text-[11px] text-slate-500 font-mono">
                      v{q.version || 1} • {q.points || 1} pt{q.points === 1 ? '' : 's'}
                    </span>
                    {q.status === 'ARCHIVED' && (
                      <Badge variant="destructive" size="sm">
                        ARCHIVED
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                    {q.prompt}
                  </p>

                  {q.tags && q.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      {q.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] px-1.5 py-0.5 rounded-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEditQuestion(q)}
                    className="h-7 text-xs px-2.5 gap-1"
                  >
                    <Edit size={12} />
                    <span>Edit</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCloneQuestion(q.id)}
                    className="h-7 text-xs px-2.5 gap-1"
                  >
                    <Copy size={12} />
                    <span>Clone</span>
                  </Button>
                  {q.status !== 'ARCHIVED' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setQuestionToArchive(q.id)}
                      className="h-7 text-xs px-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <Archive size={12} />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Question Bank Dialog */}
      <Dialog open={isBankModalOpen} onOpenChange={setIsBankModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Create Question Bank</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Create an institutional domain repository for grouping curriculum questions.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateBank} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Bank Name *
              </label>
              <Input
                required
                value={bankFormData.name}
                onChange={(e) => setBankFormData({ ...bankFormData, name: e.target.value })}
                placeholder="e.g. CS201 Data Structures & Algorithms"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Description
              </label>
              <textarea
                rows={3}
                value={bankFormData.description}
                onChange={(e) => setBankFormData({ ...bankFormData, description: e.target.value })}
                placeholder="Topics covered, academic tier, prerequisites..."
                className="w-full p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={bankFormData.is_shared}
                onChange={(e) => setBankFormData({ ...bankFormData, is_shared: e.target.checked })}
                className="accent-slate-900"
              />
              <span>Share with department faculty (Co-authoring enabled)</span>
            </label>

            <DialogFooter className="pt-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsBankModalOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-9 text-xs bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
              >
                Create Bank
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Author / Edit Question Dialog */}
      <Dialog open={isQuestionModalOpen} onOpenChange={setIsQuestionModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingQuestion ? 'Edit Question Item' : 'Author Question Item'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Configure question prompts, answer choices, and scoring rubrics.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveQuestion} className="space-y-4 pt-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Question Type
                </label>
                <select
                  value={questionFormData.question_type}
                  onChange={(e) =>
                    setQuestionFormData({ ...questionFormData, question_type: e.target.value })
                  }
                  className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                >
                  <option value="MCQ">Multiple Choice</option>
                  <option value="TRUE_FALSE">True / False</option>
                  <option value="NUMERIC">Numeric</option>
                  <option value="SHORT_ANSWER">Short Answer</option>
                  <option value="ESSAY">Essay</option>
                  <option value="CODE">Source Code</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Difficulty
                </label>
                <select
                  value={questionFormData.difficulty}
                  onChange={(e) =>
                    setQuestionFormData({ ...questionFormData, difficulty: e.target.value })
                  }
                  className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                >
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Bloom Taxonomy
                </label>
                <select
                  value={questionFormData.bloom_level}
                  onChange={(e) =>
                    setQuestionFormData({ ...questionFormData, bloom_level: e.target.value })
                  }
                  className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                >
                  <option value="REMEMBER">Remember</option>
                  <option value="UNDERSTAND">Understand</option>
                  <option value="APPLY">Apply</option>
                  <option value="ANALYZE">Analyze</option>
                  <option value="EVALUATE">Evaluate</option>
                  <option value="CREATE">Create</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Points / Weight
                </label>
                <Input
                  type="number"
                  min="1"
                  value={questionFormData.points}
                  onChange={(e) =>
                    setQuestionFormData({ ...questionFormData, points: e.target.value })
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Question Prompt (Supports LaTeX formulas, e.g. $E = mc^2$) *
              </label>
              <textarea
                required
                rows={4}
                value={questionFormData.prompt}
                onChange={(e) =>
                  setQuestionFormData({ ...questionFormData, prompt: e.target.value })
                }
                placeholder="Enter problem prompt or question statement..."
                className="w-full p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden leading-relaxed"
              />
            </div>

            {/* LaTeX formula preview banner */}
            {questionFormData.prompt.includes('$') && (
              <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs">
                <span className="font-semibold text-blue-600 dark:text-blue-400 block mb-1">
                  LaTeX Formula Detected:
                </span>
                <div className="font-mono text-slate-800 dark:text-slate-200">{questionFormData.prompt}</div>
              </div>
            )}

            {/* MCQ Options Editor */}
            {(questionFormData.question_type === 'MCQ' ||
              questionFormData.question_type === 'TRUE_FALSE') && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Answer Choices (Select radio for correct answer)
                </label>

                <div className="space-y-2">
                  {questionFormData.options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct_option"
                        checked={opt.is_correct}
                        onChange={() => {
                          const newOpts = questionFormData.options.map((o, i) => ({
                            ...o,
                            is_correct: i === idx,
                          }));
                          setQuestionFormData({ ...questionFormData, options: newOpts });
                        }}
                        className="accent-slate-900"
                      />
                      <Input
                        type="text"
                        required
                        value={opt.text}
                        onChange={(e) => {
                          const newOpts = [...questionFormData.options];
                          newOpts[idx].text = e.target.value;
                          setQuestionFormData({ ...questionFormData, options: newOpts });
                        }}
                        placeholder={`Option ${idx + 1}`}
                        className="h-8 text-xs flex-1"
                      />
                      {questionFormData.options.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newOpts = questionFormData.options.filter((_, i) => i !== idx);
                            setQuestionFormData({ ...questionFormData, options: newOpts });
                          }}
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                  ))}

                  {questionFormData.question_type === 'MCQ' && (
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => {
                        setQuestionFormData({
                          ...questionFormData,
                          options: [...questionFormData.options, { text: '', is_correct: false }],
                        });
                      }}
                      className="text-xs h-8 gap-1 mt-1"
                    >
                      <Plus size={12} />
                      Add Option
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Subjective Rubric Criteria */}
            {['SHORT_ANSWER', 'ESSAY', 'CODE'].includes(questionFormData.question_type) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Rubric Criteria & Partial Credit Breakdown
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setQuestionFormData({
                        ...questionFormData,
                        rubric_criteria: [
                          ...questionFormData.rubric_criteria,
                          { name: 'New Criterion', max_points: 2, description: '' },
                        ],
                      });
                    }}
                    className="text-xs h-7 gap-1 text-blue-600 hover:text-blue-700"
                  >
                    <Plus size={12} />
                    Add Criterion
                  </Button>
                </div>

                <div className="space-y-2">
                  {questionFormData.rubric_criteria.map((c, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_3fr_auto] gap-2 items-center p-2 rounded-md bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800"
                    >
                      <Input
                        type="text"
                        placeholder="Criterion Name"
                        value={c.name}
                        onChange={(e) => {
                          const newCrit = [...questionFormData.rubric_criteria];
                          newCrit[idx].name = e.target.value;
                          setQuestionFormData({ ...questionFormData, rubric_criteria: newCrit });
                        }}
                        className="h-8 text-xs"
                      />
                      <Input
                        type="number"
                        placeholder="Max Pts"
                        value={c.max_points}
                        onChange={(e) => {
                          const newCrit = [...questionFormData.rubric_criteria];
                          newCrit[idx].max_points = Number(e.target.value);
                          setQuestionFormData({ ...questionFormData, rubric_criteria: newCrit });
                        }}
                        className="h-8 text-xs"
                      />
                      <Input
                        type="text"
                        placeholder="Grading expectations..."
                        value={c.description}
                        onChange={(e) => {
                          const newCrit = [...questionFormData.rubric_criteria];
                          newCrit[idx].description = e.target.value;
                          setQuestionFormData({ ...questionFormData, rubric_criteria: newCrit });
                        }}
                        className="h-8 text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newCrit = questionFormData.rubric_criteria.filter((_, i) => i !== idx);
                          setQuestionFormData({ ...questionFormData, rubric_criteria: newCrit });
                        }}
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="space-y-1 pt-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Model Solution / Evaluator Guidelines
                  </label>
                  <textarea
                    rows={2}
                    value={questionFormData.grading_guidelines}
                    onChange={(e) =>
                      setQuestionFormData({ ...questionFormData, grading_guidelines: e.target.value })
                    }
                    placeholder="Expected derivation steps, common pitfalls..."
                    className="w-full p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tags (Comma separated)
              </label>
              <Input
                type="text"
                placeholder="e.g. algorithms, trees, binary-search"
                value={questionFormData.tags}
                onChange={(e) => setQuestionFormData({ ...questionFormData, tags: e.target.value })}
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsQuestionModalOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-9 text-xs bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
              >
                {editingQuestion ? 'Update Question' : 'Save Question'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation Alert Dialog */}
      <AlertDialog
        open={Boolean(questionToArchive)}
        onOpenChange={(open) => {
          if (!open) setQuestionToArchive(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-red-600">
              Confirm Item Archive
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Are you sure you want to archive this question? It will be removed from all future blueprint sampling draws.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              disabled={archiving}
              onClick={() => setQuestionToArchive(null)}
              className="text-xs h-9"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={archiving}
              onClick={confirmArchive}
              className="text-xs h-9 bg-red-600 hover:bg-red-700 text-white"
            >
              {archiving ? 'Archiving...' : 'Archive Question'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default QuestionBankPage;
