/**
 * @file authService.test.js
 * @description Comprehensive integration tests for authentication workflows, refresh token rotation, lockout, and role security.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import * as authService from '../../src/modules/auth/auth.service.js';
import * as authRepo from '../../src/modules/auth/auth.repository.js';
import { query, closePool } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import { UnauthorizedError, ConflictError } from '../../src/utils/errors.js';

describe('Auth Service & Business Workflows (Integration)', () => {
  const testEmail = `student_${Date.now()}@example.com`;
  const testPassword = 'SecurePassword123!';
  let createdUserId;

  after(async () => {
    // Cleanup created test records
    try {
      if (createdUserId) {
        await query('DELETE FROM users WHERE user_id = $1', [createdUserId]);
      }
    } catch {
      // Ignore cleanup error
    } finally {
      await closeRedis();
      await closePool();
    }
  });

  it('should register a new student user and assign role and profile', async () => {
    const user = await authService.register({
      name: 'Alice Student',
      email: testEmail,
      password: testPassword,
      phone: '+1234567890',
      student_profile: {
        enrollment_number: `ENR_${Date.now()}`,
        department: 'Computer Science',
        semester: 4
      }
    });

    createdUserId = user.userId;
    assert.ok(createdUserId);
    assert.equal(user.email, testEmail.toLowerCase());
    assert.deepEqual(user.roles, ['STUDENT']);
    assert.equal(user.status, 'ACTIVE');
  });

  it('should reject registration with an existing email', async () => {
    await assert.rejects(
      () => authService.register({
        name: 'Duplicate Alice',
        email: testEmail,
        password: 'AnotherPassword123!'
      }),
      (err) => err instanceof ConflictError && err.statusCode === 409
    );
  });

  it('should ignore client self-assigned privileged roles (ADMIN, FACULTY) and strictly enforce STUDENT', async () => {
    const maliciousEmail1 = `malicious_admin_${Date.now()}@example.com`;
    const maliciousEmail2 = `malicious_roles_${Date.now()}@example.com`;

    // Malicious payload with role: 'ADMIN'
    const user1 = await authService.register({
      name: 'Hacker Admin',
      email: maliciousEmail1,
      password: 'HackerPassword123!',
      role: 'ADMIN'
    });

    // Malicious payload with roles: ['ADMIN']
    const user2 = await authService.register({
      name: 'Hacker Roles',
      email: maliciousEmail2,
      password: 'HackerPassword123!',
      roles: ['ADMIN', 'FACULTY']
    });

    try {
      assert.deepEqual(user1.roles, ['STUDENT']);
      assert.deepEqual(user2.roles, ['STUDENT']);

      // Double check directly from DB user_roles
      const dbRoles1 = await authRepo.getUserRoles(user1.userId);
      const dbRoles2 = await authRepo.getUserRoles(user2.userId);

      assert.deepEqual(dbRoles1, ['STUDENT']);
      assert.deepEqual(dbRoles2, ['STUDENT']);
    } finally {
      await query('DELETE FROM users WHERE user_id IN ($1, $2)', [user1.userId, user2.userId]);
    }
  });

  it('should log in successfully with valid credentials and return access + refresh tokens', async () => {
    const result = await authService.login({
      email: testEmail,
      password: testPassword,
      userAgent: 'NodeTestAgent/1.0',
      ipAddress: '127.0.0.1'
    });

    assert.ok(result.accessToken);
    assert.ok(result.refreshToken);
    assert.equal(result.user.email, testEmail.toLowerCase());
    assert.deepEqual(result.user.roles, ['STUDENT']);
    assert.equal(result.user.status, 'ACTIVE');
  });

  it('should reject login for non-existent email with generic message (no enumeration)', async () => {
    await assert.rejects(
      () => authService.login({
        email: 'does_not_exist@example.com',
        password: 'SomePassword'
      }),
      (err) => err instanceof UnauthorizedError && err.message === 'Invalid email or password'
    );
  });

  it('should reject login for incorrect password with generic message', async () => {
    await assert.rejects(
      () => authService.login({
        email: testEmail,
        password: 'IncorrectPassword999!'
      }),
      (err) => err instanceof UnauthorizedError && err.message === 'Invalid email or password'
    );
  });

  it('should reject login for disabled account with generic message (no enumeration)', async () => {
    const disabledEmail = `disabled_${Date.now()}@example.com`;
    const user = await authService.register({
      name: 'Disabled User',
      email: disabledEmail,
      password: 'Password123!'
    });

    try {
      await query("UPDATE users SET status = 'DISABLED' WHERE user_id = $1", [user.userId]);

      await assert.rejects(
        () => authService.login({ email: disabledEmail, password: 'Password123!' }),
        (err) => err instanceof UnauthorizedError && err.message === 'Invalid email or password'
      );
    } finally {
      await query('DELETE FROM users WHERE user_id = $1', [user.userId]).catch(() => {});
    }
  });

  it('should lock the account after 5 consecutive failed login attempts', async () => {
    const lockoutEmail = `lockout_${Date.now()}@example.com`;
    const lockoutUser = await authService.register({
      name: 'Bob Lockout',
      email: lockoutEmail,
      password: 'InitialPassword123!'
    });

    try {
      // 4 failed attempts -> still normal invalid credentials message
      for (let i = 1; i <= 4; i++) {
        await assert.rejects(
          () => authService.login({ email: lockoutEmail, password: 'WrongPassword' }),
          (err) => err instanceof UnauthorizedError && err.message === 'Invalid email or password'
        );
      }

      // 5th failed attempt -> triggers account lockout
      await assert.rejects(
        () => authService.login({ email: lockoutEmail, password: 'WrongPassword' }),
        (err) => err instanceof UnauthorizedError && err.message.includes('locked')
      );

      // Subsequent login even with correct password is now rejected due to lock
      await assert.rejects(
        () => authService.login({ email: lockoutEmail, password: 'InitialPassword123!' }),
        (err) => err instanceof UnauthorizedError && err.message.includes('locked')
      );
    } finally {
      await query('DELETE FROM users WHERE user_id = $1', [lockoutUser.userId]).catch(() => {});
    }
  });

  it('should reset failed login attempts upon successful login', async () => {
    // 2 failed attempts
    for (let i = 0; i < 2; i++) {
      try {
        await authService.login({ email: testEmail, password: 'BadPassword' });
      } catch {
        // Expected
      }
    }

    // 1 successful login
    const loginResult = await authService.login({ email: testEmail, password: testPassword });
    assert.ok(loginResult.accessToken);

    // Verify DB count is reset to 0
    const userInDb = await authRepo.findUserByEmail(testEmail);
    assert.equal(userInDb.failed_login_attempts, 0);
    assert.equal(userInDb.locked_until, null);
  });

  describe('Refresh Token Rotation & Security', () => {
    it('should rotate refresh token on refresh and prevent reuse of old refresh token', async () => {
      // 1. Initial login
      const loginResult = await authService.login({
        email: testEmail,
        password: testPassword
      });
      const initialRefreshToken = loginResult.refreshToken;

      // 2. First refresh -> succeeds and returns new rotated refresh token
      const firstRefresh = await authService.refresh({
        refreshToken: initialRefreshToken
      });

      assert.ok(firstRefresh.accessToken);
      assert.ok(firstRefresh.refreshToken);
      assert.notEqual(firstRefresh.refreshToken, initialRefreshToken);
      assert.equal(firstRefresh.user.userId, createdUserId);

      // 3. Attempt to reuse initial (rotated) refresh token -> MUST FAIL
      await assert.rejects(
        () => authService.refresh({ refreshToken: initialRefreshToken }),
        (err) => err instanceof UnauthorizedError
      );

      // 4. Second refresh with newly rotated refresh token -> SUCCEEDS
      const secondRefresh = await authService.refresh({
        refreshToken: firstRefresh.refreshToken
      });

      assert.ok(secondRefresh.accessToken);
      assert.ok(secondRefresh.refreshToken);
      assert.notEqual(secondRefresh.refreshToken, firstRefresh.refreshToken);

      // 5. Attempt to reuse the first refreshed token -> MUST FAIL
      await assert.rejects(
        () => authService.refresh({ refreshToken: firstRefresh.refreshToken }),
        (err) => err instanceof UnauthorizedError
      );
    });

    it('should reject refresh when session is explicitly revoked', async () => {
      const loginResult = await authService.login({
        email: testEmail,
        password: testPassword
      });

      // Logout via refreshToken
      await authService.logout({ refreshToken: loginResult.refreshToken });

      // Refresh should now fail because session is revoked
      await assert.rejects(
        () => authService.refresh({ refreshToken: loginResult.refreshToken }),
        (err) => err instanceof UnauthorizedError && err.message.includes('revoked')
      );
    });

    it('should reject refresh when user account is locked', async () => {
      const lockedEmail = `refresh_lock_${Date.now()}@example.com`;
      const user = await authService.register({
        name: 'Locked Refresh User',
        email: lockedEmail,
        password: 'Password123!'
      });

      try {
        const loginResult = await authService.login({ email: lockedEmail, password: 'Password123!' });

        // Manually lock user account
        await query("UPDATE users SET status = 'LOCKED' WHERE user_id = $1", [user.userId]);

        await assert.rejects(
          () => authService.refresh({ refreshToken: loginResult.refreshToken }),
          (err) => err instanceof UnauthorizedError && err.message.includes('locked')
        );
      } finally {
        await query('DELETE FROM users WHERE user_id = $1', [user.userId]).catch(() => {});
      }
    });

    it('should reject refresh when user account is disabled', async () => {
      const disabledEmail = `refresh_dis_${Date.now()}@example.com`;
      const user = await authService.register({
        name: 'Disabled Refresh User',
        email: disabledEmail,
        password: 'Password123!'
      });

      try {
        const loginResult = await authService.login({ email: disabledEmail, password: 'Password123!' });

        // Manually disable user account
        await query("UPDATE users SET status = 'DISABLED' WHERE user_id = $1", [user.userId]);

        await assert.rejects(
          () => authService.refresh({ refreshToken: loginResult.refreshToken }),
          (err) => err instanceof UnauthorizedError && err.message.includes('not active')
        );
      } finally {
        await query('DELETE FROM users WHERE user_id = $1', [user.userId]).catch(() => {});
      }
    });

    it('should reject refresh when session is expired in database', async () => {
      const loginResult = await authService.login({
        email: testEmail,
        password: testPassword
      });

      // Set session expiration to past in DB
      await query(
        "UPDATE user_sessions SET expires_at = CURRENT_TIMESTAMP - interval '1 day' WHERE user_id = $1",
        [createdUserId]
      );

      await assert.rejects(
        () => authService.refresh({ refreshToken: loginResult.refreshToken }),
        (err) => err instanceof UnauthorizedError && err.message.includes('expired')
      );
    });

    it('should revoke all active sessions when revokeAllSessions is invoked', async () => {
      // Create 2 distinct sessions
      const session1 = await authService.login({ email: testEmail, password: testPassword });
      const session2 = await authService.login({ email: testEmail, password: testPassword });

      // Revoke all sessions for user
      await authService.revokeAllSessions(createdUserId);

      // Both should now fail to refresh
      await assert.rejects(
        () => authService.refresh({ refreshToken: session1.refreshToken }),
        (err) => err instanceof UnauthorizedError
      );
      await assert.rejects(
        () => authService.refresh({ refreshToken: session2.refreshToken }),
        (err) => err instanceof UnauthorizedError
      );
    });
  });

  it('should retrieve current authenticated user details without exposing password hash', async () => {
    const user = await authService.getCurrentUser(createdUserId);
    assert.equal(user.userId, createdUserId);
    assert.equal(user.email, testEmail.toLowerCase());
    assert.deepEqual(user.roles, ['STUDENT']);
    assert.equal(user.password_hash, undefined);
  });
});
