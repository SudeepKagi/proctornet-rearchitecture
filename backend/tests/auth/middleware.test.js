/**
 * @file middleware.test.js
 * @description Unit and security tests for authentication, RBAC, BOLA defense, and privilege escalation prevention.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { authenticate } from '../../src/middleware/authenticate.js';
import { requireRole } from '../../src/middleware/authorize.js';
import { requireOwnership, requireResourceScope } from '../../src/middleware/resourceAuthorization.js';
import { generateAccessToken } from '../../src/modules/auth/token.service.js';
import * as authRepo from '../../src/modules/auth/auth.repository.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { UnauthorizedError, ForbiddenError } from '../../src/utils/errors.js';

describe('Auth Middleware & Authorization Primitives', () => {
  const sampleUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    roles: ['STUDENT'],
    sessionId: '22222222-2222-2222-2222-222222222222'
  };

  before(async () => {
    // Ensure test user and active session exist in database for sampleUser
    await query(
      `INSERT INTO users (user_id, email, name, password_hash, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       ON CONFLICT (user_id) DO NOTHING`,
      [
        sampleUser.userId,
        'middleware_sample@example.com',
        'Sample Middleware User',
        '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEF12345678901234567890123'
      ]
    );

    await query(
      `INSERT INTO user_roles (user_id, role)
       VALUES ($1, 'STUDENT')
       ON CONFLICT (user_id, role) DO NOTHING`,
      [sampleUser.userId]
    );

    await query(
      `INSERT INTO user_sessions (session_id, user_id, refresh_token_hash, is_revoked, expires_at)
       VALUES ($1, $2, $3, FALSE, NOW() + INTERVAL '1 day')
       ON CONFLICT (session_id) DO UPDATE SET is_revoked = FALSE`,
      [sampleUser.sessionId, sampleUser.userId, 'sample_refresh_hash_2222']
    );
  });

  after(async () => {
    try {
      await query('DELETE FROM users WHERE user_id = $1', [sampleUser.userId]);
    } catch {
      // Ignore cleanup error
    } finally {
      await closeRedis();
      await closePool();
    }
  });

  describe('authenticate Middleware', () => {
    it('should reject requests missing Authorization header with 401', async () => {
      const req = { headers: {} };
      let passedError = null;

      await authenticate(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError instanceof UnauthorizedError);
      assert.equal(passedError.statusCode, 401);
      assert.equal(passedError.message, 'Missing Authorization header');
    });

    it('should reject malformed Authorization header (no Bearer keyword)', async () => {
      const req = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };
      let passedError = null;

      await authenticate(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError instanceof UnauthorizedError);
      assert.equal(passedError.statusCode, 401);
      assert.ok(passedError.message.includes('Expected Bearer <token>'));
    });

    it('should reject invalid or forged token signature with 401', async () => {
      const req = { headers: { authorization: 'Bearer invalid.jwt.token' } };
      let passedError = null;

      await authenticate(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError instanceof UnauthorizedError);
      assert.equal(passedError.statusCode, 401);
    });

    it('should accept valid access token and populate req.user context strictly from token claims', async () => {
      const validToken = generateAccessToken(sampleUser);
      const req = {
        headers: {
          authorization: `Bearer ${validToken}`,
          'x-role': 'ADMIN' // Malicious header attempt
        },
        body: {
          role: 'ADMIN', // Malicious body attempt
          roles: ['ADMIN']
        }
      };
      let nextCalled = false;

      await authenticate(req, {}, (err) => {
        assert.equal(err, undefined);
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.ok(req.user);
      assert.equal(req.user.userId, sampleUser.userId);
      assert.deepEqual(req.user.roles, ['STUDENT']); // Guaranteed STUDENT, not ADMIN
      assert.equal(req.user.sessionId, sampleUser.sessionId);
    });
  });

  describe('requireRole Middleware (RBAC & Privilege Escalation Defense)', () => {
    it('should reject unauthenticated request with 401', async () => {
      const middleware = requireRole('ADMIN');
      const req = {}; // No req.user
      let passedError = null;

      await middleware(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError instanceof UnauthorizedError);
      assert.equal(passedError.statusCode, 401);
    });

    it('should allow access when user has required role', async () => {
      const middleware = requireRole('STUDENT');
      const req = { user: { userId: 'u1', roles: ['STUDENT'] } };
      let nextCalled = false;

      await middleware(req, {}, (err) => {
        assert.equal(err, undefined);
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });

    it('should allow access when user matches one of multiple permitted roles', async () => {
      const middleware = requireRole('FACULTY', 'INVIGILATOR', 'ADMIN');
      const req = { user: { userId: 'u2', roles: ['INVIGILATOR'] } };
      let nextCalled = false;

      await middleware(req, {}, (err) => {
        assert.equal(err, undefined);
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });

    it('should reject with 403 Forbidden when user lacks the required role', async () => {
      const middleware = requireRole('FACULTY', 'ADMIN');
      const req = { user: { userId: 'u3', roles: ['STUDENT'] } };
      let passedError = null;

      await middleware(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError instanceof ForbiddenError);
      assert.equal(passedError.statusCode, 403);
      assert.ok(passedError.message.includes('Requires one of [FACULTY, ADMIN]'));
    });

    it('should prevent privilege escalation when client passes manipulated body or headers with privileged role', async () => {
      const validStudentToken = generateAccessToken(sampleUser);
      const req = {
        headers: {
          authorization: `Bearer ${validStudentToken}`,
          'x-role': 'ADMIN'
        },
        body: {
          role: 'ADMIN',
          roles: ['ADMIN']
        }
      };

      // 1. Authenticate
      let authError;
      await authenticate(req, {}, (err) => {
        authError = err;
      });
      assert.equal(authError, undefined);

      // 2. Authorize for ADMIN
      const adminGuard = requireRole('ADMIN');
      let passedError = null;
      await adminGuard(req, {}, (err) => {
        passedError = err;
      });

      // Must be rejected with 403 Forbidden because req.user.roles is strictly ['STUDENT']
      assert.ok(passedError instanceof ForbiddenError);
      assert.equal(passedError.statusCode, 403);
    });

    it('should verify durable roles against PostgreSQL to invalidate stale JWT role claims', async () => {
      // Create user in DB with STUDENT role only
      const user = await authRepo.createUser({
        name: 'Role Revoke Test',
        email: `stale_role_${Date.now()}@example.com`,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEF12345678901234567890123',
        role: 'STUDENT'
      });

      const testSessionId = '33333333-3333-3333-3333-333333333333';
      await query(
        `INSERT INTO user_sessions (session_id, user_id, refresh_token_hash, is_revoked, expires_at)
         VALUES ($1, $2, $3, FALSE, NOW() + INTERVAL '1 day')
         ON CONFLICT (session_id) DO UPDATE SET is_revoked = FALSE`,
        [testSessionId, user.user_id, `test_refresh_hash_${Date.now()}`]
      );

      try {
        // Forge/Snapshot a JWT that claims ADMIN role for this user ID
        const forgedAdminToken = generateAccessToken({
          userId: user.user_id,
          roles: ['ADMIN'], // Stale or forged claim in JWT snapshot
          sessionId: testSessionId
        });

        const req = {
          headers: { authorization: `Bearer ${forgedAdminToken}` }
        };

        // 1. Authenticate token
        let authErr1;
        await authenticate(req, {}, (err) => {
          authErr1 = err;
        });
        assert.equal(authErr1, undefined);

        // 2. Authorize with requireRole('ADMIN')
        const adminGuard = requireRole('ADMIN');
        let passedError = null;
        await adminGuard(req, {}, (err) => {
          passedError = err;
        });

        // MUST be rejected because PostgreSQL user_roles has only 'STUDENT'
        assert.ok(passedError instanceof ForbiddenError);
        assert.equal(passedError.statusCode, 403);

        // 3. Now elevate the user in DB to FACULTY
        await query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'FACULTY')", [user.user_id]);

        // Present a JWT that only claimed STUDENT
        const studentToken = generateAccessToken({
          userId: user.user_id,
          roles: ['STUDENT'],
          sessionId: testSessionId
        });
        const req2 = {
          headers: { authorization: `Bearer ${studentToken}` }
        };
        let authErr2;
        await authenticate(req2, {}, (err) => {
          authErr2 = err;
        });
        assert.equal(authErr2, undefined);

        const facultyGuard = requireRole('FACULTY');
        let passedError2 = null;
        await facultyGuard(req2, {}, (err) => {
          passedError2 = err;
        });

        // MUST succeed because PostgreSQL has the elevated role
        assert.equal(passedError2, undefined);
      } finally {
        await query('DELETE FROM users WHERE user_id = $1', [user.user_id]);
      }
    });
  });

  describe('requireOwnership Middleware (BOLA/IDOR Defense)', () => {
    it('should allow student to access their own resource by matching ID', async () => {
      const middleware = requireOwnership('studentId');
      const req = {
        user: { userId: 'student-123', roles: ['STUDENT'] },
        params: { studentId: 'student-123' }
      };
      let nextCalled = false;

      await middleware(req, {}, (err) => {
        assert.equal(err, undefined);
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });

    it('should reject with 403 Forbidden when student attempts to access another student resource (BOLA)', async () => {
      const middleware = requireOwnership('studentId');
      const req = {
        user: { userId: 'student-123', roles: ['STUDENT'] },
        params: { studentId: 'victim-student-456' }
      };
      let passedError = null;

      await middleware(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError instanceof ForbiddenError);
      assert.equal(passedError.statusCode, 403);
      assert.ok(passedError.message.includes('do not have permission'));
    });

    it('should allow ADMIN to access resource with admin bypass', async () => {
      const middleware = requireOwnership('studentId', { allowAdmin: true });
      const req = {
        user: { userId: 'admin-999', roles: ['ADMIN'] },
        params: { studentId: 'student-123' }
      };
      let nextCalled = false;

      await middleware(req, {}, (err) => {
        assert.equal(err, undefined);
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });

    it('should support dynamic function resolver for resource ownership', async () => {
      const middleware = requireOwnership((req) => req.attempt.studentId);
      const req = {
        user: { userId: 'student-123', roles: ['STUDENT'] },
        attempt: { studentId: 'student-123' }
      };
      let nextCalled = false;

      await middleware(req, {}, (err) => {
        assert.equal(err, undefined);
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });
  });

  describe('requireResourceScope Middleware (ABAC Scope Guard)', () => {
    it('should allow access when custom scope validation passes', async () => {
      const scopeCheck = async (req, user) => user.roles.includes('FACULTY') && req.params.dept === 'CS';
      const middleware = requireResourceScope(scopeCheck);
      const req = {
        user: { userId: 'f1', roles: ['FACULTY'] },
        params: { dept: 'CS' }
      };
      let nextCalled = false;

      await middleware(req, {}, (err) => {
        assert.equal(err, undefined);
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });

    it('should reject with 403 when scope validation fails', async () => {
      const scopeCheck = async (req, user) => user.roles.includes('FACULTY') && req.params.dept === 'CS';
      const middleware = requireResourceScope(scopeCheck, 'Only CS faculty allowed');
      const req = {
        user: { userId: 'f2', roles: ['FACULTY'] },
        params: { dept: 'EE' }
      };
      let passedError = null;

      await middleware(req, {}, (err) => {
        passedError = err;
      });

      assert.ok(passedError instanceof ForbiddenError);
      assert.equal(passedError.message, 'Only CS faculty allowed');
    });
  });
});
