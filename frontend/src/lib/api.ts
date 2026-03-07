const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

function sanitizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

const API_BASE_URL = sanitizeBaseUrl(import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL);

interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string;
  body?: unknown;
  signal?: AbortSignal;
  extraHeaders?: Record<string, string>;
}

export interface ApiRawResponse<T> {
  status: number;
  data: T | null;
  headers: Headers;
}

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export async function apiRequestRaw<T>(path: string, options: ApiRequestOptions = {}): Promise<ApiRawResponse<T>> {
  const { method = "GET", token, body, signal, extraHeaders } = options;

  const headers = new Headers();
  headers.set("Accept", "application/json");
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers.set(key, value);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  const rawText = await response.text();
  let payload: unknown = null;
  if (rawText.length > 0) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = rawText;
    }
  }

  if (!response.ok) {
    if (response.status === 304) {
      return {
        status: response.status,
        data: null,
        headers: response.headers,
      };
    }

    const message =
      (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : null) ?? `Request failed with status ${response.status}.`;
    throw new ApiError(message, response.status, payload);
  }

  return {
    status: response.status,
    data: payload as T,
    headers: response.headers,
  };
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await apiRequestRaw<T>(path, options);
  return response.data as T;
}
