import {
  Fragment,
  memo,
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
import { useAuth } from "@/context/Auth";
import { useIndicatorData } from "@/context/IndicatorData";
import { COOKIE_SESSION_TOKEN, getApiBaseUrl } from "@/lib/api";
import type {
  AcademicYearOption,
  FormSubmissionHistoryEntry,
  GroupBWorkspaceResetTarget,
  IndicatorMetric,
  IndicatorSubmission,
  IndicatorSubmissionItem,
  IndicatorSubmissionPayload,
  IndicatorSubmissionFileEntry,
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

interface SchoolIndicatorPanelProps {
  initialAcademicYearId?: string;
}

const WORKSPACE_YEAR_STORAGE_KEY_PREFIX = "cspams:school-indicator-panel:workspace-year";

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

type WorkspaceDataOwner = "backend" | "local" | "blank";

type GroupBWorkspaceMode =
  | "blank"
  | "draft"
  | "submitted_locked"
  | "submitted_editing"
  | "read_only_year";

type WorkspaceSaveSection =
  | "school_achievements"
  | "key_performance"
  | "bmef"
  | "smea";

function buildWorkspaceSubmissionFingerprint(
  academicYearId: string | null,
  submission: IndicatorSubmission | null,
): string {
  if (!academicYearId) {
    return "";
  }

  return [
    academicYearId,
    submission?.id ?? "blank",
    submission?.status ?? "",
    submission?.version ?? "",
    submission?.updatedAt ?? "",
    submission?.submittedAt ?? "",
    submission?.reviewedAt ?? "",
    submission?.completion?.hasBmefFile ? "bmef:1" : "bmef:0",
    submission?.completion?.hasSmeaFile ? "smea:1" : "smea:0",
  ].join(":");
}

function deriveWorkspaceModeFromSubmission(
  submission: IndicatorSubmission | null,
  options: {
    isSelectedYearEditable: boolean;
    isWorkspaceReadOnly: boolean;
    isSubmittedEditMode: boolean;
  },
): GroupBWorkspaceMode {
  if (!submission) {
    if (options.isWorkspaceReadOnly || !options.isSelectedYearEditable) {
      return "read_only_year";
    }

    return "blank";
  }

  if (!isSubmittedWorkflowStatus(submission.status)) {
    if (options.isWorkspaceReadOnly || !options.isSelectedYearEditable) {
      return "read_only_year";
    }

    return "draft";
  }

  if (options.isWorkspaceReadOnly || !options.isSelectedYearEditable) {
    return "submitted_locked";
  }

  return options.isSubmittedEditMode ? "submitted_editing" : "submitted_locked";
}

interface YearWorkspaceState {
  visibleSchoolYears: string[];
  visibleAcademicYears: AcademicYearOption[];
  workspaceAcademicYearId: string;
  selectedSchoolYearLabel: string | null;
  workspaceSchoolYears: string[];
  editableSchoolYears: string[];
  requiredSchoolYears: string[];
  requiredYearsInScope: string[];
  lockedSchoolYears: string[];
  isWorkspaceReadOnly: boolean;
}

const SCHOOL_ACHIEVEMENTS_METRIC_CODES = [
  // Keep this list aligned with backend GroupBWorkspaceDefinition::metricCodesFor(SCHOOL_ACHIEVEMENTS).
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
  // Keep this list aligned with backend GroupBWorkspaceDefinition::metricCodesFor(KEY_PERFORMANCE).
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
const SYNC_LOCKED_METRIC_CODES = new Set<string>();
const FORCE_MANUAL_METRIC_CODES = new Set([
  "IMETA_ENROLL_TOTAL",
  "TEACHERS_TOTAL",
  "TEACHERS_MALE",
  "TEACHERS_FEMALE",
]);
const BASE_SCHOOL_YEAR_START = 2025;
const SCHOOL_YEAR_WINDOW_SIZE = 5;
const SCHOOL_YEAR_START_MONTH = 6;
const INDICATOR_DRAFT_STORAGE_KEY_PREFIX = "cspams.schoolhead.indicator.autosave";
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

function hasUploadedReportFile(entry: IndicatorSubmissionFileEntry | null | undefined): boolean {
  if (!entry) {
    return false;
  }

  return Boolean(
    entry.uploaded
    || entry.downloadUrl
    || entry.path
    || entry.originalFilename
    || entry.uploadedAt
    || ((entry.sizeBytes ?? 0) > 0),
  );
}

function isSubmittedWorkflowStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").toLowerCase();
  return normalized === "submitted" || normalized === "validated";
}

function isDraftOrReturnedWorkflowStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").toLowerCase();
  return normalized === "draft" || normalized === "returned";
}

function toSubmissionRecencyScore(submission: IndicatorSubmission | null | undefined): number {
  const timestamp = new Date(
    submission?.submittedAt
    ?? submission?.updatedAt
    ?? submission?.createdAt
    ?? 0,
  ).getTime();
  const version = Number(submission?.version ?? 0);
  return timestamp * 1_000 + (Number.isFinite(version) ? version : 0);
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

function normalizeMetricName(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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

function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : "-";
  }

  return String(value);
}

function formatReferenceCellValue(value: unknown): string {
  return formatDisplayValue(value);
}

function isForceManualMetric(metric: IndicatorMetric): boolean {
  const normalizedCode = normalizeMetricCode(metric.code);
  return Array.from(FORCE_MANUAL_METRIC_CODES).some((manualCode) => (
    normalizedCode === manualCode
    || normalizedCode.endsWith(`_${manualCode}`)
    || normalizedCode.includes(manualCode)
  ));
}

function metricIsAutoCalculated(metric: IndicatorMetric): boolean {
  // Key Performance rows are operator-fillable in the School Head form.
  // Even if backend metadata marks the metric as auto-calculated, keep UI editable.
  const normalizedCode = normalizeMetricCode(metric.code);
  if (
    TARGET_ACTUAL_METRIC_CODES.has(normalizedCode)
    || isForceManualMetric(metric)
  ) {
    return false;
  }
  return Boolean(metric.isAutoCalculated);
}

function metricUsesSyncedLockedTotals(metric: IndicatorMetric): boolean {
  if (isForceManualMetric(metric)) {
    return false;
  }
  const normalizedCode = normalizeMetricCode(metric.code);
  return SYNC_LOCKED_METRIC_CODES.has(normalizedCode);
}

function categoryTabLabel(category: ComplianceCategory): string {
  if (category.id === "school_achievements_learning_outcomes") return "School Achievements";
  if (category.id === "key_performance_indicators") return "Key Performance";
  return category.label;
}

function workspaceSaveSectionForCategory(categoryId: string | null | undefined): WorkspaceSaveSection | null {
  if (categoryId === "school_achievements_learning_outcomes") {
    return "school_achievements";
  }
  if (categoryId === "key_performance_indicators") {
    return "key_performance";
  }
  return null;
}

function workspaceSaveSectionLabel(section: WorkspaceSaveSection | null): string {
  switch (section) {
    case "school_achievements":
      return "School Achievements";
    case "key_performance":
      return "Key Performance";
    case "bmef":
      return "BMEF";
    case "smea":
      return "SMEA";
    default:
      return "Workspace";
  }
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

function buildVisibleSchoolYearWindow(years: Iterable<string>, now: Date = new Date()): string[] {
  const fallbackYears = buildFallbackSchoolYears(now);
  const mergedYears = sortSchoolYearsAscending([...Array.from(years), ...fallbackYears]).filter((year) => {
    const start = schoolYearStartValue(year);
    return start !== null && start >= BASE_SCHOOL_YEAR_START;
  });

  const latestFive = mergedYears.slice(-SCHOOL_YEAR_WINDOW_SIZE);
  if (latestFive.length === SCHOOL_YEAR_WINDOW_SIZE) {
    return latestFive;
  }

  const latestStart =
    schoolYearStartValue(latestFive[latestFive.length - 1] ?? null)
    ?? schoolYearStartValue(fallbackYears[fallbackYears.length - 1] ?? null)
    ?? currentSchoolYearStart(now);
  const windowStart = latestStart - (SCHOOL_YEAR_WINDOW_SIZE - 1);

  return Array.from({ length: SCHOOL_YEAR_WINDOW_SIZE }, (_, offset) => {
    const fromYear = windowStart + offset;
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

function buildMetricEntriesForHydration(metrics: IndicatorMetric[]): MetricEntryState {
  const next: MetricEntryState = {};

  for (const metric of metrics) {
    next[metric.id] = buildDefaultEntry(metric);
  }

  return next;
}

function buildMetricEntriesForLocalRestore(metrics: IndicatorMetric[], snapshot: MetricEntryState): MetricEntryState {
  const next: MetricEntryState = {};

  for (const metric of metrics) {
    const restored = snapshot[metric.id];
    next[metric.id] = restored
      ? {
          ...buildDefaultEntry(metric),
          ...restored,
          targetMatrix: {
            ...buildDefaultEntry(metric).targetMatrix,
            ...(restored.targetMatrix ?? {}),
          },
          actualMatrix: {
            ...buildDefaultEntry(metric).actualMatrix,
            ...(restored.actualMatrix ?? {}),
          },
        }
      : buildDefaultEntry(metric);
  }

  return next;
}

function buildResetEntryForMetric(
  metric: IndicatorMetric,
  selectedYears: string[],
  currentEntry?: MetricEntryValue,
): MetricEntryValue {
  const dataType = metricDataType(metric);
  const defaultEntry = buildDefaultEntry(metric);
  const nextEntry: MetricEntryValue =
    dataType === "yearly_matrix" && currentEntry
      ? {
          ...defaultEntry,
          ...currentEntry,
          targetMatrix: {
            ...defaultEntry.targetMatrix,
            ...(currentEntry.targetMatrix ?? {}),
          },
          actualMatrix: {
            ...defaultEntry.actualMatrix,
            ...(currentEntry.actualMatrix ?? {}),
          },
        }
      : defaultEntry;

  if (dataType === "number" || dataType === "currency") {
    nextEntry.targetValue = "0";
    nextEntry.actualValue = "0";
  } else if (dataType === "enum") {
    nextEntry.targetEnum = "";
    nextEntry.actualEnum = "";
  } else if (dataType === "yes_no") {
    nextEntry.targetBoolean = "";
    nextEntry.actualBoolean = "";
  } else if (dataType === "text") {
    nextEntry.targetText = "";
    nextEntry.actualText = "";
  } else if (dataType === "yearly_matrix") {
    const metricScopedYears = resolveMetricYearsInScope(metric, selectedYears);
    const yearsToReset = metricScopedYears.length > 0 ? metricScopedYears : selectedYears;
    for (const year of yearsToReset) {
      nextEntry.targetMatrix[year] = "0";
      nextEntry.actualMatrix[year] = "0";
    }
  }

  nextEntry.remarks = "";
  return nextEntry;
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

function compareAcademicYearOptions(a: AcademicYearOption, b: AcademicYearOption): number {
  const aStart = schoolYearStartValue(a.name);
  const bStart = schoolYearStartValue(b.name);

  if (aStart !== null && bStart !== null) {
    return aStart - bStart;
  }
  if (aStart !== null) {
    return -1;
  }
  if (bStart !== null) {
    return 1;
  }

  return String(a.name).localeCompare(String(b.name));
}

function deriveYearWorkspaceState(params: {
  workspaceAcademicYearId: string;
  eligibleAcademicYears: AcademicYearOption[];
  visibleSchoolYears: string[];
  schoolYearByAcademicYearId: Map<string, string>;
  academicYearBySchoolYearLabel: Map<string, AcademicYearOption>;
  currentSchoolYearStartValue: number;
}): YearWorkspaceState {
  const {
    workspaceAcademicYearId,
    eligibleAcademicYears,
    visibleSchoolYears,
    schoolYearByAcademicYearId,
    academicYearBySchoolYearLabel,
    currentSchoolYearStartValue,
  } = params;

  const orderedFromWindow = visibleSchoolYears
    .map((label) => academicYearBySchoolYearLabel.get(label))
    .filter((year): year is AcademicYearOption => Boolean(year));
  const seen = new Set<string>();
  const uniqueOrdered = orderedFromWindow.filter((year) => {
    if (seen.has(year.id)) {
      return false;
    }
    seen.add(year.id);
    return true;
  });
  const remaining = eligibleAcademicYears
    .filter((year) => {
      const normalized = normalizeSchoolYearLabel(year.name);
      return Boolean(normalized && visibleSchoolYears.includes(normalized) && !seen.has(year.id));
    })
    .sort(compareAcademicYearOptions);
  const visibleAcademicYears = [...uniqueOrdered, ...remaining];

  const fallbackAcademicYearId = visibleAcademicYears.find((year) => year.isCurrent)?.id
    ?? visibleAcademicYears[0]?.id
    ?? "";
  const workspaceAcademicYearInWindow = visibleAcademicYears.some((year) => year.id === workspaceAcademicYearId)
    ? workspaceAcademicYearId
    : fallbackAcademicYearId;
  const selectedSchoolYearLabel = schoolYearByAcademicYearId.get(workspaceAcademicYearInWindow) ?? null;
  const workspaceSchoolYears = selectedSchoolYearLabel ? [selectedSchoolYearLabel] : [];
  const requiredSchoolYears = visibleSchoolYears.filter((year) => {
    const yearStart = schoolYearStartValue(year);
    if (yearStart === null) {
      return true;
    }
    return yearStart <= currentSchoolYearStartValue;
  });
  const editableSchoolYears = visibleSchoolYears.filter((year) => {
    const yearStart = schoolYearStartValue(year);
    if (yearStart === null) {
      return false;
    }
    return yearStart <= currentSchoolYearStartValue + 1;
  });
  const requiredYearsInScope = workspaceSchoolYears.filter((year) => requiredSchoolYears.includes(year));
  const lockedSchoolYears = visibleSchoolYears.filter((year) => !editableSchoolYears.includes(year));
  const isWorkspaceReadOnly = !selectedSchoolYearLabel;

  return {
    visibleSchoolYears,
    visibleAcademicYears,
    workspaceAcademicYearId: workspaceAcademicYearInWindow,
    selectedSchoolYearLabel,
    workspaceSchoolYears,
    editableSchoolYears,
    requiredSchoolYears,
    requiredYearsInScope,
    lockedSchoolYears,
    isWorkspaceReadOnly,
  };
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

function resolveTypedPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return raw as Record<string, unknown>;
}

function extractTypedScalar(value: Record<string, unknown> | null | undefined): string {
  const typed = resolveTypedPayload(value);
  if (!typed) {
    return "";
  }

  const scalar = typed.value ?? typed["scalar_value"] ?? typed["raw_value"];
  if (scalar === null || scalar === undefined) {
    return "";
  }

  return String(scalar);
}

function extractTypedMatrix(value: Record<string, unknown> | null | undefined): Record<string, string> {
  const typed = resolveTypedPayload(value);
  if (!typed) {
    return {};
  }

  const values = typed.values ?? typed["matrix_values"];
  if (!values || typeof values !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(values as Record<string, unknown>).map(([year, entry]) => [year, String(entry ?? "")]),
  );
}

function indicatorField(indicator: IndicatorSubmissionItem, key: string): unknown {
  return (indicator as unknown as Record<string, unknown>)[key];
}

function buildEntryFromSubmission(metric: IndicatorMetric, indicator: IndicatorSubmissionItem): MetricEntryValue {
  const entry = buildDefaultEntry(metric);
  entry.remarks = String(indicatorField(indicator, "remarks") ?? "").trim();

  const dataType = metricDataType(metric);
  const targetTyped = resolveTypedPayload(
    indicatorField(indicator, "targetTypedValue")
      ?? indicatorField(indicator, "target_typed_value")
      ?? indicatorField(indicator, "target"),
  );
  const actualTyped = resolveTypedPayload(
    indicatorField(indicator, "actualTypedValue")
      ?? indicatorField(indicator, "actual_typed_value")
      ?? indicatorField(indicator, "actual"),
  );
  const targetDisplay = indicatorField(indicator, "targetDisplay")
    ?? indicatorField(indicator, "target_display")
    ?? indicatorField(indicator, "targetValue")
    ?? indicatorField(indicator, "target_value");
  const actualDisplay = indicatorField(indicator, "actualDisplay")
    ?? indicatorField(indicator, "actual_display")
    ?? indicatorField(indicator, "actualValue")
    ?? indicatorField(indicator, "actual_value");

  if (dataType === "yearly_matrix") {
    const targetByYear = extractTypedMatrix(targetTyped);
    const actualByYear = extractTypedMatrix(actualTyped);
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
      targetTyped?.value ?? targetDisplay,
    );
    entry.actualBoolean = normalizeBooleanInput(
      actualTyped?.value ?? actualDisplay,
    );
    return entry;
  }

  if (dataType === "enum") {
    entry.targetEnum = extractTypedScalar(targetTyped) || String(targetDisplay ?? "");
    entry.actualEnum = extractTypedScalar(actualTyped) || String(actualDisplay ?? "");
    return entry;
  }

  if (dataType === "text") {
    entry.targetText = extractTypedScalar(targetTyped) || String(targetDisplay ?? "");
    entry.actualText = extractTypedScalar(actualTyped) || String(actualDisplay ?? "");
    return entry;
  }

  entry.targetValue = Number.isFinite(Number(targetDisplay)) ? String(targetDisplay) : "";
  entry.actualValue = Number.isFinite(Number(actualDisplay)) ? String(actualDisplay) : "";
  return entry;
}

function resolveMetricFromIndicator(
  indicator: IndicatorSubmissionItem,
  metricsById: Map<string, IndicatorMetric>,
  metricsByCode: Map<string, IndicatorMetric>,
  metricsByName: Map<string, IndicatorMetric>,
): IndicatorMetric | null {
  const record = indicator as unknown as Record<string, unknown>;
  const directMetric = (record.metric ?? null) as Record<string, unknown> | null;
  const idCandidates = [
    directMetric?.id,
    record.metricId,
    record.metric_id,
    record.performance_metric_id,
  ];

  for (const candidate of idCandidates) {
    const metricId = String(candidate ?? "").trim();
    if (!metricId) {
      continue;
    }

    const metric = metricsById.get(metricId);
    if (metric) {
      return metric;
    }
  }

  const codeCandidates = [
    directMetric?.code,
    record.metricCode,
    record.metric_code,
  ];
  for (const candidate of codeCandidates) {
    const normalizedCode = normalizeMetricCode(String(candidate ?? ""));
    if (!normalizedCode) {
      continue;
    }

    const metric = metricsByCode.get(normalizedCode);
    if (metric) {
      return metric;
    }
  }

  const nameCandidates = [
    directMetric?.name,
    record.metricName,
    record.metric_name,
  ];
  for (const candidate of nameCandidates) {
    const normalizedName = normalizeMetricName(String(candidate ?? ""));
    if (!normalizedName) {
      continue;
    }

    const metric = metricsByName.get(normalizedName);
    if (metric) {
      return metric;
    }
  }

  return null;
}

function submissionRows(submission: IndicatorSubmission | null | undefined): IndicatorSubmissionItem[] {
  if (!submission) {
    return [];
  }

  const directIndicators = Array.isArray(submission.indicators) ? submission.indicators : [];
  if (directIndicators.length > 0) {
    return directIndicators;
  }

  return Array.isArray(submission.items) ? submission.items : [];
}

function submissionHasHydratableRows(submission: IndicatorSubmission | null | undefined): boolean {
  return submissionRows(submission).length > 0;
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

function isSessionExpiredMessage(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("authentication check failed")
    || normalized.includes("please refresh and sign in again")
    || normalized.includes("session expired")
    || normalized.includes("signed out")
    || normalized.includes("unauthenticated")
  );
}

function normalizeSessionMessage(value: string | null | undefined): string {
  if (!isSessionExpiredMessage(value)) {
    return String(value ?? "");
  }

  return "Your session expired. Please sign in again.";
}

function toGroupBActionErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  const normalized = message.toLowerCase();
  if (
    normalized.includes("timeout")
    || normalized.includes("timed out")
    || normalized.includes("network")
    || normalized.includes("fetch")
  ) {
    return "Request took too long. Please save your draft first, then try again.";
  }
  return message;
}

function SchoolIndicatorPanelComponent({
  initialAcademicYearId,
}: SchoolIndicatorPanelProps) {
  const { user, apiToken } = useAuth();
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
    loadSubmissionsForYear,
    bootstrapSubmission,
    createSubmission,
    updateSubmission,
    fetchSubmission,
    resetSubmissionWorkspace,
    uploadSubmissionFile,
    downloadSubmissionFile,
    submitSubmission,
    loadHistory,
  } = useIndicatorData();

  const [workspaceAcademicYearId, setWorkspaceAcademicYearId] = useState("");
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
  const [showOptionalNotes, setShowOptionalNotes] = useState(false);
  const [pendingLocalDraft, setPendingLocalDraft] = useState<LocalDraftSnapshot | null>(null);
  const [restoreBannerDismissed, setRestoreBannerDismissed] = useState(false);
  const [serverAutosaveAt, setServerAutosaveAt] = useState<string | null>(null);
  const [autosaveError, setAutosaveError] = useState("");
  const [isAutosavingDraft, setIsAutosavingDraft] = useState(false);
  const [uploadingFileType, setUploadingFileType] = useState<IndicatorSubmissionFileType | null>(null);
  const [savingSection, setSavingSection] = useState<WorkspaceSaveSection | null>(null);
  const [isWorkspaceTransitioning, setIsWorkspaceTransitioning] = useState(false);
  const [isGroupBActionRunning, setIsGroupBActionRunning] = useState(false);
  const [showEditConfirmModal, setShowEditConfirmModal] = useState(false);
  const [isSubmittedEditMode, setIsSubmittedEditMode] = useState(false);
  const [activeWorkspaceSubmission, setActiveWorkspaceSubmission] = useState<IndicatorSubmission | null>(null);
  const [optimisticSubmittedByType, setOptimisticSubmittedByType] = useState<{
    bmef: boolean;
    smea: boolean;
  }>({ bmef: false, smea: false });
  const [uploadErrorByType, setUploadErrorByType] = useState<Record<IndicatorSubmissionFileType, string>>({
    bmef: "",
    smea: "",
  });
  const workspaceYearSelectionStorageKey = useMemo(() => {
    const schoolScopeId = user?.schoolId ? String(user.schoolId) : "";
    const userScopeId = user?.id ? String(user.id) : "anonymous";
    return schoolScopeId
      ? `${WORKSPACE_YEAR_STORAGE_KEY_PREFIX}:${userScopeId}:${schoolScopeId}`
      : "";
  }, [user?.id, user?.schoolId]);

  const autosaveInFlightRef = useRef(false);
  const lastAutosaveFingerprintRef = useRef("");
  const criticalActionInFlightRef = useRef(false);
  const groupBActionInFlightRef = useRef(false);
  const transitionEpochRef = useRef(0);
  const workspaceYearRequestRef = useRef(0);
  const workspaceFingerprintRef = useRef("");
  const metricEntriesRef = useRef<MetricEntryState>({});
  const notesRef = useRef("");
  const categoryRailRef = useRef<HTMLDivElement | null>(null);
  const indicatorTableRef = useRef<HTMLDivElement | null>(null);
  const bmefInputRef = useRef<HTMLInputElement | null>(null);
  const smeaInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    metricEntriesRef.current = metricEntries;
  }, [metricEntries]);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const normalizedSubmitError = useMemo(() => normalizeSessionMessage(submitError), [submitError]);
  const normalizedIndicatorError = useMemo(() => normalizeSessionMessage(error), [error]);

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
      [...academicYears]
        .filter((year) => {
          const start = schoolYearStartValue(year.name);
          return start === null || start >= BASE_SCHOOL_YEAR_START;
        })
        .sort((a, b) => {
          const aStart = schoolYearStartValue(a.name);
          const bStart = schoolYearStartValue(b.name);
          if (aStart !== null && bStart !== null) {
            return aStart - bStart;
          }
          if (aStart !== null) {
            return -1;
          }
          if (bStart !== null) {
            return 1;
          }
          return String(a.name).localeCompare(String(b.name));
        }),
    [academicYears],
  );
  const visibleSchoolYears = useMemo(() => {
    const metricYearsUnion = orderedComplianceMetrics.flatMap((metric) => metricYears(metric));
    const academicYearLabels = eligibleAcademicYears
      .map((year) => normalizeSchoolYearLabel(year.name))
      .filter((year): year is string => Boolean(year));
    return buildVisibleSchoolYearWindow([...metricYearsUnion, ...academicYearLabels]);
  }, [eligibleAcademicYears, orderedComplianceMetrics]);
  const schoolYearByAcademicYearId = useMemo(() => {
    const map = new Map<string, string>();

    for (const year of eligibleAcademicYears) {
      const normalized = normalizeSchoolYearLabel(year.name);
      if (!normalized) {
        continue;
      }

      const matched = visibleSchoolYears.find((candidate) => normalizeSchoolYearLabel(candidate) === normalized);
      if (matched) {
        map.set(year.id, matched);
      }
    }

    return map;
  }, [eligibleAcademicYears, visibleSchoolYears]);
  const academicYearBySchoolYearLabel = useMemo(() => {
    const map = new Map<string, AcademicYearOption>();

    for (const year of eligibleAcademicYears) {
      const normalized = normalizeSchoolYearLabel(year.name);
      if (!normalized || map.has(normalized)) {
        continue;
      }
      map.set(normalized, year);
    }

    return map;
  }, [eligibleAcademicYears]);
  const yearWorkspaceState = useMemo(
    () =>
      deriveYearWorkspaceState({
        workspaceAcademicYearId,
        eligibleAcademicYears,
        visibleSchoolYears,
        schoolYearByAcademicYearId,
        academicYearBySchoolYearLabel,
        currentSchoolYearStartValue: currentSchoolYearStart(),
      }),
    [workspaceAcademicYearId, academicYearBySchoolYearLabel, eligibleAcademicYears, schoolYearByAcademicYearId, visibleSchoolYears],
  );
  const activeAcademicYearId = yearWorkspaceState.workspaceAcademicYearId;
  const selectedSchoolYearLabel = yearWorkspaceState.selectedSchoolYearLabel;
  const workspaceSchoolYears = yearWorkspaceState.workspaceSchoolYears;
  const requiredSchoolYears = useMemo(
    () => workspaceSchoolYears,
    [workspaceSchoolYears],
  );
  const requiredSchoolYearSet = useMemo(() => new Set(requiredSchoolYears), [requiredSchoolYears]);
  const currentAcademicYearId = useMemo(
    () => eligibleAcademicYears.find((year) => year.isCurrent)?.id ?? "",
    [eligibleAcademicYears],
  );
  const currentSchoolYearLabel = useMemo(() => {
    if (!currentAcademicYearId) {
      return visibleSchoolYears[visibleSchoolYears.length - 1] ?? null;
    }

    return schoolYearByAcademicYearId.get(currentAcademicYearId) ?? (visibleSchoolYears[visibleSchoolYears.length - 1] ?? null);
  }, [currentAcademicYearId, schoolYearByAcademicYearId, visibleSchoolYears]);
  useEffect(() => {
    if (workspaceAcademicYearId || eligibleAcademicYears.length === 0) {
      return;
    }

    const storedAcademicYearId = (
      typeof window !== "undefined" && workspaceYearSelectionStorageKey
        ? window.sessionStorage.getItem(workspaceYearSelectionStorageKey) ?? ""
        : ""
    );
    const preferredStoredAcademicYearId = storedAcademicYearId
      && eligibleAcademicYears.some((year) => year.id === storedAcademicYearId)
      ? storedAcademicYearId
      : "";
    const preferredInitialAcademicYearId = initialAcademicYearId
      && eligibleAcademicYears.some((year) => year.id === initialAcademicYearId)
      ? initialAcademicYearId
      : "";

    const nextAcademicYearId = preferredStoredAcademicYearId || preferredInitialAcademicYearId || yearWorkspaceState.workspaceAcademicYearId;
    if (!nextAcademicYearId) {
      return;
    }

    setWorkspaceAcademicYearId(nextAcademicYearId);
  }, [eligibleAcademicYears, initialAcademicYearId, workspaceAcademicYearId, workspaceYearSelectionStorageKey, yearWorkspaceState.workspaceAcademicYearId]);

  useEffect(() => {
    if (typeof window === "undefined" || !workspaceYearSelectionStorageKey || !workspaceAcademicYearId) {
      return;
    }

    window.sessionStorage.setItem(workspaceYearSelectionStorageKey, workspaceAcademicYearId);
  }, [workspaceAcademicYearId, workspaceYearSelectionStorageKey]);

  const autosaveUserScopeId = user?.id ? String(user.id) : "anonymous";
  const autosaveSchoolScopeId = user?.schoolId ? String(user.schoolId) : "unassigned";
  const autosaveKey = useMemo(
    () =>
      `${INDICATOR_DRAFT_STORAGE_KEY_PREFIX}:${autosaveUserScopeId}:${autosaveSchoolScopeId}:${activeAcademicYearId || "unselected"}`,
    [activeAcademicYearId, autosaveSchoolScopeId, autosaveUserScopeId],
  );
  const localAutosaveAcademicYearRef = useRef<string | null>(activeAcademicYearId);
  const localAutosaveEditingSubmissionIdRef = useRef<string | null>(editingSubmissionId);
  const localAutosaveEpochRef = useRef(0);
  const hasUserSelectedAcademicYearRef = useRef(false);
  // Tracks the current workspace submission status so the autosave write effect
  // (declared before latestActiveWorkspaceSubmission is in scope) can still
  // read the status without a forward-reference compile error.
  const latestWorkspaceStatusRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    localAutosaveAcademicYearRef.current = activeAcademicYearId;
  }, [activeAcademicYearId]);
  useEffect(() => {
    localAutosaveEditingSubmissionIdRef.current = editingSubmissionId;
  }, [editingSubmissionId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (complianceMetrics.length === 0) return;
    if (!activeAcademicYearId) return;
    // Do not overwrite autosave with submitted/validated workspace data.
    // Autosave is only for draft/returned submissions — once a submission is
    // submitted or validated the backend is the authoritative source of truth
    // and we must never allow a stale autosave to shadow it on the next load.
    // (latestWorkspaceStatusRef is used here because latestActiveWorkspaceSubmission
    // is declared after this effect; the ref is kept in sync via a layout effect.)
    if (isSubmittedWorkflowStatus(latestWorkspaceStatusRef.current)) return;

    const guardAcademicYearId = activeAcademicYearId;
    const guardWorkspaceSubmissionId = activeWorkspaceSubmissionIdRef.current;
    const guardEditingSubmissionId = editingSubmissionId;
    const guardAutosaveEpoch = localAutosaveEpochRef.current;

    const timer = window.setTimeout(() => {
      if (
        localAutosaveAcademicYearRef.current !== guardAcademicYearId
        || activeWorkspaceSubmissionIdRef.current !== guardWorkspaceSubmissionId
        || localAutosaveEditingSubmissionIdRef.current !== guardEditingSubmissionId
        || localAutosaveEpochRef.current !== guardAutosaveEpoch
      ) {
        return;
      }
      const savedAt = new Date().toISOString();
      try {
        localStorage.setItem(
          autosaveKey,
          JSON.stringify({
            academicYearId: guardAcademicYearId,
            notes,
            metricEntries,
            editingSubmissionId: guardEditingSubmissionId,
            savedAt,
          }),
        );
        setAutosaveAt(savedAt);
      } catch {
        // Ignore autosave storage failures.
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [activeAcademicYearId, autosaveKey, complianceMetrics.length, editingSubmissionId, metricEntries, notes]);

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
  const preferredAcademicYearIdFromSubmissions = useMemo(() => {
    const priorityByStatus: Record<string, number> = {
      submitted: 0,
      validated: 1,
      returned: 2,
      draft: 3,
    };

    const ranked = sortedSubmissions
      .filter((submission) => submission.academicYear?.id)
      .slice()
      .sort((left, right) => {
        const recencyDelta = toSubmissionRecencyScore(right) - toSubmissionRecencyScore(left);
        if (recencyDelta !== 0) {
          return recencyDelta;
        }

        const leftStatus = String(left.status ?? "").toLowerCase();
        const rightStatus = String(right.status ?? "").toLowerCase();
        const leftRank = priorityByStatus[leftStatus] ?? Number.MAX_SAFE_INTEGER;
        const rightRank = priorityByStatus[rightStatus] ?? Number.MAX_SAFE_INTEGER;
        return leftRank - rightRank;
      });

    return ranked[0]?.academicYear?.id ?? null;
  }, [sortedSubmissions]);
  useEffect(() => {
    if (workspaceAcademicYearId || initialAcademicYearId || isSubmissionDataLoading || hasUserSelectedAcademicYearRef.current) {
      return;
    }

    if (!preferredAcademicYearIdFromSubmissions) {
      return;
    }

    setWorkspaceAcademicYearId(preferredAcademicYearIdFromSubmissions);
  }, [
    initialAcademicYearId,
    isSubmissionDataLoading,
    preferredAcademicYearIdFromSubmissions,
    workspaceAcademicYearId,
  ]);
  const latestValidatedSubmission = useMemo(
    () =>
      sortedSubmissions.find(
        (submission) => String(submission.status ?? "").toLowerCase() === "validated",
      ) ?? null,
    [sortedSubmissions],
  );
  const visibleAcademicYears = yearWorkspaceState.visibleAcademicYears;
  const dropdownAcademicYears = useMemo(
    () => [...visibleAcademicYears].sort(compareAcademicYearOptions),
    [visibleAcademicYears],
  );
  const visibleCategoryMetrics = categoryMetrics;
  const metricCompletionById = useMemo(() => {
    const map = new Map<string, boolean>();

    for (const metric of orderedComplianceMetrics) {
      const current = metricEntries[metric.id] ?? buildDefaultEntry(metric);
      const scopedYears = resolveMetricYearsInScope(metric, workspaceSchoolYears);
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
  }, [metricEntries, orderedComplianceMetrics, requiredSchoolYearSet, workspaceSchoolYears]);
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
      const scopedYears = resolveMetricYearsInScope(metric, workspaceSchoolYears);
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
  }, [categoryLookupByMetricId, metricEntries, orderedComplianceMetrics, requiredSchoolYearSet, workspaceSchoolYears]);
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
  const submissionMissingSummaryById = useMemo(() => {
    const summary = new Map<string, { missingCount: number; reason: string }>();
    const metricsById = new Map(complianceMetrics.map((metric) => [metric.id, metric]));
    const metricsByCode = new Map(complianceMetrics.map((metric) => [normalizeMetricCode(metric.code), metric]));
    const metricsByName = new Map(complianceMetrics.map((metric) => [normalizeMetricName(metric.name), metric]));

    for (const submission of sortedSubmissions) {
      const indicatorByMetricId = new Map<string, IndicatorSubmissionItem>();
      for (const indicator of submissionRows(submission)) {
        const metric = resolveMetricFromIndicator(indicator, metricsById, metricsByCode, metricsByName);
        if (!metric) {
          continue;
        }

        indicatorByMetricId.set(metric.id, indicator);
      }
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
            ? visibleSchoolYears.find((year) => normalizeSchoolYearLabel(year) === submissionYear) ?? null
            : null;
        const submissionYears = matchedSubmissionYear ? [matchedSubmissionYear] : visibleSchoolYears;
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
  }, [categoryLookupByMetricId, complianceMetrics, orderedComplianceMetrics, requiredSchoolYearSet, schoolYearByAcademicYearId, sortedSubmissions, visibleSchoolYears]);
  const scopedSubmissionsForYear = useMemo(
    () => (activeAcademicYearId
      ? sortedSubmissions.filter((submission) => submission.academicYear?.id === activeAcademicYearId)
      : []),
    [activeAcademicYearId, sortedSubmissions],
  );
  const draftSubmissionInScope = useMemo(
    () =>
      scopedSubmissionsForYear.find((submission) => {
        const status = String(submission.status ?? "").toLowerCase();
        return status === "draft";
      }) ?? null,
    [scopedSubmissionsForYear],
  );
  const latestSubmissionInScope = useMemo(
    () => scopedSubmissionsForYear[0] ?? null,
    [scopedSubmissionsForYear],
  );
  const resolvedWorkspaceSubmission = useMemo(
    () => {
      const priorityByStatus: Record<string, number> = {
        submitted: 0,
        validated: 1,
        returned: 2,
        draft: 3,
      };

      const ranked = scopedSubmissionsForYear
        .slice()
        .sort((left, right) => {
          const recencyDelta = toSubmissionRecencyScore(right) - toSubmissionRecencyScore(left);
          if (recencyDelta !== 0) {
            return recencyDelta;
          }

          const leftStatus = String(left.status ?? "").toLowerCase();
          const rightStatus = String(right.status ?? "").toLowerCase();
          const leftRank = priorityByStatus[leftStatus] ?? Number.MAX_SAFE_INTEGER;
          const rightRank = priorityByStatus[rightStatus] ?? Number.MAX_SAFE_INTEGER;

          return leftRank - rightRank;
        });

      return ranked[0] ?? latestSubmissionInScope ?? null;
    },
    [latestSubmissionInScope, scopedSubmissionsForYear],
  );
  const restorableServerSubmissionInScope = useMemo(
    () => draftSubmissionInScope,
    [draftSubmissionInScope],
  );
  const editingSubmissionInScope = useMemo(
    () => scopedSubmissionsForYear.find((submission) => submission.id === editingSubmissionId) ?? null,
    [editingSubmissionId, scopedSubmissionsForYear],
  );
  const editableWorkspaceSubmissionInScope = useMemo(
      () => {
        if (editingSubmissionInScope && isDraftOrReturnedWorkflowStatus(editingSubmissionInScope.status)) {
          return editingSubmissionInScope;
        }

        return scopedSubmissionsForYear
          .filter((submission) => isDraftOrReturnedWorkflowStatus(submission.status))
          .slice()
          .sort((left, right) => toSubmissionRecencyScore(right) - toSubmissionRecencyScore(left))[0] ?? null;
      },
      [editingSubmissionInScope, scopedSubmissionsForYear],
    );
  const preferredWorkspaceSubmission = useMemo(
    () => {
      if (editingSubmissionInScope) {
        return editingSubmissionInScope;
      }

      if (editableWorkspaceSubmissionInScope) {
        return editableWorkspaceSubmissionInScope;
      }

      return resolvedWorkspaceSubmission ?? null;
    },
    [editingSubmissionInScope, editableWorkspaceSubmissionInScope, resolvedWorkspaceSubmission],
  );
  useEffect(() => {
    if (!activeAcademicYearId) {
      setActiveWorkspaceSubmission(null);
      return;
    }

    setActiveWorkspaceSubmission((current) => {
      const currentInScope = (
        current
        && String(current.academicYear?.id ?? "") === String(activeAcademicYearId)
      )
        ? (scopedSubmissionsForYear.find((submission) => submission.id === current.id) ?? current)
        : null;
      if (currentInScope) {
        return currentInScope;
      }

      return preferredWorkspaceSubmission;
    });
  }, [activeAcademicYearId, preferredWorkspaceSubmission, scopedSubmissionsForYear]);
  useEffect(() => {
    const schoolId = user?.schoolId ? String(user.schoolId) : "";
    if (!schoolId || !activeAcademicYearId) {
      return;
    }

    let cancelled = false;
    const requestId = ++workspaceYearRequestRef.current;

    void loadSubmissionsForYear(schoolId, activeAcademicYearId)
      .then((rows) => {
        if (cancelled || workspaceYearRequestRef.current !== requestId) {
          return;
        }

        const inScopeRows = [...rows]
          .filter((submission) => String(submission.academicYear?.id ?? "") === String(activeAcademicYearId))
          .sort((left, right) => toSubmissionRecencyScore(right) - toSubmissionRecencyScore(left));
        const preferredSubmission = (
          inScopeRows.find((submission) => String(submission.status ?? "").toLowerCase() === "returned")
          ?? inScopeRows.find((submission) => String(submission.status ?? "").toLowerCase() === "draft")
          ?? inScopeRows.find((submission) => submission.id === editingSubmissionId)
          ?? inScopeRows.find((submission) => String(submission.status ?? "").toLowerCase() === "submitted")
          ?? inScopeRows[0]
          ?? null
        );

        setActiveWorkspaceSubmission((current) => {
          const currentInScope = (
            current
            && String(current.academicYear?.id ?? "") === String(activeAcademicYearId)
          )
            ? current
            : null;
          if (currentInScope) {
            const matchingRow = inScopeRows.find((submission) => submission.id === currentInScope.id);
            return matchingRow ?? currentInScope;
          }

          return preferredSubmission;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeAcademicYearId, editingSubmissionId, loadSubmissionsForYear, user?.schoolId]);
  const latestActiveWorkspaceSubmission = activeWorkspaceSubmission;
  const mutableActiveWorkspaceSubmission = useMemo(
    () => (
      latestActiveWorkspaceSubmission
      && String(latestActiveWorkspaceSubmission.academicYear?.id ?? "") === String(activeAcademicYearId ?? "")
      && isDraftOrReturnedWorkflowStatus(latestActiveWorkspaceSubmission.status)
        ? latestActiveWorkspaceSubmission
        : null
    ),
    [activeAcademicYearId, latestActiveWorkspaceSubmission],
  );
  const selectedSubmissionForUploads = useMemo(() => {
    return mutableActiveWorkspaceSubmission ?? editableWorkspaceSubmissionInScope;
  }, [editableWorkspaceSubmissionInScope, mutableActiveWorkspaceSubmission]);
  const selectedSubmissionStatus = useMemo(
    () => String(latestActiveWorkspaceSubmission?.status ?? "").toLowerCase(),
    [latestActiveWorkspaceSubmission?.status],
  );
  const isSelectedSubmissionFinalized = useMemo(
    () => selectedSubmissionStatus === "submitted" || selectedSubmissionStatus === "validated",
    [selectedSubmissionStatus],
  );
  // Keep a stable ref so the hydration effect can read the latest submission
  // without adding the whole object to the dep array (which would cause
  // unnecessary re-runs on every reference identity change from refetches).
  const latestActiveWorkspaceSubmissionRef = useRef(latestActiveWorkspaceSubmission);
  const pendingSubmissionDetailRequestRef = useRef<string | null>(null);
  const workspaceDataOwnerRef = useRef<WorkspaceDataOwner>("blank");
  useEffect(() => {
    latestActiveWorkspaceSubmissionRef.current = latestActiveWorkspaceSubmission;
    latestWorkspaceStatusRef.current = latestActiveWorkspaceSubmission?.status;
  }, [latestActiveWorkspaceSubmission]);
  useEffect(() => {
    if (!latestActiveWorkspaceSubmission) {
      return;
    }

    setPendingLocalDraft(null);
    if (
      typeof window !== "undefined"
      && isSelectedSubmissionFinalized
    ) {
      localStorage.removeItem(autosaveKey);
    }
  }, [autosaveKey, isSelectedSubmissionFinalized, latestActiveWorkspaceSubmission]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isSubmissionDataLoading) {
      return;
    }
    if (!activeAcademicYearId) {
      setPendingLocalDraft(null);
      return;
    }
    if (latestActiveWorkspaceSubmission) {
      if (isSelectedSubmissionFinalized) {
        localStorage.removeItem(autosaveKey);
      }
      setPendingLocalDraft(null);
      return;
    }

    try {
      const raw = localStorage.getItem(autosaveKey);
      if (!raw) {
        setPendingLocalDraft(null);
        return;
      }

      const persisted = JSON.parse(raw) as {
        academicYearId?: string;
        notes?: string;
        metricEntries?: MetricEntryState;
        savedAt?: string;
        editingSubmissionId?: string;
      };

      const hasDraft =
        Boolean((persisted.notes ?? "").trim())
        || hasMeaningfulMetricEntries(persisted.metricEntries);

      if (!hasDraft) {
        setPendingLocalDraft(null);
        return;
      }

      setPendingLocalDraft({
        academicYearId: persisted.academicYearId ?? activeAcademicYearId,
        notes: typeof persisted.notes === "string" ? persisted.notes : "",
        metricEntries: persisted.metricEntries && typeof persisted.metricEntries === "object" ? persisted.metricEntries : {},
        savedAt: persisted.savedAt ?? null,
        editingSubmissionId: typeof persisted.editingSubmissionId === "string" ? persisted.editingSubmissionId : null,
      });
      if (persisted.savedAt) {
        setAutosaveAt(persisted.savedAt);
      }
    } catch {
      setPendingLocalDraft(null);
    }
  }, [
    activeAcademicYearId,
    autosaveKey,
    isSubmissionDataLoading,
    latestActiveWorkspaceSubmission?.id,
    isSelectedSubmissionFinalized,
  ]);
  const activeAcademicYearIdRef = useRef<string | null>(activeAcademicYearId);
  const activeWorkspaceSubmissionIdRef = useRef<string | null>(activeWorkspaceSubmission?.id ?? null);
  const activeEditingSubmissionIdRef = useRef<string | null>(editingSubmissionId);
  const resolvedAcademicYearBoundaryRef = useRef<string | null>(activeAcademicYearId);
  const lastHydratedWorkspaceScopeRef = useRef<string>("");
  const hasUnsavedWorkspaceChangesRef = useRef(false);
  const submittedEditPreserveContextRef = useRef<{ academicYearId: string | null; submissionId: string | null } | null>(null);
  const preserveLocalWorkspaceAfterMutationRef = useRef<{ academicYearId: string | null; submissionId: string | null } | null>(null);
  const postRefreshMessageRef = useRef<string | null>(null);
  useEffect(() => {
    activeAcademicYearIdRef.current = activeAcademicYearId;
  }, [activeAcademicYearId]);
  useEffect(() => {
    activeWorkspaceSubmissionIdRef.current = activeWorkspaceSubmission?.id ?? null;
  }, [activeWorkspaceSubmission?.id]);
  useEffect(() => {
    activeEditingSubmissionIdRef.current = editingSubmissionId;
  }, [editingSubmissionId]);
  const isSubmissionInAcademicYear = useCallback(
    (submission: IndicatorSubmission | null, academicYearId: string | number | null): boolean => {
      if (!submission || academicYearId === null) {
        return false;
      }
      const selectedId = String(academicYearId);
      const submissionYearId = submission.academicYear?.id ? String(submission.academicYear.id) : "";
      return submissionYearId.length > 0 && submissionYearId === selectedId;
    },
    [],
  );
  const isAcademicYearValueAligned = useCallback(
    (academicYearId: string | number | null): boolean => {
      if (!activeAcademicYearId || academicYearId === null) {
        return false;
      }
      return String(academicYearId) === String(activeAcademicYearId);
    },
    [activeAcademicYearId],
  );
  const ensureWorkspaceLineageAlignment = useCallback((): boolean => {
    if (!activeWorkspaceSubmission) {
      return true;
    }
    if (isSubmissionInAcademicYear(activeWorkspaceSubmission, activeAcademicYearId)) {
      return true;
    }
    setSaveMessage("");
    setShowMissingFields(false);
    setPendingFocusCellId(null);
    setMissingJumpIndex(0);
    setSubmitError("The selected academic year changed before saving. No stale changes were applied. Review the workspace and try again.");
    return false;
  }, [activeAcademicYearId, activeWorkspaceSubmission, isSubmissionInAcademicYear]);
  const resolveInScopeSubmissionId = useCallback(
    (submissionId: string | null): string | null => (
      submissionId && scopedSubmissionsForYear.some((submission) => submission.id === submissionId)
        ? submissionId
        : null
    ),
    [scopedSubmissionsForYear],
  );
  const clearTransientWorkspaceUiState = useCallback((options: { dismissRestoreBanner?: boolean } = {}) => {
    localAutosaveEpochRef.current += 1;
    autosaveInFlightRef.current = false;
    setExpandedSubmissionId(null);
    setAutosaveAt(null);
    setPendingLocalDraft(null);
    setAutosaveError("");
    setSaveMessage("");
    setSubmitError("");
    setShowMissingFields(false);
    setMissingJumpIndex(0);
    setPendingFocusCellId(null);
    setShowOnlyMissingRows(false);
    setIsAutosavingDraft(false);
    setRestoreBannerDismissed(options.dismissRestoreBanner ?? false);
    lastAutosaveFingerprintRef.current = "";
  }, []);
  const clearWorkspaceTransitionIntents = useCallback(() => {
    submittedEditPreserveContextRef.current = null;
    postRefreshMessageRef.current = null;
    workspaceFingerprintRef.current = "";
    lastHydratedWorkspaceScopeRef.current = "";
  }, []);
  const invalidateAutosaveContext = useCallback((options: { resetFingerprint?: boolean } = {}) => {
    localAutosaveEpochRef.current += 1;
    autosaveInFlightRef.current = false;
    setIsAutosavingDraft(false);
    if (options.resetFingerprint ?? true) {
      lastAutosaveFingerprintRef.current = "";
    }
  }, []);
  const startControlledWorkspaceTransition = useCallback((options: { dismissRestoreBanner?: boolean } = {}) => {
    criticalActionInFlightRef.current = true;
    transitionEpochRef.current += 1;
    setIsWorkspaceTransitioning(true);
    clearTransientWorkspaceUiState(options);
    clearWorkspaceTransitionIntents();
    setIsSubmittedEditMode(false);
    setOptimisticSubmittedByType({ bmef: false, smea: false });
  }, [clearTransientWorkspaceUiState, clearWorkspaceTransitionIntents]);
  const endControlledWorkspaceTransition = useCallback(() => {
    criticalActionInFlightRef.current = false;
    setIsWorkspaceTransitioning(false);
  }, []);
  const beginCriticalMutationTransition = useCallback(() => {
    criticalActionInFlightRef.current = true;
    transitionEpochRef.current += 1;
    invalidateAutosaveContext();
    clearWorkspaceTransitionIntents();
    setIsWorkspaceTransitioning(true);
  }, [clearWorkspaceTransitionIntents, invalidateAutosaveContext]);
  const getManualActionBlockReason = useCallback((): string | null => {
    if (criticalActionInFlightRef.current || isWorkspaceTransitioning || isSaving || uploadingFileType !== null) {
      return "Please wait for the current action to finish.";
    }
    if (isAutosavingDraft) {
      return "Please wait for autosave to finish.";
    }
    return null;
  }, [isAutosavingDraft, isSaving, isWorkspaceTransitioning, uploadingFileType]);
  const blockIfManualActionBusy = useCallback((): boolean => {
    const reason = getManualActionBlockReason();
    if (!reason) {
      return false;
    }
    setSubmitError(reason);
    return true;
  }, [getManualActionBlockReason]);
  useEffect(() => {
    if (resolvedAcademicYearBoundaryRef.current === activeAcademicYearId) {
      return;
    }

    resolvedAcademicYearBoundaryRef.current = activeAcademicYearId;
    transitionEpochRef.current += 1;
    invalidateAutosaveContext();
    clearWorkspaceTransitionIntents();
  }, [activeAcademicYearId, clearWorkspaceTransitionIntents, invalidateAutosaveContext]);
  const refreshResolvedWorkspace = useCallback(async () => {
    workspaceFingerprintRef.current = "";
    lastHydratedWorkspaceScopeRef.current = "";
    await refreshSubmissions();
    workspaceFingerprintRef.current = "";
    lastHydratedWorkspaceScopeRef.current = "";
  }, [refreshSubmissions]);
  const fetchFreshWorkspaceSubmission = useCallback(
    async (submission: IndicatorSubmission): Promise<IndicatorSubmission> => {
      const fresh = await fetchSubmission(submission.id).catch(() => submission);
      if (typeof window !== "undefined") {
        localStorage.removeItem(autosaveKey);
      }
      setPendingLocalDraft(null);
      return fresh;
    },
    [autosaveKey, fetchSubmission],
  );
  const requestResolvedWorkspaceRehydrate = useCallback(() => {
    workspaceFingerprintRef.current = "";
    lastHydratedWorkspaceScopeRef.current = "";
  }, []);
  useEffect(() => {
    const submissionId = latestActiveWorkspaceSubmission?.id ?? null;
    if (!submissionId) {
      pendingSubmissionDetailRequestRef.current = null;
      return;
    }

    if (submissionHasHydratableRows(latestActiveWorkspaceSubmission)) {
      pendingSubmissionDetailRequestRef.current = null;
      return;
    }

    if (pendingSubmissionDetailRequestRef.current === submissionId) {
      return;
    }

    pendingSubmissionDetailRequestRef.current = submissionId;
    void fetchSubmission(submissionId)
      .then((submission) => {
        if (submission.id === submissionId) {
          setActiveWorkspaceSubmission((current) => (
            current && current.id === submission.id ? submission : current
          ));
          requestResolvedWorkspaceRehydrate();
        }
      })
      .catch((error) => {
        console.error("[SchoolIndicatorPanel] Unable to load full submission detail:", error);
      })
      .finally(() => {
        if (pendingSubmissionDetailRequestRef.current === submissionId) {
          pendingSubmissionDetailRequestRef.current = null;
        }
      });
  }, [
    fetchSubmission,
    latestActiveWorkspaceSubmission,
    latestActiveWorkspaceSubmission?.id,
    latestActiveWorkspaceSubmission?.updatedAt,
    requestResolvedWorkspaceRehydrate,
  ]);
  const workspaceSubmissionFingerprint = useMemo(
    () => buildWorkspaceSubmissionFingerprint(activeAcademicYearId, latestActiveWorkspaceSubmission),
    [
      activeAcademicYearId,
      latestActiveWorkspaceSubmission?.id,
      latestActiveWorkspaceSubmission?.status,
      latestActiveWorkspaceSubmission?.version,
      latestActiveWorkspaceSubmission?.updatedAt,
      latestActiveWorkspaceSubmission?.submittedAt,
      latestActiveWorkspaceSubmission?.reviewedAt,
      latestActiveWorkspaceSubmission?.completion?.hasBmefFile,
      latestActiveWorkspaceSubmission?.completion?.hasSmeaFile,
    ],
  );
  const runCriticalWorkspaceMutation = useCallback(
    async <T,>(
      options: {
        mutation: () => Promise<T>;
        onSuccess?: (result: T) => Promise<void> | void;
        getSuccessMessage?: (result: T) => string | null;
        onError?: (err: unknown) => void;
        skipResolvedWorkspaceRehydrate?: boolean;
      },
    ): Promise<T | null> => {
      if (blockIfManualActionBusy()) {
        return null;
      }

      beginCriticalMutationTransition();
      const actionEpoch = transitionEpochRef.current;
      try {
        const result = await options.mutation();
        if (transitionEpochRef.current !== actionEpoch) {
          throw new Error("The workspace changed before this action completed. No stale changes were applied. Review the workspace and try again.");
        }
        await options.onSuccess?.(result);
        if (transitionEpochRef.current !== actionEpoch) {
          throw new Error("The workspace changed before this action completed. No stale changes were applied. Review the workspace and try again.");
        }
        postRefreshMessageRef.current = options.getSuccessMessage?.(result) ?? null;
        if (!options.skipResolvedWorkspaceRehydrate) {
          requestResolvedWorkspaceRehydrate();
        } else {
          endControlledWorkspaceTransition();
        }
        if (transitionEpochRef.current !== actionEpoch) {
          postRefreshMessageRef.current = null;
          return null;
        }
        return result;
      } catch (err) {
        clearWorkspaceTransitionIntents();
        endControlledWorkspaceTransition();
        if (options.onError) {
          options.onError(err);
        } else {
          setSubmitError(err instanceof Error ? err.message : "Unable to complete the requested action.");
        }
        return null;
      }
    },
    [beginCriticalMutationTransition, blockIfManualActionBusy, clearWorkspaceTransitionIntents, endControlledWorkspaceTransition, requestResolvedWorkspaceRehydrate],
  );
  const runCriticalWorkspaceTransition = useCallback(
    async <T,>(
      options: {
        action: () => Promise<T> | T;
        dismissRestoreBanner?: boolean;
        endOnComplete?: boolean;
        onError?: (err: unknown) => void;
      },
    ): Promise<T | null> => {
      if (blockIfManualActionBusy()) {
        return null;
      }

      startControlledWorkspaceTransition({ dismissRestoreBanner: options.dismissRestoreBanner });
      const actionEpoch = transitionEpochRef.current;
      const shouldEndOnComplete = options.endOnComplete ?? true;
      try {
        const result = await options.action();
        if (transitionEpochRef.current !== actionEpoch) {
          return null;
        }
        return result;
      } catch (err) {
        clearWorkspaceTransitionIntents();
        if (options.onError) {
          options.onError(err);
        } else {
          setSubmitError(err instanceof Error ? err.message : "Unable to complete the workspace transition.");
        }
        return null;
      } finally {
        if (shouldEndOnComplete && transitionEpochRef.current === actionEpoch) {
          endControlledWorkspaceTransition();
        }
      }
    },
    [blockIfManualActionBusy, clearWorkspaceTransitionIntents, endControlledWorkspaceTransition, startControlledWorkspaceTransition],
  );
  const runGroupBAction = useCallback(
    async (label: string, action: () => Promise<void>): Promise<void> => {
      if (
        groupBActionInFlightRef.current
        || isSaving
        || uploadingFileType !== null
        || isWorkspaceTransitioning
      ) {
        const blockReason = getManualActionBlockReason() ?? "Please wait for the current action to finish.";
        console.warn(`[GroupB] ${label} blocked:`, blockReason);
        setSubmitError(blockReason);
        return;
      }

      groupBActionInFlightRef.current = true;
      setIsGroupBActionRunning(true);
      setSubmitError("");
      setSaveMessage("");

      try {
        await action();
      } catch (error) {
        console.error("[GroupB] API error:", error);
        setSubmitError(
          toGroupBActionErrorMessage(error, `${label} failed. Please try again.`),
        );
      } finally {
        groupBActionInFlightRef.current = false;
        setIsGroupBActionRunning(false);
      }
    },
    [getManualActionBlockReason, isSaving, isWorkspaceTransitioning, toGroupBActionErrorMessage, uploadingFileType],
  );
  const rehydrateWorkspaceFromSubmission = useCallback((submission: IndicatorSubmission | null) => {
    localAutosaveEpochRef.current += 1;
    const metricsById = new Map(complianceMetrics.map((metric) => [metric.id, metric]));
    const metricsByCode = new Map(complianceMetrics.map((metric) => [normalizeMetricCode(metric.code), metric]));
    const metricsByName = new Map(complianceMetrics.map((metric) => [normalizeMetricName(metric.name), metric]));
    const hasHydratableRows = submissionHasHydratableRows(submission);
    if (submission && !hasHydratableRows) {
      workspaceDataOwnerRef.current = "backend";
      setActiveWorkspaceSubmission(submission);
      setEditingSubmissionId(submission.id);
      setServerAutosaveAt(submission.updatedAt ?? null);
      setAutosaveError("");
      setSubmitError("");
      setSaveMessage("");
      return;
    }

    const nextEntries = buildMetricEntriesForHydration(complianceMetrics);

    if (submission && hasHydratableRows) {
      for (const indicator of submissionRows(submission)) {
        const metric = resolveMetricFromIndicator(indicator, metricsById, metricsByCode, metricsByName);
        if (!metric) continue;

        nextEntries[metric.id] = buildEntryFromSubmission(metric, indicator);
      }
    }

    workspaceDataOwnerRef.current = submission ? "backend" : "blank";
    setActiveWorkspaceSubmission(submission);
    setEditingSubmissionId(submission?.id ?? null);
    setNotes(submission?.notes ?? (submission ? notesRef.current : ""));
    setMetricEntries(nextEntries);
    setServerAutosaveAt(submission?.updatedAt ?? null);
    setAutosaveError("");
    setSubmitError("");
    setSaveMessage("");
    setIsSubmittedEditMode(false);
    setShowMissingFields(false);
    setMissingJumpIndex(0);
    setPendingFocusCellId(null);
    lastAutosaveFingerprintRef.current = "";
  }, [complianceMetrics]);
  const resetWorkspaceToBlankStateForSelectedYear = useCallback(() => {
    if (latestActiveWorkspaceSubmissionRef.current) {
      return;
    }
    rehydrateWorkspaceFromSubmission(null);
  }, [rehydrateWorkspaceFromSubmission]);
  useEffect(() => {
    if (!activeAcademicYearId || complianceMetrics.length === 0) {
      return;
    }

    // Read the current submission from the ref so this effect is driven by
    // primitive keys (via workspaceSubmissionFingerprint) rather than object
    // reference identity — background refetches no longer cause spurious runs.
    const currentSubmission = latestActiveWorkspaceSubmissionRef.current;
    if (!currentSubmission && isSubmissionDataLoading) {
      return;
    }

    const workspaceScopeKey = [
      activeAcademicYearId,
      currentSubmission?.id ?? "blank",
    ].join(":");
    const didChangeWorkspaceScope = lastHydratedWorkspaceScopeRef.current !== workspaceScopeKey;

    // For submitted/validated submissions the backend is always authoritative —
    // never let unsaved local edits block a re-hydration from the server.
    const isSubmittedOrValidated = isSubmittedWorkflowStatus(currentSubmission?.status);
    if (!didChangeWorkspaceScope && hasUnsavedWorkspaceChangesRef.current && !isSubmittedOrValidated) {
      return;
    }

    if (workspaceFingerprintRef.current === workspaceSubmissionFingerprint) {
      return;
    }

    workspaceFingerprintRef.current = workspaceSubmissionFingerprint;
    lastHydratedWorkspaceScopeRef.current = workspaceScopeKey;
    const shouldPreserveSubmittedEditMode = Boolean(
      submittedEditPreserveContextRef.current
      && activeAcademicYearId
      && submittedEditPreserveContextRef.current.academicYearId === activeAcademicYearId
      && submittedEditPreserveContextRef.current.submissionId === (currentSubmission?.id ?? null),
    );
    const shouldPreserveLocalWorkspace = Boolean(
      preserveLocalWorkspaceAfterMutationRef.current
      && activeAcademicYearId
      && preserveLocalWorkspaceAfterMutationRef.current.academicYearId === activeAcademicYearId
      && preserveLocalWorkspaceAfterMutationRef.current.submissionId === (currentSubmission?.id ?? null),
    );
    // Backend submission is the source of truth. Local autosave is only used
    // when there is no saved submission for this user/school/year scope.
    if (currentSubmission && !shouldPreserveLocalWorkspace) {
      rehydrateWorkspaceFromSubmission(currentSubmission);
    } else if (!currentSubmission) {
      resetWorkspaceToBlankStateForSelectedYear();
    } else {
      workspaceDataOwnerRef.current = "backend";
      setEditingSubmissionId(currentSubmission.id);
      setPendingLocalDraft(null);
      setAutosaveError("");
      setServerAutosaveAt(currentSubmission.updatedAt ?? null);
    }
    if (shouldPreserveSubmittedEditMode) {
      setIsSubmittedEditMode(true);
    }
    preserveLocalWorkspaceAfterMutationRef.current = null;
    if (postRefreshMessageRef.current) {
      setSaveMessage(postRefreshMessageRef.current);
      postRefreshMessageRef.current = null;
    }
    submittedEditPreserveContextRef.current = null;
    setRestoreBannerDismissed(false);
    endControlledWorkspaceTransition();
  }, [activeAcademicYearId, complianceMetrics.length, endControlledWorkspaceTransition, isSubmissionDataLoading, rehydrateWorkspaceFromSubmission, resetWorkspaceToBlankStateForSelectedYear, workspaceSubmissionFingerprint]);
  const groupASubmittedSubmission = useMemo(
    () =>
      scopedSubmissionsForYear
        .filter((submission) => isSubmittedWorkflowStatus(submission.status))
        .sort((a, b) => (
          new Date(b.submittedAt ?? b.updatedAt ?? b.createdAt ?? 0).getTime()
          - new Date(a.submittedAt ?? a.updatedAt ?? a.createdAt ?? 0).getTime()
        ))[0] ?? null,
    [scopedSubmissionsForYear],
  );
  const groupASubmittedIndicatorByMetricId = useMemo(() => {
    const map = new Map<string, IndicatorSubmissionItem>();
    const metricsById = new Map(complianceMetrics.map((metric) => [metric.id, metric]));
    const metricsByCode = new Map(complianceMetrics.map((metric) => [normalizeMetricCode(metric.code), metric]));
    const metricsByName = new Map(complianceMetrics.map((metric) => [normalizeMetricName(metric.name), metric]));

    for (const item of submissionRows(groupASubmittedSubmission)) {
      const metric = resolveMetricFromIndicator(item, metricsById, metricsByCode, metricsByName);
      if (!metric) {
        continue;
      }

      map.set(metric.id, item);
    }

    return map;
  }, [complianceMetrics, groupASubmittedSubmission]);
  const bmefReportSubmission = useMemo(
    () =>
      scopedSubmissionsForYear.find((submission) => (
        isSubmittedWorkflowStatus(submission.status)
        && (
          hasUploadedReportFile(submission.files?.bmef ?? null)
          || Boolean(submission.completion?.hasBmefFile)
        )
      ))
      ?? groupASubmittedSubmission
      ?? null,
    [groupASubmittedIndicatorByMetricId, groupASubmittedSubmission, scopedSubmissionsForYear],
  );
  const smeaReportSubmission = useMemo(
    () =>
      scopedSubmissionsForYear.find((submission) => (
        isSubmittedWorkflowStatus(submission.status)
        && (
          hasUploadedReportFile(submission.files?.smea ?? null)
          || Boolean(submission.completion?.hasSmeaFile)
        )
      ))
      ?? groupASubmittedSubmission
      ?? null,
    [groupASubmittedIndicatorByMetricId, groupASubmittedSubmission, scopedSubmissionsForYear],
  );
  const bmefWorkspaceSubmission = useMemo(
    () => {
      const workspaceCandidate = editableWorkspaceSubmissionInScope ?? latestActiveWorkspaceSubmission ?? null;
      if (
        workspaceCandidate
        && (
          hasUploadedReportFile(workspaceCandidate.files?.bmef ?? null)
          || Boolean(workspaceCandidate.completion?.hasBmefFile)
        )
      ) {
        return workspaceCandidate;
      }
      return bmefReportSubmission;
    },
    [bmefReportSubmission, editableWorkspaceSubmissionInScope, latestActiveWorkspaceSubmission],
  );
  const smeaWorkspaceSubmission = useMemo(
    () => {
      const workspaceCandidate = editableWorkspaceSubmissionInScope ?? latestActiveWorkspaceSubmission ?? null;
      if (
        workspaceCandidate
        && (
          hasUploadedReportFile(workspaceCandidate.files?.smea ?? null)
          || Boolean(workspaceCandidate.completion?.hasSmeaFile)
        )
      ) {
        return workspaceCandidate;
      }
      return smeaReportSubmission;
    },
    [editableWorkspaceSubmissionInScope, latestActiveWorkspaceSubmission, smeaReportSubmission],
  );
  const bmefFileEntry = bmefWorkspaceSubmission?.files?.bmef ?? null;
  const smeaFileEntry = smeaWorkspaceSubmission?.files?.smea ?? null;
  const activeFormSubmission = latestActiveWorkspaceSubmission;
  const activeFormSubmissionId = activeFormSubmission?.id ?? null;
  const activeWorkspaceSubmissionId = activeWorkspaceSubmission?.id ?? null;
  const activeFormStatus = String(activeFormSubmission?.status ?? "").toLowerCase();
  const isFormSubmitted = isSubmittedWorkflowStatus(activeFormStatus);
  const bmefSubmissionStatus = String(bmefWorkspaceSubmission?.status ?? "").toLowerCase();
  const smeaSubmissionStatus = String(smeaWorkspaceSubmission?.status ?? "").toLowerCase();
  const isBmefSubmissionSubmitted = isSubmittedWorkflowStatus(bmefSubmissionStatus);
  const isSmeaSubmissionSubmitted = isSubmittedWorkflowStatus(smeaSubmissionStatus);
  const bmefSubmitted = optimisticSubmittedByType.bmef
    || hasUploadedReportFile(bmefFileEntry)
    || Boolean(bmefWorkspaceSubmission?.completion?.hasBmefFile)
    || (isBmefSubmissionSubmitted && Boolean(bmefWorkspaceSubmission));
  const smeaSubmitted = optimisticSubmittedByType.smea
    || hasUploadedReportFile(smeaFileEntry)
    || Boolean(smeaWorkspaceSubmission?.completion?.hasSmeaFile)
    || (isSmeaSubmissionSubmitted && Boolean(smeaWorkspaceSubmission));
  const isFormLocked = isFormSubmitted && !isSubmittedEditMode;
  const submittedByLabel = activeFormSubmission?.submittedBy?.name
    ?? activeFormSubmission?.createdBy?.name
    ?? null;
  const submittedAtLabel = activeFormSubmission?.submittedAt
    ?? activeFormSubmission?.updatedAt
    ?? null;
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
  const activeSaveSection = useMemo<WorkspaceSaveSection | null>(() => {
    if (activeTab?.kind === "upload") {
      return activeTab.uploadType;
    }
    return workspaceSaveSectionForCategory(activeCategory?.id);
  }, [activeCategory?.id, activeTab]);
  const isActiveCategoryLocked = Boolean(activeCategory && isFormLocked);
  const isSelectedYearEditable = Boolean(
    selectedSchoolYearLabel && yearWorkspaceState.editableSchoolYears.includes(selectedSchoolYearLabel),
  );
  const workspaceMode: GroupBWorkspaceMode = useMemo(
    () => deriveWorkspaceModeFromSubmission(latestActiveWorkspaceSubmission, {
      isSelectedYearEditable,
      isWorkspaceReadOnly: yearWorkspaceState.isWorkspaceReadOnly,
      isSubmittedEditMode,
    }),
    [isSelectedYearEditable, isSubmittedEditMode, latestActiveWorkspaceSubmission, yearWorkspaceState.isWorkspaceReadOnly],
  );
  const isYearEditable = useCallback(
    (yearLabel: string) => Boolean(selectedSchoolYearLabel && isSelectedYearEditable && yearLabel === selectedSchoolYearLabel),
    [isSelectedYearEditable, selectedSchoolYearLabel],
  );
  const isSelectedYearColumn = useCallback(
    (yearLabel: string) => Boolean(selectedSchoolYearLabel && yearLabel === selectedSchoolYearLabel),
    [selectedSchoolYearLabel],
  );
  const getYearLockReason = useCallback(
    (yearLabel: string): string => {
      if (isYearEditable(yearLabel) && isActiveCategoryLocked) {
        return "Submitted package is locked. Click Edit to unlock this category.";
      }
      if (selectedSchoolYearLabel && yearLabel === selectedSchoolYearLabel && !isSelectedYearEditable) {
        return "The selected academic year is outside the active reporting scope and is currently read-only.";
      }
      return "Reference only. Select this academic year in the dropdown to edit.";
    },
    [isActiveCategoryLocked, isSelectedYearEditable, isYearEditable, selectedSchoolYearLabel],
  );
  const isWorkspaceReadOnly = workspaceMode === "submitted_locked" || workspaceMode === "read_only_year";
  const lifecycleStatusLabel = useMemo(() => {
    if (workspaceMode === "submitted_locked") return "Submitted";
    if (workspaceMode === "submitted_editing") return "Editing";
    if (workspaceMode === "read_only_year") return "Read-only";
    return "Draft";
  }, [workspaceMode]);
  const canShowSaveAndSubmitActions = workspaceMode === "blank" || workspaceMode === "draft" || workspaceMode === "submitted_editing";
  const canShowSectionSaveAction = canShowSaveAndSubmitActions && Boolean(activeCategory);
  const canShowEditAction = workspaceMode === "submitted_locked";
  const canShowCancelEditAction = workspaceMode === "submitted_editing";
  const canShowResetAction = workspaceMode === "draft" || workspaceMode === "submitted_editing";
  const isUploading = uploadingFileType !== null;
  const isGroupBActionBusy = groupBActionInFlightRef.current || isGroupBActionRunning || isSaving || isUploading || isWorkspaceTransitioning;
  const isCriticalActionInFlight = isGroupBActionBusy;
  const isManualActionBlocked = isGroupBActionBusy || isAutosavingDraft;
  const saveActionLabel = useMemo(() => {
    if (!activeCategory) {
      return "Save Draft";
    }
    const sectionLabel = workspaceSaveSectionLabel(activeSaveSection);
    if (workspaceMode === "blank") return `Save ${sectionLabel}`;
    if (workspaceMode === "submitted_editing") return `Save ${sectionLabel}`;
    return `Update ${sectionLabel}`;
  }, [activeCategory, activeSaveSection, workspaceMode]);
  const submitActionLabel = workspaceMode === "submitted_editing" ? "Re-submit" : "Submit";
  const showSubmitEligibilityHelper = canShowSaveAndSubmitActions && missingFieldTargets.length > 0;
  const saveActionDisabledTitle = isWorkspaceReadOnly
    ? "This academic year is not open for encoding."
    : undefined;
  const submitActionTitle = isWorkspaceReadOnly
    ? "This academic year is not open for encoding."
    : missingFieldTargets.length > 0
      ? "Complete required fields before submitting."
      : workspaceMode === "submitted_editing"
        ? "Re-submit to monitor"
        : "Submit to monitor";
  const getCategoryRailStatusLabel = useCallback(
    (progress: { total: number; complete: number } | null): string => {
      if (workspaceMode === "submitted_locked") return "Submitted";
      if (workspaceMode === "submitted_editing") return "Editing";
      if (workspaceMode === "read_only_year") return "Read-only";
      return progress ? `${progress.complete}/${progress.total} complete` : "Draft";
    },
    [workspaceMode],
  );
  const getCategoryRailBadge = useCallback(
    (missingCount: number): { label: string; tone: string } => {
      if (workspaceMode === "submitted_locked") {
        return {
          label: "Submitted",
          tone: "border-primary-300 bg-primary-50 text-primary-700",
        };
      }
      if (workspaceMode === "submitted_editing") {
        return {
          label: "Editing",
          tone: "border-primary-300 bg-primary-50 text-primary-700",
        };
      }
      if (workspaceMode === "read_only_year") {
        return {
          label: "Read-only",
          tone: "border-slate-300 bg-slate-50 text-slate-600",
        };
      }
      return {
        label: `Missing ${missingCount}`,
        tone:
          missingCount > 0
            ? "border-amber-300 bg-amber-50 text-amber-700"
            : "border-primary-300 bg-primary-50 text-primary-700",
      };
    },
    [workspaceMode],
  );
  const activeCategoryProgress = activeCategory
    ? categoryProgressById.get(activeCategory.id) ?? { total: activeCategory.metrics.length, complete: 0 }
    : { total: 0, complete: 0 };
  useEffect(() => {
    const serverBmefSubmitted = hasUploadedReportFile(bmefFileEntry)
      || Boolean(bmefWorkspaceSubmission?.completion?.hasBmefFile)
      || (isBmefSubmissionSubmitted && Boolean(bmefWorkspaceSubmission));
    const serverSmeaSubmitted = hasUploadedReportFile(smeaFileEntry)
      || Boolean(smeaWorkspaceSubmission?.completion?.hasSmeaFile)
      || (isSmeaSubmissionSubmitted && Boolean(smeaWorkspaceSubmission));

    setOptimisticSubmittedByType({
      bmef: serverBmefSubmitted,
      smea: serverSmeaSubmitted,
    });

    if (!isFormSubmitted) {
      setIsSubmittedEditMode(false);
    }
  }, [
    activeFormSubmissionId,
    bmefFileEntry,
    bmefWorkspaceSubmission?.completion?.hasBmefFile,
    isBmefSubmissionSubmitted,
    isFormSubmitted,
    isSmeaSubmissionSubmitted,
    smeaFileEntry,
    smeaWorkspaceSubmission?.completion?.hasSmeaFile,
  ]);

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

  const resetForm = useCallback(async (
    options: { postRefreshMessage?: string | null; onSuccess?: () => void; resetToBlank?: boolean } = {},
  ): Promise<boolean> => {
    const didReset = await runCriticalWorkspaceTransition({
      dismissRestoreBanner: false,
      action: () => {
        if (options.resetToBlank) {
          console.log("[GroupB] Reset using blank defaults for selected year");
          resetWorkspaceToBlankStateForSelectedYear();
          setActiveWorkspaceSubmission(null);
          setEditingSubmissionId(null);
        } else {
          const activeSubmission = latestActiveWorkspaceSubmission;
          const latestSubmission = activeSubmission?.id
            ? submissions.find((submission) => submission.id === activeSubmission.id) ?? activeSubmission
            : null;
          console.log("[GroupB] Reset using submission:", latestSubmission?.id ?? null);
          if (latestSubmission) {
            rehydrateWorkspaceFromSubmission(latestSubmission);
          } else {
            resetWorkspaceToBlankStateForSelectedYear();
          }
          setActiveWorkspaceSubmission(latestSubmission);
          setEditingSubmissionId(latestSubmission?.id ?? null);
        }
        if (typeof window !== "undefined") {
          localStorage.removeItem(autosaveKey);
        }
        options.onSuccess?.();
        if (options.postRefreshMessage) {
          setSaveMessage(options.postRefreshMessage);
        }
        return true;
      },
      onError: (err) => {
        postRefreshMessageRef.current = null;
        setSubmitError(err instanceof Error ? err.message : "Unable to refresh the selected academic year workspace.");
      },
    });
    return didReset === true;
  }, [autosaveKey, latestActiveWorkspaceSubmission, rehydrateWorkspaceFromSubmission, resetWorkspaceToBlankStateForSelectedYear, runCriticalWorkspaceTransition, submissions]);

  const handleEditDraft = (submission: IndicatorSubmission) => {
    const submissionExists = sortedSubmissions.some((candidate) => candidate.id === submission.id);
    if (!submissionExists) {
      setSubmitError("Unable to load the selected package.");
      return;
    }

    const nextAcademicYearId = submission.academicYear?.id ?? activeAcademicYearId;
    if (!nextAcademicYearId) {
      setSubmitError("Unable to resolve the academic year for this package.");
      return;
    }

    void runCriticalWorkspaceTransition({
      dismissRestoreBanner: true,
      endOnComplete: nextAcademicYearId === activeAcademicYearId,
        action: () => {
          if (nextAcademicYearId !== activeAcademicYearId) {
            setWorkspaceAcademicYearId(nextAcademicYearId);
            setEditingSubmissionId(submission.id);
            return;
          }

          setActiveWorkspaceSubmission(submission);
          rehydrateWorkspaceFromSubmission(submission);
          workspaceFingerprintRef.current = "";
        },
      });
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

  const buildComparablePayloadFromWorkspaceState = useCallback((
    source: { academicYearId: string | null; noteValue: string | null; entryState: MetricEntryState },
  ): { payload: IndicatorSubmissionPayload | null; fingerprint: string } => {
    if (!source.academicYearId) {
      return { payload: null, fingerprint: "" };
    }

    const entries = orderedComplianceMetrics.map((metric) => {
      const value = source.entryState[metric.id] ?? buildDefaultEntry(metric);
      const scopedYears = resolveMetricYearsInScope(metric, workspaceSchoolYears);
      const requiredYears = scopedYears.filter((year) => requiredSchoolYearSet.has(year));
      const type = metricDataType(metric);
      const isAutoCalculated = metricIsAutoCalculated(metric);
      const isSyncedLocked = metricUsesSyncedLockedTotals(metric);
      const requiresTargetActual = TARGET_ACTUAL_METRIC_CODES.has(normalizeMetricCode(metric.code));

      let targetPayload: IndicatorTypedValuePayload | undefined;
      let actualPayload: IndicatorTypedValuePayload | undefined;
      let targetValue: number | undefined;
      let actualValue: number | undefined;

      if (isAutoCalculated) {
        return {
          metricId: Number(metric.id),
          metricCode: normalizeMetricCode(metric.code),
          targetValue: undefined,
          actualValue: undefined,
          target: undefined,
          actual: undefined,
          remarks: value.remarks.trim() || null,
        };
      }

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
        const requiredYearSet = new Set(requiredYears);
        if (requiresTargetActual) {
          targetPayload = {
            values: Object.fromEntries(
              scopedYears
                .map((year) => [year, (value.targetMatrix[year] ?? "").trim()] as const)
                .filter(([year, cellValue]) => requiredYearSet.has(year) || cellValue !== ""),
            ),
          };
          actualPayload = {
            values: Object.fromEntries(
              scopedYears
                .map((year) => [year, (value.actualMatrix[year] ?? "").trim()] as const)
                .filter(([year, cellValue]) => requiredYearSet.has(year) || cellValue !== ""),
            ),
          };
        } else {
          const matrixValues = Object.fromEntries(
            scopedYears
              .map((year) => [year, (value.actualMatrix[year] ?? value.targetMatrix[year] ?? "").trim()] as const)
              .filter(([year, cellValue]) => requiredYearSet.has(year) || cellValue !== ""),
          );
          targetPayload = { values: matrixValues };
          actualPayload = { values: matrixValues };
        }
      }

      return {
        metricId: Number(metric.id),
        metricCode: normalizeMetricCode(metric.code),
        targetValue,
        actualValue,
        target: targetPayload,
        actual: actualPayload,
        remarks: value.remarks.trim() || null,
        isSyncedLocked,
      };
    });

    const payload: IndicatorSubmissionPayload = {
      academicYearId: Number(source.academicYearId),
      reportingPeriod,
      notes: (source.noteValue ?? "").trim() || null,
      indicators: entries.map((entry) => ({
        metricId: entry.metricId,
        targetValue: entry.targetValue,
        actualValue: entry.actualValue,
        target: entry.target,
        actual: entry.actual,
        remarks: entry.remarks,
      })),
    };

    return { payload, fingerprint: JSON.stringify(payload) };
  }, [orderedComplianceMetrics, reportingPeriod, requiredSchoolYearSet, workspaceSchoolYears]);

  const buildComparablePayloadFromSubmission = useCallback((submission: IndicatorSubmission | null) => {
    if (!submission) {
      return { payload: null, fingerprint: "" };
    }

    const metricsById = new Map(complianceMetrics.map((metric) => [metric.id, metric]));
    const metricsByNormalizedCode = new Map(
      complianceMetrics.map((metric) => [normalizeMetricCode(metric.code), metric] as const),
    );
    const metricsByNormalizedName = new Map(
      complianceMetrics.map((metric) => [normalizeMetricName(metric.name), metric] as const),
    );
    const savedEntries = buildInitialMetricEntries(complianceMetrics, {});

    for (const indicator of submissionRows(submission)) {
      const metric = resolveMetricFromIndicator(
        indicator,
        metricsById,
        metricsByNormalizedCode,
        metricsByNormalizedName,
      );
      if (!metric) {
        continue;
      }

      savedEntries[metric.id] = buildEntryFromSubmission(metric, indicator);
    }

    return buildComparablePayloadFromWorkspaceState({
      academicYearId: submission.academicYear?.id ?? activeAcademicYearId,
      noteValue: submission.notes ?? "",
      entryState: savedEntries,
    });
  }, [activeAcademicYearId, buildComparablePayloadFromWorkspaceState, complianceMetrics]);

  const areSubmissionPayloadsEquivalent = useCallback(
    (
      left: { payload: IndicatorSubmissionPayload | null; fingerprint: string },
      right: { payload: IndicatorSubmissionPayload | null; fingerprint: string },
    ): boolean => {
      if (!left.payload && !right.payload) {
        return true;
      }

      if (!left.payload || !right.payload) {
        return false;
      }

      const normalizeText = (value: unknown): string => String(value ?? "").trim();
      const normalizeNumber = (value: unknown): string => {
        if (value === null || value === undefined || value === "") {
          return "";
        }
        const numeric = Number(value);
        if (Number.isNaN(numeric)) {
          return normalizeText(value);
        }
        return String(numeric);
      };
      const stable = (value: unknown): unknown => {
        if (Array.isArray(value)) {
          return value.map(stable);
        }
        if (value && typeof value === "object") {
          return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, entry]) => [key, stable(entry)]),
          );
        }
        if (value === null || value === undefined || value === "") {
          return "";
        }
        if (typeof value === "number") {
          return Number.isFinite(value) ? Number(value) : "";
        }
        return value;
      };
      const normalizeIndicators = (payload: IndicatorSubmissionPayload) =>
        [...payload.indicators]
          .map((entry) => ({
            metricId: Number(entry.metricId),
            metricCode: normalizeMetricCode(entry.metricCode ?? ""),
            targetValue: normalizeNumber(entry.targetValue),
            actualValue: normalizeNumber(entry.actualValue),
            target: stable(entry.target ?? {}),
            actual: stable(entry.actual ?? {}),
            remarks: normalizeText(entry.remarks),
          }))
          .sort((a, b) => {
            const codeDelta = a.metricCode.localeCompare(b.metricCode);
            if (codeDelta !== 0) {
              return codeDelta;
            }
            return a.metricId - b.metricId;
          });

      const leftComparable = {
        academicYearId: normalizeText(left.payload.academicYearId),
        reportingPeriod: normalizeText(left.payload.reportingPeriod),
        notes: normalizeText(left.payload.notes),
        indicators: normalizeIndicators(left.payload),
      };
      const rightComparable = {
        academicYearId: normalizeText(right.payload.academicYearId),
        reportingPeriod: normalizeText(right.payload.reportingPeriod),
        notes: normalizeText(right.payload.notes),
        indicators: normalizeIndicators(right.payload),
      };

      return JSON.stringify(leftComparable) === JSON.stringify(rightComparable);
    },
    [],
  );

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

  const buildSubmissionPayloadFromCurrentWorkspace = useCallback((
    options: { allowIncomplete?: boolean; includeAllEntries?: boolean; metrics?: IndicatorMetric[] } = {},
  ): { payload: IndicatorSubmissionPayload | null; reason: string; fingerprint: string } => {
    const allowIncomplete = options.allowIncomplete === true;
    const includeAllEntries = options.includeAllEntries === true;
    const metricsToSerialize = options.metrics ?? orderedComplianceMetrics;
    const metricIdsInScope = new Set(metricsToSerialize.map((metric) => String(metric.id)));
    const relevantMissingFieldTargets = missingFieldTargets.filter((target) => metricIdsInScope.has(String(target.metricId)));
    if (!activeAcademicYearId) {
      return { payload: null, reason: "Select an academic year.", fingerprint: "" };
    }

    if (!allowIncomplete && relevantMissingFieldTargets.length > 0) {
      return {
        payload: null,
        reason: buildMissingReason(relevantMissingFieldTargets.length, missingCountByCategory) || "Complete all required indicator cells before saving.",
        fingerprint: "",
      };
    }

    const entries = metricsToSerialize
      .map((metric) => {
        const value = metricEntries[metric.id] ?? buildDefaultEntry(metric);
        const scopedYears = resolveMetricYearsInScope(metric, workspaceSchoolYears);
        const requiredYears = scopedYears.filter((year) => requiredSchoolYearSet.has(year));
        const isRequired = requiredYears.length > 0;

        const type = metricDataType(metric);
        const isAutoCalculated = metricIsAutoCalculated(metric);
        const isSyncedLocked = metricUsesSyncedLockedTotals(metric);

        if (isAutoCalculated) {
          return {
            metricId: Number(metric.id),
            metricCode: normalizeMetricCode(metric.code),
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
          metricCode: normalizeMetricCode(metric.code),
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

    const entryHasMeaningfulPayload = (entry: (typeof entries)[number]): boolean => {
      if ((entry.remarks ?? "").trim() !== "") {
        return true;
      }

      if (entry.type === "number" || entry.type === "currency") {
        if (entry.requiresTargetActual) {
          return entry.targetValue !== undefined || entry.actualValue !== undefined;
        }

        return entry.actualValue !== undefined;
      }

      if (entry.type === "yes_no") {
        if (entry.requiresTargetActual) {
          return entry.target?.value !== undefined || entry.actual?.value !== undefined;
        }

        return entry.actual?.value !== undefined;
      }

      if (entry.type === "enum" || entry.type === "text") {
        if (entry.requiresTargetActual) {
          return String(entry.target?.value ?? "").trim() !== "" || String(entry.actual?.value ?? "").trim() !== "";
        }

        return String(entry.actual?.value ?? "").trim() !== "";
      }

      if (entry.type === "yearly_matrix") {
        const targetValues = Object.values(entry.target?.values ?? {}).map((value) => String(value ?? "").trim());
        const actualValues = Object.values(entry.actual?.values ?? {}).map((value) => String(value ?? "").trim());
        return [...targetValues, ...actualValues].some((value) => value !== "");
      }

      return false;
    };

    const payloadEntries = includeAllEntries
      ? entries
      : allowIncomplete
      ? entries.filter((entry) => entryHasMeaningfulPayload(entry))
      : entries;

    if (entries.length === 0) {
      return { payload: null, reason: "No required compliance indicators are available for this school.", fingerprint: "" };
    }

    const invalidEntry = allowIncomplete ? null : entries.find((entry) => {
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
        reason: buildMissingReason(relevantMissingFieldTargets.length, missingCountByCategory) || "Complete all required indicator cells before saving.",
        fingerprint: "",
      };
    }

    const payload: IndicatorSubmissionPayload = {
      academicYearId: Number(activeAcademicYearId),
      reportingPeriod,
      notes: notes.trim() || null,
      indicators: payloadEntries.map((entry) => ({
        metricId: entry.metricId,
        metricCode: entry.metricCode,
        targetValue: entry.targetValue,
        actualValue: entry.actualValue,
        target: entry.target,
        actual: entry.actual,
        remarks: entry.remarks,
      })),
    };
    const expectedMetricIds = [...new Set(
      orderedComplianceMetrics
        .map((metric) => Number(metric.id))
        .filter((metricId) => Number.isFinite(metricId) && metricId > 0),
    )].sort((a, b) => a - b);
    const payloadMetricIds = [...new Set(
      payload.indicators
        .map((entry) => Number(entry.metricId))
        .filter((metricId) => Number.isFinite(metricId) && metricId > 0),
    )].sort((a, b) => a - b);
    const isFullMetricPayload = metricsToSerialize.length === orderedComplianceMetrics.length
      && expectedMetricIds.length > 0
      && expectedMetricIds.length === payloadMetricIds.length
      && expectedMetricIds.every((metricId, index) => metricId === payloadMetricIds[index]);

    if (isFullMetricPayload) {
      payload.mode = "full_replace";
      payload.replace_missing = true;
    }

    return { payload, reason: "", fingerprint: JSON.stringify(payload) };
  }, [activeAcademicYearId, metricEntries, missingCountByCategory, missingFieldTargets, notes, orderedComplianceMetrics, reportingPeriod, requiredSchoolYearSet, workspaceSchoolYears]);

  const hasUnsavedWorkspaceChanges = useMemo(() => {
    const activeSubmission = (
      latestActiveWorkspaceSubmission && isSubmissionInAcademicYear(latestActiveWorkspaceSubmission, activeAcademicYearId)
        ? latestActiveWorkspaceSubmission
        : null
    );
    const shouldCompareFullWorkspace = Boolean(activeSubmission);

    if (!activeSubmission) {
      return hasMeaningfulMetricEntries(metricEntries) || notes.trim() !== "";
    }

    const currentPayload = buildSubmissionPayloadFromCurrentWorkspace({
      allowIncomplete: true,
      includeAllEntries: shouldCompareFullWorkspace,
    });
    const savedPayload = buildComparablePayloadFromSubmission(activeSubmission);
    return !areSubmissionPayloadsEquivalent(currentPayload, savedPayload);
  }, [
    activeAcademicYearId,
    areSubmissionPayloadsEquivalent,
    buildSubmissionPayloadFromCurrentWorkspace,
    buildComparablePayloadFromSubmission,
    isSubmissionInAcademicYear,
    latestActiveWorkspaceSubmission,
    metricEntries,
    notes,
  ]);
  useEffect(() => {
    hasUnsavedWorkspaceChangesRef.current = hasUnsavedWorkspaceChanges;
  }, [hasUnsavedWorkspaceChanges]);

  const persistDraftPayload = useCallback(
    async (
      payload: IndicatorSubmissionPayload,
      _mode: "manual" | "autosave",
      guard?: { academicYearId: string | null; submissionId: string | null; editingSubmissionId: string | null; transitionEpoch?: number },
    ): Promise<IndicatorSubmission> => {
      if (!isAcademicYearValueAligned(payload.academicYearId)) {
        throw new Error("The selected academic year changed before saving. No stale changes were applied. Review the workspace and try again.");
      }
      if (guard) {
        if (
          activeAcademicYearIdRef.current !== guard.academicYearId
          || activeWorkspaceSubmissionIdRef.current !== guard.submissionId
          || activeEditingSubmissionIdRef.current !== guard.editingSubmissionId
          || (typeof guard.transitionEpoch === "number" && transitionEpochRef.current !== guard.transitionEpoch)
        ) {
          throw new Error("The workspace changed during autosave. No stale changes were applied.");
        }
      }
      if (activeWorkspaceSubmission && !isSubmissionInAcademicYear(activeWorkspaceSubmission, payload.academicYearId)) {
        throw new Error("The selected academic year changed before saving. No stale changes were applied. Review the workspace and try again.");
      }
      const mutableSubmission = (
        isSubmissionInAcademicYear(mutableActiveWorkspaceSubmission, payload.academicYearId)
          ? mutableActiveWorkspaceSubmission
          : isSubmissionInAcademicYear(editableWorkspaceSubmissionInScope, payload.academicYearId)
            ? editableWorkspaceSubmissionInScope
          : null
      );
      const canUpdateActiveSubmission = (
        isSubmissionInAcademicYear(mutableSubmission, payload.academicYearId)
        && isDraftOrReturnedWorkflowStatus(mutableSubmission?.status)
      );
      const submissionIdToUpdate = canUpdateActiveSubmission ? mutableSubmission?.id ?? null : null;
      const result = submissionIdToUpdate
        ? await updateSubmission(submissionIdToUpdate, payload)
        : await createSubmission(payload);
      if (guard) {
        if (
          activeAcademicYearIdRef.current !== guard.academicYearId
          || activeWorkspaceSubmissionIdRef.current !== guard.submissionId
          || activeEditingSubmissionIdRef.current !== guard.editingSubmissionId
          || (typeof guard.transitionEpoch === "number" && transitionEpochRef.current !== guard.transitionEpoch)
        ) {
          setAutosaveError("The draft changed during autosave. No stale changes were applied.");
          return result;
        }
      }

      setEditingSubmissionId(result.id);
      setPendingLocalDraft(null);
      setAutosaveError("");

      const savedAt = new Date().toISOString();
      setServerAutosaveAt(savedAt);
      lastAutosaveFingerprintRef.current = `${result.id}:${JSON.stringify(payload)}`;

      return result;
    },
    [createSubmission, editableWorkspaceSubmissionInScope, isAcademicYearValueAligned, isSubmissionInAcademicYear, mutableActiveWorkspaceSubmission, updateSubmission],
  );

  const ensureWorkspaceSubmission = useCallback(async (): Promise<IndicatorSubmission> => {
    if (!activeAcademicYearId) {
      throw new Error("Select an academic year.");
    }

    const existingDraft = (
      mutableActiveWorkspaceSubmission
      && isSubmissionInAcademicYear(mutableActiveWorkspaceSubmission, activeAcademicYearId)
    )
      ? mutableActiveWorkspaceSubmission
      : (
        editableWorkspaceSubmissionInScope
        && isSubmissionInAcademicYear(editableWorkspaceSubmissionInScope, activeAcademicYearId)
      )
      ? editableWorkspaceSubmissionInScope
      : null;

    if (existingDraft) {
      return existingDraft;
    }

    const bootstrapped = await bootstrapSubmission({
      academicYearId: Number(activeAcademicYearId),
      reportingPeriod,
    });

    preserveLocalWorkspaceAfterMutationRef.current = {
      academicYearId: activeAcademicYearId,
      submissionId: bootstrapped.id,
    };
    setActiveWorkspaceSubmission(bootstrapped);
    setEditingSubmissionId(bootstrapped.id);
    setPendingLocalDraft(null);
    setAutosaveError("");
    setServerAutosaveAt(bootstrapped.updatedAt ?? new Date().toISOString());
    lastAutosaveFingerprintRef.current = "";

    return bootstrapped;
  }, [activeAcademicYearId, bootstrapSubmission, editableWorkspaceSubmissionInScope, isSubmissionInAcademicYear, mutableActiveWorkspaceSubmission, reportingPeriod]);

  const triggerServerAutosave = useCallback(async () => {
    if (!canShowSaveAndSubmitActions) {
      return;
    }
    if (autosaveInFlightRef.current) {
      return;
    }
    if (criticalActionInFlightRef.current || isSaving || uploadingFileType !== null || isWorkspaceTransitioning) {
      return;
    }

    const shouldPersistFullWorkspace = Boolean(
      activeWorkspaceSubmission
      && isSubmissionInAcademicYear(activeWorkspaceSubmission, activeAcademicYearId),
    );
    const prepared = buildSubmissionPayloadFromCurrentWorkspace({
      allowIncomplete: true,
      includeAllEntries: shouldPersistFullWorkspace,
    });
    if (!prepared.payload) {
      return;
    }
    if (!ensureWorkspaceLineageAlignment() || !isAcademicYearValueAligned(prepared.payload.academicYearId)) {
      return;
    }

    const currentFingerprint = `${activeWorkspaceSubmission?.id ?? "new"}:${prepared.fingerprint}`;
    if (currentFingerprint === lastAutosaveFingerprintRef.current) {
      return;
    }

    autosaveInFlightRef.current = true;
    setIsAutosavingDraft(true);
    const autosaveTransitionEpoch = transitionEpochRef.current;
    try {
      await persistDraftPayload(prepared.payload, "autosave", {
        academicYearId: activeAcademicYearId,
        submissionId: activeWorkspaceSubmission?.id ?? null,
        editingSubmissionId: editingSubmissionId ?? null,
        transitionEpoch: autosaveTransitionEpoch,
      });
    } catch (err) {
      setAutosaveError(err instanceof Error ? err.message : "Server autosave failed. Draft is still kept locally.");
    } finally {
      autosaveInFlightRef.current = false;
      setIsAutosavingDraft(false);
    }
  }, [activeAcademicYearId, activeWorkspaceSubmission?.id, buildSubmissionPayloadFromCurrentWorkspace, canShowSaveAndSubmitActions, editingSubmissionId, ensureWorkspaceLineageAlignment, isAcademicYearValueAligned, isSaving, isWorkspaceTransitioning, persistDraftPayload, uploadingFileType]);

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

    // Avoid firing autosave when focus is still moving within the same form
    // (for example: input -> submit/save button), which can block manual actions.
    const nextFocused = event.relatedTarget;
    if (nextFocused instanceof Node && event.currentTarget.contains(nextFocused)) {
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
        const timelineYears = years.length > 0 ? years : visibleSchoolYears;
        const requiresTargetActual = TARGET_ACTUAL_METRIC_CODES.has(normalizeMetricCode(metric.code));

        for (let index = 1; index < timelineYears.length; index += 1) {
          const previousYear = timelineYears[index - 1];
          const year = timelineYears[index];
          if (!workspaceSchoolYears.includes(year)) {
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
  }, [orderedComplianceMetrics, visibleSchoolYears, workspaceSchoolYears]);

  const handleCopyFromLatestValidated = useCallback(() => {
    if (!latestValidatedSubmission) {
      setSubmitError("No validated package is available to copy from.");
      return;
    }

    const metricsById = new Map(orderedComplianceMetrics.map((metric) => [metric.id, metric]));
    const metricsByCode = new Map(orderedComplianceMetrics.map((metric) => [normalizeMetricCode(metric.code), metric]));
    const metricsByName = new Map(orderedComplianceMetrics.map((metric) => [normalizeMetricName(metric.name), metric]));
    const sourceByMetricId = new Map<string, IndicatorSubmissionItem>();
    for (const indicator of submissionRows(latestValidatedSubmission)) {
      const metric = resolveMetricFromIndicator(indicator, metricsById, metricsByCode, metricsByName);
      if (!metric) {
        continue;
      }

      sourceByMetricId.set(metric.id, indicator);
    }
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
        const effectiveYears = years.length > 0 ? years : visibleSchoolYears;
        const requiresTargetActual = TARGET_ACTUAL_METRIC_CODES.has(normalizeMetricCode(metric.code));

        for (const year of effectiveYears) {
          if (!workspaceSchoolYears.includes(year)) {
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
  }, [latestValidatedSubmission, orderedComplianceMetrics, visibleSchoolYears, workspaceSchoolYears]);

  const handleRestoreLocalDraft = useCallback(() => {
    void runGroupBAction("Restore local draft", async () => {
      if (!pendingLocalDraft) {
        return;
      }
      if (isSelectedSubmissionFinalized) {
        setSubmitError("A submitted backend package already exists for this academic year. Local restore is disabled.");
        return;
      }
      if (latestActiveWorkspaceSubmission) {
        setSubmitError(
          isSelectedSubmissionFinalized
            ? "A submitted backend package already exists for this academic year. Local restore is disabled."
            : "A saved backend submission already exists for this academic year. Local restore is disabled.",
        );
        return;
      }

      if (pendingLocalDraft.academicYearId !== activeAcademicYearId) {
        setSubmitError("This local draft no longer matches the selected academic year. Re-select the year and try again.");
        return;
      }

      const inScopeSubmissionId = resolveInScopeSubmissionId(
        pendingLocalDraft.editingSubmissionId ?? null,
      );

      await runCriticalWorkspaceTransition({
        dismissRestoreBanner: true,
        action: () => {
          workspaceDataOwnerRef.current = "local";
          setNotes(pendingLocalDraft.notes);
          setMetricEntries(buildMetricEntriesForLocalRestore(complianceMetrics, pendingLocalDraft.metricEntries));
          setEditingSubmissionId(inScopeSubmissionId);
          setAutosaveAt(pendingLocalDraft.savedAt);
        },
      });
    });
  }, [activeAcademicYearId, complianceMetrics, isSelectedSubmissionFinalized, latestActiveWorkspaceSubmission, pendingLocalDraft, resolveInScopeSubmissionId, runCriticalWorkspaceTransition, runGroupBAction]);

  const handleRestoreServerDraft = useCallback(() => {
    void runGroupBAction("Restore server draft", async () => {
      if (!restorableServerSubmissionInScope) {
        return;
      }
      if (!isSubmissionInAcademicYear(restorableServerSubmissionInScope, activeAcademicYearId)) {
        setSubmitError("This server draft no longer matches the selected academic year. Re-select the year and try again.");
        return;
      }

      handleEditDraft(restorableServerSubmissionInScope);
    });
  }, [activeAcademicYearId, handleEditDraft, isSubmissionInAcademicYear, restorableServerSubmissionInScope, runGroupBAction]);
  const runResetWorkspaceAction = useCallback(async (onSuccess?: () => void) => {
    await resetForm({ onSuccess });
  }, [resetForm]);
  const activeWorkspaceResetTarget = useMemo<GroupBWorkspaceResetTarget | null>(() => {
    if (activeTab?.kind === "upload") {
      return activeTab.uploadType;
    }
    if (!activeCategory) {
      return null;
    }
    if (activeCategory.id === "school_achievements_learning_outcomes") {
      return "school_achievements_learning_outcomes";
    }
    if (activeCategory.id === "key_performance_indicators") {
      return "key_performance_indicators";
    }
    return null;
  }, [activeCategory, activeTab]);
  const handleResetDraft = useCallback(async () => {
    console.log("[GroupB] Reset clicked");
    console.log("[GroupB] mode:", workspaceMode);
    console.log("[GroupB] busy:", isGroupBActionBusy);
    console.log("[GroupB] hasUnsavedWorkspaceChanges:", hasUnsavedWorkspaceChanges);
    await runGroupBAction("Reset draft", async () => {
      if (workspaceMode === "read_only_year") {
        setSubmitError("This academic year is not yet open for encoding.");
        return;
      }

      if (!activeWorkspaceResetTarget) {
        setSubmitError("No reset scope is available for the selected workspace.");
        return;
      }

      const activeSubmission = (
        latestActiveWorkspaceSubmission
        && isSubmissionInAcademicYear(latestActiveWorkspaceSubmission, activeAcademicYearIdRef.current)
      )
        ? latestActiveWorkspaceSubmission
        : null;
      const canResetWorkspaceRemotely = Boolean(
        activeSubmission?.id
        && ["draft", "returned"].includes(String(activeSubmission.status ?? "").toLowerCase()),
      );

      if (canResetWorkspaceRemotely && activeSubmission?.id) {
        await resetSubmissionWorkspace(activeSubmission.id, activeWorkspaceResetTarget);
      }

      if (activeWorkspaceResetTarget === "bmef" || activeWorkspaceResetTarget === "smea") {
        setUploadErrorByType((current) => ({ ...current, [activeWorkspaceResetTarget]: "" }));
        setOptimisticSubmittedByType((current) => ({ ...current, [activeWorkspaceResetTarget]: false }));
        setSubmitError("");
        return;
      }

      const selectedYearScope = workspaceSchoolYears.length > 0
        ? workspaceSchoolYears
        : yearWorkspaceState.requiredYearsInScope;
      const resetCategory = activeCategory;
      if (!resetCategory || resetCategory.metrics.length === 0) {
        setSubmitError("");
        return;
      }
      setMetricEntries((current) => {
        const next = { ...current };
        for (const metric of resetCategory.metrics) {
          next[metric.id] = buildResetEntryForMetric(metric, selectedYearScope, current[metric.id]);
        }
        return next;
      });
      setPendingLocalDraft(null);
      setAutosaveError("");
      setSubmitError("");
      setShowMissingFields(false);
      setMissingJumpIndex(0);
      setPendingFocusCellId(null);
    });
  }, [
    activeWorkspaceResetTarget,
    activeAcademicYearIdRef,
    activeCategory,
    hasUnsavedWorkspaceChanges,
    isGroupBActionBusy,
    isSubmissionInAcademicYear,
    latestActiveWorkspaceSubmission,
    resetSubmissionWorkspace,
    runGroupBAction,
    workspaceMode,
    workspaceSchoolYears,
    yearWorkspaceState.requiredYearsInScope,
  ]);
  const handleCancelSubmittedEdit = useCallback(async () => {
    await runGroupBAction("Cancel submitted edit", async () => {
      await runResetWorkspaceAction(() => setIsSubmittedEditMode(false));
    });
  }, [runGroupBAction, runResetWorkspaceAction]);
  const handleOpenEditSubmittedReport = useCallback(() => {
    if (workspaceMode === "read_only_year") {
      setSubmitError("This academic year is not yet open for encoding.");
      return;
    }
    void runCriticalWorkspaceTransition({
      dismissRestoreBanner: false,
      action: () => setShowEditConfirmModal(true),
    });
  }, [runCriticalWorkspaceTransition, workspaceMode]);

  const showRestoreBanner = !restoreBannerDismissed && (
    Boolean(
      pendingLocalDraft
      && !latestActiveWorkspaceSubmission
    )
    || Boolean(restorableServerSubmissionInScope && restorableServerSubmissionInScope.id !== editingSubmissionId)
  );

  const handleSaveActiveSection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log("[GroupB] Save section clicked");
    console.log("[GroupB] mode:", workspaceMode);
    console.log("[GroupB] busy:", isGroupBActionBusy);
    console.log("[GroupB] hasUnsavedWorkspaceChanges:", hasUnsavedWorkspaceChanges);
    await runGroupBAction("Save section", async () => {
      if (workspaceMode === "read_only_year") {
        setSubmitError("This academic year is not yet open for encoding.");
        return;
      }
      if (!activeCategory) {
        return;
      }
      if (isActiveCategoryLocked) {
        setSubmitError("This submitted report is read-only. Click Edit to continue.");
        return;
      }
      if (!ensureWorkspaceLineageAlignment()) {
        return;
      }

      const sectionToSave = workspaceSaveSectionForCategory(activeCategory.id);
      if (!sectionToSave) {
        setSubmitError("No save scope is available for the selected workspace section.");
        return;
      }

      const prepared = buildSubmissionPayloadFromCurrentWorkspace({
        metrics: activeCategory.metrics,
      });
      if (!prepared.payload) {
        const sectionMetricIds = new Set(activeCategory.metrics.map((metric) => String(metric.id)));
        const sectionMissingTargets = missingFieldTargets.filter((target) => sectionMetricIds.has(String(target.metricId)));
        if (sectionMissingTargets.length > 0) {
          setSubmitError(`Please complete all required ${categoryTabLabel(activeCategory)} fields before saving.`);
          setShowMissingFields(true);
          const firstMissing = sectionMissingTargets[0];
          if (firstMissing) {
            focusMissingTarget(firstMissing, sectionMissingTargets.length > 1 ? 1 : 0);
          }
          return;
        }
        setSubmitError(prepared.reason);
        return;
      }
      if (prepared.payload.indicators.length === 0) {
        setSubmitError(`No ${categoryTabLabel(activeCategory)} changes are ready to save.`);
        return;
      }
      const payload = {
        ...prepared.payload,
        mode: "partial",
        replace_missing: false,
      } satisfies IndicatorSubmissionPayload;
      console.log("[GroupB] payload:", payload);
      setSavingSection(sectionToSave);
      await runCriticalWorkspaceMutation({
        mutation: async () => {
          const submissionToSave = await ensureWorkspaceSubmission();
          return updateSubmission(submissionToSave.id, payload);
        },
        onSuccess: (saved) => {
          preserveLocalWorkspaceAfterMutationRef.current = {
            academicYearId: activeAcademicYearIdRef.current,
            submissionId: saved.id,
          };
          setActiveWorkspaceSubmission(saved);
          setEditingSubmissionId(saved.id);
          setPendingLocalDraft(null);
          setAutosaveError("");
          const savedAt = new Date().toISOString();
          setServerAutosaveAt(saved.updatedAt ?? savedAt);
          lastAutosaveFingerprintRef.current = `${saved.id}:${prepared.fingerprint}`;
        },
        getSuccessMessage: (saved) => `${workspaceSaveSectionLabel(sectionToSave)} saved for package #${saved.id}.`,
        skipResolvedWorkspaceRehydrate: true,
        onError: (err) => {
          console.error("[GroupB] API error:", err);
          setSubmitError(toGroupBActionErrorMessage(err, "Unable to save indicator package."));
        },
      });
      setSavingSection(null);
    });
  };

  const handleCreateAndSubmit = async () => {
    console.log("[GroupB] Submit clicked");
    console.log("[GroupB] mode:", workspaceMode);
    console.log("[GroupB] busy:", isGroupBActionBusy);
    console.log("[GroupB] hasUnsavedWorkspaceChanges:", hasUnsavedWorkspaceChanges);
    await runGroupBAction("Submit", async () => {
      if (workspaceMode === "read_only_year") {
        setSubmitError("This academic year is not yet open for encoding.");
        return;
      }
      if (isActiveCategoryLocked) {
        setSubmitError("This submitted report is read-only. Click Edit to continue.");
        return;
      }
      submittedEditPreserveContextRef.current = null;
      if (!ensureWorkspaceLineageAlignment()) {
        return;
      }

      const prepared = buildSubmissionPayloadFromCurrentWorkspace();
      if (!prepared.payload) {
        if (missingFieldTargets.length > 0) {
          setSubmitError("Please complete all required fields before submitting.");
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
      const payload = prepared.payload;
      console.log("[GroupB] payload:", payload);

      await runCriticalWorkspaceMutation({
        mutation: async () => {
          let submissionToSubmit = mutableActiveWorkspaceSubmission ?? editableWorkspaceSubmissionInScope ?? latestActiveWorkspaceSubmission;
          const submissionIdToUpdate = (
            submissionToSubmit && isSubmissionInAcademicYear(submissionToSubmit, payload.academicYearId)
              ? submissionToSubmit.id
              : null
          );
          const canUpdateActiveSubmission = Boolean(
            submissionIdToUpdate && isDraftOrReturnedWorkflowStatus(submissionToSubmit?.status),
          );

          if (!submissionIdToUpdate || !canUpdateActiveSubmission) {
            submissionToSubmit = await createSubmission(payload);
          } else if (hasUnsavedWorkspaceChanges) {
            submissionToSubmit = await updateSubmission(submissionIdToUpdate, payload);
          }

          if (!submissionToSubmit) {
            throw new Error("Unable to resolve the submission to submit.");
          }

          setActiveWorkspaceSubmission(submissionToSubmit);
          setEditingSubmissionId(submissionToSubmit.id);
          setPendingLocalDraft(null);
          setAutosaveError("");
          const savedAt = new Date().toISOString();
          setServerAutosaveAt(savedAt);
          lastAutosaveFingerprintRef.current = `${submissionToSubmit.id}:${prepared.fingerprint}`;

          return await submitSubmission(submissionToSubmit.id);
        },
        onSuccess: (result) => {
          return fetchFreshWorkspaceSubmission(result).then((freshResult) => {
            setOptimisticSubmittedByType({
              bmef: hasUploadedReportFile(freshResult.files?.bmef ?? null) || Boolean(freshResult.completion?.hasBmefFile),
              smea: hasUploadedReportFile(freshResult.files?.smea ?? null) || Boolean(freshResult.completion?.hasSmeaFile),
            });
            setActiveWorkspaceSubmission(freshResult);
            setEditingSubmissionId(freshResult.id);
            rehydrateWorkspaceFromSubmission(freshResult);
            setIsSubmittedEditMode(false);
            submittedEditPreserveContextRef.current = null;
            return refreshResolvedWorkspace();
          });
        },
        getSuccessMessage: (result) => `Package #${result.id} submitted to monitor.`,
        onError: (err) => {
          console.error("[GroupB] API error:", err);
          setSubmitError(toGroupBActionErrorMessage(err, "Unable to submit package."));
        },
      });
    });
  };

  const handleSubmitToMonitor = async (submission: IndicatorSubmission) => {
    console.log("[GroupB] Submit clicked");
    console.log("[GroupB] mode:", workspaceMode);
    console.log("[GroupB] busy:", isGroupBActionBusy);
    console.log("[GroupB] hasUnsavedWorkspaceChanges:", hasUnsavedWorkspaceChanges);
    await runGroupBAction("Re-submit", async () => {
      if (workspaceMode === "read_only_year") {
        setSubmitError("This academic year is not yet open for encoding.");
        return;
      }
      submittedEditPreserveContextRef.current = null;

      const submissionSummary = submissionMissingSummaryById.get(submission.id);
      if ((submissionSummary?.missingCount ?? 0) > 0) {
        setSubmitError(submissionSummary?.reason || "Complete all required indicator cells before submitting.");
        return;
      }

      await runCriticalWorkspaceMutation({
        mutation: async () => {
          let submissionToSubmit = (
            latestActiveWorkspaceSubmission?.id === submission.id && (mutableActiveWorkspaceSubmission ?? editableWorkspaceSubmissionInScope)
              ? (mutableActiveWorkspaceSubmission ?? editableWorkspaceSubmissionInScope)
              : submission
          );

          if (
            latestActiveWorkspaceSubmission?.id === submission.id
            || mutableActiveWorkspaceSubmission?.id === submission.id
            || editableWorkspaceSubmissionInScope?.id === submission.id
          ) {
            const prepared = buildSubmissionPayloadFromCurrentWorkspace();
            if (!prepared.payload) {
              throw new Error(prepared.reason || "Complete all required indicator cells before submitting.");
            }

            const canUpdateActiveSubmission = isDraftOrReturnedWorkflowStatus(submission.status);
            if (!canUpdateActiveSubmission) {
              console.log("[GroupB] payload:", prepared.payload);
              submissionToSubmit = await createSubmission(prepared.payload);
              setActiveWorkspaceSubmission(submissionToSubmit);
              setEditingSubmissionId(submissionToSubmit.id);
              setPendingLocalDraft(null);
              setAutosaveError("");
              const savedAt = new Date().toISOString();
              setServerAutosaveAt(savedAt);
              lastAutosaveFingerprintRef.current = `${submissionToSubmit.id}:${prepared.fingerprint}`;
            } else if (hasUnsavedWorkspaceChanges) {
              console.log("[GroupB] payload:", prepared.payload);
              submissionToSubmit = await updateSubmission(submission.id, prepared.payload);
              setActiveWorkspaceSubmission(submissionToSubmit);
              setEditingSubmissionId(submissionToSubmit.id);
              setPendingLocalDraft(null);
              setAutosaveError("");
              const savedAt = new Date().toISOString();
              setServerAutosaveAt(savedAt);
              lastAutosaveFingerprintRef.current = `${submissionToSubmit.id}:${prepared.fingerprint}`;
            }
          }

          return await submitSubmission(submissionToSubmit.id);
        },
        onSuccess: (result) => {
          return fetchFreshWorkspaceSubmission(result).then((freshResult) => {
            setOptimisticSubmittedByType({
              bmef: hasUploadedReportFile(freshResult.files?.bmef ?? null) || Boolean(freshResult.completion?.hasBmefFile),
              smea: hasUploadedReportFile(freshResult.files?.smea ?? null) || Boolean(freshResult.completion?.hasSmeaFile),
            });
            setActiveWorkspaceSubmission(freshResult);
            setEditingSubmissionId(freshResult.id);
            rehydrateWorkspaceFromSubmission(freshResult);
            setIsSubmittedEditMode(false);
            submittedEditPreserveContextRef.current = null;
            return refreshResolvedWorkspace();
          });
        },
        getSuccessMessage: (result) => `Package #${result.id} submitted to monitor.`,
        onError: (err) => {
          console.error("[GroupB] API error:", err);
          setSubmitError(toGroupBActionErrorMessage(err, "Unable to submit package."));
        },
      });
    });
  };

  const handleConfirmEditSubmittedReport = () => {
    void runGroupBAction("Edit submitted report", async () => {
      if (workspaceMode === "read_only_year") {
        setShowEditConfirmModal(false);
        setSubmitError("This academic year is not yet open for encoding.");
        return;
      }
      await runCriticalWorkspaceTransition({
        dismissRestoreBanner: true,
        action: () => {
          setShowEditConfirmModal(false);
          setIsSubmittedEditMode(true);
          setOptimisticSubmittedByType({ bmef: false, smea: false });
          setSubmitError("");
        },
      });
    });
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
    console.log("[GroupB] Upload clicked");
    console.log("[GroupB] mode:", workspaceMode);
    console.log("[GroupB] busy:", isGroupBActionBusy);
    console.log("[GroupB] hasUnsavedWorkspaceChanges:", hasUnsavedWorkspaceChanges);
    await runGroupBAction("Upload", async () => {
      setSavingSection(type);
      setUploadErrorByType((current) => ({ ...current, [type]: "" }));

      try {
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

        const uploadGuardAcademicYearId = activeAcademicYearIdRef.current;
        const uploaded = await runCriticalWorkspaceMutation({
          mutation: async () => {
            setUploadingFileType(type);
            let uploadTarget = selectedSubmissionForUploads;
            if (uploadTarget && !isSubmissionInAcademicYear(uploadTarget, activeAcademicYearIdRef.current)) {
              throw new Error("This file source no longer matches the selected academic year. No stale changes were applied. Re-select the year and try again.");
            }

            if (!uploadTarget?.id) {
              uploadTarget = await ensureWorkspaceSubmission();
            }
            if (
              activeAcademicYearIdRef.current !== uploadGuardAcademicYearId
              || !isSubmissionInAcademicYear(uploadTarget, activeAcademicYearIdRef.current)
              || (
                activeWorkspaceSubmissionIdRef.current !== null
                && activeWorkspaceSubmissionIdRef.current !== uploadTarget.id
              )
            ) {
              throw new Error("The workspace changed before this file action. No stale changes were applied. Re-select the academic year and try again.");
            }

            const updated = await uploadSubmissionFile(uploadTarget.id, type, file);
            if (!isSubmissionInAcademicYear(updated, activeAcademicYearIdRef.current)) {
              throw new Error("The selected academic year changed during upload. No stale changes were applied. Re-select the year and try again.");
            }
            if (
              activeAcademicYearIdRef.current !== uploadGuardAcademicYearId
              || !isSubmissionInAcademicYear(updated, activeAcademicYearIdRef.current)
            ) {
              throw new Error("The workspace changed before this file action completed. No stale changes were applied. Re-select the academic year and try again.");
            }
            return updated;
          },
          onSuccess: (updated) => {
            if (activeWorkspaceSubmissionIdRef.current !== null && activeWorkspaceSubmissionIdRef.current !== updated.id) {
              throw new Error("The workspace changed before this file action completed. No stale changes were applied. Re-select the academic year and try again.");
            }
            preserveLocalWorkspaceAfterMutationRef.current = {
              academicYearId: activeAcademicYearIdRef.current,
              submissionId: updated.id,
            };
            setActiveWorkspaceSubmission(updated);
            setEditingSubmissionId(updated.id);
            setPendingLocalDraft(null);
            setAutosaveError("");
            setServerAutosaveAt(updated.updatedAt ?? new Date().toISOString());
            setUploadingFileType(null);
            setUploadErrorByType((current) => ({ ...current, [type]: "" }));
          },
          getSuccessMessage: (updated) => `${type.toUpperCase()} file uploaded for package #${updated.id}.`,
          skipResolvedWorkspaceRehydrate: true,
          onError: (err) => {
            console.error("[GroupB] API error:", err);
            setUploadingFileType(null);
            setUploadErrorByType((current) => ({
              ...current,
              [type]: toGroupBActionErrorMessage(err, `Unable to upload ${type.toUpperCase()} file.`),
            }));
          },
        });
        if (!uploaded) {
          postRefreshMessageRef.current = null;
        }
      } finally {
        setSavingSection(null);
      }
    });
  }, [ensureWorkspaceSubmission, hasUnsavedWorkspaceChanges, isGroupBActionBusy, isSubmissionInAcademicYear, runCriticalWorkspaceMutation, runGroupBAction, selectedSubmissionForUploads, uploadSubmissionFile, workspaceMode]);

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
  const handleAcademicYearChange = useCallback((nextAcademicYearId: string) => {
    void runGroupBAction("Switch academic year", async () => {
      if (nextAcademicYearId === activeAcademicYearId) {
        return;
      }
      hasUserSelectedAcademicYearRef.current = true;
      await runCriticalWorkspaceTransition({
        dismissRestoreBanner: true,
        endOnComplete: false,
        action: () => setWorkspaceAcademicYearId(nextAcademicYearId),
      });
    });
  }, [activeAcademicYearId, runCriticalWorkspaceTransition, runGroupBAction]);

  const resolveFileSourceSubmission = useCallback(
    (type: IndicatorSubmissionFileType): { submission: IndicatorSubmission | null; error: string | null } => {
      const sourceSubmission = type === "bmef" ? bmefWorkspaceSubmission : smeaWorkspaceSubmission;
      const selectedYearId = activeAcademicYearIdRef.current;

      if (!sourceSubmission) {
        return {
          submission: null,
          error: "No submitted file is available for the selected academic year. Re-select the year and try again.",
        };
      }
      if (!isSubmissionInAcademicYear(sourceSubmission, selectedYearId)) {
        return {
          submission: null,
          error: "This file source no longer matches the selected academic year. No stale changes were applied. Re-select the year and try again.",
        };
      }

      const hasFile = type === "bmef"
        ? hasUploadedReportFile(sourceSubmission.files?.bmef ?? null) || Boolean(sourceSubmission.completion?.hasBmefFile)
        : hasUploadedReportFile(sourceSubmission.files?.smea ?? null) || Boolean(sourceSubmission.completion?.hasSmeaFile);

      if (!hasFile) {
        return {
          submission: null,
          error: "No submitted file is available for the selected academic year. Re-select the year and try again.",
        };
      }

      return { submission: sourceSubmission, error: null };
    },
    [bmefWorkspaceSubmission, isSubmissionInAcademicYear, smeaWorkspaceSubmission],
  );

  const handleDownloadUploadedFile = useCallback(async (type: IndicatorSubmissionFileType) => {
    setSubmitError("");
    setSaveMessage("");
    setUploadErrorByType((current) => ({ ...current, [type]: "" }));

    const source = resolveFileSourceSubmission(type);
    const guardAcademicYearId = activeAcademicYearIdRef.current;
    const guardWorkspaceSubmissionId = activeWorkspaceSubmissionIdRef.current;

    if (!source.submission) {
      setUploadErrorByType((current) => ({
        ...current,
        [type]: source.error ?? "This file source no longer matches the selected academic year. Re-select the year and try again.",
      }));
      return;
    }
    if (activeWorkspaceSubmissionIdRef.current !== guardWorkspaceSubmissionId) {
      setUploadErrorByType((current) => ({
        ...current,
        [type]: "The workspace changed before this file action. No stale changes were applied. Re-select the academic year and try again.",
      }));
      return;
    }
    if (!isSubmissionInAcademicYear(source.submission, guardAcademicYearId)) {
      setUploadErrorByType((current) => ({
        ...current,
        [type]: "This file source no longer matches the selected academic year. No stale changes were applied. Re-select the year and try again.",
      }));
      return;
    }

    try {
      await downloadSubmissionFile(source.submission.id, type);
    } catch (err) {
      setUploadErrorByType((current) => ({
        ...current,
        [type]: err instanceof Error ? err.message : `Unable to download ${type.toUpperCase()} file.`,
      }));
    }
  }, [downloadSubmissionFile, isSubmissionInAcademicYear, resolveFileSourceSubmission]);

  const handleViewUploadedFile = useCallback(async (type: IndicatorSubmissionFileType) => {
    setSubmitError("");
    setSaveMessage("");
    setUploadErrorByType((current) => ({ ...current, [type]: "" }));

    const source = resolveFileSourceSubmission(type);
    const guardAcademicYearId = activeAcademicYearIdRef.current;
    const guardWorkspaceSubmissionId = activeWorkspaceSubmissionIdRef.current;

    if (!source.submission) {
      setUploadErrorByType((current) => ({
        ...current,
        [type]: source.error ?? "This file source no longer matches the selected academic year. Re-select the year and try again.",
      }));
      return;
    }
    if (activeWorkspaceSubmissionIdRef.current !== guardWorkspaceSubmissionId) {
      setUploadErrorByType((current) => ({
        ...current,
        [type]: "The workspace changed before this file action. No stale changes were applied. Re-select the academic year and try again.",
      }));
      return;
    }
    if (!isSubmissionInAcademicYear(source.submission, guardAcademicYearId)) {
      setUploadErrorByType((current) => ({
        ...current,
        [type]: "This file source no longer matches the selected academic year. No stale changes were applied. Re-select the year and try again.",
      }));
      return;
    }

    const entry = type === "bmef"
      ? source.submission.files?.bmef ?? null
      : source.submission.files?.smea ?? null;

    try {
      const previewWindow = window.open("", "_blank", "noopener,noreferrer");
      if (!previewWindow) {
        throw new Error("Preview tab could not be opened.");
      }

      const relativeUrl = entry?.viewUrl ?? entry?.downloadUrl;
      if (!relativeUrl) {
        throw new Error("Preview URL is unavailable for this report.");
      }

      const isAbsoluteUrl = /^https?:\/\//i.test(relativeUrl);
      const endpoint = isAbsoluteUrl
        ? relativeUrl
        : `${getApiBaseUrl()}${relativeUrl.startsWith("/") ? relativeUrl : `/${relativeUrl}`}`;
      const headers: HeadersInit = {};
      if (apiToken && apiToken !== COOKIE_SESSION_TOKEN) {
        headers.Authorization = `Bearer ${apiToken}`;
      }

      const response = await fetch(endpoint, {
        method: "GET",
        credentials: apiToken === COOKIE_SESSION_TOKEN ? "include" : "omit",
        headers,
      });

      if (!response.ok) {
        throw new Error(`Preview request failed with status ${response.status}.`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      previewWindow.location.href = objectUrl;
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      await downloadSubmissionFile(source.submission.id, type).catch(() => undefined);
      setUploadErrorByType((current) => ({
        ...current,
        [type]: err instanceof Error ? err.message : `Unable to open ${type.toUpperCase()} report.`,
      }));
    }
  }, [apiToken, downloadSubmissionFile, isSubmissionInAcademicYear, resolveFileSourceSubmission]);

  const openUploadPicker = useCallback((type: IndicatorSubmissionFileType) => {
    if (type === "bmef") {
      bmefInputRef.current?.click();
      return;
    }

    smeaInputRef.current?.click();
  }, []);

  const handleRequestUpload = useCallback((type: IndicatorSubmissionFileType) => {
    console.log("[GroupB] Upload clicked");
    console.log("[GroupB] mode:", workspaceMode);
    console.log("[GroupB] busy:", isGroupBActionBusy);
    console.log("[GroupB] hasUnsavedWorkspaceChanges:", hasUnsavedWorkspaceChanges);
    if (isManualActionBlocked) {
      setSubmitError("Please wait for the current action to finish.");
      return;
    }
    setSubmitError("");
    setSaveMessage("");
    setUploadErrorByType((current) => ({ ...current, [type]: "" }));
    openUploadPicker(type);
  }, [hasUnsavedWorkspaceChanges, isGroupBActionBusy, isManualActionBlocked, openUploadPicker, workspaceMode]);

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
                    workspaceMode === "submitted_locked" || workspaceMode === "submitted_editing"
                      ? "border-primary-300 bg-primary-50 text-primary-700"
                      : workspaceMode === "read_only_year"
                        ? "border-slate-300 bg-slate-50 text-slate-600"
                        : "border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  School Achievements: {lifecycleStatusLabel}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    workspaceMode === "submitted_locked" || workspaceMode === "submitted_editing"
                      ? "border-primary-300 bg-primary-50 text-primary-700"
                      : workspaceMode === "read_only_year"
                        ? "border-slate-300 bg-slate-50 text-slate-600"
                        : "border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  Key Performance: {lifecycleStatusLabel}
                </span>
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
              {(workspaceMode === "submitted_locked" || workspaceMode === "submitted_editing") && submittedAtLabel && (
                <p className="mt-1 text-[11px] font-medium text-slate-500">
                  Submitted by {submittedByLabel ?? "Unknown"} • {formatDateTime(submittedAtLabel)}
                </p>
              )}
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
              {workspaceMode === "read_only_year" && (
                <p className="mt-2 text-right text-[11px] font-medium text-slate-500">
                  This academic year is read-only. Completion is shown for reference only.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      <form className="space-y-4 border-b border-slate-100 bg-slate-50/30 px-4 py-4" onSubmit={handleSaveActiveSection} onBlurCapture={handleFormBlurAutosave}>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="indicator-school-year" className="mb-1 block text-[12px] font-medium tracking-normal text-slate-500">
              Academic Year
            </label>
            <div className="relative">
              <select
                id="indicator-school-year"
                value={activeAcademicYearId}
                onChange={(event) => handleAcademicYearChange(event.target.value)}
                aria-label="Academic Year"
                disabled={isActiveCategoryLocked || isManualActionBlocked}
                className="w-full appearance-none rounded-sm border border-slate-300 bg-white px-3 py-2 pr-8 text-sm font-semibold text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              >
                {dropdownAcademicYears.map((year) => (
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
                disabled={isWorkspaceReadOnly}
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
                  disabled={isWorkspaceReadOnly}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Collapse optional note"
                  title="Collapse"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                id="indicator-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Add optional note"
                disabled={isWorkspaceReadOnly}
                className="w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowOptionalNotes(true)}
              disabled={isWorkspaceReadOnly}
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
                disabled={isWorkspaceReadOnly || complianceTabs.length <= 1}
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
                    const categoryRailBadge = tab.kind === "category"
                      ? getCategoryRailBadge(missingCount ?? 0)
                      : null;

                    return (
                      <button
                        key={tab.id}
                        data-category-id={tab.id}
                        type="button"
                        onClick={() => handleSelectCategory(tab.id)}
                        disabled={isWorkspaceReadOnly}
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
                              {getCategoryRailStatusLabel(progress)}
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
                              ? (categoryRailBadge?.tone ?? "border-slate-300 bg-white text-slate-600")
                              : (uploadSubmitted
                                ? "border-primary-300 bg-primary-50 text-primary-700"
                                : "border-amber-300 bg-amber-50 text-amber-700")
                          }`}
                        >
                          {tab.kind === "category"
                            ? (categoryRailBadge?.label ?? "Draft")
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
                disabled={isWorkspaceReadOnly || complianceTabs.length <= 1}
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
              disabled={isWorkspaceReadOnly}
              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
            <button
              type="button"
              onClick={() => setShowOnlyMissingRows((current) => !current)}
              disabled={isWorkspaceReadOnly}
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
                      disabled={isWorkspaceReadOnly}
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
                const uploadDisabled = isManualActionBlocked || isUploading || !canShowSaveAndSubmitActions;
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
                      canViewReport={uploaded}
                      isUploading={isUploading}
                      disabled={uploadDisabled}
                      onUploadClick={() => handleRequestUpload(activeUploadType)}
                      onViewClick={() => void handleViewUploadedFile(activeUploadType)}
                      onDownloadClick={() => void handleDownloadUploadedFile(activeUploadType)}
                      error={uploadError}
                    />
                    {!selectedSubmissionForUploads && canShowSaveAndSubmitActions && (
                      <p className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                        Upload will create a draft automatically if none exists yet.
                      </p>
                    )}
                    {!selectedSubmissionForUploads && !canShowSaveAndSubmitActions && (
                      <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                        This academic year is read-only. File upload is unavailable.
                      </p>
                    )}
                    {selectedSubmissionForUploads && !canShowSaveAndSubmitActions && (
                      <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                        This workspace is read-only. File upload is unavailable.
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
                      disabled={isWorkspaceReadOnly}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100"
                      title="Slide table left"
                      aria-label="Slide table left"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => slideIndicatorTable(1)}
                      disabled={isWorkspaceReadOnly}
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
                          visibleSchoolYears.map((year) => {
                            const isSelectedColumn = isSelectedYearColumn(year);
                            const canEditYear = isYearEditable(year) && !isActiveCategoryLocked;

                            return (
                              <th
                                key={`${activeCategory.id}-${year}`}
                                colSpan={2}
                                title={!canEditYear ? getYearLockReason(year) : "Active academic year workspace"}
                                className={`sticky top-0 z-30 border px-2 py-1.5 text-center ${
                                  isSelectedColumn
                                    ? "border-primary-300 bg-primary-50 text-slate-900"
                                    : "border-slate-300 bg-slate-50 text-slate-600"
                                }`}
                              >
                                <span className={isSelectedColumn ? "font-semibold" : "font-medium"}>{year}</span>
                                {isSelectedColumn && (
                                  <span className={`ml-1 rounded-sm px-1 py-0.5 text-[9px] font-semibold ${
                                    canEditYear
                                      ? "bg-primary-100 text-primary-700"
                                      : "bg-slate-200 text-slate-700"
                                  }`}>
                                    {canEditYear ? "Selected" : "Read-only"}
                                  </span>
                                )}
                              </th>
                            );
                          })
                        ) : (
                          <th colSpan={visibleSchoolYears.length} className="sticky top-0 z-30 border border-slate-300 bg-slate-100 px-3 py-1.5 text-center">
                            Academic Year
                          </th>
                        )}
                      </tr>
                      <tr className="bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                        {activeCategory.mode === "target_actual"
                          ? visibleSchoolYears.flatMap((year) => {
                              const isSelectedColumn = isSelectedYearColumn(year);
                              const headerClass = `sticky top-[29px] z-30 min-w-[150px] border px-2 py-1.5 text-center ${
                                isSelectedColumn
                                  ? "border-primary-200 bg-primary-50/70 text-slate-800"
                                  : "border-slate-300 bg-slate-50 text-slate-500"
                              }`;

                              return [
                                <th
                                  key={`${activeCategory.id}-${year}-target`}
                                  className={headerClass}
                                  title={!isSelectedColumn ? "Reference only" : "Selected academic year"}
                                >
                                  Target
                                </th>,
                                <th
                                  key={`${activeCategory.id}-${year}-actual`}
                                  className={headerClass}
                                  title={!isSelectedColumn ? "Reference only" : "Selected academic year"}
                                >
                                  Actual
                                </th>,
                              ];
                            })
                          : visibleSchoolYears.map((year) => (
                              <th
                                key={`${activeCategory.id}-${year}`}
                                title={!isYearEditable(year) ? getYearLockReason(year) : "Active academic year workspace"}
                                className={`sticky top-[29px] z-30 min-w-[170px] border px-2 py-1.5 text-center ${
                                  isSelectedYearColumn(year)
                                    ? "border-primary-200 bg-primary-50/70 text-slate-800"
                                    : "border-slate-300 bg-slate-50 text-slate-500"
                                }`}
                              >
                                {year}
                                {isSelectedYearColumn(year) && (
                                  <span className={`ml-1 rounded-sm px-1 py-0.5 text-[9px] font-semibold ${
                                    isYearEditable(year) && !isActiveCategoryLocked
                                      ? "bg-primary-100 text-primary-700"
                                      : "bg-slate-200 text-slate-700"
                                  }`}>
                                    {isYearEditable(year) && !isActiveCategoryLocked ? "Selected" : "Read-only"}
                                  </span>
                                )}
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
                                ? ["Evident", "Partially Evident", "Not Evident"]
                                : []
                            : [];
                      const useSelectInput = selectOptions.length > 0;
                      const isComplete = metricCompletionById.get(metric.id) ?? false;
                      const forceManualMetric = isForceManualMetric(metric);
                      const isAutoCalculated = forceManualMetric ? false : metricIsAutoCalculated(metric);
                      const isSyncedLockedMetric = forceManualMetric ? false : metricUsesSyncedLockedTotals(metric);
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
                          {visibleSchoolYears.map((year) => {
                            const placeholder =
                              valueType === "yes_no"
                                ? "Yes/No"
                                : valueType === "enum"
                                  ? enumOptions.join(" / ")
                                  : "";
                            const canEditYear = isYearEditable(year) && !isActiveCategoryLocked;
                            const yearLockReason = canEditYear ? undefined : getYearLockReason(year);
                            const isSelectedColumn = isSelectedYearColumn(year);
                            const valueCellId = indicatorCellId(metric.id, year, "value");
                            const targetCellId = indicatorCellId(metric.id, year, "target");
                            const actualCellId = indicatorCellId(metric.id, year, "actual");
                            const valueMissing = missingFieldByCellId.get(valueCellId);
                            const targetMissing = missingFieldByCellId.get(targetCellId);
                            const actualMissing = missingFieldByCellId.get(actualCellId);
                            const autoTargetValue = formatReferenceCellValue(current.targetMatrix[year]);
                            const autoActualValue = formatReferenceCellValue(current.actualMatrix[year]);
                            const autoSingleValue = formatReferenceCellValue(
                              String(current.actualMatrix[year] ?? "").trim() !== ""
                                ? current.actualMatrix[year]
                                : current.targetMatrix[year],
                            );
                            const referenceSingleValue = formatReferenceCellValue(
                              String(current.actualMatrix[year] ?? "").trim() !== ""
                                ? current.actualMatrix[year]
                                : current.targetMatrix[year],
                            );

                            const valueInputClass = `h-7 w-full rounded-sm border px-2 py-1 text-xs outline-none transition ${
                              valueMissing
                                ? "border-amber-300 bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                                : "border-slate-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary-100"
                            } text-slate-900`;
                            const targetInputClass = `h-7 w-full rounded-sm border px-2 py-1 text-xs outline-none transition ${
                              targetMissing
                                ? "border-amber-300 bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                                : "border-slate-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary-100"
                            } text-slate-900`;
                            const actualInputClass = `h-7 w-full rounded-sm border px-2 py-1 text-xs outline-none transition ${
                              actualMissing
                                ? "border-amber-300 bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                                : "border-slate-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary-100"
                            } text-slate-900`;

                            if (isAutoCalculated) {
                              if (activeCategory.mode !== "target_actual") {
                                return (
                                  <td key={`${metric.id}-${year}-auto`} title={yearLockReason} className="border border-slate-300 bg-primary-50/40 p-1.5 text-center align-middle">
                                    <span className="text-[11px] font-semibold text-primary-700">
                                      {autoSingleValue}
                                    </span>
                                  </td>
                                );
                              }

                              return (
                                <Fragment key={`${metric.id}-${year}-auto`}>
                                  <td title={yearLockReason} className="border border-slate-300 bg-primary-50/40 p-1.5 text-center align-middle">
                                    <span className="text-[11px] font-semibold text-primary-700">
                                      {autoTargetValue}
                                    </span>
                                  </td>
                                  <td title={yearLockReason} className="border border-slate-300 bg-primary-50/40 p-1.5 text-center align-middle">
                                    <span className="text-[11px] font-semibold text-primary-700">
                                      {autoActualValue}
                                    </span>
                                  </td>
                                </Fragment>
                              );
                            }

                            if (activeCategory.mode !== "target_actual") {
                              if (!isSelectedColumn) {
                                return (
                                  <td key={`${metric.id}-${year}`} title={yearLockReason} className="min-w-[170px] border border-slate-300 bg-slate-50/80 px-2 py-1.5 align-middle text-center text-xs font-medium text-slate-500">
                                    {referenceSingleValue}
                                  </td>
                                );
                              }

                              return (
                                <td key={`${metric.id}-${year}`} title={yearLockReason} className={`relative min-w-[170px] border p-1 align-middle ${
                                  isSelectedColumn
                                    ? "border-primary-200 bg-white"
                                    : "border-slate-300 bg-slate-50/80"
                                }`}>
                                  {useSelectInput ? (
                                    <select
                                      id={valueCellId}
                                      value={current.actualMatrix[year] ?? ""}
                                      onChange={(event) => setMetricMatrixValue(metric, year, "single", event.target.value)}
                                      disabled={!canEditYear}
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
                                      disabled={!canEditYear}
                                      className={valueInputClass}
                                    />
                                  )}
                                  {canEditYear && valueMissing && (
                                    <span className="pointer-events-none absolute right-1 top-1 rounded-sm bg-amber-100 px-1 py-0 text-[9px] font-semibold text-amber-700">
                                      Req
                                    </span>
                                  )}
                                  {canEditYear && valueMissing && (
                                    <p className="mt-1 text-[10px] font-medium text-amber-700">
                                      Required
                                    </p>
                                  )}
                                </td>
                              );
                            }

                            if (!isSelectedColumn) {
                              return (
                                <Fragment key={`${metric.id}-${year}`}>
                                  <td title={yearLockReason} className="min-w-[150px] border border-slate-300 bg-slate-50/80 px-2 py-1.5 align-middle text-center text-xs font-medium text-slate-500">
                                    {formatReferenceCellValue(current.targetMatrix[year])}
                                  </td>
                                  <td title={yearLockReason} className="min-w-[150px] border border-slate-300 bg-slate-50/80 px-2 py-1.5 align-middle text-center text-xs font-medium text-slate-500">
                                    {formatReferenceCellValue(current.actualMatrix[year])}
                                  </td>
                                </Fragment>
                              );
                            }

                            return (
                              <Fragment key={`${metric.id}-${year}`}>
                                <td title={yearLockReason} className={`relative min-w-[150px] border p-1 align-middle ${
                                  isSelectedColumn
                                    ? "border-primary-200 bg-white"
                                    : "border-slate-300 bg-slate-50/80"
                                }`}>
                                  {useSelectInput ? (
                                    <select
                                      id={targetCellId}
                                      value={current.targetMatrix[year] ?? ""}
                                      onChange={(event) => setMetricMatrixValue(metric, year, "target", event.target.value)}
                                      disabled={!canEditYear}
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
                                      disabled={!canEditYear}
                                      className={targetInputClass}
                                    />
                                  )}
                                  {canEditYear && targetMissing && (
                                    <span className="pointer-events-none absolute right-1 top-1 rounded-sm bg-amber-100 px-1 py-0 text-[9px] font-semibold text-amber-700">
                                      Req
                                    </span>
                                  )}
                                  {canEditYear && targetMissing && (
                                    <p className="mt-1 text-[10px] font-medium text-amber-700">
                                      Required target
                                    </p>
                                  )}
                                </td>
                                <td title={yearLockReason} className={`relative min-w-[150px] border p-1 align-middle ${
                                  isSelectedColumn
                                    ? "border-primary-200 bg-white"
                                    : "border-slate-300 bg-slate-50/80"
                                }`}>
                                  {useSelectInput ? (
                                    <select
                                      id={actualCellId}
                                      value={current.actualMatrix[year] ?? ""}
                                      onChange={(event) => setMetricMatrixValue(metric, year, "actual", event.target.value)}
                                      disabled={!canEditYear}
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
                                      disabled={!canEditYear}
                                      className={actualInputClass}
                                    />
                                  )}
                                  {canEditYear && actualMissing && (
                                    <span className="pointer-events-none absolute right-1 top-1 rounded-sm bg-amber-100 px-1 py-0 text-[9px] font-semibold text-amber-700">
                                      Req
                                    </span>
                                  )}
                                  {canEditYear && actualMissing && (
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
                          colSpan={activeCategory.mode === "target_actual" ? visibleSchoolYears.length * 2 + 1 : visibleSchoolYears.length + 1}
                          className="border border-slate-300 bg-slate-50 px-2 py-6 text-center text-sm text-slate-500"
                        >
                          No required compliance indicators found.
                        </td>
                      </tr>
                    )}
                    {activeCategory.metrics.length > 0 && filteredActiveMetrics.length === 0 && (
                      <tr>
                        <td
                          colSpan={activeCategory.mode === "target_actual" ? visibleSchoolYears.length * 2 + 1 : visibleSchoolYears.length + 1}
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

        {normalizedSubmitError && <p className="rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{normalizedSubmitError}</p>}
        {saveMessage && (
          <p className="rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">{saveMessage}</p>
        )}
        {normalizedIndicatorError && <p className="rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{normalizedIndicatorError}</p>}
        {(yearWorkspaceState.isWorkspaceReadOnly || !isSelectedYearEditable) && (
          <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
            {yearWorkspaceState.isWorkspaceReadOnly
              ? "No editable academic year is available in the current 5-year window."
              : "This academic year is not yet open for encoding."}
          </p>
        )}
        {showSubmitEligibilityHelper && (
          <p className="text-xs font-semibold text-amber-700">
            {submitBlockedReason || "Complete required fields before submitting."}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {canShowResetAction && (
            <button
              type="button"
              disabled={isManualActionBlocked}
              onClick={() => void handleResetDraft()}
              className="inline-flex items-center gap-2 rounded-sm border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Reset
            </button>
          )}
          {canShowCancelEditAction && (
            <button
              type="button"
              disabled={isManualActionBlocked}
              onClick={() => void handleCancelSubmittedEdit()}
              className="inline-flex items-center gap-2 rounded-sm border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Cancel Edit
            </button>
          )}
          {canShowSectionSaveAction && (
            <>
              <button
                type="submit"
                disabled={isManualActionBlocked || isSubmissionDataLoading || complianceMetrics.length === 0 || isWorkspaceReadOnly}
                title={saveActionDisabledTitle}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Target className="h-4 w-4" />
                {savingSection === activeSaveSection || isSaving ? "Saving..." : saveActionLabel}
              </button>
            </>
          )}
          {canShowSaveAndSubmitActions && (
            <button
              type="button"
              onClick={() => void handleCreateAndSubmit()}
              disabled={
                isManualActionBlocked
                || isSubmissionDataLoading
                || complianceMetrics.length === 0
                || isWorkspaceReadOnly
                || missingFieldTargets.length > 0
              }
              title={submitActionTitle}
              className="inline-flex items-center gap-2 rounded-sm border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Send className="h-4 w-4" />
              {submitActionLabel}
            </button>
          )}
          {canShowEditAction && (
            <button
              type="button"
              onClick={handleOpenEditSubmittedReport}
              disabled={isManualActionBlocked || isSubmissionDataLoading}
              title={isManualActionBlocked || isSubmissionDataLoading ? "Please wait for the current action to finish." : undefined}
              className="inline-flex items-center gap-2 rounded-sm border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Edit2 className="h-4 w-4" />
              Edit Submitted Report
            </button>
          )}
        </div>
      </form>
      {showEditConfirmModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-md rounded-sm border border-slate-200 bg-white p-4 shadow-2xl">
            <h4 className="text-sm font-bold text-slate-900">Confirm Edit</h4>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to edit a submitted report?
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEditConfirmModal(false)}
                className="inline-flex items-center rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmEditSubmittedReport}
                className="inline-flex items-center rounded-sm border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export const SchoolIndicatorPanel = memo(SchoolIndicatorPanelComponent);
SchoolIndicatorPanel.displayName = "SchoolIndicatorPanel";
