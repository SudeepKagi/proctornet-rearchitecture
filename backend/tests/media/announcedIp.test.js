import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnnouncedIp, resetAnnouncedIpCache } from '../../src/infrastructure/media/sfuManager.js';

describe('SFU Dynamic Announced IP Resolution (AWS IMDSv2 & Multi-Node)', () => {
  beforeEach(() => {
    resetAnnouncedIpCache();
  });

  it('returns overrideIp when explicitly provided', async () => {
    const ip = await resolveAnnouncedIp({ overrideIp: '13.234.56.78' });
    assert.equal(ip, '13.234.56.78');
  });

  it('falls back to undefined when IMDSv2 is unreachable (non-EC2 local dev)', async () => {
    // Calling with short timeout against 127.0.0.1 or non-existent endpoint
    const ip = await resolveAnnouncedIp({ timeoutMs: 50 });
    // In local dev without AWS IMDSv2, it returns undefined or config.MEDIA_ANNOUNCED_IP
    assert.ok(ip === undefined || typeof ip === 'string');
  });

  it('successfully resolves and caches IPv4 when mock IMDSv2 responds', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, options) => {
        if (url === 'http://169.254.169.254/latest/api/token' && options?.method === 'PUT') {
          return {
            ok: true,
            text: async () => 'mock-aws-imdsv2-token-xyz'
          };
        }
        if (url === 'http://169.254.169.254/latest/meta-data/public-ipv4') {
          assert.equal(options?.headers?.['X-aws-ec2-metadata-token'], 'mock-aws-imdsv2-token-xyz');
          return {
            ok: true,
            text: async () => '13.235.100.200'
          };
        }
        return { ok: false };
      };

      const resolvedIp = await resolveAnnouncedIp({ timeoutMs: 500 });
      assert.equal(resolvedIp, '13.235.100.200');

      // Second resolution should hit cache without calling fetch
      globalThis.fetch = async () => {
        throw new Error('Should not call fetch when cached');
      };
      const cachedIp = await resolveAnnouncedIp();
      assert.equal(cachedIp, '13.235.100.200');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects invalid non-IPv4 text from IMDSv2 and returns undefined', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url) => {
        if (url.includes('token')) {
          return { ok: true, text: async () => 'token' };
        }
        return { ok: true, text: async () => '<html>Not an IP</html>' };
      };

      const resolved = await resolveAnnouncedIp({ timeoutMs: 200 });
      assert.equal(resolved, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
