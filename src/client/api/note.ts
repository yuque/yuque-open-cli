import type { YuqueHttp } from '../http.js';
import type { ApiEnvelope, V2Note, V2NoteCreateResult, V2NoteListResult } from '../types.js';

export interface NoteListParams {
  status?: number;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export interface NoteCreatePayload {
  body: string;
}

export interface NoteUpdatePayload {
  source: string;
  html: string;
  abstract: string;
  status?: number;
}

interface NoteCreateEnvelope {
  success: boolean;
  data: V2NoteCreateResult;
  [key: string]: unknown;
}

/** Drop undefined option values so omitted flags never reach the query string. */
function compact(params: NoteListParams): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));
}

export async function listNotes(
  http: YuqueHttp,
  params: NoteListParams = {}
): Promise<V2NoteListResult> {
  const res = await http.get<ApiEnvelope<V2NoteListResult>>('/notes', compact(params));
  return res.data;
}

export async function getNote(http: YuqueHttp, id: number): Promise<V2Note> {
  const res = await http.get<ApiEnvelope<V2Note>>(`/notes/${id}`);
  return res.data;
}

export async function createNote(
  http: YuqueHttp,
  payload: NoteCreatePayload
): Promise<V2NoteCreateResult> {
  // POST /notes uses `{ success, data }`, not the standard API envelope.
  const res = await http.post<NoteCreateEnvelope>('/notes', payload);
  return res.data;
}

export async function updateNote(
  http: YuqueHttp,
  id: number,
  payload: NoteUpdatePayload
): Promise<V2Note> {
  // PUT /notes/:id is uniquely double-wrapped: `{ data: { data: <note> } }`.
  const res = await http.put<ApiEnvelope<ApiEnvelope<V2Note>>>(`/notes/${id}`, payload);
  return res.data.data;
}
