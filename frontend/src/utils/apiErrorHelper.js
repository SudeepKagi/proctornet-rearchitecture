/**
 * @file apiErrorHelper.js
 * @description Centralized HTTP and operational error normalization utilities.
 * Ensures consistent, accessible, and user-friendly error messages across all flows.
 */

/**
 * Standard user-friendly error messages mapped by HTTP status code.
 */
export const HTTP_STATUS_MESSAGES = {
  400: 'Invalid request. Please verify the submitted information and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource could not be found.',
  409: 'A conflict occurred with the current state of this resource.',
  422: 'Unable to process the request due to invalid input fields.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Something went wrong on the server while processing your request.',
  502: 'Unable to connect to the backend service. Service may be temporarily starting up.',
  503: 'The service is temporarily unavailable. Please retry in a few moments.',
  504: 'The server timed out waiting for an upstream response.',
};

/**
 * Normalizes any error object (ApiError, standard Error, string, or fetch network failure)
 * into a standardized payload.
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

  // Extract human-readable message without ever exposing raw [object Object]
  let message = fallback;

  if (typeof err === 'string' && err.trim().length > 0) {
    message = err;
  } else if (err.message && typeof err.message === 'string' && err.message !== '[object Object]') {
    message = err.message;
  } else if (err.data?.error?.message && typeof err.data.error.message === 'string') {
    message = err.data.error.message;
  } else if (err.data?.message && typeof err.data.message === 'string') {
    message = err.data.message;
  } else if (HTTP_STATUS_MESSAGES[status]) {
    message = HTTP_STATUS_MESSAGES[status];
  }

  const code =
    err.code ||
    err.data?.error?.code ||
    (isNetworkError ? 'NETWORK_UNAVAILABLE' : status >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR');

  const requestId = err.requestId || err.data?.error?.requestId || null;

  return {
    message,
    status,
    code,
    requestId,
    isNetworkError,
  };
}

/**
 * Returns a clean string message suitable for displaying directly in UI alerts or forms.
 *
 * @param {any} err
 * @param {string} [fallback]
 * @returns {string}
 */
export function getErrorMessage(err, fallback) {
  return normalizeApiError(err, fallback).message;
}
