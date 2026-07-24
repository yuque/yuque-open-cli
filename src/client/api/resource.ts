import type { YuqueHttp } from '../http.js';
import type { ApiEnvelope, V2BoardDsl, V2BoardType, V2ResourceResult } from '../types.js';

export interface ResourceLocator {
  doc_id?: number;
  url?: string;
}

export interface ResourceGetParams extends ResourceLocator {
  resource_type: 'board';
  src: string;
  [key: string]: unknown;
}

export interface ResourceCreatePayload extends ResourceLocator {
  type: V2BoardType;
  dsl: string;
  insert_after_lake_id?: string;
}

export interface ResourceUpdatePayload extends ResourceLocator {
  src: string;
  text?: string;
  dsl?: V2BoardDsl;
}

function compact<T extends object>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export async function getResource(
  http: YuqueHttp,
  params: ResourceGetParams
): Promise<V2ResourceResult> {
  const res = await http.get<ApiEnvelope<V2ResourceResult>>('/yfm/boards', compact(params));
  return res.data;
}

export async function createResource(
  http: YuqueHttp,
  payload: ResourceCreatePayload
): Promise<V2ResourceResult> {
  const res = await http.post<ApiEnvelope<V2ResourceResult>>('/yfm/boards', compact(payload));
  return res.data;
}

export async function updateResource(
  http: YuqueHttp,
  payload: ResourceUpdatePayload
): Promise<V2ResourceResult> {
  const res = await http.put<ApiEnvelope<V2ResourceResult>>('/yfm/boards', compact(payload));
  return res.data;
}
