import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { YuqueHttp } from '../../src/client/http.js';
import { YuqueError } from '../../src/errors.js';

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

function axiosFailure(status: number, message = 'boom', headers: Record<string, string> = {}) {
  const error = new Error(message) as Error & {
    isAxiosError: boolean;
    response: { status: number; data: { message: string }; headers: Record<string, string> };
  };
  error.isAxiosError = true;
  error.response = { status, data: { message }, headers };
  return error;
}

describe('YuqueHttp', () => {
  const request = vi.fn();
  const sleep = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    request.mockReset();
    sleep.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedAxios.create.mockReturnValue({ request } as any);
  });

  function makeHttp(maxRetries = 3) {
    return new YuqueHttp({
      token: 't',
      host: 'https://www.yuque.com',
      maxRetries,
      sleep,
    });
  }

  it('configures baseURL with /api/v2 and the auth header', () => {
    makeHttp();
    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://www.yuque.com/api/v2',
        headers: expect.objectContaining({ 'X-Auth-Token': 't' }),
      })
    );
  });

  it('returns response.data on success', async () => {
    request.mockResolvedValueOnce({ data: { data: { id: 1 } } });
    await expect(makeHttp().get('/user')).resolves.toEqual({ data: { id: 1 } });
  });

  it('retries 429 with backoff then succeeds', async () => {
    request
      .mockRejectedValueOnce(axiosFailure(429, 'rate limited'))
      .mockResolvedValueOnce({ data: { data: 'ok' } });
    await expect(makeHttp().get('/user')).resolves.toEqual({ data: 'ok' });
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('honors Retry-After seconds', async () => {
    request
      .mockRejectedValueOnce(axiosFailure(429, 'rate limited', { 'retry-after': '2' }))
      .mockResolvedValueOnce({ data: { data: 'ok' } });
    await makeHttp().get('/user');
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('gives up after maxRetries and throws a YuqueError with hint', async () => {
    request.mockRejectedValue(axiosFailure(429, 'rate limited'));
    const promise = makeHttp(2).get('/user');
    await expect(promise).rejects.toBeInstanceOf(YuqueError);
    await expect(makeHttp(0).get('/user')).rejects.toThrow(/rate limited/);
    expect(request).toHaveBeenCalledTimes(4); // 3 attempts (maxRetries=2) + 1 (maxRetries=0)
  });

  it('does not retry non-retryable statuses', async () => {
    request.mockRejectedValue(axiosFailure(404, 'not found'));
    await expect(makeHttp().get('/nope')).rejects.toMatchObject({ statusCode: 404 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('appends a status hint to API error messages', async () => {
    request.mockRejectedValue(axiosFailure(401, 'invalid token'));
    await expect(makeHttp().get('/user')).rejects.toThrow(/token invalid or expired/);
  });
});
