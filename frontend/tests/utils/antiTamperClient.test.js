import { describe, it, expect } from 'vitest';
import {
  hexToBytes,
  bytesToHex,
  canonicalizeBody,
  computeBodySha256,
  createPayloadSignature,
  generateNonce
} from '../../src/utils/antiTamperClient.js';

describe('antiTamperClient (Web Crypto API Utility)', () => {
  const sampleKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('converts hex to bytes and back to hex without data loss', () => {
    const bytes = hexToBytes(sampleKeyHex);
    expect(bytes.length).toBe(32);
    const recoveredHex = bytesToHex(bytes);
    expect(recoveredHex).toBe(sampleKeyHex);
  });

  it('throws on invalid hex strings', () => {
    expect(() => hexToBytes('123')).toThrow('Invalid hex string');
  });

  it('canonicalizes body consistently', () => {
    expect(canonicalizeBody(null)).toBe('');
    expect(canonicalizeBody(undefined)).toBe('');
    expect(canonicalizeBody({})).toBe('');
    expect(canonicalizeBody('plain-string')).toBe('plain-string');
    expect(canonicalizeBody({ a: 1 })).toBe('{"a":1}');
  });

  it('computes correct SHA-256 hash using Web Crypto subtle digest', async () => {
    // Known SHA-256 of empty string is e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const emptyHash = await computeBodySha256(null);
    expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

    const strHash = await computeBodySha256('test-string');
    expect(typeof strHash).toBe('string');
    expect(strHash.length).toBe(64);
  });

  it('generates random UUID v4 nonces', () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();
    expect(nonce1).not.toBe(nonce2);
    expect(nonce1.length).toBeGreaterThanOrEqual(16);
  });

  it('generates well-formed X-Payload-Signature header format', async () => {
    const result = await createPayloadSignature({
      keyHex: sampleKeyHex,
      method: 'PUT',
      path: '/api/v1/attempts/123/answers/456',
      body: { answer_value: 'test' },
      timestamp: 1700000000000,
      nonce: '550e8400-e29b-41d4-a716-446655440000'
    });

    expect(result.headerValue).toMatch(/^t=1700000000000,nonce=550e8400-e29b-41d4-a716-446655440000,v1=[0-9a-f]{64}$/);
    expect(result.timestamp).toBe(1700000000000);
    expect(result.nonce).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.signature).toHaveLength(64);
  });

  it('generates fresh nonce and fresh timestamp on subsequent invocations (retry simulation)', async () => {
    const body = { answer_value: 'same-payload' };
    const sig1 = await createPayloadSignature({
      keyHex: sampleKeyHex,
      method: 'PUT',
      path: '/api/v1/attempts/123/answers/456',
      body
    });

    // Small delay to simulate retry
    await new Promise((r) => setTimeout(r, 10));

    const sig2 = await createPayloadSignature({
      keyHex: sampleKeyHex,
      method: 'PUT',
      path: '/api/v1/attempts/123/answers/456',
      body
    });

    expect(sig1.nonce).not.toBe(sig2.nonce);
    expect(sig1.signature).not.toBe(sig2.signature);
    expect(sig2.timestamp).toBeGreaterThanOrEqual(sig1.timestamp);
  });
});
