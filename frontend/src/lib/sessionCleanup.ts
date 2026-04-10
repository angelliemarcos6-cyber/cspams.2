import type { SessionUser } from "@/types";

export const AUTH_TOKEN_STORAGE_KEY = "cspams.auth.token.v1";
export const AUTH_STATE_STORAGE_KEY = "cspams.auth.state.v1";
export const AUTH_LOGOUT_EVENT_STORAGE_KEY = "cspams.auth.logout.v1";
export const AUTH_LOGOUT_QUEUE_STORAGE_KEY = "cspams.auth.logout.queue.v1";

export interface StoredAuthState {
  user: SessionUser;
  authMode: "cookie" | "token";
  token: string | null;
  updatedAt: number;
}

export interface PendingLogoutRevoke {
  token: string;
  attempts: number;
  createdAt: number;
  nextRetryAt: number;
  lastError?: string | null;
}

const CLEARABLE_STORAGE_KEYS = [
  "cspams.monitor.filters.v1",
  "cspams.monitor.nav.v1",
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_STATE_STORAGE_KEY,
] as const;

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

export function readClientAuthToken(): string | null {
  if (!hasWindow()) {
    return null;
  }

  try {
    const storedState = readClientAuthState();
    const tokenFromState = storedState?.token?.trim() || "";
    if (tokenFromState) {
      return tokenFromState;
    }

    const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim() || "";
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function writeClientAuthToken(token: string | null): void {
  if (!hasWindow()) {
    return;
  }

  try {
    const normalized = typeof token === "string" ? token.trim() : "";
    if (normalized) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, normalized);
      return;
    }

    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage failures in restricted browser modes.
  }
}

export function readClientAuthState(): StoredAuthState | null {
  if (!hasWindow()) {
    return null;
  }

  try {
    const parsed = parseJson<StoredAuthState>(window.localStorage.getItem(AUTH_STATE_STORAGE_KEY));
    if (!parsed || !parsed.user || (parsed.authMode !== "cookie" && parsed.authMode !== "token")) {
      return null;
    }

    return {
      ...parsed,
      token: typeof parsed.token === "string" && parsed.token.trim().length > 0 ? parsed.token.trim() : null,
      updatedAt: Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeClientAuthState(
  state: { user: SessionUser; authMode: "cookie" | "token"; token?: string | null } | null,
): void {
  if (!hasWindow()) {
    return;
  }

  try {
    if (!state) {
      window.localStorage.removeItem(AUTH_STATE_STORAGE_KEY);
      writeClientAuthToken(null);
      return;
    }

    const nextState: StoredAuthState = {
      user: state.user,
      authMode: state.authMode,
      token: state.authMode === "token" ? (state.token?.trim() || null) : null,
      updatedAt: Date.now(),
    };

    window.localStorage.setItem(AUTH_STATE_STORAGE_KEY, JSON.stringify(nextState));
    writeClientAuthToken(nextState.token);
  } catch {
    // Ignore storage failures in restricted browser modes.
  }
}

export function broadcastLogoutEvent(reason: string = "logout"): void {
  if (!hasWindow()) {
    return;
  }

  try {
    window.localStorage.setItem(
      AUTH_LOGOUT_EVENT_STORAGE_KEY,
      JSON.stringify({
        reason,
        timestamp: Date.now(),
      }),
    );
  } catch {
    // Ignore storage failures in restricted browser modes.
  }
}

export function readPendingLogoutRevokes(): PendingLogoutRevoke[] {
  if (!hasWindow()) {
    return [];
  }

  try {
    const parsed = parseJson<PendingLogoutRevoke[]>(window.localStorage.getItem(AUTH_LOGOUT_QUEUE_STORAGE_KEY));
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is PendingLogoutRevoke => {
        const token = typeof item?.token === "string" ? item.token.trim() : "";
        return token.length > 0;
      })
      .map((item) => ({
        token: item.token.trim(),
        attempts: Number.isFinite(item.attempts) ? Math.max(0, Math.trunc(item.attempts)) : 0,
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        nextRetryAt: Number.isFinite(item.nextRetryAt) ? item.nextRetryAt : Date.now(),
        lastError: typeof item.lastError === "string" ? item.lastError : null,
      }));
  } catch {
    return [];
  }
}

export function writePendingLogoutRevokes(queue: PendingLogoutRevoke[]): void {
  if (!hasWindow()) {
    return;
  }

  try {
    if (queue.length === 0) {
      window.localStorage.removeItem(AUTH_LOGOUT_QUEUE_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(AUTH_LOGOUT_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore storage failures in restricted browser modes.
  }
}

export function enqueuePendingLogoutRevoke(token: string): PendingLogoutRevoke | null {
  if (!hasWindow()) {
    return null;
  }

  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return null;
  }

  const queue = readPendingLogoutRevokes().filter((item) => item.token !== normalizedToken);
  const queuedItem: PendingLogoutRevoke = {
    token: normalizedToken,
    attempts: 0,
    createdAt: Date.now(),
    nextRetryAt: Date.now(),
    lastError: null,
  };

  queue.push(queuedItem);
  writePendingLogoutRevokes(queue);

  return queuedItem;
}

export function updatePendingLogoutRevoke(item: PendingLogoutRevoke): void {
  if (!hasWindow()) {
    return;
  }

  const normalizedToken = item.token.trim();
  if (!normalizedToken) {
    return;
  }

  const queue = readPendingLogoutRevokes().filter((entry) => entry.token !== normalizedToken);
  queue.push({
    ...item,
    token: normalizedToken,
  });
  writePendingLogoutRevokes(queue);
}

export function removePendingLogoutRevoke(token: string): void {
  if (!hasWindow()) {
    return;
  }

  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return;
  }

  const nextQueue = readPendingLogoutRevokes().filter((item) => item.token !== normalizedToken);
  writePendingLogoutRevokes(nextQueue);
}

export function clearClientSessionArtifacts(): void {
  if (!hasWindow()) {
    return;
  }

  for (const key of CLEARABLE_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      // Ignore storage failures in restricted browser modes.
    }
  }

  try {
    const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`;
    window.history.replaceState(null, "", cleanUrl);
  } catch {
    // Ignore history API failures.
  }
}
