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
    .default('900')
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

  return Object.freeze(result.data);
}

// Export parsed and frozen configuration singleton
export const config = validateConfig(process.env);
