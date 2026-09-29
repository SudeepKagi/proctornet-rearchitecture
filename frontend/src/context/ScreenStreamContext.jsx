/**
 * @file ScreenStreamContext.jsx
 * @description Persistent React Context for Screen Sharing MediaStreams.
 * Mounts above the application router so acquired screen share media streams persist
 * across route transitions from readiness check-in to live exam execution.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const ScreenStreamContext = createContext(null);

export function ScreenStreamProvider({ children }) {
  const [screenStream, setScreenStream] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenError, setScreenError] = useState('');
  const streamRef = useRef(null);

  const handleTrackEnded = useCallback(() => {
    setIsScreenSharing(false);
    setScreenStream(null);
    streamRef.current = null;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('proctornet:screen-ended'));
    }
  }, []);

  const stopScreenCapture = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
      } catch (err) {
        console.warn('Error stopping screen stream tracks:', err);
      }
      streamRef.current = null;
    }
    setScreenStream(null);
    setIsScreenSharing(false);
  }, []);

  const startScreenCapture = useCallback(async () => {
    setScreenError('');
    if (!navigator.mediaDevices?.getDisplayMedia) {
      const err = 'Screen sharing is not supported in this browser. Please use Chrome, Edge, or Firefox.';
      setScreenError(err);
      throw new Error(err);
    }

    try {
      // Clean up previous stream if open
      stopScreenCapture();

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          cursor: 'always'
        },
        audio: false
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = handleTrackEnded;
      }

      streamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);
      return stream;
    } catch (err) {
      setIsScreenSharing(false);
      const errMsg =
        err.name === 'NotAllowedError'
          ? 'Screen sharing permission was denied. You must grant entire-screen access to continue.'
          : err.message || 'Failed to capture screen.';
      setScreenError(errMsg);
      throw new Error(errMsg);
    }
  }, [stopScreenCapture, handleTrackEnded]);

  // Clean up on unmount or browser close
  useEffect(() => {
    const handleBeforeUnload = () => {
      stopScreenCapture();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stopScreenCapture();
    };
  }, [stopScreenCapture]);

  const value = {
    screenStream,
    isScreenSharing,
    screenError,
    setScreenError,
    startScreenCapture,
    stopScreenCapture,
  };

  return <ScreenStreamContext.Provider value={value}>{children}</ScreenStreamContext.Provider>;
}

export function useScreenStream() {
  const context = useContext(ScreenStreamContext);
  if (!context) {
    throw new Error('useScreenStream must be used within a ScreenStreamProvider');
  }
  return context;
}
