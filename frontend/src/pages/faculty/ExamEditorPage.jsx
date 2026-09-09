/**
 * @file ExamEditorPage.jsx
 * @description Exam authoring page for blueprint metadata, topic question rules, and publishing.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as examsApi from '../../api/examsApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Badge, getStatusBadgeVariant } from '../../components/common/Badge.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';

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
        topic,
        question_count: parseInt(questionCount, 10),
        difficulty,
        bloom_level: bloomLevel,
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
      <div className="container" style={{ textAlign: 'center', padding: '4rem 0' }}>
        <Spinner size="lg" label="Loading exam blueprint..." />
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="container" style={{ maxWidth: '600px' }}>
        <Card style={{ textAlign: 'center', padding: '2rem' }}>
          <h2>Exam Not Found</h2>
          <Button onClick={() => navigate('/faculty')} style={{ marginTop: '1rem' }}>
            Return to Exams
          </Button>
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
    <div className="container">
      <div style={{ marginBottom: '1.5rem' }}>
        <Button variant="secondary" size="sm" onClick={() => navigate('/faculty')} style={{ marginBottom: '1rem' }}>
          &larr; Back to Faculty Dashboard
        </Button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>{exam.title}</h1>
            <Badge variant={getStatusBadgeVariant(exam.status)}>
              {exam.status}
            </Badge>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Button
              variant="secondary"
              size="sm"
              loading={validating}
              onClick={handleValidateBlueprint}
            >
              🔍 Validate Blueprint Inventory
            </Button>
            {isDraft && (
              <Button
                variant="success"
                disabled={!isPointsBalanced || rules.length === 0 || publishing}
                loading={publishing}
                onClick={handlePublish}
              >
                Publish & Freeze Blueprint
              </Button>
            )}
          </div>
        </div>
      </div>

      {validationResult && (
        <Card padding="compact" style={{ marginBottom: '1.5rem', borderLeft: `4px solid ${validationResult.valid ? 'var(--color-success)' : 'var(--color-warning)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>{validationResult.valid ? '✅ Blueprint Inventory Verified' : '⚠️ Blueprint Inventory Deficient'}</span>
                <Badge variant={validationResult.valid ? 'success' : 'warning'}>
                  {validationResult.valid ? 'ALL RULES SATISFIED' : 'DEFICIENCIES DETECTED'}
                </Badge>
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                Required: {validationResult.summary?.total_required_questions || 0} questions • Pool Available: {validationResult.summary?.total_pool_questions || 0} questions
              </div>
            </div>
            <button
              onClick={() => setValidationResult(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
            >
              ✕
            </button>
          </div>
          {!validationResult.valid && validationResult.deficiencies && validationResult.deficiencies.length > 0 && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-danger)' }}>
              <strong>Deficiencies:</strong>
              <ul style={{ margin: '0.25rem 0 0 1.25rem' }}>
                {validationResult.deficiencies.map((d, i) => (
                  <li key={i}>
                    Topic &quot;{d.topic}&quot; ({d.difficulty}): requires {d.required_count}, but question pool only has {d.available_count} (shortfall of {d.shortfall}).
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {actionError && (
        <div
          role="alert"
          style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-danger-light)',
            border: '1px solid var(--color-danger-border)',
            color: 'var(--color-danger)',
          }}
        >
          {actionError}
        </div>
      )}

      {/* Blueprint Metadata Overview */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>Blueprint Configuration</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', fontSize: '0.875rem' }}>
          <div>
            <span style={{ color: 'var(--color-text-muted)' }}>Subject:</span>{' '}
            <strong>{exam.subject}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-muted)' }}>Duration:</span>{' '}
            <strong>{exam.duration_minutes} Minutes</strong>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-muted)' }}>Total Marks:</span>{' '}
            <strong>{exam.total_marks}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-muted)' }}>Passing Threshold:</span>{' '}
            <strong>{exam.passing_marks} Marks</strong>
          </div>
        </div>
      </Card>

      {/* Topic Question Rules */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Topic Question Allocation Rules</h3>
          <div style={{ fontSize: '0.875rem' }}>
            Total Allocated Points:{' '}
            <strong style={{ color: isPointsBalanced ? 'var(--color-success)' : 'var(--color-danger)' }}>
              {totalRulePoints} / {exam.total_marks}
            </strong>
          </div>
        </div>

        {rules.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            No topic rules configured yet. Add rules below to compose the examination blueprint.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border-subtle)', color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>Topic</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Difficulty</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Count</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Points / Q</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Subtotal</th>
                {isDraft && <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{rule.topic}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <Badge variant="neutral" size="sm">{rule.difficulty}</Badge>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>{rule.question_count}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>{rule.points_per_question}</td>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                    {rule.question_count * rule.points_per_question}
                  </td>
                  {isDraft && (
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteRule(rule.id)}
                      >
                        Remove
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Add Topic Rule Form (Draft Only) */}
        {isDraft && (
          <form
            onSubmit={handleAddRule}
            style={{
              marginTop: '1.5rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid var(--color-border-subtle)',
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto',
              gap: '0.75rem',
              alignItems: 'end',
            }}
          >
            <Input
              id="rule-topic"
              label="Topic Name"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Binary Search Trees"
              required
            />

            <div>
              <label
                htmlFor="rule-difficulty"
                style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500 }}
              >
                Difficulty
              </label>
              <select
                id="rule-difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.9375rem',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-surface)',
                  marginBottom: '1rem',
                }}
              >
                <option value="EASY">EASY</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HARD">HARD</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="rule-bloom"
                style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500 }}
              >
                Bloom Level
              </label>
              <select
                id="rule-bloom"
                value={bloomLevel}
                onChange={(e) => setBloomLevel(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.9375rem',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-surface)',
                  marginBottom: '1rem',
                }}
              >
                <option value="REMEMBER">REMEMBER</option>
                <option value="UNDERSTAND">UNDERSTAND</option>
                <option value="APPLY">APPLY</option>
                <option value="ANALYZE">ANALYZE</option>
                <option value="EVALUATE">EVALUATE</option>
                <option value="CREATE">CREATE</option>
              </select>
            </div>

            <Input
              id="rule-count"
              label="Question Count"
              type="number"
              min="1"
              value={questionCount}
              onChange={(e) => setQuestionCount(e.target.value)}
              required
            />

            <Input
              id="rule-points"
              label="Points per Question"
              type="number"
              min="1"
              value={pointsPerQuestion}
              onChange={(e) => setPointsPerQuestion(e.target.value)}
              required
            />

            <div style={{ marginBottom: '1rem' }}>
              <Button type="submit" variant="primary" loading={addingRule}>
                + Add Rule
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
