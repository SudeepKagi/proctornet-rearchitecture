/**
 * @file client.js
 * @description Centralized Fetch wrapper for ProctorNet API with dual-token refresh interceptor.
 * Stores short-lived JWT access token strictly in memory.
 */

import { createPayloadSignature } from '../utils/antiTamperClient.js';

let inMemoryAccessToken = null;
let inMemoryAntiTamperToken = null;
let refreshPromise = null;
let onUnauthorizedCallback = null;
let isSessionInvalid = false;

export function setAccessToken(token) {
  inMemoryAccessToken = token;
  if (token) {
    isSessionInvalid = false;
  }
}

export function getAccessToken() {
  return inMemoryAccessToken;
}

export function setAntiTamperToken(token) {
  inMemoryAntiTamperToken = token;
}

export function getAntiTamperToken() {
  return inMemoryAntiTamperToken;
}

export function setOnUnauthorized(callback) {
  onUnauthorizedCallback = callback;
}

export function clearAuthSession() {
  inMemoryAccessToken = null;
  inMemoryAntiTamperToken = null;
  refreshPromise = null;
  isSessionInvalid = true;
}

/**
 * Custom API Error class preserving HTTP status and backend error envelope.
 */
export class ApiError extends Error {
  constructor(message, status, data = null, requestId = null) {
    const stringMessage = typeof message === 'string'
      ? message
      : (data?.error?.message || data?.message || 'Request failed');
    super(stringMessage);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = data?.code || data?.error?.code || null;
    this.details = data?.details || data?.error?.details || null;
    this.requestId = requestId || data?.error?.requestId || null;
  }
}

/**
 * Executes a silent refresh using the HttpOnly cookie.
 * Ensures a single shared promise across concurrent requests and avoids refresh storms.
 */
export async function refreshAuthToken() {
  if (isSessionInvalid) {
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        isSessionInvalid = true;
        setAccessToken(null);
        if (onUnauthorizedCallback) {
          try {
            onUnauthorizedCallback();
          } catch (callbackErr) {
            console.error('Error in onUnauthorized callback:', callbackErr);
          }
        }
        throw new ApiError('Your session has expired. Please sign in again.', response.status);
      }

      const body = await response.json();
      const newAccessToken = body.data?.accessToken;
      if (newAccessToken) {
        isSessionInvalid = false;
        setAccessToken(newAccessToken);
        return body.data;
      }

      isSessionInvalid = true;
      setAccessToken(null);
      if (onUnauthorizedCallback) {
        try {
          onUnauthorizedCallback();
        } catch (callbackErr) {
          console.error('Error in onUnauthorized callback:', callbackErr);
        }
      }
      throw new ApiError('Invalid refresh response', 401);
    } catch (err) {
      isSessionInvalid = true;
      setAccessToken(null);
      throw err;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Main API request dispatcher.
 * Automatically attaches Authorization header, handles JSON conversion,
 * and intercepts 401s for transparent token refresh.
 */
export async function apiClient(endpoint, options = {}) {
  const { headers = {}, body, ...customOptions } = options;

  const defaultHeaders = {
    ...headers,
  };

  if (!(body instanceof FormData)) {
    defaultHeaders['Content-Type'] = defaultHeaders['Content-Type'] || 'application/json';
  }

  if (inMemoryAccessToken) {
    defaultHeaders['Authorization'] = `Bearer ${inMemoryAccessToken}`;
  }

  const config = {
    ...customOptions,
    headers: defaultHeaders,
    credentials: 'include',
  };

  if (body && !(body instanceof FormData) && typeof body === 'object') {
    config.body = JSON.stringify(body);
  } else if (body) {
    config.body = body;
  }

  const method = (customOptions.method || 'GET').toUpperCase();
  const signingToken = options.antiTamperToken || inMemoryAntiTamperToken;

  const requiresSigning = Boolean(
    options.sign ||
    (signingToken &&
     ['POST', 'PUT', 'DELETE'].includes(method) &&
     (endpoint.includes('/answers') || endpoint.includes('/events')))
  );

  async function attachSignatureHeader(targetHeaders) {
    if (requiresSigning && signingToken) {
      try {
        const { headerValue } = await createPayloadSignature({
          keyHex: signingToken,
          method,
          path: endpoint,
          body: config.body
        });
        targetHeaders['X-Payload-Signature'] = headerValue;
      } catch (err) {
        console.warn('Failed to generate anti-tamper signature:', err);
      }
    }
  }

  await attachSignatureHeader(defaultHeaders);

  let response;
  try {
    response = await fetch(endpoint, config);
  } catch (_netErr) {
    throw new ApiError(
      "We can't connect to ProctorNet. Check your internet connection and try again.",
      0,
      null
    );
  }

  // Intercept 401 Unauthorized for token refresh (except for auth endpoints and already-retried requests)
  const isAuthEndpoint =
    endpoint.includes('/auth/login') ||
    endpoint.includes('/auth/refresh') ||
    endpoint.includes('/auth/register');

  if (response.status === 401 && !isAuthEndpoint && !options._retry && !isSessionInvalid) {
    try {
      const refreshResult = await refreshAuthToken();
      const newToken = typeof refreshResult === 'string' ? refreshResult : refreshResult?.accessToken;
      if (newToken) {
        config.headers['Authorization'] = `Bearer ${newToken}`;
        await attachSignatureHeader(config.headers);
        return await apiClient(endpoint, { ...options, _retry: true });
      }
    } catch {
      // Refresh failed or session invalid; proceed to handle original 401 response
    }
  }

  let responseData = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      responseData = await response.json();
    } catch {
      responseData = null;
    }
  }

  if (!response.ok) {
    const rawError = responseData?.error;
    let extractedMessage =
      (typeof responseData?.message === 'string' && responseData.message) ||
      (typeof rawError?.message === 'string' && rawError.message) ||
      (typeof rawError === 'string' && rawError) ||
      null;

    // Translate raw technical messages into simple English
    if (extractedMessage) {
      if (extractedMessage.toLowerCase().includes('concurrency') || extractedMessage.toLowerCase().includes('occ')) {
        extractedMessage = 'This answer changed somewhere else. Please review it.';
      } else if (extractedMessage.toLowerCase().includes('jwt') || extractedMessage.toLowerCase().includes('token expired')) {
        extractedMessage = 'Your session has expired. Please sign in again.';
      } else if (extractedMessage.toLowerCase().includes('authorization denied') || extractedMessage.toLowerCase().includes('forbidden')) {
        extractedMessage = 'You do not have permission to do this.';
      }
    }

    const fallbackStatusMessages = {
      400: 'Invalid request. Please check the information you entered.',
      401: 'Your session has expired. Please sign in again.',
      403: 'You do not have permission to do this.',
      404: "We couldn't find that page.",
      409: 'This information changed while you were working. Please review it.',
      422: 'Some information was incomplete or incorrect. Please review and try again.',
      429: 'Too many requests. Please wait a moment and try again.',
      500: 'Something went wrong. Please try again.',
      502: 'ProctorNet is temporarily unavailable. Please try again shortly.',
      503: 'ProctorNet is temporarily unavailable. Please try again shortly.',
      504: 'The server took too long to respond. Please try again.'
    };

    const finalMessage =
      extractedMessage ||
      fallbackStatusMessages[response.status] ||
      'Something went wrong. Please try again.';

    const requestId = rawError?.requestId || response.headers.get('x-request-id') || null;

    throw new ApiError(finalMessage, response.status, responseData, requestId);
  }

  return responseData;
}
