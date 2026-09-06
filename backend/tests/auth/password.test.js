import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hashPassword, verifyPassword } from '../../src/modules/auth/password.service.js';

describe('Password Service (bcrypt)', () => {
  it('should generate a valid bcrypt hash for a plaintext password', async () => {
    const password = 'SuperSecretPassword123!';
    const hash = await hashPassword(password);

    assert.ok(typeof hash === 'string');
    assert.ok(hash.startsWith('$2b$') || hash.startsWith('$2a$'));
    assert.notEqual(hash, password);
  });

  it('should verify matching plaintext password against hash in constant time', async () => {
    const password = 'CorrectHorseBatteryStaple';
    const hash = await hashPassword(password);

    const isMatch = await verifyPassword(password, hash);
    assert.equal(isMatch, true);
  });

  it('should reject incorrect plaintext password against hash', async () => {
    const password = 'CorrectPassword';
    const wrongPassword = 'WrongPassword';
    const hash = await hashPassword(password);

    const isMatch = await verifyPassword(wrongPassword, hash);
    assert.equal(isMatch, false);
  });

  it('should reject empty or invalid password inputs during hashing', async () => {
    await assert.rejects(() => hashPassword(''), { message: 'Password must be a non-empty string' });
    await assert.rejects(() => hashPassword(null), { message: 'Password must be a non-empty string' });
    await assert.rejects(() => hashPassword(12345), { message: 'Password must be a non-empty string' });
  });

  it('should safely return false when verifying malformed inputs', async () => {
    assert.equal(await verifyPassword('', '$2b$10$malformedhash'), false);
    assert.equal(await verifyPassword(null, '$2b$10$malformedhash'), false);
    assert.equal(await verifyPassword('password', null), false);
    assert.equal(await verifyPassword('password', 'not-a-valid-bcrypt-hash'), false);
  });
});
