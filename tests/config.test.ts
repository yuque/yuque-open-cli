import { describe, expect, it } from 'vitest';
import { DEFAULT_HOST, normalizeHost, resolveHost, resolveToken } from '../src/config.js';

describe('resolveToken', () => {
  it('prefers the flag over env vars', () => {
    expect(resolveToken('flag-token', { YUQUE_TOKEN: 'env-token' })).toBe('flag-token');
  });

  it('falls back to YUQUE_TOKEN then YUQUE_PERSONAL_TOKEN', () => {
    expect(resolveToken(undefined, { YUQUE_TOKEN: 'a', YUQUE_PERSONAL_TOKEN: 'b' })).toBe('a');
    expect(resolveToken(undefined, { YUQUE_PERSONAL_TOKEN: 'b' })).toBe('b');
  });

  it('returns undefined when nothing is set', () => {
    expect(resolveToken(undefined, {})).toBeUndefined();
  });
});

describe('resolveHost / normalizeHost', () => {
  it('defaults to www.yuque.com', () => {
    expect(resolveHost(undefined, {})).toBe(DEFAULT_HOST);
  });

  it('prefers the flag over YUQUE_HOST', () => {
    expect(resolveHost('https://a.yuque.com', { YUQUE_HOST: 'https://b.yuque.com' })).toBe(
      'https://a.yuque.com'
    );
  });

  it('adds https:// to bare domains', () => {
    expect(normalizeHost('space.yuque.com')).toBe('https://space.yuque.com');
  });

  it('strips trailing slashes and an /api/v2 suffix', () => {
    expect(normalizeHost('https://space.yuque.com/')).toBe('https://space.yuque.com');
    expect(normalizeHost('https://space.yuque.com/api/v2')).toBe('https://space.yuque.com');
    expect(normalizeHost('https://space.yuque.com/api/v2/')).toBe('https://space.yuque.com');
  });

  it('keeps http:// for private deployments', () => {
    expect(normalizeHost('http://yuque.internal:8080/')).toBe('http://yuque.internal:8080');
  });
});
