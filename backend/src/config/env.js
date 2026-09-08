import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file for local development
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z
    .string()
    .regex(/^\d+$/, { message: 'PORT must be a valid port number' })
    .transform(Number)
    .default('4000'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000'),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:5173')
    .transform((val) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    ),

  // PostgreSQL configuration
  DATABASE_URL: z.string().url().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z
    .string()
    .regex(/^\d+$/, { message: 'DB_PORT must be a valid port number' })
    .transform(Number)
    .default('5432'),
  DB_NAME: z.string().default('proctornet'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_POOL_MIN: z
    .string()
    .regex(/^\d+$/, { message: 'DB_POOL_MIN must be a valid integer' })
    .transform(Number)
    .default('2'),
  DB_POOL_MAX: z
    .string()
    .regex(/^\d+$/, { message: 'DB_POOL_MAX must be a valid integer' })
    .transform(Number)
    .default('10'),
  DB_CONNECTION_TIMEOUT_MS: z
    .string()
    .regex(/^\d+$/, { message: 'DB_CONNECTION_TIMEOUT_MS must be a valid integer' })
    .transform(Number)
    .default('5000'),
  DB_IDLE_TIMEOUT_MS: z
    .string()
    .regex(/^\d+$/, { message: 'DB_IDLE_TIMEOUT_MS must be a valid integer' })
    .transform(Number)
    .default('30000'),

  // Authentication & Security configuration
  JWT_ACCESS_SECRET: z
    .string()
    .min(16, { message: 'JWT_ACCESS_SECRET must be at least 16 characters' })
    .default('proctornet-dev-jwt-access-secret-32-chars-long'),
  JWT_ACCESS_EXPIRATION: z
    .string()
    .default('15m'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, { message: 'JWT_REFRESH_SECRET must be at least 16 characters' })
    .default('proctornet-dev-jwt-refresh-secret-32-chars-long'),
  JWT_REFRESH_EXPIRATION: z
    .string()
    .default('7d'),
  AUTH_LOCKOUT_MAX_ATTEMPTS: z
    .string()
    .regex(/^\d+$/, { message: 'AUTH_LOCKOUT_MAX_ATTEMPTS must be a valid integer' })
    .transform(Number)
    .default('5'),
  AUTH_LOCKOUT_DURATION_MINUTES: z
    .string()
    .regex(/^\d+$/, { message: 'AUTH_LOCKOUT_DURATION_MINUTES must be a valid integer' })
    .transform(Number)
    .default('15'),

  // Redis configuration
  REDIS_ENABLED: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .default('true')
    .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1')),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z
    .string()
    .regex(/^\d+$/, { message: 'REDIS_PORT must be a valid port number' })
    .transform(Number)
    .default('6379'),
  REDIS_PASSWORD: z
    .string()
    .optional()
    .transform((val) => (val && val.trim() !== '' ? val : undefined)),
  REDIS_DB: z
    .string()
    .regex(/^\d+$/, { message: 'REDIS_DB must be a valid integer' })
    .transform(Number)
    .refine((val) => val >= 0 && val <= 15, { message: 'REDIS_DB must be between 0 and 15' })
    .default('0'),
  REDIS_CONNECT_TIMEOUT_MS: z
    .string()
    .regex(/^\d+$/, { message: 'REDIS_CONNECT_TIMEOUT_MS must be a valid integer' })
    .transform(Number)
    .default('5000'),

  // RabbitMQ configuration
  RABBITMQ_ENABLED: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .default('true')
    .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1')),
  RABBITMQ_URL: z
    .string()
    .url({ message: 'RABBITMQ_URL must be a valid URL' })
    .optional()
    .refine((val) => !val || val.startsWith('amqp://') || val.startsWith('amqps://'), {
      message: 'RABBITMQ_URL protocol must be amqp:// or amqps://'
    }),
  RABBITMQ_HOST: z.string().default('localhost'),
  RABBITMQ_PORT: z
    .string()
    .regex(/^\d+$/, { message: 'RABBITMQ_PORT must be a valid port number' })
    .transform(Number)
    .default('5672'),
  RABBITMQ_USER: z.string().default('guest'),
  RABBITMQ_PASSWORD: z.string().default('guest'),
  RABBITMQ_VHOST: z.string().default('/'),
  RABBITMQ_HEARTBEAT_SEC: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('60'),
  RABBITMQ_PREFETCH: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('10'),
  RABBITMQ_DISPATCH_INTERVAL_MS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('5000'),
  RABBITMQ_CONNECT_TIMEOUT_MS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('5000'),
  RABBITMQ_MANDATORY_TIMEOUT_MS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('5000'),

  // Metrics & Observability configuration
  METRICS_ENABLED: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .default('true')
    .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1')),
  METRICS_AUTH_TOKEN: z
    .string()
    .optional()
    .transform((val) => (val && val.trim() !== '' ? val : undefined)),

  // Evidence Storage & AWS S3 configuration (Phase 15)
  AWS_REGION: z
    .string()
    .default('ap-south-1'),
  S3_BUCKET_NAME: z
    .string()
    .default('proctornet-evidence-dev-01'),
  S3_ENDPOINT: z
    .string()
    .optional()
    .transform((val) => (val && val.trim() !== '' ? val : undefined)),
  S3_FORCE_PATH_STYLE: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .default('false')
    .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1')),
  EVIDENCE_RETENTION_DAYS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('90'),
  EVIDENCE_UPLOAD_TTL_SECONDS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('300'),
  EVIDENCE_PLAYBACK_TTL_SECONDS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('900'),

  // WebSocket Realtime configuration (Phase 16)
  WS_ENABLED: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .default('true')
    .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1')),
  WS_PRE_AUTH_RATE_LIMIT_PER_MIN: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('30'),
  WS_TRANSPORT_PING_INTERVAL_MS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('30000'),
  WS_PRESENCE_SWEEP_INTERVAL_MS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('5000'),
  WS_PRESENCE_LAPSE_THRESHOLD_MS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('15000'),
  WS_MAX_PAYLOAD_BYTES: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('16384'),
  WS_MAX_CONNECTIONS_PER_USER: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('3'),

  // Number of trusted reverse proxy hops in front of the server.
  // Used to safely extract the real client IP from X-Forwarded-For without
  // trusting attacker-supplied header values. Set to 0 when no proxy is used.
  WS_TRUSTED_PROXY_COUNT: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('1'),

  // Tier-4 per-connected-socket inbound application message rate limit (msgs/min).
  // Connections sending more than this many application messages per minute are
  // terminated with close code 1008 (Policy Violation).
  WS_INBOUND_RATE_LIMIT_PER_MIN: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('60'),

  // Interval (ms) between periodic server-side authorization revocation sweeps.
  // Each sweep re-checks the Redis session blacklist for all active connections
  // and terminates any whose session has been revoked since initial handshake.
  WS_REVOCATION_SWEEP_INTERVAL_MS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('60000'),

  // WebRTC / SFU Media configuration (Phase 17)
  MEDIA_ENABLED: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .default('true')
    .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1')),
  MEDIA_LISTEN_IP: z.string().default('127.0.0.1'),
  MEDIA_ANNOUNCED_IP: z
    .string()
    .optional()
    .transform((val) => (val && val.trim() !== '' ? val : undefined)),
  MEDIA_MIN_PORT: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('40000'),
  MEDIA_MAX_PORT: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('49999'),
  MEDIASOUP_NUM_WORKERS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .optional(),
  STUN_SERVER_URL: z.string().default('stun:stun.l.google.com:19302'),
  TURN_SERVER_URL: z
    .string()
    .optional()
    .transform((val) => (val && val.trim() !== '' ? val : undefined)),
  TURN_STATIC_AUTH_SECRET: z
    .string()
    .optional()
    .transform((val) => (val && val.trim() !== '' ? val : undefined)),
  TURN_CREDENTIAL_TTL_SEC: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('900'),
  WS_MEDIA_RATE_LIMIT_PER_MIN: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('240'),
  WS_MEDIA_BURST_CAPACITY: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('60'),
  WS_MEDIA_MAX_PAYLOAD_BYTES: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('65536'),
  MEDIA_SIGNING_SECRET: z
    .string()
    .min(32, { message: 'MEDIA_SIGNING_SECRET must be at least 32 characters' })
    .optional()
    .transform((val) => (val && val.trim() !== '' ? val : undefined)),

  // Phase 18 Security Hardening configuration
  ANTI_TAMPER_SECRET: z
    .string()
    .min(32, { message: 'ANTI_TAMPER_SECRET must be at least 32 characters' })
    .optional()
    .transform((val) => (val && val.trim() !== '' ? val : undefined)),
  ANTI_TAMPER_MAX_DRIFT_MS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('300000'),
  ALLOW_IN_MEMORY_NONCE_FALLBACK: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((val) => {
      if (val === undefined) return process.env.NODE_ENV !== 'production';
      return typeof val === 'boolean' ? val : val === 'true' || val === '1';
    }),
  SECURITY_MAGIC_BYTES_VERIFICATION: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .default('true')
    .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1')),
  CSP_REPORT_ONLY: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .default('false')
    .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1'))
}).superRefine((data, ctx) => {
  // Phase 18 Security Hardening production checks
  if (data.NODE_ENV === 'production') {
    if (!data.ANTI_TAMPER_SECRET || data.ANTI_TAMPER_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ANTI_TAMPER_SECRET'],
        message: 'ANTI_TAMPER_SECRET must be at least 32 characters in production'
      });
    }
    if (data.ALLOW_IN_MEMORY_NONCE_FALLBACK === true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ALLOW_IN_MEMORY_NONCE_FALLBACK'],
        message: 'ALLOW_IN_MEMORY_NONCE_FALLBACK cannot be true in production; multi-node replay protection requires shared Redis'
      });
    }
    if (data.CORS_ALLOWED_ORIGINS.some((origin) => origin === '*' || origin.includes('*'))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ALLOWED_ORIGINS'],
        message: 'Wildcard origins (*) are strictly prohibited in production CORS_ALLOWED_ORIGINS when credentials are enabled'
      });
    }
    for (const origin of data.CORS_ALLOWED_ORIGINS) {
      if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ALLOWED_ORIGINS'],
          message: `CORS_ALLOWED_ORIGINS contains invalid origin '${origin}'; must start with http:// or https://`
        });
      }
    }
  }

  if (data.NODE_ENV === 'production' && data.MEDIA_ENABLED) {
    if (!data.TURN_SERVER_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TURN_SERVER_URL'],
        message: 'TURN_SERVER_URL is required in production when MEDIA_ENABLED is true'
      });
    }
    if (!data.TURN_STATIC_AUTH_SECRET || data.TURN_STATIC_AUTH_SECRET.length < 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TURN_STATIC_AUTH_SECRET'],
        message: 'TURN_STATIC_AUTH_SECRET must be at least 16 characters in production when MEDIA_ENABLED is true'
      });
    }
    if (!data.MEDIA_ANNOUNCED_IP) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MEDIA_ANNOUNCED_IP'],
        message: 'MEDIA_ANNOUNCED_IP is required in production when MEDIA_ENABLED is true'
      });
    }
    if (data.MEDIA_LISTEN_IP === '127.0.0.1' || data.MEDIA_LISTEN_IP === 'localhost') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MEDIA_LISTEN_IP'],
        message: 'MEDIA_LISTEN_IP cannot be loopback in production; must be 0.0.0.0 or private interface address'
      });
    }
  }
});

/**
 * Validates environment variables against schema.
 * @param {Record<string, string | undefined>} envSource
 * @returns {z.infer<typeof envSchema>}
 */
export function validateConfig(envSource = process.env) {
  const result = envSchema.safeParse(envSource);

  if (!result.success) {
    const errorDetails = result.error.format();
    console.error('CRITICAL: Environment variable validation failed:');
    console.error(JSON.stringify(errorDetails, null, 2));
    throw new Error('Environment configuration validation failed on startup');
  }

  const resolvedData = {
    ...result.data,
    ANTI_TAMPER_SECRET: result.data.ANTI_TAMPER_SECRET || result.data.JWT_ACCESS_SECRET
  };

  return Object.freeze(resolvedData);
}

// Export parsed and frozen configuration singleton
export const config = validateConfig(process.env);
