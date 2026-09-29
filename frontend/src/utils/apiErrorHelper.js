/**
 * @file apiErrorHelper.js
 * @description Centralized HTTP and operational error normalization utilities.
 * Ensures consistent, accessible, and user-friendly plain-language messages across all flows.
 * Prohibits raw enum codes (e.g. RESULT_NOT_PUBLISHED) and internal engineering jargon.
 */

/**
 * Plain-language dictionary mapping raw backend error codes to user-friendly messages.
 */
export const ERROR_CODE_FRIENDLY_MESSAGES = {
  // Authentication, Accounts & Onboarding
  PASSWORD_CHANGE_REQUIRED: 'Please update your temporary password to continue.',
  ONBOARDING_REQUIRED: 'Please complete your profile setup before accessing examination features.',
  VERIFICATION_PENDING: 'Your account is awaiting approval from your college administrator. Please check back shortly.',
  VERIFICATION_REJECTED: 'Your account verification was not approved. Please review the note provided or contact your administrator.',
  ACCOUNT_LOCKED: 'Your account has been temporarily locked for security. Please contact your college administrator for assistance.',
  ACCOUNT_DEACTIVATED: 'Your account is currently inactive. Please contact your college administrator.',
  USER_INACTIVE: 'Your account is currently inactive. Please contact your college administrator.',
  INVALID_CREDENTIALS: 'Incorrect email or password. Please verify your credentials and try again.',
  AUTHENTICATION_FAILED: 'Could not sign in with those details. Please check your email and password.',
  UNAUTHORIZED: 'Please sign in to access this page.',
  FORBIDDEN: 'You do not have permission to perform this action or view this page.',
  SESSION_EXPIRED: 'Your session has timed out for security. Please sign in again.',
  TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',

  // Exam Sessions & Attempts Lifecycle
  RESULT_NOT_PUBLISHED: 'Exam results have not been released by your instructor yet. Please check back later.',
  RESULTS_NOT_RELEASED: 'Exam results have not been released by your instructor yet. Please check back later.',
  ATTEMPT_ALREADY_SUBMITTED: 'This exam has already been submitted and cannot be retaken.',
  ATTEMPT_EXPIRED: 'Your exam time has ended. Your answers have been finalized.',
  ATTEMPT_NOT_FOUND: 'The requested exam attempt could not be found.',
  EXAM_NOT_FOUND: 'The requested exam could not be found.',
  SESSION_NOT_FOUND: 'The exam session could not be found.',
  WINDOW_NOT_OPEN: 'This exam session has not opened yet. Please check the scheduled start time.',
  WINDOW_CLOSED: 'This exam session has closed.',
  EXAM_NOT_STARTED: 'This exam has not started yet.',
  EXAM_ENDED: 'This exam has already concluded.',
  NOT_ASSIGNED_TO_SESSION: 'You are not registered for this exam session. If you believe this is an error, please contact your instructor.',

  // Pre-Exam Identity Check
  BIOMETRIC_LOCKED: 'Maximum photo verification attempts reached. Please contact your exam supervisor for assistance.',
  BIOMETRIC_MISMATCH: 'We could not match your photo with your enrolled profile. Please ensure clear lighting and try again.',
  FACE_NOT_FOUND: 'No clear face was detected in the camera frame. Please look directly into your camera and try again.',
  MULTIPLE_FACES_DETECTED: 'Multiple people were detected in the camera frame. Please ensure you are alone in the room.',
  POOR_LIGHTING: 'The lighting is too dim. Please turn on room lights and ensure your face is clearly visible.',
  CAMERA_ACCESS_DENIED: 'Camera access was blocked by your browser. Please allow camera permissions and refresh the page.',
  MICROPHONE_ACCESS_DENIED: 'Microphone access was blocked by your browser. Please allow microphone permissions and refresh the page.',
  SCREEN_SHARE_DENIED: 'Screen sharing is required to start this exam. Please select your entire screen to proceed.',

  // Concurrency, Network & System
  OCC_CONFLICT: 'Your answers were updated from another window. Please refresh and review your answers.',
  CONCURRENCY_CONFLICT: 'Your answers were updated from another window. Please refresh and review your answers.',
  TOO_MANY_REQUESTS: 'Too many requests in a short time. Please wait a moment and try again.',
  NETWORK_UNAVAILABLE: 'Could not connect to the server. Please check your internet connection and try again.',
  SERVER_ERROR: 'Something went wrong on our end. Please try again in a few moments.',
  VALIDATION_ERROR: 'Some information was incomplete or incorrect. Please review the highlighted fields and try again.'
};

/**
 * Standard user-friendly error messages mapped by HTTP status code.
 */
export const HTTP_STATUS_MESSAGES = {
  400: 'Some submitted information was invalid. Please review and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested page or item could not be found.',
  409: 'This information was recently updated. Please refresh and review.',
  422: 'Some required fields were missing or incomplete. Please review and try again.',
  429: 'Too many attempts. Please wait a moment before trying again.',
  500: 'Something went wrong on our end. Our team has been notified. Please try again shortly.',
  502: 'The examination service is temporarily restarting. Please try again in a few moments.',
  503: 'The examination service is temporarily unavailable. Please retry in a few moments.',
  504: 'The server took too long to respond. Please try again.',
};

/**
 * Strips technical jargon or raw database error strings into plain language.
 * @param {string} msg
 * @returns {string}
 */
export function sanitizeJargon(msg) {
  if (!msg || typeof msg !== 'string') return '';

  let sanitized = msg;

  // Replace common backend technical strings
  if (/Optimistic Concurrency Control|OCC|stale revision/i.test(sanitized)) {
    return 'Your answers were updated from another window. Please refresh and review your work.';
  }
  if (/mediasoup|SFU|WebRTC worker/i.test(sanitized)) {
    return 'Live video streaming encountered an issue. Reconnecting to your session...';
  }
  if (/512-dimensional|vector embedding|embedding extraction/i.test(sanitized)) {
    return 'Could not process your identity photo. Please ensure clear lighting and try again.';
  }
  if (/heuristic|anomaly heuristic/i.test(sanitized)) {
    return 'An unexpected screen focus change was detected.';
  }
  if (/WireGuard|dual-plane/i.test(sanitized)) {
    return 'Access restricted to authorized administrative networks.';
  }
  if (/inconsistent types deduced for parameter/i.test(sanitized) || /syntax error at/i.test(sanitized)) {
    return 'A database processing error occurred. Please try again.';
  }

  // Replace raw enum strings that might be passed directly as messages
  if (ERROR_CODE_FRIENDLY_MESSAGES[sanitized.trim()]) {
    return ERROR_CODE_FRIENDLY_MESSAGES[sanitized.trim()];
  }

  return sanitized;
}

/**
 * Normalizes any error object (ApiError, standard Error, string, or fetch network failure)
 * into a standardized plain-language payload.
 *
 * @param {any} err - Caught error
 * @param {string} [fallback='An unexpected error occurred. Please try again.']
 * @returns {{ message: string, status: number, code: string, requestId: string|null, isNetworkError: boolean }}
 */
export function normalizeApiError(err, fallback = 'An unexpected error occurred. Please try again.') {
  if (!err) {
    return {
      message: fallback,
      status: 500,
      code: 'UNKNOWN_ERROR',
      requestId: null,
      isNetworkError: false,
    };
  }

  const isNetworkError =
    err.status === 0 ||
    err.name === 'TypeError' ||
    (typeof err.message === 'string' && (
      err.message.includes('Failed to fetch') ||
      err.message.includes('NetworkError') ||
      err.message.includes('network')
    ));

  let status = typeof err.status === 'number' ? err.status : (isNetworkError ? 0 : 500);

  const explicitCode = err.code || err.data?.code || err.data?.error?.code;
  const rawCode =
    explicitCode ||
    (isNetworkError ? 'NETWORK_UNAVAILABLE' : status >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR');

  const code = String(rawCode || '').trim();

  // 1. First priority: Check if explicit error code maps to a friendly message
  let message = explicitCode && ERROR_CODE_FRIENDLY_MESSAGES[explicitCode]
    ? ERROR_CODE_FRIENDLY_MESSAGES[explicitCode]
    : null;

  // 2. Second priority: Extract server message or Error message and sanitize jargon
  if (!message) {
    let rawMsg = null;
    if (typeof err === 'string' && err.trim().length > 0) {
      rawMsg = err;
    } else if (err.data?.error?.message && typeof err.data.error.message === 'string') {
      rawMsg = err.data.error.message;
    } else if (err.data?.message && typeof err.data.message === 'string') {
      rawMsg = err.data.message;
    } else if (err.message && typeof err.message === 'string' && err.message !== '[object Object]') {
      rawMsg = err.message;
    }

    if (rawMsg) {
      // If the raw message is an enum code, map it
      if (ERROR_CODE_FRIENDLY_MESSAGES[rawMsg.trim()]) {
        message = ERROR_CODE_FRIENDLY_MESSAGES[rawMsg.trim()];
      } else {
        message = sanitizeJargon(rawMsg);
      }
    }
  }

  // 3. Third priority: HTTP status code message
  if (!message && HTTP_STATUS_MESSAGES[status]) {
    message = HTTP_STATUS_MESSAGES[status];
  }

  // 4. Fourth priority: Fallback to code mapping or generic fallback
  if (!message) {
    message = ERROR_CODE_FRIENDLY_MESSAGES[code] || fallback;
  }

  const requestId = err.requestId || err.data?.requestId || err.data?.error?.requestId || null;

  return {
    message,
    status,
    code,
    requestId,
    isNetworkError,
  };
}

/**
 * Returns a clean plain-language string suitable for displaying directly in UI alerts or forms.
 *
 * @param {any} err
 * @param {string} [fallback]
 * @returns {string}
 */
export function getErrorMessage(err, fallback = 'An unexpected error occurred. Please try again.') {
  return normalizeApiError(err, fallback).message;
}

export default {
  ERROR_CODE_FRIENDLY_MESSAGES,
  HTTP_STATUS_MESSAGES,
  normalizeApiError,
  getErrorMessage,
  sanitizeJargon,
};
