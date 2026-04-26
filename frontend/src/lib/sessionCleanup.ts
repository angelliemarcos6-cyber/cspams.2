export const CLIENT_SESSION_STORAGE_KEYS = [
  "cspams.monitor.filters.v1",
  "cspams.monitor.nav.v1",
] as const;
const SCHOOL_HEAD_INDICATOR_AUTOSAVE_PREFIX = "cspams.schoolhead.indicator.autosave";

function removeStorageKeysByPrefix(storage: Storage, prefix: string): void {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(prefix)) {
      continue;
    }

    storage.removeItem(key);
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
    removeStorageKeysByPrefix(window.localStorage, SCHOOL_HEAD_INDICATOR_AUTOSAVE_PREFIX);
    removeStorageKeysByPrefix(window.sessionStorage, SCHOOL_HEAD_INDICATOR_AUTOSAVE_PREFIX);
  } catch {
    // Ignore storage failures in restricted browser modes.
  }

  try {
    const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`;
    window.history.replaceState(null, "", cleanUrl);
  } catch {
    // Ignore history API failures.
  }
}
