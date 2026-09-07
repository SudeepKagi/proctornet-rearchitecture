/**
 * @file FacultyResultsPage.jsx
 * @description Staff results oversight portal with KPI summary cards, candidate scores, publication, and release policy.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as resultsApi from '../../api/resultsApi.js';
import * as examsApi from '../../api/examsApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Badge, getStatusBadgeVariant } from '../../components/common/Badge.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';

export function FacultyResultsPage() {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [exam, setExam] = useState(null);
  const [summary, setSummary] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Publication Modal
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState('');

  // Policy Modal
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [policyType, setPolicyType] = useState('IMMEDIATE');
  const [scheduledTime, setScheduledTime] = useState('');
  const [updatingPolicy, setUpdatingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [examData, summaryData, resultsData] = await Promise.all([
        examsApi.getExam(examId),
        resultsApi.getExamResultsSummary(examId).catch(() => null),
        resultsApi.getExamResults(examId).catch(() => []),
      ]);
      setExam(examData);
      setSummary(summaryData);
      setResults(resultsData);
      if (examData?.results_release_policy) {
        setPolicyType(examData.results_release_policy);
      }
    } catch (err) {
      setError(err.message || 'Failed to load exam results data');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handlePublish() {
    setPublishing(true);
    setPublishMessage('');
    try {
      await resultsApi.publishExamResults(examId);
      setIsPublishOpen(false);
      await loadData();
    } catch (err) {
      setPublishMessage(err.message || 'Failed to trigger result publication');
    } finally {
      setPublishing(false);
    }
  }

  async function handleUpdatePolicy(e) {
    e.preventDefault();
    setPolicyError('');
    setUpdatingPolicy(true);

    try {
      const payload = {
        results_release_policy: policyType,
        scheduled_publish_at: policyType === 'SCHEDULED' ? new Date(scheduledTime).toISOString() : null,
      };
      await resultsApi.updateReleasePolicy(examId, payload);
      setIsPolicyOpen(false);
      await loadData();
    } catch (err) {
      setPolicyError(err.message || 'Failed to update result release policy');
    } finally {
      setUpdatingPolicy(false);
    }
  }

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem 0' }}>
        <Spinner size="lg" label="Loading examination results..." />
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ marginBottom: '1.5rem' }}>
        <Button variant="secondary" size="sm" onClick={() => navigate('/faculty')} style={{ marginBottom: '1rem' }}>
          &larr; Back to Exams
        </Button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>{exam?.title || 'Exam Results'}</h1>
              <Badge variant={getStatusBadgeVariant(exam?.status)}>{exam?.status}</Badge>
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
              Policy: <strong>{exam?.results_release_policy || 'IMMEDIATE'}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button variant="outline" size="sm" onClick={() => setIsPolicyOpen(true)}>
              Configure Policy
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={exam?.status === 'DRAFT' || exam?.status === 'RESULT_PUBLISHED'}
              onClick={() => setIsPublishOpen(true)}
            >
              Publish Results Now
            </Button>
          </div>
        </div>
      </div>

      {error && (
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
          {error}
        </div>
      )}

      {/* Summary KPI Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <Card padding="compact">
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>TOTAL ATTEMPTS</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{summary.total_attempts}</div>
          </Card>
          <Card padding="compact">
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>EVALUATED</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)' }}>{summary.evaluated_count}</div>
          </Card>
          <Card padding="compact">
            <div style={{ fontSize: '0.75rem', color: 'var(--color-success)', marginBottom: '0.25rem' }}>PASSED</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>{summary.pass_count}</div>
          </Card>
          <Card padding="compact">
            <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)', marginBottom: '0.25rem' }}>FAILED</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-danger)' }}>{summary.fail_count}</div>
          </Card>
          <Card padding="compact">
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>AVERAGE SCORE</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {summary.average_score !== null && summary.average_score !== undefined
                ? Number(summary.average_score).toFixed(1)
                : '—'}
            </div>
          </Card>
        </div>
      )}

      {/* Evaluated Candidate Results Table */}
      <Card padding="normal">
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1.25rem' }}>
          Candidate Performance Records ({results.length})
        </h3>

        {results.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            No evaluated candidate results available for this examination yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border-subtle)', color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>Candidate</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Email</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Score</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Percentage</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.attempt_id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{r.student_name || 'Candidate'}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: 'var(--color-text-muted)' }}>{r.student_email || '—'}</td>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                    {r.score} / {r.total_marks}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    {r.percentage !== undefined ? `${Number(r.percentage).toFixed(2)}%` : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <Badge variant={r.is_passed ? 'success' : 'danger'} size="sm">
                      {r.is_passed ? 'PASSED' : 'FAILED'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Manual Publish Modal */}
      <Modal isOpen={isPublishOpen} onClose={() => setIsPublishOpen(false)} title="Publish Results to Candidates">
        <div>
          {publishMessage && (
            <div
              role="alert"
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-danger-light)',
                color: 'var(--color-danger)',
                fontSize: '0.8125rem',
              }}
            >
              {publishMessage}
            </div>
          )}

          <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-body)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
            Publishing results will immediately transition candidate visibility to <strong>Released</strong>. Candidates enrolled in completed sessions will be able to view their performance metrics and scorecards.
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button variant="secondary" onClick={() => setIsPublishOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={publishing} onClick={handlePublish}>
              Confirm Publication
            </Button>
          </div>
        </div>
      </Modal>

      {/* Release Policy Configuration Modal */}
      <Modal isOpen={isPolicyOpen} onClose={() => setIsPolicyOpen(false)} title="Configure Result Release Policy">
        <form onSubmit={handleUpdatePolicy}>
          {policyError && (
            <div
              role="alert"
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-danger-light)',
                color: 'var(--color-danger)',
                fontSize: '0.8125rem',
              }}
            >
              {policyError}
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
              Release Policy Strategy
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="policyType"
                  value="IMMEDIATE"
                  checked={policyType === 'IMMEDIATE'}
                  onChange={(e) => setPolicyType(e.target.value)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <strong>IMMEDIATE</strong> — Results released immediately upon evaluation completion
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="policyType"
                  value="SCHEDULED"
                  checked={policyType === 'SCHEDULED'}
                  onChange={(e) => setPolicyType(e.target.value)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <strong>SCHEDULED</strong> — Results withheld until designated timestamp
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="policyType"
                  value="MANUAL"
                  checked={policyType === 'MANUAL'}
                  onChange={(e) => setPolicyType(e.target.value)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <strong>MANUAL</strong> — Results withheld until instructor explicitly triggers release
              </label>
            </div>
          </div>

          {policyType === 'SCHEDULED' && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500 }}>
                Scheduled Release Timestamp
              </label>
              <input
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                required={policyType === 'SCHEDULED'}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <Button variant="secondary" onClick={() => setIsPolicyOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={updatingPolicy}>
              Save Policy
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
