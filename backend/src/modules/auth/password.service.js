/**
 * @file password.service.js
 * @description Secure password hashing and constant-time verification using bcrypt.
 */

import bcrypt from 'bcrypt';
import { config } from '../../config/env.js';

const SALT_ROUNDS = config.NODE_ENV === 'test' ? 10 : 12;

/**
 * Hashes a plaintext password securely.
 * @param {string} plaintextPassword
 * @returns {Promise<string>} Salted hash string
 */
export async function hashPassword(plaintextPassword) {
  if (typeof plaintextPassword !== 'string' || plaintextPassword.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  return bcrypt.hash(plaintextPassword, SALT_ROUNDS);
}

/**
 * Compares a plaintext password against a stored bcrypt hash in constant time.
 * @param {string} plaintextPassword
 * @param {string} hash
 * @returns {Promise<boolean>} True if matching, false otherwise
 */
export async function verifyPassword(plaintextPassword, hash) {
  if (typeof plaintextPassword !== 'string' || typeof hash !== 'string') {
    return false;
  }
  try {
    return await bcrypt.compare(plaintextPassword, hash);
  } catch {
    return false;
  }
}
