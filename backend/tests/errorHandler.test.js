import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { requestIdMiddleware } from '../src/middleware/requestId.js';
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalServerError
} from '../src/utils/errors.js';

describe('Centralized Error Handling', () => {
  function createTestApp(errorToThrow) {
    const testApp = express();
    testApp.use(requestIdMiddleware);
    testApp.get('/test-error', (_req, _res, next) => {
      next(errorToThrow);
    });
    testApp.use(errorHandler);
    return testApp;
  }

  it('should format BadRequestError (400) correctly', async () => {
    const appWithErr = createTestApp(new BadRequestError('Invalid input provided', { field: 'email' }));
    const res = await request(appWithErr).get('/test-error');

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'BAD_REQUEST');
    assert.equal(res.body.error.message, 'Invalid input provided');
    assert.deepEqual(res.body.error.details, { field: 'email' });
    assert.ok(res.body.error.requestId);
  });

  it('should format UnauthorizedError (401) correctly', async () => {
    const appWithErr = createTestApp(new UnauthorizedError('Missing token'));
    const res = await request(appWithErr).get('/test-error');

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('should format ForbiddenError (403) correctly', async () => {
    const appWithErr = createTestApp(new ForbiddenError('Access denied'));
    const res = await request(appWithErr).get('/test-error');

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('should format NotFoundError (404) correctly', async () => {
    const appWithErr = createTestApp(new NotFoundError('Exam not found'));
    const res = await request(appWithErr).get('/test-error');

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('should format ConflictError (409) correctly', async () => {
    const appWithErr = createTestApp(new ConflictError('Attempt already exists'));
    const res = await request(appWithErr).get('/test-error');

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'CONFLICT');
  });

  it('should format RateLimitError (429) correctly', async () => {
    const appWithErr = createTestApp(new RateLimitError('Too many submissions'));
    const res = await request(appWithErr).get('/test-error');

    assert.equal(res.status, 429);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'TOO_MANY_REQUESTS');
  });

  it('should format unexpected Generic Error (500) safely', async () => {
    const appWithErr = createTestApp(new Error('Unexpected DB crash'));
    const res = await request(appWithErr).get('/test-error');

    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INTERNAL_SERVER_ERROR');
    assert.ok(res.body.error.requestId);
  });
});
