import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Edit2, History, Send, Target, XCircle } from "lucide-react";
import { FileUploadField } from "@/components/indicators/FileUploadField";
import { useData } from "@/context/Data";
import { useIndicatorData } from "@/context/IndicatorData";
import { useStudentData } from "@/context/StudentData";
import { useTeacherData } from "@/context/TeacherData";
import type {
  AcademicYearOption,
  FormSubmissionHistoryEntry,
  IndicatorMetric,
  IndicatorSubmission,
  IndicatorSubmissionItem,
  IndicatorSubmissionPayload,
  IndicatorSubmissionFileType,
  IndicatorTypedValuePayload,
  MetricInputSchema,
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

type IndicatorWorkflowStatusFilter = "all" | "draft" | "submitted" | "returned" | "validated";

interface SchoolIndicatorPanelProps {
  statusFilter?: IndicatorWorkflowStatusFilter;
  academicYearFilter?: string;
}

interface MissingFieldTarget {
  key: string;
  categoryId: string;
  categoryLabel: string;
  metricId: string;
  metricCode: string;
  metricLabel: string;
  year: string;
  inputKind: "target" | "actual" | "value";
  cellId: string;
}

interface LocalDraftSnapshot {
  academicYearId: string;
  notes: string;
  metricEntries: MetricEntryState;
  savedAt: string | null;
  editingSubmissionId: string | null;
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
const SYNC_LOCKED_METRIC_CODES = new Set([
  "IMETA_ENROLL_TOTAL",
  "TEACHERS_TOTAL",
  "TEACHERS_MALE",
  "TEACHERS_FEMALE",
]);
const BASE_SCHOOL_YEAR_START = 2025;
const SCHOOL_YEAR_WINDOW_SIZE = 5;
const SCHOOL_YEAR_START_MONTH = 6;
const INDICATOR_DRAFT_STORAGE_KEY = "cspams.schoolhead.indicator.autosave.v1";
const ALL_RECORDS_YEAR_ID = "__all_records__";
const BMEF_TAB_ID = "bmef_upload";
const SMEA_TAB_ID = "smea_upload";
// NEW 2026 COMPLIANCE UI: BMEF tab replaces TARGETS-MET
// 4-tab layout (School Achievements | Key Performance | BMEF | SMEA)
// Monitor & School Head views updated for DepEd standards

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

const FALLBACK_TEXT_METRIC_CODES = new Set<string>(["IMETA_HEAD_NAME"]);
const FALLBACK_YES_NO_METRIC_CODES = new Set<string>([
  "INTERNET_ACCESS",
  "ELECTRICITY",
  "ICT_LAB",
  "SCIENCE_LAB",
]);
const FALLBACK_ENUM_OPTIONS_BY_CODE: Record<string, string[]> = {
  IMETA_SBM_LEVEL: ["Level I", "Level II", "Level III"],
  FENCE_STATUS: ["Evident", "Partially Evident", "Not Evident"],
};

function buildFallbackComplianceMetrics(): IndicatorMetric[] {
  let syntheticId = 900000;

  return COMPLIANCE_CATEGORIES.flatMap((category) =>
    category.metricCodes.map((metricCode) => {
      const normalizedCode = normalizeMetricCode(metricCode);
      const enumOptions = FALLBACK_ENUM_OPTIONS_BY_CODE[normalizedCode];
      const dataType: MetricDataType =
        TARGET_ACTUAL_METRIC_CODES.has(normalizedCode)
          ? "number"
          : enumOptions
            ? "enum"
            : FALLBACK_YES_NO_METRIC_CODES.has(normalizedCode)
              ? "yes_no"
              : FALLBACK_TEXT_METRIC_CODES.has(normalizedCode)
                ? "text"
                : "number";

      const inputSchema: MetricInputSchema | null =
        dataType === "enum"
          ? { options: enumOptions }
          : dataType === "yes_no"
            ? { valueType: "yes_no" }
            : dataType === "number"
              ? { valueType: "number" }
              : null;

      syntheticId += 1;

      return {
        id: String(syntheticId),
        code: normalizedCode,
        name: METRIC_LABEL_OVERRIDES[normalizedCode] ?? normalizedCode,
        category: category.id,
        framework: "imeta",
        dataType,
        inputSchema,
        unit: null,
        sortOrder: syntheticId,
        isAutoCalculated: false,
      } satisfies IndicatorMetric;
    }),
  );
}

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

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
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

function normalizeMetricCode(code: string | null | undefined): string {
  return String(code ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function metricYears(metric: IndicatorMetric): string[] {
  return Array.isArray(metric.inputSchema?.years) ? metric.inputSchema?.years ?? [] : [];
}

function resolveMetricYearsInScope(metric: IndicatorMetric, scopeYears: string[]): string[] {
  const schemaYears = metricYears(metric);
  const scopedYears = schemaYears.length > 0 ? schemaYears.filter((year) => scopeYears.includes(year)) : scopeYears;
  return scopedYears.length > 0 ? scopedYears : scopeYears;
}

function metricDisplayLabel(metric: IndicatorMetric): string {
  return METRIC_LABEL_OVERRIDES[normalizeMetricCode(metric.code)] ?? metric.name;
}

function metricIsAutoCalculated(metric: IndicatorMetric): boolean {
  return Boolean(metric.isAutoCalculated);
}

function metricUsesSyncedLockedTotals(metric: IndicatorMetric): boolean {
  return SYNC_LOCKED_METRIC_CODES.has(normalizeMetricCode(metric.code));
}

function categoryTabLabel(category: ComplianceCategory): string {
  if (category.id === "school_achievements_learning_outcomes") return "School Achievements";
  if (category.id === "key_performance_indicators") return "Key Performance";
  return category.label;
}

function currentSchoolYearStart(now: Date = new Date()): number {
  return now.getMonth() + 1 >= SCHOOL_YEAR_START_MONTH ? now.getFullYear() : now.getFullYear() - 1;
}

function buildFallbackSchoolYears(now: Date = new Date()): string[] {
  const windowEndYear = Math.max(BASE_SCHOOL_YEAR_START + SCHOOL_YEAR_WINDOW_SIZE - 1, currentSchoolYearStart(now));
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

function normalizeSchoolYearLabel(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const exact = text.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (exact) {
    return `${exact[1]}-${exact[2]}`;
  }

  const embedded = text.match(/(\d{4})\D+(\d{4})/);
  if (embedded) {
    return `${embedded[1]}-${embedded[2]}`;
  }

  return null;
}

function schoolYearStartValue(value: string | null | undefined): number | null {
  const normalized = normalizeSchoolYearLabel(value);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d{4})-(\d{4})$/);
  if (!match) {
    return null;
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end !== start + 1) {
    return null;
  }

  return start;
}

function sortSchoolYearsAscending(years: Iterable<string>): string[] {
  return [...new Set(Array.from(years, (year) => String(year).trim()).filter((year) => year.length > 0))]
    .sort((a, b) => {
      const aStart = schoolYearStartValue(a);
      const bStart = schoolYearStartValue(b);

      if (aStart !== null && bStart !== null) {
        return aStart - bStart;
      }
      if (aStart !== null) {
        return -1;
      }
      if (bStart !== null) {
        return 1;
      }

      return a.localeCompare(b);
    });
}

function hasMeaningfulMetricEntries(entries: MetricEntryState | undefined): boolean {
  if (!entries || typeof entries !== "object") {
    return false;
  }

  return Object.values(entries).some((entry) => {
    if (entry.targetValue.trim() !== "" || entry.actualValue.trim() !== "") return true;
    if (entry.targetText.trim() !== "" || entry.actualText.trim() !== "") return true;
    if (entry.targetBoolean !== "" || entry.actualBoolean !== "") return true;
    if (entry.targetEnum.trim() !== "" || entry.actualEnum.trim() !== "") return true;
    if (entry.remarks.trim() !== "") return true;
    if (Object.values(entry.targetMatrix).some((value) => String(value ?? "").trim() !== "")) return true;
    if (Object.values(entry.actualMatrix).some((value) => String(value ?? "").trim() !== "")) return true;
    return false;
  });
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

function yearToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function indicatorCellId(metricId: string, year: string, inputKind: "target" | "actual" | "value"): string {
  return `indicator-cell-${metricId}-${yearToken(year)}-${inputKind}`;
}

function collectMissingFieldsForMetric(
  metric: IndicatorMetric,
  entry: MetricEntryValue,
  years: string[],
  categoryId: string,
  categoryLabel: string,
): MissingFieldTarget[] {
  if (metricIsAutoCalculated(metric) || metricUsesSyncedLockedTotals(metric)) {
    return [];
  }

  const requiresTargetActual = TARGET_ACTUAL_METRIC_CODES.has(normalizeMetricCode(metric.code));
  const metricLabel = metricDisplayLabel(metric);
  const missingTargets: MissingFieldTarget[] = [];

  for (const year of years) {
    const targetValue = String(entry.targetMatrix[year] ?? "").trim();
    const actualValue = String(entry.actualMatrix[year] ?? "").trim();

    if (requiresTargetActual) {
      if (targetValue.length === 0) {
        missingTargets.push({
          key: `${metric.id}:${year}:target`,
          categoryId,
          categoryLabel,
          metricId: metric.id,
          metricCode: metric.code,
          metricLabel,
          year,
          inputKind: "target",
          cellId: indicatorCellId(metric.id, year, "target"),
        });
      }
      if (actualValue.length === 0) {
        missingTargets.push({
          key: `${metric.id}:${year}:actual`,
          categoryId,
          categoryLabel,
          metricId: metric.id,
          metricCode: metric.code,
          metricLabel,
          year,
          inputKind: "actual",
          cellId: indicatorCellId(metric.id, year, "actual"),
        });
      }
      continue;
    }

    if (actualValue.length === 0 && targetValue.length === 0) {
      missingTargets.push({
        key: `${metric.id}:${year}:value`,
        categoryId,
        categoryLabel,
        metricId: metric.id,
        metricCode: metric.code,
        metricLabel,
        year,
        inputKind: "value",
        cellId: indicatorCellId(metric.id, year, "value"),
      });
    }
  }

  return missingTargets;
}

function buildMissingReason(
  missingCount: number,
  categoryCounts: Array<{ categoryLabel: string; count: number }>,
): string {
  if (missingCount <= 0) {
    return "";
  }

  if (categoryCounts.length === 0) {
    return `${missingCount} missing required cell${missingCount === 1 ? "" : "s"}.`;
  }

  if (categoryCounts.length === 1) {
    return `${missingCount} missing required cell${missingCount === 1 ? "" : "s"} in ${categoryCounts[0].categoryLabel}.`;
  }

  const top = [...categoryCounts].sort((a, b) => b.count - a.count)[0];
  return `${missingCount} missing required cells. Most are in ${top.categoryLabel} (${top.count}).`;
}

export function SchoolIndicatorPanel({
  statusFilter = "all",
  academicYearFilter = "all",
}: SchoolIndicatorPanelProps) {
  const { records } = useData();
  const { totalCount: syncedStudentCount } = useStudentData();
  const { listTeachers, totalCount: syncedTeacherCount } = useTeacherData();
  const {
    submissions: submissionSnapshot,
    allSubmissions,
    metrics,
    academicYears,
    isLoading,
    isAllSubmissionsLoading,
    isSaving,
    error,
    refreshSubmissions,
    createSubmission,
    updateSubmission,
    uploadSubmissionFile,
    downloadSubmissionFile,
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
  const [showMissingFields, setShowMissingFields] = useState(false);
  const [missingJumpIndex, setMissingJumpIndex] = useState(0);
  const [pendingFocusCellId, setPendingFocusCellId] = useState<string | null>(null);
  const [showSubmissionPanel, setShowSubmissionPanel] = useState(false);
  const [autoMissingAppliedForSubmissionId, setAutoMissingAppliedForSubmissionId] = useState<string | null>(null);
  const [showAllAcademicYears, setShowAllAcademicYears] = useState(false);
  const [showOptionalNotes, setShowOptionalNotes] = useState(false);
  const [pendingLocalDraft, setPendingLocalDraft] = useState<LocalDraftSnapshot | null>(null);
  const [restoreBannerDismissed, setRestoreBannerDismissed] = useState(false);
  const [serverAutosaveAt, setServerAutosaveAt] = useState<string | null>(null);
  const [autosaveError, setAutosaveError] = useState("");
  const [isAutosavingDraft, setIsAutosavingDraft] = useState(false);
  const [teacherSexCounts, setTeacherSexCounts] = useState<{ male: number; female: number }>({ male: 0, female: 0 });
  const [uploadingFileType, setUploadingFileType] = useState<IndicatorSubmissionFileType | null>(null);
  const [uploadErrorByType, setUploadErrorByType] = useState<Record<IndicatorSubmissionFileType, string>>({
    bmef: "",
    smea: "",
  });

  const autosaveInFlightRef = useRef(false);
  const lastAutosaveFingerprintRef = useRef("");
  const categoryRailRef = useRef<HTMLDivElement | null>(null);
  const indicatorTableRef = useRef<HTMLDivElement | null>(null);
  const bmefInputRef = useRef<HTMLInputElement | null>(null);
  const smeaInputRef = useRef<HTMLInputElement | null>(null);

  const metricCatalog = useMemo(
    () => (metrics.length > 0 ? metrics : buildFallbackComplianceMetrics()),
    [metrics],
  );
  const complianceMetrics = useMemo(
    () => metricCatalog.filter((metric) => COMPLIANCE_METRIC_CODES.has(normalizeMetricCode(metric.code))),
    [metricCatalog],
  );
  const complianceMetricsByCode = useMemo(
    () => new Map(complianceMetrics.map((metric) => [normalizeMetricCode(metric.code), metric])),
    [complianceMetrics],
  );
  const categoryMetrics = useMemo(
    () =>
      COMPLIANCE_CATEGORIES.map((category) => ({
        ...category,
        metrics: category.metricCodes
          .map((metricCode) => complianceMetricsByCode.get(normalizeMetricCode(metricCode)))
          .filter((metric): metric is IndicatorMetric => Boolean(metric)),
      })),
    [complianceMetricsByCode],
  );
  const categoryLookupByMetricId = useMemo(() => {
    const lookup = new Map<string, { id: string; label: string }>();
    for (const category of categoryMetrics) {
      const label = categoryTabLabel(category);
      for (const metric of category.metrics) {
        lookup.set(metric.id, { id: category.id, label });
      }
    }
    return lookup;
  }, [categoryMetrics]);
  const orderedComplianceMetrics = useMemo(
    () => categoryMetrics.flatMap((category) => category.metrics),
    [categoryMetrics],
  );
  const eligibleAcademicYears = useMemo(
    () =>
      academicYears.filter((year) => {
        const start = schoolYearStartValue(year.name);
        return start === null || start >= BASE_SCHOOL_YEAR_START;
      }),
    [academicYears],
  );
  const schoolYears = useMemo(() => {
    const metricYearsUnion = orderedComplianceMetrics.flatMap((metric) => metricYears(metric));
    const academicYearLabels = eligibleAcademicYears
      .map((year) => normalizeSchoolYearLabel(year.name))
      .filter((year): year is string => Boolean(year));
    const fallbackYears = buildFallbackSchoolYears();
    const windowStart = schoolYearStartValue(fallbackYears[0] ?? null);
    const windowEnd = schoolYearStartValue(fallbackYears[fallbackYears.length - 1] ?? null);
    const merged = sortSchoolYearsAscending([...metricYearsUnion, ...academicYearLabels, ...fallbackYears]);
    const bounded = merged.filter((year) => {
      const start = schoolYearStartValue(year);
      if (start === null) {
        return false;
      }

      if (start < BASE_SCHOOL_YEAR_START) {
        return false;
      }

      if (windowStart !== null && start < windowStart) {
        return false;
      }

      if (windowEnd !== null && start > windowEnd) {
        return false;
      }

      return true;
    });

    return bounded.length > 0 ? bounded : fallbackYears;
  }, [eligibleAcademicYears, orderedComplianceMetrics]);
  const schoolYearByAcademicYearId = useMemo(() => {
    const map = new Map<string, string>();

    for (const year of eligibleAcademicYears) {
      const normalized = normalizeSchoolYearLabel(year.name);
      if (!normalized) {
        continue;
      }

      const matched = schoolYears.find((candidate) => normalizeSchoolYearLabel(candidate) === normalized);
      if (matched) {
        map.set(year.id, matched);
      }
    }

    return map;
  }, [eligibleAcademicYears, schoolYears]);
  const activeSchoolYears = useMemo(() => {
    if (academicYearId === ALL_RECORDS_YEAR_ID) {
      return schoolYears;
    }

    const selected = schoolYearByAcademicYearId.get(academicYearId);
    if (selected) {
      return [selected];
    }

    const current = eligibleAcademicYears.find((year) => year.isCurrent);
    if (current) {
      const currentYear = schoolYearByAcademicYearId.get(current.id);
      if (currentYear) {
        return [currentYear];
      }
    }

    return schoolYears.length > 0 ? [schoolYears[schoolYears.length - 1]] : [];
  }, [academicYearId, eligibleAcademicYears, schoolYearByAcademicYearId, schoolYears]);
  const requiredSchoolYears = useMemo(() => {
    const currentStart = currentSchoolYearStart();

    return schoolYears.filter((year) => {
      const yearStart = schoolYearStartValue(year);
      if (yearStart === null) {
        return true;
      }
      return yearStart <= currentStart;
    });
  }, [schoolYears]);
  const requiredSchoolYearSet = useMemo(() => new Set(requiredSchoolYears), [requiredSchoolYears]);
  const requiredYearsInScope = useMemo(
    () => activeSchoolYears.filter((year) => requiredSchoolYearSet.has(year)),
    [activeSchoolYears, requiredSchoolYearSet],
  );
  const currentAcademicYearId = useMemo(
    () => eligibleAcademicYears.find((year) => year.isCurrent)?.id ?? "",
    [eligibleAcademicYears],
  );
  const currentSchoolYearLabel = useMemo(() => {
    if (!currentAcademicYearId) {
      return schoolYears[schoolYears.length - 1] ?? null;
    }

    return schoolYearByAcademicYearId.get(currentAcademicYearId) ?? (schoolYears[schoolYears.length - 1] ?? null);
  }, [currentAcademicYearId, schoolYearByAcademicYearId, schoolYears]);
  const autoSyncTargetYears = useMemo(() => {
    // Keep auto-sync scoped to the current school year so historical/future
    // year columns stay aligned with encoded submission values.
    if (!currentSchoolYearLabel) {
      return [] as string[];
    }

    if (academicYearId === ALL_RECORDS_YEAR_ID) {
      return [currentSchoolYearLabel];
    }

    if (academicYearId && academicYearId === currentAcademicYearId) {
      return [currentSchoolYearLabel];
    }

    return [] as string[];
  }, [academicYearId, currentAcademicYearId, currentSchoolYearLabel]);
  const requiredYearsScopeLabel = useMemo(() => {
    if (requiredYearsInScope.length === 0) {
      return "Future years only";
    }
    if (requiredYearsInScope.length === 1) {
      return requiredYearsInScope[0];
    }
    return `${requiredYearsInScope[0]} to ${requiredYearsInScope[requiredYearsInScope.length - 1]}`;
  }, [requiredYearsInScope]);

  const reportRecord = records[0] ?? null;
  const reportStudentTotal = useMemo(() => {
    const sourceValue = reportRecord?.studentCount ?? syncedStudentCount;
    const parsed = Number(sourceValue ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.trunc(parsed);
  }, [reportRecord?.studentCount, syncedStudentCount]);
  const reportTeacherTotal = useMemo(() => {
    const sourceValue = reportRecord?.teacherCount ?? syncedTeacherCount;
    const parsed = Number(sourceValue ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.trunc(parsed);
  }, [reportRecord?.teacherCount, syncedTeacherCount]);

  useEffect(() => {
    setMetricEntries((current) => buildInitialMetricEntries(complianceMetrics, current));
  }, [complianceMetrics]);

  useEffect(() => {
    let isCancelled = false;

    const syncTeacherSexTotals = async () => {
      try {
        const [maleResult, femaleResult] = await Promise.all([
          listTeachers({ page: 1, perPage: 1, sex: "male" }),
          listTeachers({ page: 1, perPage: 1, sex: "female" }),
        ]);

        if (isCancelled) {
          return;
        }

        setTeacherSexCounts({
          male: Math.max(0, Math.trunc(Number(maleResult.meta.total ?? 0))),
          female: Math.max(0, Math.trunc(Number(femaleResult.meta.total ?? 0))),
        });
      } catch {
        if (!isCancelled) {
          setTeacherSexCounts({ male: 0, female: 0 });
        }
      }
    };

    void syncTeacherSexTotals();

    return () => {
      isCancelled = true;
    };
  }, [listTeachers, syncedTeacherCount]);

  const autoSyncValueByCode = useMemo<Record<string, number>>(
    () => ({
      IMETA_ENROLL_TOTAL: reportStudentTotal,
      TEACHERS_TOTAL: reportTeacherTotal,
      TEACHERS_MALE: teacherSexCounts.male,
      TEACHERS_FEMALE: teacherSexCounts.female,
    }),
    [reportStudentTotal, reportTeacherTotal, teacherSexCounts.female, teacherSexCounts.male],
  );

  useEffect(() => {
    if (complianceMetrics.length === 0) {
      return;
    }
    if (autoSyncTargetYears.length === 0) {
      return;
    }

    setMetricEntries((current) => {
      let changed = false;
      const next = { ...current };

      for (const metric of complianceMetrics) {
        if (!Object.prototype.hasOwnProperty.call(autoSyncValueByCode, metric.code)) {
          continue;
        }

        const syncedValue = autoSyncValueByCode[metric.code];
        const normalizedValue = String(Math.max(0, Math.trunc(Number(syncedValue ?? 0))));
        const metricScopedYears = metricYears(metric);
        const years =
          metricScopedYears.length > 0
            ? metricScopedYears.filter((year) => autoSyncTargetYears.includes(year))
            : autoSyncTargetYears;
        if (years.length === 0) {
          continue;
        }

        const previousEntry = next[metric.id] ?? buildDefaultEntry(metric);
        const targetMatrix = { ...previousEntry.targetMatrix };
        const actualMatrix = { ...previousEntry.actualMatrix };
        let entryChanged = false;

        for (const year of years) {
          if (targetMatrix[year] !== normalizedValue) {
            targetMatrix[year] = normalizedValue;
            entryChanged = true;
          }
          if (actualMatrix[year] !== normalizedValue) {
            actualMatrix[year] = normalizedValue;
            entryChanged = true;
          }
        }

        if (!entryChanged) {
          continue;
        }

        next[metric.id] = {
          ...previousEntry,
          targetMatrix,
          actualMatrix,
        };
        changed = true;
      }

      return changed ? next : current;
    });
  }, [autoSyncTargetYears, autoSyncValueByCode, complianceMetrics]);

  useEffect(() => {
    if (academicYearId || eligibleAcademicYears.length === 0) {
      return;
    }

    const currentYear = eligibleAcademicYears.find((year) => year.isCurrent);
    setAcademicYearId(currentYear?.id ?? eligibleAcademicYears[0].id);
  }, [academicYearId, eligibleAcademicYears]);

  useEffect(() => {
    if (!academicYearFilter || eligibleAcademicYears.length === 0) {
      return;
    }
    if (academicYearFilter === "all") {
      if (academicYearId !== ALL_RECORDS_YEAR_ID) {
        setAcademicYearId(ALL_RECORDS_YEAR_ID);
      }
      return;
    }

    const directMatch = eligibleAcademicYears.find((year) => year.id === academicYearFilter);
    if (directMatch) {
      if (academicYearId !== directMatch.id) {
        setAcademicYearId(directMatch.id);
      }
      return;
    }

    const normalizedFilter = normalizeSchoolYearLabel(academicYearFilter);
    if (!normalizedFilter) {
      return;
    }

    const normalizedMatch = eligibleAcademicYears.find(
      (year) => normalizeSchoolYearLabel(year.name) === normalizedFilter,
    );
    if (normalizedMatch && academicYearId !== normalizedMatch.id) {
      setAcademicYearId(normalizedMatch.id);
    }
  }, [academicYearFilter, academicYearId, eligibleAcademicYears]);

  useEffect(() => {
    if (!academicYearId || academicYearId === ALL_RECORDS_YEAR_ID) {
      return;
    }

    const exists = eligibleAcademicYears.some((year) => year.id === academicYearId);
    if (exists) {
      return;
    }

    const currentYear = eligibleAcademicYears.find((year) => year.isCurrent);
    const fallback = currentYear?.id ?? eligibleAcademicYears[0]?.id ?? "";
    if (fallback && academicYearId !== fallback) {
      setAcademicYearId(fallback);
    }
  }, [academicYearId, eligibleAcademicYears]);

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
        editingSubmissionId?: string;
      };

      const hasDraft =
        Boolean(persisted.academicYearId)
        || Boolean((persisted.notes ?? "").trim())
        || hasMeaningfulMetricEntries(persisted.metricEntries);

      if (hasDraft) {
        setPendingLocalDraft({
          academicYearId: persisted.academicYearId ?? "",
          notes: typeof persisted.notes === "string" ? persisted.notes : "",
          metricEntries: persisted.metricEntries && typeof persisted.metricEntries === "object" ? persisted.metricEntries : {},
          savedAt: persisted.savedAt ?? null,
          editingSubmissionId: typeof persisted.editingSubmissionId === "string" ? persisted.editingSubmissionId : null,
        });
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
          JSON.stringify({ academicYearId, notes, metricEntries, editingSubmissionId, savedAt }),
        );
        setAutosaveAt(savedAt);
      } catch {
        // Ignore autosave storage failures.
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [academicYearId, notes, metricEntries, editingSubmissionId, complianceMetrics.length]);

  const submissions = useMemo(
    () => (allSubmissions.length > 0 || submissionSnapshot.length === 0 ? allSubmissions : submissionSnapshot),
    [allSubmissions, submissionSnapshot],
  );
  const isSubmissionDataLoading = isLoading || isAllSubmissionsLoading;
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
          normalizedStatus === statusFilter;

        return matchesYear && matchesStatus;
      }),
    [academicYearFilter, sortedSubmissions, statusFilter],
  );
  const latestServerDraft = useMemo(
    () =>
      sortedSubmissions.find((submission) => {
        const status = String(submission.status ?? "").toLowerCase();
        return status === "draft" || status === "returned";
      }) ?? null,
    [sortedSubmissions],
  );
  const latestValidatedSubmission = useMemo(
    () =>
      sortedSubmissions.find(
        (submission) => String(submission.status ?? "").toLowerCase() === "validated",
      ) ?? null,
    [sortedSubmissions],
  );
  const compactAcademicYears = useMemo(() => {
    if (showAllAcademicYears || eligibleAcademicYears.length <= 3) {
      return eligibleAcademicYears;
    }

    const selectedYear = eligibleAcademicYears.find((year) => year.id === academicYearId) ?? null;
    const currentYear = eligibleAcademicYears.find((year) => year.isCurrent) ?? null;
    const candidates = [selectedYear, currentYear, ...eligibleAcademicYears].filter(
      (year): year is AcademicYearOption => Boolean(year),
    );

    const seen = new Set<string>();
    const unique = candidates.filter((year) => {
      if (seen.has(year.id)) return false;
      seen.add(year.id);
      return true;
    });

    return unique.slice(0, 3);
  }, [academicYearId, eligibleAcademicYears, showAllAcademicYears]);
  const hiddenAcademicYearCount = Math.max(0, eligibleAcademicYears.length - compactAcademicYears.length);
  const visibleCategoryMetrics = categoryMetrics;
  const metricCompletionById = useMemo(() => {
    const map = new Map<string, boolean>();

    for (const metric of orderedComplianceMetrics) {
      const current = metricEntries[metric.id] ?? buildDefaultEntry(metric);
      const scopedYears = resolveMetricYearsInScope(metric, activeSchoolYears);
      const requiredYears = scopedYears.filter((year) => requiredSchoolYearSet.has(year));
      if (metricIsAutoCalculated(metric) || metricUsesSyncedLockedTotals(metric)) {
        map.set(metric.id, true);
        continue;
      }

      const requiresTargetActual = TARGET_ACTUAL_METRIC_CODES.has(normalizeMetricCode(metric.code));

      const isComplete =
        requiredYears.length === 0 ||
        requiredYears.every((year) => {
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
  }, [activeSchoolYears, metricEntries, orderedComplianceMetrics, requiredSchoolYearSet]);
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
  const completionPercent = useMemo(
    () => (totalIndicators > 0 ? Math.round((completeIndicators / totalIndicators) * 100) : 0),
    [completeIndicators, totalIndicators],
  );
  const completionBarToneClass = useMemo(() => {
    if (completionPercent >= 80) return "bg-emerald-500";
    if (completionPercent >= 50) return "bg-amber-500";
    return "bg-rose-500";
  }, [completionPercent]);
  const missingFieldTargets = useMemo(() => {
    const targets: MissingFieldTarget[] = [];

    for (const metric of orderedComplianceMetrics) {
      const category = categoryLookupByMetricId.get(metric.id);
      if (!category) {
        continue;
      }

      const current = metricEntries[metric.id] ?? buildDefaultEntry(metric);
      const scopedYears = resolveMetricYearsInScope(metric, activeSchoolYears);
      const requiredYears = scopedYears.filter((year) => requiredSchoolYearSet.has(year));

      targets.push(
        ...collectMissingFieldsForMetric(
          metric,
          current,
          requiredYears,
          category.id,
          category.label,
        ),
      );
    }

    return targets;
  }, [activeSchoolYears, categoryLookupByMetricId, metricEntries, orderedComplianceMetrics, requiredSchoolYearSet]);
  const missingFieldByCellId = useMemo(() => {
    const map = new Map<string, MissingFieldTarget>();
    for (const target of missingFieldTargets) {
      map.set(target.cellId, target);
    }
    return map;
  }, [missingFieldTargets]);
  const missingCountByCategory = useMemo(() => {
    const map = new Map<string, { categoryId: string; categoryLabel: string; count: number }>();

    for (const target of missingFieldTargets) {
      const current = map.get(target.categoryId);
      if (current) {
        current.count += 1;
        continue;
      }

      map.set(target.categoryId, {
        categoryId: target.categoryId,
        categoryLabel: target.categoryLabel,
        count: 1,
      });
    }

    return [...map.values()];
  }, [missingFieldTargets]);
  const submitBlockedReason = useMemo(
    () => buildMissingReason(missingFieldTargets.length, missingCountByCategory),
    [missingCountByCategory, missingFieldTargets.length],
  );
  const firstMissingByCategory = useMemo(() => {
    const map = new Map<string, MissingFieldTarget>();
    for (const target of missingFieldTargets) {
      if (!map.has(target.categoryId)) {
        map.set(target.categoryId, target);
      }
    }
    return map;
  }, [missingFieldTargets]);
  const editingSubmission = useMemo(
    () => sortedSubmissions.find((submission) => submission.id === editingSubmissionId) ?? null,
    [editingSubmissionId, sortedSubmissions],
  );
  const returnedSubmission = useMemo(
    () =>
      (editingSubmission && String(editingSubmission.status ?? "").toLowerCase() === "returned")
        ? editingSubmission
        : sortedSubmissions.find((submission) => String(submission.status ?? "").toLowerCase() === "returned") ?? null,
    [editingSubmission, sortedSubmissions],
  );
  const returnedSubmissionNotes = (returnedSubmission?.reviewNotes ?? "").trim();
  const submissionMissingSummaryById = useMemo(() => {
    const summary = new Map<string, { missingCount: number; reason: string }>();
    const metricsById = new Map(complianceMetrics.map((metric) => [metric.id, metric]));

    for (const submission of sortedSubmissions) {
      const indicatorByMetricId = new Map(
        submission.indicators
          .map((indicator: IndicatorSubmissionItem) => [indicator.metric?.id ?? "", indicator] as const)
          .filter(([metricId]: readonly [string, IndicatorSubmissionItem]) => metricId.length > 0),
      );
      const missingTargets: MissingFieldTarget[] = [];

      for (const metric of orderedComplianceMetrics) {
        const category = categoryLookupByMetricId.get(metric.id);
        if (!category) {
          continue;
        }

        const fallbackMetric = metricsById.get(metric.id) ?? metric;
        const indicator = indicatorByMetricId.get(metric.id);
        const entry = indicator
          ? buildEntryFromSubmission(fallbackMetric, indicator)
          : buildDefaultEntry(fallbackMetric);
        const submissionYear =
          normalizeSchoolYearLabel(submission.academicYear?.name) ??
          (submission.academicYear?.id ? schoolYearByAcademicYearId.get(submission.academicYear.id) ?? null : null);
        const matchedSubmissionYear =
          submissionYear
            ? schoolYears.find((year) => normalizeSchoolYearLabel(year) === submissionYear) ?? null
            : null;
        const submissionYears = matchedSubmissionYear ? [matchedSubmissionYear] : schoolYears;
        const scopedYears = resolveMetricYearsInScope(fallbackMetric, submissionYears);
        const requiredYears = scopedYears.filter((year) => requiredSchoolYearSet.has(year));

        missingTargets.push(
          ...collectMissingFieldsForMetric(
            fallbackMetric,
            entry,
            requiredYears,
            category.id,
            category.label,
          ),
        );
      }

      const perCategory = new Map<string, { categoryLabel: string; count: number }>();
      for (const target of missingTargets) {
        const current = perCategory.get(target.categoryId);
        if (current) {
          current.count += 1;
          continue;
        }
        perCategory.set(target.categoryId, {
          categoryLabel: target.categoryLabel,
          count: 1,
        });
      }

      summary.set(submission.id, {
        missingCount: missingTargets.length,
        reason: buildMissingReason(
          missingTargets.length,
          [...perCategory.values()],
        ),
      });
    }

    return summary;
  }, [categoryLookupByMetricId, complianceMetrics, orderedComplianceMetrics, requiredSchoolYearSet, schoolYearByAcademicYearId, schoolYears, sortedSubmissions]);
  const selectedSubmissionForUploads = useMemo(() => {
    const scopedByYear = academicYearId && academicYearId !== ALL_RECORDS_YEAR_ID
      ? sortedSubmissions.filter((submission) => submission.academicYear?.id === academicYearId)
      : sortedSubmissions;

    return editingSubmission ?? latestServerDraft ?? scopedByYear[0] ?? null;
  }, [academicYearId, editingSubmission, latestServerDraft, sortedSubmissions]);
  const bmefFileEntry = selectedSubmissionForUploads?.files?.bmef ?? null;
  const smeaFileEntry = selectedSubmissionForUploads?.files?.smea ?? null;
  const bmefSubmitted = Boolean(bmefFileEntry?.uploaded);
  const smeaSubmitted = Boolean(smeaFileEntry?.uploaded);
  // NEW 2026 COMPLIANCE UI: BMEF tab replaces TARGETS-MET
  // 4-tab layout (School Achievements | Key Performance | BMEF | SMEA)
  // Monitor & School Head views updated for DepEd standards
  const complianceTabs = useMemo(
    () => [
      ...visibleCategoryMetrics.map((category) => ({
        id: category.id,
        kind: "category" as const,
        label: categoryTabLabel(category),
      })),
      {
        id: BMEF_TAB_ID,
        kind: "upload" as const,
        label: "BMEF",
        uploadType: "bmef" as const,
      },
      {
        id: SMEA_TAB_ID,
        kind: "upload" as const,
        label: "SMEA",
        uploadType: "smea" as const,
      },
    ],
    [visibleCategoryMetrics],
  );
  const activeTab = useMemo(
    () => complianceTabs.find((tab) => tab.id === activeCategoryId) ?? complianceTabs[0] ?? null,
    [activeCategoryId, complianceTabs],
  );
  const activeUploadType = activeTab?.kind === "upload" ? activeTab.uploadType : null;
  const activeCategory = useMemo(
    () => (activeTab?.kind === "category"
      ? visibleCategoryMetrics.find((category) => category.id === activeTab.id) ?? null
      : null),
    [activeTab, visibleCategoryMetrics],
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

  const scrollCategoryRail = useCallback((direction: 1 | -1) => {
    const rail = categoryRailRef.current;
    if (!rail) return;

    rail.scrollBy({
      left: direction * 240,
      behavior: "smooth",
    });
  }, []);

  const handleSelectCategory = useCallback((categoryId: string) => {
    setActiveCategoryId(categoryId);

    const rail = categoryRailRef.current;
    if (!rail) return;

    const targetButton = rail.querySelector<HTMLButtonElement>(`button[data-category-id="${categoryId}"]`);
    targetButton?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, []);

  const handleSlideCategory = useCallback((direction: 1 | -1) => {
    if (complianceTabs.length === 0) {
      return;
    }

    const currentIndex = complianceTabs.findIndex((tab) => tab.id === activeCategoryId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + direction + complianceTabs.length) % complianceTabs.length;
    const nextTab = complianceTabs[nextIndex];
    if (!nextTab) {
      return;
    }

    handleSelectCategory(nextTab.id);
    scrollCategoryRail(direction);
  }, [activeCategoryId, complianceTabs, handleSelectCategory, scrollCategoryRail]);

  const slideIndicatorTable = useCallback((direction: 1 | -1) => {
    const tableContainer = indicatorTableRef.current;
    if (!tableContainer) return;

    const distance = Math.max(280, Math.floor(tableContainer.clientWidth * 0.65));
    tableContainer.scrollBy({
      left: direction * distance,
      behavior: "smooth",
    });
  }, []);

  const handleIndicatorTableWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    const tableContainer = indicatorTableRef.current;
    if (!tableContainer) return;

    // Allow natural vertical scroll for rows; only force horizontal pan when user
    // intentionally pans sideways (trackpad deltaX or Shift+wheel gesture).
    const hasHorizontalIntent = Math.abs(event.deltaX) > 0 || event.shiftKey;
    if (!hasHorizontalIntent) {
      return;
    }

    tableContainer.scrollLeft += event.deltaX + event.deltaY;
    event.preventDefault();
  }, []);

  const handleIndicatorTableKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isTypingTarget(event.target)) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      slideIndicatorTable(-1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      slideIndicatorTable(1);
    }
  }, [slideIndicatorTable]);
  const setMetricMatrixValue = useCallback(
    (metric: IndicatorMetric, year: string, mode: "single" | "target" | "actual", value: string) => {
      setMetricEntries((entries) => {
        const previous = entries[metric.id] ?? buildDefaultEntry(metric);
        const nextEntry: MetricEntryValue = {
          ...previous,
          targetMatrix: { ...previous.targetMatrix },
          actualMatrix: { ...previous.actualMatrix },
        };

        if (mode === "single") {
          nextEntry.targetMatrix[year] = value;
          nextEntry.actualMatrix[year] = value;
        } else if (mode === "target") {
          nextEntry.targetMatrix[year] = value;
        } else {
          nextEntry.actualMatrix[year] = value;
        }

        return {
          ...entries,
          [metric.id]: nextEntry,
        };
      });
    },
    [],
  );

  useEffect(() => {
    if (!activeCategory) return;
    if (activeCategory.id === activeCategoryId) return;
    setActiveCategoryId(activeCategory.id);
  }, [activeCategory, activeCategoryId]);

  useEffect(() => {
    if (!activeCategoryId) return;

    const rail = categoryRailRef.current;
    if (!rail) return;

    const targetButton = rail.querySelector<HTMLButtonElement>(`button[data-category-id="${activeCategoryId}"]`);
    targetButton?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeCategoryId, complianceTabs.length]);

  useEffect(() => {
    if (missingFieldTargets.length === 0) {
      setMissingJumpIndex(0);
      return;
    }

    if (missingJumpIndex >= missingFieldTargets.length) {
      setMissingJumpIndex(0);
    }
  }, [missingFieldTargets.length, missingJumpIndex]);

  useEffect(() => {
    if (!pendingFocusCellId || typeof document === "undefined") return;

    const focusCell = () => {
      const element = document.getElementById(pendingFocusCellId);
      if (!element) {
        return false;
      }

      element.scrollIntoView({ behavior: "smooth", block: "center" });
      if (element instanceof HTMLElement) {
        element.focus({ preventScroll: true });
      }
      setPendingFocusCellId(null);
      return true;
    };

    if (focusCell()) {
      return;
    }

    const timer = window.setTimeout(() => {
      focusCell();
    }, 100);

    return () => window.clearTimeout(timer);
  }, [pendingFocusCellId, activeCategoryId, filteredActiveMetrics.length, showAdvancedInputs]);

  const resetForm = () => {
    setEditingSubmissionId(null);
    setNotes("");
    setMetricEntries(() => buildInitialMetricEntries(complianceMetrics, {}));
    setAutosaveAt(null);
    setServerAutosaveAt(null);
    setAutosaveError("");
    setIsAutosavingDraft(false);
    setPendingLocalDraft(null);
    setRestoreBannerDismissed(false);
    setShowMissingFields(false);
    setMissingJumpIndex(0);
    setPendingFocusCellId(null);
    lastAutosaveFingerprintRef.current = "";
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
    setServerAutosaveAt(submission.updatedAt ?? null);
    setPendingLocalDraft(null);
    setRestoreBannerDismissed(true);
    setAutosaveError("");
    lastAutosaveFingerprintRef.current = "";
    if (String(submission.status ?? "").toLowerCase() === "returned") {
      setShowOnlyMissingRows(true);
      setAutoMissingAppliedForSubmissionId(submission.id);
    }
  };

  const focusMissingTarget = useCallback((target: MissingFieldTarget, nextIndex?: number) => {
    if (target.categoryId !== activeCategoryId) {
      setActiveCategoryId(target.categoryId);
    }

    if (!showAdvancedInputs && target.categoryId !== COMPLIANCE_CATEGORIES[0]?.id) {
      setShowAdvancedInputs(true);
    }

    if (indicatorSearch.trim().length > 0) {
      setIndicatorSearch("");
    }

    setPendingFocusCellId(target.cellId);
    if (typeof nextIndex === "number") {
      setMissingJumpIndex(nextIndex);
    }
  }, [activeCategoryId, indicatorSearch, showAdvancedInputs]);

  const jumpToMissingByDirection = useCallback((direction: 1 | -1) => {
    if (missingFieldTargets.length === 0) {
      return;
    }

    const currentIndex = missingJumpIndex % missingFieldTargets.length;
    const normalizedIndex = currentIndex < 0 ? 0 : currentIndex;
    const targetIndex =
      direction === 1
        ? normalizedIndex
        : (normalizedIndex - 1 + missingFieldTargets.length) % missingFieldTargets.length;

    const target = missingFieldTargets[targetIndex];
    if (!target) {
      return;
    }

    const nextIndex =
      direction === 1
        ? (targetIndex + 1) % missingFieldTargets.length
        : targetIndex;

    focusMissingTarget(target, nextIndex);
  }, [focusMissingTarget, missingFieldTargets, missingJumpIndex]);

  const handleJumpToNextMissing = useCallback(() => {
    jumpToMissingByDirection(1);
  }, [jumpToMissingByDirection]);

  const handleJumpToPreviousMissing = useCallback(() => {
    jumpToMissingByDirection(-1);
  }, [jumpToMissingByDirection]);

  const handleGoToAffectedCategory = useCallback((categoryId: string) => {
    const target = firstMissingByCategory.get(categoryId);
    if (!target) {
      return;
    }

    focusMissingTarget(target);
  }, [firstMissingByCategory, focusMissingTarget]);

  const handleReturnedIndicatorFocus = useCallback(() => {
    if (!returnedSubmission) {
      return;
    }

    if (editingSubmissionId !== returnedSubmission.id) {
      handleEditDraft(returnedSubmission);
    }

    const target = firstMissingByCategory.values().next().value as MissingFieldTarget | undefined;
    if (target) {
      focusMissingTarget(target);
    }
  }, [editingSubmissionId, firstMissingByCategory, focusMissingTarget, handleEditDraft, returnedSubmission]);

  useEffect(() => {
    if (!returnedSubmission) {
      return;
    }

    if (autoMissingAppliedForSubmissionId === returnedSubmission.id) {
      return;
    }

    setShowOnlyMissingRows(true);
    setAutoMissingAppliedForSubmissionId(returnedSubmission.id);
  }, [autoMissingAppliedForSubmissionId, returnedSubmission]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleMissingShortcuts = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        handleJumpToNextMissing();
        return;
      }

      if (key === "p") {
        event.preventDefault();
        handleJumpToPreviousMissing();
      }
    };

    window.addEventListener("keydown", handleMissingShortcuts);
    return () => window.removeEventListener("keydown", handleMissingShortcuts);
  }, [handleJumpToNextMissing, handleJumpToPreviousMissing]);

  const buildSubmissionPayload = useCallback((): { payload: IndicatorSubmissionPayload | null; reason: string; fingerprint: string } => {
    if (!academicYearId) {
      return { payload: null, reason: "Select an academic year.", fingerprint: "" };
    }
    if (academicYearId === ALL_RECORDS_YEAR_ID) {
      return { payload: null, reason: "Select a specific academic year to save. Use All records for viewing only.", fingerprint: "" };
    }

    if (missingFieldTargets.length > 0) {
      return {
        payload: null,
        reason: submitBlockedReason || "Complete all required indicator cells before saving.",
        fingerprint: "",
      };
    }

    const entries = orderedComplianceMetrics
      .map((metric) => {
        const value = metricEntries[metric.id] ?? buildDefaultEntry(metric);
        const scopedYears = resolveMetricYearsInScope(metric, activeSchoolYears);
        const requiredYears = scopedYears.filter((year) => requiredSchoolYearSet.has(year));
        const isRequired = requiredYears.length > 0;

        const type = metricDataType(metric);
        const isAutoCalculated = metricIsAutoCalculated(metric);
        const isSyncedLocked = metricUsesSyncedLockedTotals(metric);

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
            isSyncedLocked: false,
            requiredYears: [] as string[],
            isRequired: false,
          };
        }

        const requiresTargetActual = TARGET_ACTUAL_METRIC_CODES.has(normalizeMetricCode(metric.code));
        let targetPayload: IndicatorTypedValuePayload | undefined;
        let actualPayload: IndicatorTypedValuePayload | undefined;
        let targetValue: number | undefined;
        let actualValue: number | undefined;

        if (type === "currency" || type === "number") {
          if (requiresTargetActual) {
            const targetRaw = value.targetValue.trim();
            const actualRaw = value.actualValue.trim();
            targetValue = targetRaw === "" ? undefined : Number(targetRaw);
            actualValue = actualRaw === "" ? undefined : Number(actualRaw);
          } else {
            const singleRaw = String(value.actualValue || value.targetValue || "").trim();
            const singleValue = singleRaw === "" ? undefined : Number(singleRaw);
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
          const years = scopedYears;
          const requiredYearSet = new Set(requiredYears);
          if (requiresTargetActual) {
            const targetMatrixValues = Object.fromEntries(
              years
                .map((year) => [year, (value.targetMatrix[year] ?? "").trim()] as const)
                .filter(([year, cellValue]) => requiredYearSet.has(year) || cellValue !== ""),
            );
            const actualMatrixValues = Object.fromEntries(
              years
                .map((year) => [year, (value.actualMatrix[year] ?? "").trim()] as const)
                .filter(([year, cellValue]) => requiredYearSet.has(year) || cellValue !== ""),
            );

            targetPayload = {
              values: targetMatrixValues,
            };
            actualPayload = {
              values: actualMatrixValues,
            };
          } else {
            const matrixValues = Object.fromEntries(
              years
                .map((year) => [year, (value.actualMatrix[year] ?? value.targetMatrix[year] ?? "").trim()] as const)
                .filter(([year, cellValue]) => requiredYearSet.has(year) || cellValue !== ""),
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
          isSyncedLocked,
          requiredYears,
          isRequired,
        };
      });

    if (entries.length === 0) {
      return { payload: null, reason: "No required compliance indicators are available for this school.", fingerprint: "" };
    }

    const invalidEntry = entries.find((entry) => {
      if (entry.isAutoCalculated || entry.isSyncedLocked || !entry.isRequired) {
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
          const targetValues = entry.requiredYears.map((year) => String(entry.target?.values?.[year] ?? "").trim());
          const actualValues = entry.requiredYears.map((year) => String(entry.actual?.values?.[year] ?? "").trim());
          return targetValues.some((value) => value === "") || actualValues.some((value) => value === "");
        }
        const actualValues = entry.requiredYears.map((year) => String(entry.actual?.values?.[year] ?? entry.target?.values?.[year] ?? "").trim());
        return actualValues.some((value) => value === "");
      }

      return false;
    });

    if (invalidEntry) {
      return {
        payload: null,
        reason: submitBlockedReason || "Complete all required indicator cells before saving.",
        fingerprint: "",
      };
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

    return { payload, reason: "", fingerprint: JSON.stringify(payload) };
  }, [academicYearId, activeSchoolYears, metricEntries, missingFieldTargets.length, notes, orderedComplianceMetrics, reportingPeriod, requiredSchoolYearSet, submitBlockedReason]);

  const persistDraftPayload = useCallback(
    async (payload: IndicatorSubmissionPayload, mode: "manual" | "autosave"): Promise<IndicatorSubmission> => {
      const result = editingSubmissionId
        ? await updateSubmission(editingSubmissionId, payload)
        : await createSubmission(payload);

      setEditingSubmissionId(result.id);
      setPendingLocalDraft(null);
      setAutosaveError("");

      const savedAt = new Date().toISOString();
      setServerAutosaveAt(savedAt);
      lastAutosaveFingerprintRef.current = `${result.id}:${JSON.stringify(payload)}`;

      if (mode === "manual") {
        setSaveMessage(`Draft package #${result.id} saved.`);
      }

      return result;
    },
    [createSubmission, editingSubmissionId, updateSubmission],
  );

  const triggerServerAutosave = useCallback(async () => {
    if (autosaveInFlightRef.current) {
      return;
    }

    const prepared = buildSubmissionPayload();
    if (!prepared.payload) {
      return;
    }

    const currentFingerprint = `${editingSubmissionId ?? "new"}:${prepared.fingerprint}`;
    if (currentFingerprint === lastAutosaveFingerprintRef.current) {
      return;
    }

    autosaveInFlightRef.current = true;
    setIsAutosavingDraft(true);
    try {
      await persistDraftPayload(prepared.payload, "autosave");
    } catch (err) {
      setAutosaveError(err instanceof Error ? err.message : "Server autosave failed. Draft is still kept locally.");
    } finally {
      autosaveInFlightRef.current = false;
      setIsAutosavingDraft(false);
    }
  }, [buildSubmissionPayload, editingSubmissionId, persistDraftPayload]);

  useEffect(() => {
    if (typeof window === "undefined" || complianceMetrics.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      void triggerServerAutosave();
    }, 25_000);

    return () => window.clearInterval(interval);
  }, [complianceMetrics.length, triggerServerAutosave]);

  const handleFormBlurAutosave = useCallback((event: FocusEvent<HTMLFormElement>) => {
    if (!isTypingTarget(event.target)) {
      return;
    }

    void triggerServerAutosave();
  }, [triggerServerAutosave]);

  const handleCopyPreviousYearValues = useCallback(() => {
    let copiedCount = 0;

    setMetricEntries((entries) => {
      const next = { ...entries };

      for (const metric of orderedComplianceMetrics) {
        if (metricIsAutoCalculated(metric) || metricUsesSyncedLockedTotals(metric)) {
          continue;
        }

        const current = next[metric.id] ?? buildDefaultEntry(metric);
        const updated: MetricEntryValue = {
          ...current,
          targetMatrix: { ...current.targetMatrix },
          actualMatrix: { ...current.actualMatrix },
        };
        const years = metricYears(metric);
        const timelineYears = years.length > 0 ? years : schoolYears;
        const requiresTargetActual = TARGET_ACTUAL_METRIC_CODES.has(normalizeMetricCode(metric.code));

        for (let index = 1; index < timelineYears.length; index += 1) {
          const previousYear = timelineYears[index - 1];
          const year = timelineYears[index];
          if (!activeSchoolYears.includes(year)) {
            continue;
          }

          if (requiresTargetActual) {
            const previousTarget = String(updated.targetMatrix[previousYear] ?? "").trim();
            const previousActual = String(updated.actualMatrix[previousYear] ?? "").trim();

            if (String(updated.targetMatrix[year] ?? "").trim() === "" && previousTarget !== "") {
              updated.targetMatrix[year] = previousTarget;
              copiedCount += 1;
            }
            if (String(updated.actualMatrix[year] ?? "").trim() === "" && previousActual !== "") {
              updated.actualMatrix[year] = previousActual;
              copiedCount += 1;
            }
            continue;
          }

          const currentValue = String(updated.actualMatrix[year] ?? updated.targetMatrix[year] ?? "").trim();
          const previousValue = String(updated.actualMatrix[previousYear] ?? updated.targetMatrix[previousYear] ?? "").trim();
          if (currentValue === "" && previousValue !== "") {
            updated.actualMatrix[year] = previousValue;
            updated.targetMatrix[year] = previousValue;
            copiedCount += 1;
          }
        }

        next[metric.id] = updated;
      }

      return next;
    });

    setSubmitError("");
    if (copiedCount > 0) {
      setSaveMessage(`Copied previous-year values into ${copiedCount} empty cell${copiedCount === 1 ? "" : "s"}.`);
      return;
    }

    setSaveMessage("No empty cells were eligible for previous-year copy.");
  }, [activeSchoolYears, orderedComplianceMetrics, schoolYears]);

  const handleCopyFromLatestValidated = useCallback(() => {
    if (!latestValidatedSubmission) {
      setSubmitError("No validated package is available to copy from.");
      return;
    }

    const sourceByMetricId = new Map(
      latestValidatedSubmission.indicators
        .map((indicator: IndicatorSubmissionItem) => [indicator.metric?.id ?? "", indicator] as const)
        .filter(([metricId]: readonly [string, IndicatorSubmissionItem]) => metricId.length > 0),
    );
    let copiedCount = 0;

    setMetricEntries((entries) => {
      const next = { ...entries };

      for (const metric of orderedComplianceMetrics) {
        if (metricIsAutoCalculated(metric) || metricUsesSyncedLockedTotals(metric)) {
          continue;
        }

        const sourceIndicator = sourceByMetricId.get(metric.id);
        if (!sourceIndicator) {
          continue;
        }

        const sourceEntry = buildEntryFromSubmission(metric, sourceIndicator);
        const current = next[metric.id] ?? buildDefaultEntry(metric);
        const updated: MetricEntryValue = {
          ...current,
          targetMatrix: { ...current.targetMatrix },
          actualMatrix: { ...current.actualMatrix },
        };
        const years = metricYears(metric);
        const effectiveYears = years.length > 0 ? years : schoolYears;
        const requiresTargetActual = TARGET_ACTUAL_METRIC_CODES.has(normalizeMetricCode(metric.code));

        for (const year of effectiveYears) {
          if (!activeSchoolYears.includes(year)) {
            continue;
          }
          if (requiresTargetActual) {
            const sourceTarget = String(sourceEntry.targetMatrix[year] ?? "").trim();
            const sourceActual = String(sourceEntry.actualMatrix[year] ?? "").trim();

            if (String(updated.targetMatrix[year] ?? "").trim() === "" && sourceTarget !== "") {
              updated.targetMatrix[year] = sourceTarget;
              copiedCount += 1;
            }
            if (String(updated.actualMatrix[year] ?? "").trim() === "" && sourceActual !== "") {
              updated.actualMatrix[year] = sourceActual;
              copiedCount += 1;
            }
            continue;
          }

          const sourceValue = String(sourceEntry.actualMatrix[year] ?? sourceEntry.targetMatrix[year] ?? "").trim();
          const currentValue = String(updated.actualMatrix[year] ?? updated.targetMatrix[year] ?? "").trim();
          if (currentValue === "" && sourceValue !== "") {
            updated.actualMatrix[year] = sourceValue;
            updated.targetMatrix[year] = sourceValue;
            copiedCount += 1;
          }
        }

        next[metric.id] = updated;
      }

      return next;
    });

    setSubmitError("");
    if (copiedCount > 0) {
      setSaveMessage(`Copied ${copiedCount} empty cell${copiedCount === 1 ? "" : "s"} from package #${latestValidatedSubmission.id}.`);
      return;
    }

    setSaveMessage(`No empty cells could be copied from package #${latestValidatedSubmission.id}.`);
  }, [activeSchoolYears, latestValidatedSubmission, orderedComplianceMetrics, schoolYears]);

  const handleRestoreLocalDraft = useCallback(() => {
    if (!pendingLocalDraft) {
      return;
    }

    if (pendingLocalDraft.academicYearId) {
      setAcademicYearId(pendingLocalDraft.academicYearId);
    }
    setNotes(pendingLocalDraft.notes);
    setMetricEntries((current) => buildInitialMetricEntries(complianceMetrics, { ...current, ...pendingLocalDraft.metricEntries }));
    setEditingSubmissionId(pendingLocalDraft.editingSubmissionId);
    setAutosaveAt(pendingLocalDraft.savedAt);
    setPendingLocalDraft(null);
    setRestoreBannerDismissed(true);
    setSubmitError("");
    setSaveMessage("Local draft restored.");
    setAutosaveError("");
    lastAutosaveFingerprintRef.current = "";
  }, [complianceMetrics, pendingLocalDraft]);

  const handleRestoreServerDraft = useCallback(() => {
    if (!latestServerDraft) {
      return;
    }

    handleEditDraft(latestServerDraft);
    setPendingLocalDraft(null);
    setRestoreBannerDismissed(true);
    setAutosaveError("");
    lastAutosaveFingerprintRef.current = "";
  }, [handleEditDraft, latestServerDraft]);

  const showRestoreBanner = !restoreBannerDismissed && (
    Boolean(pendingLocalDraft)
    || Boolean(latestServerDraft && latestServerDraft.id !== editingSubmissionId)
  );

  const handleCreateSubmission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    setSaveMessage("");

    const prepared = buildSubmissionPayload();
    if (!prepared.payload) {
      if (missingFieldTargets.length > 0) {
        setSubmitError("");
        setShowMissingFields(true);
        const firstMissing = missingFieldTargets[0];
        if (firstMissing) {
          focusMissingTarget(firstMissing, missingFieldTargets.length > 1 ? 1 : 0);
        }
        return;
      }
      setSubmitError(prepared.reason);
      return;
    }

    try {
      await persistDraftPayload(prepared.payload, "manual");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unable to save indicator package.");
    }
  };

  const handleCreateAndSubmit = async () => {
    setSubmitError("");
    setSaveMessage("");

    const prepared = buildSubmissionPayload();
    if (!prepared.payload) {
      if (missingFieldTargets.length > 0) {
        setSubmitError("");
        setShowMissingFields(true);
        const firstMissing = missingFieldTargets[0];
        if (firstMissing) {
          focusMissingTarget(firstMissing, missingFieldTargets.length > 1 ? 1 : 0);
        }
        return;
      }
      setSubmitError(prepared.reason);
      return;
    }

    try {
      const result = await persistDraftPayload(prepared.payload, "manual");
      await submitSubmission(result.id);
      setSaveMessage(`Package #${result.id} submitted to monitor.`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unable to submit package.");
    }
  };

  const handleSubmitToMonitor = async (submission: IndicatorSubmission) => {
    setSubmitError("");
    setSaveMessage("");

    const submissionSummary = submissionMissingSummaryById.get(submission.id);
    if ((submissionSummary?.missingCount ?? 0) > 0) {
      setSubmitError(submissionSummary?.reason || "Complete all required indicator cells before submitting.");
      return;
    }

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

  const handleFileUpload = useCallback(async (type: IndicatorSubmissionFileType, file: File) => {
    setSubmitError("");
    setSaveMessage("");
    setUploadErrorByType((current) => ({ ...current, [type]: "" }));

    const normalizedName = file.name.toLowerCase();
    const validExtension = [".pdf", ".docx", ".xlsx"].some((extension) => normalizedName.endsWith(extension));
    if (!validExtension) {
      setUploadErrorByType((current) => ({
        ...current,
        [type]: "Only PDF, DOCX, and XLSX files are allowed.",
      }));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadErrorByType((current) => ({
        ...current,
        [type]: "File size must not exceed 10MB.",
      }));
      return;
    }

    if (!selectedSubmissionForUploads) {
      setSubmitError("Save the indicator draft first before uploading BMEF or SMEA files.");
      return;
    }

    setUploadingFileType(type);
    try {
      const updated = await uploadSubmissionFile(selectedSubmissionForUploads.id, type, file);
      setSaveMessage(`${type.toUpperCase()} file uploaded for package #${updated.id}.`);
      setUploadErrorByType((current) => ({ ...current, [type]: "" }));
    } catch (err) {
      setUploadErrorByType((current) => ({
        ...current,
        [type]: err instanceof Error ? err.message : `Unable to upload ${type.toUpperCase()} file.`,
      }));
    } finally {
      setUploadingFileType(null);
    }
  }, [selectedSubmissionForUploads, uploadSubmissionFile]);

  const handleFileInputChange = useCallback(
    async (type: IndicatorSubmissionFileType, event: ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0];
      event.currentTarget.value = "";
      if (!selectedFile) {
        return;
      }

      await handleFileUpload(type, selectedFile);
    },
    [handleFileUpload],
  );

  const handleDownloadUploadedFile = useCallback(async (type: IndicatorSubmissionFileType) => {
    setSubmitError("");
    setSaveMessage("");
    setUploadErrorByType((current) => ({ ...current, [type]: "" }));

    if (!selectedSubmissionForUploads) {
      setUploadErrorByType((current) => ({
        ...current,
        [type]: "No draft package is available for download.",
      }));
      return;
    }

    try {
      await downloadSubmissionFile(selectedSubmissionForUploads.id, type);
    } catch (err) {
      setUploadErrorByType((current) => ({
        ...current,
        [type]: err instanceof Error ? err.message : `Unable to download ${type.toUpperCase()} file.`,
      }));
    }
  }, [downloadSubmissionFile, selectedSubmissionForUploads]);

  const openUploadPicker = useCallback((type: IndicatorSubmissionFileType) => {
    if (type === "bmef") {
      bmefInputRef.current?.click();
      return;
    }

    smeaInputRef.current?.click();
  }, []);

  return (
    <section className="surface-panel animate-fade-slide overflow-hidden rounded-none border-0 shadow-none">
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="rounded-sm border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-wide text-slate-500">Form status</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    bmefSubmitted
                      ? "border-primary-300 bg-primary-50 text-primary-700"
                      : "border-amber-300 bg-amber-50 text-amber-700"
                  }`}
                >
                  BMEF: {bmefSubmitted ? "Submitted" : "Not Submitted"}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    smeaSubmitted
                      ? "border-primary-300 bg-primary-50 text-primary-700"
                      : "border-amber-300 bg-amber-50 text-amber-700"
                  }`}
                >
                  SMEA: {smeaSubmitted ? "Submitted" : "Not Submitted"}
                </span>
              </div>
            </div>

            <div className="w-full md:w-[320px]">
              <p className="text-right text-lg font-bold leading-none text-slate-900">
                {completeIndicators}/{totalIndicators} complete
              </p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
                <div
                  className={`h-1.5 rounded-full transition-[width] duration-300 ${completionBarToneClass}`}
                  style={{ width: `${completionPercent}%` }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={completionPercent}
                  aria-label="Indicator completion progress"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <form className="space-y-4 border-b border-slate-100 bg-slate-50/30 px-4 py-4" onSubmit={handleCreateSubmission} onBlurCapture={handleFormBlurAutosave}>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="indicator-school-year" className="mb-1 block text-[12px] font-medium tracking-normal text-slate-500">
              School year
            </label>
            <div className="relative">
              <select
                id="indicator-school-year"
                value={academicYearId}
                onChange={(event) => setAcademicYearId(event.target.value)}
                aria-label="School year"
                className="w-full appearance-none rounded-sm border border-slate-300 bg-white px-3 py-2 pr-8 text-sm font-semibold text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              >
                <option value={ALL_RECORDS_YEAR_ID}>All records</option>
                {eligibleAcademicYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            </div>
          </div>

          <div>
            <label htmlFor="indicator-reporting-period" className="mb-1 block text-[12px] font-medium tracking-normal text-slate-500">
              Reporting period
            </label>
            <div className="relative">
              <select
                id="indicator-reporting-period"
                value={reportingPeriod}
                onChange={() => undefined}
                aria-label="Reporting period"
                className="w-full appearance-none rounded-sm border border-slate-300 bg-white px-3 py-2 pr-8 text-sm font-semibold text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              >
                <option value="ANNUAL">Annual</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200/80 pt-3">
          {showOptionalNotes || notes.trim().length > 0 ? (
            <div className="space-y-2 rounded-sm border border-slate-200 bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="indicator-notes" className="block text-[12px] font-medium tracking-normal text-slate-500">
                  Optional note
                </label>
                <button
                  type="button"
                  onClick={() => setShowOptionalNotes(false)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Collapse optional note"
                  title="Collapse"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                id="indicator-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Add optional note"
                className="w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowOptionalNotes(true)}
              className="text-xs font-semibold text-slate-500 underline-offset-2 transition hover:text-slate-700 hover:underline"
            >
              + Add optional note
            </button>
          )}
        </div>

        <div className="space-y-2 pt-3">
          <div className="rounded-sm border border-slate-200 bg-slate-50 p-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleSlideCategory(-1)}
                disabled={complianceTabs.length <= 1}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                title="Slide categories left"
                aria-label="Slide categories left"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <div ref={categoryRailRef} className="min-w-0 flex-1 overflow-x-auto scroll-smooth">
                <div className="flex min-w-max items-stretch gap-1 pr-1">
                  {complianceTabs.map((tab) => {
                    const category = visibleCategoryMetrics.find((candidate) => candidate.id === tab.id) ?? null;
                    const progress = category
                      ? categoryProgressById.get(category.id) ?? { total: category.metrics.length, complete: 0 }
                      : null;
                    const missingCount = category
                      ? missingCountByCategory.find((item) => item.categoryId === category.id)?.count ?? 0
                      : null;
                    const isActive = activeCategoryId === tab.id;
                    const uploadSubmitted = tab.kind === "upload"
                      ? (tab.uploadType === "bmef" ? bmefSubmitted : smeaSubmitted)
                      : null;

                    return (
                      <button
                        key={tab.id}
                        data-category-id={tab.id}
                        type="button"
                        onClick={() => handleSelectCategory(tab.id)}
                        className={`inline-flex min-w-[188px] items-center justify-between gap-1.5 rounded-sm border px-2 py-1 text-left transition ${
                          isActive
                            ? "border-primary-300 bg-primary-50 text-primary-700"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-semibold uppercase tracking-wide">
                            {tab.label}
                          </span>
                          {tab.kind === "category" && progress ? (
                            <span className="mt-0.5 block text-[10px] font-medium text-slate-600">
                              {progress.complete}/{progress.total} complete
                            </span>
                          ) : (
                            <span className="mt-0.5 block text-[10px] font-medium text-slate-600">
                              {uploadSubmitted ? "Submitted" : "Not submitted"}
                            </span>
                          )}
                        </span>
                        <span
                          className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold ${
                            tab.kind === "category"
                              ? (missingCount && missingCount > 0
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-primary-300 bg-primary-50 text-primary-700")
                              : (uploadSubmitted
                                ? "border-primary-300 bg-primary-50 text-primary-700"
                                : "border-amber-300 bg-amber-50 text-amber-700")
                          }`}
                        >
                          {tab.kind === "category"
                            ? `Missing ${missingCount ?? 0}`
                            : uploadSubmitted
                              ? "Submitted"
                              : "Not Submitted"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSlideCategory(1)}
                disabled={complianceTabs.length <= 1}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                title="Slide categories right"
                aria-label="Slide categories right"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {activeCategory && (
          <>
          <div className="grid gap-1.5 md:grid-cols-[minmax(0,1fr)_auto]">
            <input
              type="search"
              value={indicatorSearch}
              onChange={(event) => setIndicatorSearch(event.target.value)}
              placeholder="Search indicator"
              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
            <button
              type="button"
              onClick={() => setShowOnlyMissingRows((current) => !current)}
              className={`rounded-sm border px-3 py-1 text-xs font-semibold transition ${
                showOnlyMissingRows
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {showOnlyMissingRows ? "All rows" : "Missing only"}
            </button>
          </div>

          {showMissingFields && (
            <div className="rounded-sm border border-slate-200 bg-slate-50 p-2">
              {missingFieldTargets.length === 0 ? (
                <p className="px-2 py-1 text-xs font-semibold text-primary-700">No missing required fields.</p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                  {missingFieldTargets.map((target, index) => (
                    <button
                      key={target.key}
                      type="button"
                      onClick={() => {
                        focusMissingTarget(target, (index + 1) % missingFieldTargets.length);
                        setShowMissingFields(false);
                      }}
                      className="w-full rounded-sm border border-slate-200 bg-white px-2.5 py-2 text-left text-xs transition hover:bg-slate-100"
                    >
                      <p className="font-semibold text-slate-800">
                        {target.metricCode} | {target.metricLabel}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600">
                        {target.categoryLabel} | {target.year} | {target.inputKind === "value" ? "Value" : target.inputKind === "target" ? "Target" : "Actual"}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          </>
          )}

          {activeUploadType && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <input
                ref={bmefInputRef}
                type="file"
                accept=".pdf,.docx,.xlsx"
                className="hidden"
                onChange={(event) => void handleFileInputChange("bmef", event)}
              />
              <input
                ref={smeaInputRef}
                type="file"
                accept=".pdf,.docx,.xlsx"
                className="hidden"
                onChange={(event) => void handleFileInputChange("smea", event)}
              />

              {(() => {
                const fileEntry = activeUploadType === "bmef" ? bmefFileEntry : smeaFileEntry;
                const uploaded = activeUploadType === "bmef" ? bmefSubmitted : smeaSubmitted;
                const uploadError = uploadErrorByType[activeUploadType];
                const isUploading = uploadingFileType === activeUploadType;
                const uploadDisabled = !selectedSubmissionForUploads || isSaving || isSubmissionDataLoading || isUploading;
                const uploadTypeLabel = activeUploadType === "bmef" ? "BMEF" : "SMEA";

                return (
                  <div className="space-y-3">
                    <FileUploadField
                      label={uploadTypeLabel}
                      description="Upload-only section. Accepted formats: PDF, DOCX, XLSX (max 10MB)."
                      file={fileEntry
                        ? {
                          filename: fileEntry.originalFilename,
                          sizeBytes: fileEntry.sizeBytes,
                          uploadedAt: fileEntry.uploadedAt,
                        }
                        : null}
                      submitted={uploaded}
                      isUploading={isUploading}
                      disabled={uploadDisabled}
                      onUploadClick={() => openUploadPicker(activeUploadType)}
                      onDownloadClick={() => void handleDownloadUploadedFile(activeUploadType)}
                      error={uploadError}
                    />
                    {!selectedSubmissionForUploads && (
                      <p className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                        Save the indicator draft first to enable file upload.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {activeCategory && (
            <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{categoryTabLabel(activeCategory)}</h3>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => slideIndicatorTable(-1)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100"
                      title="Slide table left"
                      aria-label="Slide table left"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => slideIndicatorTable(1)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100"
                      title="Slide table right"
                      aria-label="Slide table right"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <span className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
                      {activeCategoryProgress.complete}/{activeCategoryProgress.total}
                    </span>
                  </div>
                </div>
                <div
                  ref={indicatorTableRef}
                  tabIndex={0}
                  onKeyDown={handleIndicatorTableKeyDown}
                  onWheel={handleIndicatorTableWheel}
                  className="max-h-[68vh] overflow-auto rounded-sm border border-slate-200 bg-white scroll-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-100"
                  title="Use mouse wheel to scroll rows. Use Shift+wheel, trackpad sideways pan, or arrow buttons for left/right."
                >
                  <table className={`${activeCategory.mode === "target_actual" ? "min-w-[1120px]" : "min-w-[760px]"} w-full border-collapse`}>
                    <thead>
                      <tr className="bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                        <th rowSpan={2} className="sticky left-0 top-0 z-40 min-w-[220px] border border-slate-300 bg-slate-100 px-2 py-1.5 text-left">
                          Indicators
                        </th>
                        {activeCategory.mode === "target_actual" ? (
                          activeSchoolYears.map((year) => (
                            <th
                              key={`${activeCategory.id}-${year}`}
                              colSpan={2}
                              className="sticky top-0 z-30 border border-slate-300 bg-slate-100 px-2 py-1.5 text-center"
                            >
                              {year}
                            </th>
                          ))
                        ) : (
                          <th colSpan={activeSchoolYears.length} className="sticky top-0 z-30 border border-slate-300 bg-slate-100 px-3 py-1.5 text-center">
                            School Year
                          </th>
                        )}
                      </tr>
                      <tr className="bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                        {activeCategory.mode === "target_actual"
                          ? activeSchoolYears.flatMap((year) => [
                              <th
                                key={`${activeCategory.id}-${year}-target`}
                                className="sticky top-[29px] z-30 min-w-[150px] border border-slate-300 bg-slate-100 px-2 py-1.5 text-center"
                              >
                                Target
                              </th>,
                              <th
                                key={`${activeCategory.id}-${year}-actual`}
                                className="sticky top-[29px] z-30 min-w-[150px] border border-slate-300 bg-slate-100 px-2 py-1.5 text-center"
                              >
                                Actual
                              </th>,
                            ])
                          : activeSchoolYears.map((year) => (
                              <th
                                key={`${activeCategory.id}-${year}`}
                                className="sticky top-[29px] z-30 min-w-[170px] border border-slate-300 bg-slate-100 px-2 py-1.5 text-center"
                              >
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
                      const isSyncedLockedMetric = metricUsesSyncedLockedTotals(metric);
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
                          <td className={`sticky left-0 z-20 min-w-[220px] max-w-[280px] border border-slate-300 px-2 py-1.5 align-top ${stickyTone}`}>
                            <p
                              className="truncate text-[11px] font-semibold leading-4 text-slate-900"
                              title={metricDisplayLabel(metric)}
                            >
                              {metricDisplayLabel(metric)}
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-500">{metric.code}</p>
                            {isAutoCalculated && (
                              <p className="mt-0.5 text-[10px] font-medium text-primary-700">
                                Auto-calculated
                              </p>
                            )}
                            {!isAutoCalculated && isSyncedLockedMetric && (
                              <p className="mt-0.5 text-[10px] font-medium text-primary-700">
                                Synced total (locked)
                              </p>
                            )}
                          </td>
                          {activeSchoolYears.map((year) => {
                            const placeholder =
                              valueType === "yes_no"
                                ? "Yes/No"
                                : valueType === "enum"
                                  ? enumOptions.join(" / ")
                                  : "";
                            const valueCellId = indicatorCellId(metric.id, year, "value");
                            const targetCellId = indicatorCellId(metric.id, year, "target");
                            const actualCellId = indicatorCellId(metric.id, year, "actual");
                            const valueMissing = missingFieldByCellId.get(valueCellId);
                            const targetMissing = missingFieldByCellId.get(targetCellId);
                            const actualMissing = missingFieldByCellId.get(actualCellId);
                            const isLockedSyncedYear = isSyncedLockedMetric && autoSyncTargetYears.includes(year);
                            const autoTargetValue = String(current.targetMatrix[year] ?? "").trim();
                            const autoActualValue = String(current.actualMatrix[year] ?? "").trim();
                            const autoSingleValue = autoActualValue !== "" ? autoActualValue : autoTargetValue;

                            const valueInputClass = `h-7 w-full rounded-sm border px-2 py-1 text-xs text-slate-900 outline-none transition ${
                              valueMissing
                                ? "border-amber-300 bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                                : "border-slate-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary-100"
                            }`;
                            const targetInputClass = `h-7 w-full rounded-sm border px-2 py-1 text-xs text-slate-900 outline-none transition ${
                              targetMissing
                                ? "border-amber-300 bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                                : "border-slate-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary-100"
                            }`;
                            const actualInputClass = `h-7 w-full rounded-sm border px-2 py-1 text-xs text-slate-900 outline-none transition ${
                              actualMissing
                                ? "border-amber-300 bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                                : "border-slate-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary-100"
                            }`;

                            if (isAutoCalculated) {
                              if (activeCategory.mode !== "target_actual") {
                                return (
                                  <td key={`${metric.id}-${year}-auto`} className="border border-slate-300 bg-primary-50/40 p-1.5 text-center align-middle">
                                    <span className="text-[11px] font-semibold text-primary-700">
                                      {autoSingleValue !== "" ? autoSingleValue : "Auto"}
                                    </span>
                                  </td>
                                );
                              }

                              return (
                                <Fragment key={`${metric.id}-${year}-auto`}>
                                  <td className="border border-slate-300 bg-primary-50/40 p-1.5 text-center align-middle">
                                    <span className="text-[11px] font-semibold text-primary-700">
                                      {autoTargetValue !== "" ? autoTargetValue : "Auto"}
                                    </span>
                                  </td>
                                  <td className="border border-slate-300 bg-primary-50/40 p-1.5 text-center align-middle">
                                    <span className="text-[11px] font-semibold text-primary-700">
                                      {autoActualValue !== "" ? autoActualValue : (autoTargetValue !== "" ? autoTargetValue : "Auto")}
                                    </span>
                                  </td>
                                </Fragment>
                              );
                            }

                            if (isLockedSyncedYear) {
                              if (activeCategory.mode !== "target_actual") {
                                return (
                                  <td key={`${metric.id}-${year}-synced`} className="border border-slate-300 bg-primary-50/40 p-1.5 text-center align-middle">
                                    <span className="text-[11px] font-semibold text-primary-700">
                                      {autoSingleValue !== "" ? autoSingleValue : "Synced"}
                                    </span>
                                  </td>
                                );
                              }

                              return (
                                <Fragment key={`${metric.id}-${year}-synced`}>
                                  <td className="border border-slate-300 bg-primary-50/40 p-1.5 text-center align-middle">
                                    <span className="text-[11px] font-semibold text-primary-700">
                                      {autoTargetValue !== "" ? autoTargetValue : "Synced"}
                                    </span>
                                  </td>
                                  <td className="border border-slate-300 bg-primary-50/40 p-1.5 text-center align-middle">
                                    <span className="text-[11px] font-semibold text-primary-700">
                                      {autoActualValue !== "" ? autoActualValue : (autoTargetValue !== "" ? autoTargetValue : "Synced")}
                                    </span>
                                  </td>
                                </Fragment>
                              );
                            }

                            if (activeCategory.mode !== "target_actual") {
                              return (
                                <td key={`${metric.id}-${year}`} className="relative min-w-[170px] border border-slate-300 p-1 align-middle">
                                  {useSelectInput ? (
                                    <select
                                      id={valueCellId}
                                      value={current.actualMatrix[year] ?? ""}
                                      onChange={(event) => setMetricMatrixValue(metric, year, "single", event.target.value)}
                                      className={valueInputClass}
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
                                      id={valueCellId}
                                      type={numericInput ? "number" : "text"}
                                      step={valueType === "integer" ? "1" : "0.01"}
                                      min={numericInput ? 0 : undefined}
                                      placeholder={placeholder}
                                      value={current.actualMatrix[year] ?? ""}
                                      onChange={(event) => setMetricMatrixValue(metric, year, "single", event.target.value)}
                                      className={valueInputClass}
                                    />
                                  )}
                                  {valueMissing && (
                                    <span className="pointer-events-none absolute right-1 top-1 rounded-sm bg-amber-100 px-1 py-0 text-[9px] font-semibold text-amber-700">
                                      Req
                                    </span>
                                  )}
                                  {valueMissing && (
                                    <p className="mt-1 text-[10px] font-medium text-amber-700">
                                      Required
                                    </p>
                                  )}
                                </td>
                              );
                            }

                            return (
                              <Fragment key={`${metric.id}-${year}`}>
                                <td className="relative min-w-[150px] border border-slate-300 p-1 align-middle">
                                  {useSelectInput ? (
                                    <select
                                      id={targetCellId}
                                      value={current.targetMatrix[year] ?? ""}
                                      onChange={(event) => setMetricMatrixValue(metric, year, "target", event.target.value)}
                                      className={targetInputClass}
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
                                      id={targetCellId}
                                      type={numericInput ? "number" : "text"}
                                      step={valueType === "integer" ? "1" : "0.01"}
                                      min={numericInput ? 0 : undefined}
                                      placeholder={placeholder}
                                      value={current.targetMatrix[year] ?? ""}
                                      onChange={(event) => setMetricMatrixValue(metric, year, "target", event.target.value)}
                                      className={targetInputClass}
                                    />
                                  )}
                                  {targetMissing && (
                                    <span className="pointer-events-none absolute right-1 top-1 rounded-sm bg-amber-100 px-1 py-0 text-[9px] font-semibold text-amber-700">
                                      Req
                                    </span>
                                  )}
                                  {targetMissing && (
                                    <p className="mt-1 text-[10px] font-medium text-amber-700">
                                      Required target
                                    </p>
                                  )}
                                </td>
                                <td className="relative min-w-[150px] border border-slate-300 p-1 align-middle">
                                  {useSelectInput ? (
                                    <select
                                      id={actualCellId}
                                      value={current.actualMatrix[year] ?? ""}
                                      onChange={(event) => setMetricMatrixValue(metric, year, "actual", event.target.value)}
                                      className={actualInputClass}
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
                                      id={actualCellId}
                                      type={numericInput ? "number" : "text"}
                                      step={valueType === "integer" ? "1" : "0.01"}
                                      min={numericInput ? 0 : undefined}
                                      placeholder={placeholder}
                                      value={current.actualMatrix[year] ?? ""}
                                      onChange={(event) => setMetricMatrixValue(metric, year, "actual", event.target.value)}
                                      className={actualInputClass}
                                    />
                                  )}
                                  {actualMissing && (
                                    <span className="pointer-events-none absolute right-1 top-1 rounded-sm bg-amber-100 px-1 py-0 text-[9px] font-semibold text-amber-700">
                                      Req
                                    </span>
                                  )}
                                  {actualMissing && (
                                    <p className="mt-1 text-[10px] font-medium text-amber-700">
                                      Required actual
                                    </p>
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
                          colSpan={activeCategory.mode === "target_actual" ? activeSchoolYears.length * 2 + 1 : activeSchoolYears.length + 1}
                          className="border border-slate-300 bg-slate-50 px-2 py-6 text-center text-sm text-slate-500"
                        >
                          No required compliance indicators found.
                        </td>
                      </tr>
                    )}
                    {activeCategory.metrics.length > 0 && filteredActiveMetrics.length === 0 && (
                      <tr>
                        <td
                          colSpan={activeCategory.mode === "target_actual" ? activeSchoolYears.length * 2 + 1 : activeSchoolYears.length + 1}
                          className="border border-slate-300 bg-slate-50 px-2 py-6 text-center text-sm text-slate-500"
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
        {academicYearId === ALL_RECORDS_YEAR_ID && (
          <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
            All records is view-only. Select a specific academic year to save or submit.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={isSaving || isSubmissionDataLoading || complianceMetrics.length === 0 || academicYearId === ALL_RECORDS_YEAR_ID}
            title={academicYearId === ALL_RECORDS_YEAR_ID ? "Select a specific academic year to save draft." : undefined}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Target className="h-4 w-4" />
            {isSaving ? "Saving..." : editingSubmissionId ? "Update Draft" : "Save Draft"}
          </button>
          <button
            type="button"
            onClick={() => void handleCreateAndSubmit()}
            disabled={
              isSaving
              || isSubmissionDataLoading
              || complianceMetrics.length === 0
              || academicYearId === ALL_RECORDS_YEAR_ID
              || missingFieldTargets.length > 0
            }
            title={
              academicYearId === ALL_RECORDS_YEAR_ID
                ? "Select a specific academic year to submit."
                : missingFieldTargets.length > 0
                  ? submitBlockedReason || "Complete required fields before submitting."
                  : "Save and submit to monitor"
            }
            className="inline-flex items-center gap-2 rounded-sm border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Send className="h-4 w-4" />
            Submit
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
    </section>
  );
}
