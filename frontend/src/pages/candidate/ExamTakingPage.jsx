/**
 * @file ExamTakingPage.jsx
 * @description Fullscreen distraction-free examination taking workspace with debounced autosave,
 * drift-calibrated timer, dynamic N question navigation, and idempotent submission.
 * Rebuilt with shadcn/ui and Tailwind CSS.
 */

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as attemptsApi from '../../api/attemptsApi.js';
import * as answersApi from '../../api/answersApi.js';
import { setAntiTamperToken } from '../../api/client.js';
import { useExamTimer } from '../../hooks/useExamTimer.js';
import { useAutosave } from '../../hooks/useAutosave.js';
import { useNetworkStatus } from '../../hooks/useNetworkStatus.js';
import { useProctoringEvents } from '../../hooks/useProctoringEvents.js';
import { useScreenAI } from '../../hooks/useScreenAI.js';
import { useRealtime } from '../../hooks/useRealtime.js';
import { useMediaCapture } from '../../hooks/useMediaCapture.js';
import { mediaClient } from '../../services/mediaClient.js';
import { generateUUID } from '../../utils/uuid.js';

import { QuestionRenderer } from '../../components/exam/QuestionRenderer.jsx';
import { QuestionNavigator } from '../../components/exam/QuestionNavigator.jsx';
import { TimerDisplay } from '../../components/exam/TimerDisplay.jsx';
import { AutosaveIndicator } from '../../components/exam/AutosaveIndicator.jsx';
import { SubmitConfirmModal } from '../../components/exam/SubmitConfirmModal.jsx';
import { OfflineBanner } from '../../components/common/OfflineBanner.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Card, CardContent } from '../../components/ui/card.jsx';
import { Spinner } from '../../components/ui/spinner.jsx';
import {
  CandidatePauseOverlay,
  CandidateTerminationOverlay,
  AnnouncementBanner,
  CandidateDirectMessageToast,
} from '../../components/exam/CandidateInterventionOverlays.jsx';
import { ArrowLeft, ArrowRight, Send, AlertTriangle } from 'lucide-react';

const OFFLINE_SUBMIT_ERROR =
  "Submission could not be completed because you're offline. Your answers are stored locally in this tab. Reconnect to submit your exam.";

export function ExamTakingPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const { isOffline } = useNetworkStatus();

  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState('');

  // Submission state
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const [autoSubmittingBanner, setAutoSubmittingBanner] = useState(false);

  // Intervention states
  const [attemptStatus, setAttemptStatus] = useState('ACTIVE');
  const [pauseReason, setPauseReason] = useState(null);
  const [terminationReason, setTerminationReason] = useState(null);
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  const [directMessageData, setDirectMessageData] = useState(null);
  const [dynamicExpiresAt, setDynamicExpiresAt] = useState(null);

  const logicalSubmissionKeyRef = useRef(null);
  const [initialAnswersList, setInitialAnswersList] = useState([]);

  useEffect(() => {
    async function loadExamData() {
      try {
        setLoading(true);
        const [attemptData, questionsData, savedAnswers] = await Promise.all([
          attemptsApi.getAttempt(attemptId),
          attemptsApi.getAttemptQuestions(attemptId),
          answersApi.getAnswers(attemptId).catch(() => []),
        ]);

        if (attemptData.status === 'SUBMITTED' || attemptData.status === 'EXPIRED') {
          navigate(`/candidate/attempts/${attemptId}/result`, { replace: true });
          return;
        }

        setAttempt(attemptData);
        if (attemptData.status === 'PAUSED') {
          setAttemptStatus('PAUSED');
          setPauseReason(attemptData.metadata?.pause_reason || 'Proctor has temporarily paused this examination attempt.');
        } else if (attemptData.status === 'TERMINATED') {
          setAttemptStatus('TERMINATED');
          setTerminationReason(attemptData.metadata?.termination_reason || 'Proctor has terminated this examination attempt.');
        } else {
          setAttemptStatus(attemptData.status || 'ACTIVE');
        }
        setDynamicExpiresAt(attemptData.expires_at);

        if (attemptData.anti_tamper_token) {
          setAntiTamperToken(attemptData.anti_tamper_token);
        }
        setQuestions(questionsData);
        setInitialAnswersList(savedAnswers);
      } catch (err) {
        setInitialError(err.message || 'Failed to load examination attempt data');
      } finally {
        setLoading(false);
      }
    }
    loadExamData();
  }, [attemptId, navigate]);

  const {
    answers,
    saveStatus,
    setAnswer,
    flushDirtyAnswers,
    getDirtyAnswersArray,
  } = useAutosave({
    attemptId,
    initialAnswers: initialAnswersList,
    debounceMs: 1000,
    offlineQueueLimit: 200,
  });

  const onTimeExpired = useCallback(() => {
    executeSubmission({ autoExpired: true });
  }, []);

  const {
    formattedTime,
    isExpired,
    isUrgent5Min,
    isUrgent1Min,
  } = useExamTimer({
    expiresAt: dynamicExpiresAt,
    serverTime: attempt?.server_time,
    onExpire: onTimeExpired,
  });

  const inputsDisabled =
    isExpired ||
    isSubmitting ||
    autoSubmittingBanner ||
    attemptStatus === 'PAUSED' ||
    attemptStatus === 'TERMINATED';

  // Realtime WebSocket integration
  const { isConnected, send, subscribe } = useRealtime();

  useEffect(() => {
    if (!subscribe || !attemptId) return;

    const unsubEvents = subscribe(`exam:attempt:${attemptId}`, (msg) => {
      if (msg.type === 'EXAM_PAUSED') {
        setAttemptStatus('PAUSED');
        setPauseReason(msg.payload?.reason || 'Proctor has temporarily paused this examination attempt.');
      } else if (msg.type === 'EXAM_RESUMED') {
        setAttemptStatus('ACTIVE');
        setPauseReason(null);
      } else if (msg.type === 'EXAM_TERMINATED') {
        setAttemptStatus('TERMINATED');
        setTerminationReason(msg.payload?.reason || 'Proctor has terminated this examination attempt.');
      } else if (msg.type === 'TIME_ADJUSTED') {
        if (msg.payload?.expires_at) {
          setDynamicExpiresAt(msg.payload.expires_at);
        }
      }
    });

    const sessionId = attempt?.session_id;
    let unsubSession = () => {};
    if (sessionId) {
      unsubSession = subscribe(`exam:session:${sessionId}`, (msg) => {
        if (msg.type === 'PROCTOR_ANNOUNCEMENT') {
          setActiveAnnouncement({
            message: msg.payload?.message || msg.payload,
            timestamp: new Date().toLocaleTimeString(),
          });
        }
      });
    }

    const unsubDirect = subscribe(`candidate:${attempt?.candidate_id || 'me'}:messages`, (msg) => {
      if (msg.type === 'DIRECT_PROCTOR_MESSAGE') {
        setDirectMessageData({
          message: msg.payload?.message,
          proctorName: msg.payload?.proctorName || 'Invigilator',
          timestamp: new Date().toLocaleTimeString(),
        });
      }
    });

    return () => {
      unsubEvents();
      unsubSession();
      unsubDirect();
    };
  }, [subscribe, attemptId, attempt?.session_id, attempt?.candidate_id]);

  // Client-Side Screen AI & Proctoring Telemetry
  useScreenAI({
    attemptId,
    enabled: Boolean(attempt && attemptStatus === 'ACTIVE' && !isExpired),
  });

  useProctoringEvents({
    attemptId,
    enabled: Boolean(attempt && attemptStatus === 'ACTIVE' && !isExpired),
  });

  // Mediasoup SFU WebRTC Producer
  const { stream: mediaStream, isCapturing } = useMediaCapture({
    video: true,
    audio: true,
    autoStart: Boolean(attempt && attemptStatus === 'ACTIVE' && !isExpired),
  });

  const [mediaPublishing, setMediaPublishing] = useState(false);
  const mediaVideoRef = useRef(null);

  useEffect(() => {
    if (mediaVideoRef.current && mediaStream) {
      mediaVideoRef.current.srcObject = mediaStream;
    }
  }, [mediaStream]);

  useEffect(() => {
    let active = true;
    async function publishMedia() {
      if (!mediaStream || !attemptId || mediaPublishing) return;
      try {
        await mediaClient.joinAsProducer({
          attemptId,
          stream: mediaStream,
        });
        if (active) setMediaPublishing(true);
      } catch {
        // Non-blocking fallback
      }
    }
    publishMedia();
    return () => {
      active = false;
    };
  }, [mediaStream, attemptId, mediaPublishing]);

  // Submission handler
  const executeSubmission = async ({ autoExpired = false } = {}) => {
    if (isSubmitting) return;

    if (isOffline) {
      setSubmissionError(OFFLINE_SUBMIT_ERROR);
      setIsSubmitModalOpen(true);
      return;
    }

    if (autoExpired) {
      setAutoSubmittingBanner(true);
    }

    setIsSubmitting(true);
    setSubmissionError('');

    if (!logicalSubmissionKeyRef.current) {
      logicalSubmissionKeyRef.current = generateUUID();
    }
    const submissionKey = logicalSubmissionKeyRef.current;

    try {
      await flushDirtyAnswers();

      const finalDirtyAnswers = getDirtyAnswersArray();
      const payload = {
        answers: finalDirtyAnswers,
        auto_expired: autoExpired,
      };

      await attemptsApi.submitAttempt(attemptId, payload, submissionKey);
      navigate(`/candidate/attempts/${attemptId}/result`, { replace: true });
    } catch (err) {
      setSubmissionError(err.message || 'Submission failed. Please verify your connection and retry.');
      setIsSubmitModalOpen(true);
    } finally {
      setIsSubmitting(false);
      setAutoSubmittingBanner(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 gap-3">
        <Spinner size="lg" />
        <p className="text-xs text-slate-500 font-medium">Securing test environment & loading questions...</p>
      </div>
    );
  }

  if (initialError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <Card className="max-w-md w-full text-center p-6 space-y-4">
          <div className="mx-auto p-3 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 w-fit">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Examination Access Issue</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{initialError}</p>
          <Button onClick={() => navigate('/candidate')} className="w-full">
            Return to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex] || null;
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : null;

  const totalQuestions = questions.length;
  const answeredCount = questions.filter((q) => {
    const ans = answers[q.id];
    if (!ans) return false;
    if (ans.selected_option_id !== undefined && ans.selected_option_id !== null) return true;
    if (ans.numeric_value !== undefined && ans.numeric_value !== null && ans.numeric_value !== '') return true;
    if (ans.text_response !== undefined && ans.text_response !== null && ans.text_response !== '') return true;
    return false;
  }).length;
  const unansweredCount = totalQuestions - answeredCount;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Sticky Topbar */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 shadow-2xs px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100 block truncate max-w-[180px] sm:max-w-xs">
              {attempt?.exam_title || 'Examination Workspace'}
            </span>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${isOffline ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                {isOffline ? 'Connection lost' : 'Proctored Session'}
              </span>
            </div>
          </div>
          <div className="hidden sm:block pl-2 border-l border-slate-200 dark:border-slate-800">
            <AutosaveIndicator status={saveStatus} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <TimerDisplay
            formattedTime={formattedTime}
            isExpired={isExpired}
            isUrgent5Min={isUrgent5Min}
            isUrgent1Min={isUrgent1Min}
          />

          <Button
            variant="destructive"
            size="sm"
            disabled={inputsDisabled}
            onClick={() => {
              setSubmissionError('');
              setIsSubmitModalOpen(true);
            }}
            className="text-xs h-9 px-3.5 font-semibold"
          >
            <Send className="h-3.5 w-3.5 mr-1" />
            <span>Submit Exam</span>
          </Button>
        </div>
      </header>

      {/* Floating Network Alert */}
      <OfflineBanner isOffline={isOffline} />

      {/* Auto-submission Alert */}
      {autoSubmittingBanner && (
        <div role="alert" className="bg-rose-50 border-b border-rose-200 text-rose-800 dark:bg-rose-950 dark:border-rose-900 dark:text-rose-200 text-xs font-semibold py-2 px-4 text-center">
          Exam time has concluded. Finalizing and submitting responses...
        </div>
      )}

      {/* Realtime Announcement Banner */}
      <AnnouncementBanner
        announcement={activeAnnouncement}
        onDismiss={() => setActiveAnnouncement(null)}
      />

      {/* Proctor Warning Toast */}
      <CandidateDirectMessageToast
        messageData={directMessageData}
        onDismiss={() => setDirectMessageData(null)}
      />

      {/* Overlays */}
      <CandidatePauseOverlay isOpen={attemptStatus === 'PAUSED'} reason={pauseReason} />
      <CandidateTerminationOverlay
        isOpen={attemptStatus === 'TERMINATED'}
        reason={terminationReason}
        onReturnHome={() => navigate('/candidate')}
      />

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Question Content & Navigation */}
        <div className="space-y-6">
          <Card className="shadow-xs border-slate-200 dark:border-slate-800 dark:bg-slate-900 min-h-[420px] flex flex-col">
            <CardContent className="p-6 sm:p-8 flex-1">
              {currentQuestion ? (
                <QuestionRenderer
                  question={currentQuestion}
                  questionNumber={currentQuestionIndex + 1}
                  value={currentAnswer}
                  onChange={(val) => setAnswer(currentQuestion.id, val)}
                  disabled={inputsDisabled}
                />
              ) : (
                <div className="py-12 text-center text-slate-400">No question selected</div>
              )}
            </CardContent>
          </Card>

          {/* Question Footer Navigation Controls */}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              disabled={currentQuestionIndex === 0 || inputsDisabled}
              onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
              className="text-xs h-9"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              <span>Previous</span>
            </Button>

            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Question {currentQuestionIndex + 1} of {totalQuestions}
            </span>

            {currentQuestionIndex < totalQuestions - 1 ? (
              <Button
                variant="default"
                disabled={inputsDisabled}
                onClick={() => setCurrentQuestionIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                className="text-xs h-9 bg-blue-600 hover:bg-blue-700"
              >
                <span>Next</span>
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={inputsDisabled}
                onClick={() => {
                  setSubmissionError('');
                  setIsSubmitModalOpen(true);
                }}
                className="text-xs h-9"
              >
                <span>Review & Submit</span>
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
          </div>
        </div>

        {/* Sidebar Question Palette */}
        <aside className="w-full">
          <QuestionNavigator
            questions={questions}
            currentIndex={currentQuestionIndex}
            answers={answers}
            onSelect={(idx) => !inputsDisabled && setCurrentQuestionIndex(idx)}
          />
        </aside>
      </main>

      {/* Submit Confirmation Modal */}
      <SubmitConfirmModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onConfirm={executeSubmission}
        totalQuestions={totalQuestions}
        answeredCount={answeredCount}
        unansweredCount={unansweredCount}
        submitting={isSubmitting}
        errorMessage={submissionError}
        onRetry={executeSubmission}
      />

      {/* Floating Picture-in-Picture Webcam Stream Widget */}
      {isCapturing && (
        <div className="fixed bottom-4 right-4 w-44 rounded-xl overflow-hidden shadow-2xl border-2 border-blue-600 bg-black z-50 animate-in fade-in duration-300">
          <video
            ref={mediaVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-28 object-cover"
          />
          <div className="px-2.5 py-1 bg-slate-950/90 text-white text-[10px] font-medium flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${mediaPublishing ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              <span>{mediaPublishing ? 'Proctoring Active' : 'Connecting...'}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExamTakingPage;
