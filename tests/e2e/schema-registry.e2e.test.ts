import { describe, expect, it } from 'vitest';
import { compilePathTemplate, getFixtureSchemaRegistry } from './schema-registry.js';

describe('fixture schema registry', () => {
  const registry = getFixtureSchemaRegistry();

  it('indexes and compiles the OpenAPI operation schemas once', () => {
    expect(registry.summary).toEqual({
      operations: 45,
      requestSchemas: 15,
      responseSchemas: 45,
    });
  });

  it('matches concrete and percent-encoded paths against spec templates', () => {
    const pattern = compilePathTemplate('/api/v2/repos/{namespace}');
    expect(pattern.test('/api/v2/repos/42')).toBe(true);
    expect(pattern.test('/api/v2/repos/yuque%2Fdocs')).toBe(true);
    expect(pattern.test('/api/v2/repos/yuque/docs')).toBe(false);

    expect(
      registry.validateResponse('GET', '/api/v2/repos/yuque%2Fdocs', 200, {
        data: { id: 42 },
      })
    ).toBe(true);
  });

  it('reports the exact response path and Ajv error details', () => {
    expect(() =>
      registry.validateResponse('GET', '/api/v2/user', 200, {
        data: { id: 'not-an-integer' },
      })
    ).toThrowError(
      /Fixture response schema validation failed for GET \/api\/v2\/user[\s\S]*"instancePath": "\/data\/id"/
    );
  });

  it('validates POST and PUT request bodies, including required fields', () => {
    expect(
      registry.validateRequest('POST', '/api/v2/users/me/repos', {
        name: 'Notes',
        slug: 'notes',
      })
    ).toBe(true);

    expect(() =>
      registry.validateRequest('POST', '/api/v2/users/me/repos', {
        name: 'Notes',
      })
    ).toThrowError(
      /Fixture request schema validation failed for POST \/api\/v2\/users\/me\/repos[\s\S]*"missingProperty": "slug"/
    );
  });

  it('keeps known live list-shape corrections operation-scoped', () => {
    expect(
      registry.validateResponse('GET', '/api/v2/users/tester/groups', 200, {
        data: [{ id: 1, login: 'eng' }],
      })
    ).toBe(true);
    expect(
      registry.validateResponse('GET', '/api/v2/groups/eng/statistics/members', 200, {
        data: { members: [{ user_id: '1', read_count: '5' }], total: 1 },
      })
    ).toBe(true);
  });

  it('validates note envelope quirks and board locator/update bodies', () => {
    expect(
      registry.validateResponse('POST', '/api/v2/notes', 200, {
        success: true,
        data: { id: 7, slug: 'n7', note_url: 'https://example.test/n7' },
      })
    ).toBe(true);
    expect(
      registry.validateResponse('PUT', '/api/v2/notes/7', 200, {
        data: { data: { id: 7, slug: 'n7' } },
      })
    ).toBe(true);
    expect(
      registry.validateRequest('POST', '/api/v2/yfm/boards', {
        type: 'mindmap',
        dsl: 'root',
        doc_id: 9,
      })
    ).toBe(true);
    expect(
      registry.validateRequest('PUT', '/api/v2/yfm/boards', {
        src: 'board-id',
        url: 'https://example.test/docs/9',
        dsl: { cells: [] },
      })
    ).toBe(true);
    expect(() =>
      registry.validateRequest('PUT', '/api/v2/yfm/boards', {
        src: 'board-id',
        doc_id: 9,
        url: 'https://example.test/docs/9',
        text: 'root',
      })
    ).toThrowError(/Fixture request schema validation failed/);
  });

  it('skips routes and response statuses with no JSON schema', () => {
    expect(
      registry.validateResponse('GET', '/api/v2/user', 401, {
        message: 'invalid token',
      })
    ).toBe(false);
    expect(registry.validateResponse('GET', '/not-in-the-spec', 200, {})).toBe(false);
  });
});
