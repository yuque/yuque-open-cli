import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import axios, { type AxiosInstance } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli.js';

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    default: {
      ...actual.default,
      create: vi.fn(),
      isAxiosError: actual.default.isAxiosError,
    },
  };
});

const mockedAxios = vi.mocked(axios, { partial: true });
const request = vi.fn();

function argv(...args: string[]): string[] {
  return ['node', 'yuque', ...args];
}

function ok(data: unknown) {
  return { data: { data } };
}

let stdoutChunks: string[] = [];
let stderrChunks: string[] = [];

beforeEach(() => {
  request.mockReset();
  mockedAxios.create.mockReturnValue({ request } as unknown as AxiosInstance);
  vi.stubEnv('YUQUE_TOKEN', 'test-token');
  stdoutChunks = [];
  stderrChunks = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdoutChunks.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderrChunks.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const stdoutText = () => stdoutChunks.join('');
const stderrText = () => stderrChunks.join('');

describe('note commands', () => {
  const note = {
    id: 7,
    slug: 'n7',
    content: {
      source: '# Weekly note',
      html: '<h1>Weekly note</h1>',
      abstract: 'Weekly note',
    },
    status: 0,
    tags: ['weekly'],
    word_count: 2,
    pinned_at: null,
    updated_at: '2026-07-24T00:00:00Z',
  };

  it('lists notes with status/page/limit and preserves the result object for --json', async () => {
    const page = { pin_notes: [], notes: [note], has_more: false };
    request.mockResolvedValueOnce(ok(page));

    await expect(
      runCli(argv('note', 'list', '--status', '0', '--page', '2', '--limit', '10', '--json'))
    ).resolves.toBe(0);
    expect(request).toHaveBeenCalledWith({
      method: 'get',
      url: '/notes',
      params: { status: 0, page: 2, limit: 10 },
      data: undefined,
    });
    expect(JSON.parse(stdoutText())).toEqual(page);
  });

  it('--all follows has_more, increments page, and merges both note collections', async () => {
    const pinned = { ...note, id: 1, slug: 'pinned', pinned_at: '2026-07-20T00:00:00Z' };
    request
      .mockResolvedValueOnce(
        ok({ pin_notes: [pinned], notes: [{ ...note, id: 2 }], has_more: true })
      )
      .mockResolvedValueOnce(ok({ pin_notes: [], notes: [{ ...note, id: 3 }], has_more: false }));

    await expect(
      runCli(argv('note', 'list', '--status', '0', '--limit', '2', '--all', '--json'))
    ).resolves.toBe(0);
    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ params: { status: 0, page: 1, limit: 2 } })
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ params: { status: 0, page: 2, limit: 2 } })
    );
    expect(JSON.parse(stdoutText())).toEqual({
      pin_notes: [pinned],
      notes: [
        { ...note, id: 2 },
        { ...note, id: 3 },
      ],
      has_more: false,
    });
  });

  it('renders pinned and normal notes in a human-readable table', async () => {
    request.mockResolvedValueOnce(
      ok({
        pin_notes: [{ ...note, pinned_at: '2026-07-20T00:00:00Z' }],
        notes: [],
        has_more: false,
      })
    );
    await expect(runCli(argv('note', 'list'))).resolves.toBe(0);
    expect(stdoutText()).toContain('CONTENT');
    expect(stdoutText()).toContain('# Weekly note');
    expect(stdoutText()).toContain('yes');
  });

  it('gets a note and prints its record fields', async () => {
    request.mockResolvedValueOnce(ok(note));
    await expect(runCli(argv('note', 'get', '7'))).resolves.toBe(0);
    expect(request).toHaveBeenCalledWith({
      method: 'get',
      url: '/notes/7',
      params: undefined,
      data: undefined,
    });
    expect(stdoutText()).toContain('Weekly note');
    expect(stdoutText()).toContain('word_count');
  });

  it('creates a note from --body-file and unwraps the success envelope', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yuque-note-'));
    const file = join(dir, 'note.md');
    writeFileSync(file, '# from file\n');
    try {
      const created = { id: 8, slug: 'n8', note_url: 'https://example.test/n8' };
      request.mockResolvedValueOnce({ data: { success: true, data: created } });
      await expect(runCli(argv('note', 'create', '--body-file', file))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'post',
        url: '/notes',
        params: undefined,
        data: { body: '# from file\n' },
      });
      expect(stdoutText()).toContain('Created note n8');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('updates a note and explicitly consumes the double data envelope', async () => {
    request.mockResolvedValueOnce({ data: { data: { data: note } } });
    await expect(
      runCli(
        argv(
          'note',
          'update',
          '7',
          '--source',
          '# Weekly note',
          '--html',
          '<h1>Weekly note</h1>',
          '--abstract',
          'Weekly note',
          '--status',
          '0',
          '--json'
        )
      )
    ).resolves.toBe(0);
    expect(request).toHaveBeenCalledWith({
      method: 'put',
      url: '/notes/7',
      params: undefined,
      data: {
        source: '# Weekly note',
        html: '<h1>Weekly note</h1>',
        abstract: 'Weekly note',
        status: 0,
      },
    });
    expect(JSON.parse(stdoutText())).toEqual(note);
  });

  it('supports --source-file for note updates', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yuque-note-'));
    const file = join(dir, 'source.md');
    writeFileSync(file, 'source text');
    try {
      request.mockResolvedValueOnce({ data: { data: { data: note } } });
      await expect(
        runCli(
          argv(
            'note',
            'update',
            '7',
            '--source-file',
            file,
            '--html',
            '<p>source text</p>',
            '--abstract',
            'source text'
          )
        )
      ).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            source: 'source text',
            html: '<p>source text</p>',
            abstract: 'source text',
          },
        })
      );
      expect(stdoutText()).toContain('Weekly note');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    {
      args: ['note', 'list', '--page', '0'],
      message: '--page expects a positive integer',
    },
    {
      args: ['note', 'list', '--status', '-1'],
      message: '--status expects a non-negative integer',
    },
    {
      args: ['note', 'get', 'zero'],
      message: 'note id expects a positive integer',
    },
    {
      args: ['note', 'create'],
      message: 'a note body is required',
    },
    {
      args: ['note', 'create', '--body', 'x', '--body-file', 'x.md'],
      message: 'mutually exclusive',
    },
    {
      args: ['note', 'update', '7', '--html', '<p>x</p>', '--abstract', 'x'],
      message: 'note source is required',
    },
  ])('rejects invalid note usage before making a request: $message', async ({ args, message }) => {
    await expect(runCli(argv(...args))).resolves.toBe(2);
    expect(request).not.toHaveBeenCalled();
    expect(stderrText()).toContain(message);
  });
});

describe('resource commands', () => {
  const resource = {
    doc_id: 9,
    title: 'Planning board',
    url: 'https://example.test/docs/9',
    updated_at: '2026-07-24T00:00:00Z',
    board: {
      page_ref: { src: 'board-resource' },
      resource: { id: 'board-resource', kind: 'mindmap' },
      dsl: { cells: [] },
      summary: {
        cell_count: 0,
        type_counts: {},
        shape_counts: {},
        has_viewport: false,
        has_search: false,
      },
    },
  };

  it('gets a board using resource_type=board, src, and one document locator', async () => {
    request.mockResolvedValueOnce(ok(resource));
    await expect(runCli(argv('resource', 'get', 'board-resource', '--doc-id', '9'))).resolves.toBe(
      0
    );
    expect(request).toHaveBeenCalledWith({
      method: 'get',
      url: '/yfm/boards',
      params: { resource_type: 'board', src: 'board-resource', doc_id: 9 },
      data: undefined,
    });
    expect(stdoutText()).toContain('Planning board');
    expect(stdoutText()).toContain('board-resource');
  });

  it('creates a board from --dsl-file with exact wire field names', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yuque-resource-'));
    const file = join(dir, 'board.dsl');
    writeFileSync(file, 'root -> child\n');
    try {
      request.mockResolvedValueOnce(ok(resource));
      await expect(
        runCli(
          argv(
            'resource',
            'create',
            '--type',
            'flowchart',
            '--dsl-file',
            file,
            '--url',
            'https://example.test/docs/9',
            '--insert-after-lake-id',
            'lake-1',
            '--json'
          )
        )
      ).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'post',
        url: '/yfm/boards',
        params: undefined,
        data: {
          type: 'flowchart',
          dsl: 'root -> child\n',
          url: 'https://example.test/docs/9',
          insert_after_lake_id: 'lake-1',
        },
      });
      expect(JSON.parse(stdoutText())).toEqual(resource);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses update --dsl as a JSON object and sends src in the body', async () => {
    request.mockResolvedValueOnce(ok(resource));
    await expect(
      runCli(
        argv(
          'resource',
          'update',
          'board-resource',
          '--doc-id',
          '9',
          '--dsl',
          '{"cells":[{"id":"a"}]}',
          '--json'
        )
      )
    ).resolves.toBe(0);
    expect(request).toHaveBeenCalledWith({
      method: 'put',
      url: '/yfm/boards',
      params: undefined,
      data: {
        src: 'board-resource',
        doc_id: 9,
        dsl: { cells: [{ id: 'a' }] },
      },
    });
    expect(JSON.parse(stdoutText())).toEqual(resource);
  });

  it('updates a board from --text and renders the result', async () => {
    request.mockResolvedValueOnce(ok(resource));
    await expect(
      runCli(
        argv(
          'resource',
          'update',
          'board-resource',
          '--url',
          'https://example.test/docs/9',
          '--text',
          'root -> child'
        )
      )
    ).resolves.toBe(0);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          src: 'board-resource',
          url: 'https://example.test/docs/9',
          text: 'root -> child',
        },
      })
    );
    expect(stdoutText()).toContain('Planning board');
  });

  it.each([
    {
      args: ['resource', 'get', 'board-resource'],
      message: 'exactly one of --doc-id or --url',
    },
    {
      args: [
        'resource',
        'get',
        'board-resource',
        '--doc-id',
        '9',
        '--url',
        'https://example.test/docs/9',
      ],
      message: 'exactly one of --doc-id or --url',
    },
    {
      args: ['resource', 'get', 'board://resource', '--doc-id', '9'],
      message: 'raw board resource id',
    },
    {
      args: ['resource', 'create', '--type', 'mindmap', '--doc-id', '9'],
      message: 'board DSL is required',
    },
    {
      args: ['resource', 'update', 'board-resource', '--doc-id', '9', '--text', 'x', '--dsl', '{}'],
      message: 'exactly one of --text or --dsl/--dsl-file',
    },
    {
      args: ['resource', 'update', 'board-resource', '--doc-id', '9', '--dsl', '[]'],
      message: 'board DSL must be a JSON object',
    },
    {
      args: ['resource', 'update', 'board-resource', '--doc-id', '9', '--dsl', '{'],
      message: 'board DSL must be a valid JSON object',
    },
  ])(
    'rejects invalid resource usage before making a request: $message',
    async ({ args, message }) => {
      await expect(runCli(argv(...args))).resolves.toBe(2);
      expect(request).not.toHaveBeenCalled();
      expect(stderrText()).toContain(message);
    }
  );
});
