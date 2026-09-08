/**
 * Sanitizes URL query parameters by redacting credentials and tokens.
 * @param {string} rawUrl
 * @returns {string}
 */
export function sanitizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  try {
    const qIndex = rawUrl.indexOf('?');
    if (qIndex === -1) return rawUrl;
    const path = rawUrl.slice(0, qIndex);
    const query = rawUrl.slice(qIndex + 1);
    const params = new URLSearchParams(query);
    const sensitiveKeys = ['token', 'access_token', 'password', 'secret', 'key', 'api_key'];
    let modified = false;
    for (const key of sensitiveKeys) {
      if (params.has(key)) {
        params.set(key, '[REDACTED]');
        modified = true;
      }
    }
    return modified ? `${path}?${params.toString()}` : rawUrl;
  } catch {
    return rawUrl;
  }
}

/**
 * Express middleware to log HTTP request completion with duration and status code.
 */
export function requestLogger(req, res, next) {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;

    const logData = {
      requestId: req.requestId,
      traceId: req.traceId,
      spanId: req.spanId,
      method: req.method,
      url: sanitizeUrl(req.originalUrl || req.url),
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent']
    };

    if (res.statusCode >= 500) {
      req.log ? req.log.error(logData, 'HTTP Request completed with server error') : console.error(logData);
    } else if (res.statusCode >= 400) {
      req.log ? req.log.warn(logData, 'HTTP Request completed with client error') : console.warn(logData);
    } else {
      req.log ? req.log.info(logData, 'HTTP Request completed successfully') : console.log(logData);
    }
  });

  next();
}
