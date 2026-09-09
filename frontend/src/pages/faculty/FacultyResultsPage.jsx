/**
 * @file FacultyResultsPage.jsx
 * @description Staff results portal with KPI summary cards, candidate scores, manual grading entry points,
 * psychometric analytics (item difficulty P-value, discrimination index Di/r_pbis, 10-bin score histograms),
 * and release policies. Conforms to Phase 26 Track 1 Workstream D.
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
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('roster'); // 'roster' | 'analytics'

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

  const loadAnalytics = useCallback(async () => {
    try {
      setLoadingAnalytics(true);
      const data = await examsApi.getExamAnalytics(examId);
      setAnalytics(data);
    } catch (err) {
      setError(err.message || 'Failed to load psychometric analytics');
    } finally {
      setLoadingAnalytics(false);
    }
  }, [examId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'analytics' && !analytics) {
      loadAnalytics();
    }
  }, [activeTab, analytics, loadAnalytics]);

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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '0.5rem' }}>
        <Button
          variant={activeTab === 'roster' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setActiveTab('roster')}
        >
          Candidate Records ({results.length})
        </Button>
        <Button
          variant={activeTab === 'analytics' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setActiveTab('analytics')}
        >
          📊 Psychometrics & Histograms
        </Button>
      </div>

      {activeTab === 'roster' && (
        /* Evaluated Candidate Results Table */
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
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
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
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/faculty/grading/${r.id || r.attempt_id}`)}
                      >
                        Grade / Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {activeTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {loadingAnalytics ? (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <Spinner size="lg" label="Computing psychometric analytics..." />
            </div>
          ) : !analytics ? (
            <Card padding="spacious" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No psychometric analytics computed yet.
            </Card>
          ) : (
            <>
              {/* Timing and Sample Size KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <Card padding="compact">
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>ANALYTICS SAMPLE SIZE</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>
                    {analytics.sampleSize} Completed Attempts
                  </div>
                </Card>
                <Card padding="compact">
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>MEAN COMPLETION TIME</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>
                    {analytics.completionTimeStats?.meanMinutes ?? '—'} min
                  </div>
                </Card>
                <Card padding="compact">
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>MEDIAN COMPLETION TIME</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>
                    {analytics.completionTimeStats?.medianMinutes ?? '—'} min
                  </div>
                </Card>
                <Card padding="compact">
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>90TH PERCENTILE (P90)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>
                    {analytics.completionTimeStats?.p90Minutes ?? '—'} min
                  </div>
                </Card>
              </div>

              {/* 10-Bin Score Histogram */}
              <Card padding="normal">
                <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>
                  10-Bin Score Distribution Histogram
                </h3>
                <div style={{ display: 'flex', alignItems: 'flex-end', height: '180px', gap: '0.5rem', paddingTop: '1.5rem' }}>
                  {analytics.scoreHistogram?.bins?.map((b) => {
                    const maxCount = Math.max(1, ...analytics.scoreHistogram.bins.map((x) => x.count));
                    const heightPct = Math.round((b.count / maxCount) * 100);
                    return (
                      <div key={b.bin} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                          {b.count}
                        </span>
                        <div
                          style={{
                            width: '100%',
                            height: `${Math.max(4, heightPct)}%`,
                            backgroundColor: b.count > 0 ? 'var(--color-primary)' : 'var(--color-border-subtle)',
                            borderRadius: '0.25rem 0.25rem 0 0',
                            transition: 'height 0.3s ease'
                          }}
                        />
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '0.35rem', transform: 'rotate(-20deg)', whiteSpace: 'nowrap' }}>
                          {b.bin}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Psychometric Item Metrics Table */}
              <Card padding="normal">
                <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>
                  Item Difficulty (P-Value) & Upper/Lower 27% Discrimination Index
                </h3>
                {analytics.itemMetrics && analytics.itemMetrics.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--color-border-subtle)', color: 'var(--color-text-muted)' }}>
                          <th style={{ padding: '0.75rem 0.5rem' }}>Question Prompt</th>
                          <th style={{ padding: '0.75rem 0.5rem' }}>Difficulty (P-Value)</th>
                          <th style={{ padding: '0.75rem 0.5rem' }}>Difficulty Rating</th>
                          <th style={{ padding: '0.75rem 0.5rem' }}>Discrimination (Di)</th>
                          <th style={{ padding: '0.75rem 0.5rem' }}>Point-Biserial (rpbis)</th>
                          <th style={{ padding: '0.75rem 0.5rem' }}>Discrimination Rating</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.itemMetrics.map((item) => (
                          <tr key={item.questionId} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                            <td style={{ padding: '0.75rem 0.5rem', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.prompt}
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                              {item.pValue !== undefined ? Number(item.pValue).toFixed(2) : '—'}
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem' }}>
                              <Badge
                                variant={
                                  item.difficultyRating === 'HARD'
                                    ? 'danger'
                                    : item.difficultyRating === 'MODERATE'
                                    ? 'primary'
                                    : 'success'
                                }
                                size="sm"
                              >
                                {item.difficultyRating}
                              </Badge>
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                              {item.discriminationIndex !== undefined ? Number(item.discriminationIndex).toFixed(2) : '—'}
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem' }}>
                              {item.pointBiserial !== undefined ? Number(item.pointBiserial).toFixed(2) : '—'}
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem' }}>
                              <Badge
                                variant={
                                  item.discriminationRating === 'EXCELLENT'
                                    ? 'success'
                                    : item.discriminationRating === 'GOOD'
                                    ? 'primary'
                                    : 'warning'
                                }
                                size="sm"
                              >
                                {item.discriminationRating}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    No item difficulty metrics recorded yet.
                  </p>
                )}
              </Card>
            </>
          )}
        </div>
      )}

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
                fontSize: '0.875rem',
              }}
            >
              {publishMessage}
            </div>
          )}

          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            Publishing results will make evaluated scores, percentages, and performance breakdowns visible to all candidates
            who have completed this assessment. This action cannot be undone.
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button variant="outline" size="sm" onClick={() => setIsPublishOpen(false)} disabled={publishing}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handlePublish} loading={publishing}>
              Confirm Publication
            </Button>
          </div>
        </div>
      </Modal>

      {/* Policy Configuration Modal */}
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
                fontSize: '0.875rem',
              }}
            >
              {policyError}
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Release Policy
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="policyType"
                  value="IMMEDIATE"
                  checked={policyType === 'IMMEDIATE'}
                  onChange={() => setPolicyType('IMMEDIATE')}
                />
                Immediate (auto-release on evaluation)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="policyType"
                  value="SCHEDULED"
                  checked={policyType === 'SCHEDULED'}
                  onChange={() => setPolicyType('SCHEDULED')}
                />
                Scheduled (release at specific date/time)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="policyType"
                  value="MANUAL"
                  checked={policyType === 'MANUAL'}
                  onChange={() => setPolicyType('MANUAL')}
                />
                Manual Publish Only
              </label>
            </div>
          </div>

          {policyType === 'SCHEDULED' && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Scheduled Release Time *
              </label>
              <input
                type="datetime-local"
                required
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <Button variant="outline" size="sm" type="button" onClick={() => setIsPolicyOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" loading={updatingPolicy}>
              Save Policy
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default FacultyResultsPage;
