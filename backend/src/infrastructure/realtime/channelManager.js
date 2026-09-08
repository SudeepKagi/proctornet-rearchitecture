/**
 * @file channelManager.js
 * @description In-process room subscription registry and connection tracking.
 */

import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { wsConnectionsActive } from '../metrics/registry.js';

export class ChannelManager {
  constructor() {
    /** @type {Map<string, Set<import('ws').WebSocket>>} room -> Set of WebSockets */
    this.roomToSockets = new Map();

    /** @type {Map<import('ws').WebSocket, Set<string>>} WebSocket -> Set of room strings */
    this.socketToRooms = new Map();

    /** @type {Map<string, Set<import('ws').WebSocket>>} userId -> Set of WebSockets */
    this.userToSockets = new Map();

    /** @type {Map<import('ws').WebSocket, object>} WebSocket -> ConnectionContext */
    this.socketContexts = new Map();
  }

  /**
   * Registers a newly authenticated WebSocket connection.
   * Enforces the per-user concurrent connection cap (closes oldest if exceeded).
   *
   * @param {import('ws').WebSocket} ws
   * @param {object} context
   * @param {string} context.connectionId
   * @param {string} context.userId
   * @param {string[]} context.roles
   * @param {string} [context.clientIp]
   * @returns {object} Context attached to socket
   */
  registerConnection(ws, context) {
    const userId = context.userId;

    // Enforce per-user concurrent connection limit
    let userSockets = this.userToSockets.get(userId);
    if (!userSockets) {
      userSockets = new Set();
      this.userToSockets.set(userId, userSockets);
    }

    if (userSockets.size >= config.WS_MAX_CONNECTIONS_PER_USER) {
      // Find and terminate oldest connection
      const oldestWs = userSockets.values().next().value;
      if (oldestWs && oldestWs !== ws) {
        logger.warn(
          { userId, max: config.WS_MAX_CONNECTIONS_PER_USER },
          'User exceeded maximum concurrent WebSocket connections; closing oldest connection'
        );
        try {
          oldestWs.close(4429, 'Too Many Concurrent Connections');
        } catch {
          // Socket might already be closed
        }
        this.unregisterConnection(oldestWs);
      }
    }

    userSockets.add(ws);
    this.socketToRooms.set(ws, new Set());

    const connectionContext = {
      ...context,
      isAlive: true,
      lastHeartbeatAt: Date.now(),
      registeredAt: Date.now(),
      rooms: this.socketToRooms.get(ws)
    };

    this.socketContexts.set(ws, connectionContext);

    // Update Prometheus active connections gauge
    const primaryRole = (context.roles && context.roles[0]) || 'UNKNOWN';
    wsConnectionsActive.inc({ role: primaryRole });

    return connectionContext;
  }

  /**
   * Unregisters a WebSocket connection and clears its room memberships.
   * @param {import('ws').WebSocket} ws
   */
  unregisterConnection(ws) {
    const context = this.socketContexts.get(ws);
    if (!context) {
      return;
    }

    // Decrement Prometheus gauge
    const primaryRole = (context.roles && context.roles[0]) || 'UNKNOWN';
    wsConnectionsActive.dec({ role: primaryRole });

    // Remove from user sockets
    const userSockets = this.userToSockets.get(context.userId);
    if (userSockets) {
      userSockets.delete(ws);
      if (userSockets.size === 0) {
        this.userToSockets.delete(context.userId);
      }
    }

    // Remove from all subscribed rooms
    const rooms = this.socketToRooms.get(ws);
    if (rooms) {
      for (const room of rooms) {
        const socketsInRoom = this.roomToSockets.get(room);
        if (socketsInRoom) {
          socketsInRoom.delete(ws);
          if (socketsInRoom.size === 0) {
            this.roomToSockets.delete(room);
          }
        }
      }
      this.socketToRooms.delete(ws);
    }

    this.socketContexts.delete(ws);
  }

  /**
   * Subscribes a connection to a target room.
   * @param {import('ws').WebSocket} ws
   * @param {string} room
   * @returns {boolean} True if successfully joined
   */
  subscribe(ws, room) {
    if (!this.socketContexts.has(ws)) {
      return false;
    }

    let socketsInRoom = this.roomToSockets.get(room);
    if (!socketsInRoom) {
      socketsInRoom = new Set();
      this.roomToSockets.set(room, socketsInRoom);
    }
    socketsInRoom.add(ws);

    const roomsForSocket = this.socketToRooms.get(ws);
    if (roomsForSocket) {
      roomsForSocket.add(room);
    }

    return true;
  }

  /**
   * Unsubscribes a connection from a target room.
   * @param {import('ws').WebSocket} ws
   * @param {string} room
   * @returns {boolean}
   */
  unsubscribe(ws, room) {
    const socketsInRoom = this.roomToSockets.get(room);
    if (socketsInRoom) {
      socketsInRoom.delete(ws);
      if (socketsInRoom.size === 0) {
        this.roomToSockets.delete(room);
      }
    }

    const roomsForSocket = this.socketToRooms.get(ws);
    if (roomsForSocket) {
      roomsForSocket.delete(room);
    }

    return true;
  }

  /**
   * Returns all active sockets subscribed to a room.
   * @param {string} room
   * @returns {Set<import('ws').WebSocket>}
   */
  getSubscribers(room) {
    return this.roomToSockets.get(room) || new Set();
  }

  /**
   * Returns connection context for a socket.
   * @param {import('ws').WebSocket} ws
   * @returns {object | undefined}
   */
  getContext(ws) {
    return this.socketContexts.get(ws);
  }

  /**
   * Returns all active connection contexts.
   * @returns {IterableIterator<object>}
   */
  getAllContexts() {
    return this.socketContexts.values();
  }

  /**
   * Returns all active sockets.
   * @returns {IterableIterator<import('ws').WebSocket>}
   */
  getAllSockets() {
    return this.socketContexts.keys();
  }

  /**
   * Returns total active connection count.
   * @returns {number}
   */
  getConnectionCount() {
    return this.socketContexts.size;
  }

  /**
   * Returns sockets registered to a specific user.
   * @param {string} userId
   * @returns {import('ws').WebSocket[]}
   */
  getUserSockets(userId) {
    return Array.from(this.userToSockets.get(userId) || []);
  }

  /**
   * Returns all rooms a socket is currently subscribed to.
   * @param {import('ws').WebSocket} ws
   * @returns {Set<string>}
   */
  getRoomsForSocket(ws) {
    return this.socketToRooms.get(ws) || new Set();
  }

  /**
   * Alias for unregisterConnection.
   * @param {import('ws').WebSocket} ws
   */
  removeConnection(ws) {
    return this.unregisterConnection(ws);
  }

  /**
   * Clears all connections and room memberships (used for testing).
   */
  clear() {
    this.roomToSockets.clear();
    this.socketToRooms.clear();
    this.userToSockets.clear();
    this.socketContexts.clear();
  }
}

export const defaultChannelManager = new ChannelManager();
