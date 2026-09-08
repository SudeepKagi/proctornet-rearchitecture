/**
 * @file useProctoringEvents.js
 * @description Candidate-side proctoring telemetry hook.
 * Captures browser events (visibility, blur/focus, fullscreen, restricted key combos,
 * copy/paste attempts) strictly within privacy boundaries (no clipboard text, no keystroke content).
 * Buffers events in memory and flushes them in batches via non-blocking HTTP POST.
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
      // Cap buffer size to prevent memory leaks during extended disconnections.
      if (bufferRef.current.length > MAX_BUFFER_CAP) {
        bufferRef.current = bufferRef.current.slice(-MAX_BUFFER_CAP);
      }
    } finally {
      isFlushingRef.current = false;
    }
  }, []);

  /**
   * Enqueues a telemetry event with generated UUID and client timestamp.
   */
  const enqueueEvent = useCallback((eventType, metadata = {}) => {
    if (!isActiveRef.current || !attemptIdRef.current) return;

    // Build event object conforming to schema (no client severity / score / user identifiers)
    const event = {
      eventId: generateUUID(),
      eventType,
      clientTimestamp: new Date().toISOString(),
      metadata
    };

    bufferRef.current.push(event);

    if (bufferRef.current.length >= maxBufferSize) {
      flushBuffer();
    }
  }, [flushBuffer, maxBufferSize]);

  useEffect(() => {
    if (!isActive || !attemptId) {
      return;
    }

    // 1. Visibility change listener (tab hidden/visible)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        enqueueEvent('TAB_HIDDEN', { target: 'tab' });
      } else {
        enqueueEvent('TAB_VISIBLE', { target: 'tab' });
      }
    };

    // 2. Window focus & blur
    const handleWindowBlur = () => {
      enqueueEvent('WINDOW_BLUR', { target: 'window' });
    };

    const handleWindowFocus = () => {
      enqueueEvent('WINDOW_FOCUS', { target: 'window' });
    };

    // 3. Fullscreen change
    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        enqueueEvent('FULLSCREEN_ENTER', { target: 'document' });
      } else {
        enqueueEvent('FULLSCREEN_EXIT', { target: 'document' });
      }
    };

    // 4. Restricted Keyboard Combinations (whitelisted keys only, no typed text)
    const handleKeyDown = (e) => {
      // Alt + Tab
      if (e.altKey && (e.key === 'Tab' || e.code === 'Tab')) {
        enqueueEvent('RESTRICTED_KEY_COMBO', { combo: 'ALT_TAB' });
      }

      // Alt + F4
      if (e.altKey && (e.key === 'F4' || e.code === 'F4')) {
        enqueueEvent('RESTRICTED_KEY_COMBO', { combo: 'ALT_F4' });
      }

      // Ctrl + W / Cmd + W
      if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W' || e.code === 'KeyW')) {
        enqueueEvent('RESTRICTED_KEY_COMBO', { combo: 'CTRL_W' });
      }

      // DevTools shortcuts (F12, Ctrl+Shift+I, Cmd+Opt+I)
      const isF12 = e.key === 'F12' || e.code === 'F12';
      const isCtrlShiftI = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.code === 'KeyI');
      const isCtrlShiftJ = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.code === 'KeyJ');
      if (isF12 || isCtrlShiftI || isCtrlShiftJ) {
        enqueueEvent('DEVTOOLS_OPEN', { target: 'devtools_shortcut' });
      }

      // Copy / Paste keyboard combos (no content captured)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C' || e.code === 'KeyC')) {
        enqueueEvent('COPY_PASTE_ATTEMPT', { action: 'COPY' });
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V' || e.code === 'KeyV')) {
        enqueueEvent('COPY_PASTE_ATTEMPT', { action: 'PASTE' });
      }
    };

    // 5. Clipboard events (no clipboard data inspected or recorded)
    const handleCopy = () => {
      enqueueEvent('COPY_PASTE_ATTEMPT', { action: 'COPY' });
    };

    const handlePaste = () => {
      enqueueEvent('COPY_PASTE_ATTEMPT', { action: 'PASTE' });
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
      enqueueEvent('PERIODIC_HEARTBEAT', { intervalMs: HEARTBEAT_INTERVAL_MS });
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
    getPendingEventCount: () => bufferRef.current.length
  };
}
