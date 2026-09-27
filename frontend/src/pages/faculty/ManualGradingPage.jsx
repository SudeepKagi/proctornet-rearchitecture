/**
 * @file ManualGradingPage.jsx
 * @description Faculty subjective evaluation workspace, rubric scoring, and score overrides.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  History,
  Scale,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  FileText,
  Code,
  Sparkles,
} from 'lucide-react';
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
import { Separator } from '../../components/ui/separator.jsx';
import { StateBoundary } from '../../components/common/StateBoundary.jsx';
import * as mgApi from '../../api/manualGradingApi.js';

export function ManualGradingPage() {
  const { resultId } = useParams();
  const navigate = useNavigate();

  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Grading form state per question: { [questionId]: { pointsAwarded, feedback, rationale, rubricScores: {} } }
  const [gradingState, setGradingState] = useState({});

  // Audit modal state
  const [isAuditsOpen, setIsAuditsOpen] = useState(false);
  const [audits, setAudits] = useState([]);
  const [loadingAudits, setLoadingAudits] = useState(false);

  // Score override modal
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [overrideScore, setOverrideScore] = useState('');
  const [overrideRationale, setOverrideRationale] = useState('');
  const [submittingOverride, setSubmittingOverride] = useState(false);

  const loadEvaluation = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await mgApi.getEvaluationBreakdown(resultId);
      setEvaluation(data);

      // Initialize grading state for subjective questions
      const initial = {};
      if (data?.breakdown) {
        data.breakdown.forEach((item) => {
          if (['SHORT_ANSWER', 'ESSAY', 'CODE'].includes(item.question_type)) {
            initial[item.question_id] = {
              pointsAwarded:
                item.points_awarded !== null && item.points_awarded !== undefined
                  ? item.points_awarded
                  : 0,
              feedback: item.manual_grade?.feedback || '',
              rationale: '',
              rubricScores: item.manual_grade?.rubric_breakdown || {},
            };
          }
        });
      }
      setGradingState(initial);
    } catch (err) {
      setError(err.message || 'Failed to load evaluation workspace');
    } finally {
      setLoading(false);
    }
  }, [resultId]);

  useEffect(() => {
    loadEvaluation();
  }, [loadEvaluation]);

  const handleRubricScoreChange = (qId, critName, val, maxPts) => {
    const numeric = Math.min(maxPts, Math.max(0, Number(val) || 0));
    setGradingState((prev) => {
      const currentQ = prev[qId] || { rubricScores: {} };
      const updatedRubric = { ...currentQ.rubricScores, [critName]: numeric };
      const totalFromRubric = Object.values(updatedRubric).reduce((a, b) => a + b, 0);
      return {
        ...prev,
        [qId]: {
          ...currentQ,
          rubricScores: updatedRubric,
          pointsAwarded: totalFromRubric,
        },
      };
    });
  };

  const handleSubmitQuestionGrade = async (questionId, maxPoints) => {
    const state = gradingState[questionId];
    if (!state) return;

    if (state.pointsAwarded > maxPoints) {
      setError(`Awarded points (${state.pointsAwarded}) cannot exceed question max points (${maxPoints})`);
      return;
    }

    if (!state.rationale.trim()) {
      setError('A mandatory rationale is required for institutional audit compliance.');
      return;
    }

    setError('');
    setSuccessMsg('');
    try {
      await mgApi.submitManualGrade(resultId, {
        questionId,
        pointsAwarded: Number(state.pointsAwarded),
        rubricBreakdown: state.rubricScores,
        feedback: state.feedback,
        rationale: state.rationale,
      });

      setSuccessMsg('Grade recorded and assessment score atomically recalculated.');
      await loadEvaluation();
    } catch (err) {
      setError(err.message || 'Failed to submit manual grade');
    }
  };

  const handleLoadAudits = async () => {
    setIsAuditsOpen(true);
    setLoadingAudits(true);
    try {
      const data = await mgApi.getGradeAudits(resultId);
      setAudits(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load audit history');
    } finally {
      setLoadingAudits(false);
    }
  };

  const handleSubmitOverride = async (e) => {
    e.preventDefault();
    if (!overrideRationale.trim()) {
      setError('Mandatory rationale required for overall score override.');
      return;
    }

    setSubmittingOverride(true);
    try {
      await mgApi.overrideScore(resultId, {
        newScore: Number(overrideScore),
        rationale: overrideRationale,
      });
      setIsOverrideOpen(false);
      setOverrideScore('');
      setOverrideRationale('');
      setSuccessMsg('Overall score override recorded successfully.');
      await loadEvaluation();
    } catch (err) {
      setError(err.message || 'Failed to override score');
    } finally {
      setSubmittingOverride(false);
    }
  };

  if (loading || error || !evaluation) {
    return (
      <div className="w-full max-w-5xl mx-auto py-16">
        <StateBoundary
          isLoading={loading}
          error={error}
          isEmpty={!evaluation}
          loadingMessage="Loading subjective evaluation workspace and rubric breakdown..."
          emptyTitle="Evaluation Data Not Found"
          emptyDescription="The evaluation breakdown for this submission could not be found."
          onRetry={loadEvaluation}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(-1)}
          className="text-xs h-8 gap-1.5 text-slate-700 dark:text-slate-300 mb-4"
        >
          <ArrowLeft size={13} />
          <span>Back to Results</span>
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Subjective Evaluation
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Rubric Scoring Workspace
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Manual Grading & Rubric Evaluation
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Candidate: <strong className="text-slate-800 dark:text-slate-200">{evaluation?.candidate_name || 'Candidate'}</strong> • Exam: <strong className="text-slate-800 dark:text-slate-200">{evaluation?.exam_title || 'Assessment'}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadAudits}
              className="text-xs h-9 gap-1.5"
            >
              <History size={14} />
              <span>Audit History</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOverrideOpen(true)}
              className="text-xs h-9 gap-1.5"
            >
              <Scale size={14} />
              <span>Override Score</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle size={16} />
          <AlertTitle>Grading Notice</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMsg && (
        <Alert variant="success">
          <CheckCircle2 size={16} />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{successMsg}</AlertDescription>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs text-center p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Score
          </span>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            {evaluation?.score} <span className="text-sm font-normal text-slate-500">/ {evaluation?.total_marks}</span>
          </p>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs text-center p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Score Percentage
          </span>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            {evaluation?.percentage !== undefined ? `${Number(evaluation.percentage).toFixed(2)}%` : '—'}
          </p>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs text-center p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Evaluation Status
          </span>
          <div className="mt-2">
            <Badge variant={evaluation?.needs_manual_grading ? 'warning' : 'success'} size="default">
              {evaluation?.needs_manual_grading ? 'Needs Manual Grading' : 'Fully Evaluated'}
            </Badge>
          </div>
        </Card>
      </div>

      {/* Questions Breakdown */}
      <div className="space-y-4">
        {evaluation?.breakdown?.map((item, idx) => {
          const isSubjective = ['SHORT_ANSWER', 'ESSAY', 'CODE'].includes(item.question_type);
          const state =
            gradingState[item.question_id] || {
              pointsAwarded: 0,
              feedback: '',
              rationale: '',
              rubricScores: {},
            };

          return (
            <Card
              key={item.question_id}
              className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs"
            >
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Question {idx + 1}
                    </span>
                    <Badge variant="outline" size="sm">
                      {item.question_type}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      Max: {item.max_points} pts
                    </span>
                  </div>

                  <Badge
                    variant={item.points_awarded !== null ? 'success' : 'warning'}
                    size="sm"
                  >
                    {item.points_awarded !== null
                      ? `Awarded: ${item.points_awarded} / ${item.max_points} pts`
                      : 'Pending Evaluation'}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-5 space-y-4">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                  {item.prompt}
                </p>

                {/* Candidate Response Section */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Candidate Submitted Answer:
                  </span>

                  {item.question_type === 'CODE' ? (
                    <pre className="p-3.5 rounded-md bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto border border-slate-800">
                      {item.candidate_response || '(No code submitted)'}
                    </pre>
                  ) : (
                    <div className="p-3.5 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                      {item.candidate_response || '(No response recorded)'}
                    </div>
                  )}
                </div>

                {/* Subjective Grading Form */}
                {isSubjective && (
                  <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Rubric Scoring & Auditor Rationale
                    </h4>

                    {/* Criteria Rubric Breakdown */}
                    {item.rubric?.criteria && item.rubric.criteria.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                          Rubric Criteria:
                        </span>
                        <div className="space-y-2">
                          {item.rubric.criteria.map((crit) => (
                            <div
                              key={crit.name}
                              className="flex items-center justify-between gap-4 p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                            >
                              <div>
                                <strong className="font-semibold text-slate-800 dark:text-slate-200">
                                  {crit.name}
                                </strong>
                                {crit.description && (
                                  <p className="text-[11px] text-slate-500 mt-0.5">{crit.description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Input
                                  type="number"
                                  min="0"
                                  max={crit.max_points}
                                  value={state.rubricScores[crit.name] ?? 0}
                                  onChange={(e) =>
                                    handleRubricScoreChange(
                                      item.question_id,
                                      crit.name,
                                      e.target.value,
                                      crit.max_points
                                    )
                                  }
                                  className="w-16 h-7 text-xs text-center"
                                />
                                <span className="text-xs text-slate-500">/ {crit.max_points}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          Points Awarded * (Max: {item.max_points})
                        </label>
                        <Input
                          type="number"
                          min="0"
                          max={item.max_points}
                          step="0.5"
                          value={state.pointsAwarded}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setGradingState((prev) => ({
                              ...prev,
                              [item.question_id]: { ...prev[item.question_id], pointsAwarded: val },
                            }));
                          }}
                          className="h-8 text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          Mandatory Rationale * (Audit Requirement)
                        </label>
                        <Input
                          type="text"
                          placeholder="Rationale for awarded credit / partial score..."
                          value={state.rationale}
                          onChange={(e) => {
                            const val = e.target.value;
                            setGradingState((prev) => ({
                              ...prev,
                              [item.question_id]: { ...prev[item.question_id], rationale: val },
                            }));
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Candidate Feedback (Visible after release)
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Constructive feedback for candidate..."
                        value={state.feedback}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGradingState((prev) => ({
                            ...prev,
                            [item.question_id]: { ...prev[item.question_id], feedback: val },
                          }));
                        }}
                        className="w-full p-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button
                        size="sm"
                        onClick={() => handleSubmitQuestionGrade(item.question_id, item.max_points)}
                        className="text-xs h-8 bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                      >
                        Save Question Grade
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Audit History Dialog */}
      <Dialog open={isAuditsOpen} onOpenChange={setIsAuditsOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Grading Audit History</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Complete chronological ledger of score adjustments and reviewer rationales.
            </DialogDescription>
          </DialogHeader>

          {loadingAudits ? (
            <div className="py-12 text-center space-y-2">
              <RefreshCw size={24} className="animate-spin mx-auto text-slate-400" />
              <p className="text-xs text-slate-500">Loading audit logs...</p>
            </div>
          ) : audits.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              No manual grading audits recorded for this attempt.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-2 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {audits.map((a, idx) => (
                <div key={idx} className="pt-2 space-y-1">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Evaluator: {a.grader_name || a.grader_user_id || 'Staff'}
                    </span>
                    <span>{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-300">
                    Score Adjustment: {a.old_score ?? 0} &rarr; <strong className="font-bold">{a.new_score}</strong>
                  </div>
                  <div className="text-slate-500 italic">
                    Rationale: {a.rationale}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAuditsOpen(false)}
              className="h-9 text-xs"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Score Override Dialog */}
      <Dialog open={isOverrideOpen} onOpenChange={setIsOverrideOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Override Total Score</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Directly adjust candidate total score with mandatory institutional rationale and immutable audit logging.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitOverride} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                New Total Score *
              </label>
              <Input
                required
                type="number"
                step="0.5"
                max={evaluation?.total_marks}
                value={overrideScore}
                onChange={(e) => setOverrideScore(e.target.value)}
                placeholder={`Current: ${evaluation?.score}`}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Mandatory Institutional Rationale *
              </label>
              <textarea
                required
                rows={3}
                value={overrideRationale}
                onChange={(e) => setOverrideRationale(e.target.value)}
                placeholder="State formal reason for administrative score adjustment..."
                className="w-full p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setIsOverrideOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submittingOverride}
                className="h-9 text-xs bg-red-600 hover:bg-red-700 text-white"
              >
                {submittingOverride ? 'Recording...' : 'Confirm Override'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ManualGradingPage;
