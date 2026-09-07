/**
 * @file CandidateResultPage.jsx
 * @description Candidate scorecard view handling all Phase 9 backend visibility matrix states.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as resultsApi from '../../api/resultsApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';

export function CandidateResultPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [statusState, setStatusState] = useState(null); // 200, 403_NOT_PUBLISHED, 404_GRADING, 409_ACTIVE, 403_FORBIDDEN, ERROR
  const [scheduledAt, setScheduledAt] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchResult = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    setErrorMessage('');

    try {
      const data = await resultsApi.getCandidateResult(attemptId);
      setResultData(data);
      setStatusState(200);
    } catch (err) {
      const status = err.status;
      const code = err.data?.code;

      if (status === 403 && code === 'RESULT_NOT_PUBLISHED') {
        setStatusState('403_NOT_PUBLISHED');
        setScheduledAt(err.data?.scheduled_publish_at || null);
      } else if (status === 404) {
        setStatusState('404_GRADING');
      } else if (status === 409) {
        setStatusState('409_ACTIVE');
      } else if (status === 403) {
        setStatusState('403_FORBIDDEN');
      } else {
        setStatusState('ERROR');
        setErrorMessage(err.message || 'An unexpected error occurred retrieving your results.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [attemptId]);

  useEffect(() => {
    fetchResult();
  }, [fetchResult]);

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem 0' }}>
        <Spinner size="lg" label="Retrieving assessment result..." />
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: '680px' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Button variant="secondary" size="sm" onClick={() => navigate('/candidate')} style={{ marginBottom: '1rem' }}>
          &larr; Back to Candidate Portal
        </Button>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Assessment Results</h1>
      </div>

      {/* State 1: 200 OK — Released Results Scorecard */}
      {statusState === 200 && resultData && (
        <div>
          <Card padding="spacious" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Performance Evaluation
                </span>
                <h2 style={{ fontSize: '1.5rem', marginTop: '0.25rem' }}>
                  {resultData.exam_title || 'Examination Result'}
                </h2>
              </div>
              <Badge
                variant={resultData.is_passed ? 'success' : 'danger'}
                size="lg"
              >
                {resultData.is_passed ? 'PASSED' : 'FAILED'}
              </Badge>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1rem',
                backgroundColor: 'var(--color-surface-secondary)',
                padding: '1.25rem',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                marginBottom: '1.5rem',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                  SCORE
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary)' }}>
                  {resultData.score} / {resultData.total_marks}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                  PERCENTAGE
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                  {resultData.percentage !== undefined ? `${Number(resultData.percentage).toFixed(2)}%` : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                  PASSING MARK
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-muted)' }}>
                  {resultData.passing_marks || '—'}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', textAlign: 'center', fontSize: '0.875rem' }}>
              <div style={{ padding: '0.75rem', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>TOTAL QUESTIONS</div>
                <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>{resultData.total_questions}</div>
              </div>
              <div style={{ padding: '0.75rem', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ color: 'var(--color-success)', fontSize: '0.75rem' }}>CORRECT</div>
                <div style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--color-success)' }}>{resultData.correct_count}</div>
              </div>
              <div style={{ padding: '0.75rem', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ color: 'var(--color-danger)', fontSize: '0.75rem' }}>WRONG</div>
                <div style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--color-danger)' }}>{resultData.wrong_count}</div>
              </div>
              <div style={{ padding: '0.75rem', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>UNANSWERED</div>
                <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>{resultData.unanswered_count}</div>
              </div>
            </div>

            {resultData.evaluated_at && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border-subtle)', fontSize: '0.8125rem', color: 'var(--color-text-muted)', textAlign: 'right' }}>
                Evaluated: {new Date(resultData.evaluated_at).toLocaleString()}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* State 2: 403 RESULT_NOT_PUBLISHED */}
      {statusState === '403_NOT_PUBLISHED' && (
        <Card padding="spacious" style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-warning-light)',
              color: 'var(--color-warning)',
              marginBottom: '1rem',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Submission Received!</h2>
          <p style={{ color: 'var(--color-text-body)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
            Your assessment attempt was successfully finalized and submitted. Results for this exam have not yet been published by the instructor.
          </p>
          {scheduledAt && (
            <div
              style={{
                display: 'inline-block',
                backgroundColor: 'var(--color-surface-secondary)',
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem',
                color: 'var(--color-text-muted)',
                marginBottom: '1.5rem',
              }}
            >
              Scheduled Release: <strong>{new Date(scheduledAt).toLocaleString()}</strong>
            </div>
          )}
          <div>
            <Button variant="secondary" onClick={() => navigate('/candidate')}>
              Return to Candidate Portal
            </Button>
          </div>
        </Card>
      )}

      {/* State 3: 404 RESULT_NOT_FOUND (Grading Worker In Progress) */}
      {statusState === '404_GRADING' && (
        <Card padding="spacious" style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '1rem' }}>
            <Spinner size="lg" color="var(--color-primary)" />
          </div>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Grading in Progress</h2>
          <p style={{ color: 'var(--color-text-body)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            Your objective evaluation is currently being computed by the automated evaluation worker. Please check back shortly.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
            <Button
              variant="primary"
              loading={refreshing}
              onClick={() => fetchResult(true)}
            >
              Check Status / Refresh
            </Button>
            <Button variant="secondary" onClick={() => navigate('/candidate')}>
              Return to Dashboard
            </Button>
          </div>
        </Card>
      )}

      {/* State 4: 409 ATTEMPT_ACTIVE (Attempt not yet submitted) */}
      {statusState === '409_ACTIVE' && (
        <Card padding="spacious" style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--color-warning)', fontSize: '1.25rem', marginBottom: '0.5rem' }}>
            Examination Attempt Active
          </h2>
          <p style={{ color: 'var(--color-text-body)', marginBottom: '1.5rem' }}>
            Your exam attempt is still in progress and has not been submitted.
          </p>
          <Button variant="primary" onClick={() => navigate(`/candidate/attempts/${attemptId}`)}>
            Resume Examination Attempt &rarr;
          </Button>
        </Card>
      )}

      {/* State 5: 403 FORBIDDEN (BOLA Defense) */}
      {statusState === '403_FORBIDDEN' && (
        <Card padding="spacious" style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--color-danger)', fontSize: '1.25rem', marginBottom: '0.5rem' }}>
            Access Denied
          </h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
            You do not have authorization to inspect this assessment result.
          </p>
          <Button variant="secondary" onClick={() => navigate('/candidate')}>
            Return to Dashboard
          </Button>
        </Card>
      )}

      {/* Fallback Error */}
      {statusState === 'ERROR' && (
        <Card padding="spacious" style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--color-danger)', fontSize: '1.25rem', marginBottom: '0.5rem' }}>
            Unable to Load Results
          </h2>
          <p style={{ color: 'var(--color-text-body)', marginBottom: '1.5rem' }}>{errorMessage}</p>
          <Button variant="primary" onClick={() => fetchResult(true)}>
            Try Again
          </Button>
        </Card>
      )}
    </div>
  );
}
