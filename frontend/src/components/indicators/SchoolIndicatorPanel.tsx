import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, History, RefreshCw, Send, Target, XCircle } from "lucide-react";
import { useIndicatorData } from "@/context/IndicatorData";
import type {
  FormSubmissionHistoryEntry,
  IndicatorMetric,
  IndicatorSubmission,
  IndicatorSubmissionPayload,
} from "@/types";

type MetricEntryState = Record<
  string,
  {
    enabled: boolean;
    targetValue: string;
    actualValue: string;
    remarks: string;
  }
>;

interface ComplianceCategory {
  id: string;
  label: string;
  items: string[];
}

const COMPLIANCE_CATEGORIES: ComplianceCategory[] = [
  {
    id: "profile_enrollment",
    label: "Profile and Enrollment",
    items: [
      "Name of School Head",
      "Total Number of Enrolment",
      "SBM Level of Practice",
    ],
  },
  {
    id: "classroom_learning_resources",
    label: "Classroom, WASH, and Learning Resources",
    items: [
      "Pupil/Student Classroom Ratio (Kindergarten)",
      "Pupil/Student Classroom Ratio (Grades 1 to 3)",
      "Pupil/Student Classroom Ratio (Grades 4 to 6)",
      "Pupil/Student Classroom Ratio (Grades 7 to 10)",
      "Pupil/Student Classroom Ratio (Grades 11 to 12)",
      "Water and Sanitation Facility to Pupil Ratio",
      "Number of Comfort Rooms",
      "Toilet Bowls",
      "Urinals",
      "Handwashing Facilities",
      "Ideal Learning Materials to Learner Ratio",
      "Pupil/Student Seat Ratio",
      "Seat Ratio - Kindergarten",
      "Seat Ratio - Grades 1 to 6",
      "Seat Ratio - Grades 7 to 10",
      "Seat Ratio - Grades 11 to 12",
    ],
  },
  {
    id: "ict_utilities",
    label: "ICT, Utilities, and School Readiness",
    items: [
      "ICT / E-Classroom Package to Sections Ratio",
      "ICT Laboratory Availability",
      "Science Laboratory Availability",
      "Internet Access (Y/N)",
      "Electricity Availability (Y/N)",
      "Complete Fence/Gate (Evident/Partially/Not Evident)",
    ],
  },
  {
    id: "teacher_profile",
    label: "Teacher Profile and Inclusion",
    items: [
      "Number of Teachers",
      "Teachers - Male",
      "Teachers - Female",
      "Teachers with Physical Disability",
      "Teachers with Physical Disability - Male",
      "Teachers with Physical Disability - Female",
      "No. of Teachers Trained on Psychological First Aid (PFA)",
      "No. of Teachers Trained on Occupational First Aid",
    ],
  },
  {
    id: "programs_safety",
    label: "Programs, Governance, and Safety",
    items: [
      "Functional SGC",
      "School-Based Feeding Program Beneficiaries",
      "School-Managed Canteen (Annual Income)",
      "Teachers Cooperative Managed Canteen (Annual Income)",
      "Security and Safety (Contingency Plan)",
      "Contingency Plan - Earthquake",
      "Contingency Plan - Typhoon",
      "Contingency Plan - COVID-19",
      "Contingency Plan - Power Interruption",
      "Contingency Plan - In-Person Classes",
    ],
  },
];

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

function buildInitialMetricEntries(metrics: IndicatorMetric[], current: MetricEntryState): MetricEntryState {
  const next: MetricEntryState = {};

  for (const metric of metrics) {
    next[metric.id] = current[metric.id] ?? {
      enabled: false,
      targetValue: "",
      actualValue: "",
      remarks: "",
    };
  }

  return next;
}

export function SchoolIndicatorPanel() {
  const {
    submissions,
    metrics,
    academicYears,
    isLoading,
    isSaving,
    error,
    lastSyncedAt,
    refreshSubmissions,
    createSubmission,
    submitSubmission,
    loadHistory,
  } = useIndicatorData();

  const [academicYearId, setAcademicYearId] = useState("");
  const [reportingPeriod, setReportingPeriod] = useState("Q1");
  const [notes, setNotes] = useState("");
  const [metricEntries, setMetricEntries] = useState<MetricEntryState>({});
  const [submitError, setSubmitError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [historyBySubmissionId, setHistoryBySubmissionId] = useState<Record<string, FormSubmissionHistoryEntry[]>>({});
  const [historyLoadingSubmissionId, setHistoryLoadingSubmissionId] = useState<string | null>(null);
  const [activeComplianceCategoryId, setActiveComplianceCategoryId] = useState<string>(COMPLIANCE_CATEGORIES[0].id);

  useEffect(() => {
    setMetricEntries((current) => buildInitialMetricEntries(metrics, current));
  }, [metrics]);

  useEffect(() => {
    if (academicYearId || academicYears.length === 0) {
      return;
    }

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

  const sortedSubmissions = useMemo(
    () =>
      [...submissions].sort((a, b) => {
        const aDate = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const bDate = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return bDate - aDate;
      }),
    [submissions],
  );

  const activeComplianceCategory = useMemo(
    () => COMPLIANCE_CATEGORIES.find((category) => category.id === activeComplianceCategoryId) ?? COMPLIANCE_CATEGORIES[0],
    [activeComplianceCategoryId],
  );

  const resetForm = () => {
    setNotes("");
    setReportingPeriod("Q1");
    setMetricEntries(() => buildInitialMetricEntries(metrics, {}));
  };

  const handleCreateSubmission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    setSaveMessage("");

    if (!academicYearId) {
      setSubmitError("Select an academic year.");
      return;
    }

    const entries = Object.entries(metricEntries)
      .filter(([, value]) => value.enabled)
      .map(([metricId, value]) => ({
        metricId: Number(metricId),
        targetValue: Number(value.targetValue),
        actualValue: Number(value.actualValue),
        remarks: value.remarks.trim() || null,
      }));

    if (entries.length === 0) {
      setSubmitError("Enable at least one indicator row before creating a package.");
      return;
    }

    if (entries.some((entry) => Number.isNaN(entry.targetValue) || Number.isNaN(entry.actualValue))) {
      setSubmitError("Target and actual values must be valid numbers.");
      return;
    }

    const payload: IndicatorSubmissionPayload = {
      academicYearId: Number(academicYearId),
      reportingPeriod,
      notes: notes.trim() || null,
      indicators: entries,
    };

    try {
      const created = await createSubmission(payload);
      setSaveMessage(`Indicator package #${created.id} created as draft.`);
      resetForm();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unable to create indicator package.");
    }
  };

  const handleSubmitToMonitor = async (submission: IndicatorSubmission) => {
    setSubmitError("");
    setSaveMessage("");

    try {
      await submitSubmission(submission.id);
      setSaveMessage(`Package #${submission.id} submitted to monitor.`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unable to submit package.");
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
      setSubmitError(err instanceof Error ? err.message : "Unable to load package history.");
    } finally {
      setHistoryLoadingSubmissionId(null);
    }
  };

  return (
    <section className="surface-panel mt-5 animate-fade-slide overflow-hidden rounded-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Indicator Compliance Workflow</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Encode indicators, save a draft package, submit to monitor, and track review history.
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
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total Packages</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{summary.total}</p>
        </article>
        <article className="rounded-sm border border-cyan-200 bg-cyan-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Awaiting Review</p>
          <p className="mt-1 text-lg font-bold text-cyan-800">{summary.submitted}</p>
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

      <section className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Compliance Indicator Categories</h3>
        <p className="mt-1 text-xs text-slate-600">
          Based on your school-year matrix (2022-2023 to 2026-2027). Select a category, then encode values below.
        </p>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {COMPLIANCE_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveComplianceCategoryId(category.id)}
              className={`border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide transition ${
                category.id === activeComplianceCategory.id
                  ? "border-primary bg-primary-50 text-primary-800"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="mt-3 border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{activeComplianceCategory.label}</p>
          <ul className="mt-2 grid gap-1 md:grid-cols-2">
            {activeComplianceCategory.items.map((item) => (
              <li key={item} className="text-xs text-slate-700">
                - {item}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">
            For Y/N indicators, encode `1` for yes and `0` for no. For evidence-level indicators, use a numeric scale agreed by the division monitor.
          </p>
        </div>
      </section>

      <form className="space-y-4 border-b border-slate-100 px-5 py-4" onSubmit={handleCreateSubmission}>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label htmlFor="indicator-year" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Academic Year
            </label>
            <select
              id="indicator-year"
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
            <label htmlFor="indicator-period" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Reporting Period
            </label>
            <select
              id="indicator-period"
              value={reportingPeriod}
              onChange={(event) => setReportingPeriod(event.target.value)}
              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            >
              <option value="Q1">Q1</option>
              <option value="Q2">Q2</option>
              <option value="Q3">Q3</option>
              <option value="Q4">Q4</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </div>

          <div>
            <label htmlFor="indicator-notes" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Notes
            </label>
            <input
              id="indicator-notes"
              type="text"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional context for monitor"
              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-2 py-2 text-left">Use</th>
                <th className="px-2 py-2 text-left">Indicator</th>
                <th className="px-2 py-2 text-right">Target</th>
                <th className="px-2 py-2 text-right">Actual</th>
                <th className="px-2 py-2 text-left">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {metrics.map((metric) => {
                const current = metricEntries[metric.id] ?? {
                  enabled: false,
                  targetValue: "",
                  actualValue: "",
                  remarks: "",
                };

                return (
                  <tr key={metric.id}>
                    <td className="px-2 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={current.enabled}
                        onChange={(event) =>
                          setMetricEntries((entries) => ({
                            ...entries,
                            [metric.id]: {
                              ...current,
                              enabled: event.target.checked,
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <p className="text-sm font-semibold text-slate-900">{metric.code}</p>
                      <p className="text-xs text-slate-500">{metric.name}</p>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={current.targetValue}
                        onChange={(event) =>
                          setMetricEntries((entries) => ({
                            ...entries,
                            [metric.id]: {
                              ...current,
                              targetValue: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-sm border border-slate-200 bg-white px-2 py-2 text-right text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={current.actualValue}
                        onChange={(event) =>
                          setMetricEntries((entries) => ({
                            ...entries,
                            [metric.id]: {
                              ...current,
                              actualValue: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-sm border border-slate-200 bg-white px-2 py-2 text-right text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={current.remarks}
                        onChange={(event) =>
                          setMetricEntries((entries) => ({
                            ...entries,
                            [metric.id]: {
                              ...current,
                              remarks: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-sm border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {submitError && (
          <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{submitError}</p>
        )}
        {saveMessage && (
          <p className="rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{saveMessage}</p>
        )}
        {error && (
          <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={isSaving || isLoading || metrics.length === 0}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <Target className="h-4 w-4" />
          {isSaving ? "Saving..." : "Create Indicator Draft"}
        </button>
      </form>

      <div className="px-5 py-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">My Indicator Submissions</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-2 py-2 text-left">Package</th>
                <th className="px-2 py-2 text-left">Period</th>
                <th className="px-2 py-2 text-center">Status</th>
                <th className="px-2 py-2 text-right">Compliance</th>
                <th className="px-2 py-2 text-left">Review Note</th>
                <th className="px-2 py-2 text-left">Last Updated</th>
                <th className="px-2 py-2 text-center">Action</th>
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
                      <td className="px-2 py-2 text-sm text-slate-600">{submission.reviewNotes || "N/A"}</td>
                      <td className="px-2 py-2 text-sm text-slate-600">{formatDateTime(submission.updatedAt ?? submission.createdAt)}</td>
                      <td className="px-2 py-2 text-center">
                        <div className="inline-flex items-center gap-2">
                          {submission.status === "draft" || submission.status === "returned" ? (
                            <button
                              type="button"
                              onClick={() => void handleSubmitToMonitor(submission)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 rounded-sm border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              <Send className="h-3.5 w-3.5" />
                              Submit
                            </button>
                          ) : submission.status === "validated" ? (
                            <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Validated
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                              <XCircle className="h-3.5 w-3.5" />
                              In Review
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleToggleDetails(submission)}
                            className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
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
                        <td colSpan={7} className="bg-slate-50 px-3 py-3">
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Indicator Entries</p>
                              <div className="mt-2 overflow-x-auto rounded-sm border border-slate-200 bg-white">
                                <table className="min-w-full">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                      <th className="px-2 py-2 text-left">Indicator</th>
                                      <th className="px-2 py-2 text-right">Target</th>
                                      <th className="px-2 py-2 text-right">Actual</th>
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
                                  <p className="rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Loading history...</p>
                                ) : historyRows.length === 0 ? (
                                  <p className="rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">No history entries found.</p>
                                ) : (
                                  historyRows.map((entry) => (
                                    <article key={entry.id} className="rounded-sm border border-slate-200 bg-white px-3 py-2">
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
                  <td colSpan={7} className="px-2 py-8 text-center text-sm text-slate-500">
                    No indicator packages yet. Create your first draft above.
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


