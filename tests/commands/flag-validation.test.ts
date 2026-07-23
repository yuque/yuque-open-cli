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

function argv(...args: string[]): string[] {
  return ['node', 'yuque', ...args];
}

const invalidFlags = [
  {
    name: 'doc format rejected by Option.choices',
    args: ['doc', 'create', 'ns/book', '--title', 't', '--format', 'bogus'],
    message: 'Allowed choices are markdown, html, lake',
  },
  {
    name: 'group role rejected by Option.choices',
    args: ['group', 'members', '1', '--role', 'bogus'],
    message: 'Allowed choices are 0, 1, 2',
  },
  {
    name: 'toc action rejected by Option.choices',
    args: ['toc', 'update', 'ns/book', '--action', 'bogus'],
    message: 'Allowed choices are appendNode, prependNode, editNode, removeNode',
  },
  {
    name: 'toc integer rejected by InvalidArgumentError',
    args: ['toc', 'update', 'ns/book', '--action', 'appendNode', '--doc-id', 'nope'],
    message: 'Expected a non-negative integer',
  },
  {
    name: 'group integer rejected by InvalidArgumentError',
    args: ['group', 'members', '1', '--offset', 'nope'],
    message: 'Expected a non-negative integer',
  },
  {
    name: 'book integer rejected by UsageError',
    args: ['book', 'list', 'someone', '--limit', 'banana'],
    message: 'Expected a non-negative integer, got "banana"',
  },
  {
    name: 'book limit rejected by UsageError',
    args: ['book', 'list', 'someone', '--limit', '101'],
    message: '--limit is capped at 100 by the Yuque API, got 101',
  },
] satisfies { name: string; args: string[]; message: string }[];

describe('flag validation exit codes', () => {
  const request = vi.fn();
  let stderrChunks: string[] = [];

  beforeEach(() => {
    request.mockReset();
    mockedAxios.create.mockReset();
    mockedAxios.create.mockReturnValue({ request } as unknown as AxiosInstance);
    vi.stubEnv('YUQUE_TOKEN', 'test-token');
    stderrChunks = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(invalidFlags)(
    '$name exits 2 before making an HTTP request',
    async ({ args, message }) => {
      await expect(runCli(argv(...args))).resolves.toBe(2);
      expect(stderrChunks.join('')).toContain(message);
      expect(mockedAxios.create.mock.calls).toHaveLength(0);
      expect(request).not.toHaveBeenCalled();
    }
  );
});
