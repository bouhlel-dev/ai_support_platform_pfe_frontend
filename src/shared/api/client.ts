import { getClientConfigRaw } from '@/shared/config/clientConfig';

const BASE_URL =
  getClientConfigRaw('VITE_API_BASE_URL') ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8000/api/v1';

const ACCESS_TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const AUTH_CHANGED_EVENT = 'app:auth-changed';
const SESSION_EXPIRED_EVENT = 'app:session-expired';
const NETWORK_RETRY_ATTEMPTS = 2;
const NETWORK_RETRY_DELAY_MS = 250;

let refreshRequest: Promise<string | null> | null = null;

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  emitAuthChanged();
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken?: string | null) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
  emitAuthChanged();
}

export function clearToken() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  emitAuthChanged();
}

export function onAuthChanged(listener: () => void): () => void {
  window.addEventListener(AUTH_CHANGED_EVENT, listener);
  return () => window.removeEventListener(AUTH_CHANGED_EVENT, listener);
}

function emitAuthChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

function emitSessionExpired() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

export function onSessionExpired(listener: () => void): () => void {
  window.addEventListener(SESSION_EXPIRED_EVENT, listener);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
}

function shouldRefresh(path: string, token: string | null): boolean {
  if (!token) return false;
  if (path.startsWith('/auth/login')) return false;
  if (path.startsWith('/auth/register')) return false;
  if (path.startsWith('/auth/refresh')) return false;
  return true;
}

function isLikelyTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === 'AbortError') {
    return false;
  }
  const msg = error.message.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('connection reset')
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function fetchWithTransientRetry(
  url: string,
  init: RequestInit,
  attempts = NETWORK_RETRY_ATTEMPTS,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (!isLikelyTransientNetworkError(error) || attempt === attempts - 1) {
        throw error;
      }
      await sleep(NETWORK_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Network request failed');
}

function toNetworkApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError(0, 'Request was aborted.', { original: error.message });
  }
  const detail = error instanceof Error ? error.message : 'Network request failed';
  return new ApiError(0, 'Unable to reach API service. Please retry in a moment.', {
    detail,
  });
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearToken();
    return null;
  }

  if (refreshRequest) {
    return refreshRequest;
  }

  refreshRequest = (async () => {
    let res: Response;
    try {
      res = await fetchWithTransientRetry(
        `${BASE_URL}/auth/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        },
        1,
      );
    } catch {
      clearToken();
      return null;
    }

    if (!res.ok) {
      clearToken();
      return null;
    }

    const data = await res.json();
    const access = typeof data?.access_token === 'string' ? data.access_token : null;
    const refresh = typeof data?.refresh_token === 'string' ? data.refresh_token : refreshToken;
    if (!access) {
      clearToken();
      return null;
    }

    setTokens(access, refresh);
    return access;
  })().finally(() => {
    refreshRequest = null;
  });

  return refreshRequest;
}

type ApiRequestOptions = RequestInit & { params?: Record<string, string> };
export type ApiStreamEvent = { event: string; data: unknown };

function buildApiUrl(path: string, params?: Record<string, string>): string {
  let url = `${BASE_URL}${path}`;
  if (params) {
    // Avoid sending literal "undefined" in query params.
    // URLSearchParams({ a: undefined }) becomes `a=undefined`, which breaks backend validation.
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      sp.set(k, String(v));
    });
    const qs = sp.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

async function fetchApiResponse(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const { params, ...fetchOpts } = options;
  const url = buildApiUrl(path, params);
  const token = getToken();
  const headers: Record<string, string> = {
    ...(fetchOpts.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(fetchOpts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetchWithTransientRetry(url, { ...fetchOpts, headers });
  } catch (error) {
    throw toNetworkApiError(error);
  }

  if (res.status === 401 && shouldRefresh(path, token)) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      const retryHeaders: Record<string, string> = {
        ...headers,
        Authorization: `Bearer ${newAccessToken}`,
      };
      try {
        res = await fetchWithTransientRetry(url, { ...fetchOpts, headers: retryHeaders });
      } catch (error) {
        throw toNetworkApiError(error);
      }
    } else {
      // Refresh failed — session is truly expired
      emitSessionExpired();
    }
  }

  return res;
}

export async function apiClient<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const res = await fetchApiResponse(path, options);

  if (!res.ok) {
    let data: unknown;
    try { data = await res.json(); } catch { data = null; }
    const msg = (data as any)?.detail || (data as any)?.message || res.statusText;
    throw new ApiError(res.status, msg, data);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function apiBlobClient(
  path: string,
  options: ApiRequestOptions = {}
): Promise<Blob> {
  const res = await fetchApiResponse(path, options);

  if (!res.ok) {
    let data: unknown;
    try { data = await res.json(); } catch { data = null; }
    const msg = (data as any)?.detail || (data as any)?.message || res.statusText;
    throw new ApiError(res.status, msg, data);
  }

  return res.blob();
}

function toApiError(status: number, statusText: string, data: unknown): ApiError {
  const detail =
    (data as any)?.detail ||
    (data as any)?.message ||
    statusText ||
    `Request failed with status ${status}`;
  return new ApiError(status, detail, data);
}

function parseSseChunk(chunk: string): ApiStreamEvent | null {
  const lines = chunk
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (!lines.length) {
    return null;
  }

  let event = 'message';
  const dataLines: string[] = [];

  lines.forEach((line) => {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      return;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  });

  if (!dataLines.length) {
    return null;
  }

  const rawData = dataLines.join('\n');
  try {
    return {
      event,
      data: JSON.parse(rawData),
    };
  } catch {
    return {
      event,
      data: rawData,
    };
  }
}

function extractNextSseChunk(buffer: string): { chunk: string; rest: string } | null {
  const match = buffer.match(/\r?\n\r?\n/);
  if (!match || match.index === undefined) {
    return null;
  }

  return {
    chunk: buffer.slice(0, match.index),
    rest: buffer.slice(match.index + match[0].length),
  };
}

export async function apiStreamClient(
  path: string,
  onEvent: (event: ApiStreamEvent) => void | Promise<void>,
  options: ApiRequestOptions = {},
): Promise<void> {
  const res = await fetchApiResponse(path, options);

  if (!res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    throw toApiError(res.status, res.statusText, data);
  }

  if (!res.body) {
    throw new ApiError(res.status, 'Streaming response body is unavailable');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let nextChunk = extractNextSseChunk(buffer);
    while (nextChunk) {
      const { chunk, rest } = nextChunk;
      buffer = rest;

      const event = parseSseChunk(chunk);
      if (event) {
        await onEvent(event);
      }

      nextChunk = extractNextSseChunk(buffer);
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    const trailingEvent = parseSseChunk(buffer);
    if (trailingEvent) {
      await onEvent(trailingEvent);
    }
  }
}

export function normalizeError(err: unknown): string {
  if (err instanceof ApiError) {
    const d: any = err.data;
    if (d) {
      if (typeof d.detail === "string") return d.detail;
      if (Array.isArray(d.detail)) return d.detail.join(", ");
      if (typeof d.message === "string") return d.message;
      if (d.detail && typeof d.detail === "object" && typeof d.detail.message === "string") return d.detail.message;
      if (d.errors && Array.isArray(d.errors)) return d.errors.join(", ");
    }
    return err.message || `Request failed with status ${err.status}`;
  }
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred';
}
