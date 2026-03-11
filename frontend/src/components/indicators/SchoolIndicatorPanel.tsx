import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Edit2, History, RefreshCw, Send, Target, XCircle } from "lucide-react";
import { useIndicatorData } from "@/context/IndicatorData";
import type {
  FormSubmissionHistoryEntry,
  IndicatorMetric,
  IndicatorSubmission,
  IndicatorSubmissionItem,
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
  mode: "actual_only" | "target_actual";
  metricCodes: string[];
}

type IndicatorWorkflowStatusFilter = "all" | "draft" | "submitted" | "returned" | "validated" | "overdue";

interface SchoolIndicatorPanelProps {
  statusFilter?: IndicatorWorkflowStatusFilter;
  academicYearFilter?: string;
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

const KEY_PERFORMANCE_METRIC_CODES = [
  "NER",
  "RR",
  "DR",
  "TR",
  "NIR",
  "PR",
  "ALS_COMPLETER_PCT",
  "GPI",
  "IQR",
  "CR",
  "CSR",
  "PLM_NEARLY_PROF",
  "PLM_PROF",
  "PLM_HIGH_PROF",
  "AE_PASS_RATE",
  "VIOLENCE_REPORT_RATE",
  "LEARNER_SATISFACTION",
  "RIGHTS_AWARENESS",
  "RBE_MANIFEST",
];

const COMPLIANCE_CATEGORIES: ComplianceCategory[] = [
  {
    id: "school_achievements_learning_outcomes",
    label: "SCHOOL'S ACHIEVEMENTS AND LEARNING OUTCOMES",
    mode: "actual_only",
    metricCodes: SCHOOL_ACHIEVEMENTS_METRIC_CODES,
  },
  {
    id: "key_performance_indicators",
    label: "KEY PERFORMANCE INDICATORS",
    mode: "target_actual",
    metricCodes: KEY_PERFORMANCE_METRIC_CODES,
  },
];

const COMPLIANCE_METRIC_CODES = new Set(COMPLIANCE_CATEGORIES.flatMap((category) => category.metricCodes));
const TARGET_ACTUAL_METRIC_CODES = new Set(KEY_PERFORMANCE_METRIC_CODES);
const BASE_SCHOOL_YEAR_START = 2022;
const SCHOOL_YEAR_WINDOW_SIZE = 5;
const SCHOOL_YEAR_START_MONTH = 6;
const INDICATOR_DRAFT_STORAGE_KEY = "cspams.schoolhead.indicator.autosave.v1";

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
  NER: "Net Enrollment Rate",
  RR: "Retention Rate",
  DR: "Drop-out Rate",
  TR: "Transition Rate",
  NIR: "Net Intake Rate",
  PR: "Participation Rate",
  ALS_COMPLETER_PCT: "ALS Completion Rate",
  GPI: "Gender Parity Index (GPI)",
  IQR: "Interquartile Ratio",
  CR: "Completion Rate",
  CSR: "Cohort Survival Rate",
  PLM_NEARLY_PROF: "Learning Mastery: Nearly Proficient (50%-74%)",
  PLM_PROF: "Learning Mastery: Proficient (75%-89%)",
  PLM_HIGH_PROF: "Learning Mastery: Highly Proficient (90%-100%)",
  AE_PASS_RATE: "A&E Test Pass Rate",
  VIOLENCE_REPORT_RATE: "Learners Reporting School Violence",
  LEARNER_SATISFACTION: "Learner Satisfaction",
  RIGHTS_AWARENESS: "Learners Aware of Education Rights",
  RBE_MANIFEST: "Schools/LCs Manifesting RBE Indicators",
};

function workflowTone(status: string): string {
  if (status === "validated") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (status === "submitted") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (status === "returned") return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
  return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
}

function workflowLabel(status: string, fallback: string): string {
  if (status === "draft") return "Draft";
  if (status === "submitted") return "Submitted";
  if (status === "validated") return "Validated";
  if (status === "returned") return "Needs Revision";
  if (status === "overdue") return "Overdue";
  return fallback || status;
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

function metricDisplayLabel(metric: IndicatorMetric): string {
  return METRIC_LABEL_OVERRIDES[metric.code] ?? metric.name;
}

function metricIsAutoCalculated(metric: IndicatorMetric): boolean {
  return Boolean(metric.isAutoCalculated);
}

function categoryTabLabel(category: ComplianceCategory): string {
  if (category.id === "school_achievements_learning_outcomes") return "School Achievements";
  if (category.id === "key_performance_indicators") return "Key Performance";
  return category.label;
}

function buildFallbackSchoolYears(now: Date = new Date()): string[] {
  const currentSchoolYearStart =
    now.getMonth() + 1 >= SCHOOL_YEAR_START_MONTH ? now.getFullYear() : now.getFullYear() - 1;
  const windowEndYear = Math.max(BASE_SCHOOL_YEAR_START + SCHOOL_YEAR_WINDOW_SIZE - 1, currentSchoolYearStart);
  const windowStartYear = windowEndYear - (SCHOOL_YEAR_WINDOW_SIZE - 1);

  return Array.from({ length: SCHOOL_YEAR_WINDOW_SIZE }, (_, offset) => {
    const fromYear = windowStartYear + offset;
    return `${fromYear}-${fromYear + 1}`;
  });
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

function normalizeBooleanInput(value: unknown): "" | "yes" | "no" {
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(normalized)) {
    return "yes";
  }
  if (["no", "n", "false", "0"].includes(normalized)) {
    return "no";
  }

  return "";
}

function extractTypedScalar(value: Record<string, unknown> | null | undefined): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const scalar = (value as { value?: unknown }).value;
  if (scalar === null || scalar === undefined) {
    return "";
  }

  return String(scalar);
}

function extractTypedMatrix(value: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const values = (value as { values?: unknown }).values;
  if (!values || typeof values !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(values as Record<string, unknown>).map(([year, entry]) => [year, String(entry ?? "")]),
  );
}

function buildEntryFromSubmission(metric: IndicatorMetric, indicator: IndicatorSubmissionItem): MetricEntryValue {
  const entry = buildDefaultEntry(metric);
  entry.remarks = indicator.remarks ?? "";

  const dataType = metricDataType(metric);

  if (dataType === "yearly_matrix") {
    const targetByYear = extractTypedMatrix(indicator.targetTypedValue ?? null);
    const actualByYear = extractTypedMatrix(indicator.actualTypedValue ?? null);
    const metricYearList = metricYears(metric);
    const fallbackYears = [...new Set([...Object.keys(targetByYear), ...Object.keys(actualByYear)])];
    const years = metricYearList.length > 0 ? metricYearList : fallbackYears;

    for (const year of years) {
      entry.targetMatrix[year] = targetByYear[year] ?? "";
      entry.actualMatrix[year] = actualByYear[year] ?? "";
    }

    return entry;
  }

  if (dataType === "yes_no") {
    entry.targetBoolean = normalizeBooleanInput(
      (indicator.targetTypedValue as { value?: unknown } | null | undefined)?.value
        ?? indicator.targetDisplay
        ?? indicator.targetValue,
    );
    entry.actualBoolean = normalizeBooleanInput(
      (indicator.actualTypedValue as { value?: unknown } | null | undefined)?.value
        ?? indicator.actualDisplay
        ?? indicator.actualValue,
    );
    return entry;
  }

  if (dataType === "enum") {
    entry.targetEnum = extractTypedScalar(indicator.targetTypedValue ?? null) || String(indicator.targetDisplay ?? "");
    entry.actualEnum = extractTypedScalar(indicator.actualTypedValue ?? null) || String(indicator.actualDisplay ?? "");
    return entry;
  }

  if (dataType === "text") {
    entry.targetText = extractTypedScalar(indicator.targetTypedValue ?? null) || String(indicator.targetDisplay ?? "");
    entry.actualText = extractTypedScalar(indicator.actualTypedValue ?? null) || String(indicator.actualDisplay ?? "");
    return entry;
  }

  entry.targetValue = Number.isFinite(Number(indicator.targetValue)) ? String(indicator.targetValue) : "";
  entry.actualValue = Number.isFinite(Number(indicator.actualValue)) ? String(indicator.actualValue) : "";
  return entry;
}

export function SchoolIndicatorPanel({
  statusFilter = "all",
  academicYearFilter = "all",
}: SchoolIndicatorPanelProps) {
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
    updateSubmission,
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
  const [showAdvancedInputs, setShowAdvancedInputs] = useState(true);
  const [activeCategoryId, setActiveCategoryId] = useState<string>(COMPLIANCE_CATEGORIES[0]?.id ?? "");
  const [indicatorSearch, setIndicatorSearch] = useState("");
  const [showOnlyMissingRows, setShowOnlyMissingRows] = useState(false);
  const [autosaveAt, setAutosaveAt] = useState<string | null>(null);
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);

  const complianceMetrics = useMemo(
    () => metrics.filter((metric) => COMPLIANCE_METRIC_CODES.has(metric.code)),
    [metrics],
  );
  const complianceMetricsByCode = useMemo(
    () => new Map(complianceMetrics.map((metric) => [metric.code, metric])),
    [complianceMetrics],
  );
  const categoryMetrics = useMemo(
    () =>
      COMPLIANCE_CATEGORIES.map((category) => ({
        ...category,
        metrics: category.metricCodes
          .map((metricCode) => complianceMetricsByCode.get(metricCode))
          .filter((metric): metric is IndicatorMetric => Boolean(metric)),
      })),
    [complianceMetricsByCode],
  );
  const orderedComplianceMetrics = useMemo(
    () => categoryMetrics.flatMap((category) => category.metrics),
    [categoryMetrics],
  );
  const schoolYears = useMemo(() => {
    const metricWithYears = orderedComplianceMetrics.find((metric) => metricYears(metric).length > 0);
    const years = metricWithYears ? metricYears(metricWithYears) : [];
    return years.length > 0 ? years : buildFallbackSchoolYears();
  }, [orderedComplianceMetrics]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(INDICATOR_DRAFT_STORAGE_KEY);
      if (!raw) return;

      const persisted = JSON.parse(raw) as {
        academicYearId?: string;
        notes?: string;
        metricEntries?: MetricEntryState;
        savedAt?: string;
      };

      if (persisted.academicYearId) {
        setAcademicYearId(persisted.academicYearId);
      }
      if (typeof persisted.notes === "string") {
        setNotes(persisted.notes);
      }
      if (persisted.metricEntries && typeof persisted.metricEntries === "object") {
        setMetricEntries((current) => ({ ...current, ...persisted.metricEntries }));
      }
      if (persisted.savedAt) {
        setAutosaveAt(persisted.savedAt);
      }
    } catch {
      // Ignore invalid local autosave payload.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (complianceMetrics.length === 0) return;

    const timer = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      try {
        localStorage.setItem(
          INDICATOR_DRAFT_STORAGE_KEY,
          JSON.stringify({ academicYearId, notes, metricEntries, savedAt }),
        );
        setAutosaveAt(savedAt);
      } catch {
        // Ignore autosave storage failures.
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [academicYearId, notes, metricEntries, complianceMetrics.length]);

  const sortedSubmissions = useMemo(
    () =>
      [...submissions].sort((a, b) => {
        const aDate = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const bDate = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return bDate - aDate;
      }),
    [submissions],
  );
  const filteredSubmissions = useMemo(
    () =>
      sortedSubmissions.filter((submission) => {
        const matchesYear = academicYearFilter === "all" || submission.academicYear?.id === academicYearFilter;
        const normalizedStatus = String(submission.status ?? "").toLowerCase();
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "overdue" ? normalizedStatus === "returned" : normalizedStatus === statusFilter);

        return matchesYear && matchesStatus;
      }),
    [academicYearFilter, sortedSubmissions, statusFilter],
  );
  const visibleCategoryMetrics = showAdvancedInputs ? categoryMetrics : categoryMetrics.slice(0, 1);
  const metricCompletionById = useMemo(() => {
    const map = new Map<string, boolean>();

    for (const metric of orderedComplianceMetrics) {
      const current = metricEntries[metric.id] ?? buildDefaultEntry(metric);
      const years = metricYears(metric);
      const effectiveYears = years.length > 0 ? years : schoolYears;
      if (metricIsAutoCalculated(metric)) {
        map.set(metric.id, true);
        continue;
      }

      const requiresTargetActual = TARGET_ACTUAL_METRIC_CODES.has(metric.code);

      const isComplete =
        effectiveYears.length > 0 &&
        effectiveYears.every((year) => {
          const targetValue = String(current.targetMatrix[year] ?? "").trim();
          const actualValue = String(current.actualMatrix[year] ?? "").trim();

          if (requiresTargetActual) {
            return targetValue.length > 0 && actualValue.length > 0;
          }

          return actualValue.length > 0 || targetValue.length > 0;
        });

      map.set(metric.id, isComplete);
    }

    return map;
  }, [metricEntries, orderedComplianceMetrics, schoolYears]);
  const categoryProgressById = useMemo(() => {
    const map = new Map<string, { total: number; complete: number }>();

    for (const category of categoryMetrics) {
      const total = category.metrics.length;
      const complete = category.metrics.reduce(
        (count, metric) => count + Number(metricCompletionById.get(metric.id) ?? false),
        0,
      );
      map.set(category.id, { total, complete });
    }

    return map;
  }, [categoryMetrics, metricCompletionById]);
  const totalIndicators = orderedComplianceMetrics.length;
  const completeIndicators = useMemo(
    () => orderedComplianceMetrics.reduce((count, metric) => count + Number(metricCompletionById.get(metric.id) ?? false), 0),
    [metricCompletionById, orderedComplianceMetrics],
  );
  const activeCategory = useMemo(
    () => visibleCategoryMetrics.find((category) => category.id === activeCategoryId) ?? visibleCategoryMetrics[0] ?? null,
    [activeCategoryId, visibleCategoryMetrics],
  );
  const activeCategoryProgress = activeCategory
    ? categoryProgressById.get(activeCategory.id) ?? { total: activeCategory.metrics.length, complete: 0 }
    : { total: 0, complete: 0 };
  const filteredActiveMetrics = useMemo(() => {
    if (!activeCategory) return [];

    const normalizedSearch = indicatorSearch.trim().toLowerCase();

    return activeCategory.metrics.filter((metric) => {
      const isComplete = metricCompletionById.get(metric.id) ?? false;
      if (showOnlyMissingRows && isComplete) return false;

      if (!normalizedSearch) return true;

      const searchable = `${metric.code} ${metricDisplayLabel(metric)}`.toLowerCase();
      return searchable.includes(normalizedSearch);
    });
  }, [activeCategory, indicatorSearch, metricCompletionById, showOnlyMissingRows]);

  useEffect(() => {
    if (!activeCategory) return;
    if (activeCategory.id === activeCategoryId) return;
    setActiveCategoryId(activeCategory.id);
  }, [activeCategory, activeCategoryId]);

  const resetForm = () => {
    setEditingSubmissionId(null);
    setNotes("");
    setMetricEntries(() => buildInitialMetricEntries(complianceMetrics, {}));
    setAutosaveAt(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(INDICATOR_DRAFT_STORAGE_KEY);
    }
  };

  const handleEditDraft = (submission: IndicatorSubmission) => {
    const nextAcademicYearId = submission.academicYear?.id ?? "";
    const metricsById = new Map(complianceMetrics.map((metric) => [metric.id, metric]));
    const nextEntries = buildInitialMetricEntries(complianceMetrics, {});

    for (const indicator of submission.indicators) {
      const metricId = indicator.metric?.id;
      if (!metricId) continue;

      const metric = metricsById.get(metricId);
      if (!metric) continue;

      nextEntries[metricId] = buildEntryFromSubmission(metric, indicator);
    }

    setEditingSubmissionId(submission.id);
    setAcademicYearId(nextAcademicYearId);
    setNotes(submission.notes ?? "");
    setMetricEntries(nextEntries);
    setSubmitError("");
    setSaveMessage(`Editing package #${submission.id}.`);
    setExpandedSubmissionId(null);
    setAutosaveAt(null);
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
        const isAutoCalculated = metricIsAutoCalculated(metric);

        if (isAutoCalculated) {
          return {
            metricId: Number(metric.id),
            targetValue: undefined,
            actualValue: undefined,
            target: undefined,
            actual: undefined,
            remarks: value.remarks.trim() || null,
            type,
            requiresTargetActual: false,
            isAutoCalculated: true,
          };
        }

        const requiresTargetActual = TARGET_ACTUAL_METRIC_CODES.has(metric.code);
        let targetPayload: IndicatorTypedValuePayload | undefined;
        let actualPayload: IndicatorTypedValuePayload | undefined;
        let targetValue: number | undefined;
        let actualValue: number | undefined;

        if (type === "currency" || type === "number") {
          if (requiresTargetActual) {
            targetValue = Number(value.targetValue);
            actualValue = Number(value.actualValue);
          } else {
            const singleValue = Number(value.actualValue || value.targetValue);
            targetValue = singleValue;
            actualValue = singleValue;
          }
          targetPayload = type === "currency" ? { amount: targetValue, currency: metric.inputSchema?.currency ?? "PHP" } : undefined;
          actualPayload = type === "currency" ? { amount: actualValue, currency: metric.inputSchema?.currency ?? "PHP" } : undefined;
        } else if (type === "yes_no") {
          const toBooleanValue = (candidate: "" | "yes" | "no"): boolean | undefined => {
            if (candidate === "yes") return true;
            if (candidate === "no") return false;
            return undefined;
          };

          if (requiresTargetActual) {
            targetPayload = { value: toBooleanValue(value.targetBoolean) };
            actualPayload = { value: toBooleanValue(value.actualBoolean) };
          } else {
            const boolValue = toBooleanValue(value.actualBoolean) ?? toBooleanValue(value.targetBoolean);
            targetPayload = { value: boolValue };
            actualPayload = { value: boolValue };
          }
        } else if (type === "enum") {
          if (requiresTargetActual) {
            targetPayload = { value: value.targetEnum.trim() };
            actualPayload = { value: value.actualEnum.trim() };
          } else {
            const enumValue = (value.actualEnum || value.targetEnum || "").trim();
            targetPayload = { value: enumValue };
            actualPayload = { value: enumValue };
          }
        } else if (type === "text") {
          if (requiresTargetActual) {
            targetPayload = { value: value.targetText.trim() };
            actualPayload = { value: value.actualText.trim() };
          } else {
            const textValue = (value.actualText || value.targetText || "").trim();
            targetPayload = { value: textValue };
            actualPayload = { value: textValue };
          }
        } else if (type === "yearly_matrix") {
          const years = metricYears(metric);
          if (requiresTargetActual) {
            const targetMatrixValues = Object.fromEntries(
              years.map((year) => [year, (value.targetMatrix[year] ?? "").trim()]),
            );
            const actualMatrixValues = Object.fromEntries(
              years.map((year) => [year, (value.actualMatrix[year] ?? "").trim()]),
            );

            targetPayload = {
              values: targetMatrixValues,
            };
            actualPayload = {
              values: actualMatrixValues,
            };
          } else {
            const matrixValues = Object.fromEntries(
              years.map((year) => [year, (value.actualMatrix[year] ?? value.targetMatrix[year] ?? "").trim()]),
            );

            targetPayload = {
              values: matrixValues,
            };
            actualPayload = {
              values: matrixValues,
            };
          }
        }

        return {
          metricId: Number(metric.id),
          targetValue,
          actualValue,
          target: targetPayload,
          actual: actualPayload,
          remarks: value.remarks.trim() || null,
          type,
          requiresTargetActual,
          isAutoCalculated: false,
        };
      });

    if (entries.length === 0) {
      setSubmitError("No required compliance indicators are available for this school.");
      return;
    }

    const invalidEntry = entries.find((entry) => {
      if (entry.isAutoCalculated) {
        return false;
      }

      if (entry.type === "number" || entry.type === "currency") {
        if (entry.requiresTargetActual) {
          return Number.isNaN(entry.targetValue ?? Number.NaN) || Number.isNaN(entry.actualValue ?? Number.NaN);
        }
        return Number.isNaN(entry.actualValue ?? Number.NaN);
      }

      if (entry.type === "yes_no") {
        if (entry.requiresTargetActual) {
          return entry.target?.value === undefined || entry.actual?.value === undefined;
        }
        return entry.actual?.value === undefined;
      }

      if (entry.type === "enum" || entry.type === "text") {
        if (entry.requiresTargetActual) {
          return !String(entry.target?.value ?? "").trim() || !String(entry.actual?.value ?? "").trim();
        }
        return !String(entry.actual?.value ?? "").trim();
      }

      if (entry.type === "yearly_matrix") {
        if (entry.requiresTargetActual) {
          const targetValues = Object.values(entry.target?.values ?? {});
          const actualValues = Object.values(entry.actual?.values ?? {});
          return (
            targetValues.length === 0 ||
            actualValues.length === 0 ||
            targetValues.some((value) => String(value).trim() === "") ||
            actualValues.some((value) => String(value).trim() === "")
          );
        }
        const actualValues = Object.values(entry.actual?.values ?? {});
        return actualValues.length === 0 || actualValues.some((value) => String(value).trim() === "");
      }

      return false;
    });

    if (invalidEntry) {
      setSubmitError("Complete all required indicator cells before saving.");
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
      if (editingSubmissionId) {
        const updated = await updateSubmission(editingSubmissionId, payload);
        setSaveMessage(`Draft package #${updated.id} updated.`);
      } else {
        const created = await createSubmission(payload);
        setSaveMessage(`Indicator package #${created.id} created as draft.`);
        resetForm();
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unable to save indicator package.");
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
    <section className="surface-panel animate-fade-slide overflow-hidden rounded-none border-0 shadow-none">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Compliance Indicators</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {completeIndicators}/{totalIndicators} complete
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAdvancedInputs((current) => !current)}
              className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              {showAdvancedInputs ? "Core only" : "All sections"}
            </button>
            <button
              type="button"
              onClick={() => void refreshSubmissions()}
              className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : "Not synced"} |{" "}
          {autosaveAt ? `Saved ${new Date(autosaveAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not saved"}
        </p>
        <p className="mt-1 text-xs text-primary-700">
          Key performance indicators are auto-calculated from synchronized school records. Review entries, then save draft.
        </p>
      </div>

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
              placeholder="Optional note"
              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {visibleCategoryMetrics.map((category) => {
              const progress = categoryProgressById.get(category.id) ?? { total: category.metrics.length, complete: 0 };
              const isActive = activeCategory?.id === category.id;

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategoryId(category.id)}
                  className={`inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? "border-primary-300 bg-primary-50 text-primary-700"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {categoryTabLabel(category)}
                  <span className="rounded-sm border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-600">
                    {progress.complete}/{progress.total}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <input
              type="search"
              value={indicatorSearch}
              onChange={(event) => setIndicatorSearch(event.target.value)}
              placeholder="Search indicator"
              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
            <button
              type="button"
              onClick={() => setShowOnlyMissingRows((current) => !current)}
              className={`rounded-sm border px-3 py-2 text-xs font-semibold transition ${
                showOnlyMissingRows
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {showOnlyMissingRows ? "All rows" : "Missing only"}
            </button>
          </div>

          {activeCategory && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{activeCategory.label}</h3>
                <span className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
                  {activeCategoryProgress.complete}/{activeCategoryProgress.total} complete
                </span>
              </div>
              <div className="overflow-x-auto rounded-sm border border-slate-200">
                <table className={`${activeCategory.mode === "target_actual" ? "min-w-[1240px]" : "min-w-[980px]"} w-full border-collapse`}>
                  <thead>
                    <tr className="bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                      <th rowSpan={2} className="sticky left-0 z-20 min-w-[280px] border border-slate-300 bg-slate-100 px-3 py-2 text-left">
                        Indicators
                      </th>
                      {activeCategory.mode === "target_actual" ? (
                        schoolYears.map((year) => (
                          <th key={`${activeCategory.id}-${year}`} colSpan={2} className="border border-slate-300 px-2 py-2 text-center">
                            {year}
                          </th>
                        ))
                      ) : (
                        <th colSpan={schoolYears.length} className="border border-slate-300 px-3 py-2 text-center">
                          School Year
                        </th>
                      )}
                    </tr>
                    <tr className="bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                      {activeCategory.mode === "target_actual"
                        ? schoolYears.flatMap((year) => [
                            <th key={`${activeCategory.id}-${year}-target`} className="border border-slate-300 px-2 py-2 text-center">
                              Target
                            </th>,
                            <th key={`${activeCategory.id}-${year}-actual`} className="border border-slate-300 px-2 py-2 text-center">
                              Actual
                            </th>,
                          ])
                        : schoolYears.map((year) => (
                            <th key={`${activeCategory.id}-${year}`} className="border border-slate-300 px-2 py-2 text-center">
                              {year}
                            </th>
                          ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActiveMetrics.map((metric) => {
                      const current = metricEntries[metric.id] ?? buildDefaultEntry(metric);
                      const valueType = String(metric.inputSchema?.valueType ?? "number").toLowerCase();
                      const enumOptions = Array.isArray(metric.inputSchema?.options)
                        ? metric.inputSchema.options.map((option) => String(option))
                        : [];
                      const numericInput = ["number", "integer", "percentage", "currency"].includes(valueType);
                      const selectOptions =
                        valueType === "yes_no"
                          ? ["Yes", "No"]
                          : valueType === "enum"
                            ? enumOptions.length > 0
                              ? enumOptions
                              : metric.code === "FENCE_STATUS"
                                ? ["Evident", "Partially", "Not Evident"]
                                : []
                            : [];
                      const useSelectInput = selectOptions.length > 0;
                      const isComplete = metricCompletionById.get(metric.id) ?? false;
                      const isAutoCalculated = metricIsAutoCalculated(metric);
                      const baseRowTone =
                        metric.code === "IMETA_HEAD_NAME"
                          ? "bg-primary-50"
                          : metric.code === "IMETA_ENROLL_TOTAL"
                            ? "bg-rose-50"
                            : "";
                      const statusRowTone = isComplete ? "" : "bg-amber-50/50";
                      const rowTone = `${baseRowTone} ${statusRowTone}`.trim();
                      const stickyTone = rowTone || "bg-white";

                      return (
                        <tr key={`${activeCategory.id}-${metric.id}`} className={rowTone}>
                          <td className={`sticky left-0 z-10 min-w-[280px] max-w-[320px] border border-slate-300 px-3 py-2 align-top ${stickyTone}`}>
                            <p className="text-[13px] font-semibold leading-5 text-slate-900 break-words">{metricDisplayLabel(metric)}</p>
                            <p className="mt-1 text-[11px] font-medium text-slate-600">
                              Status: {isComplete ? "Complete" : "Pending"}
                            </p>
                            {isAutoCalculated && (
                              <p className="mt-0.5 text-[11px] font-medium text-primary-700">
                                Value source: Auto-calculated
                              </p>
                            )}
                          </td>
                          {schoolYears.map((year) => {
                            const placeholder =
                              valueType === "yes_no"
                                ? "Yes/No"
                                : valueType === "enum"
                                  ? enumOptions.join(" / ")
                                  : "";

                            if (isAutoCalculated) {
                              if (activeCategory.mode !== "target_actual") {
                                return (
                                  <td key={`${metric.id}-${year}-auto`} className="border border-slate-300 bg-primary-50/40 p-1.5 text-center align-middle">
                                    <span className="text-[11px] font-semibold text-primary-700">Auto</span>
                                  </td>
                                );
                              }

                              return (
                                <Fragment key={`${metric.id}-${year}-auto`}>
                                  <td className="border border-slate-300 bg-primary-50/40 p-1.5 text-center align-middle">
                                    <span className="text-[11px] font-semibold text-primary-700">Auto</span>
                                  </td>
                                  <td className="border border-slate-300 bg-primary-50/40 p-1.5 text-center align-middle">
                                    <span className="text-[11px] font-semibold text-primary-700">Auto</span>
                                  </td>
                                </Fragment>
                              );
                            }

                            if (activeCategory.mode !== "target_actual") {
                              return (
                                <td key={`${metric.id}-${year}`} className="border border-slate-300 p-1.5 align-middle">
                                  {useSelectInput ? (
                                    <select
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
                                            targetMatrix: {
                                              ...current.targetMatrix,
                                              [year]: event.target.value,
                                            },
                                          },
                                        }))
                                      }
                                      className="w-full rounded-sm border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                                    >
                                      <option value="">Select</option>
                                      {selectOptions.map((option) => (
                                        <option key={`${metric.id}-${year}-single-${option}`} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type={numericInput ? "number" : "text"}
                                      step={valueType === "integer" ? "1" : "0.01"}
                                      min={numericInput ? 0 : undefined}
                                      placeholder={placeholder}
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
                                </td>
                              );
                            }

                            return (
                              <Fragment key={`${metric.id}-${year}`}>
                                <td className="border border-slate-300 p-1.5 align-middle">
                                  {useSelectInput ? (
                                    <select
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
                                    >
                                      <option value="">Select</option>
                                      {selectOptions.map((option) => (
                                        <option key={`${metric.id}-${year}-target-${option}`} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type={numericInput ? "number" : "text"}
                                      step={valueType === "integer" ? "1" : "0.01"}
                                      min={numericInput ? 0 : undefined}
                                      placeholder={placeholder}
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
                                </td>
                                <td className="border border-slate-300 p-1.5 align-middle">
                                  {useSelectInput ? (
                                    <select
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
                                    >
                                      <option value="">Select</option>
                                      {selectOptions.map((option) => (
                                        <option key={`${metric.id}-${year}-actual-${option}`} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type={numericInput ? "number" : "text"}
                                      step={valueType === "integer" ? "1" : "0.01"}
                                      min={numericInput ? 0 : undefined}
                                      placeholder={placeholder}
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
                                </td>
                              </Fragment>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {activeCategory.metrics.length === 0 && (
                      <tr>
                        <td
                          colSpan={activeCategory.mode === "target_actual" ? schoolYears.length * 2 + 1 : schoolYears.length + 1}
                          className="border border-slate-300 px-2 py-6 text-center text-sm text-slate-500"
                        >
                          No required compliance indicators found.
                        </td>
                      </tr>
                    )}
                    {activeCategory.metrics.length > 0 && filteredActiveMetrics.length === 0 && (
                      <tr>
                        <td
                          colSpan={activeCategory.mode === "target_actual" ? schoolYears.length * 2 + 1 : schoolYears.length + 1}
                          className="border border-slate-300 px-2 py-6 text-center text-sm text-slate-500"
                        >
                          No indicators match the current filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {submitError && <p className="rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{submitError}</p>}
        {saveMessage && (
          <p className="rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">{saveMessage}</p>
        )}
        {error && <p className="rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
        {editingSubmissionId && (
          <p className="rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
            Editing package #{editingSubmissionId}. Save draft to update this package.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={isSaving || isLoading || complianceMetrics.length === 0}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Target className="h-4 w-4" />
            {isSaving ? "Saving..." : editingSubmissionId ? "Update Draft" : "Save Draft"}
          </button>
          {editingSubmissionId && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-2 rounded-sm border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Cancel Edit
            </button>
          )}
        </div>
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
              {filteredSubmissions.map((submission) => {
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
                          {workflowLabel(submission.status, submission.statusLabel)}
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
                            <>
                              <button
                                type="button"
                                onClick={() => handleEditDraft(submission)}
                                disabled={isSaving}
                                className={`inline-flex items-center gap-1 rounded-sm border px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                                  editingSubmissionId === submission.id
                                    ? "border-primary-300 bg-primary-100 text-primary-800"
                                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                                }`}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                                {editingSubmissionId === submission.id ? "Editing" : "Edit Draft"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleSubmitToMonitor(submission)}
                                disabled={isSaving}
                                className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                <Send className="h-3.5 w-3.5" />
                                Submit
                              </button>
                            </>
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
              {filteredSubmissions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2 py-8 text-center text-sm text-slate-500">
                    No indicator packages match the current context.
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
