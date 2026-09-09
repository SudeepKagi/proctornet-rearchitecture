/**
 * @file useProctoringEvents.js
 * @description Candidate-side proctoring telemetry hook conforming to Phase 28 Stage 1 & Stage 2 taxonomy.
 * Stage 1: Deterministic Browser/Media Telemetry:
 *  - BROWSER_FOCUS_LOST
 *  - EXAM_VISIBILITY_LOST
 *  - FULLSCREEN_EXIT
 *  - SCREEN_CAPTURE_INTERRUPTED [TECHNICAL]
 *  - SCREEN_STREAM_DEGRADED [TECHNICAL]
 * Stage 2: Client Screen AI:
 *  - SCREEN_CONTEXT_CLASSIFICATION (EXAM_CONTEXT, NON_EXAM_CONTEXT, UNKNOWN_CONTEXT)
 *
 * Privacy Invariants:
 *  - No clipboard content captured or transmitted
 *  - No keystroke text content captured or transmitted
 *  - No raw screen frames persistently buffered or transmitted
 *  - Client sends observation telemetry only; riskScore/severity calculation is strictly server-authoritative.
 */

import { useEffect, useRef, useCallback } from 'react';
import { generateUUID } from '../utils/uuid.js';
import * as proctoringApi from '../api/proctoringApi.js';

const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_BATCH_SIZE = 20;
const MAX_BUFFER_CAP = 100;
const HEARTBEAT_INTERVAL_MS = 30000;

export function useProctoringEvents({
  attemptId,
  isActive = true,
  flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
  maxBufferSize = MAX_BUFFER_BATCH_SIZE
}) {
  const bufferRef = useRef([]);
  const isFlushingRef = useRef(false);
  const attemptIdRef = useRef(attemptId);
  const isActiveRef = useRef(isActive);
  const blurStartRef = useRef(null);
  const visibilityHiddenStartRef = useRef(null);

  attemptIdRef.current = attemptId;
  isActiveRef.current = isActive;

  /**
   * Flushes up to 50 buffered events to the backend in a non-blocking request.
   */
  const flushBuffer = useCallback(async () => {
    if (isFlushingRef.current) return;
    if (!attemptIdRef.current || !isActiveRef.current) return;
    if (bufferRef.current.length === 0) return;

    isFlushingRef.current = true;
    const batch = bufferRef.current.slice(0, 50);

    try {
      await proctoringApi.ingestEvents(attemptIdRef.current, batch);
      // Remove successfully processed events from buffer
      const sentIds = new Set(batch.map((e) => e.eventId));
      bufferRef.current = bufferRef.current.filter((e) => !sentIds.has(e.eventId));
    } catch {
      // Network or temporary failure: retain in buffer for subsequent retry.
      // Cap buffer size to prevent unbounded memory growth during extended disconnections.
      if (bufferRef.current.length > MAX_BUFFER_CAP) {
        bufferRef.current = bufferRef.current.slice(-MAX_BUFFER_CAP);
      }
    } finally {
      isFlushingRef.current = false;
    }
  }, []);

  /**
   * Enqueues a telemetry event with generated UUID and client timestamp.
   * Client schema validation: never supplies riskScore or severity.
   */
  const enqueueEvent = useCallback((eventType, metadata = {}) => {
    if (!isActiveRef.current || !attemptIdRef.current) return;

    const event = {
      eventId: generateUUID(),
      eventType,
      clientTimestamp: new Date().toISOString(),
      metadata: {
        ...metadata
      }
    };

    bufferRef.current.push(event);

    if (bufferRef.current.length >= maxBufferSize) {
      flushBuffer();
    }
  }, [flushBuffer, maxBufferSize]);

  // Public helper methods for Stage 1 & Stage 2 events
  const recordScreenInterruption = useCallback((reason = 'SCREEN_TRACK_ENDED') => {
    enqueueEvent('SCREEN_CAPTURE_INTERRUPTED', {
      reason,
      source: 'TECHNICAL'
    });
  }, [enqueueEvent]);

  const recordScreenDegradation = useCallback((reason = 'TRANSIENT_FRAME_DROP', fps = 0) => {
    enqueueEvent('SCREEN_STREAM_DEGRADED', {
      reason,
      fps,
      source: 'TECHNICAL'
    });
  }, [enqueueEvent]);

  const recordScreenClassification = useCallback(({
    contextState = 'EXAM_CONTEXT',
    confidence = 1.0,
    durationMs = 0,
    modelId = 'mobilenetv3-small-screen-v1',
    modelVersion = '1.0.0'
  } = {}) => {
    enqueueEvent('SCREEN_CONTEXT_CLASSIFICATION', {
      contextState,
      confidence,
      durationMs,
      source: 'SCREEN_AI',
      modelId,
      modelVersion
    });
  }, [enqueueEvent]);

  useEffect(() => {
    if (!isActive || !attemptId) {
      return;
    }

    // 1. Visibility change listener (tab/browser visibility)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        visibilityHiddenStartRef.current = Date.now();
        enqueueEvent('EXAM_VISIBILITY_LOST', {
          target: 'document',
          source: 'BROWSER'
        });
      } else {
        const durationMs = visibilityHiddenStartRef.current
          ? Date.now() - visibilityHiddenStartRef.current
          : 0;
        visibilityHiddenStartRef.current = null;
        enqueueEvent('TAB_VISIBLE', {
          target: 'document',
          durationMs,
          source: 'BROWSER'
        });
      }
    };

    // 2. Window focus & blur
    const handleWindowBlur = () => {
      blurStartRef.current = Date.now();
      enqueueEvent('BROWSER_FOCUS_LOST', {
        target: 'window',
        source: 'BROWSER'
      });
    };

    const handleWindowFocus = () => {
      const durationMs = blurStartRef.current ? Date.now() - blurStartRef.current : 0;
      blurStartRef.current = null;
      enqueueEvent('WINDOW_FOCUS', {
        target: 'window',
        durationMs,
        source: 'BROWSER'
      });
    };

    // 3. Fullscreen change
    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        enqueueEvent('FULLSCREEN_ENTER', { target: 'document', source: 'BROWSER' });
      } else {
        enqueueEvent('FULLSCREEN_EXIT', { target: 'document', source: 'BROWSER' });
      }
    };

    // 4. Restricted Keyboard Combinations (whitelisted keys only, no typed text)
    const handleKeyDown = (e) => {
      // Alt + Tab
      if (e.altKey && (e.key === 'Tab' || e.code === 'Tab')) {
        enqueueEvent('RESTRICTED_KEY_COMBO', { combo: 'ALT_TAB', source: 'BROWSER' });
      }

      // Alt + F4
      if (e.altKey && (e.key === 'F4' || e.code === 'F4')) {
        enqueueEvent('RESTRICTED_KEY_COMBO', { combo: 'ALT_F4', source: 'BROWSER' });
      }

      // Ctrl + W / Cmd + W
      if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W' || e.code === 'KeyW')) {
        enqueueEvent('RESTRICTED_KEY_COMBO', { combo: 'CTRL_W', source: 'BROWSER' });
      }

      // DevTools shortcuts (F12, Ctrl+Shift+I, Cmd+Opt+I)
      const isF12 = e.key === 'F12' || e.code === 'F12';
      const isCtrlShiftI = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.code === 'KeyI');
      const isCtrlShiftJ = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.code === 'KeyJ');
      if (isF12 || isCtrlShiftI || isCtrlShiftJ) {
        enqueueEvent('DEVTOOLS_OPEN', { target: 'devtools_shortcut', source: 'BROWSER' });
      }

      // Copy / Paste keyboard combos (no content captured)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C' || e.code === 'KeyC')) {
        enqueueEvent('COPY_PASTE_ATTEMPT', { action: 'COPY', source: 'BROWSER' });
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V' || e.code === 'KeyV')) {
        enqueueEvent('COPY_PASTE_ATTEMPT', { action: 'PASTE', source: 'BROWSER' });
      }
    };

    // 5. Clipboard events (no clipboard data inspected or recorded)
    const handleCopy = () => {
      enqueueEvent('COPY_PASTE_ATTEMPT', { action: 'COPY', source: 'BROWSER' });
    };

    const handlePaste = () => {
      enqueueEvent('COPY_PASTE_ATTEMPT', { action: 'PASTE', source: 'BROWSER' });
    };

    // Attach listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);

    // Periodic heartbeat
    const heartbeatTimer = setInterval(() => {
      enqueueEvent('PERIODIC_HEARTBEAT', { intervalMs: HEARTBEAT_INTERVAL_MS, source: 'BROWSER' });
    }, HEARTBEAT_INTERVAL_MS);

    // Periodic flush timer
    const flushTimer = setInterval(() => {
      flushBuffer();
    }, flushIntervalMs);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);

      clearInterval(heartbeatTimer);
      clearInterval(flushTimer);

      // Best effort final flush
      flushBuffer();
    };
  }, [isActive, attemptId, enqueueEvent, flushBuffer, flushIntervalMs]);

  return {
    enqueueEvent,
    flushBuffer,
    recordScreenInterruption,
    recordScreenDegradation,
    recordScreenClassification,
    getPendingEventCount: () => bufferRef.current.length
  };
}

export default useProctoringEvents;
