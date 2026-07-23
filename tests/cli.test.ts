import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { type AxiosInstance } from 'axios';
import { runCli } from '../src/cli.js';

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

describe('runCli', () => {
  it('returns 0 for --help', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await expect(runCli(argv('--help'))).resolves.toBe(0);
    } finally {
      write.mockRestore();
    }
  });

  it('returns 0 for --version', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await expect(runCli(argv('--version'))).resolves.toBe(0);
    } finally {
      write.mockRestore();
    }
  });

  it('returns 2 for an unknown command', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await expect(runCli(argv('definitely-not-a-command'))).resolves.toBe(2);
    } finally {
      write.mockRestore();
    }
  });

  it('returns 2 when invoked with no arguments', async () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await expect(runCli(argv())).resolves.toBe(2);
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
  });
});

describe('runCli exit code contract for API errors', () => {
  let stderrChunks: string[] = [];

  beforeEach(() => {
    request.mockReset();
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

  function stderrText(): string {
    return stderrChunks.join('');
  }

  function apiFailure(status: number, message: string) {
    const error = new Error(message) as Error & {
      isAxiosError: boolean;
      response: { status: number; data: { message: string }; headers: Record<string, string> };
    };
    error.isAxiosError = true;
    error.response = { status, data: { message }, headers: {} };
    return error;
  }

  it('maps a 401 API error to exit code 3 (auth error)', async () => {
    request.mockRejectedValue(apiFailure(401, 'token expired'));
    await expect(runCli(argv('user', 'info'))).resolves.toBe(3);
    expect(stderrText()).toContain('token expired');
  });

  it('maps a 403 API error to exit code 3 (auth error)', async () => {
    request.mockRejectedValue(apiFailure(403, 'forbidden'));
    await expect(runCli(argv('user', 'info'))).resolves.toBe(3);
    expect(stderrText()).toContain('forbidden');
  });

  it('maps a 500 API error to exit code 1 (generic API error)', async () => {
    request.mockRejectedValue(apiFailure(500, 'internal error'));
    await expect(runCli(argv('user', 'info'))).resolves.toBe(1);
    expect(stderrText()).toContain('internal error');
  });
});
