/**
 * @file sfuManager.js
 * @description Central SFU manager orchestrating mediasoup C++ worker pool, deterministic session
 * pinning, per-worker generation epoch fencing, and crash recovery (Phase 17).
 */

import os from 'node:os';
import mediasoup from 'mediasoup';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { getRedisClient } from '../redis/client.js';
import {
  wsMediaTransportsActive,
  wsMediaProducersActive,
  wsMediaConsumersActive,
  wsMediaFailuresTotal,
  wsMediaIceRestartsTotal
} from '../metrics/registry.js';

/**
 * Standard supported media codecs for mediasoup Routers.
 */
export const defaultMediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000
    }
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1
    }
  }
];

/**
 * Deterministic hash function (CRC32-style integer hashing) to pin session to worker index.
 * @param {string} str
 * @returns {number}
 */
export function deterministicHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export class SfuManager {
  constructor() {
    this.workerContexts = [];
    this.isInitialized = false;
    this.isShuttingDown = false;

    // Ephemeral in-memory registries
    this.sessions = new Map(); // sessionId -> { sessionId, router, workerId, workerGeneration, status, transports: Map, producers: Map, consumers: Map }
    this.transports = new Map(); // transportId -> { id, transport, sessionId, workerId, workerGeneration, connectionId, userId, direction, ... }
    this.producers = new Map(); // producerId -> { id, producer, sessionId, transportId, workerId, workerGeneration, trackType, kind, connectionId, userId }
    this.consumers = new Map(); // consumerId -> { id, consumer, sessionId, transportId, producerId, workerId, workerGeneration, trackType, connectionId, userId }
    this.connectionTransports = new Map(); // connectionId -> Set<transportId>

    // External reset broadcaster callback (e.g. from websocketServer/realtimeBroadcaster)
    this.sessionResetBroadcaster = null;
  }

  /**
   * Set callback for session reset notifications.
   * @param {Function} fn - (sessionId, payload) => Promise<void>
   */
  setSessionResetBroadcaster(fn) {
    this.sessionResetBroadcaster = fn;
  }

  /**
   * Initializes the mediasoup worker pool.
   */
  async init() {
    if (this.isInitialized) {
      return;
    }

    if (!config.MEDIA_ENABLED) {
      logger.info('SFU media plane is disabled (MEDIA_ENABLED=false)');
      return;
    }

    const detectedCores = os.availableParallelism?.() || os.cpus().length || 1;
    const workerCount = config.MEDIASOUP_NUM_WORKERS ?? Math.min(Math.max(detectedCores, 1), 4);

    logger.info({ workerCount }, 'Initializing mediasoup SFU worker pool');

    this.workerContexts = [];

    for (let i = 0; i < workerCount; i++) {
      const worker = await this._spawnWorker(i);
      this.workerContexts.push({
        workerId: i,
        worker,
        generation: 1,
        status: 'ACTIVE', // 'ACTIVE' | 'RESETTING' | 'DEAD' | 'STARTING'
        assignedSessions: new Set()
      });
    }

    this.isInitialized = true;
    logger.info({ workerCount }, 'mediasoup SFU worker pool successfully initialized');
  }

  /**
   * Internal helper to spawn a mediasoup worker process.
   * @private
   */
  async _spawnWorker(workerId) {
    const worker = await mediasoup.createWorker({
      rtcMinPort: config.MEDIA_MIN_PORT,
      rtcMaxPort: config.MEDIA_MAX_PORT,
      logLevel: 'warn',
      logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp']
    });

    worker.on('died', (error) => {
      this._handleWorkerDied(workerId, error);
    });

    return worker;
  }

  /**
   * Handles mediasoup worker crash / unexpected exit with per-worker generation fencing.
   * @private
   */
  async _handleWorkerDied(workerId, error) {
    if (this.isShuttingDown) {
      return;
    }

    const ctx = this.workerContexts[workerId];
    if (!ctx) {
      return;
    }

    // Step 1 & 2: Mark ONLY affected worker as RESETTING and increment ONLY its generation
    ctx.status = 'RESETTING';
    ctx.generation += 1;
    const newEpoch = ctx.generation;

    wsMediaFailuresTotal.inc({ reason: 'WORKER_DIED' });
    logger.error(
      {
        workerId,
        newEpoch,
        err: error?.message || error,
        affectedSessionsCount: ctx.assignedSessions.size
      },
      'SFU_WORKER_DIED: Worker crashed. Starting per-worker crash recovery and generation fencing.'
    );

    // Mark ONLY assigned sessions as RESETTING
    const affectedSessions = Array.from(ctx.assignedSessions);
    for (const sessionId of affectedSessions) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'RESETTING';
      }
    }

    try {
      // Step 4: Scrub generation N_i objects from memory for this worker
      for (const [transportId, t] of this.transports.entries()) {
        if (t.workerId === workerId) {
          try {
            t.transport?.close();
          } catch {
            // ignore
          }
          this.transports.delete(transportId);
          if (t.direction === 'send') {
            wsMediaTransportsActive.dec({ direction: 'send' });
          } else if (t.direction === 'recv') {
            wsMediaTransportsActive.dec({ direction: 'recv' });
          }
        }
      }

      for (const [producerId, p] of this.producers.entries()) {
        if (p.workerId === workerId) {
          this.producers.delete(producerId);
          wsMediaProducersActive.dec({ track_type: p.trackType || 'webcam', kind: p.kind || 'video' });
        }
      }

      for (const [consumerId, c] of this.consumers.entries()) {
        if (c.workerId === workerId) {
          this.consumers.delete(consumerId);
          wsMediaConsumersActive.dec({ track_type: c.trackType || 'webcam' });
        }
      }

      // Step 5: Ensure previous worker process is closed and respawn fresh worker
      try {
        ctx.worker?.close();
      } catch {}
      const newWorker = await this._spawnWorker(workerId);
      ctx.worker = newWorker;


      // Step 6: Recreate Routers for assigned sessions under generation N_i + 1
      for (const sessionId of affectedSessions) {
        try {
          const router = await newWorker.createRouter({ mediaCodecs: defaultMediaCodecs });
          const sessionObj = {
            sessionId,
            router,
            workerId,
            workerGeneration: newEpoch,
            status: 'ACTIVE',
            transports: new Map(),
            producers: new Map(),
            consumers: new Map()
          };
          this.sessions.set(sessionId, sessionObj);

          // Step 7: Clear stale producer IDs for affected session from Redis registry
          await this._clearSessionFromRedis(sessionId);

          // Step 8: Broadcast session reset announcement to clients
          const resetPayload = {
            sessionId,
            workerId,
            epoch: newEpoch
          };

          if (this.sessionResetBroadcaster) {
            await this.sessionResetBroadcaster(sessionId, resetPayload).catch((err) => {
              logger.warn({ err: err.message, sessionId }, 'Failed to broadcast media:session_reset to WebSocket');
            });
          }

          // Also publish on Redis pub/sub if available
          const redis = getRedisClient();
          if (redis) {
            await redis
              .publish(
                'media:events',
                JSON.stringify({
                  type: 'media:session_reset',
                  sessionId,
                  payload: resetPayload
                })
              )
              .catch(() => {});
          }
        } catch (routerErr) {
          logger.error({ sessionId, workerId, err: routerErr.message }, 'Failed to recreate session router after worker crash');
        }
      }

      // Mark worker back to ACTIVE
      ctx.status = 'ACTIVE';
      logger.info({ workerId, newEpoch, restoredSessions: affectedSessions.length }, 'SFU worker recovery completed successfully');
    } catch (recoveryErr) {
      ctx.status = 'DEAD';
      logger.error({ workerId, err: recoveryErr.message }, 'SFU worker crash recovery failed fatally');
    }
  }

  /**
   * Helper to delete session producer registry in Redis.
   * @private
   */
  async _clearSessionFromRedis(sessionId) {
    try {
      const redis = getRedisClient();
      if (redis) {
        await redis.del(`media:session:${sessionId}`);
      }
    } catch (err) {
      logger.warn({ sessionId, err: err.message }, 'Failed to clear session from Redis during crash recovery');
    }
  }

  /**
   * Resolves the assigned worker index for a given session ID.
   * @param {string} sessionId
   * @returns {number}
   */
  getWorkerIndexForSession(sessionId) {
    if (!this.workerContexts.length) {
      throw new Error('SFU manager has no active workers');
    }
    return deterministicHash(sessionId) % this.workerContexts.length;
  }

  /**
   * Asserts worker and session generation health; throws standard fenced error if resetting or stale.
   * @param {string} sessionId
   * @param {number} [clientWorkerId]
   * @param {number} [clientGeneration]
   */
  assertWorkerAndSession(sessionId, clientWorkerId, clientGeneration) {
    const workerIndex = this.getWorkerIndexForSession(sessionId);
    const workerCtx = this.workerContexts[workerIndex];

    if (!workerCtx || workerCtx.status === 'DEAD') {
      const err = new Error('SFU media worker unavailable');
      err.code = 'MEDIA_SFU_UNAVAILABLE';
      throw err;
    }

    if (workerCtx.status === 'RESETTING') {
      const err = new Error('Media worker reset in progress; please await session reset announcement');
      err.code = 'MEDIA_SESSION_RESETTING';
      err.workerId = workerIndex;
      err.epoch = workerCtx.generation;
      throw err;
    }

    const session = this.sessions.get(sessionId);
    if (session && session.status === 'RESETTING') {
      const err = new Error('Media session reset in progress; please await session reset announcement');
      err.code = 'MEDIA_SESSION_RESETTING';
      err.workerId = workerIndex;
      err.epoch = workerCtx.generation;
      throw err;
    }

    if (clientWorkerId !== undefined && clientWorkerId !== workerIndex) {
      const err = new Error('Worker ID mismatch for session');
      err.code = 'MEDIA_WORKER_MISMATCH';
      throw err;
    }

    if (clientGeneration !== undefined && clientGeneration < workerCtx.generation) {
      const err = new Error('Media signaling operation referenced stale worker generation');
      err.code = 'MEDIA_SESSION_RESETTING';
      err.workerId = workerIndex;
      err.epoch = workerCtx.generation;
      throw err;
    }

    return { workerIndex, workerCtx, session };
  }

  /**
   * Retrieves or creates a mediasoup Router pinned to the session's designated worker.
   * @param {string} sessionId
   * @returns {Promise<{ router: any, workerId: number, workerGeneration: number }>}
   */
  async getOrCreateRouter(sessionId) {
    const { workerIndex, workerCtx, session } = this.assertWorkerAndSession(sessionId);

    if (session && session.router && !session.router.closed) {
      return {
        router: session.router,
        workerId: workerIndex,
        workerGeneration: session.workerGeneration
      };
    }

    // Check worker capacity (overload limit: 250 active WebRtcTransports)
    let activeTransportsOnWorker = 0;
    for (const t of this.transports.values()) {
      if (t.workerId === workerIndex) {
        activeTransportsOnWorker++;
      }
    }

    if (activeTransportsOnWorker >= 250) {
      const err = new Error('Server media capacity reached for assigned worker');
      err.code = 'SERVER_BUSY';
      throw err;
    }

    const router = await workerCtx.worker.createRouter({ mediaCodecs: defaultMediaCodecs });
    workerCtx.assignedSessions.add(sessionId);

    const sessionObj = {
      sessionId,
      router,
      workerId: workerIndex,
      workerGeneration: workerCtx.generation,
      status: 'ACTIVE',
      transports: new Map(),
      producers: new Map(),
      consumers: new Map()
    };

    this.sessions.set(sessionId, sessionObj);

    return {
      router,
      workerId: workerIndex,
      workerGeneration: workerCtx.generation
    };
  }

  /**
   * Creates a WebRtcTransport on the session router.
   */
  async createTransport(sessionId, connectionId, userId, direction) {
    const { router, workerId, workerGeneration } = await this.getOrCreateRouter(sessionId);

    const listenIps = [
      {
        ip: config.MEDIA_LISTEN_IP,
        announcedIp: config.MEDIA_ANNOUNCED_IP || undefined
      }
    ];

    const transport = await router.createWebRtcTransport({
      listenIps,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000
    });

    const transportObj = {
      id: transport.id,
      transport,
      sessionId,
      workerId,
      workerGeneration,
      connectionId,
      userId,
      direction
    };

    this.transports.set(transport.id, transportObj);

    const session = this.sessions.get(sessionId);
    if (session) {
      session.transports.set(transport.id, transportObj);
    }

    if (!this.connectionTransports.has(connectionId)) {
      this.connectionTransports.set(connectionId, new Set());
    }
    this.connectionTransports.get(connectionId).add(transport.id);

    wsMediaTransportsActive.inc({ direction });

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    };
  }

  /**
   * Connects a WebRtcTransport with client DTLS parameters.
   */
  async connectTransport(transportId, dtlsParameters) {
    const transportObj = this.transports.get(transportId);
    if (!transportObj || transportObj.transport.closed) {
      const err = new Error('Transport not found or already closed');
      err.code = 'TRANSPORT_NOT_FOUND';
      throw err;
    }

    this.assertWorkerAndSession(transportObj.sessionId, transportObj.workerId, transportObj.workerGeneration);

    await transportObj.transport.connect({ dtlsParameters });
    return { success: true };
  }

  /**
   * Closes a single WebRtcTransport and cleans up associated state.
   * @param {string} transportId
   * @returns {Promise<boolean>}
   */
  async closeTransport(transportId) {
    const transportObj = this.transports.get(transportId);
    if (!transportObj) return false;

    try {
      transportObj.transport?.close();
    } catch {}

    this.transports.delete(transportId);
    if (transportObj.direction === 'send') {
      wsMediaTransportsActive.dec({ direction: 'send' });
    } else if (transportObj.direction === 'recv') {
      wsMediaTransportsActive.dec({ direction: 'recv' });
    }

    const session = this.sessions.get(transportObj.sessionId);
    if (session) {
      session.transports.delete(transportId);
    }

    return true;
  }

  /**
   * Produces a media track on a sending WebRtcTransport.

   */
  async produce(sessionId, transportId, kind, rtpParameters, appData = {}, connectionId, userId) {
    const transportObj = this.transports.get(transportId);
    if (!transportObj || transportObj.transport.closed) {
      const err = new Error('Transport not found or already closed');
      err.code = 'TRANSPORT_NOT_FOUND';
      throw err;
    }

    if (transportObj.direction !== 'send') {
      const err = new Error('Cannot produce on a receive transport');
      err.code = 'INVALID_DIRECTION';
      throw err;
    }

    this.assertWorkerAndSession(sessionId, transportObj.workerId, transportObj.workerGeneration);

    // Limit candidate producers: maximum 3 tracks (1 webcam, 1 mic, 1 screen)
    let candidateProducersCount = 0;
    const trackType = appData?.trackType || 'webcam';

    for (const p of this.producers.values()) {
      if (p.sessionId === sessionId && p.userId === userId) {
        candidateProducersCount++;
        if (p.trackType === trackType) {
          // Close existing track of same type to prevent orphaned tracks
          try {
            p.producer?.close();
          } catch {}
          this.producers.delete(p.id);
          candidateProducersCount--;
        }
      }
    }

    if (candidateProducersCount >= 3) {
      const err = new Error('Maximum candidate tracks exceeded (maximum 3)');
      err.code = 'MAX_PRODUCERS_EXCEEDED';
      throw err;
    }

    const producer = await transportObj.transport.produce({
      kind,
      rtpParameters,
      appData: { ...appData, trackType, userId }
    });

    const producerObj = {
      id: producer.id,
      producer,
      sessionId,
      transportId,
      workerId: transportObj.workerId,
      workerGeneration: transportObj.workerGeneration,
      trackType,
      kind,
      connectionId,
      userId
    };

    this.producers.set(producer.id, producerObj);

    const session = this.sessions.get(sessionId);
    if (session) {
      session.producers.set(producer.id, producerObj);
    }

    wsMediaProducersActive.inc({ track_type: trackType, kind });

    // Store in ephemeral Redis registry and publish producer_added
    try {
      const redis = getRedisClient();
      if (redis) {
        const metadata = JSON.stringify({
          producerId: producer.id,
          trackType,
          kind,
          workerId: transportObj.workerId,
          workerGeneration: transportObj.workerGeneration,
          userId,
          createdAt: new Date().toISOString()
        });

        await redis.hset(`media:session:${sessionId}`, producer.id, metadata);
        await redis.expire(`media:session:${sessionId}`, 21600); // 6-hour TTL

        await redis.publish(
          'media:events',
          JSON.stringify({
            type: 'media:producer_added',
            sessionId,
            producerId: producer.id,
            trackType,
            kind,
            userId,
            workerId: transportObj.workerId,
            workerGeneration: transportObj.workerGeneration
          })
        );
      }
    } catch (redisErr) {
      logger.warn({ sessionId, producerId: producer.id, err: redisErr.message }, 'Redis non-authoritative publish warning');
    }

    return { id: producer.id };
  }

  /**
   * Consumes a media track on a receiving WebRtcTransport.
   */
  async consume(sessionId, transportId, producerId, rtpCapabilities, connectionId, userId) {
    const transportObj = this.transports.get(transportId);
    if (!transportObj || transportObj.transport.closed) {
      const err = new Error('Transport not found or already closed');
      err.code = 'TRANSPORT_NOT_FOUND';
      throw err;
    }

    if (transportObj.direction !== 'recv') {
      const err = new Error('Cannot consume on a send transport');
      err.code = 'INVALID_DIRECTION';
      throw err;
    }

    this.assertWorkerAndSession(sessionId, transportObj.workerId, transportObj.workerGeneration);

    const session = this.sessions.get(sessionId);
    if (!session || !session.router) {
      const err = new Error('Session router not found');
      err.code = 'SESSION_NOT_FOUND';
      throw err;
    }

    const producerObj = this.producers.get(producerId);
    if (!producerObj || producerObj.producer.closed) {
      const err = new Error('Producer not found or closed');
      err.code = 'PRODUCER_NOT_FOUND';
      throw err;
    }

    if (!session.router.canConsume({ producerId, rtpCapabilities })) {
      const err = new Error('Client cannot consume producer with given RTP capabilities');
      err.code = 'CANNOT_CONSUME';
      throw err;
    }

    // Limit maximum viewers per candidate: hard cap of 5 simultaneous consumers per producer
    let viewerCount = 0;
    for (const c of this.consumers.values()) {
      if (c.producerId === producerId) {
        viewerCount++;
      }
    }

    if (viewerCount >= 5) {
      const err = new Error('Maximum simultaneous viewers reached for candidate producer');
      err.code = 'MAX_VIEWERS_EXCEEDED';
      throw err;
    }

    const consumer = await transportObj.transport.consume({
      producerId,
      rtpCapabilities,
      paused: false
    });

    const consumerObj = {
      id: consumer.id,
      consumer,
      sessionId,
      transportId,
      producerId,
      workerId: transportObj.workerId,
      workerGeneration: transportObj.workerGeneration,
      trackType: producerObj.trackType,
      kind: consumer.kind,
      connectionId,
      userId
    };

    this.consumers.set(consumer.id, consumerObj);
    session.consumers.set(consumer.id, consumerObj);

    wsMediaConsumersActive.inc({ track_type: producerObj.trackType });

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type
    };
  }

  /**
   * Consumes a batch of producers with batched partial-success semantics.
   * Root-level rtpCapabilities, deduplication, non-rollback.
   */
  async consumeBatch(sessionId, transportId, producerIds, rtpCapabilities, connectionId, userId) {
    const uniqueProducerIds = [...new Set(producerIds)];
    const results = [];

    for (const prodId of uniqueProducerIds) {
      try {
        const consumed = await this.consume(sessionId, transportId, prodId, rtpCapabilities, connectionId, userId);
        results.push({
          producerId: prodId,
          status: 'fulfilled',
          consumerId: consumed.id,
          kind: consumed.kind,
          rtpParameters: consumed.rtpParameters,
          type: consumed.type
        });
      } catch (err) {
        results.push({
          producerId: prodId,
          status: 'rejected',
          error: err.code || 'CONSUME_FAILED',
          message: err.message
        });
      }
    }

    return {
      transportId,
      results
    };
  }

  /**
   * Sets preferred simulcast layers for a video consumer.
   */
  async setConsumerLayers(consumerId, spatialLayer, temporalLayer) {
    const consumerObj = this.consumers.get(consumerId);
    if (!consumerObj || consumerObj.consumer.closed) {
      const err = new Error('Consumer not found');
      err.code = 'CONSUMER_NOT_FOUND';
      throw err;
    }

    await consumerObj.consumer.setPreferredLayers({ spatialLayer, temporalLayer });
    return { success: true };
  }

  /**
   * Pauses an active consumer.
   */
  async pauseConsumer(consumerId) {
    const consumerObj = this.consumers.get(consumerId);
    if (!consumerObj || consumerObj.consumer.closed) {
      const err = new Error('Consumer not found');
      err.code = 'CONSUMER_NOT_FOUND';
      throw err;
    }

    await consumerObj.consumer.pause();
    return { success: true };
  }

  /**
   * Resumes a paused consumer.
   */
  async resumeConsumer(consumerId) {
    const consumerObj = this.consumers.get(consumerId);
    if (!consumerObj || consumerObj.consumer.closed) {
      const err = new Error('Consumer not found');
      err.code = 'CONSUMER_NOT_FOUND';
      throw err;
    }

    await consumerObj.consumer.resume();
    return { success: true };
  }

  /**
   * Executes ICE restart on an existing transport.
   */
  async restartIce(transportId) {
    const transportObj = this.transports.get(transportId);
    if (!transportObj || transportObj.transport.closed) {
      const err = new Error('Transport not found');
      err.code = 'TRANSPORT_NOT_FOUND';
      throw err;
    }

    const iceParameters = await transportObj.transport.restartIce();
    wsMediaIceRestartsTotal.inc();
    return { iceParameters };
  }

  /**
   * Closes a producer explicitly.
   */
  async closeProducer(producerId) {
    const producerObj = this.producers.get(producerId);
    if (!producerObj) {
      return { success: true };
    }

    try {
      producerObj.producer?.close();
    } catch {}

    this.producers.delete(producerId);
    wsMediaProducersActive.dec({ track_type: producerObj.trackType || 'webcam', kind: producerObj.kind || 'video' });

    // Remove from session
    const session = this.sessions.get(producerObj.sessionId);
    if (session) {
      session.producers.delete(producerId);
    }

    // Evict from Redis
    try {
      const redis = getRedisClient();
      if (redis) {
        await redis.hdel(`media:session:${producerObj.sessionId}`, producerId);
        await redis.publish(
          'media:events',
          JSON.stringify({
            type: 'media:producer_removed',
            sessionId: producerObj.sessionId,
            producerId
          })
        );
      }
    } catch {}

    return { success: true };
  }

  /**
   * Idempotent teardown of all media transports, producers, and consumers associated with a connection.
   * Invoked on ws.on('close') or session revocation.
   * @param {string} connectionId
   */
  async closeTransportsForConnection(connectionId) {
    const transportIds = this.connectionTransports.get(connectionId);
    if (!transportIds || transportIds.size === 0) {
      this.connectionTransports.delete(connectionId);
      return;
    }

    for (const transportId of Array.from(transportIds)) {
      const transportObj = this.transports.get(transportId);
      if (!transportObj) {
        continue;
      }

      // 1. Close producers on this transport
      for (const [prodId, prodObj] of this.producers.entries()) {
        if (prodObj.transportId === transportId) {
          try {
            prodObj.producer?.close();
          } catch {}
          this.producers.delete(prodId);
          wsMediaProducersActive.dec({ track_type: prodObj.trackType || 'webcam', kind: prodObj.kind || 'video' });

          const session = this.sessions.get(prodObj.sessionId);
          if (session) {
            session.producers.delete(prodId);
          }

          // Evict from Redis
          try {
            const redis = getRedisClient();
            if (redis) {
              await redis.hdel(`media:session:${prodObj.sessionId}`, prodId);
              await redis.publish(
                'media:events',
                JSON.stringify({
                  type: 'media:producer_removed',
                  sessionId: prodObj.sessionId,
                  producerId: prodId
                })
              );
            }
          } catch {}
        }
      }

      // 2. Close consumers on this transport
      for (const [consId, consObj] of this.consumers.entries()) {
        if (consObj.transportId === transportId) {
          try {
            consObj.consumer?.close();
          } catch {}
          this.consumers.delete(consId);
          wsMediaConsumersActive.dec({ track_type: consObj.trackType || 'webcam' });

          const session = this.sessions.get(consObj.sessionId);
          if (session) {
            session.consumers.delete(consId);
          }
        }
      }

      // 3. Close the transport itself
      try {
        transportObj.transport?.close();
      } catch {}

      this.transports.delete(transportId);
      if (transportObj.direction === 'send') {
        wsMediaTransportsActive.dec({ direction: 'send' });
      } else if (transportObj.direction === 'recv') {
        wsMediaTransportsActive.dec({ direction: 'recv' });
      }

      const session = this.sessions.get(transportObj.sessionId);
      if (session) {
        session.transports.delete(transportId);
      }
    }

    this.connectionTransports.delete(connectionId);
  }

  /**
   * Reconciles in-memory router state with Redis metadata on reconnect.
   */
  async reconcileWithRedis() {
    try {
      const redis = getRedisClient();
      if (!redis) return;

      for (const [sessionId, session] of this.sessions.entries()) {
        if (!session.router || session.status === 'RESETTING') continue;

        const redisProducers = await redis.hgetall(`media:session:${sessionId}`);
        if (!redisProducers) continue;

        for (const [prodId, dataStr] of Object.entries(redisProducers)) {
          try {
            const parsed = JSON.parse(dataStr);
            const localProducer = this.producers.get(prodId);

            if (!localProducer || localProducer.workerGeneration < parsed.workerGeneration) {
              // Stale key, evict
              await redis.hdel(`media:session:${sessionId}`, prodId);
            }
          } catch {
            await redis.hdel(`media:session:${sessionId}`, prodId);
          }
        }
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Redis reconciliation warning');
    }
  }

  /**
   * Graceful shutdown of all workers and routers.
   */
  async close() {
    this.isShuttingDown = true;
    logger.info('Shutting down mediasoup SFU worker pool');

    for (const ctx of this.workerContexts) {
      try {
        ctx.worker?.close();
      } catch {}
    }

    this.workerContexts = [];
    this.sessions.clear();
    this.transports.clear();
    this.producers.clear();
    this.consumers.clear();
    this.connectionTransports.clear();
    this.isInitialized = false;
  }
}

// Export singleton instance
export const defaultSfuManager = new SfuManager();
