import { describe, expect, it } from 'vitest';
import { parseBookRef, bookBasePath } from '../../src/client/book-ref.js';
import { UsageError } from '../../src/errors.js';

describe('parseBookRef', () => {
  it('parses a numeric id', () => {
    expect(parseBookRef('123456')).toEqual({ kind: 'id', id: '123456' });
  });

  it('parses a namespace', () => {
    expect(parseBookRef('yuque/help')).toEqual({ kind: 'namespace', group: 'yuque', slug: 'help' });
  });

  it('rejects malformed references', () => {
    expect(() => parseBookRef('a/b/c')).toThrow(UsageError);
    expect(() => parseBookRef('/slug')).toThrow(UsageError);
    expect(() => parseBookRef('group/')).toThrow(UsageError);
  });
});

describe('bookBasePath', () => {
  it('builds id and namespace paths', () => {
    expect(bookBasePath(parseBookRef('42'))).toBe('/repos/42');
    expect(bookBasePath(parseBookRef('yuque/help'))).toBe('/repos/yuque/help');
  });

  it('escapes URL-unsafe characters', () => {
    expect(bookBasePath(parseBookRef('团队/知识 库'))).toBe(
      '/repos/%E5%9B%A2%E9%98%9F/%E7%9F%A5%E8%AF%86%20%E5%BA%93'
    );
  });
});
