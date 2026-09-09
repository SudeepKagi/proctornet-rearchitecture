import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from '../src/app.js';
import { extractExpressRoutes, normalizePathToOpenApi } from '../../scripts/openapi/generate-openapi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openApiPath = path.resolve(__dirname, '../../docs/api/openapi.json');

describe('OpenAPI 3.1 Route Coverage & Mechanical Parity', () => {
  it('docs/api/openapi.json exists and is valid JSON', () => {
    assert.ok(fs.existsSync(openApiPath), 'OpenAPI specification file docs/api/openapi.json must exist');
    const content = fs.readFileSync(openApiPath, 'utf8');
    const parsed = JSON.parse(content);
    assert.equal(parsed.openapi, '3.1.0');
    assert.ok(parsed.info?.title);
    assert.ok(Object.keys(parsed.paths).length > 0);
  });

  it('verifies 100% mechanical route coverage against registered Express routes', () => {
    const content = fs.readFileSync(openApiPath, 'utf8');
    const openApi = JSON.parse(content);
    const expressRoutes = extractExpressRoutes(app);

    assert.ok(expressRoutes.length > 50, `Expected at least 50 Express routes, found ${expressRoutes.length}`);

    const missingRoutes = [];

    for (const { method, path: expressPath } of expressRoutes) {
      const openApiPathKey = normalizePathToOpenApi(expressPath);
      const pathItem = openApi.paths[openApiPathKey];

      if (!pathItem) {
        missingRoutes.push({ method, path: expressPath, openApiPath: openApiPathKey, reason: 'PATH_MISSING' });
        continue;
      }

      const methodItem = pathItem[method.toLowerCase()];
      if (!methodItem) {
        missingRoutes.push({ method, path: expressPath, openApiPath: openApiPathKey, reason: 'METHOD_MISSING' });
      }
    }

    if (missingRoutes.length > 0) {
      console.error('Missing OpenAPI routes detected:', missingRoutes);
    }

    assert.equal(
      missingRoutes.length,
      0,
      `Detected ${missingRoutes.length} undocumented Express endpoints in openapi.json. Run scripts/openapi/generate-openapi.js to update.`
    );
  });

  it('covers endpoints for all five system roles', () => {
    const content = fs.readFileSync(openApiPath, 'utf8');
    const openApi = JSON.parse(content);
    const paths = Object.keys(openApi.paths);

    // Admin endpoints
    assert.ok(paths.some(p => p.startsWith('/api/v1/admin')), 'Must contain Admin endpoints');
    // Developer endpoints
    assert.ok(paths.some(p => p.startsWith('/api/v1/developer')), 'Must contain Developer endpoints');
    // Faculty endpoints
    assert.ok(paths.some(p => p.startsWith('/api/v1/faculty') || p.startsWith('/api/v1/exams')), 'Must contain Faculty endpoints');
    // Invigilator endpoints
    assert.ok(paths.some(p => p.startsWith('/api/v1/interventions')), 'Must contain Invigilator endpoints');
    // Student endpoints
    assert.ok(paths.some(p => p.startsWith('/api/v1/candidate') || p.startsWith('/api/v1/attempts')), 'Must contain Student endpoints');
  });
});
