/**
 * @file useScreenAI.js
 * @description Candidate-side hook managing client screen AI inference in a dedicated Web Worker.
 * Conforms to Phase 28:
 *  - Target ~0.25 FPS sampling rate (4000ms)
 *  - Worker lifecycle with 3-attempt circuit breaker
 *  - Graceful degradation: worker or model failure never blocks the examination
 *  - Dispatches Stage 2 SCREEN_CONTEXT_CLASSIFICATION
 *  - Dispatches Stage 1 technical degradation on screen capture track interruption
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { DEFAULT_MODEL_CONFIG } from '../services/screenInferenceEngine.js';

const DEFAULT_SAMPLING_INTERVAL_MS = 4000; // ~0.25 FPS
const MAX_RESTART_ATTEMPTS = 3;

export function useScreenAI({
  screenTrack,
  isActive = true,
  samplingIntervalMs = DEFAULT_SAMPLING_INTERVAL_MS,
  onClassification,
  onTechnicalEvent
}) {
  const [isReady, setIsReady] = useState(false);
  const [isDegraded, setIsDegraded] = useState(false);
  const [degradedReason, setDegradedReason] = useState(null);

  const workerRef = useRef(null);
  const restartCountRef = useRef(0);
  const isBusyRef = useRef(false);
  const intervalTimerRef = useRef(null);
  const videoElementRef = useRef(null);
  const canvasRef = useRef(null);

  const onClassificationRef = useRef(onClassification);
  const onTechnicalEventRef = useRef(onTechnicalEvent);

  onClassificationRef.current = onClassification;
  onTechnicalEventRef.current = onTechnicalEvent;

  // Frame grabber helper using hidden video element or ImageCapture
  const grabFrame = useCallback(async () => {
    if (!screenTrack || screenTrack.readyState !== 'live' || !screenTrack.enabled) {
      return null;
    }

    try {
      // Modern browser path: ImageCapture
      if (typeof ImageCapture !== 'undefined') {
        const imageCapture = new ImageCapture(screenTrack);
        return await imageCapture.grabFrame();
      }

      // Fallback: Canvas snapshot from video element
      if (!videoElementRef.current) {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = new MediaStream([screenTrack]);
        await video.play().catch(() => {});
        videoElementRef.current = video;
      }

      const video = videoElementRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) return null;

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
        canvasRef.current.width = 224;
        canvasRef.current.height = 224;
      }

      const ctx = canvasRef.current.getContext('2d');
      ctx.drawImage(video, 0, 0, 224, 224);
      const imgData = ctx.getImageData(0, 0, 224, 224);

      return {
        pixels: imgData.data,
        width: 224,
        height: 224
      };
    } catch {
      return null;
    }
  }, [screenTrack]);

  // Worker initialization & message routing
  const initWorker = useCallback(() => {
    if (typeof Worker === 'undefined') {
      setIsDegraded(true);
      setDegradedReason('WEB_WORKER_UNSUPPORTED');
      onTechnicalEventRef.current?.('SCREEN_STREAM_DEGRADED', { reason: 'WEB_WORKER_UNSUPPORTED' });
      return;
    }

    try {
      const workerUrl = '/workers/screenInference.worker.js';
      const worker = new Worker(workerUrl);

      worker.onmessage = (e) => {
        const { type, result, error, reason } = e.data || {};

        switch (type) {
          case 'INIT_SUCCESS':
            setIsReady(true);
            setIsDegraded(false);
            restartCountRef.current = 0;
            break;

          case 'INIT_ERROR':
            setIsReady(false);
            setIsDegraded(true);
            setDegradedReason(error || 'INIT_FAILED');
            onTechnicalEventRef.current?.('SCREEN_STREAM_DEGRADED', { reason: error || 'MODEL_INIT_FAILED' });
            break;

          case 'FRAME_PROCESSED':
            isBusyRef.current = false;
            if (result && onClassificationRef.current) {
              onClassificationRef.current(result);
            }
            break;

          case 'FRAME_DROPPED':
            isBusyRef.current = false;
            break;

          case 'INFERENCE_ERROR':
            isBusyRef.current = false;
            break;

          default:
            break;
        }
      };

      worker.onerror = () => {
        isBusyRef.current = false;
        worker.terminate();

        if (restartCountRef.current < MAX_RESTART_ATTEMPTS) {
          restartCountRef.current += 1;
          setTimeout(initWorker, 1000);
        } else {
          setIsReady(false);
          setIsDegraded(true);
          setDegradedReason('MAX_RESTARTS_EXCEEDED');
          onTechnicalEventRef.current?.('SCREEN_STREAM_DEGRADED', { reason: 'WORKER_CIRCUIT_BREAKER_TRIGGERED' });
        }
      };

      worker.postMessage({
        type: 'INIT',
        payload: {
          modelUrl: DEFAULT_MODEL_CONFIG.modelUrl,
          expectedSha256: DEFAULT_MODEL_CONFIG.expectedSha256
        }
      });

      workerRef.current = worker;
    } catch (err) {
      setIsDegraded(true);
      setDegradedReason(err.message || 'WORKER_SPAWN_FAILED');
      onTechnicalEventRef.current?.('SCREEN_STREAM_DEGRADED', { reason: 'WORKER_SPAWN_FAILED' });
    }
  }, []);

  // Track interruption and degradation monitoring
  useEffect(() => {
    if (!screenTrack) return;

    const handleEnded = () => {
      onTechnicalEventRef.current?.('SCREEN_CAPTURE_INTERRUPTED', { reason: 'TRACK_ENDED' });
    };

    const handleMute = () => {
      onTechnicalEventRef.current?.('SCREEN_STREAM_DEGRADED', { reason: 'TRACK_MUTED' });
    };

    screenTrack.addEventListener('ended', handleEnded);
    screenTrack.addEventListener('mute', handleMute);

    return () => {
      screenTrack.removeEventListener('ended', handleEnded);
      screenTrack.removeEventListener('mute', handleMute);
    };
  }, [screenTrack]);

  // Lifecycle
  useEffect(() => {
    if (!isActive) return;

    initWorker();

    return () => {
      if (intervalTimerRef.current) {
        clearInterval(intervalTimerRef.current);
      }
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (videoElementRef.current) {
        videoElementRef.current.srcObject = null;
        videoElementRef.current = null;
      }
    };
  }, [isActive, initWorker]);

  // Periodic frame inference loop
  useEffect(() => {
    if (!isActive || !isReady || isDegraded || !screenTrack) {
      if (intervalTimerRef.current) {
        clearInterval(intervalTimerRef.current);
        intervalTimerRef.current = null;
      }
      return;
    }

    intervalTimerRef.current = setInterval(async () => {
      if (isBusyRef.current || !workerRef.current) return;

      isBusyRef.current = true;
      const frameData = await grabFrame();

      if (!frameData) {
        isBusyRef.current = false;
        return;
      }

      if (frameData instanceof ImageBitmap) {
        workerRef.current.postMessage(
          {
            type: 'PROCESS_FRAME',
            payload: {
              imageBitmap: frameData,
              frameTimestamp: new Date().toISOString()
            }
          },
          [frameData]
        );
      } else {
        workerRef.current.postMessage({
          type: 'PROCESS_FRAME',
          payload: {
            pixels: frameData.pixels,
            width: frameData.width,
            height: frameData.height,
            frameTimestamp: new Date().toISOString()
          }
        });
      }
    }, samplingIntervalMs);

    return () => {
      if (intervalTimerRef.current) {
        clearInterval(intervalTimerRef.current);
        intervalTimerRef.current = null;
      }
    };
  }, [isActive, isReady, isDegraded, screenTrack, samplingIntervalMs, grabFrame]);

  return {
    isReady,
    isDegraded,
    degradedReason
  };
}

export default useScreenAI;
