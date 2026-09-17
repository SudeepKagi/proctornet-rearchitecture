/**
 * @file CandidateResultPage.jsx
 * @description Candidate assessment scorecard view handling all Phase 9 visibility matrix states.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  RefreshCw,
  Play,
  Lock,
  AlertCircle,
  HelpCircle,
  Calendar,
} from 'lucide-react';
import * as resultsApi from '../../api/resultsApi.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';
import { Separator } from '../../components/ui/separator.jsx';
import { Progress } from '../../components/ui/progress.jsx';

export function CandidateResultPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [statusState, setStatusState] = useState(null); // 200, 403_NOT_PUBLISHED, 404_GRADING, 409_ACTIVE, 403_FORBIDDEN, ERROR
  const [scheduledAt, setScheduledAt] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchResult = useCallback(
    async (isManualRefresh = false) => {
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
    },
    [attemptId]
  );

  useEffect(() => {
    fetchResult();
  }, [fetchResult]);

  if (loading) {
    return (
      <div className="w-full max-w-2xl mx-auto py-16 text-center space-y-3">
        <RefreshCw size={28} className="animate-spin mx-auto text-slate-400" />
        <p className="text-sm font-medium text-slate-600">Retrieving official assessment evaluation...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 pb-12">
      {/* Navigation */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/candidate')}
          className="text-xs h-8 gap-1.5 text-slate-700"
        >
          <ArrowLeft size={13} />
          <span>Back to Dashboard</span>
        </Button>
      </div>

      {/* State 1: 200 OK — Released Results Scorecard */}
      {statusState === 200 && resultData && (
        <div className="space-y-6">
          {/* Header */}
          <div className="border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Official Assessment Record</span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-medium text-slate-500">Evaluation Scorecard</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {resultData.exam_title || 'Examination Result'}
              </h1>
              <Badge
                variant={resultData.is_passed ? 'success' : 'destructive'}
                size="lg"
                className="self-start sm:self-auto"
              >
                {resultData.is_passed ? 'PASSED' : 'FAILED'}
              </Badge>
            </div>
            {resultData.evaluated_at && (
              <p className="text-xs text-slate-500 mt-1">
                Evaluated: {new Date(resultData.evaluated_at).toLocaleString()}
              </p>
            )}
          </div>

          {/* Primary Scorecard Metric Card */}
          <Card className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Award size={16} className="text-slate-700" />
                Performance Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/60">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Points Earned
                  </span>
                  <div className="text-2xl font-bold text-slate-900 mt-1">
                    {resultData.score} <span className="text-sm font-normal text-slate-500">/ {resultData.total_marks}</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/60">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Final Percentage
                  </span>
                  <div className="text-2xl font-bold text-slate-900 mt-1">
                    {resultData.percentage !== undefined ? `${Number(resultData.percentage).toFixed(2)}%` : '—'}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/60">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Passing Threshold
                  </span>
                  <div className="text-2xl font-bold text-slate-600 mt-1">
                    {resultData.passing_marks || '—'}
                  </div>
                </div>
              </div>

              {/* Visual Percentage Progress */}
              {resultData.percentage !== undefined && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-xs font-medium text-slate-600">
                    <span>Score Distribution</span>
                    <span>{Number(resultData.percentage).toFixed(1)}%</span>
                  </div>
                  <Progress
                    value={Number(resultData.percentage)}
                    indicatorClassName={resultData.is_passed ? 'bg-emerald-600' : 'bg-red-600'}
                  />
                </div>
              )}

              <Separator />

              {/* Question Breakdown Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 border border-slate-200 rounded-md">
                  <span className="text-[10px] uppercase font-semibold text-slate-500">Total Items</span>
                  <p className="text-base font-bold text-slate-900 mt-0.5">{resultData.total_questions}</p>
                </div>
                <div className="p-3 border border-emerald-200 bg-emerald-50/40 rounded-md">
                  <span className="text-[10px] uppercase font-semibold text-emerald-800">Correct</span>
                  <p className="text-base font-bold text-emerald-700 mt-0.5">{resultData.correct_count}</p>
                </div>
                <div className="p-3 border border-red-200 bg-red-50/40 rounded-md">
                  <span className="text-[10px] uppercase font-semibold text-red-800">Incorrect</span>
                  <p className="text-base font-bold text-red-700 mt-0.5">{resultData.wrong_count}</p>
                </div>
                <div className="p-3 border border-slate-200 rounded-md">
                  <span className="text-[10px] uppercase font-semibold text-slate-500">Unanswered</span>
                  <p className="text-base font-bold text-slate-600 mt-0.5">{resultData.unanswered_count}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* State 2: 403 RESULT_NOT_PUBLISHED */}
      {statusState === '403_NOT_PUBLISHED' && (
        <Card className="border-slate-200 bg-white text-center p-8 space-y-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-700 mx-auto flex items-center justify-center border border-blue-200">
            <Clock size={24} />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">Submission Received Successfully</h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Your assessment attempt was finalized and stored securely. Official results for this exam have not yet been released by the department.
            </p>
          </div>

          {scheduledAt && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-100 text-xs text-slate-700 border border-slate-200">
              <Calendar size={13} />
              <span>
                Scheduled Release Window: <strong>{new Date(scheduledAt).toLocaleString()}</strong>
              </span>
            </div>
          )}

          <div className="pt-2">
            <Button variant="default" onClick={() => navigate('/candidate')}>
              Return to Dashboard
            </Button>
          </div>
        </Card>
      )}

      {/* State 3: 404 RESULT_NOT_FOUND (Grading Worker In Progress) */}
      {statusState === '404_GRADING' && (
        <Card className="border-slate-200 bg-white text-center p-8 space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-700 mx-auto flex items-center justify-center border border-slate-200">
            <RefreshCw size={22} className="animate-spin text-slate-600" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">Grading in Progress</h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Your examination responses are currently being evaluated and tabulated by the automated scoring worker.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              disabled={refreshing}
              onClick={() => fetchResult(true)}
              className="gap-1.5"
            >
              {refreshing && <RefreshCw size={13} className="animate-spin" />}
              Check Status
            </Button>
            <Button variant="default" onClick={() => navigate('/candidate')}>
              Return to Dashboard
            </Button>
          </div>
        </Card>
      )}

      {/* State 4: 409 ATTEMPT_ACTIVE (Attempt not yet submitted) */}
      {statusState === '409_ACTIVE' && (
        <Card className="border-slate-200 bg-white text-center p-8 space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 mx-auto flex items-center justify-center border border-amber-200">
            <Play size={22} />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">Examination Attempt in Progress</h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              This examination attempt is currently active and has not been finalized. You must complete and submit your answers.
            </p>
          </div>
          <div className="pt-2">
            <Button
              variant="default"
              onClick={() => navigate(`/candidate/attempts/${attemptId}`)}
              className="gap-2"
            >
              Resume Examination Attempt
              <Play size={14} />
            </Button>
          </div>
        </Card>
      )}

      {/* State 5: 403 FORBIDDEN (BOLA Defense) */}
      {statusState === '403_FORBIDDEN' && (
        <Card className="border-slate-200 bg-white text-center p-8 space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-700 mx-auto flex items-center justify-center border border-red-200">
            <Lock size={22} />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              You do not have authorization to view this assessment record.
            </p>
          </div>
          <div className="pt-2">
            <Button variant="outline" onClick={() => navigate('/candidate')}>
              Return to Dashboard
            </Button>
          </div>
        </Card>
      )}

      {/* Fallback Error */}
      {statusState === 'ERROR' && (
        <Card className="border-slate-200 bg-white text-center p-8 space-y-4">
          <AlertCircle size={32} className="mx-auto text-red-600" />
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">Unable to Retrieve Scorecard</h2>
            <p className="text-sm text-slate-600">{errorMessage}</p>
          </div>
          <div className="pt-2">
            <Button variant="outline" onClick={() => fetchResult(true)}>
              Try Again
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

export default CandidateResultPage;
