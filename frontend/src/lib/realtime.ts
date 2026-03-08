import Echo from "laravel-echo";
import Pusher from "pusher-js";

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

export function startRealtimeBridge() {
  if (isStarted || typeof window === "undefined") return;

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
    enabledTransports: ["ws", "wss"],
  });

  realtimeEcho
    .channel("cspams-updates")
    .listen(".cspams.update", (payload: CspamsRealtimePayload) => {
      dispatchRealtimePayload(payload);
    });

  isStarted = true;
}

export function stopRealtimeBridge() {
  if (!realtimeEcho) return;
  realtimeEcho.disconnect();
  realtimeEcho = null;
  isStarted = false;
}
