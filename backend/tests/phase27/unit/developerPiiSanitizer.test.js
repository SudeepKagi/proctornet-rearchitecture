import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeDeveloperPayload,
  redactText,
  isSensitiveKey
} from '../../../src/modules/developer/developerPiiSanitizer.js';

describe('developerPiiSanitizer', () => {
  it('identifies sensitive keys accurately', () => {
    assert.equal(isSensitiveKey('password'), true);
    assert.equal(isSensitiveKey('token'), true);
    assert.equal(isSensitiveKey('refreshToken'), true);
    assert.equal(isSensitiveKey('apiKey'), true);
    assert.equal(isSensitiveKey('secret'), true);
    assert.equal(isSensitiveKey('authorization'), true);
    assert.equal(isSensitiveKey('embedding'), true);
    assert.equal(isSensitiveKey('face_embedding'), true);
    assert.equal(isSensitiveKey('answer_text'), true);
    assert.equal(isSensitiveKey('numeric_value'), true);
    assert.equal(isSensitiveKey('student_name'), true);
    assert.equal(isSensitiveKey('candidate_name'), true);
    assert.equal(isSensitiveKey('id_document_url'), true);
    assert.equal(isSensitiveKey('score'), true);

    assert.equal(isSensitiveKey('service'), false);
    assert.equal(isSensitiveKey('status'), false);
    assert.equal(isSensitiveKey('timestamp'), false);
    assert.equal(isSensitiveKey('uptimeSeconds'), false);
  });

  it('redacts sensitive string patterns (emails, JWTs, bearer tokens, USNs, IPs)', () => {
    const raw = 'User john.doe@university.edu with USN 1MS21CS042 connected from 192.168.1.50 using Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlF5m0Q';
    const redacted = redactText(raw);

    assert.equal(redacted.includes('john.doe@university.edu'), false);
    assert.equal(redacted.includes('1MS21CS042'), false);
    assert.equal(redacted.includes('192.168.1.50'), false);
    assert.equal(redacted.includes('[REDACTED_EMAIL]'), true);
    assert.equal(redacted.includes('[REDACTED_USN]'), true);
    assert.equal(redacted.includes('192.168.xx.xx'), true);
    assert.equal(redacted.includes('Bearer [REDACTED_TOKEN]'), true);
  });

  it('deeply sanitizes complex nested objects and arrays', () => {
    const payload = {
      service: 'exam-engine',
      requestId: 'req-123',
      user: {
        id: 'u-1',
        email: 'alice@school.org',
        password: 'SuperSecretPassword123!',
        token: 'secret-token-abc',
        roles: ['STUDENT'],
        biometrics: {
          embedding: [0.12, 0.45, 0.99]
        }
      },
      attempt: {
        answers: [
          { questionId: 'q-1', answerText: 'This is my essay answer' }
        ],
        score: 95
      }
    };

    const sanitized = sanitizeDeveloperPayload(payload);

    assert.equal(sanitized.service, 'exam-engine');
    assert.equal(sanitized.requestId, 'req-123');
    assert.equal(sanitized.user.password, '[REDACTED]');
    assert.equal(sanitized.user.token, '[REDACTED]');
    assert.equal(sanitized.user.email, '[REDACTED_EMAIL]');
    assert.equal(sanitized.user.biometrics, '[REDACTED]');
    assert.equal(sanitized.attempt.answers, '[REDACTED]');
    assert.equal(sanitized.attempt.score, '[REDACTED]');
  });
});
