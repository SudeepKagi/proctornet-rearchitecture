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

export function setAccessToken(token) {
  inMemoryAccessToken = token;
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
 */
async function refreshAuthToken() {
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
        throw new Error('Refresh failed');
      }

      const body = await response.json();
      const newAccessToken = body.data?.accessToken;
      if (newAccessToken) {
        setAccessToken(newAccessToken);
        return newAccessToken;
      }
      throw new Error('Invalid refresh response');
    } catch (err) {
      setAccessToken(null);
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
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
      'Unable to connect to the ProctorNet service. Please check your network connection.',
      0,
      null
    );
  }

  // Intercept 401 Unauthorized for token refresh (except for auth endpoints)
  if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    try {
      const newToken = await refreshAuthToken();
      if (newToken) {
        config.headers['Authorization'] = `Bearer ${newToken}`;
        await attachSignatureHeader(config.headers);
        response = await fetch(endpoint, config);
      }
    } catch {
      // Refresh failed, proceed to handle original 401 response
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
    const extractedMessage =
      (typeof responseData?.message === 'string' && responseData.message) ||
      (typeof rawError?.message === 'string' && rawError.message) ||
      (typeof rawError === 'string' && rawError) ||
      null;

    const fallbackStatusMessages = {
      400: 'Invalid request. Please verify the submitted information.',
      401: 'Your session has expired. Please sign in again.',
      403: 'You do not have permission to perform this action.',
      404: 'The requested resource was not found.',
      409: 'A conflict occurred with the current state of the resource.',
      422: 'Unable to process the request due to validation errors.',
      429: 'Too many requests. Please wait a moment and try again.',
      500: 'Something went wrong on the server while processing your request.',
      502: 'Unable to connect to the upstream service. Please retry shortly.',
      503: 'Service temporarily unavailable. Please retry in a few moments.',
      504: 'Gateway timeout waiting for server response.'
    };

    const finalMessage =
      extractedMessage ||
      fallbackStatusMessages[response.status] ||
      `HTTP ${response.status}: Request failed`;

    const requestId = rawError?.requestId || response.headers.get('x-request-id') || null;

    throw new ApiError(finalMessage, response.status, responseData, requestId);
  }

  return responseData;
}
