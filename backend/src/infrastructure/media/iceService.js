/**
 * @file iceService.js
 * @description Generates ephemeral STUN/TURN ICE server credentials for authorized session participants (Phase 17).
 */

import crypto from 'node:crypto';
import { config } from '../../config/env.js';

/**
 * Generates ephemeral STUN and TURN server credentials for a user in an examination session.
 * Uses Coturn REST API HMAC-SHA1 ephemeral credential format:
 *   username: "<unix_timestamp_expiry>:<userId>"
 *   credential: Base64(HMAC-SHA1(turnSecret, username))
 *
 * @param {string} sessionId - Active exam session UUID
 * @param {object} user - Authenticated user object { userId, roles }
 * @param {object} [customConfig] - Optional configuration override (defaults to config)
 * @returns {{ iceServers: Array<{ urls: string[], username?: string, credential?: string }> }}
 */
export function getIceServersForSession(sessionId, user, customConfig = config) {
  const currentConfig = customConfig || config;
  const iceServers = [
    {
      urls: [currentConfig.STUN_SERVER_URL]
    }
  ];

  if (currentConfig.TURN_SERVER_URL && currentConfig.TURN_STATIC_AUTH_SECRET) {
    const ttlSeconds = currentConfig.TURN_CREDENTIAL_TTL_SEC || 900;
    const expiryTimestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const username = `${expiryTimestamp}:${user.userId || 'anonymous'}`;

    const hmac = crypto.createHmac('sha1', currentConfig.TURN_STATIC_AUTH_SECRET);
    hmac.update(username);
    const credential = hmac.digest('base64');

    iceServers.push({
      urls: [currentConfig.TURN_SERVER_URL],
      username,
      credential
    });
  } else if (currentConfig.NODE_ENV === 'production' && currentConfig.MEDIA_ENABLED) {
    const err = new Error('Proctoring relay server unavailable; please contact exam support');
    err.code = 'RELAY_UNAVAILABLE';
    throw err;
  }


  return { iceServers };
}
