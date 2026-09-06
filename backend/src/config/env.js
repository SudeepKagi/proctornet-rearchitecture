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
    .default('15')
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
