import Echo from "laravel-echo";
import Pusher from "pusher-js";
import { getApiBaseUrl } from "@/lib/api";

declare global {
  interface Window {
    Pusher: typeof Pusher;
  }
}

export interface CspamsRealtimePayload {
  entity?: string;
  eventType?: string;
  formType?: string;
  submissionId?: string;
  schoolId?: string;
  status?: string;
  notes?: string | null;
  timestamp?: string;
  [key: string]: unknown;
}

let realtimeEcho: Echo<"reverb"> | null = null;
let isStarted = false;
let activeToken = "";

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function dispatchRealtimePayload(payload: CspamsRealtimePayload) {
  window.dispatchEvent(new CustomEvent<CspamsRealtimePayload>("cspams:update", { detail: payload }));
}

export function startRealtimeBridge(token: string) {
  if (typeof window === "undefined") return;

  const normalizedToken = token.trim();
  if (!normalizedToken) {
    stopRealtimeBridge();
    return;
  }

  if (isStarted && activeToken === normalizedToken) {
    return;
  }

  if (isStarted) {
    stopRealtimeBridge();
  }

  const appKey =
    import.meta.env.VITE_REVERB_APP_KEY ||
    import.meta.env.VITE_PUSHER_APP_KEY ||
    "";

  if (!appKey) return;

  const wsHost = import.meta.env.VITE_REVERB_HOST || window.location.hostname;
  const wsPort = numberFromEnv(import.meta.env.VITE_REVERB_PORT, 8080);
  const wssPort = numberFromEnv(import.meta.env.VITE_REVERB_PORT, 443);
  const scheme = (import.meta.env.VITE_REVERB_SCHEME || "http").toLowerCase();
  const forceTLS = boolFromEnv(import.meta.env.VITE_REVERB_TLS, scheme === "https");

  window.Pusher = Pusher;

  realtimeEcho = new Echo<"reverb">({
    broadcaster: "reverb",
    key: appKey,
    wsHost,
    wsPort,
    wssPort,
    forceTLS,
    authEndpoint: `${getApiBaseUrl()}/api/broadcasting/auth`,
    auth: {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${normalizedToken}`,
      },
    },
    enabledTransports: ["ws", "wss"],
  });

  realtimeEcho
    .private("cspams-updates")
    .listen(".cspams.update", (payload: CspamsRealtimePayload) => {
      dispatchRealtimePayload(payload);
    });

  isStarted = true;
  activeToken = normalizedToken;
}

export function stopRealtimeBridge() {
  if (realtimeEcho) {
    realtimeEcho.disconnect();
  }
  realtimeEcho = null;
  isStarted = false;
  activeToken = "";
}
