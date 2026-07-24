import { describe, expect, it, vi } from 'vitest';
import { createNote, getNote, listNotes, updateNote } from '../../src/client/api/note.js';
import { createResource, getResource, updateResource } from '../../src/client/api/resource.js';
import { fetchAllHasMorePages } from '../../src/client/paginate.js';
import type { YuqueHttp } from '../../src/client/http.js';

function httpWithSpies() {
  const get = vi.fn();
  const post = vi.fn();
  const put = vi.fn();
  return {
    http: { get, post, put } as unknown as YuqueHttp,
    get,
    post,
    put,
  };
}

describe('note API wrappers', () => {
  it('unwraps standard list/detail envelopes and compacts list params', async () => {
    const { http, get } = httpWithSpies();
    const page = { pin_notes: [], notes: [{ id: 1 }], has_more: false };
    get.mockResolvedValueOnce({ data: page }).mockResolvedValueOnce({ data: { id: 1 } });

    await expect(listNotes(http, { status: 0, page: 2, limit: undefined })).resolves.toEqual(page);
    expect(get).toHaveBeenNthCalledWith(1, '/notes', { status: 0, page: 2 });
    await expect(getNote(http, 1)).resolves.toEqual({ id: 1 });
    expect(get).toHaveBeenNthCalledWith(2, '/notes/1');
  });

  it('explicitly unwraps POST /notes from its non-standard success envelope', async () => {
    const { http, post } = httpWithSpies();
    const created = { id: 7, slug: 'n7', note_url: 'https://example.test/n7' };
    post.mockResolvedValueOnce({ success: true, data: created });

    await expect(createNote(http, { body: '# note' })).resolves.toEqual(created);
    expect(post).toHaveBeenCalledWith('/notes', { body: '# note' });
  });

  it('explicitly unwraps PUT /notes/{id} from its double data envelope', async () => {
    const { http, put } = httpWithSpies();
    const updated = { id: 7, status: 0, content: { source: '# updated' } };
    put.mockResolvedValueOnce({ data: { data: updated } });
    const payload = { source: '# updated', html: '<h1>updated</h1>', abstract: 'updated' };

    await expect(updateNote(http, 7, payload)).resolves.toEqual(updated);
    expect(put).toHaveBeenCalledWith('/notes/7', payload);
  });
});

describe('resource API wrappers', () => {
  it('uses the standard envelope and exact GET board query names', async () => {
    const { http, get } = httpWithSpies();
    const result = { doc_id: 9, title: 'Board' };
    get.mockResolvedValueOnce({ data: result });

    await expect(
      getResource(http, {
        resource_type: 'board',
        src: 'resource-id',
        doc_id: 9,
        url: undefined,
      })
    ).resolves.toEqual(result);
    expect(get).toHaveBeenCalledWith('/yfm/boards', {
      resource_type: 'board',
      src: 'resource-id',
      doc_id: 9,
    });
  });

  it('posts and puts compact wire payloads', async () => {
    const { http, post, put } = httpWithSpies();
    post.mockResolvedValueOnce({ data: { doc_id: 9 } });
    put.mockResolvedValueOnce({ data: { doc_id: 9, updated_at: 'now' } });

    await expect(
      createResource(http, {
        type: 'mindmap',
        dsl: 'root',
        doc_id: 9,
        insert_after_lake_id: undefined,
      })
    ).resolves.toEqual({ doc_id: 9 });
    expect(post).toHaveBeenCalledWith('/yfm/boards', {
      type: 'mindmap',
      dsl: 'root',
      doc_id: 9,
    });

    await expect(
      updateResource(http, {
        src: 'resource-id',
        url: 'https://example.test/doc',
        doc_id: undefined,
        dsl: { cells: [] },
      })
    ).resolves.toEqual({ doc_id: 9, updated_at: 'now' });
    expect(put).toHaveBeenCalledWith('/yfm/boards', {
      src: 'resource-id',
      url: 'https://example.test/doc',
      dsl: { cells: [] },
    });
  });
});

describe('has_more pagination', () => {
  it('increments page numbers until has_more is false', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1], has_more: true })
      .mockResolvedValueOnce({ items: [2], has_more: false });

    await expect(fetchAllHasMorePages(fetchPage, 3)).resolves.toEqual([
      { items: [1], has_more: true },
      { items: [2], has_more: false },
    ]);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 3);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 4);
  });
});
