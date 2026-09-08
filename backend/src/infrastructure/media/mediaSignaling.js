/**
 * @file mediaSignaling.js
 * @description Inbound WebRTC signaling command dispatcher and PostgreSQL BOLA authorizer (Phase 17).
 */

import { query } from '../postgres/pool.js';
import { logger } from '../../utils/logger.js';
import { recordAuditEvent } from '../../modules/audit/audit.service.js';
import { defaultSfuManager } from './sfuManager.js';
import { mediaCommandSchemas } from './media.schemas.js';
import { wsMediaFailuresTotal } from '../metrics/registry.js';

/**
 * Authorizes a participant for an examination session against PostgreSQL authoritative tables.
 *
 * Rules:
 * 1. Candidate (STUDENT):
 *    - Must own an attempt in exam_attempts where student_id = userId AND status = 'ACTIVE' AND session_id = sessionId.
 *    - Can only publish (direction: 'send'). Cannot subscribe (direction: 'recv').
 * 2. Invigilator (INVIGILATOR):
 *    - Must be assigned in session_invigilators where session_id = sessionId AND user_id = userId.
 *    - Can only subscribe (direction: 'recv'). Cannot publish (direction: 'send').
 * 3. Faculty (FACULTY):
 *    - Must be the creator of the exam associated with this session in exams e JOIN exam_sessions s ON s.exam_id = e.exam_id.
 *    - Can only subscribe (direction: 'recv'). Cannot publish.
 * 4. Admin (ADMIN):
 *    - Global read-only subscription permitted (direction: 'recv').
 *
 * @param {object} params
 * @param {string} params.sessionId
 * @param {string} params.userId
 * @param {string[]} params.roles
 * @param {'send' | 'recv'} params.direction
 * @returns {Promise<{ authorized: boolean, reason?: string, attemptId?: string }>}
 */
export async function authorizeParticipant({ sessionId, userId, roles, direction }) {
  if (!roles || roles.length === 0) {
    return { authorized: false, reason: 'NO_ROLES' };
  }

  // 1. ADMIN - global read-only monitoring
  if (roles.includes('ADMIN')) {
    if (direction === 'send') {
      return { authorized: false, reason: 'ADMIN_CANNOT_PUBLISH' };
    }
    return { authorized: true };
  }

  // 2. STUDENT - candidate publisher
  if (roles.includes('STUDENT')) {
    if (direction === 'recv') {
      return { authorized: false, reason: 'CANDIDATE_CANNOT_CONSUME' };
    }

    const attemptRes = await query(
      `SELECT attempt_id, status FROM exam_attempts
       WHERE session_id = $1 AND student_id = $2 AND status = 'ACTIVE'
       LIMIT 1;`,
      [sessionId, userId]
    );

    if (attemptRes.rows.length === 0) {
      return { authorized: false, reason: 'NO_ACTIVE_ATTEMPT_IN_SESSION' };
    }

    return { authorized: true, attemptId: attemptRes.rows[0].attempt_id };
  }

  // 3. INVIGILATOR - assigned proctor
  if (roles.includes('INVIGILATOR')) {
    if (direction === 'send') {
      return { authorized: false, reason: 'INVIGILATOR_CANNOT_PUBLISH' };
    }

    const invigRes = await query(
      `SELECT 1 FROM session_invigilators
       WHERE session_id = $1 AND user_id = $2
       LIMIT 1;`,
      [sessionId, userId]
    );

    if (invigRes.rows.length === 0) {
      return { authorized: false, reason: 'INVIGILATOR_NOT_ASSIGNED_TO_SESSION' };
    }

    return { authorized: true };
  }

  // 4. FACULTY - exam author
  if (roles.includes('FACULTY')) {
    if (direction === 'send') {
      return { authorized: false, reason: 'FACULTY_CANNOT_PUBLISH' };
    }

    const facultyRes = await query(
      `SELECT 1 FROM exam_sessions s
       JOIN exams e ON s.exam_id = e.exam_id
       WHERE s.session_id = $1 AND e.created_by = $2
       LIMIT 1;`,
      [sessionId, userId]
    );

    if (facultyRes.rows.length === 0) {
      return { authorized: false, reason: 'FACULTY_NOT_OWNER_OF_EXAM' };
    }

    return { authorized: true };
  }

  return { authorized: false, reason: 'ROLE_UNAUTHORIZED' };
}

/**
 * Handles incoming media signaling commands from an authenticated WebSocket connection.
 *
 * @param {import('ws').WebSocket} ws
 * @param {object} context
 * @param {object} command - Parsed JSON command { type, payload }
 * @param {import('../realtime/realtimeBroadcaster.js').RealtimeBroadcaster} broadcaster
 */
export async function handleMediaSignaling(ws, context, command, broadcaster) {
  const schema = mediaCommandSchemas[command.type];
  if (!schema) {
    broadcaster.sendDirect(ws, 'error', {
      code: 'INVALID_COMMAND',
      message: `Unknown media command type: ${command.type}`
    });
    return;
  }

  const parseResult = schema.safeParse(command.payload || {});
  if (!parseResult.success) {
    wsMediaFailuresTotal.inc({ reason: 'BOLA_REJECTED' });
    broadcaster.sendDirect(ws, 'error', {
      code: 'INVALID_COMMAND',
      message: parseResult.error.errors[0]?.message || 'Schema validation failed'
    });
    return;
  }

  const payload = parseResult.data;

  try {
    switch (command.type) {
      case 'media:get_router_capabilities': {
        const sessionId = payload.sessionId || context.sessionId;
        if (!sessionId) {
          broadcaster.sendDirect(ws, 'error', {
            code: 'SESSION_REQUIRED',
            message: 'sessionId is required to obtain router capabilities'
          });
          return;
        }

        const { router, workerId, workerGeneration } = await defaultSfuManager.getOrCreateRouter(sessionId);
        broadcaster.sendDirect(ws, 'media:router_capabilities', {
          sessionId,
          workerId,
          workerGeneration,
          rtpCapabilities: router.rtpCapabilities
        });
        break;
      }

      case 'media:create_transport': {
        const { sessionId, direction } = payload;
        const auth = await authorizeParticipant({
          sessionId,
          userId: context.userId,
          roles: context.roles,
          direction
        });

        if (!auth.authorized) {
          wsMediaFailuresTotal.inc({ reason: 'BOLA_REJECTED' });
          logger.warn(
            { userId: context.userId, sessionId, direction, reason: auth.reason },
            'BOLA rejected media:create_transport attempt'
          );

          await recordAuditEvent({
            action: 'MEDIA_UNAUTHORIZED_ACCESS_BLOCKED',
            resourceType: 'exam_session',
            resourceId: sessionId,
            actorUserId: context.userId,
            metadata: { direction, reason: auth.reason }
          }).catch(() => {});

          broadcaster.sendDirect(ws, 'error', {
            code: 'FORBIDDEN',
            message: `Authorization denied: ${auth.reason}`
          });
          return;
        }

        context.sessionId = sessionId;
        if (auth.attemptId) {
          context.attemptId = auth.attemptId;
        }

        const transportParams = await defaultSfuManager.createTransport(
          sessionId,
          context.connectionId,
          context.userId,
          direction
        );

        await recordAuditEvent({
          action: 'MEDIA_SESSION_JOINED',
          resourceType: 'exam_session',
          resourceId: sessionId,
          actorUserId: context.userId,
          metadata: { direction, transportId: transportParams.id }
        }).catch(() => {});

        broadcaster.sendDirect(ws, 'media:transport_created', {
          sessionId,
          direction,
          ...transportParams
        });
        break;
      }

      case 'media:connect_transport': {
        const { transportId, dtlsParameters } = payload;
        await defaultSfuManager.connectTransport(transportId, dtlsParameters);
        broadcaster.sendDirect(ws, 'media:transport_connected', { transportId });
        break;
      }

      case 'media:produce': {
        const { transportId, kind, rtpParameters, appData } = payload;
        const transportObj = defaultSfuManager.transports.get(transportId);
        if (!transportObj) {
          broadcaster.sendDirect(ws, 'error', {
            code: 'TRANSPORT_NOT_FOUND',
            message: 'Transport not found or closed'
          });
          return;
        }

        // Must be candidate with active attempt
        const auth = await authorizeParticipant({
          sessionId: transportObj.sessionId,
          userId: context.userId,
          roles: context.roles,
          direction: 'send'
        });

        if (!auth.authorized) {
          wsMediaFailuresTotal.inc({ reason: 'BOLA_REJECTED' });
          broadcaster.sendDirect(ws, 'error', {
            code: 'FORBIDDEN',
            message: `Authorization denied: ${auth.reason}`
          });
          return;
        }

        const produceRes = await defaultSfuManager.produce(
          transportObj.sessionId,
          transportId,
          kind,
          rtpParameters,
          appData,
          context.connectionId,
          context.userId
        );

        await recordAuditEvent({
          action: 'MEDIA_STREAM_STARTED',
          resourceType: 'exam_session',
          resourceId: transportObj.sessionId,
          actorUserId: context.userId,
          metadata: {
            producerId: produceRes.id,
            trackType: appData?.trackType || 'webcam',
            kind
          }
        }).catch(() => {});

        broadcaster.sendDirect(ws, 'media:produced', {
          id: produceRes.id,
          transportId
        });
        break;
      }

      case 'media:consume': {
        const { transportId, producerId, rtpCapabilities } = payload;
        const transportObj = defaultSfuManager.transports.get(transportId);
        if (!transportObj) {
          broadcaster.sendDirect(ws, 'error', {
            code: 'TRANSPORT_NOT_FOUND',
            message: 'Transport not found or closed'
          });
          return;
        }

        // Must be invigilator, faculty, or admin
        const auth = await authorizeParticipant({
          sessionId: transportObj.sessionId,
          userId: context.userId,
          roles: context.roles,
          direction: 'recv'
        });

        if (!auth.authorized) {
          wsMediaFailuresTotal.inc({ reason: 'BOLA_REJECTED' });
          broadcaster.sendDirect(ws, 'error', {
            code: 'FORBIDDEN',
            message: `Authorization denied: ${auth.reason}`
          });
          return;
        }

        const consumed = await defaultSfuManager.consume(
          transportObj.sessionId,
          transportId,
          producerId,
          rtpCapabilities,
          context.connectionId,
          context.userId
        );

        broadcaster.sendDirect(ws, 'media:consumed', consumed);
        break;
      }

      case 'media:consume_batch': {
        const { transportId, rtpCapabilities, producerIds } = payload;
        const transportObj = defaultSfuManager.transports.get(transportId);
        if (!transportObj) {
          broadcaster.sendDirect(ws, 'error', {
            code: 'TRANSPORT_NOT_FOUND',
            message: 'Transport not found or closed'
          });
          return;
        }

        const auth = await authorizeParticipant({
          sessionId: transportObj.sessionId,
          userId: context.userId,
          roles: context.roles,
          direction: 'recv'
        });

        if (!auth.authorized) {
          wsMediaFailuresTotal.inc({ reason: 'BOLA_REJECTED' });
          broadcaster.sendDirect(ws, 'error', {
            code: 'FORBIDDEN',
            message: `Authorization denied: ${auth.reason}`
          });
          return;
        }

        const batchRes = await defaultSfuManager.consumeBatch(
          transportObj.sessionId,
          transportId,
          producerIds,
          rtpCapabilities,
          context.connectionId,
          context.userId
        );

        broadcaster.sendDirect(ws, 'media:consumed_batch', batchRes);
        break;
      }

      case 'media:consumer_set_layers': {
        const { consumerId, spatialLayer, temporalLayer } = payload;
        await defaultSfuManager.setConsumerLayers(consumerId, spatialLayer, temporalLayer);
        broadcaster.sendDirect(ws, 'media:consumer_layers_set', {
          consumerId,
          spatialLayer,
          temporalLayer
        });
        break;
      }

      case 'media:consumer_pause': {
        const { consumerId } = payload;
        await defaultSfuManager.pauseConsumer(consumerId);
        broadcaster.sendDirect(ws, 'media:consumer_paused', { consumerId });
        break;
      }

      case 'media:consumer_resume': {
        const { consumerId } = payload;
        await defaultSfuManager.resumeConsumer(consumerId);
        broadcaster.sendDirect(ws, 'media:consumer_resumed', { consumerId });
        break;
      }

      case 'media:restart_ice': {
        const { transportId } = payload;
        const res = await defaultSfuManager.restartIce(transportId);
        broadcaster.sendDirect(ws, 'media:ice_restarted', {
          transportId,
          iceParameters: res.iceParameters
        });
        break;
      }

      case 'media:close_producer': {
        const { producerId } = payload;
        const producerObj = defaultSfuManager.producers.get(producerId);
        const sessionId = producerObj?.sessionId;
        const trackType = producerObj?.trackType;

        await defaultSfuManager.closeProducer(producerId);

        if (sessionId) {
          await recordAuditEvent({
            action: 'MEDIA_STREAM_STOPPED',
            resourceType: 'exam_session',
            resourceId: sessionId,
            actorUserId: context.userId,
            metadata: { producerId, trackType }
          }).catch(() => {});
        }

        broadcaster.sendDirect(ws, 'media:producer_closed', { producerId });
        break;
      }

      default:
        broadcaster.sendDirect(ws, 'error', {
          code: 'INVALID_COMMAND',
          message: `Unhandled media command: ${command.type}`
        });
    }
  } catch (err) {
    if (err.code === 'MEDIA_SESSION_RESETTING') {
      broadcaster.sendDirect(ws, 'error', {
        type: 'error',
        code: 'MEDIA_SESSION_RESETTING',
        workerId: err.workerId,
        epoch: err.epoch,
        message: err.message
      });
      return;
    }

    logger.warn({ command: command.type, err: err.message, code: err.code }, 'Media signaling execution error');
    broadcaster.sendDirect(ws, 'error', {
      code: err.code || 'MEDIA_ERROR',
      message: err.message || 'Media signaling failed'
    });
  }
}
