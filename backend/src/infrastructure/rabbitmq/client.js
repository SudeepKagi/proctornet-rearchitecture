import amqp from 'amqplib';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

let connectionInstance = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let isClosing = false;
const activeChannels = new Set();
const reconnectHooks = new Set();

/**
 * Registers an asynchronous hook to be executed upon successful reconnection.
 * Returns an unregister function.
 * @param {Function} hook - async (connection) => Promise<void>
 * @returns {Function} unregister function
 */
export function registerReconnectHook(hook) {
  reconnectHooks.add(hook);
  return () => reconnectHooks.delete(hook);
}

/**
 * Clears all registered reconnect hooks (used for test isolation).
 */
export function clearReconnectHooks() {
  reconnectHooks.clear();
}

/**
 * Executes all registered reconnect hooks with the provided connection.
 * @param {import('amqplib').Connection} [conn]
 * @returns {Promise<void>}
 */
export async function runReconnectHooks(conn = connectionInstance) {
  if (!conn) return;
  for (const hook of reconnectHooks) {
    try {
      await hook(conn);
    } catch (hookErr) {
      logger.error({ err: hookErr.message }, 'Error executing RabbitMQ reconnect hook');
    }
  }
}

/**
 * Manually forces a reconnection sequence, closing existing connection if any
 * and notifying all registered reconnect hooks.
 * @returns {Promise<import('amqplib').Connection | null>}
 */
export async function reconnectRabbitMQ() {
  if (isClosing) return null;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (connectionInstance) {
    try {
      connectionInstance.removeAllListeners('close');
      connectionInstance.removeAllListeners('error');
      await connectionInstance.close().catch(() => {});
    } catch {
      // Ignore close error during forced reconnect
    }
    connectionInstance = null;
  }

  const newConn = await createRabbitMQConnection();
  connectionInstance = newConn;
  logger.info('RabbitMQ connection re-established; executing reconnect hooks');
  await runReconnectHooks(newConn);
  return newConn;
}

/**
 * Detects whether code is executing within a test runner environment.
 * Robust against environments where .env sets NODE_ENV=development.
 * Checks config.NODE_ENV, process.env.NODE_ENV, process.execArgv, process.argv, and test runner contexts.
 * @param {object} [overrideSignals] Optional signals for unit testing the detector.
 * @returns {boolean}
 */
export function isTestRunner(overrideSignals = null) {
  if (overrideSignals) {
    return Boolean(
      overrideSignals.nodeEnv === 'test' ||
      (Array.isArray(overrideSignals.execArgv) && overrideSignals.execArgv.includes('--test')) ||
      (Array.isArray(overrideSignals.argv) && overrideSignals.argv.some(arg => typeof arg === 'string' && (arg === '--test' || arg.includes('--test')))) ||
      Boolean(overrideSignals.testContext)
    );
  }

  return Boolean(
    config.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'test' ||
    (Array.isArray(process.execArgv) && process.execArgv.includes('--test')) ||
    (Array.isArray(process.argv) && process.argv.some(arg => typeof arg === 'string' && (arg === '--test' || arg.includes('--test')))) ||
    Boolean(process.env.NODE_TEST_CONTEXT)
  );
}

/**
 * Returns RabbitMQ connection options, enforcing strict RABBITMQ_URL precedence.
 * If RABBITMQ_URL is set, it takes 100% precedence over individual parameters.
 * @param {object} [envConfig=config]
 * @returns {{ url: string, isUrl: boolean, [key: string]: any }}
 */
export function getRabbitMQConnectionConfig(envConfig = config) {
  if (envConfig.RABBITMQ_URL && envConfig.RABBITMQ_URL.trim() !== '') {
    logger.info('RabbitMQ connection configured via RABBITMQ_URL (individual host/port/credentials ignored)');
    return {
      url: envConfig.RABBITMQ_URL,
      isUrl: true
    };
  }

  const vhost = envConfig.RABBITMQ_VHOST || '/';
  const cleanVhost = vhost === '/' ? '' : (vhost.startsWith('/') ? vhost.slice(1) : vhost);
  const url = `amqp://${encodeURIComponent(envConfig.RABBITMQ_USER)}:${encodeURIComponent(envConfig.RABBITMQ_PASSWORD)}@${envConfig.RABBITMQ_HOST}:${envConfig.RABBITMQ_PORT}/${encodeURIComponent(cleanVhost)}`;

  return {
    url,
    isUrl: false,
    protocol: 'amqp',
    hostname: envConfig.RABBITMQ_HOST,
    port: envConfig.RABBITMQ_PORT,
    username: envConfig.RABBITMQ_USER,
    password: envConfig.RABBITMQ_PASSWORD,
    vhost: envConfig.RABBITMQ_VHOST,
    heartbeat: envConfig.RABBITMQ_HEARTBEAT_SEC
  };
}

/**
 * Default reconnect retry strategy for RabbitMQ.
 * - Test environment: max 1 retry with small delay, preventing unhandled reconnection loops from keeping test process alive.
 * - Non-test environment: exponential backoff capped at 5000ms with bounded max retry count (times > 10).
 * @param {number} times - 1-based reconnection attempt counter.
 * @param {boolean} [isTest] - Optional flag indicating test mode.
 * @returns {number | null} Delay in milliseconds, or null to terminate reconnecting.
 */
export function defaultRetryStrategy(times, isTest = isTestRunner()) {
  if (isTest) {
    if (times > 1) {
      return null;
    }
    return 50;
  }

  // Non-test environment: bounded maximum retry count (10 attempts)
  if (times > 10) {
    return null;
  }

  // Bounded backoff: Math.min(times * 500, 5000) ms
  return Math.min(times * 500, 5000);
}

/**
 * Creates a configured RabbitMQ connection instance.
 * @param {object} [customConfig]
 * @returns {Promise<import('amqplib').Connection>}
 */
export async function createRabbitMQConnection(customConfig = {}) {
  const connConfig = getRabbitMQConnectionConfig({ ...config, ...customConfig });
  const connectOptions = {
    timeout: customConfig.timeout || config.RABBITMQ_CONNECT_TIMEOUT_MS || 5000,
    heartbeat: customConfig.heartbeat ?? (isTestRunner() ? 0 : config.RABBITMQ_HEARTBEAT_SEC || 60)
  };

  const connection = await amqp.connect(connConfig.url, connectOptions);

  if (isTestRunner() && typeof connection.connection?.stream?.unref === 'function') {
    connection.connection.stream.unref();
  }

  connection.on('error', (err) => {
    logger.warn({ err: err.message }, 'RabbitMQ connection error');
  });

  connection.on('close', () => {
    logger.warn('RabbitMQ connection closed');
    if (connectionInstance === connection) {
      connectionInstance = null;
    }
    if (!isClosing) {
      scheduleReconnect();
    }
  });

  logger.info('RabbitMQ connection established');
  reconnectAttempts = 0;
  return connection;
}

/**
 * Schedules a reconnection attempt if allowed by the retry strategy.
 */
export function scheduleReconnect() {
  if (isClosing || reconnectTimer) return;

  reconnectAttempts += 1;
  const delay = defaultRetryStrategy(reconnectAttempts);

  if (delay === null) {
    logger.warn({ attempts: reconnectAttempts }, 'RabbitMQ reconnection attempts exhausted; stopping reconnect loop');
    return;
  }

  logger.info({ attempts: reconnectAttempts, delayMs: delay }, 'Scheduling RabbitMQ reconnection');
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      if (!isClosing && !connectionInstance) {
        const newConn = await createRabbitMQConnection();
        connectionInstance = newConn;
        logger.info('RabbitMQ reconnection succeeded; executing reconnect hooks');
        await runReconnectHooks(newConn);
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'RabbitMQ reconnection attempt failed');
      scheduleReconnect();
    }
  }, delay);

  if (typeof reconnectTimer.unref === 'function') {
    reconnectTimer.unref();
  }
}

/**
 * Gets or creates the singleton RabbitMQ connection instance.
 * @returns {Promise<import('amqplib').Connection | null>}
 */
export async function getRabbitMQConnection() {
  if (!config.RABBITMQ_ENABLED) {
    return null;
  }

  if (connectionInstance) {
    return connectionInstance;
  }

  isClosing = false;
  try {
    connectionInstance = await createRabbitMQConnection();
    return connectionInstance;
  } catch (err) {
    if (!isClosing) {
      scheduleReconnect();
    }
    throw err;
  }
}

/**
 * Sets the singleton RabbitMQ connection (useful for unit testing with mocks).
 * @param {any} connection
 */
export function setRabbitMQConnection(connection) {
  connectionInstance = connection;
}

/**
 * Creates and registers an AMQP ConfirmChannel.
 * Tracks active channels for clean lifecycle and graceful shutdown.
 * @param {import('amqplib').Connection} [connection]
 * @returns {Promise<import('amqplib').ConfirmChannel>}
 */
export async function createConfirmChannel(connection = null) {
  const conn = connection || (await getRabbitMQConnection());
  if (!conn) {
    throw new Error('Cannot create ConfirmChannel: RabbitMQ connection is not available');
  }

  const channel = await conn.createConfirmChannel();
  activeChannels.add(channel);

  const cleanup = () => {
    activeChannels.delete(channel);
  };

  channel.once('close', cleanup);
  channel.once('error', (err) => {
    logger.warn({ err: err.message }, 'RabbitMQ ConfirmChannel error');
    cleanup();
  });

  return channel;
}

/**
 * Publishes a message to a ConfirmChannel with mandatory routing verification and timeout bounds.
 * Resolves ONLY when confirmed by the broker AND verified not returned as unroutable.
 * Rejects when broker rejects (nack), mandatory return occurs, channel/connection fails, or timeout expires.
 *
 * Contract:
 * - resolve only when broker confirmation succeeds AND no correlated basic.return was received.
 * - reject when broker nacks, mandatory basic.return occurs, channel/connection fails, or timeout expires.
 * - timeout uses RABBITMQ_MANDATORY_TIMEOUT_MS and performs complete listener/timer cleanup.
 *
 * @param {import('amqplib').ConfirmChannel} channel
 * @param {string} exchange
 * @param {string} routingKey
 * @param {Buffer} content
 * @param {object} [options]
 * @returns {Promise<{ published: boolean, messageId: string }>}
 */
export async function publishConfirmed(channel, exchange, routingKey, content, options = {}) {
  const messageId = options.messageId;
  if (!messageId) {
    throw new Error('publishConfirmed requires options.messageId for routing correlation');
  }

  const timeoutMs = options.timeoutMs || config.RABBITMQ_MANDATORY_TIMEOUT_MS || 5000;

  return new Promise((resolve, reject) => {
    let isSettled = false;
    let isReturned = false;
    let returnReason = null;
    let timeoutTimer = null;

    const cleanup = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      channel.removeListener('return', onReturn);
      channel.removeListener('error', onChannelError);
      channel.removeListener('close', onChannelClose);
    };

    const settle = (err, result) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    };

    const onReturn = (msg) => {
      if (msg.properties && msg.properties.messageId === messageId) {
        isReturned = true;
        returnReason = `Message unroutable: no matching queue binding for routingKey '${msg.fields.routingKey}' on exchange '${msg.fields.exchange}' (replyCode: ${msg.fields.replyCode}, replyText: ${msg.fields.replyText})`;
      }
    };

    const onChannelError = (err) => {
      settle(new Error(`Channel error during publishConfirmed: ${err.message}`));
    };

    const onChannelClose = () => {
      settle(new Error('Channel closed before publish confirmation was received'));
    };

    channel.on('return', onReturn);
    channel.once('error', onChannelError);
    channel.once('close', onChannelClose);

    timeoutTimer = setTimeout(() => {
      settle(new Error(`publishConfirmed timed out after ${timeoutMs}ms waiting for broker confirm/return`));
    }, timeoutMs);

    if (typeof timeoutTimer.unref === 'function') {
      timeoutTimer.unref();
    }

    channel.publish(
      exchange,
      routingKey,
      content,
      {
        ...options,
        mandatory: true,
        persistent: true,
        messageId
      },
      (err) => {
        // setImmediate tick ensures any synchronous basic.return frame event is received and handled first
        setImmediate(() => {
          if (isReturned) {
            settle(new Error(returnReason));
          } else if (err) {
            settle(err);
          } else {
            settle(null, { published: true, messageId });
          }
        });
      }
    );
  });
}

/**
 * Probes the RabbitMQ server to verify connectivity for readiness checks.
 * Non-fatal probe with a configurable timeout.
 * @param {number} [timeoutMs=2000]
 * @returns {Promise<{ healthy: boolean, status: string, latencyMs?: number, error?: string }>}
 */
export async function checkRabbitMQHealth(timeoutMs = 2000) {
  if (!config.RABBITMQ_ENABLED) {
    return {
      healthy: false,
      status: 'DISABLED',
      error: 'RabbitMQ is disabled by configuration'
    };
  }

  if (!connectionInstance) {
    return {
      healthy: false,
      status: 'DOWN',
      error: 'RabbitMQ connection not established'
    };
  }

  const start = process.hrtime.bigint();
  try {
    let timerId;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error('RabbitMQ health check timeout')), timeoutMs);
      if (typeof timerId.unref === 'function') timerId.unref();
    });

    const probePromise = (async () => {
      const channel = await connectionInstance.createChannel();
      await channel.close();
    })();

    await Promise.race([probePromise, timeoutPromise]);
    clearTimeout(timerId);

    const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
    return {
      healthy: true,
      status: 'UP',
      latencyMs: Number(latencyMs.toFixed(2))
    };
  } catch (err) {
    return {
      healthy: false,
      status: 'DOWN',
      error: err instanceof Error ? err.message : 'RabbitMQ health probe failed'
    };
  }
}

/**
 * Closes all active channels and the RabbitMQ connection during graceful shutdown.
 * Guarantees zero open handles or sockets remain in the Node.js event loop.
 * @returns {Promise<void>}
 */
export async function closeRabbitMQ() {
  isClosing = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Close all active channels
  for (const channel of activeChannels) {
    try {
      await channel.close().catch(() => {});
    } catch {
      // Ignore channel close errors during teardown
    }
  }
  activeChannels.clear();

  if (connectionInstance) {
    logger.info('Closing RabbitMQ connection...');
    try {
      if (typeof connectionInstance.removeAllListeners === 'function') {
        connectionInstance.removeAllListeners('close');
        connectionInstance.removeAllListeners('error');
      }
      if (typeof connectionInstance.close === 'function') {
        await connectionInstance.close().catch(() => {});
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Error closing RabbitMQ connection');
    } finally {
      connectionInstance = null;
      reconnectAttempts = 0;
      reconnectHooks.clear();
      logger.info('RabbitMQ connection closed cleanly');
    }
  }
}
