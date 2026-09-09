/**
 * @file ExamTakingPage.jsx
 * @description Fullscreen distraction-free examination taking workspace with debounced autosave,
 * drift-calibrated timer, dynamic N question navigation, and idempotent submission.
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
import { Button } from '../../components/common/Button.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';
import {
  CandidatePauseOverlay,
  CandidateTerminationOverlay,
  AnnouncementBanner,
  CandidateDirectMessageToast
} from '../../components/exam/CandidateInterventionOverlays.jsx';

const OFFLINE_SUBMIT_ERROR = "Submission could not be completed because you're offline. Your unsynchronized answers remain in this tab. Reconnect and try again. Do not close or refresh this tab.";

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

  // Intervention states (Workstream G)
  const [attemptStatus, setAttemptStatus] = useState('ACTIVE');
  const [pauseReason, setPauseReason] = useState(null);
  const [terminationReason, setTerminationReason] = useState(null);
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  const [directMessageData, setDirectMessageData] = useState(null);
  const [dynamicExpiresAt, setDynamicExpiresAt] = useState(null);

  // Logical submission idempotency key: persists across retries of the same logical submission
  const logicalSubmissionKeyRef = useRef(null);

  // Load attempt metadata, questions, and initial saved answers
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

  // Hook for autosaving responses with in-memory dirty queue
  const {
    answers,
    saveStatus,
    setAnswer,
    flushDirtyAnswers,
    getDirtyAnswersArray,
  } = useAutosave({
    attemptId,
    initialAnswers: initialAnswersList,
    isOffline,
  });

  // Core submission dispatcher (shared by manual and automatic expiry submission)
  const executeSubmission = useCallback(async () => {
    setSubmissionError('');
    setIsSubmitting(true);

    // Reuse existing logical idempotency key for retries, or generate one for a new submission
    if (!logicalSubmissionKeyRef.current) {
      logicalSubmissionKeyRef.current = generateUUID();
    }
    const idempotencyKey = logicalSubmissionKeyRef.current;

    // Bundle any unpersisted dirty answers from in-memory queue
    const dirtyAnswers = getDirtyAnswersArray();
    const payload = dirtyAnswers.length > 0 ? { answers: dirtyAnswers } : {};

    try {
      await attemptsApi.submitAttempt(attemptId, payload, idempotencyKey);
      // Clean up media streams and transports
      stopCapture();
      mediaClient.closeAll();
      setMediaPublishing(false);
      // On backend 200 OK: attempt is permanently submitted
      navigate(`/candidate/attempts/${attemptId}/result`, { replace: true });
    } catch (err) {
      // OFFLINE != SUBMITTED: Show non-durable memory warning, keep key for retry
      setSubmissionError(OFFLINE_SUBMIT_ERROR);
      setIsSubmitting(false);
    }
  }, [attemptId, getDirtyAnswersArray, navigate]);

  // Zero Expiration Callback
  const handleTimeExpired = useCallback(() => {
    setAutoSubmittingBanner(true);
    // Automatic expiry-triggered submission uses the exact same idempotency mechanism
    executeSubmission();
  }, [executeSubmission]);

  const isAttemptPaused = attemptStatus === 'PAUSED' || attemptStatus === 'TERMINATED';

  // Visual countdown timer with drift calibration
  const {
    formattedTime,
    isExpired,
    isUrgent5Min,
    isUrgent1Min,
  } = useExamTimer({
    serverTime: attempt?.server_time,
    expiresAt: dynamicExpiresAt || attempt?.expires_at,
    isPaused: isAttemptPaused,
    onExpire: handleTimeExpired,
  });

  // Candidate background telemetry & proctoring event reporter (Phase 14 & Phase 28)
  const {
    enqueueEvent,
    recordScreenClassification,
    recordScreenInterruption,
    recordScreenDegradation
  } = useProctoringEvents({
    attemptId,
    isActive: !!attempt && !isExpired && !isSubmitting && !autoSubmittingBanner && !isAttemptPaused,
  });

  // Candidate WebRTC Media Capture & SFU Publishing (Phase 17 & Phase 28)
  const { stream: mediaStream, screenStream, isCapturing, startCapture, stopCapture } = useMediaCapture();
  const [mediaPublishing, setMediaPublishing] = useState(false);
  const mediaVideoRef = useRef(null);

  // Client-Side Screen AI Hook (Phase 28 Track 2: ~0.25 FPS Web Worker inference)
  useScreenAI({
    screenTrack: screenStream?.getVideoTracks()?.[0] || null,
    isActive: !!attempt && !isExpired && !isSubmitting && !autoSubmittingBanner && !isAttemptPaused,
    onClassification: (classification) => {
      recordScreenClassification(classification);
    },
    onTechnicalEvent: (eventType, detail) => {
      if (eventType === 'SCREEN_CAPTURE_INTERRUPTED') {
        recordScreenInterruption(detail?.reason);
      } else {
        recordScreenDegradation(detail?.reason, detail?.fps);
      }
    }
  });

  const handleSessionConcluded = useCallback(() => {
    setAutoSubmittingBanner(true);
    executeSubmission();
  }, [executeSubmission]);

  // Realtime subscription for candidate warnings, interventions, and presence pulse
  const attemptRealtimeHandlers = useMemo(
    () => ({
      'candidate:warning': (payload) => {
        setDirectMessageData({
          message: payload?.message || payload?.warning || 'Invigilator has issued an official warning regarding your exam session.',
          reason: payload?.reason,
          isWarning: true
        });
      },
      'candidate:message': (payload) => {
        setDirectMessageData({
          message: payload?.message || 'New message from invigilator.',
          reason: payload?.reason,
          isWarning: !!payload?.isWarning
        });
      },
      'candidate:paused': (payload) => {
        setAttemptStatus('PAUSED');
        setPauseReason(payload?.reason || 'Examination paused by invigilator.');
      },
      'candidate:resumed': (payload) => {
        setAttemptStatus('ACTIVE');
        setPauseReason(null);
        if (payload?.expiresAt) {
          setDynamicExpiresAt(payload.expiresAt);
        }
      },
      'candidate:terminated': (payload) => {
        setAttemptStatus('TERMINATED');
        setTerminationReason(payload?.reason || 'Examination attempt terminated by invigilator.');
      },
      'session:concluded': handleSessionConcluded
    }),
    [handleSessionConcluded]
  );

  const { sendHeartbeat } = useRealtime(
    attemptId ? `attempt:${attemptId}` : null,
    attemptRealtimeHandlers
  );

  // Session-wide announcement listener
  const sessionRealtimeHandlers = useMemo(
    () => ({
      'session:announcement': (payload) => {
        setActiveAnnouncement(payload);
      },
      'session:concluded': handleSessionConcluded
    }),
    [handleSessionConcluded]
  );

  useRealtime(
    attempt?.session_id ? `session:${attempt.session_id}` : null,
    sessionRealtimeHandlers
  );

  // 5-second application presence pulse (stops upon submission/expiry/unmount)
  useEffect(() => {
    const isPulseActive = !!attempt && !isExpired && !isSubmitting && !autoSubmittingBanner;
    if (!isPulseActive || !attemptId) return;

    // Send initial pulse immediately
    sendHeartbeat(attemptId);

    const pulseInterval = setInterval(() => {
      sendHeartbeat(attemptId);
    }, 5000);

    return () => clearInterval(pulseInterval);
  }, [attempt, isExpired, isSubmitting, autoSubmittingBanner, sendHeartbeat, attemptId]);

  useEffect(() => {
    const isLive = !!attempt && !isExpired && !isSubmitting && !autoSubmittingBanner;
    if (!isLive || !attempt?.session_id) return;

    let isMounted = true;

    async function initMedia() {
      try {
        const { stream, screenStream: displayStream } = await startCapture({ video: true, audio: true, screen: true }).catch(() => ({ stream: null, screenStream: null }));
        if (!isMounted || !stream) return;

        await mediaClient.createSendTransport(attempt.session_id);

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          await mediaClient.produceTrack(videoTrack, 'webcam', true);
        }

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          await mediaClient.produceTrack(audioTrack, 'microphone', false);
        }

        const screenTrack = displayStream?.getVideoTracks()[0];
        if (screenTrack) {
          await mediaClient.produceTrack(screenTrack, 'screen', false);
        }

        if (isMounted) {
          setMediaPublishing(true);
        }
      } catch (err) {
        console.warn('Could not initialize candidate WebRTC media streaming:', err);
      }
    }

    initMedia();

    return () => {
      isMounted = false;
      stopCapture();
      mediaClient.closeAll();
      setMediaPublishing(false);
    };
  }, [attempt, isExpired, isSubmitting, autoSubmittingBanner, startCapture, stopCapture]);

  useEffect(() => {
    if (mediaVideoRef.current && mediaStream) {
      mediaVideoRef.current.srcObject = mediaStream;
    }
  }, [mediaStream]);

  // Input locking if expired or paused/terminated
  const inputsDisabled = isExpired || isSubmitting || autoSubmittingBanner || isAttemptPaused;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size="lg" label="Loading examination workspace..." />
      </div>
    );
  }

  if (initialError) {
    return (
      <div className="container" style={{ maxWidth: '600px', marginTop: '4rem' }}>
        <Card style={{ textAlign: 'center', padding: '2.5rem' }}>
          <h2 style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>Examination Error</h2>
          <p style={{ color: 'var(--color-text-body)', marginBottom: '1.5rem' }}>{initialError}</p>
          <Button onClick={() => navigate('/candidate')}>Return to Dashboard</Button>
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-canvas)' }}>
      {/* Sticky Workspace Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          backgroundColor: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border-subtle)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          className="container-lg"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '64px',
            paddingLeft: '1.5rem',
            paddingRight: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
              }}
            >
              {attempt?.exam_title || 'Examination Workspace'}
            </span>
            <AutosaveIndicator status={saveStatus} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <TimerDisplay
              formattedTime={formattedTime}
              isExpired={isExpired}
              isUrgent5Min={isUrgent5Min}
              isUrgent1Min={isUrgent1Min}
            />

            <Button
              variant="danger"
              size="md"
              disabled={inputsDisabled}
              onClick={() => {
                setSubmissionError('');
                setIsSubmitModalOpen(true);
              }}
            >
              Submit Exam
            </Button>
          </div>
        </div>
      </header>

      {/* Floating Network Loss Warning */}
      <OfflineBanner isOffline={isOffline} />

      {/* Expiry Auto-submission Banner */}
      {autoSubmittingBanner && (
        <div
          role="alert"
          style={{
            backgroundColor: 'var(--color-danger-light)',
            borderBottom: '1px solid var(--color-danger-border)',
            color: 'var(--color-danger)',
            padding: '0.75rem 1.5rem',
            textAlign: 'center',
            fontWeight: 600,
            fontSize: '0.9375rem',
          }}
        >
          Exam time has concluded. Finalizing and submitting attempt...
        </div>
      )}

      {/* Realtime Proctor Announcement Banner */}
      <AnnouncementBanner
        announcement={activeAnnouncement}
        onDismiss={() => setActiveAnnouncement(null)}
      />

      {/* Direct Invigilator Warning / Message Toast */}
      <CandidateDirectMessageToast
        messageData={directMessageData}
        onDismiss={() => setDirectMessageData(null)}
      />

      {/* Fullscreen Non-Dismissible Pause Overlay */}
      <CandidatePauseOverlay
        isOpen={attemptStatus === 'PAUSED'}
        reason={pauseReason}
      />

      {/* Fullscreen Non-Dismissible Termination Overlay */}
      <CandidateTerminationOverlay
        isOpen={attemptStatus === 'TERMINATED'}
        reason={terminationReason}
        onReturnHome={() => navigate('/candidate')}
      />

      {/* Main Workspace Layout */}
      <main
        className="container-lg"
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: '2rem',
          padding: '2rem 1.5rem',
          alignItems: 'start',
        }}
      >
        {/* Question Pane */}
        <div>
          <Card padding="spacious" style={{ marginBottom: '1.5rem', minHeight: '380px' }}>
            {currentQuestion ? (
              <QuestionRenderer
                question={currentQuestion}
                questionNumber={currentQuestionIndex + 1}
                value={currentAnswer}
                onChange={(newVal) => setAnswer(currentQuestion.id, newVal)}
                disabled={inputsDisabled}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--color-text-muted)' }}>
                No questions found in this assessment.
              </div>
            )}
          </Card>

          {/* Navigation Controls Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Button
              variant="secondary"
              disabled={currentQuestionIndex === 0 || inputsDisabled}
              onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
            >
              &larr; Previous Question
            </Button>

            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
              Question {currentQuestionIndex + 1} of {totalQuestions}
            </span>

            {currentQuestionIndex < totalQuestions - 1 ? (
              <Button
                variant="primary"
                disabled={inputsDisabled}
                onClick={() => setCurrentQuestionIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
              >
                Next Question &rarr;
              </Button>
            ) : (
              <Button
                variant="danger"
                disabled={inputsDisabled}
                onClick={() => {
                  setSubmissionError('');
                  setIsSubmitModalOpen(true);
                }}
              >
                Review & Submit &rarr;
              </Button>
            )}
          </div>
        </div>

        {/* Question Palette Sidebar */}
        <aside>
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

      {/* Floating Candidate Camera Preview Widget (Phase 17) */}
      {isCapturing && (
        <div
          style={{
            position: 'fixed',
            bottom: '1rem',
            right: '1rem',
            width: '180px',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            border: '2px solid var(--color-primary, #3b82f6)',
            backgroundColor: '#000',
            zIndex: 1000
          }}
        >
          <video
            ref={mediaVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '120px', objectFit: 'cover' }}
          />
          <div
            style={{
              padding: '0.25rem 0.5rem',
              backgroundColor: 'rgba(0,0,0,0.8)',
              color: '#fff',
              fontSize: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: mediaPublishing ? '#22c55e' : '#eab308'
                }}
              />
              {mediaPublishing ? 'Proctoring Active' : 'Connecting...'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
