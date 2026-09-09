import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { LogBuffer } from '../../../src/modules/developer/logBuffer.js';

describe('LogBuffer', () => {
  let buffer;

  beforeEach(() => {
    buffer = new LogBuffer(10);
  });

  it('stores and retrieves logs in reverse chronological order', () => {
    buffer.addEntry({ level: 'info', msg: 'First message', time: 1000 });
    buffer.addEntry({ level: 'warn', msg: 'Second message', time: 2000 });
    buffer.addEntry({ level: 'error', msg: 'Third message', time: 3000 });

    const res = buffer.query();
    assert.equal(res.totalMatching, 3);
    assert.equal(res.logs[0].message, 'Third message');
    assert.equal(res.logs[1].message, 'Second message');
    assert.equal(res.logs[2].message, 'First message');
  });

  it('evicts oldest logs when capacity is exceeded', () => {
    for (let i = 1; i <= 15; i++) {
      buffer.addEntry({ level: 'info', msg: `Message ${i}`, time: i * 1000 });
    }

    assert.equal(buffer.size, 10);
    const res = buffer.query({ limit: 10 });
    assert.equal(res.totalMatching, 10);
    // Newest should be Message 15
    assert.equal(res.logs[0].message, 'Message 15');
    // Oldest surviving should be Message 6
    assert.equal(res.logs[9].message, 'Message 6');
  });

  it('filters by log level accurately', () => {
    buffer.addEntry({ level: 'info', msg: 'Info 1' });
    buffer.addEntry({ level: 'error', msg: 'Error 1' });
    buffer.addEntry({ level: 'warn', msg: 'Warn 1' });
    buffer.addEntry({ level: 'error', msg: 'Error 2' });

    const errors = buffer.query({ level: 'error' });
    assert.equal(errors.totalMatching, 2);
    assert.equal(errors.logs.every((l) => l.level === 'error'), true);
  });

  it('filters by traceId and requestId', () => {
    buffer.addEntry({ level: 'info', msg: 'Trace A', traceId: 'tr-aaa', requestId: 'req-1' });
    buffer.addEntry({ level: 'info', msg: 'Trace B', traceId: 'tr-bbb', requestId: 'req-2' });

    const traceMatch = buffer.query({ traceId: 'tr-aaa' });
    assert.equal(traceMatch.totalMatching, 1);
    assert.equal(traceMatch.logs[0].message, 'Trace A');

    const reqMatch = buffer.query({ requestId: 'req-2' });
    assert.equal(reqMatch.totalMatching, 1);
    assert.equal(reqMatch.logs[0].message, 'Trace B');
  });

  it('performs case-insensitive substring search in message and context', () => {
    buffer.addEntry({ level: 'info', msg: 'Payment processed successfully', details: { id: 100 } });
    buffer.addEntry({ level: 'error', msg: 'Database connection timeout', details: { host: 'pg-primary' } });

    const searchRes = buffer.query({ search: 'connection' });
    assert.equal(searchRes.totalMatching, 1);
    assert.equal(searchRes.logs[0].message, 'Database connection timeout');

    const contextSearch = buffer.query({ search: 'pg-primary' });
    assert.equal(contextSearch.totalMatching, 1);
    assert.equal(contextSearch.logs[0].message, 'Database connection timeout');
  });

  it('sanitizes sensitive data automatically when adding entries', () => {
    buffer.addEntry({
      level: 'info',
      msg: 'Login attempt',
      password: 'mypassword',
      token: 'jwt-token-val',
      email: 'student@campus.edu'
    });

    const res = buffer.query();
    assert.equal(res.logs[0].context.password, '[REDACTED]');
    assert.equal(res.logs[0].context.token, '[REDACTED]');
    assert.equal(res.logs[0].context.email, '[REDACTED_EMAIL]');
  });
});
