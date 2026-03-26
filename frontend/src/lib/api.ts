function defaultApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:8000";
  }

  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

function sanitizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function resolveApiBaseUrl(): string {
  const configured = String(import.meta.env.VITE_API_BASE_URL || "").trim();

  if (configured) {
    return sanitizeBaseUrl(configured);
  }

  if (import.meta.env.PROD) {
    throw new Error("Missing VITE_API_BASE_URL. Set it in your deployed frontend environment.");
  }

  return sanitizeBaseUrl(defaultApiBaseUrl());
}

const API_BASE_URL = resolveApiBaseUrl();
export const COOKIE_SESSION_TOKEN = "__cookie_session__";
let csrfBootstrapPromise: Promise<void> | null = null;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const CSRF_BOOTSTRAP_TIMEOUT_MS = 10_000;

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
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

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof (error as { name?: unknown }).name === "string" &&
    (error as { name: string }).name === "AbortError"
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;

  const timeoutId = (typeof timeoutMs === "number" && timeoutMs > 0)
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : null;

  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      if (timedOut) {
        throw new ApiError(
          "The request timed out. Check the server and your network connection.",
          0,
          null,
        );
      }

      throw error;
    }

    throw new ApiError(
      error instanceof Error ? error.message : "Unable to reach the server.",
      0,
      null,
    );
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    if (signal) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

export async function ensureCsrfCookie(forceRefresh = false): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  if (!forceRefresh && readXsrfToken()) {
    return;
  }

  if (!csrfBootstrapPromise) {
    csrfBootstrapPromise = fetchWithTimeout(
      `${API_BASE_URL}/sanctum/csrf-cookie`,
      {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      },
      CSRF_BOOTSTRAP_TIMEOUT_MS,
    )
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
  const { method = "GET", token, body, signal, timeoutMs, extraHeaders } = options;
  const mutating = isMutatingMethod(method);
  const useCookieSession = token === COOKIE_SESSION_TOKEN;
  const requestTimeoutMs =
    typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : DEFAULT_REQUEST_TIMEOUT_MS;

  if (mutating && useCookieSession) {
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
  if (mutating && useCookieSession) {
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

  const fetchRequest = () =>
    fetchWithTimeout(`${API_BASE_URL}${path}`, {
      method,
      credentials: useCookieSession ? "include" : "omit",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }, requestTimeoutMs, signal);

  let response = await fetchRequest();

  // Session-bound CSRF tokens can become stale after long idle periods.
  // Retry once with a fresh csrf-cookie before surfacing a 419 to the UI.
  if (mutating && response.status === 419) {
    await ensureCsrfCookie(true);
    response = await fetchRequest();
  }

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
  if (response.status === 304) {
    throw new ApiError(
      "Use apiRequestRaw() for conditional requests that may return 304 Not Modified.",
      304,
      null,
    );
  }
  return response.data as T;
}
