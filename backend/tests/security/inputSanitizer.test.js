/**
 * @file inputSanitizer.test.js
 * @description Verifies non-destructive structural input sanitization.
 * Prototype pollution keys and null bytes are stripped while preserving legitimate math/code/programming syntax.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { sanitizeInputMiddleware, sanitizeObject } from '../../src/middleware/sanitizeInput.js';

describe('Phase 18 Security: Structural Input Sanitization', () => {
  it('should strip prototype pollution keys (__proto__, constructor, prototype)', () => {
    const maliciousPayload = JSON.parse(
      '{"validKey": "test", "__proto__": {"admin": true}, "nested": {"constructor": "bad", "safe": 123}}'
    );

    const sanitized = sanitizeObject(maliciousPayload);

    assert.equal(sanitized.validKey, 'test');
    assert.equal(sanitized.__proto__.admin, undefined);
    assert.equal(sanitized.nested.safe, 123);
    assert.equal(sanitized.nested.constructor, Object.prototype.constructor); // reverted to default constructor
  });

  it('should strip null bytes from strings', () => {
    const payload = {
      filename: 'document\0.pdf',
      comment: 'Hello\0 World'
    };

    const sanitized = sanitizeObject(payload);

    assert.equal(sanitized.filename, 'document.pdf');
    assert.equal(sanitized.comment, 'Hello World');
  });

  it('should NOT strip legitimate programming code, HTML, or math syntax in answers', () => {
    const legitimateCodeAnswer = {
      answer_value: `
function solve(a, b) {
  if (a < b && b > 0) {
    return "<div class='result'>" + (a <= b) + "</div>";
  }
  return "<script>console.log('test')</script>";
}
      `.trim()
    };

    const sanitized = sanitizeObject(legitimateCodeAnswer);

    // Everything must remain 100% byte-for-byte identical!
    assert.equal(sanitized.answer_value, legitimateCodeAnswer.answer_value);
    assert.ok(sanitized.answer_value.includes('<div'));
    assert.ok(sanitized.answer_value.includes('<script>'));
    assert.ok(sanitized.answer_value.includes('a < b && b > 0'));
  });

  it('should sanitize request body in Express middleware pipeline', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use(sanitizeInputMiddleware);
    testApp.post('/test-sanitize', (req, res) => {
      res.json({ body: req.body });
    });

    const maliciousJson = '{"name": "test\\u0000user", "__proto__": {"polluted": true}, "details": {"score": 95}}';

    const res = await request(testApp)
      .post('/test-sanitize')
      .set('Content-Type', 'application/json')
      .send(maliciousJson);

    assert.equal(res.status, 200);
    assert.equal(res.body.body.name, 'testuser');
    assert.equal(res.body.body.details.score, 95);
    assert.equal(res.body.body.polluted, undefined);
  });
});
