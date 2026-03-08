import { Fragment, useMemo, useState } from "react";
import { CheckCircle2, History, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { useFormData } from "@/context/FormData";
import type { FormSubmission, FormSubmissionHistoryEntry, SubmissionFormType } from "@/types";

interface MonitorFormsPanelProps {
  schoolFilterKeys?: Set<string> | null;
}

function workflowTone(status: string): string {
  if (status === "validated") return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300";
  if (status === "submitted") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (status === "returned") return "bg-amber-100 text-amber-700 ring-1 ring-amber-300";
  return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
}

function formatDateTime(value: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function rowKey(submission: FormSubmission): string {
  return `${submission.formType}:${submission.id}`;
}

function formLabel(formType: string): string {
  return formType.toUpperCase();
}

function normalizeSchoolKey(schoolCode: string | null | undefined, schoolName: string | null | undefined): string {
  const code = schoolCode?.trim().toLowerCase();
  if (code) return `code:${code}`;

  const name = schoolName?.trim().toLowerCase();
  if (name) return `name:${name}`;

  return "unknown";
}

export function MonitorFormsPanel({ schoolFilterKeys = null }: MonitorFormsPanelProps) {
  const {
    submissions,
    isLoading,
    isSaving,
    error,
    lastSyncedAt,
    refreshSubmissions,
    reviewSubmission,
    loadHistory,
  } = useFormData();

  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [historyByRowKey, setHistoryByRowKey] = useState<Record<string, FormSubmissionHistoryEntry[]>>({});
  const [historyLoadingKey, setHistoryLoadingKey] = useState<string | null>(null);

  const visibleSubmissions = useMemo(() => {
    if (!schoolFilterKeys) {
      return submissions;
    }

    if (schoolFilterKeys.size === 0) {
      return [];
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

  const handleReview = async (submission: FormSubmission, decision: "validated" | "returned") => {
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
      setActionError("Return action requires notes.");
      return;
    }

    try {
      await reviewSubmission(
        submission.formType as SubmissionFormType,
        submission.id,
        decision,
        notes,
      );

      setActionMessage(
        decision === "validated"
          ? `${formLabel(submission.formType)} #${submission.id} validated.`
          : `${formLabel(submission.formType)} #${submission.id} returned to school head.`,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to complete review action.");
    }
  };

  const handleToggleHistory = async (submission: FormSubmission) => {
    const key = rowKey(submission);
    if (expandedRowKey === key) {
      setExpandedRowKey(null);
      return;
    }

    setExpandedRowKey(key);
    if (historyByRowKey[key]) {
      return;
    }

    setHistoryLoadingKey(key);
    try {
      const history = await loadHistory(submission.formType as SubmissionFormType, submission.id);
      setHistoryByRowKey((current) => ({ ...current, [key]: history }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load submission history.");
    } finally {
      setHistoryLoadingKey(null);
    }
  };

  return (
    <section className="surface-panel mt-5 animate-fade-slide overflow-hidden rounded-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Digital SF-1 / SF-5 Review Queue</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Validate or return school-generated forms with review notes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshSubmissions()}
            className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : "Not synced yet"}
          {schoolFilterKeys ? " - Filtered school set active" : ""}
        </p>
      </div>

      <div className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-4">
        <article className="rounded-sm border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total Forms</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{summary.total}</p>
        </article>
        <article className="rounded-sm border border-primary-200 bg-primary-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">Awaiting Review</p>
          <p className="mt-1 text-lg font-bold text-primary-800">{summary.submitted}</p>
        </article>
        <article className="rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Validated</p>
          <p className="mt-1 text-lg font-bold text-emerald-800">{summary.validated}</p>
        </article>
        <article className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Returned</p>
          <p className="mt-1 text-lg font-bold text-amber-800">{summary.returned}</p>
        </article>
      </div>

      <div className="px-5 py-4">
        {actionMessage && (
          <p className="mb-3 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            {actionMessage}
          </p>
        )}
        {actionError && (
          <p className="mb-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {actionError}
          </p>
        )}
        {error && (
          <p className="mb-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {error}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-2 py-2 text-left">Form</th>
                <th className="px-2 py-2 text-left">School</th>
                <th className="px-2 py-2 text-left">Period</th>
                <th className="px-2 py-2 text-center">Status</th>
                <th className="px-2 py-2 text-left">Submitted At</th>
                <th className="px-2 py-2 text-left">Review Note</th>
                <th className="px-2 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleSubmissions.map((submission) => {
                const key = rowKey(submission);
                const historyRows = historyByRowKey[key] ?? [];
                const isExpanded = expandedRowKey === key;

                return (
                  <Fragment key={key}>
                    <tr>
                      <td className="px-2 py-2 text-sm font-semibold text-slate-900">
                        {formLabel(submission.formType)} #{submission.id}
                      </td>
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
                      <td className="px-2 py-2 text-sm text-slate-600">{formatDateTime(submission.submittedAt)}</td>
                      <td className="px-2 py-2 text-sm text-slate-600">{submission.validationNotes || "N/A"}</td>
                      <td className="px-2 py-2 text-center">
                        <div className="inline-flex items-center gap-2">
                          {submission.status === "submitted" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleReview(submission, "validated")}
                                disabled={isSaving || isLoading}
                                className="inline-flex items-center gap-1 rounded-sm border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Validate
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleReview(submission, "returned")}
                                disabled={isSaving || isLoading}
                                className="inline-flex items-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Return
                              </button>
                            </>
                          ) : submission.status === "validated" ? (
                            <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Closed
                            </span>
                          ) : submission.status === "returned" ? (
                            <span className="inline-flex items-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
                              <XCircle className="h-3.5 w-3.5" />
                              Returned
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                              Draft
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleToggleHistory(submission)}
                            className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            <History className="h-3.5 w-3.5" />
                            History
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="bg-slate-50 px-3 py-3">
                          {historyLoadingKey === key ? (
                            <p className="text-xs text-slate-500">Loading history...</p>
                          ) : historyRows.length === 0 ? (
                            <p className="text-xs text-slate-500">No history entries found.</p>
                          ) : (
                            <div className="space-y-2">
                              {historyRows.map((entry) => (
                                <article key={entry.id} className="rounded-sm border border-slate-200 bg-white px-3 py-2">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                    {entry.action} - {formatDateTime(entry.createdAt)}
                                  </p>
                                  <p className="mt-0.5 text-xs text-slate-600">
                                    {entry.actor?.name ? `By ${entry.actor.name}` : "System action"}
                                  </p>
                                  {entry.notes && <p className="mt-1 text-xs text-slate-700">{entry.notes}</p>}
                                </article>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {visibleSubmissions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2 py-8 text-center text-sm text-slate-500">
                    {schoolFilterKeys
                      ? "No SF-1/SF-5 submissions match the selected school filters."
                      : "No SF-1/SF-5 submissions available yet."}
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




