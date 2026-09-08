/**
 * @file useMediaCapture.js
 * @description React hook for candidate media capture (camera, microphone, screen) with hardware
 * lock prevention, track cleanup lifecycle, and audio level VU telemetry (Phase 17).
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Stops all active tracks on a MediaStream and releases underlying OS hardware handles.
 * @param {MediaStream | null} stream
 */
export function stopMediaStream(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      track.stop();
      track.enabled = false;
    });
  } catch (err) {
    console.warn('Error releasing media track:', err);
  }
}

/**
 * Hook for capturing candidate webcam, microphone, and desktop screen streams.
 */
export function useMediaCapture() {
  const [stream, setStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // 0.0 to 1.0 VU meter level
  const [error, setError] = useState(null);

  const streamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);

  /**
   * Initializes Web Audio Analyser for visual VU meter level calculation.
   */
  const _setupAudioAnalyser = useCallback((audioStream) => {
    try {
      const audioTrack = audioStream.getAudioTracks()[0];
      if (!audioTrack) return;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(1.0, average / 128); // 0 to 1
        setAudioLevel(normalized);

        animFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.warn('Could not initialize audio analyser:', err);
    }
  }, []);

  /**
   * Cleans up Web Audio analyser node and context.
   */
  const _cleanupAudioAnalyser = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  /**
   * Starts candidate media capture with production constraints.
   *
   * @param {object} [options]
   * @param {boolean} [options.video=true]
   * @param {boolean} [options.audio=true]
   * @param {boolean} [options.screen=false]
   */
  const startCapture = useCallback(
    async ({ video = true, audio = true, screen = false } = {}) => {
      setError(null);

      // Stop any existing tracks first to prevent hardware lock
      stopMediaStream(streamRef.current);
      stopMediaStream(screenStreamRef.current);
      _cleanupAudioAnalyser();

      try {
        let mediaStream = null;

        if (video || audio) {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: video
              ? {
                  width: { ideal: 640 },
                  height: { ideal: 480 },
                  frameRate: { ideal: 20, max: 24 }
                }
              : false,
            audio: audio
              ? {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                }
              : false
          });

          streamRef.current = mediaStream;
          setStream(mediaStream);

          if (audio) {
            _setupAudioAnalyser(mediaStream);
          }
        }

        let displayStream = null;
        if (screen && navigator.mediaDevices.getDisplayMedia) {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              frameRate: { ideal: 5, max: 10 }
            },
            audio: false
          });

          screenStreamRef.current = displayStream;
          setScreenStream(displayStream);

          // Handle candidate stopping screen share from browser banner
          displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
            setScreenStream(null);
            screenStreamRef.current = null;
          });
        }

        setIsCapturing(true);
        return { stream: mediaStream, screenStream: displayStream };
      } catch (err) {
        setError(err);
        stopMediaStream(streamRef.current);
        stopMediaStream(screenStreamRef.current);
        _cleanupAudioAnalyser();
        setIsCapturing(false);
        throw err;
      }
    },
    [_setupAudioAnalyser, _cleanupAudioAnalyser]
  );

  /**
   * Stops all active captures and cleans up hardware locks.
   */
  const stopCapture = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    setStream(null);

    stopMediaStream(screenStreamRef.current);
    screenStreamRef.current = null;
    setScreenStream(null);

    _cleanupAudioAnalyser();
    setIsCapturing(false);
  }, [_cleanupAudioAnalyser]);

  // Clean up all tracks and audio contexts when hook unmounts
  useEffect(() => {
    return () => {
      stopMediaStream(streamRef.current);
      stopMediaStream(screenStreamRef.current);
      _cleanupAudioAnalyser();
    };
  }, [_cleanupAudioAnalyser]);

  return {
    stream,
    screenStream,
    isCapturing,
    audioLevel,
    error,
    startCapture,
    stopCapture
  };
}
