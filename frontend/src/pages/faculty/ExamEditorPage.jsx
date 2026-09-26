/**
 * @file ExamEditorPage.jsx
 * @description Exam authoring page for blueprint metadata, topic question rules, inventory validation, and publishing.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  BookOpen,
  Clock,
  Award,
  Layers,
  Sparkles,
  Lock,
} from 'lucide-react';
import * as examsApi from '../../api/examsApi.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx';
import { Separator } from '../../components/ui/separator.jsx';

function getStatusBadge(status) {
  switch (status) {
    case 'DRAFT':
      return <Badge variant="secondary">Draft Blueprint</Badge>;
    case 'PUBLISHED':
      return <Badge variant="success">Published & Locked</Badge>;
    case 'ACTIVE':
      return <Badge variant="success">Active Session</Badge>;
    case 'COMPLETED':
      return <Badge variant="outline">Concluded</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function ExamEditorPage() {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [publishing, setPublishing] = useState(false);

  // New topic rule form
  const [topic, setTopic] = useState('');
  const [questionCount, setQuestionCount] = useState('5');
  const [difficulty, setDifficulty] = useState('MEDIUM');
  const [bloomLevel, setBloomLevel] = useState('APPLY');
  const [pointsPerQuestion, setPointsPerQuestion] = useState('2');
  const [addingRule, setAddingRule] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const loadExam = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await examsApi.getExam(examId);
      setExam(data);
    } catch (err) {
      setError(err.message || 'Failed to load exam blueprint');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    loadExam();
  }, [loadExam]);

  async function handleValidateBlueprint() {
    setActionError('');
    setValidating(true);
    try {
      const res = await examsApi.validateBlueprint(examId);
      setValidationResult(res);
    } catch (err) {
      setActionError(err.message || 'Blueprint validation failed');
    } finally {
      setValidating(false);
    }
  }

  async function handleAddRule(e) {
    e.preventDefault();
    setActionError('');
    setAddingRule(true);

    try {
      await examsApi.addTopicRule(examId, {
        topic: topic.trim(),
        question_count: parseInt(questionCount, 10),
        points_per_question: parseInt(pointsPerQuestion, 10),
      });

      setTopic('');
      await loadExam();
    } catch (err) {
      setActionError(err.message || 'Failed to add topic rule');
    } finally {
      setAddingRule(false);
    }
  }

  async function handleDeleteRule(ruleId) {
    setActionError('');
    try {
      await examsApi.deleteTopicRule(examId, ruleId);
      await loadExam();
    } catch (err) {
      setActionError(err.message || 'Failed to remove topic rule');
    }
  }

  async function handlePublish() {
    setActionError('');
    setPublishing(true);
    try {
      await examsApi.publishExam(examId);
      await loadExam();
    } catch (err) {
      setActionError(err.message || 'Failed to publish exam blueprint');
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full max-w-5xl mx-auto py-20 text-center space-y-3">
        <RefreshCw size={28} className="animate-spin mx-auto text-slate-400" />
        <p className="text-sm font-medium text-slate-500">Loading exam blueprint details...</p>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="w-full max-w-lg mx-auto py-16">
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center p-8 space-y-4">
          <AlertCircle size={36} className="mx-auto text-slate-400 stroke-1" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Exam Blueprint Not Found</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            The requested examination blueprint does not exist or has been removed.
          </p>
          <Button onClick={() => navigate('/faculty')}>Return to Faculty Dashboard</Button>
        </Card>
      </div>
    );
  }

  const isDraft = exam.status === 'DRAFT';
  const rules = exam.topic_rules || [];
  const totalRulePoints = rules.reduce(
    (sum, r) => sum + (r.question_count * r.points_per_question),
    0
  );
  const isPointsBalanced = totalRulePoints === exam.total_marks;

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

      {/* Blueprint Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Blueprint Authoring
          </span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Assessment Specification
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {exam.title}
            </h1>
            {getStatusBadge(exam.status)}
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              disabled={validating}
              onClick={handleValidateBlueprint}
              className="text-xs h-9 gap-1.5"
            >
              {validating ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
              <span>Validate Inventory</span>
            </Button>

            {isDraft && (
              <Button
                size="sm"
                disabled={!isPointsBalanced || rules.length === 0 || publishing}
                onClick={handlePublish}
                className="text-xs h-9 gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
              >
                {publishing ? <RefreshCw size={13} className="animate-spin" /> : <Lock size={13} />}
                <span>Publish Blueprint</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Action Error Alert */}
      {actionError && (
        <Alert variant="destructive">
          <AlertCircle size={16} />
          <AlertTitle>Action Failed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {/* Inventory Validation Card */}
      {validationResult && (
        <Alert
          variant={validationResult.valid ? 'success' : 'warning'}
          className="border-l-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {validationResult.valid ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <AlertTitle className="text-sm font-semibold">
                  {validationResult.valid ? 'Blueprint Inventory Verified' : 'Blueprint Inventory Deficient'}
                </AlertTitle>
                <Badge variant={validationResult.valid ? 'success' : 'warning'} size="sm">
                  {validationResult.valid ? 'ALL RULES SATISFIED' : 'DEFICIENCIES DETECTED'}
                </Badge>
              </div>

              <AlertDescription className="text-xs">
                Required Pool Questions: {validationResult.summary?.total_required_questions || 0} • Available in Pool: {validationResult.summary?.total_pool_questions || 0}
              </AlertDescription>

              {!validationResult.valid && validationResult.deficiencies && validationResult.deficiencies.length > 0 && (
                <div className="pt-2 text-xs">
                  <span className="font-semibold text-red-800 dark:text-red-300">Shortfalls:</span>
                  <ul className="list-disc pl-5 mt-1 space-y-0.5 text-slate-700 dark:text-slate-300">
                    {validationResult.deficiencies.map((d, i) => (
                      <li key={i}>
                        Topic &quot;{d.topic}&quot; ({d.difficulty}): requires {d.required_count}, but question pool only has {d.available_count} (shortfall of {d.shortfall}).
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setValidationResult(null)}
              className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900"
            >
              ✕
            </Button>
          </div>
        </Alert>
      )}

      {/* Blueprint Parameters Card */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BookOpen size={16} className="text-slate-600 dark:text-slate-400" />
            Blueprint Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="space-y-0.5">
              <span className="text-slate-500 dark:text-slate-400">Subject</span>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {exam.subject || exam.subject_name || 'Assigned Subject'}
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-slate-500 dark:text-slate-400">Duration</span>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                <Clock size={13} className="text-slate-400" />
                {exam.duration_minutes} Minutes
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-slate-500 dark:text-slate-400">Total Marks</span>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                <Award size={13} className="text-slate-400" />
                {exam.total_marks} Marks
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-slate-500 dark:text-slate-400">Passing Threshold</span>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {exam.passing_marks} Marks ({((exam.passing_marks / (exam.total_marks || 1)) * 100).toFixed(0)}%)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Topic Allocation Rules */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers size={16} className="text-slate-600 dark:text-slate-400" />
                Topic Question Allocation Rules
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Rules govern the dynamic sampling of questions from the pool when attempts are generated.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Allocated Points:</span>
              <Badge variant={isPointsBalanced ? 'success' : 'destructive'} size="sm">
                {totalRulePoints} / {exam.total_marks} Marks
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {rules.length === 0 ? (
            <div className="text-center py-12 px-4 text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <Layers size={28} className="mx-auto text-slate-400 dark:text-slate-600 stroke-1 mb-2" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">No topic rules defined yet</p>
              <p>Add topic rules below to define question count and difficulty mix for this blueprint.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[45%]">Topic / Question Pool</TableHead>
                    <TableHead className="w-[20%]">Questions</TableHead>
                    <TableHead className="w-[15%]">Points / Q</TableHead>
                    <TableHead className="w-[15%]">Subtotal</TableHead>
                    {isDraft && <TableHead className="w-[5%] text-right">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule, index) => {
                    const ruleKey = rule.rule_id || rule.id || `rule-${rule.topic || index}-${index}`;
                    const subtotal = rule.question_count * rule.points_per_question;
                    return (
                      <TableRow key={ruleKey} className="h-12">
                        <TableCell className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                          {rule.topic || rule.topic_name}
                        </TableCell>
                        <TableCell className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                          {rule.question_count}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 dark:text-slate-400">
                          {rule.points_per_question} pts
                        </TableCell>
                        <TableCell className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {subtotal} pts
                        </TableCell>
                        {isDraft && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteRule(rule.rule_id || rule.id)}
                              className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                              <Trash2 size={13} />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Add Rule Form (Draft Only) */}
          {isDraft && (
            <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-1.5">
                <Plus size={14} />
                Add Question Pool Specification
              </h4>

              <form onSubmit={handleAddRule} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="md:col-span-2 space-y-1">
                  <label htmlFor="rule-topic" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Topic / Question Pool *
                  </label>
                  <Input
                    id="rule-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Computer Networks & Security"
                    required
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="rule-count" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Questions Count
                  </label>
                  <Input
                    id="rule-count"
                    type="number"
                    min="1"
                    value={questionCount}
                    onChange={(e) => setQuestionCount(e.target.value)}
                    required
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="rule-points" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Points / Q
                  </label>
                  <Input
                    id="rule-points"
                    type="number"
                    min="1"
                    value={pointsPerQuestion}
                    onChange={(e) => setPointsPerQuestion(e.target.value)}
                    required
                    className="h-8 text-xs"
                  />
                </div>

                <div className="md:col-span-6 flex justify-end pt-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={addingRule}
                    className="h-8 text-xs gap-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    {addingRule && <RefreshCw size={13} className="animate-spin" />}
                    <span>Add Topic Rule</span>
                  </Button>
                </div>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ExamEditorPage;
