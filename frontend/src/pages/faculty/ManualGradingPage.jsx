/**
 * @file ManualGradingPage.jsx
 * @description Faculty subjective evaluation workspace, rubric scoring, and score overrides.
 * Conforms to Phase 26 Track 1 Workstream C.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';
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
              pointsAwarded: item.points_awarded !== null && item.points_awarded !== undefined ? item.points_awarded : 0,
              feedback: item.manual_grade?.feedback || '',
              rationale: '',
              rubricScores: item.manual_grade?.rubric_breakdown || {}
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
          pointsAwarded: totalFromRubric
        }
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
        rationale: state.rationale
      });

      setSuccessMsg('Grade recorded and exam score atomically recalculated.');
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
      setAudits(data);
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
        rationale: overrideRationale
      });
      setIsOverrideOpen(false);
      setOverrideScore('');
      setOverrideRationale('');
      setSuccessMsg('Overall score override recorded.');
      await loadEvaluation();
    } catch (err) {
      setError(err.message || 'Failed to override score');
    } finally {
      setSubmittingOverride(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem 0' }}>
        <Spinner size="lg" label="Loading subjective evaluation workspace..." />
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Button variant="secondary" size="sm" onClick={() => navigate(-1)} style={{ marginBottom: '0.5rem' }}>
            &larr; Back
          </Button>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Subjective Grading Workspace
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Candidate: <strong>{evaluation?.candidate_name || 'Candidate'}</strong> | Exam: <strong>{evaluation?.exam_title || 'Assessment'}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="secondary" size="sm" onClick={handleLoadAudits}>
            📜 Audit History
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setIsOverrideOpen(true)}>
            ⚖️ Override Total Score
          </Button>
        </div>
      </div>

      {/* Score Summary KPI Card */}
      <Card padding="normal" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
              Current Total Score
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-primary)' }}>
              {evaluation?.score} / {evaluation?.total_marks}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
              Percentage
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800 }}>
              {evaluation?.percentage !== undefined ? `${Number(evaluation.percentage).toFixed(2)}%` : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
              Evaluation Status
            </div>
            <div style={{ marginTop: '0.25rem' }}>
              <Badge variant={evaluation?.needs_manual_grading ? 'warning' : 'success'}>
                {evaluation?.needs_manual_grading ? 'NEEDS MANUAL GRADING' : 'FULLY EVALUATED'}
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {error && (
        <div style={{ padding: '0.75rem 1rem', marginBottom: '1.5rem', borderRadius: '0.5rem', backgroundColor: 'var(--color-danger-light)', border: '1px solid var(--color-danger-border)', color: 'var(--color-danger)', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {successMsg && (
        <div style={{ padding: '0.75rem 1rem', marginBottom: '1.5rem', borderRadius: '0.5rem', backgroundColor: 'var(--color-success-light)', border: '1px solid var(--color-success-border)', color: 'var(--color-success)', fontSize: '0.875rem' }}>
          {successMsg}
        </div>
      )}

      {/* Questions Breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {evaluation?.breakdown?.map((item, idx) => {
          const isSubjective = ['SHORT_ANSWER', 'ESSAY', 'CODE'].includes(item.question_type);
          const state = gradingState[item.question_id] || { pointsAwarded: 0, feedback: '', rationale: '', rubricScores: {} };

          return (
            <Card key={item.question_id} padding="normal">
              {/* Question Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem' }}>Question {idx + 1}</span>
                  <Badge variant="primary">{item.question_type}</Badge>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                    Max: {item.max_points} pt{item.max_points === 1 ? '' : 's'}
                  </span>
                </div>
                <div>
                  <Badge variant={item.points_awarded !== null ? 'success' : 'warning'}>
                    {item.points_awarded !== null ? `Awarded: ${item.points_awarded} / ${item.max_points}` : 'Pending Evaluation'}
                  </Badge>
                </div>
              </div>

              {/* Prompt */}
              <div style={{ fontSize: '0.9375rem', fontWeight: 500, marginBottom: '1rem', lineHeight: 1.5 }}>
                {item.prompt}
              </div>

              {/* Candidate Response */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Candidate Submitted Answer:
                </div>
                {item.question_type === 'CODE' ? (
                  <pre style={{ padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#0f172a', color: '#f8fafc', fontSize: '0.875rem', overflowX: 'auto', fontFamily: 'monospace' }}>
                    {item.candidate_response || '(No code submitted)'}
                  </pre>
                ) : (
                  <div style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', backgroundColor: 'var(--color-surface-secondary)', border: '1px solid var(--color-border-subtle)', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                    {item.candidate_response || '(No response recorded)'}
                  </div>
                )}
              </div>

              {/* Subjective Grading Form */}
              {isSubjective && (
                <div style={{ backgroundColor: 'var(--color-surface-secondary)', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid var(--color-border-subtle)' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-text-primary)' }}>
                    Subjective Rubric & Evaluation
                  </h4>

                  {/* Rubric Breakdown if defined */}
                  {item.rubric?.criteria && item.rubric.criteria.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                        Criteria Rubric Breakdown:
                      </div>
                      {item.rubric.criteria.map((crit) => (
                        <div key={crit.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', backgroundColor: 'var(--color-surface)', padding: '0.5rem 0.75rem', borderRadius: '0.375rem' }}>
                          <div>
                            <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{crit.name}</div>
                            {crit.description && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{crit.description}</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                              type="number"
                              min="0"
                              max={crit.max_points}
                              value={state.rubricScores[crit.name] ?? 0}
                              onChange={(e) => handleRubricScoreChange(item.question_id, crit.name, e.target.value, crit.max_points)}
                              style={{ width: '60px', padding: '0.25rem', textAlign: 'center', borderRadius: '0.25rem', border: '1px solid var(--color-border-subtle)' }}
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>/ {crit.max_points}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Points Awarded * (Max: {item.max_points})
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={item.max_points}
                        step="0.5"
                        value={state.pointsAwarded}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setGradingState((prev) => ({
                            ...prev,
                            [item.question_id]: { ...prev[item.question_id], pointsAwarded: val }
                          }));
                        }}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Mandatory Rationale * (Audit Requirement)
                      </label>
                      <input
                        type="text"
                        placeholder="Rationale for awarded credit / partial score..."
                        value={state.rationale}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGradingState((prev) => ({
                            ...prev,
                            [item.question_id]: { ...prev[item.question_id], rationale: val }
                          }));
                        }}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)' }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Candidate Feedback (Optional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Feedback visible to candidate after results release..."
                      value={state.feedback}
                      onChange={(e) => {
                        const val = e.target.value;
                        setGradingState((prev) => ({
                          ...prev,
                          [item.question_id]: { ...prev[item.question_id], feedback: val }
                        }));
                      }}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)', fontSize: '0.8125rem' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSubmitQuestionGrade(item.question_id, item.max_points)}
                    >
                      Save Question Grade
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Audit History Modal */}
      {isAuditsOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ maxWidth: '640px', width: '100%', maxHeight: '80vh', overflowY: 'auto', backgroundColor: 'var(--color-surface)', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Grading Audit History</h3>
              <button onClick={() => setIsAuditsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            </div>

            {loadingAudits ? (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <Spinner size="md" label="Loading audit logs..." />
              </div>
            ) : audits.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
                No manual grading audits recorded for this attempt.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {audits.map((a, idx) => (
                  <div key={idx} style={{ padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--color-surface-secondary)', border: '1px solid var(--color-border-subtle)', fontSize: '0.8125rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 600 }}>Grader: {a.grader_name || a.grader_user_id || 'Staff'}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>{new Date(a.created_at).toLocaleString()}</span>
                    </div>
                    <div>Score Shift: {a.old_score ?? 0} &rarr; <strong>{a.new_score}</strong></div>
                    <div style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Rationale: {a.rationale}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Score Override Modal */}
      {isOverrideOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ maxWidth: '480px', width: '100%', backgroundColor: 'var(--color-surface)', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.75rem' }}>Override Total Score</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Directly adjust candidate total score with mandatory institutional rationale and immutable audit logging.
            </p>

            <form onSubmit={handleSubmitOverride} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>New Total Score *</label>
                <input
                  required
                  type="number"
                  step="0.5"
                  max={evaluation?.total_marks}
                  value={overrideScore}
                  onChange={(e) => setOverrideScore(e.target.value)}
                  placeholder={`Current: ${evaluation?.score}`}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>Mandatory Institutional Rationale *</label>
                <textarea
                  required
                  rows={3}
                  value={overrideRationale}
                  onChange={(e) => setOverrideRationale(e.target.value)}
                  placeholder="State reason for administrative score adjustment..."
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <Button variant="secondary" size="sm" type="button" onClick={() => setIsOverrideOpen(false)}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" type="submit" disabled={submittingOverride}>
                  {submittingOverride ? 'Recording...' : 'Confirm Override'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManualGradingPage;
