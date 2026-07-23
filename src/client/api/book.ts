import type { YuqueHttp } from '../http.js';
import { bookBasePath, type BookRef } from '../book-ref.js';
import type { ApiEnvelope, V2Book, V2BookDetail } from '../types.js';

/** The spec exposes list/create under both /users/:login and /groups/:login. */
export type BookOwner = 'user' | 'group';

function ownerBooksPath(owner: BookOwner, login: string): string {
  return `/${owner === 'group' ? 'groups' : 'users'}/${encodeURIComponent(login)}/repos`;
}

export interface ListBooksOptions {
  offset?: number;
  limit?: number;
  /** Spec enum: Book | Design. Omit for no server-side filter. */
  type?: string;
  /** e.g. `create_doc` — only repos where the token holds that ability. */
  filterByAbility?: string;
}

export async function listBooks(
  http: YuqueHttp,
  owner: BookOwner,
  login: string,
  options: ListBooksOptions = {}
): Promise<V2Book[]> {
  const params: Record<string, unknown> = {};
  if (options.offset !== undefined) params.offset = options.offset;
  if (options.limit !== undefined) params.limit = options.limit;
  if (options.type !== undefined) params.type = options.type;
  if (options.filterByAbility !== undefined) params.filterByAbility = options.filterByAbility;
  const res = await http.get<ApiEnvelope<V2Book[]>>(ownerBooksPath(owner, login), params);
  return res.data;
}

export async function getBook(http: YuqueHttp, ref: BookRef): Promise<V2BookDetail> {
  const res = await http.get<ApiEnvelope<V2BookDetail>>(bookBasePath(ref));
  return res.data;
}

export interface CreateBookBody {
  name: string;
  slug: string;
  description?: string;
  public?: number;
  enhancedPrivacy?: boolean;
}

export async function createBook(
  http: YuqueHttp,
  owner: BookOwner,
  login: string,
  body: CreateBookBody
): Promise<V2Book> {
  const res = await http.post<ApiEnvelope<V2Book>>(ownerBooksPath(owner, login), body);
  return res.data;
}

export interface UpdateBookBody {
  name?: string;
  slug?: string;
  description?: string;
  public?: number;
  toc?: string;
}

export async function updateBook(
  http: YuqueHttp,
  ref: BookRef,
  body: UpdateBookBody
): Promise<V2Book> {
  const res = await http.put<ApiEnvelope<V2Book>>(bookBasePath(ref), body);
  return res.data;
}

export async function deleteBook(http: YuqueHttp, ref: BookRef): Promise<V2Book> {
  const res = await http.delete<ApiEnvelope<V2Book>>(bookBasePath(ref));
  return res.data;
}
