import axios, { AxiosError, AxiosInstance } from 'axios';
import { YuqueError, statusHint } from '../errors.js';

export interface YuqueHttpOptions {
  token: string;
  /** Site root, e.g. https://www.yuque.com — /api/v2 is appended here. */
  host: string;
  timeoutMs?: number;
  /** Max retries for 429/5xx/network failures (default 3). */
  maxRetries?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestOptions {
  params?: Record<string, unknown>;
  data?: unknown;
}

type Method = 'get' | 'post' | 'put' | 'delete';

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class YuqueHttp {
  private readonly axios: AxiosInstance;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: YuqueHttpOptions) {
    this.maxRetries = options.maxRetries ?? 3;
    this.sleep = options.sleep ?? defaultSleep;
    this.axios = axios.create({
      baseURL: `${options.host}/api/v2`,
      timeout: options.timeoutMs ?? 30000,
      headers: {
        'X-Auth-Token': options.token,
        'Content-Type': 'application/json',
        'User-Agent': '@yuque/cli',
      },
    });
  }

  async request<T>(method: Method, url: string, options: RequestOptions = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await this.axios.request<T>({
          method,
          url,
          params: options.params,
          data: options.data,
        });
        return response.data;
      } catch (error) {
        if (attempt < this.maxRetries && this.isRetryable(error)) {
          await this.sleep(this.retryDelayMs(error, attempt));
          continue;
        }
        throw this.normalizeError(error);
      }
    }
  }

  get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('get', url, { params });
  }

  post<T>(url: string, data?: unknown): Promise<T> {
    return this.request<T>('post', url, { data });
  }

  put<T>(url: string, data?: unknown): Promise<T> {
    return this.request<T>('put', url, { data });
  }

  delete<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('delete', url, { params });
  }

  private isRetryable(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    if (error.response) return RETRYABLE_STATUS.has(error.response.status);
    // Network-level failure (no response): connection reset, DNS, timeout.
    return error.code !== 'ERR_CANCELED';
  }

  private retryDelayMs(error: unknown, attempt: number): number {
    if (axios.isAxiosError(error)) {
      const retryAfter = Number(error.response?.headers?.['retry-after']);
      if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 10000);
    }
    return Math.min(500 * 2 ** attempt, 4000);
  }

  private normalizeError(error: unknown): YuqueError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ message?: string }>;
      const status = axiosError.response?.status;
      const apiMessage = axiosError.response?.data?.message || axiosError.message;
      const hint = statusHint(status);
      return new YuqueError(hint ? `${apiMessage} (${hint})` : apiMessage, status, error);
    }
    return new YuqueError(error instanceof Error ? error.message : String(error), undefined, error);
  }
}
