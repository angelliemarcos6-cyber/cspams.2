import Echo from "laravel-echo";
import Pusher from "pusher-js";
import { ensureCsrfCookie, getApiBaseUrl, readXsrfToken } from "@/lib/api";

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

interface ChannelAuthResponse {
  auth: string;
  channel_data?: string;
  shared_secret?: string;
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

function isChannelAuthResponse(payload: unknown): payload is ChannelAuthResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "auth" in payload &&
    typeof (payload as { auth: unknown }).auth === "string"
  );
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof (payload as { message: unknown }).message === "string"
  ) {
    return (payload as { message: string }).message;
  }

  return fallback;
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
    enabledTransports: ["ws", "wss"],
    authorizer: (channel) => ({
      authorize: (socketId, callback) => {
        ensureCsrfCookie()
          .then(async () => {
            const xsrfToken = readXsrfToken();
            const response = await fetch(`${getApiBaseUrl()}/api/broadcasting/auth`, {
              method: "POST",
              credentials: "include",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                ...(xsrfToken ? { "X-XSRF-TOKEN": xsrfToken } : {}),
              },
              body: JSON.stringify({
                socket_id: socketId,
                channel_name: channel.name,
              }),
            });

            const payload = await response.json().catch(() => null);

            if (!response.ok) {
              const message = extractErrorMessage(payload, "Realtime authorization failed.");
              callback(new Error(message), null);
              return;
            }

            if (!isChannelAuthResponse(payload)) {
              callback(new Error("Realtime authorization returned an invalid payload."), null);
              return;
            }

            callback(null, payload);
          })
          .catch((error: unknown) => {
            callback(
              error instanceof Error ? error : new Error("Realtime authorization failed."),
              null,
            );
          });
      },
    }),
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
