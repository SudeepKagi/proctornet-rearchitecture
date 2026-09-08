/**
 * @file realtimeClient.js
 * @description Frontend WebSocket client singleton with subprotocol-first authentication,
 * exponential backoff reconnect with jitter, room subscription reference counting,
 * and degradation state monitoring.
 */

import { getAccessToken } from '../api/client.js';

export class RealtimeClient {
  /**
   * @param {object} [options]
   * @param {() => string | null} [options.getToken]
   * @param {string} [options.url]
   */
  constructor(options = {}) {
    this.getToken = options.getToken || getAccessToken;
    this.url = options.url || null;

    /** @type {'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING'} */
    this.status = 'DISCONNECTED';
    this.isDegraded = false;

    this.ws = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.baseDelay = 1000;
    this.maxDelay = 30000;

    /** @type {Map<string, Set<(payload: any, envelope: any) => void>>} */
    this.eventListeners = new Map();

    /** @type {Map<string, number>} room -> reference count */
    this.roomRefCounts = new Map();

    /** @type {Map<string, Set<(payload: any, envelope: any) => void>>} room -> handlers */
    this.roomListeners = new Map();
  }

  /**
   * Resolves WebSocket URL with proper protocol.
   * @private
   */
  _resolveWsUrl() {
    if (this.url) return this.url;
    if (typeof window === 'undefined') return 'ws://localhost:3000/ws';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  /**
   * Establishes WebSocket connection using subprotocol authentication:
   * Sec-WebSocket-Protocol: proctornet, <access_token>
   *
   * @param {string} [overrideToken]
   */
  connect(overrideToken) {
    const token = overrideToken || this.getToken();
    if (!token) {
      this.status = 'DISCONNECTED';
      return;
    }

    if (this.ws && (this.status === 'CONNECTED' || this.status === 'CONNECTING')) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.status = this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING';
    this._emit('status', { status: this.status });

    const wsUrl = this._resolveWsUrl();

    try {
      // Browser WebSocket with Sec-WebSocket-Protocol: ['proctornet', token]
      this.ws = new WebSocket(wsUrl, ['proctornet', token]);

      this.ws.onopen = () => {
        this.status = 'CONNECTED';
        this.reconnectAttempts = 0;
        this._emit('status', { status: 'CONNECTED' });

        // Restore all active room subscriptions upon reconnection
        for (const [room, count] of this.roomRefCounts.entries()) {
          if (count > 0) {
            this._sendFrame({ type: 'subscribe', payload: { room } });
          }
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data);
          const { type, payload, room } = envelope;

          if (type === 'system:realtime_degraded') {
            this.isDegraded = true;
            this._emit('degraded', { isDegraded: true, envelope });
          } else if (type === 'system:realtime_recovered') {
            this.isDegraded = false;
            this._emit('degraded', { isDegraded: false, envelope });
          }

          // Emit to general event listeners
          this._emit(type, payload, envelope);

          // Emit to room listeners if message has an assigned room
          if (room && this.roomListeners.has(room)) {
            const handlers = this.roomListeners.get(room);
            for (const handler of handlers) {
              try {
                handler(payload, envelope);
              } catch (err) {
                console.error(`Error in room handler for ${room}:`, err);
              }
            }
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      this.ws.onclose = (event) => {
        const wasClean = event.code === 1000 || event.code === 1001;
        this.ws = null;

        if (this.status === 'DISCONNECTED') {
          return;
        }

        this.status = 'RECONNECTING';
        this._emit('status', { status: 'RECONNECTING', code: event.code });

        // Schedule exponential backoff reconnect with +/- 20% randomized jitter
        const backoff = Math.min(
          this.maxDelay,
          this.baseDelay * Math.pow(2, this.reconnectAttempts)
        );
        const jitter = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
        const delay = Math.round(backoff * jitter);

        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => {
          this.connect();
        }, delay);
      };

      this.ws.onerror = (err) => {
        this._emit('error', err);
      };
    } catch (err) {
      console.error('WebSocket connection initialization error:', err);
      this.status = 'DISCONNECTED';
      this._emit('status', { status: 'DISCONNECTED', error: err });
    }
  }

  /**
   * Subscribes a listener to a specific room with reference counting.
   * If this is the first subscription for this room, sends a `subscribe` frame over the wire.
   *
   * @param {string} room
   * @param {(payload: any, envelope: any) => void} [handler]
   * @returns {() => void} Unsubscribe function
   */
  subscribe(room, handler) {
    if (!room) return () => {};

    // 1. Register room handler
    if (handler) {
      if (!this.roomListeners.has(room)) {
        this.roomListeners.set(room, new Set());
      }
      this.roomListeners.get(room).add(handler);
    }

    // 2. Increment reference count
    const currentCount = this.roomRefCounts.get(room) || 0;
    this.roomRefCounts.set(room, currentCount + 1);

    // 3. Send wire frame if first subscriber and socket is connected
    if (currentCount === 0 && this.status === 'CONNECTED' && this.ws?.readyState === WebSocket.OPEN) {
      this._sendFrame({ type: 'subscribe', payload: { room } });
    }

    return () => this.unsubscribe(room, handler);
  }

  /**
   * Decrements reference count for a room and removes the handler.
   * If reference count reaches 0, sends an `unsubscribe` frame over the wire.
   *
   * @param {string} room
   * @param {(payload: any, envelope: any) => void} [handler]
   */
  unsubscribe(room, handler) {
    if (!room) return;

    // 1. Remove room handler
    if (handler && this.roomListeners.has(room)) {
      this.roomListeners.get(room).delete(handler);
      if (this.roomListeners.get(room).size === 0) {
        this.roomListeners.delete(room);
      }
    }

    // 2. Decrement reference count
    const currentCount = this.roomRefCounts.get(room) || 0;
    if (currentCount <= 1) {
      this.roomRefCounts.delete(room);
      if (this.status === 'CONNECTED' && this.ws?.readyState === WebSocket.OPEN) {
        this._sendFrame({ type: 'unsubscribe', payload: { room } });
      }
    } else {
      this.roomRefCounts.set(room, currentCount - 1);
    }
  }

  /**
   * Sends candidate application presence heartbeat.
   * @param {string} attemptId
   */
  sendHeartbeat(attemptId) {
    if (this.status === 'CONNECTED' && this.ws?.readyState === WebSocket.OPEN) {
      this._sendFrame({ type: 'heartbeat', payload: { attemptId } });
    }
  }

  /**
   * Sends a JSON message over the active socket.
   * @private
   */
  _sendFrame(message) {
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
      }
    } catch (err) {
      console.error('Failed to send WebSocket frame:', err);
    }
  }

  /**
   * Sends a command with type and payload over the active socket.
   * @param {string} type
   * @param {any} [payload]
   */
  send(type, payload = {}) {
    this._sendFrame({ type, payload });
  }

  /**
   * Sends a command and awaits a specific response type or error.
   * @param {string} type
   * @param {string} responseType
   * @param {any} [payload]
   * @param {number} [timeoutMs]
   * @returns {Promise<any>}
   */
  request(type, responseType, payload = {}, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      let timer = null;

      const onResponse = (resPayload) => {
        cleanup();
        resolve(resPayload);
      };

      const onError = (errPayload) => {
        cleanup();
        const err = new Error(errPayload?.message || 'Realtime command failed');
        err.code = errPayload?.code;
        err.payload = errPayload;
        reject(err);
      };

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.off(responseType, onResponse);
        this.off('error', onError);
      };

      timer = setTimeout(() => {
        cleanup();
        const err = new Error(`Request timed out waiting for ${responseType}`);
        err.code = 'TIMEOUT';
        reject(err);
      }, timeoutMs);

      this.on(responseType, onResponse);
      this.on('error', onError);

      this.send(type, payload);
    });
  }

  /**
   * Registers a global event listener by event type.
   * @param {string} eventType
   * @param {(payload: any, envelope: any) => void} handler
   */
  on(eventType, handler) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType).add(handler);
  }

  /**
   * Unregisters a global event listener.
   * @param {string} eventType
   * @param {(payload: any, envelope: any) => void} handler
   */
  off(eventType, handler) {
    if (this.eventListeners.has(eventType)) {
      this.eventListeners.get(eventType).delete(handler);
      if (this.eventListeners.get(eventType).size === 0) {
        this.eventListeners.delete(eventType);
      }
    }
  }

  /**
   * Dispatches events to registered listeners.
   * @private
   */
  _emit(eventType, payload, envelope) {
    if (this.eventListeners.has(eventType)) {
      for (const handler of this.eventListeners.get(eventType)) {
        try {
          if (envelope !== undefined) {
            handler(payload, envelope);
          } else {
            handler(payload);
          }
        } catch (err) {
          console.error(`Error in event listener for ${eventType}:`, err);
        }
      }
    }
  }

  /**
   * Cleanly closes the WebSocket connection and cleans up all state.
   */
  disconnect() {
    this.status = 'DISCONNECTED';
    this.isDegraded = false;
    this.reconnectAttempts = 0;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close(1000, 'Client Logout');
      } catch {}
      this.ws = null;
    }

    this.roomRefCounts.clear();
    this.roomListeners.clear();
    this.eventListeners.clear();
  }
}

export const realtimeClient = new RealtimeClient();
