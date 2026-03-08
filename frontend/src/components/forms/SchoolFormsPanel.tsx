import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, FileCheck2, History, RefreshCw, Send, XCircle } from "lucide-react";
import { useFormData } from "@/context/FormData";
import type { FormSubmission, FormSubmissionHistoryEntry, SubmissionFormType } from "@/types";

const REPORTING_PERIOD_OPTIONS = ["", "Q1", "Q2", "Q3", "Q4", "ANNUAL"];

function workflowTone(status: string): string {
  if (status === "validated") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (status === "submitted") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (status === "returned") return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
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

export function SchoolFormsPanel() {
  const {
    submissions,
    academicYears,
    isLoading,
    isSaving,
    error,
    lastSyncedAt,
    refreshSubmissions,
    generateSubmission,
    submitSubmission,
    loadHistory,
  } = useFormData();

  const [formType, setFormType] = useState<SubmissionFormType>("sf1");
  const [academicYearId, setAcademicYearId] = useState("");
  const [reportingPeriod, setReportingPeriod] = useState("Q1");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [historyByRowKey, setHistoryByRowKey] = useState<Record<string, FormSubmissionHistoryEntry[]>>({});
  const [historyLoadingKey, setHistoryLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    if (academicYearId || academicYears.length === 0) return;
    const currentYear = academicYears.find((year) => year.isCurrent);
    setAcademicYearId(currentYear?.id ?? academicYears[0].id);
  }, [academicYearId, academicYears]);

  const summary = useMemo(() => {
    const total = submissions.length;
    const submitted = submissions.filter((item) => item.status === "submitted").length;
    const validated = submissions.filter((item) => item.status === "validated").length;
    const returned = submissions.filter((item) => item.status === "returned").length;

    return { total, submitted, validated, returned };
  }, [submissions]);

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError("");
    setActionMessage("");

    if (!academicYearId) {
      setActionError("Select an academic year.");
      return;
    }

    try {
      const created = await generateSubmission(formType, {
        academicYearId: Number(academicYearId),
        reportingPeriod: reportingPeriod || null,
      });
      setActionMessage(`${formLabel(created.formType)} draft #${created.id} generated.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to generate form draft.");
    }
  };

  const handleSubmit = async (submission: FormSubmission) => {
    setActionError("");
    setActionMessage("");

    try {
      const updated = await submitSubmission(submission.formType as SubmissionFormType, submission.id);
      setActionMessage(`${formLabel(updated.formType)} #${updated.id} submitted to monitor.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to submit form.");
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
            <h2 className="text-base font-bold text-slate-900">Digital SF-1 / SF-5 Workflow</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Auto-generate forms, submit to monitor, and track validation history.
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
        <article className="rounded-sm border border-primary-200 bg-primary-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">Validated</p>
          <p className="mt-1 text-lg font-bold text-primary-800">{summary.validated}</p>
        </article>
        <article className="rounded-sm border border-slate-300 bg-slate-100 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Returned</p>
          <p className="mt-1 text-lg font-bold text-slate-800">{summary.returned}</p>
        </article>
      </div>

      <form className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-4" onSubmit={handleGenerate}>
        <div>
          <label htmlFor="form-type" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Form Type
          </label>
          <select
            id="form-type"
            value={formType}
            onChange={(event) => setFormType(event.target.value as SubmissionFormType)}
            className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
          >
            <option value="sf1">SF-1</option>
            <option value="sf5">SF-5</option>
          </select>
        </div>

        <div>
          <label htmlFor="form-year" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Academic Year
          </label>
          <select
            id="form-year"
            value={academicYearId}
            onChange={(event) => setAcademicYearId(event.target.value)}
            className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
          >
            <option value="">Select academic year</option>
            {academicYears.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
                {year.isCurrent ? " (Current)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="form-period" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Reporting Period
          </label>
          <select
            id="form-period"
            value={reportingPeriod}
            onChange={(event) => setReportingPeriod(event.target.value)}
            className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
          >
            {REPORTING_PERIOD_OPTIONS.map((option) => (
              <option key={option || "none"} value={option}>
                {option || "None"}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={isSaving || isLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <FileCheck2 className="h-4 w-4" />
            {isSaving ? "Generating..." : "Generate Draft"}
          </button>
        </div>
      </form>

      <div className="px-5 py-4">
        {actionMessage && (
          <p className="mb-3 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
            {actionMessage}
          </p>
        )}
        {actionError && (
          <p className="mb-3 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
            {actionError}
          </p>
        )}
        {error && (
          <p className="mb-3 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
            {error}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-2 py-2 text-left">Form</th>
                <th className="px-2 py-2 text-left">Period</th>
                <th className="px-2 py-2 text-center">Status</th>
                <th className="px-2 py-2 text-left">Validation Note</th>
                <th className="px-2 py-2 text-left">Last Updated</th>
                <th className="px-2 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submissions.map((submission) => {
                const key = rowKey(submission);
                const historyRows = historyByRowKey[key] ?? [];
                const isExpanded = expandedRowKey === key;

                return (
                  <Fragment key={key}>
                    <tr>
                      <td className="px-2 py-2 text-sm font-semibold text-slate-900">
                        {formLabel(submission.formType)} #{submission.id}
                      </td>
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
                      <td className="px-2 py-2 text-sm text-slate-600">{submission.validationNotes || "N/A"}</td>
                      <td className="px-2 py-2 text-sm text-slate-600">
                        {formatDateTime(submission.updatedAt ?? submission.createdAt)}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <div className="inline-flex items-center gap-2">
                          {(submission.status === "draft" || submission.status === "returned") && (
                            <button
                              type="button"
                              onClick={() => void handleSubmit(submission)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              <Send className="h-3.5 w-3.5" />
                              Submit
                            </button>
                          )}
                          {submission.status === "validated" && (
                            <span className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Validated
                            </span>
                          )}
                          {submission.status === "submitted" && (
                            <span className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                              <XCircle className="h-3.5 w-3.5" />
                              In Review
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
                        <td colSpan={6} className="bg-slate-50 px-3 py-3">
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
              {submissions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-8 text-center text-sm text-slate-500">
                    No SF-1/SF-5 submissions yet. Generate your first draft above.
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




