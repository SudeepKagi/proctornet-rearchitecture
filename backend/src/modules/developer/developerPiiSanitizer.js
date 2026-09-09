/**
 * @file developerPiiSanitizer.js
 * @description Strict PII & Credential Sanitizer for Developer Operations.
 * Enforces multi-layer redaction of student PII, government IDs, biometrics,
 * exam answers, passwords, and tokens before exposing technical logs or audit events.
 */

// Field names that must be strictly redacted if present in objects
const SENSITIVE_KEY_PATTERNS = [
  /^password$/i,
  /^secret$/i,
  /^token$/i,
  /^accessToken$/i,
  /^refreshToken$/i,
  /^apiKey$/i,
  /^authorization$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /^embedding/i,
  /^face_embedding/i,
  /^biometric/i,
  /^answers$/i,
  /^answer_text$/i,
  /^answerText$/i,
  /^selected_option_id$/i,
  /^selectedOptionId$/i,
  /^numeric_value$/i,
  /^numericValue$/i,
  /^student_name$/i,
  /^candidate_name$/i,
  /^id_document/i,
  /^document_url/i,
  /^document_number/i,
  /^score$/i,
  /^total_score$/i,
  /^rubric/i
];

/**
 * Checks if an object key is sensitive.
 * @param {string} key
 * @returns {boolean}
 */
export function isSensitiveKey(key) {
  if (typeof key !== 'string') return false;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Redacts string content containing emails, JWTs, bearer tokens, or student IDs.
 * @param {string} text
 * @returns {string}
 */
export function redactText(text) {
  if (typeof text !== 'string') return text;

  return text
    .replace(/Bearer\s+[a-zA-Z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[REDACTED_JWT]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\b[1-4][A-Z]{2}\d{2}[A-Z]{2}\d{3}\b/gi, '[REDACTED_USN]')
    .replace(/\b(\d{1,3}\.\d{1,3}\.)\d{1,3}\.\d{1,3}\b/g, '$1xx.xx');
}

/**
 * Deeply sanitizes any object or payload, stripping or censoring sensitive keys
 * and redacting string patterns.
 * @param {any} data
 * @param {number} depth
 * @returns {any}
 */
export function sanitizeDeveloperPayload(data, depth = 0) {
  if (depth > 10 || data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return redactText(data);
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeDeveloperPayload(item, depth + 1));
  }

  if (typeof data === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      if (isSensitiveKey(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeDeveloperPayload(value, depth + 1);
      }
    }
    return sanitized;
  }

  return data;
}
