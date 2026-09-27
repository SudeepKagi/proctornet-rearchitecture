import { describe, it, expect, vi } from 'vitest';
import { requireRole } from '../../src/middleware/authorize.js';
import { authenticate } from '../../src/middleware/authenticate.js';
import { UnauthorizedError, ForbiddenError } from '../../src/utils/errors.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as tokenBlacklist from '../../src/modules/auth/tokenBlacklist.js';
import * as authRepo from '../../src/modules/auth/auth.repository.js';

describe('RBAC & Authentication Middleware', () => {
  describe('requireRole middleware', () => {
    it('blocks request with UnauthorizedError if req.user is absent', async () => {
      const middleware = requireRole('ADMIN');
      const req = {};
      const res = {};
      let nextError = null;
      const next = (err) => { nextError = err; };

      await middleware(req, res, next);
      expect(nextError).toBeInstanceOf(UnauthorizedError);
    });

    it('permits request when user holds exact required role', async () => {
      vi.spyOn(authRepo, 'getUserRoles').mockResolvedValue(['FACULTY']);
      const middleware = requireRole('FACULTY');
      const req = {
        user: {
          userId: 'user-123',
          roles: ['FACULTY']
        }
      };
      const res = {};
      let nextCalled = false;
      const next = (err) => {
        if (!err) nextCalled = true;
      };

      await middleware(req, res, next);
      expect(nextCalled).toBe(true);
      vi.restoreAllMocks();
    });

    it('permits request when user holds one of multiple permitted roles', async () => {
      vi.spyOn(authRepo, 'getUserRoles').mockResolvedValue(['INVIGILATOR', 'STUDENT']);
      const middleware = requireRole('ADMIN', 'FACULTY', 'INVIGILATOR');
      const req = {
        user: {
          userId: 'user-456',
          roles: ['INVIGILATOR', 'STUDENT']
        }
      };
      const res = {};
      let nextCalled = false;
      const next = (err) => {
        if (!err) nextCalled = true;
      };

      await middleware(req, res, next);
      expect(nextCalled).toBe(true);
      vi.restoreAllMocks();
    });

    it('rejects request with ForbiddenError when user lacks required role', async () => {
      vi.spyOn(authRepo, 'getUserRoles').mockResolvedValue(['STUDENT']);
      const middleware = requireRole('ADMIN');
      const req = {
        user: {
          userId: 'user-789',
          roles: ['STUDENT']
        }
      };
      const res = {};
      let nextError = null;
      const next = (err) => { nextError = err; };

      await middleware(req, res, next);
      expect(nextError).toBeInstanceOf(ForbiddenError);
      expect(nextError.message).toContain('Access denied');
      vi.restoreAllMocks();
    });
  });

  describe('authenticate middleware', () => {
    it('rejects request when Authorization header is missing', async () => {
      const req = { headers: {} };
      const res = {};
      let nextError = null;
      const next = (err) => { nextError = err; };

      await authenticate(req, res, next);
      expect(nextError).toBeInstanceOf(UnauthorizedError);
      expect(nextError.message).toContain('Missing Authorization header');
    });

    it('rejects request when Authorization header does not start with Bearer', async () => {
      const req = { headers: { authorization: 'Basic 123456' } };
      const res = {};
      let nextError = null;
      const next = (err) => { nextError = err; };

      await authenticate(req, res, next);
      expect(nextError).toBeInstanceOf(UnauthorizedError);
      expect(nextError.message).toContain('Invalid Authorization header format');
    });

    it('authenticates valid token and populates req.user', async () => {
      const mockPayload = {
        userId: 'candidate-99',
        roles: ['STUDENT'],
        sessionId: 'session-abc'
      };

      vi.spyOn(tokenService, 'verifyAccessToken').mockReturnValue(mockPayload);
      vi.spyOn(tokenBlacklist, 'isSessionBlacklisted').mockResolvedValue({
        available: true,
        isBlacklisted: false
      });

      const req = { headers: { authorization: 'Bearer valid.jwt.token' } };
      const res = {};
      let nextCalled = false;
      const next = (err) => {
        if (!err) nextCalled = true;
      };

      await authenticate(req, res, next);
      expect(nextCalled).toBe(true);
      expect(req.user).toEqual({
        userId: 'candidate-99',
        roles: ['STUDENT'],
        sessionId: 'session-abc'
      });

      vi.restoreAllMocks();
    });

    it('rejects blacklisted/revoked session', async () => {
      vi.spyOn(tokenService, 'verifyAccessToken').mockReturnValue({
        userId: 'user-revoked',
        sessionId: 'session-revoked'
      });
      vi.spyOn(tokenBlacklist, 'isSessionBlacklisted').mockResolvedValue({
        available: true,
        isBlacklisted: true
      });

      const req = { headers: { authorization: 'Bearer revoked.jwt.token' } };
      const res = {};
      let nextError = null;
      const next = (err) => { nextError = err; };

      await authenticate(req, res, next);
      expect(nextError).toBeInstanceOf(UnauthorizedError);
      expect(nextError.message).toContain('Session has been revoked');

      vi.restoreAllMocks();
    });
  });
});
