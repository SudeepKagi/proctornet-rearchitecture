/**
 * @file mediaClient.test.js
 * @description Unit tests for frontend MediaClient service:
 * Device initialization, transport creation, track publishing, consume batch, and session reset handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaClient } from '../../src/services/mediaClient.js';
import { realtimeClient } from '../../src/services/realtimeClient.js';

vi.mock('../../src/services/realtimeClient.js', () => ({
  realtimeClient: {
    isConnected: vi.fn().mockReturnValue(true),
    request: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}));

describe('MediaClient (Frontend mediasoup-client wrapper)', () => {
  let mediaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mediaClient = new MediaClient();
  });

  afterEach(() => {
    mediaClient.closeAll();
    vi.restoreAllMocks();
  });

  it('initializes with null device and null transports', () => {
    expect(mediaClient.device).toBeNull();
    expect(mediaClient.sendTransport).toBeNull();
    expect(mediaClient.recvTransport).toBeNull();
    expect(mediaClient.sessionId).toBeNull();
    expect(mediaClient.producers.size).toBe(0);
    expect(mediaClient.consumers.size).toBe(0);
  });

  it('creates send transport when createSendTransport is called', async () => {
    const fakeSessionId = 'session-12345';
    const fakeRtpCapabilities = {
      codecs: [{ mimeType: 'audio/opus', kind: 'audio', clockRate: 48000, preferredPayloadType: 111 }]
    };

    realtimeClient.request.mockImplementation(async (type) => {
      if (type === 'media:get_router_capabilities') {
        return { rtpCapabilities: fakeRtpCapabilities, workerId: 0, workerGeneration: 1 };
      }
      if (type === 'media:create_transport') {
        return {
          id: 'transport-send-1',
          iceParameters: { usernameFragment: 'ufrag1' },
          iceCandidates: [],
          dtlsParameters: { fingerprints: [{ algorithm: 'sha-256', value: '00:11' }] }
        };
      }
      return {};
    });

    // Mock device
    mediaClient.device = {
      loaded: true,
      createSendTransport: vi.fn().mockReturnValue({
        id: 'transport-send-1',
        on: vi.fn(),
        close: vi.fn()
      })
    };

    const transport = await mediaClient.createSendTransport(fakeSessionId);
    expect(transport.id).toBe('transport-send-1');
    expect(mediaClient.sendTransport).toBe(transport);
    expect(mediaClient.device.createSendTransport).toHaveBeenCalled();
  });

  it('publishes track and caches producer in map', async () => {
    const fakeTrack = { id: 'track-1', kind: 'video' };
    const fakeProducer = {
      id: 'prod-video-1',
      kind: 'video',
      appData: { trackType: 'webcam' },
      on: vi.fn(),
      close: vi.fn()
    };

    mediaClient.sendTransport = {
      produce: vi.fn().mockResolvedValue(fakeProducer)
    };

    const producer = await mediaClient.produceTrack(fakeTrack, 'webcam');
    expect(producer.id).toBe('prod-video-1');
    expect(mediaClient.producers.get('webcam')).toBe(fakeProducer);
  });

  it('handles media:session_reset event by firing onSessionReset callback and resetting transports', () => {
    const resetListener = vi.fn();
    mediaClient.onSessionReset(resetListener);

    const mockSendTransport = { close: vi.fn() };
    mediaClient.sendTransport = mockSendTransport;
    mediaClient.sessionId = 'session-reset-123';

    const resetPayload = {
      sessionId: 'session-reset-123',
      epoch: 2,
      workerId: 1
    };

    mediaClient._handleSessionReset(resetPayload);

    expect(resetListener).toHaveBeenCalledWith(resetPayload);
    expect(mockSendTransport.close).toHaveBeenCalled();
    expect(mediaClient.sendTransport).toBeNull();
    expect(mediaClient.workerGeneration).toBe(2);
    expect(mediaClient.workerId).toBe(1);
  });

  it('closes all transports and producers cleanly on closeAll', () => {
    const mockTransport = { close: vi.fn() };
    const mockProducer = { close: vi.fn() };

    mediaClient.sendTransport = mockTransport;
    mediaClient.producers.set('webcam', mockProducer);
    mediaClient.sessionId = 'sess-active';

    mediaClient.closeAll();

    expect(mockTransport.close).toHaveBeenCalled();
    expect(mockProducer.close).toHaveBeenCalled();
    expect(mediaClient.producers.size).toBe(0);
    expect(mediaClient.sendTransport).toBeNull();
    expect(mediaClient.device).toBeNull();
    expect(mediaClient.sessionId).toBeNull();
  });
});
