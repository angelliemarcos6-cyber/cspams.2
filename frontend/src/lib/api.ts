const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

function sanitizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

const API_BASE_URL = sanitizeBaseUrl(import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL);
export const COOKIE_SESSION_TOKEN = "__cookie_session__";
let csrfBootstrapPromise: Promise<void> | null = null;

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

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

export type ApiValidationErrors = Record<string, string[]>;

function parseValidationErrors(payload: unknown): ApiValidationErrors | null {
  if (!payload || typeof payload !== "object" || !("errors" in payload)) {
    return null;
  }

  const rawErrors = (payload as { errors?: unknown }).errors;
  if (!rawErrors || typeof rawErrors !== "object") {
    return null;
  }

  const parsed: ApiValidationErrors = {};
  for (const [field, rawValue] of Object.entries(rawErrors as Record<string, unknown>)) {
    if (Array.isArray(rawValue)) {
      const messages = rawValue.filter((entry): entry is string => typeof entry === "string");
      if (messages.length > 0) {
        parsed[field] = messages;
      }
      continue;
    }

    if (typeof rawValue === "string") {
      parsed[field] = [rawValue];
    }
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
}

function firstValidationMessage(errors: ApiValidationErrors | null): string | null {
  if (!errors) return null;

  for (const messages of Object.values(errors)) {
    if (messages.length > 0) {
      return messages[0] ?? null;
    }
  }

  return null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;
  readonly validationErrors: ApiValidationErrors | null;

  constructor(message: string, status: number, payload: unknown, validationErrors: ApiValidationErrors | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.validationErrors = validationErrors;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const escapedName = name.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  if (!match || match.length < 2) {
    return null;
  }

  return match[1] ?? null;
}

export function readXsrfToken(): string | null {
  const encoded = readCookie("XSRF-TOKEN");
  if (!encoded) {
    return null;
  }

  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function isMutatingMethod(method: string): boolean {
  const normalized = method.toUpperCase();
  return normalized === "POST" || normalized === "PUT" || normalized === "PATCH" || normalized === "DELETE";
}

export async function ensureCsrfCookie(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  if (readXsrfToken()) {
    return;
  }

  if (!csrfBootstrapPromise) {
    csrfBootstrapPromise = fetch(`${API_BASE_URL}/sanctum/csrf-cookie`, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to initialize CSRF protection (status ${response.status}).`);
        }
      })
      .finally(() => {
        csrfBootstrapPromise = null;
      });
  }

  await csrfBootstrapPromise;
}

export async function apiRequestRaw<T>(path: string, options: ApiRequestOptions = {}): Promise<ApiRawResponse<T>> {
  const { method = "GET", token, body, signal, extraHeaders } = options;
  const mutating = isMutatingMethod(method);

  if (mutating) {
    await ensureCsrfCookie();
  }

  const headers = new Headers();
  headers.set("Accept", "application/json");
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (token && token !== COOKIE_SESSION_TOKEN) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (mutating) {
    const xsrfToken = readXsrfToken();
    if (xsrfToken) {
      headers.set("X-XSRF-TOKEN", xsrfToken);
    }
  }
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers.set(key, value);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: "include",
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

    const baseMessage =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : null;
    const validationErrors = parseValidationErrors(payload);
    const firstError = firstValidationMessage(validationErrors);

    let message = baseMessage ?? `Request failed with status ${response.status}.`;
    if (firstError) {
      const isGenericValidationMessage =
        !baseMessage || baseMessage.toLowerCase() === "the given data was invalid.";
      message = isGenericValidationMessage ? firstError : `${message} ${firstError}`;
    }

    throw new ApiError(message, response.status, payload, validationErrors);
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
