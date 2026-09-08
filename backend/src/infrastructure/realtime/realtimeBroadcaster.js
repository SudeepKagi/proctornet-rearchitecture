/**
 * @file realtimeBroadcaster.js
 * @description Realtime event broadcaster with in-process ChannelManager routing and optional Redis Pub/Sub fan-out.
 */

import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { defaultChannelManager } from './channelManager.js';
import { createRedisClient } from '../redis/client.js';
import {
  wsMessagesSentTotal,
  wsRedisSyncErrorsTotal,
  wsBroadcastErrorsTotal
} from '../metrics/registry.js';

export const REDIS_WS_CHANNEL = 'proctornet:ws:events';
export const MAX_BUFFERED_AMOUNT_BYTES = 1048576; // 1 MB TCP socket buffer threshold
export const MAX_OUTBOUND_QUEUE_MESSAGES = 100;  // max pending application sends per socket

export class RealtimeBroadcaster {
  /**
   * @param {object} [options]
   * @param {import('./channelManager.js').ChannelManager} [options.channelManager]
   * @param {boolean} [options.enableRedis]
   */
  constructor(options = {}) {
    this.channelManager = options.channelManager || defaultChannelManager;
    this.enableRedis = options.enableRedis !== undefined ? options.enableRedis : config.REDIS_ENABLED;

    /** @type {'HEALTHY' | 'DEGRADED'} */
    this.state = 'HEALTHY';

    this.redisPub = null;
    this.redisSub = null;
    this.instanceId = randomUUID();
    this.isInitialized = false;
  }

  /**
   * Returns current synchronization health state: 'HEALTHY' | 'DEGRADED'.
   * @returns {'HEALTHY' | 'DEGRADED'}
   */
  getState() {
    return this.state;
  }

  /**
   * Initializes Redis Pub/Sub synchronization if enabled.
   */
  async init() {
    if (!this.enableRedis) {
      this.isInitialized = true;
      return;
    }

    try {
      this.redisPub = createRedisClient({
        enableOfflineQueue: false
      });
      this.redisSub = createRedisClient({
        enableOfflineQueue: false
      });

      this.redisSub.on('message', (channel, message) => {
        if (channel === REDIS_WS_CHANNEL) {
          this._handleRedisMessage(message);
        }
      });

      this.redisSub.on('error', (err) => {
        logger.warn({ err: err.message }, 'Redis Pub/Sub subscriber error; transitioning to DEGRADED state');
        this._transitionToDegraded('REDIS_SUBSCRIBER_ERROR');
      });

      this.redisSub.on('ready', () => {
        if (this.state === 'DEGRADED') {
          this._transitionToHealthy();
        }
      });

      await this.redisSub.subscribe(REDIS_WS_CHANNEL);
      this.isInitialized = true;
      logger.info({ channel: REDIS_WS_CHANNEL }, 'RealtimeBroadcaster Redis Pub/Sub initialized');
    } catch (err) {
      logger.warn(
        { err: err.message },
        'Failed to initialize Redis Pub/Sub; operating in local in-process degraded mode'
      );
      this._transitionToDegraded('REDIS_INIT_FAILED');
      this.isInitialized = true;
    }
  }

  /**
   * Transitions distributor state to DEGRADED and alerts local connected sockets.
   * @param {string} reason
   */
  _transitionToDegraded(reason) {
    if (this.state === 'DEGRADED') return;

    this.state = 'DEGRADED';
    wsRedisSyncErrorsTotal.inc();

    logger.warn({ reason }, 'WebSocket realtime distribution degraded; cross-node sync unavailable');

    // Broadcast degradation alert to all currently connected local sockets
    this._broadcastSystemNotice('system:realtime_degraded', {
      degraded: true,
      reason: 'CROSS_NODE_SYNC_UNAVAILABLE'
    });
  }

  /**
   * Transitions distributor state back to HEALTHY and alerts local connected sockets.
   */
  _transitionToHealthy() {
    if (this.state === 'HEALTHY') return;

    this.state = 'HEALTHY';
    logger.info('WebSocket realtime distribution recovered to HEALTHY state');

    this._broadcastSystemNotice('system:realtime_recovered', {
      degraded: false,
      status: 'HEALTHY'
    });
  }

  /**
   * Broadcasts a direct system notice to all local connected sockets.
   * @param {string} type
   * @param {object} payload
   */
  _broadcastSystemNotice(type, payload) {
    const envelope = {
      eventId: randomUUID(),
      type,
      version: '1.0',
      timestamp: new Date().toISOString(),
      payload
    };
    const serialized = JSON.stringify(envelope);

    for (const ws of this.channelManager.getAllSockets()) {
      this._sendRaw(ws, serialized, type);
    }
  }

  /**
   * Handles an incoming message from the Redis Pub/Sub bus.
   * @param {string} raw
   */
  _handleRedisMessage(raw) {
    try {
      const data = JSON.parse(raw);
      // Deduplicate: ignore events originally published by this instance
      if (data.originInstanceId === this.instanceId) {
        return;
      }
      if (data.envelope && data.room) {
        this._dispatchToLocalRoom(data.room, data.envelope);
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to parse Redis Pub/Sub realtime message');
    }
  }

  /**
   * Broadcasts an event to all subscribers in a room.
   *
   * @param {string} room - Target room identifier (e.g. session:<id>)
   * @param {string} eventType - Event type string (e.g. proctoring:flag_raised)
   * @param {object} payload - Validated event payload
   * @param {object} [options]
   * @param {string} [options.traceId]
   * @returns {Promise<object>} Constructed event envelope
   */
  async broadcastToRoom(room, eventType, payload, options = {}) {
    const envelope = {
      eventId: randomUUID(),
      type: eventType,
      version: '1.0',
      timestamp: new Date().toISOString(),
      room,
      payload,
      traceId: options.traceId
    };

    // 1. Deliver to all local sockets subscribed to this room on this instance
    this._dispatchToLocalRoom(room, envelope);

    // 2. Publish to Redis for cross-node fan-out if enabled
    if (this.enableRedis && this.redisPub && this.state === 'HEALTHY') {
      try {
        const message = JSON.stringify({
          originInstanceId: this.instanceId,
          room,
          envelope
        });
        await this.redisPub.publish(REDIS_WS_CHANNEL, message);
      } catch (err) {
        logger.warn({ err: err.message, room, eventType }, 'Failed to publish event to Redis Pub/Sub');
        this._transitionToDegraded('REDIS_PUBLISH_FAILED');
      }
    }

    return envelope;
  }

  /**
   * Broadcasts to an exam session's invigilator room (`session:${sessionId}`).
   * @param {string} sessionId
   * @param {string} eventType
   * @param {object} payload
   * @param {object} [options]
   */
  async broadcastToSession(sessionId, eventType, payload, options = {}) {
    return this.broadcastToRoom(`session:${sessionId}`, eventType, payload, options);
  }

  /**
   * Broadcasts to an exam session's candidate room (`session:${sessionId}:candidate`).
   * @param {string} sessionId
   * @param {string} eventType
   * @param {object} payload
   * @param {object} [options]
   */
  async broadcastToCandidateSession(sessionId, eventType, payload, options = {}) {
    return this.broadcastToRoom(`session:${sessionId}:candidate`, eventType, payload, options);
  }

  /**
   * Broadcasts to a candidate's attempt room (`attempt:${attemptId}`).
   * @param {string} attemptId
   * @param {string} eventType
   * @param {object} payload
   * @param {object} [options]
   */
  async sendToAttempt(attemptId, eventType, payload, options = {}) {
    return this.broadcastToRoom(`attempt:${attemptId}`, eventType, payload, options);
  }

  /**
   * Sends an event directly to a single socket.
   * @param {import('ws').WebSocket} ws
   * @param {string} eventType
   * @param {object} payload
   * @param {object} [options]
   */
  sendDirect(ws, eventType, payload, options = {}) {
    const envelope = {
      eventId: randomUUID(),
      type: eventType,
      version: '1.0',
      timestamp: new Date().toISOString(),
      payload,
      traceId: options.traceId
    };
    const serialized = JSON.stringify(envelope);
    this._sendRaw(ws, serialized, eventType);
    return envelope;
  }

  /**
   * Dispatches an envelope to all local sockets in a room.
   * @param {string} room
   * @param {object} envelope
   */
  _dispatchToLocalRoom(room, envelope) {
    const subscribers = this.channelManager.getSubscribers(room);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const serialized = JSON.stringify(envelope);
    for (const ws of subscribers) {
      this._sendRaw(ws, serialized, envelope.type);
    }
  }

  /**
   * Sends raw string payload to a WebSocket with real server-side backpressure checks.
   *
   * Two complementary limits are enforced:
   *
   *  1. TCP socket buffer (ws._socket.bufferSize): bytes pending in the kernel
   *     write buffer. When this exceeds MAX_BUFFERED_AMOUNT_BYTES (1 MB) the
   *     client is not consuming data fast enough and the socket is terminated.
   *     Note: ws.bufferedAmount on the server-side ws library always returns 0
   *     because it mirrors the browser API semantics which do not apply here.
   *     ws._socket.bufferSize is the correct server-side backpressure indicator.
   *
   *  2. Application outbound queue counter (ws._pendingSends): counts send()
   *     calls whose completion callback has not yet fired. Terminated when the
   *     pending count exceeds MAX_OUTBOUND_QUEUE_MESSAGES (100).
   *
   * @param {import('ws').WebSocket} ws
   * @param {string} serialized
   * @param {string} eventType
   */
  _sendRaw(ws, serialized, eventType) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      wsMessagesSentTotal.inc({ type: eventType, status: 'dropped' });
      return;
    }

    // Initialize per-socket pending-send counter lazily.
    if (typeof ws._pendingSends !== 'number') {
      ws._pendingSends = 0;
    }

    // Backpressure check 1: kernel TCP socket buffer (real server-side indicator).
    const socketBufferSize = ws._socket?.bufferSize ?? 0;
    if (socketBufferSize > MAX_BUFFERED_AMOUNT_BYTES) {
      logger.warn(
        { socketBufferSize, max: MAX_BUFFERED_AMOUNT_BYTES },
        'WebSocket client TCP buffer exceeded 1 MB threshold; terminating slow client socket'
      );
      wsMessagesSentTotal.inc({ type: eventType, status: 'dropped' });
      try {
        ws.close(1008, 'Outbound Buffer Threshold Exceeded');
      } catch {
        ws.terminate();
      }
      return;
    }

    // Backpressure check 2: application-level outbound queue depth.
    if (ws._pendingSends >= MAX_OUTBOUND_QUEUE_MESSAGES) {
      logger.warn(
        { pendingSends: ws._pendingSends, max: MAX_OUTBOUND_QUEUE_MESSAGES },
        'WebSocket client outbound queue exceeded 100 pending messages; terminating slow client socket'
      );
      wsMessagesSentTotal.inc({ type: eventType, status: 'dropped' });
      try {
        ws.close(1008, 'Outbound Queue Threshold Exceeded');
      } catch {
        ws.terminate();
      }
      return;
    }

    ws._pendingSends += 1;
    try {
      ws.send(serialized, (err) => {
        ws._pendingSends = Math.max(0, (ws._pendingSends ?? 1) - 1);
        if (err) {
          wsMessagesSentTotal.inc({ type: eventType, status: 'dropped' });
        } else {
          wsMessagesSentTotal.inc({ type: eventType, status: 'delivered' });
        }
      });
    } catch {
      ws._pendingSends = Math.max(0, (ws._pendingSends ?? 1) - 1);
      wsMessagesSentTotal.inc({ type: eventType, status: 'dropped' });
    }
  }

  /**
   * Closes Redis Pub/Sub client connections during shutdown.
   */
  async close() {
    if (this.redisSub) {
      try {
        await this.redisSub.unsubscribe(REDIS_WS_CHANNEL);
        await this.redisSub.quit();
      } catch {
        this.redisSub.disconnect(false);
      } finally {
        this.redisSub = null;
      }
    }

    if (this.redisPub) {
      try {
        await this.redisPub.quit();
      } catch {
        this.redisPub.disconnect(false);
      } finally {
        this.redisPub = null;
      }
    }

    this.state = 'HEALTHY';
    this.isInitialized = false;
  }
}

export const defaultBroadcaster = new RealtimeBroadcaster();
