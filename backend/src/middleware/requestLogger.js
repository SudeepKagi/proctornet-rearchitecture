/**
 * Express middleware to log HTTP request completion with duration and status code.
 */
export function requestLogger(req, res, next) {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;

    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
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
