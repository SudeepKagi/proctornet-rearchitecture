/**
 * @file useRealtime.js
 * @description React hook to subscribe to WebSocket rooms and event types
 * via the shared singleton RealtimeContext, with automatic cleanup on unmount.
 */

import { useEffect, useRef } from 'react';
import { useRealtimeContext } from '../context/RealtimeContext.jsx';

/**
 * Hook for consuming WebSocket realtime events for a room.
 *
 * @param {string | null} [room=null] - Room to subscribe to (e.g., 'session:123', 'attempt:456')
 * @param {Record<string, (payload: any, envelope: any) => void> | ((payload: any, envelope: any) => void)} [handlers={}] - Event handlers
 * @returns {{
 *   status: string,
 *   isDegraded: boolean,
 *   isConnected: boolean,
 *   sendHeartbeat: (attemptId: string) => void,
 *   subscribe: (room: string, handler?: Function) => () => void,
 *   unsubscribe: (room: string, handler?: Function) => void
 * }}
 */
export function useRealtime(room = null, handlers = {}) {
  const { status, isDegraded, subscribe, unsubscribe, sendHeartbeat } = useRealtimeContext();

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!room) return;

    // Room message dispatcher
    const roomCallback = (payload, envelope) => {
      const currentHandlers = handlersRef.current;
      if (!currentHandlers) return;

      if (typeof currentHandlers === 'function') {
        currentHandlers(payload, envelope);
        return;
      }

      if (typeof currentHandlers === 'object' && envelope?.type) {
        const handler = currentHandlers[envelope.type];
        if (typeof handler === 'function') {
          handler(payload, envelope);
        }
      }
    };

    const cleanup = subscribe(room, roomCallback);

    return () => {
      cleanup();
    };
  }, [room, subscribe]);

  return {
    status,
    isDegraded,
    isConnected: status === 'CONNECTED',
    sendHeartbeat,
    subscribe,
    unsubscribe
  };
}
