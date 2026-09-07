/**
 * @file useAutosave.js
 * @description Debounced autosave hook with in-memory retry buffer and OCC revision tracking.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import * as answersApi from '../api/answersApi.js';

export function useAutosave({
  attemptId,
  initialAnswers = [],
  isOffline = false,
}) {
  // Map of questionId -> { answer_value, revision_id }
  const [answers, setAnswers] = useState(() => {
    const map = {};
    for (const ans of initialAnswers) {
      map[ans.attempt_question_id] = {
        answer_value: ans.answer_value,
        revision_id: ans.revision_id || 1,
      };
    }
    return map;
  });

  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'offline'
  
  // In-memory dirty queue: Map of questionId -> { answer_value, expected_revision }
  const dirtyQueueRef = useRef(new Map());
  const debounceTimersRef = useRef(new Map());
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // Persist an individual question answer
  const persistAnswer = useCallback(
    async (questionId, answerValue, expectedRevision) => {
      setSaveStatus('saving');
      try {
        const result = await answersApi.saveAnswer(
          attemptId,
          questionId,
          answerValue,
          expectedRevision
        );

        // On 200 OK, update local revision and remove from dirty queue
        setAnswers((prev) => ({
          ...prev,
          [questionId]: {
            answer_value: answerValue,
            revision_id: result.revision_id,
          },
        }));

        dirtyQueueRef.current.delete(questionId);

        if (dirtyQueueRef.current.size === 0) {
          setSaveStatus('saved');
        }
      } catch (err) {
        if (err.status === 409) {
          // Stale revision: reconcile from server
          try {
            const serverAnswers = await answersApi.getAnswers(attemptId);
            const reconciled = {};
            for (const a of serverAnswers) {
              reconciled[a.attempt_question_id] = {
                answer_value: a.answer_value,
                revision_id: a.revision_id,
              };
            }
            setAnswers(reconciled);
            dirtyQueueRef.current.delete(questionId);
            setSaveStatus('saved');
          } catch {
            setSaveStatus('offline');
          }
        } else {
          // Network failure: retain in in-memory dirty queue
          setSaveStatus('offline');
        }
      }
    },
    [attemptId]
  );

  // Set an answer locally with immediate visual feedback and 1,000ms debounce
  const setAnswer = useCallback(
    (questionId, answerValue) => {
      const currentRev = answersRef.current[questionId]?.revision_id || 1;

      // Update in-memory state immediately (0ms visual latency)
      setAnswers((prev) => ({
        ...prev,
        [questionId]: {
          answer_value: answerValue,
          revision_id: currentRev,
        },
      }));

      // Queue in dirty buffer
      dirtyQueueRef.current.set(questionId, {
        answer_value: answerValue,
        expected_revision: currentRev,
      });

      // Clear existing debounce timer for this question
      if (debounceTimersRef.current.has(questionId)) {
        clearTimeout(debounceTimersRef.current.get(questionId));
      }

      // Schedule new save in 1,000ms
      const timer = setTimeout(() => {
        debounceTimersRef.current.delete(questionId);
        persistAnswer(questionId, answerValue, currentRev);
      }, 1000);

      debounceTimersRef.current.set(questionId, timer);
    },
    [persistAnswer]
  );

  // Flush all queued dirty answers in memory
  const flushDirtyAnswers = useCallback(async () => {
    // Clear any pending debounce timers
    for (const timer of debounceTimersRef.current.values()) {
      clearTimeout(timer);
    }
    debounceTimersRef.current.clear();

    if (dirtyQueueRef.current.size === 0) {
      return [];
    }

    const payload = [];
    for (const [qId, data] of dirtyQueueRef.current.entries()) {
      payload.push({
        attempt_question_id: qId,
        answer_value: data.answer_value,
        expected_revision: data.expected_revision,
      });
    }

    try {
      setSaveStatus('saving');
      await answersApi.batchSaveAnswers(attemptId, payload);
      dirtyQueueRef.current.clear();
      setSaveStatus('saved');
    } catch {
      setSaveStatus('offline');
    }

    return payload;
  }, [attemptId]);

  // Returns array of currently unpersisted dirty answers (used by final submission payload)
  const getDirtyAnswersArray = useCallback(() => {
    const list = [];
    for (const [qId, data] of dirtyQueueRef.current.entries()) {
      list.push({
        attempt_question_id: qId,
        answer_value: data.answer_value,
        expected_revision: data.expected_revision,
      });
    }
    return list;
  }, []);

  // Flush when coming back online
  useEffect(() => {
    if (!isOffline && dirtyQueueRef.current.size > 0) {
      flushDirtyAnswers();
    }
  }, [isOffline, flushDirtyAnswers]);

  // Clean up timers on unmount
  useEffect(() => {
    const timers = debounceTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  // Helper dictionary: questionId -> answer_value
  const answerValues = {};
  for (const [qId, item] of Object.entries(answers)) {
    answerValues[qId] = item.answer_value;
  }

  return {
    answers: answerValues,
    saveStatus,
    setAnswer,
    flushDirtyAnswers,
    getDirtyAnswersArray,
    isDirty: dirtyQueueRef.current.size > 0,
  };
}
