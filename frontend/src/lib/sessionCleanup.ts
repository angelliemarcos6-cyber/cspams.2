export const CLIENT_SESSION_STORAGE_KEYS = [
  "cspams.monitor.filters.v1",
  "cspams.monitor.nav.v1",
  "cspams.auth.token.v1",
] as const;

export const AUTH_TOKEN_STORAGE_KEY = "cspams.auth.token.v1";

export function readClientAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const token = window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim() || "";
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function writeClientAuthToken(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (typeof token === "string" && token.trim().length > 0) {
      window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token.trim());
      return;
    }

    window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage failures in restricted browser modes.
  }
}

export function clearClientSessionArtifacts(): void {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of CLIENT_SESSION_STORAGE_KEYS) {
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
