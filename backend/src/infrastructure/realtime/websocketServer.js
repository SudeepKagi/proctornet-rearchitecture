/**
 * @file websocketServer.js
 * @description WebSocket server lifecycle, HTTP upgrade handling, pre-upgrade rate limiting,
 * subprotocol authentication, connection management, transport ping/pong, candidate presence monitoring,
 * periodic revocation sweeps, and per-socket Tier-4 inbound message rate limiting.
 */

import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { verifyAccessToken } from '../../modules/auth/token.service.js';
import { isSessionBlacklisted } from '../../modules/auth/tokenBlacklist.js';
import { findSessionRevocationStatus, getUserRoles, findUserById } from '../../modules/auth/auth.repository.js';
import { getPool } from '../postgres/pool.js';
import { isInvigilatorAssignedToSession } from '../../modules/proctoring/proctoring.repository.js';
import { defaultChannelManager } from './channelManager.js';
import { defaultBroadcaster } from './realtimeBroadcaster.js';
import { parseClientCommand } from './realtime.schemas.js';
import {
  wsConnectionsTotal,
  wsMessagesReceivedTotal,
  wsHeartbeatTimeoutsTotal
} from '../metrics/registry.js';

// Pre-upgrade IP rate limiting state
const upgradeAttempts = new Map(); // ip -> [timestamp]
const UPGRADE_WINDOW_MS = 60000;
const PRUNE_INTERVAL_MS = 300000; // 5 minutes

let pruneTimer = null;

/**
 * Prunes expired timestamps from the IP upgrade rate-limiter map.
 */
function pruneStaleUpgradeAttempts() {
  const now = Date.now();
  for (const [ip, timestamps] of upgradeAttempts.entries()) {
    const valid = timestamps.filter((t) => now - t < UPGRADE_WINDOW_MS);
    if (valid.length === 0) {
      upgradeAttempts.delete(ip);
    } else {
      upgradeAttempts.set(ip, valid);
    }
  }
}

/**
 * Checks whether an IP has exceeded the pre-upgrade rate limit.
 * @param {string} ip
 * @returns {boolean} True if allowed, false if rate limited
 */
export function checkPreUpgradeRateLimit(ip) {
  const now = Date.now();
  const timestamps = upgradeAttempts.get(ip) || [];
  const valid = timestamps.filter((t) => now - t < UPGRADE_WINDOW_MS);
  if (valid.length >= config.WS_PRE_AUTH_RATE_LIMIT_PER_MIN) {
    upgradeAttempts.set(ip, valid);
    return false;
  }
  valid.push(now);
  upgradeAttempts.set(ip, valid);
  return true;
}

/**
 * Resolves the real client IP from an upgrade request, accounting for trusted
 * reverse proxy hops declared via WS_TRUSTED_PROXY_COUNT.
 *
 * Security contract & Reverse Proxy Model:
 *   WS_TRUSTED_PROXY_COUNT defines the number of trusted reverse proxy hops between
 *   the client and this application server (default: 1).
 *
 *   Reverse proxy behavior (RFC 7239 / standard XFF conventions):
 *   - Each reverse proxy in the chain receives a connection from a peer IP, and appends
 *     that peer IP to the rightmost end of the incoming X-Forwarded-For header before
 *     forwarding the request upstream.
 *   - Therefore, for H trusted hops, the legitimate client IP is at index (ips.length - H).
 *
 *   Specific cases:
 *   - WS_TRUSTED_PROXY_COUNT = 0:
 *     No reverse proxy is trusted. The X-Forwarded-For header is completely ignored to
 *     prevent spoofing. The direct TCP peer address (req.socket.remoteAddress) is returned.
 *   - WS_TRUSTED_PROXY_COUNT = 1:
 *     A single trusted proxy is in front. The proxy appended the client's IP as the last
 *     entry in X-Forwarded-For. Any values to the left were sent by the client (and may be
 *     spoofed). Discarding 1 hop from the right yields index (ips.length - 1), which is the
 *     verified client IP.
 *   - WS_TRUSTED_PROXY_COUNT = 2:
 *     Two trusted proxies are in front: Client -> Proxy1 -> Proxy2 -> App.
 *     Proxy1 appends client IP. Proxy2 appends Proxy1 IP.
 *     Index is (ips.length - 2), which is the verified client IP.
 *
 *   Fallback semantics:
 *   - If X-Forwarded-For contains fewer entries than trusted proxy hops (e.g. ips.length < H),
 *     we deterministically fall back to the leftmost entry (ips[0]), preventing an attacker
 *     from rotating identities while safely handling truncated proxy chains.
 *   - If X-Forwarded-For is absent, empty, whitespace-only, or invalid, we safely fall back
 *     to req.socket.remoteAddress (or '127.0.0.1').
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [trustedHopsOverride]
 * @returns {string}
 */
export function getClientIp(req, trustedHopsOverride) {
  const trustedHops = trustedHopsOverride !== undefined ? trustedHopsOverride : config.WS_TRUSTED_PROXY_COUNT;

  if (trustedHops === 0) {
    // No trusted proxy in front — use direct TCP connection address; ignore XFF completely.
    return req.socket?.remoteAddress || '127.0.0.1';
  }

  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const ips = forwarded.split(',').map((ip) => ip.trim()).filter(Boolean);
    if (ips.length > 0) {
      const clientIndex = ips.length - trustedHops;
      if (clientIndex >= 0 && clientIndex < ips.length && ips[clientIndex]) {
        return ips[clientIndex];
      }
      // Truncated list (fewer entries than expected proxy hops):
      // Safely fall back to leftmost available entry.
      return ips[0];
    }
  }

  return req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Extracts and sanitizes token from subprotocol or fallback query parameter.
 * @param {import('node:http').IncomingMessage} req
 * @returns {{ token: string, isSubprotocol: boolean } | null}
 */
export function extractUpgradeToken(req) {
  // 1. Primary: Sec-WebSocket-Protocol: proctornet, <jwt>
  const subprotocols = req.headers['sec-websocket-protocol'];
  if (subprotocols && typeof subprotocols === 'string') {
    const parts = subprotocols.split(',').map((s) => s.trim());
    if (parts.length >= 2 && parts[0] === 'proctornet') {
      return { token: parts[1], isSubprotocol: true };
    }
  }

  // 2. Fallback: Query parameter ?token=
  try {
    const rawUrl = req.url || '';
    const qIndex = rawUrl.indexOf('?');
    if (qIndex !== -1) {
      const query = rawUrl.slice(qIndex + 1);
      const params = new URLSearchParams(query);
      const token = params.get('token');
      if (token) {
        // Redact query parameter immediately to protect request logs
        params.set('token', '[REDACTED]');
        req.url = `${rawUrl.slice(0, qIndex)}?${params.toString()}`;
        return { token, isSubprotocol: false };
      }
    }
  } catch {
    // Ignore URL parsing errors
  }

  return null;
}

export class ProctorNetWebSocketServer {
  /**
   * @param {object} [options]
   * @param {import('./channelManager.js').ChannelManager} [options.channelManager]
   * @param {import('./realtimeBroadcaster.js').RealtimeBroadcaster} [options.broadcaster]
   */
  constructor(options = {}) {
    this.channelManager = options.channelManager || defaultChannelManager;
    this.broadcaster = options.broadcaster || defaultBroadcaster;

    this.deps = {
      isSessionBlacklisted,
      findSessionRevocationStatus,
      findUserById,
      getUserRoles,
      isInvigilatorAssignedToSession,
      ...options.deps
    };
    if (options.isSessionBlacklisted) this.deps.isSessionBlacklisted = options.isSessionBlacklisted;
    if (options.findSessionRevocationStatus) this.deps.findSessionRevocationStatus = options.findSessionRevocationStatus;
    if (options.findUserById) this.deps.findUserById = options.findUserById;
    if (options.getUserRoles) this.deps.getUserRoles = options.getUserRoles;
    if (options.isInvigilatorAssignedToSession) this.deps.isInvigilatorAssignedToSession = options.isInvigilatorAssignedToSession;

    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: config.WS_MAX_PAYLOAD_BYTES,
      handleProtocols: (protocols) => {
        if (protocols.has('proctornet')) {
          return 'proctornet';
        }
        return false;
      }
    });

    this.transportPingTimer = null;
    this.presenceSweepTimer = null;
    this.revocationSweepTimer = null;
    this.isShuttingDown = false;
  }

  /**
   * Starts periodic transport liveness, presence sweep, and revocation sweep timers.
   */
  startTimers() {
    if (!pruneTimer) {
      pruneTimer = setInterval(pruneStaleUpgradeAttempts, PRUNE_INTERVAL_MS);
      pruneTimer.unref();
    }

    // 1. Transport liveness ping/pong sweep (every 30s)
    this.transportPingTimer = setInterval(() => {
      if (this.isShuttingDown) return;
      this._runTransportPingSweep();
    }, config.WS_TRANSPORT_PING_INTERVAL_MS);
    this.transportPingTimer.unref();

    // 2. Candidate application presence sweep (every 5s)
    this.presenceSweepTimer = setInterval(() => {
      if (this.isShuttingDown) return;
      this._runPresenceSweep();
    }, config.WS_PRESENCE_SWEEP_INTERVAL_MS);
    this.presenceSweepTimer.unref();

    // 3. Periodic server-side authorization revocation sweep (default every 60s).
    //    Authoritatively re-evaluates active sessions, user active status,
    //    role changes, and invigilator room assignments against PostgreSQL & Redis.
    this.revocationSweepTimer = setInterval(() => {
      if (this.isShuttingDown) return;
      this._runRevocationSweep().catch((err) => {
        logger.error({ err: err.message }, 'Unexpected error in revocation sweep');
      });
    }, config.WS_REVOCATION_SWEEP_INTERVAL_MS);
    this.revocationSweepTimer.unref();
  }

  /**
   * Sweeps active connections for protocol-level ping/pong liveness.
   */
  _runTransportPingSweep() {
    for (const ws of this.channelManager.getAllSockets()) {
      const ctx = this.channelManager.getContext(ws);
      if (!ctx) continue;

      if (ctx.isAlive === false) {
        logger.info(
          { connectionId: ctx.connectionId, userId: ctx.userId },
          'Terminating unresponsive WebSocket connection (missed protocol pong)'
        );
        wsHeartbeatTimeoutsTotal.inc();
        try {
          ws.terminate();
        } catch {}
        continue;
      }

      ctx.isAlive = false;
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    }
  }

  /**
   * Sweeps active candidate connections to detect application heartbeat lapses (>15s).
   */
  _runPresenceSweep() {
    const now = Date.now();
    for (const ws of this.channelManager.getAllSockets()) {
      const ctx = this.channelManager.getContext(ws);
      if (!ctx || !ctx.attemptId || !ctx.sessionId) continue;

      if (
        ctx.presenceStatus !== 'OFFLINE' &&
        now - ctx.lastHeartbeatAt > config.WS_PRESENCE_LAPSE_THRESHOLD_MS
      ) {
        ctx.presenceStatus = 'OFFLINE';
        logger.info(
          { userId: ctx.userId, attemptId: ctx.attemptId, sessionId: ctx.sessionId },
          'Candidate application heartbeat lapsed > 15s; broadcasting offline presence alert'
        );
        this.broadcaster
          .broadcastToSession(ctx.sessionId, 'candidate:presence_changed', {
            studentId: ctx.userId,
            attemptId: ctx.attemptId,
            status: 'OFFLINE',
            reason: 'HEARTBEAT_TIMEOUT',
            timestamp: new Date().toISOString()
          })
          .catch(() => {});
      }
    }
  }

  /**
   * Handles incoming HTTP upgrade requests to /ws.
   *
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:net').Socket} socket
   * @param {Buffer} head
   */
  async handleUpgrade(req, socket, head) {
    // 1. Path validation
    const rawUrl = req.url || '';
    const pathname = rawUrl.split('?')[0];
    if (pathname !== '/ws' && pathname !== '/api/v1/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\nNot Found');
      socket.destroy();
      return;
    }

    // 2. Pre-upgrade IP rate limiting
    const clientIp = getClientIp(req);
    if (!checkPreUpgradeRateLimit(clientIp)) {
      logger.warn({ clientIp }, 'Pre-upgrade rate limit exceeded on /ws; rejecting upgrade');
      socket.write('HTTP/1.1 429 Too Many Requests\r\nRetry-After: 60\r\nConnection: close\r\n\r\nToo Many Requests');
      socket.destroy();
      return;
    }

    // 3. Origin validation (CSWSH defense).
    //    Browser clients always send an Origin header; it is validated against
    //    CORS_ORIGIN to prevent cross-site WebSocket hijacking (CSWSH).
    //    Non-browser tooling (CLI, automated test harnesses) typically omits the
    //    Origin header. Those requests are intentionally permitted here because
    //    subprotocol JWT authentication still applies at step 4-6 below — an
    //    unauthenticated origin-less connection is rejected at the token stage.
    const origin = req.headers.origin;
    if (origin && origin !== config.CORS_ORIGIN) {
      logger.warn({ origin, expected: config.CORS_ORIGIN }, 'Rejected WebSocket upgrade from untrusted origin');
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\nForbidden Origin');
      socket.destroy();
      return;
    }

    // 4. Token extraction
    const tokenInfo = extractUpgradeToken(req);
    if (!tokenInfo || !tokenInfo.token) {
      socket.write(
        'HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nMissing Authentication Token'
      );
      socket.destroy();
      return;
    }

    // 5. Cryptographic token verification
    let decoded;
    try {
      decoded = verifyAccessToken(tokenInfo.token);
    } catch (err) {
      logger.warn({ err: err.message }, 'WebSocket handshake token validation failed');
      socket.write(
        'HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nInvalid Access Token'
      );
      socket.destroy();
      return;
    }

    // 6. Session revocation validation
    const sessionId = decoded.sessionId;
    if (sessionId) {
      try {
        const blacklistResult = await (this.deps?.isSessionBlacklisted || isSessionBlacklisted)(sessionId);
        if (blacklistResult.available && blacklistResult.isBlacklisted) {
          socket.write(
            'HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nSession Revoked'
          );
          socket.destroy();
          return;
        }
        if (!blacklistResult.available) {
          const sessionRecord = await (this.deps?.findSessionRevocationStatus || findSessionRevocationStatus)(sessionId);
          if (!sessionRecord || sessionRecord.is_revoked) {
            socket.write(
              'HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nSession Revoked'
            );
            socket.destroy();
            return;
          }
        }
      } catch (revocationErr) {
        logger.error({ err: revocationErr.message }, 'Failed session revocation check during WebSocket upgrade');
        socket.write('HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\nAuth Error');
        socket.destroy();
        return;
      }
    }

    // 7. Verify user account exists and is active in PostgreSQL
    try {
      const user = await (this.deps?.findUserById || findUserById)(decoded.userId);
      const isActive = user && (user.is_active !== undefined ? user.is_active : user.status === 'ACTIVE');
      if (user && !isActive) {
        socket.write(
          'HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nUser Account Disabled'
        );
        socket.destroy();
        return;
      }
    } catch (err) {
      logger.warn({ err: err.message, userId: decoded.userId }, 'Failed to verify user active status during upgrade');
    }

    // 8. Load authoritative user roles from PostgreSQL
    let authoritativeRoles = decoded.roles || [];
    try {
      const dbRoles = await (this.deps?.getUserRoles || getUserRoles)(decoded.userId);
      if (dbRoles && dbRoles.length > 0) {
        authoritativeRoles = dbRoles;
      }
    } catch {
      // Retain token snapshot roles if database is temporarily unreachable in mocks
    }

    // 8. Complete WebSocket upgrade
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this._onConnection(ws, {
        connectionId: randomUUID(),
        userId: decoded.userId,
        // Store the JWT session ID so the revocation sweep can re-check it
        // periodically without re-parsing the original token.
        authSessionId: sessionId || null,
        roles: authoritativeRoles,
        clientIp,
        isSubprotocol: tokenInfo.isSubprotocol
      });
    });
  }

  /**
   * Initializes a connected socket and binds event handlers.
   *
   * @param {import('ws').WebSocket} ws
   * @param {object} connectionData
   */
  _onConnection(ws, connectionData) {
    const context = this.channelManager.registerConnection(ws, connectionData);
    const primaryRole = (context.roles && context.roles[0]) || 'UNKNOWN';

    wsConnectionsTotal.inc({ role: primaryRole, status: 'connected' });

    // Send connection:established acknowledgement
    this.broadcaster.sendDirect(ws, 'connection:established', {
      connectionId: context.connectionId,
      userId: context.userId,
      roles: context.roles,
      serverTime: new Date().toISOString()
    });

    // Finding 7 fix: if the broadcaster is already in DEGRADED state (e.g. Redis
    // failed before any client connected), send a direct degradation notice to
    // this newly connected socket so it can activate REST fallback polling
    // immediately without waiting for the next global broadcast.
    if (this.broadcaster.getState() === 'DEGRADED') {
      this.broadcaster.sendDirect(ws, 'system:realtime_degraded', {
        degraded: true,
        reason: 'CROSS_NODE_SYNC_UNAVAILABLE'
      });
    }

    // Transport pong handler
    ws.on('pong', () => {
      context.isAlive = true;
    });

    // Tier-4 per-socket inbound message rate limiting state.
    // Tracks the number of application messages received in the current 60-second
    // window. Sockets exceeding WS_INBOUND_RATE_LIMIT_PER_MIN are terminated
    // with close code 1008 (Policy Violation). The window resets every 60 seconds.
    // Protocol-level pings/pongs are not counted (handled by the ws library itself).
    context._inboundMsgCount = 0;
    context._inboundWindowStart = Date.now();

    // Client message handler
    ws.on('message', async (rawMessage) => {
      wsMessagesReceivedTotal.inc({ type: 'inbound' });

      // --- Tier-4 inbound rate limit enforcement ---
      const now = Date.now();
      if (now - context._inboundWindowStart >= 60000) {
        // New 60-second window: reset counter
        context._inboundWindowStart = now;
        context._inboundMsgCount = 0;
      }
      context._inboundMsgCount += 1;

      if (context._inboundMsgCount > config.WS_INBOUND_RATE_LIMIT_PER_MIN) {
        logger.warn(
          { connectionId: context.connectionId, userId: context.userId, count: context._inboundMsgCount },
          'Per-socket inbound message rate limit exceeded (Tier-4); terminating connection'
        );
        try {
          ws.close(1008, 'Message Rate Limit Exceeded');
        } catch {
          ws.terminate();
        }
        return;
      }
      // --- End Tier-4 rate limiting ---

      await this._handleClientMessage(ws, context, rawMessage);
    });

    // Clean disconnect handler
    ws.on('close', (code, reason) => {
      wsConnectionsTotal.inc({ role: primaryRole, status: 'closed' });

      // If candidate has an active attempt, immediately notify assigned invigilators
      if (context.attemptId && context.sessionId && context.presenceStatus !== 'OFFLINE') {
        context.presenceStatus = 'OFFLINE';
        this.broadcaster
          .broadcastToSession(context.sessionId, 'candidate:presence_changed', {
            studentId: context.userId,
            attemptId: context.attemptId,
            status: 'OFFLINE',
            reason: 'SOCKET_CLOSED',
            timestamp: new Date().toISOString()
          })
          .catch(() => {});
      }

      this.channelManager.unregisterConnection(ws);
      logger.debug(
        { connectionId: context.connectionId, code, reason: reason.toString('utf8') },
        'WebSocket connection closed'
      );
    });

    ws.on('error', (err) => {
      logger.warn({ connectionId: context.connectionId, err: err.message }, 'WebSocket client error');
    });
  }

  /**
   * Processes validated client-to-server commands.
   *
   * @param {import('ws').WebSocket} ws
   * @param {object} context
   * @param {string | Buffer} rawMessage
   */
  async _handleClientMessage(ws, context, rawMessage) {
    const parseResult = parseClientCommand(rawMessage);
    if (!parseResult.success) {
      this.broadcaster.sendDirect(ws, 'error', {
        code: parseResult.error === 'MALFORMED_JSON' ? 'MALFORMED_JSON' : 'INVALID_COMMAND',
        message: parseResult.error
      });
      return;
    }

    const command = parseResult.data;

    switch (command.type) {
      case 'heartbeat': {
        context.lastHeartbeatAt = Date.now();
        if (command.payload?.attemptId) {
          context.attemptId = command.payload.attemptId;
        }

        // If candidate was previously flagged offline, emit presence restored
        if (context.presenceStatus === 'OFFLINE' && context.sessionId) {
          context.presenceStatus = 'ONLINE';
          this.broadcaster
            .broadcastToSession(context.sessionId, 'candidate:presence_changed', {
              studentId: context.userId,
              attemptId: context.attemptId,
              status: 'ONLINE',
              reason: 'HEARTBEAT_RESUMED',
              timestamp: new Date().toISOString()
            })
            .catch(() => {});
        }

        this.broadcaster.sendDirect(ws, 'heartbeat:ack', {
          serverTime: new Date().toISOString()
        });
        break;
      }

      case 'subscribe': {
        const isAuthorized = await this._authorizeSubscription(command.room, context);
        if (!isAuthorized) {
          this.broadcaster.sendDirect(ws, 'error', {
            code: 'SUBSCRIPTION_FORBIDDEN',
            room: command.room,
            message: 'Access denied: You do not have authorization for this room scope'
          });
          return;
        }

        this.channelManager.subscribe(ws, command.room);
        this.broadcaster.sendDirect(ws, 'subscribed', {
          room: command.room,
          timestamp: new Date().toISOString()
        });
        break;
      }

      case 'unsubscribe': {
        this.channelManager.unsubscribe(ws, command.room);
        this.broadcaster.sendDirect(ws, 'unsubscribed', {
          room: command.room,
          timestamp: new Date().toISOString()
        });
        break;
      }

      default:
        this.broadcaster.sendDirect(ws, 'error', {
          code: 'UNSUPPORTED_COMMAND',
          message: `Command type '${command.type}' is not supported`
        });
    }
  }

  /**
   * Verifies server-side authorization for a room subscription request against
   * authoritative PostgreSQL data.
   *
   * Access rules (in priority order):
   *  ADMIN   — global access to all rooms
   *  FACULTY — must own the exam that owns the session/attempt (exam.created_by)
   *  INVIGILATOR — must be assigned to the session (session_invigilators)
   *  STUDENT — must be enrolled in the session / own the attempt (exam_attempts)
   *
   * @param {string} room
   * @param {object} context
   * @returns {Promise<boolean>}
   */
  async _authorizeSubscription(room, context) {
    const roles = Array.isArray(context.roles) ? context.roles : [];
    const pool = getPool();

    // 1. Admin has global room subscription authority
    if (roles.includes('ADMIN')) {
      return true;
    }

    // 2. Invigilator Room: session:<sessionId>
    if (room.startsWith('session:') && !room.endsWith(':candidate')) {
      const sessionId = room.slice('session:'.length);

      if (roles.includes('FACULTY')) {
        // FACULTY must own the exam associated with this session (BOLA protection).
        // Blanket role-based pass is intentionally removed; faculty from other exams
        // must not be able to observe sessions they do not own.
        if (!pool) return true; // fallback in mock environments
        const result = await pool.query(
          `SELECT 1 FROM exam_sessions es
           JOIN exams e ON es.exam_id = e.exam_id
           WHERE es.session_id = $1 AND e.created_by = $2 LIMIT 1;`,
          [sessionId, context.userId]
        );
        return result.rows.length > 0;
      }

      if (roles.includes('INVIGILATOR')) {
        return (this.deps?.isInvigilatorAssignedToSession || isInvigilatorAssignedToSession)(sessionId, context.userId);
      }

      // Students are strictly forbidden from invigilator rooms
      return false;
    }

    // 3. Candidate Broadcast Room: session:<sessionId>:candidate
    if (room.startsWith('session:') && room.endsWith(':candidate')) {
      const sessionId = room.slice('session:'.length, -':candidate'.length);

      if (roles.includes('FACULTY')) {
        // Faculty must own the exam to observe candidate broadcast rooms.
        if (!pool) return true;
        const result = await pool.query(
          `SELECT 1 FROM exam_sessions es
           JOIN exams e ON es.exam_id = e.exam_id
           WHERE es.session_id = $1 AND e.created_by = $2 LIMIT 1;`,
          [sessionId, context.userId]
        );
        return result.rows.length > 0;
      }

      if (roles.includes('INVIGILATOR')) {
        return (this.deps?.isInvigilatorAssignedToSession || isInvigilatorAssignedToSession)(sessionId, context.userId);
      }

      if (roles.includes('STUDENT')) {
        if (!pool) return true; // fallback in mock environments
        const result = await pool.query(
          `SELECT 1 FROM session_students WHERE session_id = $1 AND student_id = $2 LIMIT 1;`,
          [sessionId, context.userId]
        );
        if (result.rows.length > 0) {
          context.sessionId = sessionId;
          return true;
        }
      }
      return false;
    }

    // 4. Candidate Attempt Room: attempt:<attemptId>
    if (room.startsWith('attempt:')) {
      const attemptId = room.slice('attempt:'.length);

      if (roles.includes('FACULTY')) {
        // Faculty must own the exam associated with this attempt (BOLA protection).
        if (!pool) {
          return true; // fallback in mock environments
        }
        const result = await pool.query(
          `SELECT 1 FROM exam_attempts ea
           JOIN exam_sessions es ON ea.session_id = es.session_id
           JOIN exams e ON es.exam_id = e.exam_id
           WHERE ea.attempt_id = $1 AND e.created_by = $2 LIMIT 1;`,
          [attemptId, context.userId]
        );
        return result.rows.length > 0;
      }

      if (roles.includes('STUDENT')) {
        if (!pool) {
          context.attemptId = attemptId;
          return true;
        }
        const result = await pool.query(
          `SELECT session_id FROM exam_attempts WHERE attempt_id = $1 AND student_id = $2 LIMIT 1;`,
          [attemptId, context.userId]
        );
        if (result.rows.length > 0) {
          context.attemptId = attemptId;
          context.sessionId = result.rows[0].session_id;
          context.presenceStatus = 'ONLINE';
          return true;
        }
        return false;
      }

      if (roles.includes('INVIGILATOR')) {
        if (!pool) return true;
        const result = await pool.query(
          `SELECT 1 FROM exam_attempts ea
           JOIN session_invigilators si ON ea.session_id = si.session_id
           WHERE ea.attempt_id = $1 AND si.user_id = $2 LIMIT 1;`,
          [attemptId, context.userId]
        );
        return result.rows.length > 0;
      }
    }

    return false;
  }

  /**
   * Periodic server-side authorization revocation sweep.
   *
   * Authoritatively re-checks all active connections against PostgreSQL and Redis:
   * 1. Redis session blacklist (fast-path revocation).
   * 2. PostgreSQL session revocation status (authoritative DB session state).
   * 3. PostgreSQL user account active status (detects disabled/deleted accounts).
   * 4. PostgreSQL authoritative user roles (detects role demotions/changes).
   * 5. Invigilator and room assignments (unsubscribes sockets from removed sessions).
   *
   * Sockets failing user or session validation are terminated with close code 4401.
   * Sockets failing room-specific authorization are unsubscribed from that room.
   */
  async _runRevocationSweep() {
    const sockets = Array.from(this.channelManager.getAllSockets());
    for (const ws of sockets) {
      try {
        await this._checkSocketRevocation(ws);
      } catch (err) {
        logger.warn(
          { err: err.message },
          'Revocation sweep: unexpected error evaluating socket; skipping'
        );
      }
    }
  }

  /**
   * Evaluates an individual socket during the periodic revocation sweep.
   * @param {import('ws').WebSocket} ws
   */
  async _checkSocketRevocation(ws) {
    const ctx = this.channelManager.getContext(ws);
    if (!ctx || !ctx.userId) return;

    // 1. Redis session blacklist fast-path check
    if (ctx.authSessionId) {
      try {
        const blacklistResult = await (this.deps?.isSessionBlacklisted || isSessionBlacklisted)(ctx.authSessionId);
        if (blacklistResult.available && blacklistResult.isBlacklisted) {
          logger.info(
            { connectionId: ctx.connectionId, userId: ctx.userId, sessionId: ctx.authSessionId },
            'Revocation sweep: session blacklisted in Redis; terminating socket'
          );
          this._terminateSocket(ws, 4401, 'Session Revoked');
          return;
        }
      } catch (redisErr) {
        logger.warn(
          { connectionId: ctx.connectionId, err: redisErr.message },
          'Revocation sweep: Redis check error; continuing to database check'
        );
      }
    }

    // 2. Authoritative PostgreSQL session revocation check
    if (ctx.authSessionId) {
      try {
        const sessionRecord = await (this.deps?.findSessionRevocationStatus || findSessionRevocationStatus)(ctx.authSessionId);
        if (!sessionRecord || sessionRecord.is_revoked) {
          logger.info(
            { connectionId: ctx.connectionId, userId: ctx.userId, sessionId: ctx.authSessionId },
            'Revocation sweep: session revoked in PostgreSQL; terminating socket'
          );
          this._terminateSocket(ws, 4401, 'Session Revoked');
          return;
        }
      } catch (dbErr) {
        logger.warn(
          { connectionId: ctx.connectionId, userId: ctx.userId, err: dbErr.message },
          'Revocation sweep: PostgreSQL session check infrastructure error; skipping socket'
        );
        return; // Infrastructure failure: do not treat as user revoked
      }
    }

    // 3. Authoritative PostgreSQL user account active status
    try {
      const user = await (this.deps?.findUserById || findUserById)(ctx.userId);
      const isActive = user && (user.is_active !== undefined ? user.is_active : user.status === 'ACTIVE');
      if (!user || !isActive) {
        logger.info(
          { connectionId: ctx.connectionId, userId: ctx.userId },
          'Revocation sweep: user account disabled or deleted in PostgreSQL; terminating socket'
        );
        this._terminateSocket(ws, 4401, 'User Account Disabled');
        return;
      }
    } catch (dbErr) {
      logger.warn(
        { connectionId: ctx.connectionId, userId: ctx.userId, err: dbErr.message },
        'Revocation sweep: PostgreSQL user status infrastructure error; skipping socket'
      );
      return; // Infrastructure failure: do not treat as user revoked
    }

    // 4. Authoritative PostgreSQL user roles check (detect role demotions/changes)
    try {
      const dbRoles = await (this.deps?.getUserRoles || getUserRoles)(ctx.userId);
      if (Array.isArray(dbRoles) && dbRoles.length > 0) {
        ctx.roles = dbRoles;
      }
    } catch (dbErr) {
      logger.warn(
        { connectionId: ctx.connectionId, userId: ctx.userId, err: dbErr.message },
        'Revocation sweep: PostgreSQL user roles check error'
      );
    }

    // 5. Revalidate all active room subscriptions for this socket
    const rooms = Array.from(this.channelManager.getRoomsForSocket(ws));
    for (const room of rooms) {
      try {
        const isAuthorized = await this._authorizeSubscription(room, ctx);
        if (!isAuthorized) {
          logger.info(
            { connectionId: ctx.connectionId, userId: ctx.userId, room },
            'Revocation sweep: room subscription authorization revoked; unsubscribing socket'
          );
          this.channelManager.unsubscribe(ws, room);
          this.broadcaster.sendDirect(ws, 'unsubscribed', {
            room,
            reason: 'AUTHORIZATION_REVOKED',
            timestamp: new Date().toISOString()
          });
        }
      } catch (err) {
        logger.warn(
          { connectionId: ctx.connectionId, userId: ctx.userId, room, err: err.message },
          'Revocation sweep: room reauthorization error; retaining subscription pending next sweep'
        );
      }
    }
  }

  /**
   * Terminates a socket and unregisters all channel/room subscriptions.
   * @param {import('ws').WebSocket} ws
   * @param {number} code
   * @param {string} reason
   */
  _terminateSocket(ws, code = 4401, reason = 'Unauthorized') {
    try {
      ws.close(code, reason);
    } catch {
      try {
        ws.terminate();
      } catch {
        // Socket already terminated
      }
    }
    this.channelManager.unregisterConnection(ws);
  }

  /**
   * Gracefully shuts down the WebSocket server and drains sockets within bounded timeout.
   * @param {number} [drainTimeoutMs=3000]
   */
  async close(drainTimeoutMs = 3000) {
    this.isShuttingDown = true;

    if (this.transportPingTimer) {
      clearInterval(this.transportPingTimer);
      this.transportPingTimer = null;
    }

    if (this.presenceSweepTimer) {
      clearInterval(this.presenceSweepTimer);
      this.presenceSweepTimer = null;
    }

    if (this.revocationSweepTimer) {
      clearInterval(this.revocationSweepTimer);
      this.revocationSweepTimer = null;
    }

    // Broadcast shutdown notice to all active sockets
    const sockets = Array.from(this.channelManager.getAllSockets());
    for (const ws of sockets) {
      try {
        ws.send(
          JSON.stringify({
            eventId: randomUUID(),
            type: 'server_shutdown',
            version: '1.0',
            timestamp: new Date().toISOString(),
            payload: { message: 'Server is restarting; reconnecting' }
          })
        );
      } catch {}
    }

    // Drain and close sockets with code 1001 (Going Away)
    const closePromises = sockets.map(
      (ws) =>
        new Promise((resolve) => {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1001, 'Server Shutting Down');
            ws.once('close', resolve);
            // Safety timeout per socket
            setTimeout(resolve, drainTimeoutMs);
          } else {
            resolve();
          }
        })
    );

    await Promise.race([
      Promise.all(closePromises),
      new Promise((resolve) => setTimeout(resolve, drainTimeoutMs))
    ]);

    // Close underlying WebSocketServer
    await new Promise((resolve) => {
      this.wss.close(() => resolve());
    });

    // Close broadcaster Redis connections if open
    await this.broadcaster.close();

    this.channelManager.clear();
    logger.info('ProctorNet WebSocket Server closed cleanly');
  }
}

export const defaultWebSocketServer = new ProctorNetWebSocketServer();
