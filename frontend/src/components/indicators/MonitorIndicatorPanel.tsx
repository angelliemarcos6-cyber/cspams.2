import { Fragment, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, History, RefreshCw, RotateCcw, Send, XCircle } from "lucide-react";
import { useIndicatorData } from "@/context/IndicatorData";
import type { FormSubmissionHistoryEntry, IndicatorSubmission } from "@/types";

interface MonitorIndicatorPanelProps {
  schoolFilterKeys?: Set<string> | null;
}

function workflowTone(status: string): string {
  if (status === "validated") return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300";
  if (status === "submitted") return "bg-cyan-100 text-cyan-700 ring-1 ring-cyan-300";
  if (status === "returned") return "bg-amber-100 text-amber-700 ring-1 ring-amber-300";
  return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
}

function complianceTone(status: string): string {
  return status === "met"
    ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
    : "bg-amber-100 text-amber-700 ring-1 ring-amber-300";
}

function formatDateTime(value: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function normalizeSchoolKey(schoolCode: string | null | undefined, schoolName: string | null | undefined): string {
  const code = schoolCode?.trim().toLowerCase();
  if (code) return `code:${code}`;

  const name = schoolName?.trim().toLowerCase();
  if (name) return `name:${name}`;

  return "unknown";
}

export function MonitorIndicatorPanel({ schoolFilterKeys = null }: MonitorIndicatorPanelProps) {
  const {
    submissions,
    isLoading,
    isSaving,
    error,
    lastSyncedAt,
    refreshSubmissions,
    reviewSubmission,
    loadHistory,
  } = useIndicatorData();

  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [historyBySubmissionId, setHistoryBySubmissionId] = useState<Record<string, FormSubmissionHistoryEntry[]>>({});
  const [historyLoadingSubmissionId, setHistoryLoadingSubmissionId] = useState<string | null>(null);

  const visibleSubmissions = useMemo(() => {
    if (!schoolFilterKeys || schoolFilterKeys.size === 0) {
      return submissions;
    }

    return submissions.filter((submission) =>
      schoolFilterKeys.has(
        normalizeSchoolKey(submission.school?.schoolCode ?? null, submission.school?.name ?? null),
      ),
    );
  }, [submissions, schoolFilterKeys]);

  const summary = useMemo(() => {
    const total = visibleSubmissions.length;
    const submitted = visibleSubmissions.filter((item) => item.status === "submitted").length;
    const validated = visibleSubmissions.filter((item) => item.status === "validated").length;
    const returned = visibleSubmissions.filter((item) => item.status === "returned").length;

    return { total, submitted, validated, returned };
  }, [visibleSubmissions]);

  const sortedSubmissions = useMemo(
    () =>
      [...visibleSubmissions].sort((a, b) => {
        const aDate = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const bDate = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return bDate - aDate;
      }),
    [visibleSubmissions],
  );

  const handleReview = async (submission: IndicatorSubmission, decision: "validated" | "returned") => {
    setActionError("");
    setActionMessage("");

    const promptLabel =
      decision === "validated"
        ? "Validation note (optional):"
        : "Return note for school head (required):";
    const notes = window.prompt(promptLabel, "");

    if (notes === null) {
      return;
    }

    if (decision === "returned" && notes.trim().length === 0) {
      setActionError("Return note is required before sending back to school head.");
      return;
    }

    try {
      await reviewSubmission(submission.id, decision, notes);
      setActionMessage(
        decision === "validated"
          ? `Package #${submission.id} validated.`
          : `Package #${submission.id} returned to school head.`,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to complete review action.");
    }
  };

  const handleToggleDetails = async (submission: IndicatorSubmission) => {
    const submissionId = submission.id;
    if (expandedSubmissionId === submissionId) {
      setExpandedSubmissionId(null);
      return;
    }

    setExpandedSubmissionId(submissionId);

    if (historyBySubmissionId[submissionId]) {
      return;
    }

    setHistoryLoadingSubmissionId(submissionId);
    try {
      const history = await loadHistory(submissionId);
      setHistoryBySubmissionId((current) => ({ ...current, [submissionId]: history }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load package history.");
    } finally {
      setHistoryLoadingSubmissionId(null);
    }
  };

  return (
    <section className="surface-panel mt-5 animate-fade-slide overflow-hidden rounded-2xl">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Indicator Compliance Review Queue</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Review school indicator submissions, validate or return, and inspect full history.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshSubmissions()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : "Not synced yet"}
          {schoolFilterKeys ? " · Filtered school set active" : ""}
        </p>
      </div>

      <div className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total Packages</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{summary.total}</p>
        </article>
        <article className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Awaiting Review</p>
          <p className="mt-1 text-lg font-bold text-cyan-800">{summary.submitted}</p>
        </article>
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Validated</p>
          <p className="mt-1 text-lg font-bold text-emerald-800">{summary.validated}</p>
        </article>
        <article className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Returned</p>
          <p className="mt-1 text-lg font-bold text-amber-800">{summary.returned}</p>
        </article>
      </div>

      <div className="px-5 py-4">
        {actionMessage && (
          <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            {actionMessage}
          </p>
        )}
        {actionError && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {actionError}
          </p>
        )}
        {error && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {error}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-2 py-2 text-left">Package</th>
                <th className="px-2 py-2 text-left">School</th>
                <th className="px-2 py-2 text-left">Period</th>
                <th className="px-2 py-2 text-center">Status</th>
                <th className="px-2 py-2 text-right">Compliance</th>
                <th className="px-2 py-2 text-left">Submitted At</th>
                <th className="px-2 py-2 text-left">Review Note</th>
                <th className="px-2 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedSubmissions.map((submission) => {
                const historyRows = historyBySubmissionId[submission.id] ?? [];
                const isExpanded = expandedSubmissionId === submission.id;
                const isHistoryLoading = historyLoadingSubmissionId === submission.id;

                return (
                  <Fragment key={submission.id}>
                    <tr>
                      <td className="px-2 py-2 text-sm font-semibold text-slate-900">#{submission.id}</td>
                      <td className="px-2 py-2 text-sm text-slate-700">{submission.school?.name || "N/A"}</td>
                      <td className="px-2 py-2 text-sm text-slate-700">{submission.reportingPeriod || "N/A"}</td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${workflowTone(
                            submission.status,
                          )}`}
                        >
                          {submission.statusLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right text-sm font-semibold text-slate-900">
                        {submission.summary.complianceRatePercent.toFixed(2)}%
                      </td>
                      <td className="px-2 py-2 text-sm text-slate-600">{formatDateTime(submission.submittedAt)}</td>
                      <td className="px-2 py-2 text-sm text-slate-600">{submission.reviewNotes || "N/A"}</td>
                      <td className="px-2 py-2 text-center">
                        <div className="inline-flex gap-2">
                          {submission.status === "submitted" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleReview(submission, "validated")}
                                disabled={isSaving || isLoading}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Validate
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleReview(submission, "returned")}
                                disabled={isSaving || isLoading}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Return
                              </button>
                            </>
                          ) : submission.status === "validated" ? (
                            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Closed
                            </span>
                          ) : submission.status === "returned" ? (
                            <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
                              <XCircle className="h-3.5 w-3.5" />
                              Returned
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                              <Send className="h-3.5 w-3.5" />
                              Draft
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleToggleDetails(submission)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            <History className="h-3.5 w-3.5" />
                            {isExpanded ? "Hide" : "Details"}
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50 px-3 py-3">
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Indicator Entries</p>
                              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                <table className="min-w-full">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                      <th className="px-2 py-2 text-left">Indicator</th>
                                      <th className="px-2 py-2 text-right">Target</th>
                                      <th className="px-2 py-2 text-right">Actual</th>
                                      <th className="px-2 py-2 text-right">Variance</th>
                                      <th className="px-2 py-2 text-center">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {submission.indicators.map((entry) => (
                                      <tr key={entry.id}>
                                        <td className="px-2 py-2">
                                          <p className="text-xs font-semibold text-slate-900">{entry.metric?.code || "N/A"}</p>
                                          <p className="text-xs text-slate-500">{entry.metric?.name || "Unknown metric"}</p>
                                        </td>
                                        <td className="px-2 py-2 text-right text-xs text-slate-700">{entry.targetValue}</td>
                                        <td className="px-2 py-2 text-right text-xs text-slate-700">{entry.actualValue}</td>
                                        <td className="px-2 py-2 text-right text-xs text-slate-700">{entry.varianceValue}</td>
                                        <td className="px-2 py-2 text-center">
                                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${complianceTone(entry.complianceStatus)}`}>
                                            {entry.complianceStatus === "met" ? "Met" : "Below"}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Workflow History</p>
                              <div className="mt-2 space-y-2">
                                {isHistoryLoading ? (
                                  <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Loading history...</p>
                                ) : historyRows.length === 0 ? (
                                  <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">No history entries found.</p>
                                ) : (
                                  historyRows.map((entry) => (
                                    <article key={entry.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                        {entry.action} · {formatDateTime(entry.createdAt)}
                                      </p>
                                      <p className="mt-0.5 text-xs text-slate-600">
                                        {entry.actor?.name ? `By ${entry.actor.name}` : "System action"}
                                      </p>
                                      {entry.notes && <p className="mt-1 text-xs text-slate-700">{entry.notes}</p>}
                                    </article>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {sortedSubmissions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-8 text-center text-sm text-slate-500">
                    {schoolFilterKeys
                      ? "No indicator packages match the selected school filters."
                      : "No indicator packages available yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
