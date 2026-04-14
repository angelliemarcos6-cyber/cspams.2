export const CLIENT_SESSION_STORAGE_KEYS = [
  "cspams.monitor.filters.v1",
  "cspams.monitor.nav.v1",
] as const;

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
