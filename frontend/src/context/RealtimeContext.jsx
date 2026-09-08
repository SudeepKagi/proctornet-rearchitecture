/**
 * @file RealtimeContext.jsx
 * @description React Context provider managing shared singleton RealtimeClient lifecycle,
 * proactive REST token refresh timer, and WebSocket connection status.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { AuthContext } from './AuthContext.jsx';
import { realtimeClient } from '../services/realtimeClient.js';
import * as authApi from '../api/authApi.js';

export const RealtimeContext = createContext(null);

const PROACTIVE_REFRESH_INTERVAL_MS = 12 * 60 * 1000; // 12 minutes (before 15m access expiry)

export function RealtimeProvider({ children }) {
  const { user, isAuthenticated } = useContext(AuthContext);
  const [status, setStatus] = useState(realtimeClient.status);
  const [isDegraded, setIsDegraded] = useState(realtimeClient.isDegraded);

  // Synchronize client connection with authentication lifecycle
  useEffect(() => {
    if (isAuthenticated && user) {
      realtimeClient.connect();
    } else {
      realtimeClient.disconnect();
    }
  }, [isAuthenticated, user]);

  // Listen to status and degradation state changes from RealtimeClient
  useEffect(() => {
    const handleStatus = ({ status: newStatus }) => {
      setStatus(newStatus);
    };

    const handleDegraded = ({ isDegraded: newDegraded }) => {
      setIsDegraded(newDegraded);
    };

    realtimeClient.on('status', handleStatus);
    realtimeClient.on('degraded', handleDegraded);

    return () => {
      realtimeClient.off('status', handleStatus);
      realtimeClient.off('degraded', handleDegraded);
    };
  }, []);

  // Proactive background REST token refresh before the 15-minute token expires
  useEffect(() => {
    if (!isAuthenticated) return;

    const refreshTimer = setInterval(async () => {
      try {
        await authApi.refresh();
      } catch (err) {
        console.warn('Proactive background token refresh failed:', err);
      }
    }, PROACTIVE_REFRESH_INTERVAL_MS);

    return () => clearInterval(refreshTimer);
  }, [isAuthenticated]);

  const subscribe = useCallback((room, handler) => {
    return realtimeClient.subscribe(room, handler);
  }, []);

  const unsubscribe = useCallback((room, handler) => {
    realtimeClient.unsubscribe(room, handler);
  }, []);

  const sendHeartbeat = useCallback((attemptId) => {
    realtimeClient.sendHeartbeat(attemptId);
  }, []);

  const value = useMemo(
    () => ({
      client: realtimeClient,
      status,
      isDegraded,
      subscribe,
      unsubscribe,
      sendHeartbeat
    }),
    [status, isDegraded, subscribe, unsubscribe, sendHeartbeat]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeContext() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtimeContext must be used within a RealtimeProvider');
  }
  return context;
}
