import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  logQuerySchema,
  auditQuerySchema,
  incidentActionSchema,
  componentParamSchema
} from '../../../src/modules/developer/developer.schemas.js';

describe('developer.schemas', () => {
  it('validates logQuerySchema with defaults and filters', () => {
    const valid = logQuerySchema.parse({
      level: 'error',
      service: 'proctornet-backend',
      limit: '25'
    });
    assert.equal(valid.level, 'error');
    assert.equal(valid.service, 'proctornet-backend');
    assert.equal(valid.limit, 25);

    assert.throws(() => logQuerySchema.parse({ level: 'invalid_level' }));
  });

  it('validates auditQuerySchema with pagination limits', () => {
    const parsed = auditQuerySchema.parse({ limit: '10', page: '2' });
    assert.equal(parsed.limit, 10);
    assert.equal(parsed.page, 2);

    assert.throws(() => auditQuerySchema.parse({ limit: 500 }));
  });

  it('validates incidentActionSchema with optional notes', () => {
    const valid = incidentActionSchema.parse({ notes: 'Investigating issue' });
    assert.equal(valid.notes, 'Investigating issue');

    const empty = incidentActionSchema.parse({});
    assert.equal(empty.notes, undefined);
  });

  it('validates componentParamSchema strictly against the 13 supported subsystems', () => {
    assert.equal(
      componentParamSchema.parse({ component: 'postgres_primary' }).component,
      'postgres_primary'
    );
    assert.equal(
      componentParamSchema.parse({ component: 'wireguard' }).component,
      'wireguard'
    );

    assert.throws(() => componentParamSchema.parse({ component: 'unknown_service' }));
  });
});
