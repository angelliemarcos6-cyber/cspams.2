import { useEffect, useMemo, useRef, useState } from "react";
import { Laptop, LoaderCircle, Shield, Smartphone, Trash2 } from "lucide-react";
import { useAuth } from "@/context/Auth";
import type { ActiveSessionDevice } from "@/types";

function formatRelativeTime(value: string | null): string {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

function sessionSubtitle(session: ActiveSessionDevice): string {
  const parts: string[] = [];

  if (session.ipAddress) {
    parts.push(session.ipAddress);
  }

  if (session.userAgent) {
    parts.push(session.userAgent);
  }

  return parts.join(" | ");
}

function sessionIcon(session: ActiveSessionDevice) {
  if (session.sessionType === "api_token") {
    return <Smartphone className="h-3.5 w-3.5" />;
  }

  return <Laptop className="h-3.5 w-3.5" />;
}

export function ActiveSessionsCenter() {
  const { listActiveSessions, revokeSessionDevice, revokeOtherSessions } = useAuth();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<ActiveSessionDevice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isRevokingOthers, setIsRevokingOthers] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");

  const refreshSessions = async () => {
    setIsLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const payload = await listActiveSessions();
      setSessions(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load active sessions.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const visibleSessions = useMemo(() => sessions.slice(0, 12), [sessions]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      void refreshSessions();
    }
  };

  const handleRevokeDevice = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    setError("");
    setSuccessMessage("");

    try {
      await revokeSessionDevice(sessionId);
      setSuccessMessage("Session revoked.");
      await refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke session.");
    } finally {
      setRevokingSessionId(null);
    }
  };

  const handleRevokeOthers = async () => {
    setIsRevokingOthers(true);
    setError("");
    setSuccessMessage("");

    try {
      const summary = await revokeOtherSessions();
      setSuccessMessage(
        `Revoked ${summary.revokedTokenCount} token(s) and ${summary.revokedWebSessionCount} web session(s).`,
      );
      await refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke other sessions.");
    } finally {
      setIsRevokingOthers(false);
    }
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-white transition hover:bg-white/14"
        aria-label="Devices"
        title="Devices"
      >
        <Shield className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-[61] w-[24rem] overflow-hidden rounded-sm border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Active Sessions</p>
            <button
              type="button"
              onClick={() => void handleRevokeOthers()}
              disabled={isRevokingOthers}
              className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRevokingOthers ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Revoke Others
            </button>
          </div>

          {successMessage ? (
            <p className="border-b border-primary-100 bg-primary-50 px-3 py-2 text-[11px] font-semibold text-primary-700">
              {successMessage}
            </p>
          ) : null}

          {error ? (
            <p className="border-b border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">{error}</p>
          ) : null}

          <div className="max-h-96 overflow-y-auto">
            {isLoading && visibleSessions.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Loading active sessions...
              </div>
            ) : visibleSessions.length === 0 ? (
              <p className="px-3 py-4 text-xs text-slate-500">No active sessions found.</p>
            ) : (
              visibleSessions.map((session) => (
                <article
                  key={session.id}
                  className={`border-b border-slate-100 px-3 py-2 last:border-b-0 ${
                    session.isCurrent ? "bg-primary-50/30" : "bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 text-xs font-semibold text-slate-900">
                        {sessionIcon(session)}
                        {session.deviceLabel}
                        {session.isCurrent ? (
                          <span className="rounded-sm border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">
                            Current
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600">{sessionSubtitle(session) || "No device metadata"}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Last active: {formatRelativeTime(session.lastActiveAt)}
                        {session.expiresAt ? ` | Expires ${formatRelativeTime(session.expiresAt)}` : ""}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleRevokeDevice(session.id)}
                      disabled={session.isCurrent || revokingSessionId === session.id}
                      className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {revokingSessionId === session.id ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Revoke
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
