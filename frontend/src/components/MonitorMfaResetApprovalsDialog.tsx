import { useEffect, useState } from "react";
import { ClipboardList, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/context/Auth";
import { apiRequest, isApiError } from "@/lib/api";

interface MonitorMfaResetRequester {
  id: number | null;
  name: string | null;
  email: string | null;
}

interface MonitorMfaResetTicket {
  id: number;
  status: string;
  reason: string | null;
  requestedAt: string | null;
  expiresAt: string | null;
  requester: MonitorMfaResetRequester;
}

interface MonitorMfaResetRequestsResponse {
  data: MonitorMfaResetTicket[];
}

interface ApproveMonitorMfaResetResponse {
  status: string;
  requestId: number;
  approvalToken: string | null;
  approvalTokenExpiresAt: string;
  delivery?: string;
  deliveryMessage?: string;
  message?: string;
}

interface RecentApproval {
  requestId: number;
  requesterEmail: string;
  approvalToken: string | null;
  expiresAt: string;
  deliveryMessage: string | null;
  approvedAt: number;
}

interface MonitorMfaResetApprovalsDialogProps {
  open: boolean;
  isAuthenticated: boolean;
  onClose: () => void;
}

export function MonitorMfaResetApprovalsDialog({
  open,
  isAuthenticated,
  onClose,
}: MonitorMfaResetApprovalsDialogProps) {
  const { apiToken } = useAuth();
  const [items, setItems] = useState<MonitorMfaResetTicket[]>([]);
  const [recentApprovals, setRecentApprovals] = useState<RecentApproval[]>([]);
  const [notesById, setNotesById] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const canCallApi = isAuthenticated;

  const loadRequests = async () => {
    if (!canCallApi) {
      setError("You are signed out. Please sign in again.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const payload = await apiRequest<MonitorMfaResetRequestsResponse>("/api/auth/mfa/reset/requests", {
        token: apiToken,
      });
      setItems(Array.isArray(payload.data) ? payload.data : []);
    } catch (err) {
      if (isApiError(err)) {
        setError(err.message);
      } else {
        setError("Unable to load MFA reset requests. Check your network and try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (ticket: MonitorMfaResetTicket) => {
    if (!canCallApi) {
      setError("You are signed out. Please sign in again.");
      return;
    }

    setApprovingId(ticket.id);
    setError("");

    try {
      const payload = await apiRequest<ApproveMonitorMfaResetResponse>(
        `/api/auth/mfa/reset/requests/${encodeURIComponent(String(ticket.id))}/approve`,
        {
          method: "POST",
          token: apiToken,
          body: {
            notes: notesById[ticket.id]?.trim() || undefined,
          },
        },
      );

      const requesterEmail = ticket.requester.email ?? "Unknown requester";
      const approvalToken = typeof payload.approvalToken === "string" ? payload.approvalToken : null;
      setRecentApprovals((current) => [
        {
          requestId: Number(payload.requestId ?? ticket.id),
          requesterEmail,
          approvalToken,
          expiresAt: payload.approvalTokenExpiresAt,
          deliveryMessage: typeof payload.deliveryMessage === "string" ? payload.deliveryMessage : null,
          approvedAt: Date.now(),
        },
        ...current,
      ].slice(0, 6));

      setItems((current) => current.filter((item) => item.id !== ticket.id));
      setNotesById((current) => {
        const next = { ...current };
        delete next[ticket.id];
        return next;
      });
    } catch (err) {
      if (isApiError(err)) {
        setError(err.message);
      } else {
        setError("Unable to approve the request. Check your network and try again.");
      }
    } finally {
      setApprovingId(null);
    }
  };

  const copyToken = async (approvalToken: string | null) => {
    if (typeof navigator === "undefined" || !approvalToken) return;
    try {
      await navigator.clipboard.writeText(approvalToken);
      setCopiedToken(approvalToken);
      window.setTimeout(() => setCopiedToken(null), 1500);
    } catch {
      setCopiedToken(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadRequests();
  }, [apiToken, open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const now = Date.now();

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        className="fixed inset-0 z-[96] bg-slate-900/40"
        aria-label="Close MFA reset approvals dialog"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="MFA reset approvals"
        className="fixed z-[97] inset-x-4 bottom-4 max-h-[84vh] w-[calc(100vw-2rem)] overflow-y-auto rounded-sm border border-slate-200 bg-white p-4 shadow-2xl animate-fade-slide sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-28 sm:w-[min(54rem,calc(100vw-2rem))] sm:-translate-x-1/2"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary-700">
              <ShieldCheck className="h-4 w-4" />
              Security
            </p>
            <h2 className="mt-1 text-base font-extrabold text-slate-900">MFA Reset Requests</h2>
            <p className="mt-1 text-xs text-slate-600">
              Approve monitor MFA reset requests and share approval tokens securely when needed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadRequests()}
              className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
              aria-label="Close"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
            {error}
          </p>
        )}

        {recentApprovals.length > 0 && (
          <section className="mt-4 rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Recently approved</h3>
            <div className="mt-2 space-y-2">
              {recentApprovals.map((item) => {
                const isFresh = now - item.approvedAt < 60_000;
                return (
                  <div
                    key={`${item.requestId}-${item.approvalToken ?? "email"}`}
                    className="rounded-sm border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900">
                          {item.requesterEmail} • Request #{item.requestId}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Token expires: {new Date(item.expiresAt).toLocaleString()}
                          {isFresh ? " • just approved" : ""}
                        </p>
                        {item.deliveryMessage && (
                          <p className="mt-1 text-xs font-semibold text-slate-700">{item.deliveryMessage}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {item.approvalToken ? (
                          <>
                            <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-800">
                              {item.approvalToken}
                            </div>
                            <button
                              type="button"
                              onClick={() => void copyToken(item.approvalToken)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              <ClipboardList className="h-3.5 w-3.5 text-primary-700" />
                              {copiedToken === item.approvalToken ? "Copied" : "Copy"}
                            </button>
                          </>
                        ) : (
                          <p className="text-xs font-semibold text-slate-600">Approval token sent via email.</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-4">
          {isLoading ? (
            <p className="text-xs text-slate-600">Loading requests...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-slate-600">No pending MFA reset requests.</p>
          ) : (
            <div className="space-y-2">
              {items.map((ticket) => {
                const requesterLabel = ticket.requester.name || ticket.requester.email || "Unknown requester";
                return (
                  <div
                    key={ticket.id}
                    className="rounded-sm border border-slate-200 bg-white px-3 py-3"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">
                          {requesterLabel}
                        </p>
                        {ticket.requester.email && (
                          <p className="mt-0.5 text-xs text-slate-600">{ticket.requester.email}</p>
                        )}
                        <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                          <p>Requested: {ticket.requestedAt ? new Date(ticket.requestedAt).toLocaleString() : "—"}</p>
                          <p>Expires: {ticket.expiresAt ? new Date(ticket.expiresAt).toLocaleString() : "—"}</p>
                        </div>
                        {ticket.reason && (
                          <p className="mt-2 text-xs text-slate-700">
                            <span className="font-semibold text-slate-900">Reason:</span> {ticket.reason}
                          </p>
                        )}
                      </div>
                      <div className="flex w-full flex-col gap-2 md:w-72">
                        <label className="text-xs font-semibold text-slate-700">
                          Notes (optional)
                          <textarea
                            value={notesById[ticket.id] ?? ""}
                            onChange={(event) =>
                              setNotesById((current) => ({
                                ...current,
                                [ticket.id]: event.target.value,
                              }))
                            }
                            rows={2}
                            placeholder="Optional notes for audit trail."
                            className="mt-1 w-full resize-none rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={approvingId === ticket.id}
                          onClick={() => void handleApprove(ticket)}
                          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {approvingId === ticket.id ? "Approving..." : "Approve request"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </>
  );
}
