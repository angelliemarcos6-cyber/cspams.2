export type SharedSyncTrigger = "interval" | "focus" | "online" | "realtime";

export interface SharedSyncPayload {
  entity?: string;
  schoolId?: string | number;
  schoolCode?: string;
}

type SharedSyncListener = (trigger: SharedSyncTrigger, payload?: SharedSyncPayload) => void;

const DEFAULT_SYNC_INTERVAL_MS = 60_000;

let nextListenerId = 1;
const listeners = new Map<number, SharedSyncListener>();

let intervalHandle: number | null = null;
let focusHandler: (() => void) | null = null;
let onlineHandler: (() => void) | null = null;
let realtimeHandler: ((event: Event) => void) | null = null;

function notifyListeners(trigger: SharedSyncTrigger, payload?: SharedSyncPayload): void {
  for (const listener of listeners.values()) {
    try {
      listener(trigger, payload);
    } catch (err) {
      // Keep other subscribers alive even if one callback throws.
      console.error("[shared-sync-polling] listener error", err);
    }
  }
}

function startSharedPolling(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (intervalHandle !== null) {
    return;
  }

  intervalHandle = window.setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    notifyListeners("interval");
  }, DEFAULT_SYNC_INTERVAL_MS);

  focusHandler = () => {
    notifyListeners("focus");
  };
  onlineHandler = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    notifyListeners("online");
  };
  realtimeHandler = (event: Event) => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    const payload = (event as CustomEvent<SharedSyncPayload>).detail;
    notifyListeners("realtime", payload);
  };

  window.addEventListener("focus", focusHandler);
  window.addEventListener("online", onlineHandler);
  window.addEventListener("cspams:update", realtimeHandler);
}

function stopSharedPollingIfIdle(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (listeners.size > 0) {
    return;
  }

  if (intervalHandle !== null) {
    window.clearInterval(intervalHandle);
    intervalHandle = null;
  }

  if (focusHandler) {
    window.removeEventListener("focus", focusHandler);
    focusHandler = null;
  }
  if (onlineHandler) {
    window.removeEventListener("online", onlineHandler);
    onlineHandler = null;
  }
  if (realtimeHandler) {
    window.removeEventListener("cspams:update", realtimeHandler);
    realtimeHandler = null;
  }
}

export function subscribeSharedSyncPolling(listener: SharedSyncListener): () => void {
  const listenerId = nextListenerId++;
  listeners.set(listenerId, listener);
  startSharedPolling();

  return () => {
    listeners.delete(listenerId);
    stopSharedPollingIfIdle();
  };
}
