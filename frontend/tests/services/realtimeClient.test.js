/**
 * @file realtimeClient.test.js
 * @description Unit and integration tests for frontend RealtimeClient:
 * Subprotocol authentication, subscription reference counting, event routing,
 * and degradation transitions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealtimeClient } from '../../src/services/realtimeClient.js';

class MockWebSocket {
  static instances = [];

  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = 0; // CONNECTING
    this.sentFrames = [];
    MockWebSocket.instances.push(this);

    // Simulate async connection open
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen();
    }, 10);
  }

  send(data) {
    this.sentFrames.push(JSON.parse(data));
  }

  close(code = 1000, reason = '') {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose({ code, reason });
  }

  simulateIncoming(envelope) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(envelope) });
    }
  }
}

describe('RealtimeClient (Frontend WebSocket Singleton)', () => {
  let originalWebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    originalWebSocket = global.WebSocket;
    global.WebSocket = MockWebSocket;
    global.WebSocket.OPEN = 1;
    global.WebSocket.CONNECTING = 0;
    global.WebSocket.CLOSING = 2;
    global.WebSocket.CLOSED = 3;
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  it('connects using Sec-WebSocket-Protocol without query parameter credentials', async () => {
    const client = new RealtimeClient({
      getToken: () => 'mock.jwt.token',
      url: 'ws://localhost:3000/ws'
    });

    client.connect();

    expect(MockWebSocket.instances.length).toBe(1);
    const mockWs = MockWebSocket.instances[0];

    // Must transmit subprotocols: ['proctornet', token]
    expect(mockWs.protocols).toEqual(['proctornet', 'mock.jwt.token']);
    // URL must remain clean with zero query strings
    expect(mockWs.url).toBe('ws://localhost:3000/ws');

    // Wait for connection to open
    await new Promise((r) => setTimeout(r, 25));
    expect(client.status).toBe('CONNECTED');

    client.disconnect();
  });

  it('implements subscription reference counting (deduplicates multiple subscriptions to same room)', async () => {
    const client = new RealtimeClient({
      getToken: () => 'mock.jwt.token',
      url: 'ws://localhost:3000/ws'
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 25));

    const mockWs = MockWebSocket.instances[0];
    const room = 'session:12345';

    const handlerA = vi.fn();
    const handlerB = vi.fn();

    // First subscriber (Hook A mounts) -> sends subscribe wire frame
    const unsubA = client.subscribe(room, handlerA);
    expect(mockWs.sentFrames.length).toBe(1);
    expect(mockWs.sentFrames[0]).toEqual({ type: 'subscribe', payload: { room } });

    // Second subscriber (Hook B mounts to same room) -> increments ref count, sends NO duplicate wire frame
    const unsubB = client.subscribe(room, handlerB);
    expect(mockWs.sentFrames.length).toBe(1);

    // Incoming room event should be dispatched to both handlers
    mockWs.simulateIncoming({
      eventId: 'evt-1',
      type: 'proctoring:flag_raised',
      version: '1.0',
      timestamp: new Date().toISOString(),
      room,
      payload: { flagType: 'WINDOW_BLUR' }
    });

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);

    // Hook A unmounts -> ref count decrements to 1, NO unsubscribe wire frame sent yet
    unsubA();
    expect(mockWs.sentFrames.length).toBe(1);

    // Hook B unmounts -> ref count drops to 0 -> sends unsubscribe wire frame
    unsubB();
    expect(mockWs.sentFrames.length).toBe(2);
    expect(mockWs.sentFrames[1]).toEqual({ type: 'unsubscribe', payload: { room } });

    client.disconnect();
  });

  it('transitions to degraded mode upon system:realtime_degraded and recovers upon system:realtime_recovered', async () => {
    const client = new RealtimeClient({
      getToken: () => 'mock.jwt.token',
      url: 'ws://localhost:3000/ws'
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 25));

    const mockWs = MockWebSocket.instances[0];
    const degradedListener = vi.fn();
    client.on('degraded', degradedListener);

    expect(client.isDegraded).toBe(false);

    // Server emits cross-node degradation alert
    mockWs.simulateIncoming({
      eventId: 'sys-1',
      type: 'system:realtime_degraded',
      version: '1.0',
      timestamp: new Date().toISOString(),
      payload: { reason: 'CROSS_NODE_SYNC_UNAVAILABLE' }
    });

    expect(client.isDegraded).toBe(true);
    expect(degradedListener).toHaveBeenCalledWith(
      expect.objectContaining({ isDegraded: true })
    );

    // Server emits recovery
    mockWs.simulateIncoming({
      eventId: 'sys-2',
      type: 'system:realtime_recovered',
      version: '1.0',
      timestamp: new Date().toISOString(),
      payload: {}
    });

    expect(client.isDegraded).toBe(false);
    expect(degradedListener).toHaveBeenCalledWith(
      expect.objectContaining({ isDegraded: false })
    );

    client.disconnect();
  });

  it('automatically re-subscribes to active rooms upon reconnection', async () => {
    const client = new RealtimeClient({
      getToken: () => 'mock.jwt.token',
      url: 'ws://localhost:3000/ws'
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 25));

    const mockWs1 = MockWebSocket.instances[0];
    client.subscribe('session:active-1', vi.fn());
    client.subscribe('session:active-2', vi.fn());

    expect(mockWs1.sentFrames.length).toBe(2);

    // Simulate unexpected drop
    mockWs1.close(1006, 'Abnormal Closure');

    // Wait for reconnection
    await new Promise((r) => setTimeout(r, 1500));

    // A second socket should have been opened
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);
    const mockWs2 = MockWebSocket.instances[1];

    await new Promise((r) => setTimeout(r, 25));

    // Must have automatically re-subscribed to the 2 rooms on the new socket
    expect(mockWs2.sentFrames).toContainEqual({ type: 'subscribe', payload: { room: 'session:active-1' } });
    expect(mockWs2.sentFrames).toContainEqual({ type: 'subscribe', payload: { room: 'session:active-2' } });

    client.disconnect();
  });
});
