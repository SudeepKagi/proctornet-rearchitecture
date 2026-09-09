/**
 * @file logBuffer.js
 * @description High-performance circular ring buffer retaining up to 5,000 recent structured log records.
 * Provides sub-second in-memory search and filtering for Developer Operations with automated PII redaction.
 */

import { sanitizeDeveloperPayload } from './developerPiiSanitizer.js';

const DEFAULT_CAPACITY = 5000;

class LogBuffer {
  /**
   * @param {number} [capacity=5000]
   */
  constructor(capacity = DEFAULT_CAPACITY) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    this.nextSeq = 1;
  }

  /**
   * Appends a log record into the circular ring buffer.
   * If buffer is saturated, the oldest entry is overwritten in O(1) time.
   * @param {Record<string, any>} rawEntry
   */
  addEntry(rawEntry) {
    if (!rawEntry || typeof rawEntry !== 'object') return;

    // Normalize level representation (Pino uses numeric levels or strings)
    let levelStr = 'info';
    if (typeof rawEntry.level === 'string') {
      levelStr = rawEntry.level.toLowerCase();
    } else if (typeof rawEntry.level === 'number') {
      if (rawEntry.level <= 10) levelStr = 'trace';
      else if (rawEntry.level <= 20) levelStr = 'debug';
      else if (rawEntry.level <= 30) levelStr = 'info';
      else if (rawEntry.level <= 40) levelStr = 'warn';
      else if (rawEntry.level <= 50) levelStr = 'error';
      else levelStr = 'fatal';
    }

    const timestamp = rawEntry.time
      ? new Date(rawEntry.time).toISOString()
      : new Date().toISOString();

    const entry = {
      id: this.nextSeq++,
      timestamp,
      level: levelStr,
      service: rawEntry.service || rawEntry.base?.service || 'proctornet-backend',
      message: rawEntry.msg || rawEntry.message || '',
      traceId: rawEntry.traceId || rawEntry.traceparent?.split('-')?.[1] || null,
      requestId: rawEntry.requestId || null,
      context: sanitizeDeveloperPayload({ ...rawEntry })
    };

    // Remove internal redundant fields from context
    delete entry.context.msg;
    delete entry.context.message;
    delete entry.context.level;
    delete entry.context.time;

    this.buffer[this.tail] = entry;
    this.tail = (this.tail + 1) % this.capacity;

    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
  }

  /**
   * Queries the in-memory buffer with filtering and pagination.
   * Filters run in single-digit milliseconds across 5,000 entries.
   * @param {object} filters
   * @param {string} [filters.level]
   * @param {string} [filters.service]
   * @param {string} [filters.traceId]
   * @param {string} [filters.requestId]
   * @param {string} [filters.search]
   * @param {string} [filters.from]
   * @param {string} [filters.to]
   * @param {number} [filters.limit=50]
   * @param {string} [filters.cursor]
   * @returns {{ logs: any[], totalMatching: number, nextCursor: string|null }}
   */
  query(filters = {}) {
    const {
      level,
      service,
      traceId,
      requestId,
      search,
      from,
      to,
      limit = 50,
      cursor
    } = filters;

    const fromTime = from ? new Date(from).getTime() : null;
    const toTime = to ? new Date(to).getTime() : null;
    const searchLower = search ? search.toLowerCase() : null;
    const cursorId = cursor ? parseInt(cursor, 10) : null;

    const matched = [];

    // Traverse buffer in reverse chronological order (newest first)
    for (let i = 0; i < this.count; i++) {
      const idx = (this.tail - 1 - i + this.capacity) % this.capacity;
      const item = this.buffer[idx];
      if (!item) continue;

      if (cursorId && item.id >= cursorId) {
        continue;
      }

      if (level && item.level !== level.toLowerCase()) {
        continue;
      }

      if (service && item.service.toLowerCase() !== service.toLowerCase()) {
        continue;
      }

      if (traceId && item.traceId !== traceId) {
        continue;
      }

      if (requestId && item.requestId !== requestId) {
        continue;
      }

      if (fromTime || toTime) {
        const itemTime = new Date(item.timestamp).getTime();
        if (fromTime && itemTime < fromTime) continue;
        if (toTime && itemTime > toTime) continue;
      }

      if (searchLower) {
        const msgMatch = item.message && item.message.toLowerCase().includes(searchLower);
        const contextMatch = JSON.stringify(item.context).toLowerCase().includes(searchLower);
        if (!msgMatch && !contextMatch) {
          continue;
        }
      }

      matched.push(item);
    }

    const totalMatching = matched.length;
    const boundedLimit = Math.min(Math.max(1, limit), 200);
    const page = matched.slice(0, boundedLimit);
    const nextCursor = page.length === boundedLimit && page.length < totalMatching
      ? String(page[page.length - 1].id)
      : null;

    return {
      logs: page,
      totalMatching,
      nextCursor
    };
  }

  /**
   * Clears the log buffer (useful for test isolation).
   */
  clear() {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    this.nextSeq = 1;
  }

  get size() {
    return this.count;
  }
}

export const logBuffer = new LogBuffer(DEFAULT_CAPACITY);
export { LogBuffer };
