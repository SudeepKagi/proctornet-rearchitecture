/**
 * @file FacultyQuestionPoolsPage.jsx
 * @description Question Pool Builder (AI-Powered) for Faculty.
 * Manages question pools categorized by Topic, provides PDF upload and LLM-assisted MCQ generation,
 * with full preview, manual editing, deletion, and persistent pool saving.
 */

import React, { useState, useEffect } from 'react';
import * as facultyApi from '../../api/facultyApi.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog.jsx';
import {
  Sparkles,
  UploadCloud,
  FileText,
  Plus,
  RefreshCw,
  Layers,
  CheckCircle2,
  Trash2,
  Edit2,
  BookOpen,
  ChevronRight,
  AlertCircle,
  HelpCircle,
  FolderPlus,
  Check,
} from 'lucide-react';

export function FacultyQuestionPoolsPage() {
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selected pool to inspect questions
  const [selectedPool, setSelectedPool] = useState(null);
  const [poolQuestions, setPoolQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Create new manual topic pool modal
  const [isNewPoolOpen, setIsNewPoolOpen] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicDesc, setNewTopicDesc] = useState('');
  const [creatingPool, setCreatingPool] = useState(false);

  // AI Generator Modal State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiTopicName, setAiTopicName] = useState('');
  const [aiPdfFile, setAiPdfFile] = useState(null);
  const [aiQuestionCount, setAiQuestionCount] = useState('5');
  const [aiDifficulty, setAiDifficulty] = useState('MEDIUM');
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState('');

  // Generated MCQs Preview & Edit state
  const [generatedQuestions, setGeneratedQuestions] = useState([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [savingPool, setSavingPool] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  async function loadPools() {
    setLoading(true);
    setError('');
    try {
      const data = await facultyApi.listQuestionPools();
      setPools(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || 'Failed to load question pools');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPools();
  }, []);

  async function handleInspectPool(pool) {
    setSelectedPool(pool);
    setLoadingQuestions(true);
    try {
      const qs = await facultyApi.getTopicPoolQuestions(pool.topic_id);
      setPoolQuestions(Array.isArray(qs) ? qs : []);
    } catch (err) {
      setError(err?.message || 'Failed to load questions for this topic pool');
    } finally {
      setLoadingQuestions(false);
    }
  }

  async function handleCreateNewPool(e) {
    e.preventDefault();
    if (!newTopicName.trim()) return;
    setCreatingPool(true);
    try {
      await facultyApi.createQuestionPool({
        name: newTopicName.trim(),
        description: newTopicDesc.trim(),
      });
      setIsNewPoolOpen(false);
      setNewTopicName('');
      setNewTopicDesc('');
      await loadPools();
    } catch (err) {
      setError(err?.message || 'Failed to create question pool');
    } finally {
      setCreatingPool(false);
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setAiError('Please upload a valid .pdf file.');
        return;
      }
      setAiError('');
      setAiPdfFile(file);
    }
  }

  async function handleGenerateFromPdf() {
    if (!aiTopicName.trim()) {
      setAiError('Please enter a target Topic Name for this question pool.');
      return;
    }
    if (!aiPdfFile) {
      setAiError('Please select a PDF document to upload.');
      return;
    }

    setGenerating(true);
    setAiError('');

    try {
      const result = await facultyApi.generateMCQsFromPdf({
        file: aiPdfFile,
        topicName: aiTopicName.trim(),
        questionCount: Number(aiQuestionCount) || 5,
        difficulty: aiDifficulty,
      });

      if (!result?.questions || result.questions.length === 0) {
        throw new Error('No questions could be extracted from the document. Please try a different PDF.');
      }

      setGeneratedQuestions(result.questions);
      setIsAiModalOpen(false);
      setIsPreviewOpen(true);
    } catch (err) {
      setAiError(err?.message || 'Failed to generate MCQs from PDF');
    } finally {
      setGenerating(false);
    }
  }

  // Edit generated question stem
  function updateQuestionText(idx, val) {
    setGeneratedQuestions((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], question_text: val };
      return next;
    });
  }

  // Edit generated option
  function updateOptionText(qIdx, optIdx, val) {
    setGeneratedQuestions((prev) => {
      const next = [...prev];
      const nextOpts = [...next[qIdx].options];
      const oldVal = nextOpts[optIdx];
      nextOpts[optIdx] = val;
      let nextCorrect = next[qIdx].correct_answer;
      if (nextCorrect === oldVal) {
        nextCorrect = val;
      }
      next[qIdx] = { ...next[qIdx], options: nextOpts, correct_answer: nextCorrect };
      return next;
    });
  }

  // Select correct option
  function selectCorrectAnswer(qIdx, optVal) {
    setGeneratedQuestions((prev) => {
      const next = [...prev];
      next[qIdx] = { ...next[qIdx], correct_answer: optVal };
      return next;
    });
  }

  // Delete generated question from preview
  function deleteGeneratedQuestion(idx) {
    setGeneratedQuestions((prev) => prev.filter((_, i) => i !== idx));
  }

  // Save approved questions to the topic pool in DB
  async function handleSaveApprovedQuestions() {
    if (generatedQuestions.length === 0) {
      alert('No questions to save.');
      return;
    }

    setSavingPool(true);
    try {
      // 1. Ensure topic pool exists (or create it)
      let topic = pools.find((p) => p.topic_name.toLowerCase() === aiTopicName.trim().toLowerCase());
      if (!topic) {
        topic = await facultyApi.createQuestionPool({
          name: aiTopicName.trim(),
          description: `AI-generated question pool from "${aiPdfFile?.name || 'document'}"`,
        });
      }

      // 2. Save questions
      await facultyApi.saveQuestionsToPool(topic.topic_id, generatedQuestions);

      setSaveSuccessMsg(`Successfully saved ${generatedQuestions.length} MCQs to Topic: "${aiTopicName}"!`);
      setIsPreviewOpen(false);
      setGeneratedQuestions([]);
      setAiPdfFile(null);
      await loadPools();

      // Show inspect of updated pool
      handleInspectPool(topic);
    } catch (err) {
      alert(err?.message || 'Failed to save questions into topic pool');
    } finally {
      setSavingPool(false);
    }
  }

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <span>Faculty Workspace</span> &bull; <span>Authoring</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            Question Pools <Sparkles size={20} className="text-purple-600" />
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Organize questions into topic-based pools. Use AI document parsing to automatically generate verified MCQs from lecture PDFs.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadPools}
            disabled={loading}
            className="gap-1.5 h-9 text-xs"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsNewPoolOpen(true)}
            className="gap-1.5 h-9 text-xs border-slate-300"
          >
            <FolderPlus size={14} /> New Topic Pool
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setAiError('');
              setIsAiModalOpen(true);
            }}
            className="gap-1.5 h-9 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-xs"
          >
            <Sparkles size={14} /> AI PDF Question Generator
          </Button>
        </div>
      </div>

      {saveSuccessMsg && (
        <Alert variant="success" className="bg-emerald-50 border-emerald-200 text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertDescription className="text-xs font-medium">{saveSuccessMsg}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Layout: Pools on Left, Questions on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Topic Pools Cards */}
        <div className="space-y-4 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Topic Pools ({pools.length})
            </h3>
            <span className="text-[11px] text-slate-400">Select to inspect</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading topic pools...</div>
          ) : pools.length === 0 ? (
            <Card className="border-dashed p-8 text-center space-y-3">
              <Layers className="mx-auto h-8 w-8 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No Topic Pools Yet</p>
              <p className="text-xs text-slate-500">
                Click "AI PDF Question Generator" to generate questions from your syllabus material.
              </p>
            </Card>
          ) : (
            <div className="space-y-2.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {pools.map((p) => {
                const isSelected = selectedPool?.topic_id === p.topic_id;
                return (
                  <div
                    key={p.topic_id}
                    onClick={() => handleInspectPool(p)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50/50 shadow-xs ring-1 ring-purple-600'
                        : 'border-slate-200 hover:border-slate-300 bg-white hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900 leading-snug">
                        {p.topic_name}
                      </h4>
                      <Badge variant="outline" className="text-xs font-bold text-purple-700 border-purple-200 shrink-0">
                        {p.total_questions} MCQs
                      </Badge>
                    </div>

                    {p.description && (
                      <p className="text-xs text-slate-500 line-clamp-1 mt-1">{p.description}</p>
                    )}

                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                      <span>Easy: <strong className="text-slate-700">{p.easy_count || 0}</strong></span>
                      <span>&bull;</span>
                      <span>Med: <strong className="text-slate-700">{p.medium_count || 0}</strong></span>
                      <span>&bull;</span>
                      <span>Hard: <strong className="text-slate-700">{p.hard_count || 0}</strong></span>
                      <ChevronRight size={14} className="ml-auto text-slate-400" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Col: Questions inside selected Topic Pool */}
        <div className="space-y-4 lg:col-span-2">
          {selectedPool ? (
            <Card className="border border-slate-200 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-purple-100 text-purple-800 text-[11px]">
                      Topic Pool
                    </Badge>
                    <span className="text-xs text-slate-400 font-medium">
                      {poolQuestions.length} Questions Stored
                    </span>
                  </div>
                  <CardTitle className="text-lg font-bold text-slate-900 mt-1">
                    {selectedPool.topic_name}
                  </CardTitle>
                  {selectedPool.description && (
                    <CardDescription className="text-xs text-slate-500">
                      {selectedPool.description}
                    </CardDescription>
                  )}
                </div>

                <Button
                  size="sm"
                  onClick={() => {
                    setAiTopicName(selectedPool.topic_name);
                    setIsAiModalOpen(true);
                  }}
                  className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white font-medium gap-1"
                >
                  <Sparkles size={13} /> Add MCQs via AI
                </Button>
              </CardHeader>

              <CardContent className="p-4 sm:p-6">
                {loadingQuestions ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    Loading questions for this pool...
                  </div>
                ) : poolQuestions.length === 0 ? (
                  <div className="py-10 text-center space-y-2">
                    <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-700">No Questions in this Pool Yet</p>
                    <p className="text-xs text-slate-400">
                      Upload a PDF document to generate questions for this topic.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {poolQuestions.map((q, idx) => (
                      <div
                        key={q.question_id || idx}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <h5 className="text-sm font-semibold text-slate-900 leading-snug">
                              {q.question_text}
                            </h5>
                          </div>
                          <Badge variant="outline" className="text-[10px] uppercase font-bold shrink-0">
                            {q.difficulty}
                          </Badge>
                        </div>

                        {/* Options Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
                          {Array.isArray(q.options) &&
                            q.options.map((opt, oIdx) => {
                              const isCorrect = opt.is_correct;
                              return (
                                <div
                                  key={opt.option_id || oIdx}
                                  className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                                    isCorrect
                                      ? 'border-emerald-300 bg-emerald-50/80 font-bold text-emerald-900'
                                      : 'border-slate-200 bg-white text-slate-700'
                                  }`}
                                >
                                  <span>{opt.option_text}</span>
                                  {isCorrect && (
                                    <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-extrabold flex items-center gap-0.5">
                                      <Check size={11} /> Correct
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed p-16 text-center space-y-3">
              <Layers className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="text-base font-bold text-slate-700">Select a Topic Pool to View Questions</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Or click the AI PDF Generator button above to parse course documents and automatically create a new topic pool.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* MODAL 1: AI PDF Generator Form */}
      <Dialog open={isAiModalOpen} onOpenChange={setIsAiModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-1.5 text-purple-600 font-bold text-xs uppercase tracking-wider mb-1">
              <Sparkles size={14} /> AI-Powered Question Generator
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">
              Generate Questions from PDF
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Upload your syllabus or reference PDF material. ProctorNet AI will extract key concepts and formulate multiple choice questions.
            </DialogDescription>
          </DialogHeader>

          {aiError && (
            <Alert variant="destructive" className="py-2.5">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{aiError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Topic Name <span className="text-rose-500">*</span>
              </label>
              <Input
                placeholder="e.g. Digital Filter Design, TCP Sliding Window"
                value={aiTopicName}
                onChange={(e) => setAiTopicName(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                PDF File Upload <span className="text-rose-500">*</span>
              </label>
              <div className="border-2 border-dashed border-slate-200 hover:border-purple-400 rounded-xl p-5 text-center transition-colors bg-slate-50/50">
                <input
                  type="file"
                  id="pdf-upload-input"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="pdf-upload-input"
                  className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                >
                  <UploadCloud className="h-8 w-8 text-purple-500" />
                  <div className="text-xs">
                    {aiPdfFile ? (
                      <span className="font-bold text-purple-700 flex items-center gap-1">
                        <FileText size={13} /> {aiPdfFile.name} ({(aiPdfFile.size / 1024).toFixed(0)} KB)
                      </span>
                    ) : (
                      <>
                        <span className="font-semibold text-purple-600 hover:text-purple-700">
                          Click to select PDF
                        </span>{' '}
                        <span className="text-slate-400">or drag and drop</span>
                      </>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">PDF up to 25MB</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Question Count
                </label>
                <select
                  value={aiQuestionCount}
                  onChange={(e) => setAiQuestionCount(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="5">5 Questions</option>
                  <option value="10">10 Questions</option>
                  <option value="15">15 Questions</option>
                  <option value="20">20 Questions</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Difficulty Level
                </label>
                <select
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsAiModalOpen(false)}
              disabled={generating}
              className="h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleGenerateFromPdf}
              disabled={generating}
              className="h-9 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold gap-1.5 shadow-xs"
            >
              {generating ? (
                <>
                  <RefreshCw size={13} className="animate-spin" /> Extracting & Generating MCQs...
                </>
              ) : (
                <>
                  <Sparkles size={14} /> Generate Questions
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Preview, Edit & Save Generated Questions */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-purple-100 text-purple-800 text-xs">
                Generated Preview
              </Badge>
              <span className="text-xs text-slate-500">
                Target Topic: <strong>{aiTopicName}</strong>
              </span>
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">
              Review & Curate Generated MCQs ({generatedQuestions.length})
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Preview each question. You can edit the question text, modify option strings, select the correct answer, or delete any unwanted items before saving to the pool.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {generatedQuestions.map((q, qIdx) => (
              <div
                key={qIdx}
                className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3 relative group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">
                      {qIdx + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-500">Question Stem</span>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteGeneratedQuestion(qIdx)}
                    className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>

                <Input
                  value={q.question_text}
                  onChange={(e) => updateQuestionText(qIdx, e.target.value)}
                  className="font-medium text-slate-900 text-sm"
                />

                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Options (Select radio for correct answer)
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt, optIdx) => {
                      const isCorrect = opt.trim().toLowerCase() === (q.correct_answer || '').trim().toLowerCase();
                      return (
                        <div
                          key={optIdx}
                          className={`p-2 rounded-lg border flex items-center gap-2 transition-colors ${
                            isCorrect
                              ? 'border-emerald-400 bg-emerald-50/60 ring-1 ring-emerald-400'
                              : 'border-slate-200 bg-slate-50/60'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`correct_answer_${qIdx}`}
                            checked={isCorrect}
                            onChange={() => selectCorrectAnswer(qIdx, opt)}
                            className="text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => updateOptionText(qIdx, optIdx, e.target.value)}
                            className="bg-transparent border-none text-xs font-medium text-slate-800 w-full focus:outline-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPreviewOpen(false)}
              disabled={savingPool}
              className="h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveApprovedQuestions}
              disabled={savingPool || generatedQuestions.length === 0}
              className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-xs"
            >
              {savingPool ? (
                <>
                  <RefreshCw size={13} className="animate-spin" /> Saving to Topic Pool...
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} /> Save {generatedQuestions.length} Questions to Pool
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Create Manual Topic Pool */}
      <Dialog open={isNewPoolOpen} onOpenChange={setIsNewPoolOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Create New Question Pool
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Establish a new syllabus topic category to store and curate questions.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateNewPool} className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Topic Pool Title <span className="text-rose-500">*</span>
              </label>
              <Input
                placeholder="e.g. Microcontrollers & Embedded Systems"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                required
                className="h-9 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Description / Coverage
              </label>
              <Input
                placeholder="Module scope, textbook chapters, or unit notes"
                value={newTopicDesc}
                onChange={(e) => setNewTopicDesc(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsNewPoolOpen(false)}
                disabled={creatingPool}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creatingPool || !newTopicName.trim()}
                className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs"
              >
                {creatingPool ? 'Creating...' : 'Create Topic Pool'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FacultyQuestionPoolsPage;
