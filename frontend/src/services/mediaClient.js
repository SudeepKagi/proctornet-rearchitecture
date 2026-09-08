/**
 * @file mediaClient.js
 * @description Frontend WebRTC / mediasoup-client service singleton managing local Device,
 * send/recv transports, simulcast encoding, and batched consumer subscription (Phase 17).
 */

import { Device } from 'mediasoup-client';
import { realtimeClient } from './realtimeClient.js';

export class MediaClient {
  constructor() {
    this.device = null;
    this.sessionId = null;
    this.workerId = null;
    this.workerGeneration = 1;

    this.sendTransport = null;
    this.recvTransport = null;

    this.producers = new Map(); // trackType -> producer
    this.consumers = new Map(); // consumerId -> consumer

    this.onSessionResetHandler = null;
    this._bindEvents();
  }

  /**
   * Binds global signaling listeners.
   * @private
   */
  _bindEvents() {
    realtimeClient.on('media:session_reset', (payload) => {
      if (this.sessionId && payload.sessionId === this.sessionId) {
        this._handleSessionReset(payload);
      }
    });
  }

  /**
   * Registers a callback for worker session reset events.
   * @param {(payload: { sessionId: string, workerId: number, epoch: number }) => void} handler
   */
  onSessionReset(handler) {
    this.onSessionResetHandler = handler;
  }

  /**
   * Internal reset handler when a worker crash notification is received.
   * @private
   */
  async _handleSessionReset(payload) {
    this.workerId = payload.workerId;
    this.workerGeneration = payload.epoch;

    this.closeTransports();

    if (this.onSessionResetHandler) {
      try {
        this.onSessionResetHandler(payload);
      } catch (err) {
        console.error('Error in onSessionReset handler:', err);
      }
    }
  }

  /**
   * Initializes or re-initializes mediasoup Device with router RTP capabilities.
   * @param {string} sessionId
   */
  async initDevice(sessionId) {
    this.sessionId = sessionId;

    const res = await realtimeClient.request(
      'media:get_router_capabilities',
      'media:router_capabilities',
      { sessionId }
    );

    this.workerId = res.workerId;
    this.workerGeneration = res.workerGeneration;

    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: res.rtpCapabilities });

    return {
      workerId: this.workerId,
      workerGeneration: this.workerGeneration
    };
  }

  /**
   * Creates the client sending transport for candidate publishers.
   * @param {string} sessionId
   */
  async createSendTransport(sessionId) {
    if (!this.device) {
      await this.initDevice(sessionId);
    }

    const transportData = await realtimeClient.request(
      'media:create_transport',
      'media:transport_created',
      { sessionId, direction: 'send' }
    );

    this.sendTransport = this.device.createSendTransport({
      id: transportData.id,
      iceParameters: transportData.iceParameters,
      iceCandidates: transportData.iceCandidates,
      dtlsParameters: transportData.dtlsParameters
    });

    this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await realtimeClient.request('media:connect_transport', 'media:transport_connected', {
          transportId: this.sendTransport.id,
          dtlsParameters
        });
        callback();
      } catch (err) {
        errback(err);
      }
    });

    this.sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        const produceRes = await realtimeClient.request('media:produce', 'media:produced', {
          transportId: this.sendTransport.id,
          kind,
          rtpParameters,
          appData
        });
        callback({ id: produceRes.id });
      } catch (err) {
        errback(err);
      }
    });

    return this.sendTransport;
  }

  /**
   * Creates the client receiving transport for invigilator subscribers.
   * @param {string} sessionId
   */
  async createRecvTransport(sessionId) {
    if (!this.device) {
      await this.initDevice(sessionId);
    }

    const transportData = await realtimeClient.request(
      'media:create_transport',
      'media:transport_created',
      { sessionId, direction: 'recv' }
    );

    this.recvTransport = this.device.createRecvTransport({
      id: transportData.id,
      iceParameters: transportData.iceParameters,
      iceCandidates: transportData.iceCandidates,
      dtlsParameters: transportData.dtlsParameters
    });

    this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await realtimeClient.request('media:connect_transport', 'media:transport_connected', {
          transportId: this.recvTransport.id,
          dtlsParameters
        });
        callback();
      } catch (err) {
        errback(err);
      }
    });

    return this.recvTransport;
  }

  /**
   * Produces a candidate media track with optional simulcast encodings.
   *
   * Profile A (Standard):
   * - Webcam High: 640x480 @ 20 fps, 350 kbps
   * - Webcam Low: 320x240 @ 10 fps, 100 kbps
   *
   * @param {MediaStreamTrack} track
   * @param {'webcam' | 'microphone' | 'screen'} trackType
   * @param {boolean} [enableSimulcast=true]
   */
  async produceTrack(track, trackType = 'webcam', enableSimulcast = true) {
    if (!this.sendTransport) {
      throw new Error('Send transport not initialized');
    }

    let encodings = undefined;
    if (track.kind === 'video' && trackType === 'webcam' && enableSimulcast) {
      encodings = [
        { rid: 'r0', maxBitrate: 350000, scaleResolutionDownBy: 1 }, // High layer
        { rid: 'r1', maxBitrate: 100000, scaleResolutionDownBy: 2 } // Low layer
      ];
    } else if (track.kind === 'video' && trackType === 'screen') {
      encodings = [
        { maxBitrate: 500000, maxFramerate: 10 }
      ];
    }

    const producer = await this.sendTransport.produce({
      track,
      encodings,
      appData: { trackType }
    });

    this.producers.set(trackType, producer);

    producer.on('transportclose', () => {
      this.producers.delete(trackType);
    });

    return producer;
  }

  /**
   * Consumes a single producer.
   * @param {string} producerId
   */
  async consumeTrack(producerId) {
    if (!this.recvTransport) {
      throw new Error('Receive transport not initialized');
    }

    const res = await realtimeClient.request('media:consume', 'media:consumed', {
      transportId: this.recvTransport.id,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities
    });

    const consumer = await this.recvTransport.consume({
      id: res.id,
      producerId: res.producerId,
      kind: res.kind,
      rtpParameters: res.rtpParameters
    });

    this.consumers.set(consumer.id, consumer);
    return consumer;
  }

  /**
   * Batched multi-consumer subscription for 12-candidate grid monitoring.
   * Root-level rtpCapabilities, deduplication, non-rollback.
   *
   * @param {string[]} producerIds
   * @returns {Promise<Array<{ producerId: string, consumer?: any, error?: string }>>}
   */
  async consumeBatch(producerIds) {
    if (!this.recvTransport) {
      throw new Error('Receive transport not initialized');
    }

    if (!producerIds || producerIds.length === 0) {
      return [];
    }

    const uniqueProducerIds = [...new Set(producerIds)];

    const batchResponse = await realtimeClient.request(
      'media:consume_batch',
      'media:consumed_batch',
      {
        transportId: this.recvTransport.id,
        rtpCapabilities: this.device.rtpCapabilities,
        producerIds: uniqueProducerIds
      }
    );

    const results = [];

    for (const item of batchResponse.results) {
      if (item.status === 'fulfilled') {
        try {
          const consumer = await this.recvTransport.consume({
            id: item.consumerId,
            producerId: item.producerId,
            kind: item.kind,
            rtpParameters: item.rtpParameters
          });
          this.consumers.set(consumer.id, consumer);
          results.push({ producerId: item.producerId, consumer });
        } catch (err) {
          results.push({ producerId: item.producerId, error: err.message });
        }
      } else {
        results.push({ producerId: item.producerId, error: item.message || item.error });
      }
    }

    return results;
  }

  /**
   * Sets preferred simulcast layer for a video consumer (e.g. 0 = grid low, 1 = focus high).
   */
  async setConsumerLayers(consumerId, spatialLayer, temporalLayer) {
    realtimeClient.send('media:consumer_set_layers', {
      consumerId,
      spatialLayer,
      temporalLayer
    });
  }

  /**
   * Pauses an active consumer.
   */
  pauseConsumer(consumerId) {
    const consumer = this.consumers.get(consumerId);
    if (consumer) {
      consumer.pause();
    }
    realtimeClient.send('media:consumer_pause', { consumerId });
  }

  /**
   * Resumes a paused consumer.
   */
  resumeConsumer(consumerId) {
    const consumer = this.consumers.get(consumerId);
    if (consumer) {
      consumer.resume();
    }
    realtimeClient.send('media:consumer_resume', { consumerId });
  }

  /**
   * Closes active sending and receiving transports.
   */
  closeTransports() {
    for (const producer of this.producers.values()) {
      try {
        producer.close();
      } catch {}
    }
    this.producers.clear();

    for (const consumer of this.consumers.values()) {
      try {
        consumer.close();
      } catch {}
    }
    this.consumers.clear();

    if (this.sendTransport) {
      try {
        this.sendTransport.close();
      } catch {}
      this.sendTransport = null;
    }

    if (this.recvTransport) {
      try {
        this.recvTransport.close();
      } catch {}
      this.recvTransport = null;
    }
  }

  /**
   * Closes transports and clears all device state.
   */
  closeAll() {
    this.closeTransports();
    this.device = null;
    this.sessionId = null;
  }
}

// Export singleton instance
export const mediaClient = new MediaClient();
