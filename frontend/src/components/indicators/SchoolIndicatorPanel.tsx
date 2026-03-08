import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, History, RefreshCw, Send, Target, XCircle } from "lucide-react";
import { useIndicatorData } from "@/context/IndicatorData";
import type {
  FormSubmissionHistoryEntry,
  IndicatorMetric,
  IndicatorSubmission,
  IndicatorSubmissionPayload,
  IndicatorTypedValuePayload,
  MetricDataType,
} from "@/types";

type MetricEntryState = Record<
  string,
  {
    targetValue: string;
    actualValue: string;
    targetText: string;
    actualText: string;
    targetBoolean: "" | "yes" | "no";
    actualBoolean: "" | "yes" | "no";
    targetEnum: string;
    actualEnum: string;
    targetMatrix: Record<string, string>;
    actualMatrix: Record<string, string>;
    remarks: string;
  }
>;

type MetricEntryValue = MetricEntryState[string];

interface ComplianceCategory {
  id: string;
  label: string;
  metricCodes: string[];
}

const SCHOOL_ACHIEVEMENTS_METRIC_CODES = [
  "IMETA_HEAD_NAME",
  "IMETA_ENROLL_TOTAL",
  "IMETA_SBM_LEVEL",
  "PCR_K",
  "PCR_G1_3",
  "PCR_G4_6",
  "PCR_G7_10",
  "PCR_G11_12",
  "WASH_RATIO",
  "COMFORT_ROOMS",
  "TOILET_BOWLS",
  "URINALS",
  "HANDWASH_FAC",
  "LEARNING_MAT_RATIO",
  "PSR_OVERALL",
  "PSR_K",
  "PSR_G1_6",
  "PSR_G7_10",
  "PSR_G11_12",
  "ICT_RATIO",
  "ICT_LAB",
  "SCIENCE_LAB",
  "INTERNET_ACCESS",
  "ELECTRICITY",
  "FENCE_STATUS",
  "TEACHERS_TOTAL",
  "TEACHERS_MALE",
  "TEACHERS_FEMALE",
  "TEACHERS_PWD_TOTAL",
  "TEACHERS_PWD_MALE",
  "TEACHERS_PWD_FEMALE",
  "FUNCTIONAL_SGC",
  "FEEDING_BENEFICIARIES",
  "CANTEEN_INCOME",
  "TEACHER_COOP_INCOME",
  "SAFETY_PLAN",
  "SAFETY_EARTHQUAKE",
  "SAFETY_TYPHOON",
  "SAFETY_COVID",
  "SAFETY_POWER",
  "SAFETY_IN_PERSON",
  "TEACHERS_PFA",
  "TEACHERS_OCC_FIRST_AID",
];

const COMPLIANCE_CATEGORIES: ComplianceCategory[] = [
  {
    id: "school_achievements_learning_outcomes",
    label: "SCHOOL'S ACHIEVEMENTS AND LEARNING OUTCOMES",
    metricCodes: SCHOOL_ACHIEVEMENTS_METRIC_CODES,
  },
];

const COMPLIANCE_METRIC_CODES = new Set(COMPLIANCE_CATEGORIES.flatMap((category) => category.metricCodes));

const METRIC_LABEL_OVERRIDES: Record<string, string> = {
  IMETA_HEAD_NAME: "NAME OF SCHOOL HEAD",
  IMETA_ENROLL_TOTAL: "TOTAL NUMBER OF ENROLMENT",
  IMETA_SBM_LEVEL: "SBM LEVEL OF PRACTICE",
  PCR_K: "Pupil/Student Classroom Ratio (Kindergarten)",
  PCR_G1_3: "Pupil/Student Classroom Ratio (Grades 1 to 3)",
  PCR_G4_6: "Pupil/Student Classroom Ratio (Grades 4 to 6)",
  PCR_G7_10: "Pupil/Student Classroom Ratio (Grades 7 to 10)",
  PCR_G11_12: "Pupil/Student Classroom Ratio (Grades 11 to 12)",
  WASH_RATIO: "Water and Sanitation facility to pupil ratio",
  COMFORT_ROOMS: "Number of Comfort rooms",
  TOILET_BOWLS: "a. Toilet bowl",
  URINALS: "b. Urinal",
  HANDWASH_FAC: "Handwashing Facilities",
  LEARNING_MAT_RATIO: "Ideal learning materials to learner ratio",
  PSR_OVERALL: "Pupil/student seat ratio",
  PSR_K: "a. Kindergarten",
  PSR_G1_6: "b. Grades 1 - 6",
  PSR_G7_10: "c. Grades 7 - 10",
  PSR_G11_12: "d. Grades 11 - 12",
  ICT_RATIO: "ICT Package/E-classroom package to sections ratio",
  ICT_LAB: "a. ICT Laboratory",
  SCIENCE_LAB: "Science Laboratory",
  INTERNET_ACCESS: "Do you have internet access? (Y/N)",
  ELECTRICITY: "Do you have electricity (Y/N)",
  FENCE_STATUS: "Do you have a complete fence/gate? (Evident/Partially/Not Evident)",
  TEACHERS_TOTAL: "No. of Teachers",
  TEACHERS_MALE: "a. Male",
  TEACHERS_FEMALE: "b. Female",
  TEACHERS_PWD_TOTAL: "Teachers with Physical Disability",
  TEACHERS_PWD_MALE: "a. Male",
  TEACHERS_PWD_FEMALE: "b. Female",
  FUNCTIONAL_SGC: "Functional SGC",
  FEEDING_BENEFICIARIES: "School-Based Feeding Program Beneficiaries",
  CANTEEN_INCOME: "School-Managed Canteen (Annual income)",
  TEACHER_COOP_INCOME: "Teachers Cooperative Managed Canteen - if there is (Annual income)",
  SAFETY_PLAN: "Security and Safety (Contingency Plan)",
  SAFETY_EARTHQUAKE: "a. Earthquake",
  SAFETY_TYPHOON: "b. Typhoon",
  SAFETY_COVID: "c. COVID-19",
  SAFETY_POWER: "d. Power interruption",
  SAFETY_IN_PERSON: "e. In-person classes",
  TEACHERS_PFA: "No. of Teachers trained on Psychological First Aid (PFA)",
  TEACHERS_OCC_FIRST_AID: "No. of Teachers trained on Occupational First Aid",
};

function workflowTone(status: string): string {
  if (status === "validated") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (status === "submitted") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (status === "returned") return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
  return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
}

function complianceTone(status: string): string {
  return status === "met"
    ? "bg-primary-100 text-primary-700 ring-1 ring-primary-300"
    : "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
}

function formatDateTime(value: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function metricDataType(metric: IndicatorMetric): MetricDataType {
  const value = String(metric.dataType || "number").toLowerCase();
  if (value === "currency") return "currency";
  if (value === "yes_no") return "yes_no";
  if (value === "enum") return "enum";
  if (value === "yearly_matrix") return "yearly_matrix";
  if (value === "text") return "text";
  return "number";
}

function metricYears(metric: IndicatorMetric): string[] {
  return Array.isArray(metric.inputSchema?.years) ? metric.inputSchema?.years ?? [] : [];
}

function normalizeBooleanInput(value: string): "" | "yes" | "no" {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return "yes";
  if (["0", "false", "no", "n"].includes(normalized)) return "no";
  return "";
}

function metricDisplayLabel(metric: IndicatorMetric): string {
  return METRIC_LABEL_OVERRIDES[metric.code] ?? metric.name;
}

function buildDefaultEntry(metric: IndicatorMetric): MetricEntryValue {
  const targetMatrix: Record<string, string> = {};
  const actualMatrix: Record<string, string> = {};
  for (const year of metricYears(metric)) {
    targetMatrix[year] = "";
    actualMatrix[year] = "";
  }

  return {
    targetValue: "",
    actualValue: "",
    targetText: "",
    actualText: "",
    targetBoolean: "" as const,
    actualBoolean: "" as const,
    targetEnum: "",
    actualEnum: "",
    targetMatrix,
    actualMatrix,
    remarks: "",
  };
}

function buildInitialMetricEntries(metrics: IndicatorMetric[], current: MetricEntryState): MetricEntryState {
  const next: MetricEntryState = {};

  for (const metric of metrics) {
    const previous = current[metric.id];
    next[metric.id] = previous
      ? {
          ...buildDefaultEntry(metric),
          ...previous,
          targetMatrix: {
            ...buildDefaultEntry(metric).targetMatrix,
            ...(previous.targetMatrix ?? {}),
          },
          actualMatrix: {
            ...buildDefaultEntry(metric).actualMatrix,
            ...(previous.actualMatrix ?? {}),
          },
        }
      : buildDefaultEntry(metric);
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
  const reportingPeriod = "ANNUAL";
  const [notes, setNotes] = useState("");
  const [metricEntries, setMetricEntries] = useState<MetricEntryState>({});
  const [submitError, setSubmitError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [historyBySubmissionId, setHistoryBySubmissionId] = useState<Record<string, FormSubmissionHistoryEntry[]>>({});
  const [historyLoadingSubmissionId, setHistoryLoadingSubmissionId] = useState<string | null>(null);

  const complianceMetrics = useMemo(
    () => metrics.filter((metric) => COMPLIANCE_METRIC_CODES.has(metric.code)),
    [metrics],
  );
  const complianceMetricsByCode = useMemo(
    () => new Map(complianceMetrics.map((metric) => [metric.code, metric])),
    [complianceMetrics],
  );
  const orderedComplianceMetrics = useMemo(
    () =>
      COMPLIANCE_CATEGORIES
        .flatMap((category) => category.metricCodes)
        .map((metricCode) => complianceMetricsByCode.get(metricCode))
        .filter((metric): metric is IndicatorMetric => Boolean(metric)),
    [complianceMetricsByCode],
  );

  useEffect(() => {
    setMetricEntries((current) => buildInitialMetricEntries(complianceMetrics, current));
  }, [complianceMetrics]);

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

  const resetForm = () => {
    setNotes("");
    setMetricEntries(() => buildInitialMetricEntries(complianceMetrics, {}));
  };

  const handleCreateSubmission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    setSaveMessage("");

    if (!academicYearId) {
      setSubmitError("Select an academic year.");
      return;
    }

    const entries = orderedComplianceMetrics
      .map((metric) => {
        const value = metricEntries[metric.id] ?? buildDefaultEntry(metric);

        const type = metricDataType(metric);
        let targetPayload: IndicatorTypedValuePayload | undefined;
        let actualPayload: IndicatorTypedValuePayload | undefined;
        let targetValue: number | undefined;
        let actualValue: number | undefined;

        if (type === "currency" || type === "number") {
          targetValue = Number(value.targetValue);
          actualValue = Number(value.actualValue);
          targetPayload = type === "currency" ? { amount: targetValue, currency: metric.inputSchema?.currency ?? "PHP" } : undefined;
          actualPayload = type === "currency" ? { amount: actualValue, currency: metric.inputSchema?.currency ?? "PHP" } : undefined;
        } else if (type === "yes_no") {
          targetPayload = { value: value.targetBoolean === "yes" };
          actualPayload = { value: value.actualBoolean === "yes" };
        } else if (type === "enum") {
          targetPayload = { value: value.targetEnum };
          actualPayload = { value: value.actualEnum };
        } else if (type === "text") {
          targetPayload = { value: value.targetText.trim() };
          actualPayload = { value: value.actualText.trim() };
        } else if (type === "yearly_matrix") {
          targetPayload = {
            values: Object.fromEntries(Object.entries(value.targetMatrix).map(([year, currentValue]) => [year, currentValue.trim()])),
          };
          actualPayload = {
            values: Object.fromEntries(Object.entries(value.actualMatrix).map(([year, currentValue]) => [year, currentValue.trim()])),
          };
        }

        return {
          metricId: Number(metric.id),
          targetValue,
          actualValue,
          target: targetPayload,
          actual: actualPayload,
          remarks: value.remarks.trim() || null,
          type,
        };
      });

    if (entries.length === 0) {
      setSubmitError("No required compliance indicators are available for this school.");
      return;
    }

    const invalidEntry = entries.find((entry) => {
      if (entry.type === "number" || entry.type === "currency") {
        return Number.isNaN(entry.targetValue ?? Number.NaN) || Number.isNaN(entry.actualValue ?? Number.NaN);
      }

      if (entry.type === "yes_no") {
        return entry.target?.value === undefined || entry.actual?.value === undefined;
      }

      if (entry.type === "enum" || entry.type === "text") {
        return !String(entry.target?.value ?? "").trim() || !String(entry.actual?.value ?? "").trim();
      }

      if (entry.type === "yearly_matrix") {
        const targetValues = Object.values(entry.target?.values ?? {});
        const actualValues = Object.values(entry.actual?.values ?? {});
        return targetValues.length === 0 || actualValues.length === 0 || targetValues.some((value) => String(value).trim() === "") || actualValues.some((value) => String(value).trim() === "");
      }

      return false;
    });

    if (invalidEntry) {
      setSubmitError("Complete all required target and actual fields before saving.");
      return;
    }

    const payload: IndicatorSubmissionPayload = {
      academicYearId: Number(academicYearId),
      reportingPeriod,
      notes: notes.trim() || null,
      indicators: entries.map((entry) => ({
        metricId: entry.metricId,
        targetValue: entry.targetValue,
        actualValue: entry.actualValue,
        target: entry.target,
        actual: entry.actual,
        remarks: entry.remarks,
      })),
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

      <section className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">SCHOOL'S ACHIEVEMENTS AND LEARNING OUTCOMES</h3>
        <p className="mt-1 text-xs text-slate-600">
          Fill in all required annual indicators below, save as draft, then submit to the monitor. No file attachments are required in this section.
        </p>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COMPLIANCE_CATEGORIES.map((category) => (
            <article key={category.id} className="border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{category.label}</p>
              <p className="mt-1 text-xs text-slate-600">
                {category.metricCodes.length} required indicators
              </p>
            </article>
          ))}
        </div>
      </section>

      <form className="space-y-4 border-b border-slate-100 px-5 py-4" onSubmit={handleCreateSubmission}>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Academic Year
            </label>
            <div className="flex flex-wrap gap-2">
              {academicYears.map((year) => (
                <button
                  key={year.id}
                  type="button"
                  onClick={() => setAcademicYearId(year.id)}
                  className={`rounded-sm border px-3 py-2 text-xs font-semibold transition ${
                    academicYearId === year.id
                      ? "border-primary bg-primary-50 text-primary-800"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {year.name}
                  {year.isCurrent ? " (Current)" : ""}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Reporting Period
            </label>
            <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800">
              Annual
            </p>
          </div>

          <div className="md:col-span-2">
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
                <th className="px-2 py-2 text-left">Indicator</th>
                <th className="px-2 py-2 text-right">Target</th>
                <th className="px-2 py-2 text-right">Actual</th>
                <th className="px-2 py-2 text-left">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orderedComplianceMetrics.map((metric) => {
                const type = metricDataType(metric);
                const current = metricEntries[metric.id] ?? buildDefaultEntry(metric);
                const enumOptions = Array.isArray(metric.inputSchema?.options) ? metric.inputSchema?.options ?? [] : [];
                const years = metricYears(metric);

                return (
                  <tr key={metric.id}>
                    <td className="px-2 py-2">
                      <p className="text-sm font-semibold text-slate-900">{metricDisplayLabel(metric)}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">{metric.code}</p>
                    </td>
                    <td className="px-2 py-2">
                      {type === "yearly_matrix" ? (
                        <div className="grid gap-1.5">
                          {years.map((year) => (
                            <label key={`${metric.id}-target-${year}`} className="grid grid-cols-[82px_1fr] items-center gap-2">
                              <span className="text-[11px] font-semibold text-slate-500">{year}</span>
                              {metric.inputSchema?.valueType === "yes_no" ? (
                                <div className="inline-flex w-full rounded-sm border border-slate-200 bg-white p-0.5">
                                  {(["yes", "no"] as const).map((option) => (
                                    <button
                                      key={`${metric.id}-target-${year}-${option}`}
                                      type="button"
                                      onClick={() =>
                                        setMetricEntries((entries) => ({
                                          ...entries,
                                          [metric.id]: {
                                            ...current,
                                            targetMatrix: {
                                              ...current.targetMatrix,
                                              [year]: option,
                                            },
                                          },
                                        }))
                                      }
                                      className={`flex-1 rounded-sm px-2 py-1 text-[11px] font-semibold uppercase transition ${
                                        (current.targetMatrix[year] ?? "") === option
                                          ? "bg-primary-50 text-primary-800"
                                          : "text-slate-600 hover:bg-slate-100"
                                      }`}
                                    >
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              ) : metric.inputSchema?.valueType === "enum" ? (
                                <div className="flex flex-wrap gap-1">
                                  {enumOptions.map((option) => (
                                    <button
                                      key={`${metric.id}-target-matrix-opt-${year}-${option}`}
                                      type="button"
                                      onClick={() =>
                                        setMetricEntries((entries) => ({
                                          ...entries,
                                          [metric.id]: {
                                            ...current,
                                            targetMatrix: {
                                              ...current.targetMatrix,
                                              [year]: option,
                                            },
                                          },
                                        }))
                                      }
                                      className={`rounded-sm border px-2 py-1 text-[11px] font-semibold transition ${
                                        (current.targetMatrix[year] ?? "") === option
                                          ? "border-primary bg-primary-50 text-primary-800"
                                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                                      }`}
                                    >
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <input
                                  type={metric.inputSchema?.valueType === "text" ? "text" : "number"}
                                  step={metric.inputSchema?.valueType === "integer" ? "1" : "0.01"}
                                  min={metric.inputSchema?.valueType === "text" ? undefined : 0}
                                  value={current.targetMatrix[year] ?? ""}
                                  onChange={(event) =>
                                    setMetricEntries((entries) => ({
                                      ...entries,
                                      [metric.id]: {
                                        ...current,
                                        targetMatrix: {
                                          ...current.targetMatrix,
                                          [year]: event.target.value,
                                        },
                                      },
                                    }))
                                  }
                                  className="w-full rounded-sm border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                                />
                              )}
                            </label>
                          ))}
                        </div>
                      ) : type === "yes_no" ? (
                        <div className="inline-flex w-full rounded-sm border border-slate-200 bg-white p-0.5">
                          {(["yes", "no"] as const).map((option) => (
                            <button
                              key={`${metric.id}-target-bool-${option}`}
                              type="button"
                              onClick={() =>
                                setMetricEntries((entries) => ({
                                  ...entries,
                                  [metric.id]: {
                                    ...current,
                                    targetBoolean: normalizeBooleanInput(option),
                                  },
                                }))
                              }
                              className={`flex-1 rounded-sm px-2 py-1 text-xs font-semibold uppercase transition ${
                                current.targetBoolean === option
                                  ? "bg-primary-50 text-primary-800"
                                  : "text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      ) : type === "enum" ? (
                        <div className="flex flex-wrap gap-1">
                          {enumOptions.map((option) => (
                            <button
                              key={`${metric.id}-target-opt-${option}`}
                              type="button"
                              onClick={() =>
                                setMetricEntries((entries) => ({
                                  ...entries,
                                  [metric.id]: {
                                    ...current,
                                    targetEnum: option,
                                  },
                                }))
                              }
                              className={`rounded-sm border px-2 py-1 text-xs font-semibold transition ${
                                current.targetEnum === option
                                  ? "border-primary bg-primary-50 text-primary-800"
                                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      ) : type === "text" ? (
                        <input
                          type="text"
                          value={current.targetText}
                          onChange={(event) =>
                            setMetricEntries((entries) => ({
                              ...entries,
                              [metric.id]: {
                                ...current,
                                targetText: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-sm border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                        />
                      ) : (
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
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {type === "yearly_matrix" ? (
                        <div className="grid gap-1.5">
                          {years.map((year) => (
                            <label key={`${metric.id}-actual-${year}`} className="grid grid-cols-[82px_1fr] items-center gap-2">
                              <span className="text-[11px] font-semibold text-slate-500">{year}</span>
                              {metric.inputSchema?.valueType === "yes_no" ? (
                                <div className="inline-flex w-full rounded-sm border border-slate-200 bg-white p-0.5">
                                  {(["yes", "no"] as const).map((option) => (
                                    <button
                                      key={`${metric.id}-actual-${year}-${option}`}
                                      type="button"
                                      onClick={() =>
                                        setMetricEntries((entries) => ({
                                          ...entries,
                                          [metric.id]: {
                                            ...current,
                                            actualMatrix: {
                                              ...current.actualMatrix,
                                              [year]: option,
                                            },
                                          },
                                        }))
                                      }
                                      className={`flex-1 rounded-sm px-2 py-1 text-[11px] font-semibold uppercase transition ${
                                        (current.actualMatrix[year] ?? "") === option
                                          ? "bg-primary-50 text-primary-800"
                                          : "text-slate-600 hover:bg-slate-100"
                                      }`}
                                    >
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              ) : metric.inputSchema?.valueType === "enum" ? (
                                <div className="flex flex-wrap gap-1">
                                  {enumOptions.map((option) => (
                                    <button
                                      key={`${metric.id}-actual-matrix-opt-${year}-${option}`}
                                      type="button"
                                      onClick={() =>
                                        setMetricEntries((entries) => ({
                                          ...entries,
                                          [metric.id]: {
                                            ...current,
                                            actualMatrix: {
                                              ...current.actualMatrix,
                                              [year]: option,
                                            },
                                          },
                                        }))
                                      }
                                      className={`rounded-sm border px-2 py-1 text-[11px] font-semibold transition ${
                                        (current.actualMatrix[year] ?? "") === option
                                          ? "border-primary bg-primary-50 text-primary-800"
                                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                                      }`}
                                    >
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <input
                                  type={metric.inputSchema?.valueType === "text" ? "text" : "number"}
                                  step={metric.inputSchema?.valueType === "integer" ? "1" : "0.01"}
                                  min={metric.inputSchema?.valueType === "text" ? undefined : 0}
                                  value={current.actualMatrix[year] ?? ""}
                                  onChange={(event) =>
                                    setMetricEntries((entries) => ({
                                      ...entries,
                                      [metric.id]: {
                                        ...current,
                                        actualMatrix: {
                                          ...current.actualMatrix,
                                          [year]: event.target.value,
                                        },
                                      },
                                    }))
                                  }
                                  className="w-full rounded-sm border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                                />
                              )}
                            </label>
                          ))}
                        </div>
                      ) : type === "yes_no" ? (
                        <div className="inline-flex w-full rounded-sm border border-slate-200 bg-white p-0.5">
                          {(["yes", "no"] as const).map((option) => (
                            <button
                              key={`${metric.id}-actual-bool-${option}`}
                              type="button"
                              onClick={() =>
                                setMetricEntries((entries) => ({
                                  ...entries,
                                  [metric.id]: {
                                    ...current,
                                    actualBoolean: normalizeBooleanInput(option),
                                  },
                                }))
                              }
                              className={`flex-1 rounded-sm px-2 py-1 text-xs font-semibold uppercase transition ${
                                current.actualBoolean === option
                                  ? "bg-primary-50 text-primary-800"
                                  : "text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      ) : type === "enum" ? (
                        <div className="flex flex-wrap gap-1">
                          {enumOptions.map((option) => (
                            <button
                              key={`${metric.id}-actual-opt-${option}`}
                              type="button"
                              onClick={() =>
                                setMetricEntries((entries) => ({
                                  ...entries,
                                  [metric.id]: {
                                    ...current,
                                    actualEnum: option,
                                  },
                                }))
                              }
                              className={`rounded-sm border px-2 py-1 text-xs font-semibold transition ${
                                current.actualEnum === option
                                  ? "border-primary bg-primary-50 text-primary-800"
                                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      ) : type === "text" ? (
                        <input
                          type="text"
                          value={current.actualText}
                          onChange={(event) =>
                            setMetricEntries((entries) => ({
                              ...entries,
                              [metric.id]: {
                                ...current,
                                actualText: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-sm border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                        />
                      ) : (
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
                      )}
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
              {orderedComplianceMetrics.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-sm text-slate-500">
                    No required compliance indicators found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {submitError && (
          <p className="rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">{submitError}</p>
        )}
        {saveMessage && (
          <p className="rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">{saveMessage}</p>
        )}
        {error && (
          <p className="rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={isSaving || isLoading || complianceMetrics.length === 0}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <Target className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save Compliance Draft"}
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
                              className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              <Send className="h-3.5 w-3.5" />
                              Submit
                            </button>
                          ) : submission.status === "validated" ? (
                            <span className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-700">
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
                                        <td className="px-2 py-2 text-right text-xs text-slate-700">{entry.targetDisplay ?? entry.targetValue}</td>
                                        <td className="px-2 py-2 text-right text-xs text-slate-700">{entry.actualDisplay ?? entry.actualValue}</td>
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
                                        {entry.action} - {formatDateTime(entry.createdAt)}
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





