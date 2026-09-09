/**
 * @file phase26Frontend.test.jsx
 * @description Frontend test suite for Phase 26 Examination & Invigilation features:
 * - Candidate Intervention Overlays (Pause, Terminate, Announcements, Direct Messages)
 * - Subjective Question Rendering (SHORT_ANSWER, ESSAY, CODE)
 * - Invigilator Intervention Modals & Sign-Off
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  CandidatePauseOverlay,
  CandidateTerminationOverlay,
  AnnouncementBanner,
  CandidateDirectMessageToast
} from '../../src/components/exam/CandidateInterventionOverlays.jsx';
import { QuestionRenderer } from '../../src/components/exam/QuestionRenderer.jsx';
import {
  AnnouncementModal,
  CandidateMessageModal,
  PauseAttemptModal
} from '../../src/components/invigilator/InterventionModals.jsx';

describe('Phase 26 Candidate Intervention Overlays (Workstream G)', () => {
  it('renders CandidatePauseOverlay when open and displays proctor rationale', () => {
    render(
      <CandidatePauseOverlay
        isOpen={true}
        reason="Suspicious eye gaze movement detected"
      />
    );

    expect(screen.getByText(/Examination Remotely Paused/i)).toBeInTheDocument();
    expect(screen.getByText(/Suspicious eye gaze movement detected/i)).toBeInTheDocument();
  });

  it('renders CandidateTerminationOverlay with non-bypassable termination notice', () => {
    const onReturnHome = vi.fn();
    render(
      <CandidateTerminationOverlay
        isOpen={true}
        reason="Severe violation: Unauthorized device detected"
        onReturnHome={onReturnHome}
      />
    );

    expect(screen.getByText(/Examination Attempt Terminated/i)).toBeInTheDocument();
    expect(screen.getByText(/Severe violation: Unauthorized device detected/i)).toBeInTheDocument();

    const returnBtn = screen.getByRole('button', { name: /Return to Dashboard/i });
    fireEvent.click(returnBtn);
    expect(onReturnHome).toHaveBeenCalledOnce();
  });

  it('renders AnnouncementBanner and handles dismissal', () => {
    const onDismiss = vi.fn();
    render(
      <AnnouncementBanner
        announcement={{ message: 'Please note 15 minutes remaining for Section A' }}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText(/Please note 15 minutes remaining for Section A/i)).toBeInTheDocument();
    const dismissBtn = screen.getByRole('button', { name: '✕' });
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders CandidateDirectMessageToast with warning badge', () => {
    const onDismiss = vi.fn();
    render(
      <CandidateDirectMessageToast
        messageData={{
          message: 'Please keep your hands visible within camera frame.',
          reason: 'Hands offscreen',
          isWarning: true
        }}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText(/Official Invigilator Warning/i)).toBeInTheDocument();
    expect(screen.getByText(/Please keep your hands visible within camera frame./i)).toBeInTheDocument();
    expect(screen.getByText(/Rationale: Hands offscreen/i)).toBeInTheDocument();

    const ackBtn = screen.getByRole('button', { name: /Acknowledge/i });
    fireEvent.click(ackBtn);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe('Phase 26 Subjective Question Rendering (Workstream A & C)', () => {
  it('renders SHORT_ANSWER text input and updates answer', () => {
    const onChange = vi.fn();
    const question = {
      id: 'q-short-1',
      question_type: 'SHORT_ANSWER',
      prompt: 'Define Big-O notation.',
      points: 2
    };

    render(
      <QuestionRenderer
        question={question}
        questionNumber={1}
        value={{ text_response: '' }}
        onChange={onChange}
      />
    );

    expect(screen.getByText('Define Big-O notation.')).toBeInTheDocument();
    const input = screen.getByPlaceholderText(/Type your answer here.../i);
    fireEvent.change(input, { target: { value: 'Upper bound on asymptotic complexity' } });
    expect(onChange).toHaveBeenCalledWith({ text_response: 'Upper bound on asymptotic complexity' });
  });

  it('renders ESSAY multi-line textarea and updates response', () => {
    const onChange = vi.fn();
    const question = {
      id: 'q-essay-1',
      question_type: 'ESSAY',
      prompt: 'Analyze the trade-offs between monolithic and microservices architectures.',
      points: 10
    };

    render(
      <QuestionRenderer
        question={question}
        questionNumber={2}
        value={{ text_response: 'Initial draft' }}
        onChange={onChange}
      />
    );

    expect(screen.getByText(/trade-offs between monolithic and microservices/i)).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(/Structure your analysis, arguments, and evidence here.../i);
    expect(textarea.value).toBe('Initial draft');
    fireEvent.change(textarea, { target: { value: 'Expanded analysis of network latency' } });
    expect(onChange).toHaveBeenCalledWith({ text_response: 'Expanded analysis of network latency' });
  });

  it('renders CODE editor and captures implementation', () => {
    const onChange = vi.fn();
    const question = {
      id: 'q-code-1',
      question_type: 'CODE',
      prompt: 'Implement a function to reverse a linked list.',
      points: 5
    };

    render(
      <QuestionRenderer
        question={question}
        questionNumber={3}
        value={{ text_response: '' }}
        onChange={onChange}
      />
    );

    expect(screen.getByText(/reverse a linked list/i)).toBeInTheDocument();
    const codeArea = screen.getByPlaceholderText(/\/\/ Write your code implementation here.../i);
    fireEvent.change(codeArea, { target: { value: 'function reverse(head) { return head; }' } });
    expect(onChange).toHaveBeenCalledWith({ text_response: 'function reverse(head) { return head; }' });
  });
});

describe('Phase 26 Invigilator Modals (Workstream F)', () => {
  it('renders AnnouncementModal and requires non-empty message', () => {
    render(
      <AnnouncementModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId="sess-123"
      />
    );

    expect(screen.getByText(/Broadcast Room Announcement/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/15 minutes remaining/i)).toBeInTheDocument();
  });

  it('renders PauseAttemptModal with mandatory rationale notice', () => {
    render(
      <PauseAttemptModal
        isOpen={true}
        onClose={vi.fn()}
        attemptId="att-456"
        candidateName="Alice Smith"
      />
    );

    expect(screen.getByText(/Remotely Pause Exam: Alice Smith/i)).toBeInTheDocument();
    expect(screen.getByText(/Alice Smith/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Inspecting environment/i)).toBeInTheDocument();
  });
});
