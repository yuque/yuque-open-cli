import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FixtureServer } from './fixture-server.js';
import { runYuque } from './run-cli.js';

let server: FixtureServer;
let host: string;

beforeEach(async () => {
  server = new FixtureServer();
  host = await server.start();
});

afterEach(async () => {
  await server.stop();
});

describe('note commands', () => {
  it('note list --all drains pages by has_more', async () => {
    server.route('GET', '/api/v2/notes', (request) =>
      request.query.page === '1'
        ? {
            body: {
              data: {
                pin_notes: [{ id: 1, slug: 'pinned', pinned_at: '2026-07-20T00:00:00Z' }],
                notes: [{ id: 2, slug: 'first' }],
                has_more: true,
              },
            },
          }
        : {
            body: {
              data: { pin_notes: [], notes: [{ id: 3, slug: 'last' }], has_more: false },
            },
          }
    );

    const result = await runYuque(['note', 'list', '--all', '--limit', '2', '--json'], { host });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      pin_notes: [{ id: 1, slug: 'pinned', pinned_at: '2026-07-20T00:00:00Z' }],
      notes: [
        { id: 2, slug: 'first' },
        { id: 3, slug: 'last' },
      ],
      has_more: false,
    });
    expect(server.requests.map((request) => request.query.page)).toEqual(['1', '2']);
  });

  it('note get renders the double-nested content object as a record', async () => {
    server.route('GET', '/api/v2/notes/7', {
      body: {
        data: {
          id: 7,
          slug: 'weekly',
          content: { source: '# Weekly', html: '<h1>Weekly</h1>', abstract: 'Weekly' },
          word_count: 1,
        },
      },
    });
    const result = await runYuque(['note', 'get', '7'], { host });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('# Weekly');
  });

  it('note create sends Markdown and consumes the non-standard success envelope', async () => {
    server.route('POST', '/api/v2/notes', {
      body: {
        success: true,
        data: { id: 8, slug: 'weekly', note_url: 'https://example.test/notes/weekly' },
      },
    });
    const result = await runYuque(['note', 'create', '--body', '# Weekly'], { host });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Created note weekly');
    expect(server.requests[0].body).toEqual({ body: '# Weekly' });
  });

  it('note update sends all required fields and consumes the double data envelope', async () => {
    server.route('PUT', '/api/v2/notes/7', {
      body: {
        data: {
          data: {
            id: 7,
            slug: 'weekly',
            content: { source: '# Updated', html: '<h1>Updated</h1>', abstract: 'Updated' },
            status: 0,
          },
        },
      },
    });
    const result = await runYuque(
      [
        'note',
        'update',
        '7',
        '--source',
        '# Updated',
        '--html',
        '<h1>Updated</h1>',
        '--abstract',
        'Updated',
        '--status',
        '0',
        '--json',
      ],
      { host }
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ id: 7, status: 0 });
    expect(server.requests[0].body).toEqual({
      source: '# Updated',
      html: '<h1>Updated</h1>',
      abstract: 'Updated',
      status: 0,
    });
  });
});

describe('resource commands', () => {
  const resultBody = {
    data: {
      doc_id: 9,
      title: 'Architecture',
      url: 'https://example.test/docs/9',
      board: {
        page_ref: { src: 'board-id' },
        resource: { id: 'board-id', kind: 'architecturediagram' },
        dsl: { cells: [] },
        summary: {
          cell_count: 0,
          type_counts: {},
          shape_counts: {},
          has_viewport: false,
          has_search: false,
        },
      },
    },
  };

  it('resource get sends the fixed board resource_type and raw src query fields', async () => {
    server.route('GET', '/api/v2/yfm/boards', { body: resultBody });
    const result = await runYuque(['resource', 'get', 'board-id', '--doc-id', '9', '--json'], {
      host,
    });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ doc_id: 9, title: 'Architecture' });
    expect(server.requests[0].query).toEqual({
      resource_type: 'board',
      src: 'board-id',
      doc_id: '9',
    });
  });

  it('resource create sends text DSL without a tool-layer resource_type field', async () => {
    server.route('POST', '/api/v2/yfm/boards', { body: resultBody });
    const result = await runYuque(
      [
        'resource',
        'create',
        '--type',
        'architecturediagram',
        '--dsl',
        'service -> database',
        '--url',
        'https://example.test/docs/9',
      ],
      { host }
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Architecture');
    expect(server.requests[0].body).toEqual({
      type: 'architecturediagram',
      dsl: 'service -> database',
      url: 'https://example.test/docs/9',
    });
  });

  it('resource update sends src and parsed JSON DSL in the body', async () => {
    server.route('PUT', '/api/v2/yfm/boards', { body: resultBody });
    const result = await runYuque(
      [
        'resource',
        'update',
        'board-id',
        '--doc-id',
        '9',
        '--dsl',
        '{"cells":[{"id":"service"}]}',
        '--json',
      ],
      { host }
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ doc_id: 9 });
    expect(server.requests[0].body).toEqual({
      src: 'board-id',
      doc_id: 9,
      dsl: { cells: [{ id: 'service' }] },
    });
  });
});
