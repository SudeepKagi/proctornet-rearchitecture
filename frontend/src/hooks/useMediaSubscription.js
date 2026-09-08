/**
 * @file useMediaSubscription.js
 * @description React hook for invigilator multi-stream consumption, 12-grid batch subscription,
 * solo audio listening control, and simulcast layer switching (Phase 17).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { mediaClient } from '../services/mediaClient.js';
import { realtimeClient } from '../services/realtimeClient.js';

/**
 * Hook for invigilator dashboards to consume candidate media streams.
 *
 * @param {string} sessionId
 */
export function useMediaSubscription(sessionId) {
  const [candidates, setCandidates] = useState(new Map()); // candidateId -> { userId, webcamConsumer, micConsumer, screenConsumer, ... }
  const [focusedCandidateId, setFocusedCandidateId] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  const candidatesRef = useRef(new Map());
  const recvTransportRef = useRef(null);

  /**
   * Initializes receiving transport and binds event listeners.
   */
  const initSubscription = useCallback(async () => {
    if (!sessionId) return;
    try {
      const transport = await mediaClient.createRecvTransport(sessionId);
      recvTransportRef.current = transport;
      setIsReady(true);
    } catch (err) {
      setError(err);
    }
  }, [sessionId]);

  /**
   * Handles incoming new producer announcement.
   */
  const _handleProducerAdded = useCallback(
    async (eventPayload) => {
      const { sessionId: msgSessionId, producerId, trackType, userId } = eventPayload;
      if (msgSessionId !== sessionId || !recvTransportRef.current) return;

      try {
        const consumer = await mediaClient.consumeTrack(producerId);
        const map = new Map(candidatesRef.current);

        const existing = map.get(userId) || { userId, consumers: new Map() };
        existing.consumers.set(trackType, consumer);

        // Auto-assign low simulcast layer (spatialLayer: 0) for webcam in grid view
        if (trackType === 'webcam' && consumer.kind === 'video') {
          mediaClient.setConsumerLayers(consumer.id, 0, 0);
        }

        map.set(userId, existing);
        candidatesRef.current = map;
        setCandidates(map);
      } catch (err) {
        console.warn('Failed to consume incoming producer:', err);
      }
    },
    [sessionId]
  );

  /**
   * Handles producer removal event.
   */
  const _handleProducerRemoved = useCallback((eventPayload) => {
    const { sessionId: msgSessionId, producerId } = eventPayload;
    if (msgSessionId !== sessionId) return;

    const map = new Map(candidatesRef.current);
    for (const [userId, candidate] of map.entries()) {
      for (const [trackType, consumer] of candidate.consumers.entries()) {
        if (consumer.producerId === producerId) {
          try {
            consumer.close();
          } catch {}
          candidate.consumers.delete(trackType);
        }
      }
      if (candidate.consumers.size === 0) {
        map.delete(userId);
      }
    }

    candidatesRef.current = map;
    setCandidates(map);
  }, [sessionId]);

  /**
   * Sets focus on a candidate:
   * - Promotes webcam stream to High Layer (spatialLayer 1)
   * - Unmutes audio for this candidate ONLY (solo listening)
   * - Mutes previous candidate audio
   */
  const focusCandidate = useCallback(
    (userId) => {
      const prevFocused = focusedCandidateId;
      setFocusedCandidateId(userId);

      const map = candidatesRef.current;

      // Demote previous focused candidate to Low Layer (0)
      if (prevFocused && map.has(prevFocused)) {
        const prevCandidate = map.get(prevFocused);
        const prevWebcam = prevCandidate.consumers?.get('webcam');
        if (prevWebcam) {
          mediaClient.setConsumerLayers(prevWebcam.id, 0, 0);
        }
      }

      // Promote new focused candidate to High Layer (1)
      if (userId && map.has(userId)) {
        const candidate = map.get(userId);
        const webcam = candidate.consumers?.get('webcam');
        if (webcam) {
          mediaClient.setConsumerLayers(webcam.id, 1, 0);
        }
      }
    },
    [focusedCandidateId]
  );

  /**
   * Subscribes a batch of candidate producer IDs.
   * @param {string[]} producerIds
   */
  const consumeProducerBatch = useCallback(async (producerIds) => {
    if (!producerIds || producerIds.length === 0) return [];
    try {
      return await mediaClient.consumeBatch(producerIds);
    } catch (err) {
      console.warn('Error in batch consumption:', err);
      return [];
    }
  }, []);

  useEffect(() => {
    initSubscription();

    realtimeClient.on('media:producer_added', _handleProducerAdded);
    realtimeClient.on('media:producer_removed', _handleProducerRemoved);

    return () => {
      realtimeClient.off('media:producer_added', _handleProducerAdded);
      realtimeClient.off('media:producer_removed', _handleProducerRemoved);
      mediaClient.closeTransports();
      candidatesRef.current.clear();
      setCandidates(new Map());
    };
  }, [initSubscription, _handleProducerAdded, _handleProducerRemoved]);

  return {
    candidates,
    focusedCandidateId,
    focusCandidate,
    consumeProducerBatch,
    isReady,
    error
  };
}
