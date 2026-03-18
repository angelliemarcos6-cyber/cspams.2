import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BellRing,
  BookOpenText,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Database,
  Edit2,
  Eye,
  Filter,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Shell } from "@/components/Shell";
import { StatCard } from "@/components/StatCard";
import { StatusPieChart } from "@/components/charts/StatusPieChart";
import { RegionBarChart } from "@/components/charts/RegionBarChart";
import { SubmissionTrendChart } from "@/components/charts/SubmissionTrendChart";
import { MonitorIndicatorPanel } from "@/components/indicators/MonitorIndicatorPanel";
import { StudentRecordsPanel } from "@/components/students/StudentRecordsPanel";
import { useAuth } from "@/context/Auth";
import { useData } from "@/context/Data";
import { useIndicatorData } from "@/context/IndicatorData";
import { useStudentData } from "@/context/StudentData";
import { useTeacherData } from "@/context/TeacherData";
import { apiRequest, isApiError } from "@/lib/api";
import type {
  IndicatorSubmission,
  SchoolBulkImportResult,
  SchoolBulkImportRowPayload,
  SchoolHeadAccountStatusUpdatePayload,
  SchoolRecord,
  SchoolStatus,
  StudentRecord,
  TeacherRecord,
} from "@/types";
import {
  buildRegionAggregates,
  buildStatusDistribution,
  buildSubmissionTrend,
  formatDateTime,
  statusLabel,
} from "@/utils/analytics";

type SortColumn = "schoolName" | "region" | "studentCount" | "teacherCount" | "status" | "lastUpdated";
type SortDirection = "asc" | "desc";
type RequirementFilter = "all" | "missing" | "waiting" | "returned" | "submitted" | "validated";
type WorkflowStatus = Exclude<RequirementFilter, "all">;
type QueueLane = "all" | "urgent" | "returned" | "for_review" | "waiting_data";
type SchoolQuickPreset = "all" | "pending" | "returned" | "no_submission" | "high_risk";
type SchoolDrawerTab = "snapshot" | "submissions" | "history";
type MonitorTopNavigatorId = "overview" | "schools" | "reviews";
type ScopeDropdownSlot = "schools" | "students" | "teachers";
type FilterChipId = "search" | "status" | "requirement" | "lane" | "preset" | "school" | "student" | "teacher" | "date" | "context";
type ToastTone = "success" | "info" | "warning";

interface MonitorTopNavigatorItem {
  id: MonitorTopNavigatorId;
  label: string;
}

interface ManualStep {
  id: string;
  title: string;
  objective: string;
  actions: string[];
  doneWhen: string;
}

interface SchoolRequirementSummary {
  schoolKey: string;
  schoolCode: string;
  schoolName: string;
  region: string;
  schoolStatus: SchoolStatus | null;
  hasComplianceRecord: boolean;
  indicatorStatus: string | null;
  hasAnySubmitted: boolean;
  isComplete: boolean;
  awaitingReviewCount: number;
  missingCount: number;
  lastActivityAt: string | null;
  lastActivityTime: number;
}

interface MonitorRecordFormState {
  schoolId: string;
  schoolName: string;
  level: string;
  type: "public" | "private";
  district: string;
  region: string;
  address: string;
  studentCount: string;
  teacherCount: string;
  status: SchoolStatus;
  createSchoolHeadAccount: boolean;
  schoolHeadAccountName: string;
  schoolHeadAccountEmail: string;
}

type MonitorRecordFormField =
  | "schoolId"
  | "schoolName"
  | "level"
  | "type"
  | "district"
  | "region"
  | "address"
  | "studentCount"
  | "teacherCount"
  | "status"
  | "schoolHeadAccountName"
  | "schoolHeadAccountEmail";

interface SchoolScopeOption {
  key: string;
  code: string;
  name: string;
}

interface StudentLookupOption {
  id: string;
  lrn: string;
  fullName: string;
  schoolKey: string;
  schoolCode: string;
  schoolName: string;
}

interface TeacherLookupOption {
  id: string;
  name: string;
  schoolKey: string;
  schoolCode: string;
  schoolName: string;
}

type NavigatorIcon = ComponentType<{ className?: string }>;

interface QuickJumpItem {
  id: string;
  label: string;
  targetId: string;
  icon: NavigatorIcon;
}

interface DashboardToast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface MonitorRadarTotals {
  students: number;
  teachers: number;
  syncedAt: string | null;
  isLoading: boolean;
  error: string;
}

interface SchoolDetailSnapshot {
  schoolKey: string;
  schoolCode: string;
  schoolName: string;
  region: string;
  level: string;
  type: string;
  address: string;
  hasComplianceRecord: boolean;
  indicatorStatus: string | null;
  missingCount: number;
  awaitingReviewCount: number;
  lastActivityAt: string | null;
  reportedStudents: number;
  reportedTeachers: number;
  synchronizedStudents: number;
  synchronizedTeachers: number;
}

interface IndicatorMatrixRowCell {
  target: string;
  actual: string;
}

interface IndicatorMatrixRow {
  key: string;
  code: string;
  label: string;
  category: string;
  sortOrder: number;
  valuesByYear: Record<string, IndicatorMatrixRowCell>;
}

interface SchoolIndicatorPackageRow {
  id: string;
  schoolYear: string;
  reportingPeriod: string;
  status: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  complianceRatePercent: number | null;
  reviewedBy: string;
}

interface IndicatorSubmissionListResponse {
  data: IndicatorSubmission[];
  meta?: {
    current_page?: number;
    last_page?: number;
  };
}

interface PersistedMonitorFilters {
  search?: string;
  statusFilter?: SchoolStatus | "all";
  requirementFilter?: RequirementFilter;
  queueLane?: QueueLane;
  schoolQuickPreset?: SchoolQuickPreset;
  schoolScopeKey?: string;
  studentLookupId?: string | null;
  teacherLookupId?: string | null;
  teacherLookup?: string | null;
  filterDateFrom?: string;
  filterDateTo?: string;
  activeTopNavigator?: MonitorTopNavigatorId;
}


const MONITOR_TOP_NAVIGATOR_ITEMS: MonitorTopNavigatorItem[] = [
  { id: "overview", label: "Overview" },
  { id: "schools", label: "Schools" },
  { id: "reviews", label: "Reviews" },
];

const MONITOR_NAVIGATOR_ICONS: Record<MonitorTopNavigatorItem["id"], NavigatorIcon> = {
  overview: LayoutDashboard,
  schools: Building2,
  reviews: ClipboardList,
};

const MONITOR_NAVIGATOR_MANUAL: ManualStep[] = [
  {
    id: "overview",
    title: "Overview",
    objective: "Start with overall status and analytics before opening school-level work.",
    actions: [
      "Check summary totals for needs action, returned, and submitted.",
      "Use analytics to spot trends or spikes that need follow-up.",
    ],
    doneWhen: "Priority issues are identified for this review cycle.",
  },
  {
    id: "schools",
    title: "Schools",
    objective: "Open school-level records and verify synchronized student and teacher data.",
    actions: [
      "Use search and school filters to find the school you need quickly.",
      "Inspect school details and learner records without leaving the dashboard.",
    ],
    doneWhen: "The selected school context is verified and ready for review.",
  },
  {
    id: "reviews",
    title: "Reviews",
    objective: "Work through pending compliance reviews in one focused workspace.",
    actions: [
      "Review queue items, validate submissions, or return with clear notes.",
      "Use lane and workflow filters to process urgent schools first.",
    ],
    doneWhen: "Each queued school has a clear review action.",
  },
];

const MONITOR_MANUAL_STATUS_GUIDE = [
  "Missing: Requirement not yet submitted by school.",
  "For Review: Submitted and waiting for monitor review.",
  "Returned: Sent back to school head for correction.",
  "Submitted: Package was sent by school.",
  "Validated: Approved and closed.",
];

const REQUIREMENT_FILTER_OPTIONS: Array<{ id: RequirementFilter; label: string }> = [
  { id: "all", label: "All statuses" },
  { id: "missing", label: "Missing" },
  { id: "waiting", label: "For Review" },
  { id: "returned", label: "Returned" },
  { id: "submitted", label: "Submitted" },
  { id: "validated", label: "Validated" },
];

const SCHOOL_QUICK_PRESET_OPTIONS: Array<{ id: SchoolQuickPreset; label: string; hint: string }> = [
  { id: "all", label: "All", hint: "Show every school in the current scope." },
  { id: "pending", label: "Pending", hint: "Schools with submissions waiting for monitor review." },
  { id: "returned", label: "Returned", hint: "Schools with returned submissions that need correction." },
  { id: "no_submission", label: "No Submission", hint: "Schools with no compliance/indicator submission yet." },
  { id: "high_risk", label: "High Risk", hint: "Schools with missing or returned requirements." },
];

const MONITOR_QUICK_JUMPS: Record<MonitorTopNavigatorId, QuickJumpItem[]> = {
  overview: [
    { id: "filters_overview", label: "Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "overview_metrics", label: "Overview Metrics", targetId: "monitor-overview-metrics", icon: LayoutDashboard },
    { id: "overview_analytics", label: "Analytics", targetId: "monitor-targets-snapshot", icon: TrendingUp },
  ],
  reviews: [
    { id: "filters_queue", label: "Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "queue_list", label: "Queue List", targetId: "monitor-requirements-table", icon: ListChecks },
    { id: "queue_workspace", label: "Review Workspace", targetId: "monitor-queue-workspace", icon: ClipboardList },
  ],
  schools: [
    { id: "filters_schools", label: "Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "school_records", label: "School List", targetId: "monitor-school-records", icon: Building2 },
    { id: "school_learners", label: "Learner Records", targetId: "monitor-school-learners", icon: Users },
  ],
};

const EMPTY_MONITOR_RECORD_FORM: MonitorRecordFormState = {
  schoolId: "",
  schoolName: "",
  level: "Elementary",
  type: "public",
  district: "",
  region: "",
  address: "",
  studentCount: "",
  teacherCount: "",
  status: "active",
  createSchoolHeadAccount: false,
  schoolHeadAccountName: "",
  schoolHeadAccountEmail: "",
};

const ALL_SCHOOL_SCOPE = "__all_schools__";
const MONITOR_FILTER_STORAGE_KEY = "cspams.monitor.filters.v1";
const MONITOR_NAV_STORAGE_KEY = "cspams.monitor.nav.v1";
const SEARCH_DEBOUNCE_MS = 320;
const ADVANCED_ANALYTICS_HIDE_MS = 520;
const REQUIREMENT_PAGE_SIZE = 10;
const RECORD_PAGE_SIZE = 10;
const MOBILE_BREAKPOINT = 768;
const SCHOOL_DRAWER_SUBMISSION_CACHE_TTL_MS = 60_000;
const SCHOOL_DETAIL_COUNTS_CACHE_TTL_MS = 45_000;
const SCHOOL_YEAR_START_MONTH = 6;

const SCHOOL_ACHIEVEMENTS_CATEGORY_LABEL = "SCHOOL'S ACHIEVEMENTS AND LEARNING OUTCOMES";
const KEY_PERFORMANCE_CATEGORY_LABEL = "KEY PERFORMANCE INDICATORS";
const KEY_PERFORMANCE_METRIC_CODES = new Set([
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
]);

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

function schoolYearStartValue(value: string): number | null {
  const match = value.trim().match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end !== start + 1) {
    return null;
  }
  return start;
}

function deriveSchoolYearLabel(dateInput: string | null | undefined): string {
  const parsed = new Date(dateInput ?? "");
  const now = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  const startYear = now.getMonth() + 1 >= SCHOOL_YEAR_START_MONTH ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${startYear + 1}`;
}

function toDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const normalized = String(value).trim();
  return normalized;
}

function typedYearValues(payload: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const typed = payload as { values?: unknown };
  if (!typed.values || typeof typed.values !== "object") {
    return {};
  }

  const values: Record<string, string> = {};
  for (const [year, value] of Object.entries(typed.values as Record<string, unknown>)) {
    const normalized = toDisplayValue(value);
    if (normalized.length > 0) {
      values[year] = normalized;
    }
  }

  return values;
}

function indicatorCategoryLabel(metricCode: string | null | undefined): string {
  if (metricCode && KEY_PERFORMANCE_METRIC_CODES.has(metricCode)) {
    return KEY_PERFORMANCE_CATEGORY_LABEL;
  }
  return SCHOOL_ACHIEVEMENTS_CATEGORY_LABEL;
}

function indicatorDisplayLabel(metricCode: string | null | undefined, fallbackName: string): string {
  if (metricCode && METRIC_LABEL_OVERRIDES[metricCode]) {
    return METRIC_LABEL_OVERRIDES[metricCode];
  }
  return fallbackName;
}

function sortSchoolYears(years: Iterable<string>): string[] {
  return [...new Set(Array.from(years, (year) => year.trim()).filter((year) => year.length > 0))]
    .sort((a, b) => {
      const aStart = schoolYearStartValue(a);
      const bStart = schoolYearStartValue(b);
      if (aStart !== null && bStart !== null) {
        return aStart - bStart;
      }
      if (aStart !== null) return -1;
      if (bStart !== null) return 1;
      return a.localeCompare(b);
    });
}

function statusTone(status: SchoolStatus) {
  if (status === "active") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (status === "pending") return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
  return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
}

function isInteractiveTableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      "button, a, input, select, textarea, label, [role='button'], [contenteditable='true']",
    ),
  );
}

function schoolTypeLabel(value: string | null | undefined): string {
  if (!value) return "N/A";
  const normalized = value.toLowerCase();
  if (normalized === "public") return "Public";
  if (normalized === "private") return "Private";
  return value;
}

function accountStatusLabel(status: string | null | undefined): string {
  if (!status) return "No Account";
  const normalized = status.toLowerCase();
  if (normalized === "active") return "Active";
  if (normalized === "pending_setup") return "Pending Setup";
  if (normalized === "suspended") return "Suspended";
  if (normalized === "locked") return "Locked";
  if (normalized === "archived") return "Archived";
  return status;
}

function accountStatusTone(status: string | null | undefined): string {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "active") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (normalized === "pending_setup") return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  if (normalized === "suspended" || normalized === "locked") return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  if (normalized === "archived") return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
  return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
}

function workflowTone(status: string | null) {
  if (status === "validated") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (status === "submitted") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (status === "returned") return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  if (status === "draft") return "bg-slate-100 text-slate-600 ring-1 ring-slate-300";
  return "bg-slate-100 text-slate-600 ring-1 ring-slate-300";
}

function workflowLabel(status: string | null): string {
  if (!status) return "Missing";
  if (status === "submitted") return "For Review";
  if (status === "validated") return "Validated";
  if (status === "returned") return "Returned";
  if (status === "draft") return "Missing";
  return status;
}

function resolveWorkflowStatus(summary: SchoolRequirementSummary): WorkflowStatus {
  if (summary.missingCount > 0) return "missing";
  if (summary.indicatorStatus === "returned") return "returned";
  if (summary.awaitingReviewCount > 0 || summary.indicatorStatus === "submitted") return "waiting";
  if (summary.indicatorStatus === "validated") return "validated";
  if (summary.hasAnySubmitted) return "submitted";
  return "missing";
}

function isValidRequirementFilter(value: string | null | undefined): value is RequirementFilter {
  return value === "all" || value === "missing" || value === "waiting" || value === "returned" || value === "submitted" || value === "validated";
}

function isValidQueueLane(value: string | null | undefined): value is QueueLane {
  return value === "all" || value === "urgent" || value === "returned" || value === "for_review" || value === "waiting_data";
}

function isValidSchoolQuickPreset(value: string | null | undefined): value is SchoolQuickPreset {
  return value === "all" || value === "pending" || value === "returned" || value === "no_submission" || value === "high_risk";
}

function isValidSchoolStatusFilter(value: string | null | undefined): value is SchoolStatus | "all" {
  return value === "all" || value === "active" || value === "inactive" || value === "pending";
}

function resolveMonitorTopNavigator(value: string | null | undefined): MonitorTopNavigatorId | null {
  if (value === "overview" || value === "schools" || value === "reviews") {
    return value;
  }

  if (value === "reports") {
    return "overview";
  }

  if (value === "action_queue" || value === "compliance_review") {
    return "reviews";
  }

  return null;
}

function normalizeDateInput(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function parseDateBoundary(value: string | null | undefined, boundary: "start" | "end"): number | null {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;

  const suffix = boundary === "start" ? "T00:00:00" : "T23:59:59.999";
  const parsed = new Date(`${normalized}${suffix}`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debouncedValue;
}

function compareRecords(a: SchoolRecord, b: SchoolRecord, column: SortColumn, direction: SortDirection) {
  const sign = direction === "asc" ? 1 : -1;

  switch (column) {
    case "schoolName":
      return sign * a.schoolName.localeCompare(b.schoolName);
    case "region":
      return sign * a.region.localeCompare(b.region);
    case "studentCount":
      return sign * (a.studentCount - b.studentCount);
    case "teacherCount":
      return sign * (a.teacherCount - b.teacherCount);
    case "status":
      return sign * a.status.localeCompare(b.status);
    case "lastUpdated":
      return sign * (new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime());
    default:
      return 0;
  }
}

function SortIndicator({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) {
    return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />;
  }
  return direction === "asc" ? <ArrowUp className="h-3.5 w-3.5 text-primary" /> : <ArrowDown className="h-3.5 w-3.5 text-primary" />;
}

function navigatorButtonClass(active: boolean, compact: boolean): string {
  return `relative flex w-full items-center rounded-sm border-l-4 border-r border-y text-left text-xs font-semibold uppercase leading-none tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-100/80 focus-visible:ring-offset-1 focus-visible:ring-offset-primary-900 ${
    compact ? "h-11 justify-center px-2.5" : "h-11 gap-2.5 px-3"
  } ${
    active
      ? "border-l-primary-100 border-r-primary-300/90 border-y-primary-300/90 bg-primary-700 text-white shadow-[inset_0_0_0_1px_rgba(147,197,253,0.4),0_10px_18px_-16px_rgba(4,80,140,0.8)]"
      : "border-l-transparent border-r-primary-400/30 border-y-primary-400/30 bg-primary-900/45 text-primary-100 hover:border-r-primary-200/60 hover:border-y-primary-200/60 hover:bg-primary-700/80 hover:text-white"
  }`;
}

function toCsvCell(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, "\"\"")}"`;
  }
  return raw;
}

function downloadCsvFile(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const content = [headers.map((value) => toCsvCell(value)).join(","), ...rows.map((row) => row.map((value) => toCsvCell(value)).join(","))].join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

function truncateIndicatorDescription(value: string, maxLength = 48): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(12, maxLength - 3)).trimEnd()}...`;
}

function sanitizeAnchorToken(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "row";
}

function normalizeSchoolKey(schoolCode: string | null | undefined, schoolName: string | null | undefined): string {
  const code = schoolCode?.trim().toLowerCase();
  if (code) return `code:${code}`;

  const name = schoolName?.trim().toLowerCase();
  if (name) return `name:${name}`;

  return "unknown";
}

function normalizeSchoolCodeLabel(value: string | null | undefined): string {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : "N/A";
}

function normalizeSchoolNameLabel(value: string | null | undefined): string {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : "Unknown School";
}

function resolveStudentSchoolKey(student: StudentRecord): string {
  const fromCodeOrName = normalizeSchoolKey(student.school?.schoolCode ?? null, student.school?.name ?? null);
  if (fromCodeOrName !== "unknown") {
    return fromCodeOrName;
  }

  const schoolId = student.school?.id?.trim() ?? "";
  if (schoolId.length > 0) {
    return `id:${schoolId}`;
  }

  return "unknown";
}

function toStudentLookupOption(student: StudentRecord): StudentLookupOption {
  return {
    id: student.id,
    lrn: student.lrn,
    fullName: student.fullName,
    schoolKey: resolveStudentSchoolKey(student),
    schoolCode: normalizeSchoolCodeLabel(student.school?.schoolCode ?? null),
    schoolName: normalizeSchoolNameLabel(student.school?.name ?? null),
  };
}

function resolveTeacherSchoolKey(teacher: TeacherRecord): string {
  const fromCodeOrName = normalizeSchoolKey(teacher.school?.schoolCode ?? null, teacher.school?.name ?? null);
  if (fromCodeOrName !== "unknown") {
    return fromCodeOrName;
  }

  const schoolId = teacher.school?.id?.trim() ?? "";
  if (schoolId.length > 0) {
    return `id:${schoolId}`;
  }

  return "unknown";
}

function toTeacherLookupOption(teacher: TeacherRecord): TeacherLookupOption {
  return {
    id: teacher.id,
    name: teacher.name.trim(),
    schoolKey: resolveTeacherSchoolKey(teacher),
    schoolCode: normalizeSchoolCodeLabel(teacher.school?.schoolCode ?? null),
    schoolName: normalizeSchoolNameLabel(teacher.school?.name ?? null),
  };
}

function normalizeSearchTerms(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

function matchesAllSearchTerms(searchableText: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  return terms.every((term) => searchableText.includes(term));
}

function toTime(...candidates: Array<string | null | undefined>): number {
  for (const candidate of candidates) {
    const value = new Date(candidate ?? 0).getTime();
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 0;
}

function isPassedToMonitor(status: string | null): boolean {
  return status === "submitted" || status === "validated";
}

function isAwaitingReview(status: string | null): boolean {
  return status === "submitted";
}

function matchesRequirementFilter(summary: SchoolRequirementSummary, filter: RequirementFilter): boolean {
  if (filter === "all") return true;
  return resolveWorkflowStatus(summary) === filter;
}

function requirementFilterLabel(value: RequirementFilter): string {
  return REQUIREMENT_FILTER_OPTIONS.find((option) => option.id === value)?.label ?? "All statuses";
}

function isUrgentRequirement(row: SchoolRequirementSummary): boolean {
  return row.missingCount > 0 || row.indicatorStatus === "returned";
}

function urgencyRowTone(row: SchoolRequirementSummary): string {
  if (row.missingCount > 0) {
    return "bg-rose-50/80";
  }
  if (row.indicatorStatus === "returned") {
    return "bg-amber-50/80";
  }
  return "";
}

function queuePriorityScore(row: SchoolRequirementSummary): number {
  if (row.indicatorStatus === "returned") return 0;
  if (row.missingCount > 0) return 1;
  if (row.awaitingReviewCount > 0) return 2;
  return 3;
}

function queuePriorityLabel(row: SchoolRequirementSummary): string {
  if (row.indicatorStatus === "returned") return "Returned";
  if (row.missingCount > 0) return "Missing";
  if (row.awaitingReviewCount > 0) return "For Review";
  return "Normal";
}

function queuePriorityTone(row: SchoolRequirementSummary): string {
  if (row.indicatorStatus === "returned") {
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  }

  if (row.missingCount > 0) {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  }

  if (row.awaitingReviewCount > 0) {
    return "bg-primary-50 text-primary-700 ring-1 ring-primary-200";
  }

  return "bg-slate-100 text-slate-600 ring-1 ring-slate-300";
}

function matchesQueueLane(row: SchoolRequirementSummary, lane: QueueLane): boolean {
  if (lane === "all") return true;
  if (lane === "urgent") return row.missingCount > 0 || row.indicatorStatus === "returned";
  if (lane === "returned") return row.indicatorStatus === "returned";
  if (lane === "for_review") return row.awaitingReviewCount > 0;
  return row.missingCount > 0;
}

function queueLaneLabel(lane: QueueLane): string {
  if (lane === "all") return "All lanes";
  if (lane === "urgent") return "Urgent";
  if (lane === "returned") return "Returned";
  if (lane === "for_review") return "For Review";
  return "Waiting Data";
}

function matchesSchoolQuickPreset(row: SchoolRequirementSummary, preset: SchoolQuickPreset): boolean {
  if (preset === "all") return true;
  if (preset === "pending") return row.awaitingReviewCount > 0 || row.indicatorStatus === "submitted";
  if (preset === "returned") return row.indicatorStatus === "returned";
  if (preset === "no_submission") return !row.hasComplianceRecord && !row.hasAnySubmitted;
  return isUrgentRequirement(row);
}

function latestBySchool<
  T extends {
    school?: { schoolCode?: string | null; name?: string | null };
    updatedAt?: string | null;
    submittedAt?: string | null;
    createdAt?: string | null;
  },
>(entries: T[]): Map<string, T> {
  const latest = new Map<string, T>();

  for (const entry of entries) {
    const key = normalizeSchoolKey(entry.school?.schoolCode ?? null, entry.school?.name ?? null);
    if (key === "unknown") continue;

    const current = latest.get(key);
    if (!current) {
      latest.set(key, entry);
      continue;
    }

    if (toTime(entry.updatedAt, entry.submittedAt, entry.createdAt) > toTime(current.updatedAt, current.submittedAt, current.createdAt)) {
      latest.set(key, entry);
    }
  }

  return latest;
}

function extractApiValidationErrors(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object" || !("errors" in payload)) {
    return {};
  }

  const rawErrors = (payload as { errors?: unknown }).errors;
  if (!rawErrors || typeof rawErrors !== "object") {
    return {};
  }

  const fieldErrors: Record<string, string> = {};
  for (const [field, value] of Object.entries(rawErrors as Record<string, unknown>)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
      fieldErrors[field] = value[0];
      continue;
    }

    if (typeof value === "string") {
      fieldErrors[field] = value;
    }
  }

  return fieldErrors;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeCsvHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function resolveCsvColumnIndex(headers: Map<string, number>, aliases: string[]): number | null {
  for (const alias of aliases) {
    const key = normalizeCsvHeader(alias);
    if (headers.has(key)) {
      return headers.get(key) ?? null;
    }
  }

  return null;
}

function toCsvInteger(value: string): number | null {
  if (value.trim() === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function parseSchoolBulkImportCsv(content: string): { rows: SchoolBulkImportRowPayload[]; errors: string[] } {
  const lines = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return { rows: [], errors: ["CSV must include a header and at least one data row."] };
  }

  const headers = parseCsvLine(lines[0]).map((value) => normalizeCsvHeader(value));
  const headerIndexes = new Map<string, number>();
  headers.forEach((header, index) => {
    headerIndexes.set(header, index);
  });

  const columnIndex = {
    schoolId: resolveCsvColumnIndex(headerIndexes, ["school_id", "school_code", "schoolid", "code"]),
    schoolName: resolveCsvColumnIndex(headerIndexes, ["school_name", "school", "name"]),
    level: resolveCsvColumnIndex(headerIndexes, ["level"]),
    type: resolveCsvColumnIndex(headerIndexes, ["type"]),
    address: resolveCsvColumnIndex(headerIndexes, ["address"]),
    district: resolveCsvColumnIndex(headerIndexes, ["district"]),
    region: resolveCsvColumnIndex(headerIndexes, ["region"]),
    status: resolveCsvColumnIndex(headerIndexes, ["status"]),
    studentCount: resolveCsvColumnIndex(headerIndexes, ["student_count", "students", "studentcount"]),
    teacherCount: resolveCsvColumnIndex(headerIndexes, ["teacher_count", "teachers", "teachercount"]),
  };

  const missingRequiredColumns = [
    { key: "schoolId", label: "school_id" },
    { key: "schoolName", label: "school_name" },
    { key: "level", label: "level" },
    { key: "type", label: "type" },
    { key: "address", label: "address" },
    { key: "studentCount", label: "student_count" },
    { key: "teacherCount", label: "teacher_count" },
  ].filter((entry) => columnIndex[entry.key as keyof typeof columnIndex] === null);

  if (missingRequiredColumns.length > 0) {
    return {
      rows: [],
      errors: [
        `Missing required CSV column(s): ${missingRequiredColumns
          .map((item) => item.label)
          .join(", ")}.`,
      ],
    };
  }

  const getValue = (values: string[], index: number | null): string => {
    if (index === null || index < 0 || index >= values.length) return "";
    return values[index]?.trim() ?? "";
  };

  const rows: SchoolBulkImportRowPayload[] = [];
  const errors: string[] = [];

  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const values = parseCsvLine(lines[rowIndex]);

    const schoolId = getValue(values, columnIndex.schoolId);
    const schoolName = getValue(values, columnIndex.schoolName);
    const level = getValue(values, columnIndex.level);
    const type = getValue(values, columnIndex.type).toLowerCase();
    const address = getValue(values, columnIndex.address);
    const district = getValue(values, columnIndex.district);
    const region = getValue(values, columnIndex.region);
    const statusRaw = getValue(values, columnIndex.status).toLowerCase();
    const studentCount = toCsvInteger(getValue(values, columnIndex.studentCount));
    const teacherCount = toCsvInteger(getValue(values, columnIndex.teacherCount));

    if (!schoolId && !schoolName && !level && !address) {
      continue;
    }

    if (!/^\d{6}$/.test(schoolId)) {
      errors.push(`Row ${rowIndex + 1}: School Code must be 6 digits.`);
      continue;
    }

    if (!schoolName) {
      errors.push(`Row ${rowIndex + 1}: School name is required.`);
      continue;
    }

    if (!level) {
      errors.push(`Row ${rowIndex + 1}: Level is required.`);
      continue;
    }

    if (type !== "public" && type !== "private") {
      errors.push(`Row ${rowIndex + 1}: Type must be public or private.`);
      continue;
    }

    if (!address) {
      errors.push(`Row ${rowIndex + 1}: Address is required.`);
      continue;
    }

    if (studentCount === null) {
      errors.push(`Row ${rowIndex + 1}: Student count must be a whole number >= 0.`);
      continue;
    }

    if (teacherCount === null) {
      errors.push(`Row ${rowIndex + 1}: Teacher count must be a whole number >= 0.`);
      continue;
    }

    const normalizedStatus = statusRaw ? statusRaw : "active";
    if (!["active", "inactive", "pending"].includes(normalizedStatus)) {
      errors.push(`Row ${rowIndex + 1}: Status must be active, inactive, or pending.`);
      continue;
    }

    rows.push({
      schoolId,
      schoolName,
      level,
      type,
      address,
      district: district || null,
      region: region || null,
      status: normalizedStatus as SchoolStatus,
      studentCount,
      teacherCount,
    });
  }

  return { rows, errors };
}

export function MonitorDashboard() {
  const { token } = useAuth();
  const {
    records,
    recordCount,
    targetsMet,
    syncAlerts,
    isLoading,
    isSaving,
    error,
    lastSyncedAt,
    syncScope,
    syncStatus,
    refreshRecords,
    addRecord,
    updateRecord,
    deleteRecord,
    previewDeleteRecord,
    listArchivedRecords,
    restoreRecord,
    sendReminder,
    updateSchoolHeadAccountStatus,
    issueSchoolHeadSetupLink,
    bulkImportRecords,
  } = useData();
  const { submissions: indicatorSubmissions } = useIndicatorData();
  const {
    students,
    isLoading: isStudentDataLoading,
    listStudents,
  } = useStudentData();
  const { listTeachers } = useTeacherData();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const [statusFilter, setStatusFilter] = useState<SchoolStatus | "all">("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [requirementFilter, setRequirementFilter] = useState<RequirementFilter>("all");
  const [selectedSchoolScopeKey, setSelectedSchoolScopeKey] = useState<string>(ALL_SCHOOL_SCOPE);
  const [schoolScopeQuery, setSchoolScopeQuery] = useState("");
  const [schoolScopeDropdownSlot, setSchoolScopeDropdownSlot] = useState<ScopeDropdownSlot | null>(null);
  const [studentLookupQuery, setStudentLookupQuery] = useState("");
  const [teacherLookupQuery, setTeacherLookupQuery] = useState("");
  const debouncedStudentLookupQuery = useDebouncedValue(studentLookupQuery, SEARCH_DEBOUNCE_MS);
  const debouncedTeacherLookupQuery = useDebouncedValue(teacherLookupQuery, SEARCH_DEBOUNCE_MS);
  const [selectedStudentLookup, setSelectedStudentLookup] = useState<StudentLookupOption | null>(null);
  const [selectedTeacherLookup, setSelectedTeacherLookup] = useState<TeacherLookupOption | null>(null);
  const [dbStudentLookupOptions, setDbStudentLookupOptions] = useState<StudentLookupOption[]>([]);
  const [dbTeacherLookupOptions, setDbTeacherLookupOptions] = useState<TeacherLookupOption[]>([]);
  const [isStudentLookupSyncing, setIsStudentLookupSyncing] = useState(false);
  const [isTeacherLookupSyncing, setIsTeacherLookupSyncing] = useState(false);
  const [studentLookupSyncTick, setStudentLookupSyncTick] = useState(0);
  const [teacherLookupSyncTick, setTeacherLookupSyncTick] = useState(0);
  const [monitorRadarTotals, setMonitorRadarTotals] = useState<MonitorRadarTotals>({
    students: 0,
    teachers: 0,
    syncedAt: null,
    isLoading: false,
    error: "",
  });
  const [pendingStudentLookupId, setPendingStudentLookupId] = useState<string | null>(null);
  const [pendingTeacherLookupId, setPendingTeacherLookupId] = useState<string | null>(null);
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("lastUpdated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [activeTopNavigator, setActiveTopNavigator] = useState<MonitorTopNavigatorId>("overview");
  const [isNavigatorCompact, setIsNavigatorCompact] = useState(false);
  const [isNavigatorVisible, setIsNavigatorVisible] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 768,
  );
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < MOBILE_BREAKPOINT,
  );
  const [showNavigatorManual, setShowNavigatorManual] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showSchoolLearnerRecords, setShowSchoolLearnerRecords] = useState(false);
  const [showAdvancedAnalytics, setShowAdvancedAnalytics] = useState(false);
  const [renderAdvancedAnalytics, setRenderAdvancedAnalytics] = useState(false);
  const [isHidingAdvancedAnalytics, setIsHidingAdvancedAnalytics] = useState(false);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [requirementsPage, setRequirementsPage] = useState(1);
  const [recordsPage, setRecordsPage] = useState(1);
  const [queueLane, setQueueLane] = useState<QueueLane>("all");
  const [schoolQuickPreset, setSchoolQuickPreset] = useState<SchoolQuickPreset>("all");
  const [lockedSchoolContextKey, setLockedSchoolContextKey] = useState<string | null>(null);
  const [lastReviewCompletion, setLastReviewCompletion] = useState<{
    schoolKey: string;
    schoolName: string;
    submissionId: string;
    action: "validated" | "returned";
  } | null>(null);
  const [schoolDrawerKey, setSchoolDrawerKey] = useState<string | null>(null);
  const [activeSchoolDrawerTab, setActiveSchoolDrawerTab] = useState<SchoolDrawerTab>("snapshot");
  const [expandedDrawerIndicatorRows, setExpandedDrawerIndicatorRows] = useState<Record<string, boolean>>({});
  const [highlightedDrawerIndicatorKey, setHighlightedDrawerIndicatorKey] = useState<string | null>(null);
  const [accurateSyncedCountsBySchoolKey, setAccurateSyncedCountsBySchoolKey] = useState<
    Record<string, { students: number; teachers: number }>
  >({});
  const [syncedCountsLoadingSchoolKey, setSyncedCountsLoadingSchoolKey] = useState<string | null>(null);
  const [syncedCountsError, setSyncedCountsError] = useState("");
  const [toasts, setToasts] = useState<DashboardToast[]>([]);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [recordForm, setRecordForm] = useState<MonitorRecordFormState>(EMPTY_MONITOR_RECORD_FORM);
  const [recordFormErrors, setRecordFormErrors] = useState<Partial<Record<MonitorRecordFormField, string>>>({});
  const [recordFormError, setRecordFormError] = useState("");
  const [recordFormMessage, setRecordFormMessage] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [remindingSchoolKey, setRemindingSchoolKey] = useState<string | null>(null);
  const [accountActionKey, setAccountActionKey] = useState<string | null>(null);
  const [archivedRecords, setArchivedRecords] = useState<SchoolRecord[]>([]);
  const [showArchivedRecords, setShowArchivedRecords] = useState(false);
  const [isArchivedRecordsLoading, setIsArchivedRecordsLoading] = useState(false);
  const [bulkImportSummary, setBulkImportSummary] = useState<SchoolBulkImportResult | null>(null);
  const [bulkImportError, setBulkImportError] = useState("");
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [isSchoolActionsMenuOpen, setIsSchoolActionsMenuOpen] = useState(false);
  const globalSearchInputRef = useRef<HTMLInputElement | null>(null);
  const bulkImportInputRef = useRef<HTMLInputElement | null>(null);
  const schoolActionsMenuRef = useRef<HTMLDivElement | null>(null);
  const schoolsTableScrollerRef = useRef<HTMLDivElement | null>(null);
  const schoolsTableDragStateRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    button: number;
    moved: boolean;
  } | null>(null);
  const [isSchoolsTableDragging, setIsSchoolsTableDragging] = useState(false);
  const [schoolDrawerSubmissions, setSchoolDrawerSubmissions] = useState<IndicatorSubmission[] | null>(null);
  const [isSchoolDrawerSubmissionsLoading, setIsSchoolDrawerSubmissionsLoading] = useState(false);
  const [schoolDrawerSubmissionsError, setSchoolDrawerSubmissionsError] = useState("");
  const [schoolDrawerSubmissionSyncTick, setSchoolDrawerSubmissionSyncTick] = useState(0);
  const schoolDrawerSubmissionCacheRef = useRef<Map<string, { rows: IndicatorSubmission[]; fetchedAt: number }>>(
    new Map(),
  );
  const schoolDetailCountsCacheRef = useRef<Map<string, { students: number; teachers: number; fetchedAt: number }>>(
    new Map(),
  );
  const schoolDetailCountsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    schoolDrawerSubmissionCacheRef.current.clear();
    schoolDetailCountsCacheRef.current.clear();
    schoolDetailCountsAbortRef.current?.abort();
    schoolDetailCountsAbortRef.current = null;
  }, [token]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncViewport = () => {
      setIsMobileViewport(window.innerWidth < MOBILE_BREAKPOINT);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  useEffect(() => {
    if (!isSchoolActionsMenuOpen || typeof window === "undefined") return;

    const onPointerDown = (event: MouseEvent) => {
      const menu = schoolActionsMenuRef.current;
      if (!menu) return;
      if (menu.contains(event.target as Node)) return;
      setIsSchoolActionsMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSchoolActionsMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isSchoolActionsMenuOpen]);

  useEffect(() => {
    const handleRealtimeLookupRefresh = (event: Event) => {
      const payload = (event as CustomEvent<{ entity?: string }>).detail;
      if (!payload?.entity) return;
      if (payload.entity === "students" || payload.entity === "dashboard" || payload.entity === "school_records") {
        setStudentLookupSyncTick((current) => current + 1);
      }
      if (payload.entity === "teachers" || payload.entity === "dashboard" || payload.entity === "school_records") {
        setTeacherLookupSyncTick((current) => current + 1);
      }
      if (payload.entity === "indicators") {
        schoolDrawerSubmissionCacheRef.current.clear();
        setSchoolDrawerSubmissionSyncTick((current) => current + 1);
      }
    };

    window.addEventListener("cspams:update", handleRealtimeLookupRefresh);
    return () => {
      window.removeEventListener("cspams:update", handleRealtimeLookupRefresh);
    };
  }, []);

  useEffect(() => {
    if (showAdvancedAnalytics) {
      setRenderAdvancedAnalytics(true);
      setIsHidingAdvancedAnalytics(false);
      return;
    }

    if (!renderAdvancedAnalytics) {
      return;
    }

    setIsHidingAdvancedAnalytics(true);

    if (typeof window === "undefined") {
      setRenderAdvancedAnalytics(false);
      setIsHidingAdvancedAnalytics(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setRenderAdvancedAnalytics(false);
      setIsHidingAdvancedAnalytics(false);
    }, ADVANCED_ANALYTICS_HIDE_MS);

    return () => window.clearTimeout(timeout);
  }, [showAdvancedAnalytics, renderAdvancedAnalytics]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(MONITOR_NAV_STORAGE_KEY);
      if (!raw) return;
      const persisted = JSON.parse(raw) as { compact?: boolean; visible?: boolean };
      if (typeof persisted.compact === "boolean") {
        setIsNavigatorCompact(persisted.compact);
      }
      if (typeof persisted.visible === "boolean") {
        setIsNavigatorVisible(persisted.visible);
      }
    } catch {
      // Ignore invalid persisted navigator state.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        MONITOR_NAV_STORAGE_KEY,
        JSON.stringify({ compact: isNavigatorCompact, visible: isNavigatorVisible }),
      );
    } catch {
      // Ignore storage failures.
    }
  }, [isNavigatorCompact, isNavigatorVisible]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName.toLowerCase();
        if (tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable) {
          return;
        }
      }

      const shortcutIndex = Number(event.key) - 1;
      if (!Number.isInteger(shortcutIndex)) return;

      const shortcutItem = MONITOR_TOP_NAVIGATOR_ITEMS[shortcutIndex];
      if (!shortcutItem) return;

      event.preventDefault();
      setShowNavigatorManual(false);
      setActiveTopNavigator(shortcutItem.id);
      if (isMobileViewport) {
        setIsNavigatorVisible(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobileViewport]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const hasQueryFilters = ["q", "status", "workflow", "lane", "preset", "school", "student", "teacher", "from", "to", "tab"].some((key) =>
      params.has(key),
    );
    const requestedTab = params.get("tab");

    let persisted: PersistedMonitorFilters | null = null;

    if (hasQueryFilters) {
      persisted = {
        search: params.get("q") ?? "",
        statusFilter: (params.get("status") as SchoolStatus | "all" | null) ?? undefined,
        requirementFilter: (params.get("workflow") as RequirementFilter | null) ?? undefined,
        queueLane: (params.get("lane") as QueueLane | null) ?? undefined,
        schoolQuickPreset: (params.get("preset") as SchoolQuickPreset | null) ?? undefined,
        schoolScopeKey: params.get("school") ?? ALL_SCHOOL_SCOPE,
        studentLookupId: params.get("student"),
        teacherLookupId: params.get("teacher"),
        filterDateFrom: params.get("from") ?? "",
        filterDateTo: params.get("to") ?? "",
        activeTopNavigator: (params.get("tab") as MonitorTopNavigatorId | null) ?? undefined,
      };
    } else {
      try {
        const raw = localStorage.getItem(MONITOR_FILTER_STORAGE_KEY);
        if (raw) {
          persisted = JSON.parse(raw) as PersistedMonitorFilters;
        }
      } catch {
        persisted = null;
      }
    }

    if (persisted) {
      setSearch(persisted.search?.trim() ?? "");
      if (isValidSchoolStatusFilter(persisted.statusFilter)) {
        setStatusFilter(persisted.statusFilter);
      }
      if (isValidRequirementFilter(persisted.requirementFilter)) {
        setRequirementFilter(persisted.requirementFilter);
      }
      if (isValidQueueLane(persisted.queueLane)) {
        setQueueLane(persisted.queueLane);
      }
      if (isValidSchoolQuickPreset(persisted.schoolQuickPreset)) {
        setSchoolQuickPreset(persisted.schoolQuickPreset);
      }
      if (persisted.schoolScopeKey) {
        setSelectedSchoolScopeKey(persisted.schoolScopeKey);
      }
      const persistedTeacherLookupId = persisted.teacherLookupId ?? null;
      if (persistedTeacherLookupId) {
        setPendingTeacherLookupId(persistedTeacherLookupId);
      } else if (persisted.teacherLookup) {
        setTeacherLookupQuery(persisted.teacherLookup);
      }
      setFilterDateFrom(normalizeDateInput(persisted.filterDateFrom));
      setFilterDateTo(normalizeDateInput(persisted.filterDateTo));
      if (persisted.studentLookupId) {
        setPendingStudentLookupId(persisted.studentLookupId);
      }
    }

    const resolvedNavigator = resolveMonitorTopNavigator(requestedTab);
    if (resolvedNavigator) {
      setActiveTopNavigator(resolvedNavigator);
    } else {
      setActiveTopNavigator("overview");
    }

    setFiltersHydrated(true);
  }, []);

  useEffect(() => {
    if (!filtersHydrated || typeof window === "undefined") return;

    const payload: PersistedMonitorFilters = {
      search,
      statusFilter,
      requirementFilter,
      queueLane,
      schoolQuickPreset,
      schoolScopeKey: selectedSchoolScopeKey,
      studentLookupId: selectedStudentLookup?.id ?? pendingStudentLookupId ?? null,
      teacherLookupId: selectedTeacherLookup?.id ?? pendingTeacherLookupId ?? null,
      filterDateFrom,
      filterDateTo,
    };

    try {
      localStorage.setItem(MONITOR_FILTER_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage failures in restricted browser modes.
    }

    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string | null) => {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    };

    setOrDelete("q", search.trim() ? search.trim() : null);
    setOrDelete("status", statusFilter !== "all" ? statusFilter : null);
    setOrDelete("workflow", requirementFilter !== "all" ? requirementFilter : null);
    setOrDelete("lane", queueLane !== "all" ? queueLane : null);
    setOrDelete("preset", schoolQuickPreset !== "all" ? schoolQuickPreset : null);
    setOrDelete("school", selectedSchoolScopeKey !== ALL_SCHOOL_SCOPE ? selectedSchoolScopeKey : null);
    setOrDelete("student", selectedStudentLookup?.id ?? pendingStudentLookupId ?? null);
    setOrDelete("teacher", selectedTeacherLookup?.id ?? pendingTeacherLookupId ?? null);
    setOrDelete("from", filterDateFrom.trim() ? filterDateFrom.trim() : null);
    setOrDelete("to", filterDateTo.trim() ? filterDateTo.trim() : null);

    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [
    filterDateFrom,
    filterDateTo,
    filtersHydrated,
    pendingStudentLookupId,
    pendingTeacherLookupId,
    queueLane,
    requirementFilter,
    schoolQuickPreset,
    search,
    selectedSchoolScopeKey,
    selectedStudentLookup?.id,
    selectedTeacherLookup?.id,
    statusFilter,
  ]);

  const pushToast = (message: string, tone: ToastTone = "info") => {
    const toastId = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id: toastId, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toastId));
    }, 3200);
  };

  const dismissToast = (id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  };

  const revealSetupLink = async (setupLink: string, schoolName: string) => {
    const trimmedLink = setupLink.trim();
    if (!trimmedLink) return;

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(trimmedLink);
        pushToast(`Setup link copied for ${schoolName}.`, "success");
        return;
      } catch {
        // Fall back to prompt copy if clipboard access fails.
      }
    }

    window.prompt(`Copy the setup link for ${schoolName}:`, trimmedLink);
  };

  const resetRecordForm = () => {
    setEditingRecordId(null);
    setRecordForm(EMPTY_MONITOR_RECORD_FORM);
    setRecordFormErrors({});
    setRecordFormError("");
    setRecordFormMessage("");
  };

  const openCreateRecordForm = () => {
    resetRecordForm();
    setBulkImportError("");
    setBulkImportSummary(null);
    setActiveTopNavigator("schools");
    setShowRecordForm(true);
  };

  const closeRecordForm = () => {
    setShowRecordForm(false);
    resetRecordForm();
  };

  const openEditRecordForm = (record: SchoolRecord) => {
    setEditingRecordId(record.id);
    setRecordForm({
      schoolId: record.schoolId ?? record.schoolCode ?? "",
      schoolName: record.schoolName ?? "",
      level: record.level ?? "Elementary",
      type: String(record.type ?? "").toLowerCase() === "private" ? "private" : "public",
      district: record.district ?? "",
      region: record.region ?? "",
      address: record.address ?? record.district ?? "",
      studentCount: String(record.studentCount ?? 0),
      teacherCount: String(record.teacherCount ?? 0),
      status: record.status,
      createSchoolHeadAccount: false,
      schoolHeadAccountName: "",
      schoolHeadAccountEmail: "",
    });
    setRecordFormErrors({});
    setRecordFormError("");
    setRecordFormMessage("");
    setDeleteError("");
    setBulkImportError("");
    setBulkImportSummary(null);
    setShowRecordForm(true);
    setActiveTopNavigator("schools");
    window.setTimeout(() => {
      focusAndScrollTo("monitor-school-records");
    }, 80);
  };

  const validateRecordForm = (): boolean => {
    const formErrors: Partial<Record<MonitorRecordFormField, string>> = {};
    const schoolId = recordForm.schoolId.trim().toUpperCase();
    const schoolName = recordForm.schoolName.trim();
    const level = recordForm.level.trim();
    const district = recordForm.district.trim();
    const region = recordForm.region.trim();
    const address = recordForm.address.trim();

    if (!/^\d{6}$/.test(schoolId)) {
      formErrors.schoolId = "School Code must be exactly 6 digits.";
    }

    if (!schoolName) formErrors.schoolName = "School name is required.";
    if (!level) formErrors.level = "Level is required.";
    if (!address) formErrors.address = "Address is required.";
    if (!recordForm.type) formErrors.type = "Type is required.";

    if (district.length > 255) formErrors.district = "District must be 255 characters or less.";
    if (region.length > 255) formErrors.region = "Region must be 255 characters or less.";

    if (!editingRecordId && recordForm.createSchoolHeadAccount) {
      if (!recordForm.schoolHeadAccountName.trim()) {
        formErrors.schoolHeadAccountName = "Account name is required.";
      }

      if (!recordForm.schoolHeadAccountEmail.trim()) {
        formErrors.schoolHeadAccountEmail = "Email is required.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recordForm.schoolHeadAccountEmail.trim())) {
        formErrors.schoolHeadAccountEmail = "Use a valid email address.";
      }
    }

    setRecordFormErrors(formErrors);
    if (Object.keys(formErrors).length > 0) {
      setRecordFormError("Please fix the highlighted fields.");
      return false;
    }

    setRecordFormError("");
    return true;
  };

  const handleRecordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRecordFormErrors({});
    setRecordFormError("");
    setRecordFormMessage("");
    setDeleteError("");
    setBulkImportError("");

    if (!validateRecordForm()) {
      return;
    }

    const editingRecord = editingRecordId ? records.find((item) => item.id === editingRecordId) : null;
    const resolvedStudentCount = editingRecord?.studentCount ?? Number(recordForm.studentCount || 0);
    const resolvedTeacherCount = editingRecord?.teacherCount ?? Number(recordForm.teacherCount || 0);
    const resolvedStatus = editingRecord?.status ?? recordForm.status ?? "active";

    const payload = {
      schoolId: recordForm.schoolId.trim().toUpperCase(),
      schoolName: recordForm.schoolName.trim(),
      level: recordForm.level.trim(),
      type: recordForm.type,
      address: recordForm.address.trim(),
      district: recordForm.district.trim() || undefined,
      region: recordForm.region.trim() || undefined,
      studentCount: resolvedStudentCount,
      teacherCount: resolvedTeacherCount,
      status: resolvedStatus,
      schoolHeadAccount:
        !editingRecordId && recordForm.createSchoolHeadAccount
          ? {
              name: recordForm.schoolHeadAccountName.trim(),
              email: recordForm.schoolHeadAccountEmail.trim(),
            }
          : undefined,
    };

    try {
      if (editingRecordId) {
        await updateRecord(editingRecordId, payload);
        setRecordFormMessage("School record updated.");
      } else {
        const provisioning = await addRecord(payload);
        setRecordFormMessage(
          provisioning
            ? "School record created. Setup link generated for the School Head account."
            : "School record created.",
        );

        if (provisioning?.setupLink) {
          await revealSetupLink(provisioning.setupLink, payload.schoolName);
        }
      }

      setTimeout(() => {
        closeRecordForm();
      }, 800);
    } catch (err) {
      if (isApiError(err)) {
        const apiFieldErrors = extractApiValidationErrors(err.payload);
        if (Object.keys(apiFieldErrors).length > 0) {
          const mappedErrors: Partial<Record<MonitorRecordFormField, string>> = {};
          for (const [field, message] of Object.entries(apiFieldErrors)) {
            if (field === "schoolHeadAccount.name") mappedErrors.schoolHeadAccountName = message;
            else if (field === "schoolHeadAccount.email") mappedErrors.schoolHeadAccountEmail = message;
            else if (
              field === "schoolId" ||
              field === "schoolName" ||
              field === "level" ||
              field === "type" ||
              field === "district" ||
              field === "region" ||
              field === "address" ||
              field === "studentCount" ||
              field === "teacherCount" ||
              field === "status"
            ) {
              mappedErrors[field as MonitorRecordFormField] = message;
            }
          }

          if (Object.keys(mappedErrors).length > 0) {
            setRecordFormErrors(mappedErrors);
            setRecordFormError("Please fix the highlighted fields.");
            return;
          }
        }
      }

      setRecordFormError(err instanceof Error ? err.message : "Unable to save school record.");
    }
  };

  const handleDeleteRecord = async (record: SchoolRecord) => {
    setDeleteError("");
    setRecordFormMessage("");
    setBulkImportError("");

    const schoolName = record.schoolName || "this school";
    let previewMessage = "";
    try {
      const preview = await previewDeleteRecord(record.id);
      previewMessage = `\n\nDependencies:\n- Students: ${preview.dependencies.students}\n- Sections: ${preview.dependencies.sections}\n- Indicator submissions: ${preview.dependencies.indicatorSubmissions}\n- Compliance histories: ${preview.dependencies.histories}\n- Linked users: ${preview.dependencies.linkedUsers}`;
    } catch {
      previewMessage = "\n\nDependency preview unavailable. Proceed with caution.";
    }

    const confirmed = window.confirm(`Archive ${schoolName}? This hides it from active lists and can be restored later.${previewMessage}`);
    if (!confirmed) {
      return;
    }

    setDeletingRecordId(record.id);
    try {
      await deleteRecord(record.id);
      if (showArchivedRecords) {
        await loadArchivedRecords();
      }
      pushToast(`Archived ${schoolName}.`, "success");
      if (editingRecordId === record.id) {
        closeRecordForm();
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Unable to delete school record.");
    } finally {
      setDeletingRecordId(null);
    }
  };

  const loadArchivedRecords = async () => {
    setIsArchivedRecordsLoading(true);
    setDeleteError("");
    try {
      const archived = await listArchivedRecords();
      setArchivedRecords(archived);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Unable to load archived schools.");
    } finally {
      setIsArchivedRecordsLoading(false);
    }
  };

  const handleToggleArchivedRecords = async () => {
    const next = !showArchivedRecords;
    setShowArchivedRecords(next);
    if (next) {
      await loadArchivedRecords();
    }
  };

  const handleRestoreArchivedRecord = async (record: SchoolRecord) => {
    setDeleteError("");
    try {
      await restoreRecord(record.id);
      await loadArchivedRecords();
      pushToast(`Restored ${record.schoolName}.`, "success");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Unable to restore school record.");
    }
  };

  const handleOpenBulkImportPicker = () => {
    bulkImportInputRef.current?.click();
  };

  const handleBulkImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBulkImportError("");
    setBulkImportSummary(null);
    setIsBulkImporting(true);

    try {
      const content = await file.text();
      const parsed = parseSchoolBulkImportCsv(content);
      if (parsed.errors.length > 0) {
        setBulkImportError(parsed.errors.slice(0, 5).join(" "));
        return;
      }

      if (parsed.rows.length === 0) {
        setBulkImportError("No valid rows found in the CSV file.");
        return;
      }

      const summary = await bulkImportRecords(parsed.rows, {
        updateExisting: true,
        restoreArchived: true,
      });

      setBulkImportSummary(summary);
      pushToast(
        `Import complete: ${summary.created} created, ${summary.updated} updated, ${summary.restored} restored.`,
        "success",
      );

      if (showArchivedRecords) {
        await loadArchivedRecords();
      }
    } catch (err) {
      setBulkImportError(err instanceof Error ? err.message : "Bulk import failed.");
    } finally {
      setIsBulkImporting(false);
    }
  };

  const schoolScopeOptions = useMemo<SchoolScopeOption[]>(() => {
    const optionsByKey = new Map<string, SchoolScopeOption>();

    for (const record of records) {
      const normalizedKey = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
      const key = normalizedKey === "unknown" ? `id:${record.id}` : normalizedKey;

      if (optionsByKey.has(key)) continue;

      const schoolCode = (record.schoolId ?? record.schoolCode ?? "").trim();
      const schoolName = record.schoolName?.trim() || "Unknown School";
      optionsByKey.set(key, {
        key,
        code: schoolCode || "N/A",
        name: schoolName,
      });
    }

    return [...optionsByKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  const selectedSchoolScope = useMemo(
    () => schoolScopeOptions.find((option) => option.key === selectedSchoolScopeKey) ?? null,
    [selectedSchoolScopeKey, schoolScopeOptions],
  );

  useEffect(() => {
    if (selectedSchoolScopeKey === ALL_SCHOOL_SCOPE) return;
    if (schoolScopeOptions.length === 0) return;
    if (selectedSchoolScope) return;

    // Drop stale school scope keys restored from URL/local storage.
    setSelectedSchoolScopeKey(ALL_SCHOOL_SCOPE);
  }, [selectedSchoolScope, selectedSchoolScopeKey, schoolScopeOptions.length]);

  const filteredSchoolScopeOptions = useMemo(() => {
    const query = schoolScopeQuery.trim().toLowerCase();
    if (!query) return schoolScopeOptions;

    return schoolScopeOptions.filter(
      (option) =>
        option.code.toLowerCase().includes(query) ||
        option.name.toLowerCase().includes(query),
    );
  }, [schoolScopeOptions, schoolScopeQuery]);

  const scopedSchoolKeys = useMemo(() => {
    if (!selectedSchoolScope) return null;
    return new Set([selectedSchoolScope.key]);
  }, [selectedSchoolScope]);

  const scopedSchoolCodes = useMemo<string[] | null>(() => {
    if (!selectedSchoolScope) {
      return null;
    }

    const normalizedCode = selectedSchoolScope.code.trim().toUpperCase();
    if (!normalizedCode || normalizedCode === "N/A") {
      return null;
    }

    return [normalizedCode];
  }, [selectedSchoolScope]);

  const totalSchoolsInScope = selectedSchoolScope
    ? 1
    : Math.max(recordCount, schoolScopeOptions.length);

  const scopedStudentPool = useMemo(() => {
    if (!scopedSchoolKeys) {
      return students;
    }

    return students.filter((student) =>
      scopedSchoolKeys.has(
        normalizeSchoolKey(student.school?.schoolCode ?? null, student.school?.name ?? null),
      ),
    );
  }, [students, scopedSchoolKeys]);

  const localStudentLookupOptions = useMemo<StudentLookupOption[]>(
    () =>
      scopedStudentPool
        .map((student) => toStudentLookupOption(student))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [scopedStudentPool],
  );

  useEffect(() => {
    let active = true;
    setIsStudentLookupSyncing(true);

    const hydrateStudentLookup = async () => {
      try {
        const result = await listStudents({
          page: 1,
          perPage: 200,
          search: debouncedStudentLookupQuery.trim() || null,
          schoolCodes: scopedSchoolCodes,
          academicYear: "all",
        });
        if (!active) return;

        const options = result.data
          .map((student) => toStudentLookupOption(student))
          .sort((a, b) => a.fullName.localeCompare(b.fullName));

        setDbStudentLookupOptions(options);
      } catch {
        if (!active) return;
        setDbStudentLookupOptions([]);
      } finally {
        if (active) {
          setIsStudentLookupSyncing(false);
        }
      }
    };

    void hydrateStudentLookup();

    return () => {
      active = false;
    };
  }, [debouncedStudentLookupQuery, listStudents, scopedSchoolCodes, studentLookupSyncTick]);

  const studentLookupOptions = useMemo<StudentLookupOption[]>(() => {
    const merged = new Map<string, StudentLookupOption>();

    for (const option of localStudentLookupOptions) {
      merged.set(option.id, option);
    }

    for (const option of dbStudentLookupOptions) {
      merged.set(option.id, option);
    }

    if (selectedStudentLookup) {
      merged.set(selectedStudentLookup.id, selectedStudentLookup);
    }

    return [...merged.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [dbStudentLookupOptions, localStudentLookupOptions, selectedStudentLookup]);

  const filteredStudentLookupOptions = useMemo(() => {
    const query = studentLookupQuery.trim().toLowerCase();
    if (!query) return studentLookupOptions;

    return studentLookupOptions.filter(
      (option) =>
        option.fullName.toLowerCase().includes(query) ||
        option.lrn.toLowerCase().includes(query) ||
        option.schoolCode.toLowerCase().includes(query) ||
        option.schoolName.toLowerCase().includes(query),
    );
  }, [studentLookupOptions, studentLookupQuery]);

  const localTeacherLookupOptions = useMemo<TeacherLookupOption[]>(() => {
    const optionsById = new Map<string, TeacherLookupOption>();

    for (const student of scopedStudentPool) {
      const teacherName = student.teacher?.trim() ?? "";
      if (!teacherName) continue;

      const schoolKey = resolveStudentSchoolKey(student);
      const optionId = `local:${teacherName.toLowerCase()}|${schoolKey}`;
      if (optionsById.has(optionId)) continue;

      optionsById.set(optionId, {
        id: optionId,
        name: teacherName,
        schoolKey,
        schoolCode: normalizeSchoolCodeLabel(student.school?.schoolCode ?? null),
        schoolName: normalizeSchoolNameLabel(student.school?.name ?? null),
      });
    }

    return [...optionsById.values()].sort((a, b) =>
      a.name.localeCompare(b.name) || a.schoolName.localeCompare(b.schoolName),
    );
  }, [scopedStudentPool]);

  useEffect(() => {
    let active = true;
    setIsTeacherLookupSyncing(true);

    const hydrateTeacherLookup = async () => {
      try {
        const result = await listTeachers({
          page: 1,
          perPage: 200,
          search: debouncedTeacherLookupQuery.trim() || null,
          schoolCodes: scopedSchoolCodes,
        });
        if (!active) return;

        const options = result.data
          .map((teacher) => toTeacherLookupOption(teacher))
          .filter((option) => option.name.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name) || a.schoolName.localeCompare(b.schoolName));

        setDbTeacherLookupOptions(options);
      } catch {
        if (!active) return;
        setDbTeacherLookupOptions([]);
      } finally {
        if (active) {
          setIsTeacherLookupSyncing(false);
        }
      }
    };

    void hydrateTeacherLookup();

    return () => {
      active = false;
    };
  }, [debouncedTeacherLookupQuery, listTeachers, scopedSchoolCodes, teacherLookupSyncTick]);

  const teacherLookupOptions = useMemo<TeacherLookupOption[]>(() => {
    const merged = new Map<string, TeacherLookupOption>();

    for (const option of localTeacherLookupOptions) {
      merged.set(option.id, option);
    }
    for (const option of dbTeacherLookupOptions) {
      merged.set(option.id, option);
    }
    if (selectedTeacherLookup) {
      merged.set(selectedTeacherLookup.id, selectedTeacherLookup);
    }

    return [...merged.values()].sort((a, b) =>
      a.name.localeCompare(b.name) || a.schoolName.localeCompare(b.schoolName),
    );
  }, [dbTeacherLookupOptions, localTeacherLookupOptions, selectedTeacherLookup]);

  const filteredTeacherLookupOptions = useMemo(() => {
    const query = teacherLookupQuery.trim().toLowerCase();
    if (!query) return teacherLookupOptions;
    return teacherLookupOptions.filter(
      (option) =>
        option.name.toLowerCase().includes(query) ||
        option.schoolCode.toLowerCase().includes(query) ||
        option.schoolName.toLowerCase().includes(query),
    );
  }, [teacherLookupOptions, teacherLookupQuery]);

  useEffect(() => {
    let active = true;

    const hydrateRadarTotals = async () => {
      setMonitorRadarTotals((current) => ({
        ...current,
        isLoading: true,
        error: "",
      }));

      try {
        const [studentsResult, teachersResult] = await Promise.all([
          listStudents({
            page: 1,
            perPage: 1,
            schoolCodes: scopedSchoolCodes,
            academicYear: "all",
          }),
          listTeachers({
            page: 1,
            perPage: 1,
            schoolCodes: scopedSchoolCodes,
          }),
        ]);

        if (!active) return;

        setMonitorRadarTotals({
          students: Number(studentsResult.meta.total ?? studentsResult.meta.recordCount ?? 0),
          teachers: Number(teachersResult.meta.total ?? teachersResult.meta.recordCount ?? 0),
          syncedAt: new Date().toISOString(),
          isLoading: false,
          error: "",
        });
      } catch (err) {
        if (!active) return;
        setMonitorRadarTotals((current) => ({
          ...current,
          isLoading: false,
          error: err instanceof Error ? err.message : "Unable to sync totals.",
        }));
      }
    };

    void hydrateRadarTotals();

    const handleRealtimeTotalsRefresh = (event: Event) => {
      const payload = (event as CustomEvent<{ entity?: string }>).detail;
      if (!payload?.entity) return;
      if (payload.entity !== "students" && payload.entity !== "teachers" && payload.entity !== "dashboard") {
        return;
      }

      void hydrateRadarTotals();
    };

    window.addEventListener("cspams:update", handleRealtimeTotalsRefresh);

    return () => {
      active = false;
      window.removeEventListener("cspams:update", handleRealtimeTotalsRefresh);
    };
  }, [listStudents, listTeachers, scopedSchoolCodes]);

  const selectedTeacherSchoolKeys = useMemo(() => {
    if (!selectedTeacherLookup) return null;

    if (selectedTeacherLookup.schoolKey !== "unknown") {
      return new Set([selectedTeacherLookup.schoolKey]);
    }

    const normalizedTeacher = selectedTeacherLookup.name.trim().toLowerCase();
    const keys = new Set<string>();

    for (const student of scopedStudentPool) {
      if ((student.teacher ?? "").trim().toLowerCase() !== normalizedTeacher) continue;

      const key = resolveStudentSchoolKey(student);
      if (key !== "unknown") {
        keys.add(key);
      }
    }

    return keys;
  }, [scopedStudentPool, selectedTeacherLookup]);

  const selectedStudentLabel = selectedStudentLookup
    ? `${selectedStudentLookup.fullName} - ${selectedStudentLookup.lrn} (${selectedStudentLookup.schoolCode})`
    : "Find student (name, LRN, school)";
  const selectedTeacherLabel = selectedTeacherLookup
    ? `${selectedTeacherLookup.name} (${selectedTeacherLookup.schoolCode})`
    : "Find teacher (name, school)";
  const studentRecordsLookupTerm = selectedStudentLookup
    ? selectedStudentLookup.lrn
    : selectedTeacherLookup?.name ?? "";

  useEffect(() => {
    if (!selectedStudentLookup) return;
    if (studentLookupOptions.some((option) => option.id === selectedStudentLookup.id)) return;
    setSelectedStudentLookup(null);
  }, [selectedStudentLookup, studentLookupOptions]);

  useEffect(() => {
    if (!pendingStudentLookupId) return;
    const restored = studentLookupOptions.find((option) => option.id === pendingStudentLookupId);
    if (!restored) return;

    setSelectedStudentLookup(restored);
    if (restored.schoolKey !== "unknown") {
      setSelectedSchoolScopeKey(restored.schoolKey);
    }
    setPendingStudentLookupId(null);
  }, [pendingStudentLookupId, studentLookupOptions]);

  useEffect(() => {
    if (!pendingStudentLookupId) return;
    if (isStudentDataLoading) return;
    if (studentLookupOptions.some((option) => option.id === pendingStudentLookupId)) return;

    // Remove stale student IDs so URL/filter state stays truthful.
    setPendingStudentLookupId(null);
  }, [isStudentDataLoading, pendingStudentLookupId, studentLookupOptions]);

  useEffect(() => {
    if (!selectedTeacherLookup) return;
    if (teacherLookupOptions.some((option) => option.id === selectedTeacherLookup.id)) return;
    setSelectedTeacherLookup(null);
  }, [selectedTeacherLookup, teacherLookupOptions]);

  useEffect(() => {
    if (!pendingTeacherLookupId) return;
    const restored = teacherLookupOptions.find((option) => option.id === pendingTeacherLookupId);
    if (!restored) return;

    setSelectedTeacherLookup(restored);
    if (restored.schoolKey !== "unknown") {
      setSelectedSchoolScopeKey(restored.schoolKey);
    }
    setPendingTeacherLookupId(null);
  }, [pendingTeacherLookupId, teacherLookupOptions]);

  useEffect(() => {
    if (!pendingTeacherLookupId) return;
    if (isTeacherLookupSyncing) return;
    if (teacherLookupOptions.some((option) => option.id === pendingTeacherLookupId)) return;

    setPendingTeacherLookupId(null);
  }, [isTeacherLookupSyncing, pendingTeacherLookupId, teacherLookupOptions]);

  useEffect(() => {
    if (!lockedSchoolContextKey) return;
    if (selectedSchoolScopeKey === lockedSchoolContextKey) return;
    setSelectedSchoolScopeKey(lockedSchoolContextKey);
  }, [lockedSchoolContextKey, selectedSchoolScopeKey]);

  useEffect(() => {
    if (!filterDateFrom || !filterDateTo) return;
    if (filterDateFrom <= filterDateTo) return;

    // Keep a valid inclusive range even when one endpoint is edited out of order.
    setFilterDateFrom(filterDateTo);
    setFilterDateTo(filterDateFrom);
  }, [filterDateFrom, filterDateTo]);

  useEffect(() => {
    if (!selectedStudentLookup && !selectedTeacherLookup) return;
    setShowSchoolLearnerRecords(true);
  }, [selectedStudentLookup, selectedTeacherLookup]);

  const scopedRecords = useMemo(() => {
    if (!scopedSchoolKeys) {
      return records;
    }

    return records.filter((record) =>
      scopedSchoolKeys.has(
        normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName),
      ),
    );
  }, [records, scopedSchoolKeys]);

  const regionAggregates = useMemo(() => buildRegionAggregates(scopedRecords), [scopedRecords]);
  const statusDistribution = useMemo(() => buildStatusDistribution(scopedRecords), [scopedRecords]);
  const submissionTrend = useMemo(() => buildSubmissionTrend(scopedRecords), [scopedRecords]);
  const latestIndicatorBySchool = useMemo(
    () => latestBySchool<IndicatorSubmission>(indicatorSubmissions),
    [indicatorSubmissions],
  );

  const schoolRequirementRows = useMemo<SchoolRequirementSummary[]>(() => {
    const rows = new Map<string, SchoolRequirementSummary>();

    const ensureRow = (
      schoolCode: string | null | undefined,
      schoolName: string | null | undefined,
      region: string | null | undefined,
      schoolStatus: SchoolStatus | null = null,
    ) => {
      const key = normalizeSchoolKey(schoolCode, schoolName);
      if (key === "unknown") return null;

      const normalizedCode = schoolCode?.trim() || "N/A";
      const normalizedName = schoolName?.trim() || normalizedCode || "Unknown School";
      const normalizedRegion = region?.trim() || "N/A";

      let row = rows.get(key);
      if (!row) {
        row = {
          schoolKey: key,
          schoolCode: normalizedCode,
          schoolName: normalizedName,
          region: normalizedRegion,
          schoolStatus,
          hasComplianceRecord: false,
          indicatorStatus: null,
          hasAnySubmitted: false,
          isComplete: false,
          awaitingReviewCount: 0,
          missingCount: 2,
          lastActivityAt: null,
          lastActivityTime: 0,
        };
        rows.set(key, row);
      } else {
        if (row.schoolCode === "N/A" && normalizedCode !== "N/A") {
          row.schoolCode = normalizedCode;
        }
        if ((row.schoolName === "Unknown School" || row.schoolName === "N/A") && normalizedName !== "Unknown School") {
          row.schoolName = normalizedName;
        }
        if (row.region === "N/A" && normalizedRegion !== "N/A") {
          row.region = normalizedRegion;
        }
        if (!row.schoolStatus && schoolStatus) {
          row.schoolStatus = schoolStatus;
        }
      }

      return row;
    };

    const setLastActivity = (row: SchoolRequirementSummary, ...dates: Array<string | null | undefined>) => {
      const activityTime = toTime(...dates);
      if (activityTime > row.lastActivityTime) {
        row.lastActivityTime = activityTime;
        row.lastActivityAt = new Date(activityTime).toISOString();
      }
    };

    for (const record of records) {
      const row = ensureRow(record.schoolId ?? record.schoolCode ?? null, record.schoolName, record.region, record.status);
      if (!row) continue;

      row.hasComplianceRecord = true;
      row.schoolStatus = record.status;
      setLastActivity(row, record.lastUpdated);
    }

    for (const submission of latestIndicatorBySchool.values()) {
      const row = ensureRow(submission.school?.schoolCode, submission.school?.name, null);
      if (!row) continue;

      row.indicatorStatus = submission.status ?? null;
      setLastActivity(row, submission.updatedAt, submission.submittedAt, submission.createdAt);
    }

    return [...rows.values()]
      .map((row) => {
        const indicatorSubmitted = isPassedToMonitor(row.indicatorStatus);
        const missingCount =
          (row.hasComplianceRecord ? 0 : 1) +
          (indicatorSubmitted ? 0 : 1);
        const awaitingReviewCount =
          (isAwaitingReview(row.indicatorStatus) ? 1 : 0);

        return {
          ...row,
          hasAnySubmitted: row.hasComplianceRecord || indicatorSubmitted,
          isComplete: missingCount === 0,
          missingCount,
          awaitingReviewCount,
        };
      })
      .sort((a, b) => a.schoolName.localeCompare(b.schoolName));
  }, [records, latestIndicatorBySchool]);

  const scopedRequirementRows = useMemo(() => {
    if (!scopedSchoolKeys) {
      return schoolRequirementRows;
    }

    return schoolRequirementRows.filter((row) => scopedSchoolKeys.has(row.schoolKey));
  }, [schoolRequirementRows, scopedSchoolKeys]);

  const schoolRequirementByKey = useMemo(
    () => new Map(scopedRequirementRows.map((row) => [row.schoolKey, row])),
    [scopedRequirementRows],
  );

  const scopedRecordBySchoolKey = useMemo(() => {
    const map = new Map<string, SchoolRecord>();

    for (const record of scopedRecords) {
      const key = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
      if (key === "unknown") continue;

      const existing = map.get(key);
      const existingUpdatedAt = new Date(existing?.lastUpdated ?? 0).getTime();
      const candidateUpdatedAt = new Date(record.lastUpdated ?? 0).getTime();

      if (!existing || candidateUpdatedAt >= existingUpdatedAt) {
        map.set(key, record);
      }
    }

    return map;
  }, [scopedRecords]);

  const workflowStatusCounts = useMemo<Record<RequirementFilter, number>>(() => {
    const counts: Record<RequirementFilter, number> = {
      all: scopedRequirementRows.length,
      missing: 0,
      waiting: 0,
      returned: 0,
      submitted: 0,
      validated: 0,
    };

    for (const row of scopedRequirementRows) {
      counts[resolveWorkflowStatus(row)] += 1;
    }

    return counts;
  }, [scopedRequirementRows]);

  const schoolStatusCounts = useMemo<Record<SchoolStatus | "all", number>>(
    () => ({
      all: scopedRequirementRows.length,
      active: scopedRequirementRows.filter((row) => row.schoolStatus === "active").length,
      inactive: scopedRequirementRows.filter((row) => row.schoolStatus === "inactive").length,
      pending: scopedRequirementRows.filter((row) => row.schoolStatus === "pending").length,
    }),
    [scopedRequirementRows],
  );

  const visibleRequirementFilterIds = useMemo<RequirementFilter[]>(() => {
    if (activeTopNavigator === "reviews") {
      return ["all", "missing", "waiting", "returned"];
    }

    if (activeTopNavigator === "overview") {
      return ["all", "waiting", "returned", "submitted", "validated"];
    }

    return ["all", "missing", "waiting", "returned", "submitted", "validated"];
  }, [activeTopNavigator]);

  const visibleRequirementFilterOptions = useMemo(
    () =>
      REQUIREMENT_FILTER_OPTIONS
        .filter((option) => visibleRequirementFilterIds.includes(option.id))
        .map((option) => ({
          id: option.id,
          label: `${option.label} (${workflowStatusCounts[option.id]})`,
        })),
    [visibleRequirementFilterIds, workflowStatusCounts],
  );

  useEffect(() => {
    if (visibleRequirementFilterIds.includes(requirementFilter)) return;
    setRequirementFilter("all");
  }, [requirementFilter, visibleRequirementFilterIds]);

  const searchTerms = useMemo(() => normalizeSearchTerms(debouncedSearch), [debouncedSearch]);

  const filteredRequirementRows = useMemo(() => {
    const fromTime = parseDateBoundary(filterDateFrom, "start");
    const toTime = parseDateBoundary(filterDateTo, "end");
    const selectedStudentSchoolKey =
      selectedStudentLookup?.schoolKey && selectedStudentLookup.schoolKey !== "unknown"
        ? selectedStudentLookup.schoolKey
        : null;

    return scopedRequirementRows.filter((row) => {
      if (lockedSchoolContextKey) {
        return row.schoolKey === lockedSchoolContextKey;
      }

      const record = scopedRecordBySchoolKey.get(row.schoolKey);
      const searchableText = [
        row.schoolName,
        row.schoolCode,
        row.region,
        record?.level ?? "",
        record?.type ?? "",
        record?.address ?? record?.district ?? "",
        record?.submittedBy ?? "",
        record?.schoolHeadAccount?.name ?? "",
        record?.schoolHeadAccount?.email ?? "",
        ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = matchesAllSearchTerms(searchableText, searchTerms);
      const matchesStatus = statusFilter === "all" || row.schoolStatus === statusFilter;
      const matchesRequirement = matchesRequirementFilter(row, requirementFilter);
      const matchesStudentLookup = !selectedStudentSchoolKey || row.schoolKey === selectedStudentSchoolKey;
      const matchesTeacherLookup = !selectedTeacherSchoolKeys || selectedTeacherSchoolKeys.has(row.schoolKey);
      const matchesDateFrom = fromTime === null || (row.lastActivityTime > 0 && row.lastActivityTime >= fromTime);
      const matchesDateTo = toTime === null || (row.lastActivityTime > 0 && row.lastActivityTime <= toTime);

      return matchesSearch && matchesStatus && matchesRequirement && matchesStudentLookup && matchesTeacherLookup && matchesDateFrom && matchesDateTo;
    });
  }, [
    filterDateFrom,
    filterDateTo,
    lockedSchoolContextKey,
    requirementFilter,
    scopedRequirementRows,
    scopedRecordBySchoolKey,
    searchTerms,
    selectedStudentLookup,
    selectedTeacherSchoolKeys,
    statusFilter,
  ]);

  const hasDashboardFilters =
    searchTerms.length > 0 ||
    statusFilter !== "all" ||
    requirementFilter !== "all" ||
    schoolQuickPreset !== "all" ||
    Boolean(selectedSchoolScope) ||
    filterDateFrom.length > 0 ||
    filterDateTo.length > 0 ||
    Boolean(selectedStudentLookup) ||
    Boolean(selectedTeacherLookup);
  const filteredSchoolKeys = useMemo(() => {
    if (lockedSchoolContextKey) {
      return new Set([lockedSchoolContextKey]);
    }

    if (!hasDashboardFilters && !scopedSchoolKeys) {
      return null;
    }

    const scopeRows =
      schoolQuickPreset === "all"
        ? filteredRequirementRows
        : filteredRequirementRows.filter((row) => matchesSchoolQuickPreset(row, schoolQuickPreset));
    return new Set(scopeRows.map((row) => row.schoolKey));
  }, [filteredRequirementRows, hasDashboardFilters, lockedSchoolContextKey, schoolQuickPreset, scopedSchoolKeys]);

  const requirementCounts = useMemo(
    () => ({
      total: scopedRequirementRows.length,
      submittedAny: scopedRequirementRows.filter((row) => row.hasAnySubmitted).length,
      complete: scopedRequirementRows.filter((row) => row.isComplete).length,
      awaitingReview: scopedRequirementRows.filter((row) => row.awaitingReviewCount > 0).length,
      missing: scopedRequirementRows.filter((row) => row.missingCount > 0).length,
      returned: scopedRequirementRows.filter((row) => row.indicatorStatus === "returned").length,
    }),
    [scopedRequirementRows],
  );
  const needsActionCount = useMemo(
    () => scopedRequirementRows.filter((row) => row.missingCount > 0 || row.awaitingReviewCount > 0).length,
    [scopedRequirementRows],
  );
  const actionQueueRows = useMemo(
    () =>
      filteredRequirementRows
        .filter((row) => row.missingCount > 0 || row.awaitingReviewCount > 0 || row.indicatorStatus === "returned")
        .sort((a, b) => {
          const priorityDiff = queuePriorityScore(a) - queuePriorityScore(b);
          if (priorityDiff !== 0) return priorityDiff;

          const missingDiff = b.missingCount - a.missingCount;
          if (missingDiff !== 0) return missingDiff;

          const waitingDiff = b.awaitingReviewCount - a.awaitingReviewCount;
          if (waitingDiff !== 0) return waitingDiff;

          const activityDiff = b.lastActivityTime - a.lastActivityTime;
          if (activityDiff !== 0) return activityDiff;

          return a.schoolName.localeCompare(b.schoolName);
        }),
    [filteredRequirementRows],
  );
  const queueLaneCounts = useMemo(
    () => ({
      all: actionQueueRows.length,
      urgent: actionQueueRows.filter((row) => matchesQueueLane(row, "urgent")).length,
      returned: actionQueueRows.filter((row) => matchesQueueLane(row, "returned")).length,
      for_review: actionQueueRows.filter((row) => matchesQueueLane(row, "for_review")).length,
      waiting_data: actionQueueRows.filter((row) => matchesQueueLane(row, "waiting_data")).length,
    }),
    [actionQueueRows],
  );
  const laneFilteredQueueRows = useMemo(
    () => actionQueueRows.filter((row) => matchesQueueLane(row, queueLane)),
    [actionQueueRows, queueLane],
  );
  const schoolPresetCounts = useMemo<Record<SchoolQuickPreset, number>>(
    () => ({
      all: filteredRequirementRows.length,
      pending: filteredRequirementRows.filter((row) => matchesSchoolQuickPreset(row, "pending")).length,
      returned: filteredRequirementRows.filter((row) => matchesSchoolQuickPreset(row, "returned")).length,
      no_submission: filteredRequirementRows.filter((row) => matchesSchoolQuickPreset(row, "no_submission")).length,
      high_risk: filteredRequirementRows.filter((row) => matchesSchoolQuickPreset(row, "high_risk")).length,
    }),
    [filteredRequirementRows],
  );
  const filteredSchoolsByPreset = useMemo(
    () => filteredRequirementRows.filter((row) => matchesSchoolQuickPreset(row, schoolQuickPreset)),
    [filteredRequirementRows, schoolQuickPreset],
  );
  const stickySummaryStats = useMemo(
    () => ({
      totalSchools: filteredSchoolsByPreset.length,
      pending: filteredSchoolsByPreset.filter((row) => row.awaitingReviewCount > 0 || row.indicatorStatus === "submitted").length,
      returned: filteredSchoolsByPreset.filter((row) => row.indicatorStatus === "returned").length,
      atRisk: filteredSchoolsByPreset.filter((row) => isUrgentRequirement(row)).length,
    }),
    [filteredSchoolsByPreset],
  );
  const queueWorkspaceSchoolFilterKeys = useMemo(() => {
    if (lockedSchoolContextKey) {
      return new Set([lockedSchoolContextKey]);
    }
    if (selectedSchoolScopeKey !== ALL_SCHOOL_SCOPE) {
      return new Set([selectedSchoolScopeKey]);
    }
    return filteredSchoolKeys;
  }, [filteredSchoolKeys, lockedSchoolContextKey, selectedSchoolScopeKey]);
  const showSubmissionFilters = showAdvancedFilters;
  const returnedCount = requirementCounts.returned;
  const submittedCount = requirementCounts.submittedAny;
  const shouldRenderNavigatorItems = isMobileViewport ? isNavigatorVisible : true;
  const showNavigatorHeaderText = isMobileViewport ? isNavigatorVisible : !isNavigatorCompact;
  const navigatorBadges = useMemo<
    Record<MonitorTopNavigatorId, { primary?: number; secondary?: number; urgency: "none" | "high" | "medium" }>
  >(
    () => ({
      overview: {
        primary: returnedCount,
        urgency: returnedCount > 0 ? "high" : needsActionCount > 0 ? "medium" : "none",
      },
      reviews: {
        primary: needsActionCount,
        urgency: requirementCounts.missing > 0 ? "high" : needsActionCount > 0 ? "medium" : "none",
      },
      schools: { urgency: "none" },
    }),
    [needsActionCount, requirementCounts.missing, returnedCount],
  );
  const quickJumpItems = useMemo(
    () => MONITOR_QUICK_JUMPS[activeTopNavigator] ?? [],
    [activeTopNavigator],
  );
  const shouldShowQuickJump = false;

  const clearFocusAfterDelay = (targetId: string) => {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      setFocusedSectionId((current) => (current === targetId ? null : current));
    }, 3000);
  };

  const focusAndScrollTo = (targetId: string) => {
    if (typeof document === "undefined") return;
    const section = document.getElementById(targetId);
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    setFocusedSectionId(targetId);
    clearFocusAfterDelay(targetId);
  };

  const sectionFocusClass = (targetId: string) => (focusedSectionId === targetId ? "dashboard-focus-glow" : "");

  const resolveQuickJumpTargetId = (targetId: string): string => {
    if (targetId === "monitor-analytics-toggle") {
      return "monitor-targets-snapshot";
    }

    return targetId;
  };

  const canResolveQuickJumpTarget = (targetId: string): boolean => {
    const resolvedTargetId = resolveQuickJumpTargetId(targetId);

    if (resolvedTargetId === "monitor-submission-filters") {
      return true;
    }

    if (typeof document === "undefined") {
      return true;
    }

    return Boolean(document.getElementById(resolvedTargetId));
  };

  const handleQuickJump = (item: QuickJumpItem) => {
    const resolvedTargetId = resolveQuickJumpTargetId(item.targetId);

    if (resolvedTargetId === "monitor-submission-filters" && isMobileViewport && !showAdvancedFilters) {
      setShowAdvancedFilters(true);
      window.setTimeout(() => {
        focusAndScrollTo(resolvedTargetId);
      }, 80);
      return;
    }

    if (item.targetId === "monitor-analytics-toggle") {
      if (!showAdvancedAnalytics) {
        setShowAdvancedAnalytics(true);
      }
      window.setTimeout(() => {
        focusAndScrollTo(resolvedTargetId);
      }, 80);
      return;
    }

    focusAndScrollTo(resolvedTargetId);
  };

  const renderQuickJumpChips = (mobile: boolean) => {
    if (!shouldShowQuickJump) {
      return null;
    }

    return (
      <div className={mobile ? "mt-2 flex gap-2 overflow-x-auto pb-1" : "flex flex-wrap items-center justify-end gap-2"}>
        {quickJumpItems.map((item) => {
          const Icon = item.icon;
          const resolvedTargetId = resolveQuickJumpTargetId(item.targetId);
          const isActive = focusedSectionId === resolvedTargetId;
          const isAvailable = canResolveQuickJumpTarget(item.targetId);
          const quickJumpIndex = quickJumpItems.findIndex((candidate) => candidate.id === item.id);
          const shortcutLabel = quickJumpIndex >= 0 && quickJumpIndex < 9 ? `Alt+Shift+${quickJumpIndex + 1}` : null;

          return (
            <button
              key={`monitor-quick-jump-${item.id}`}
              type="button"
              onClick={() => handleQuickJump(item)}
              disabled={!isAvailable}
              aria-pressed={isActive}
              title={shortcutLabel ? `${item.label} (${shortcutLabel})` : item.label}
              className={`inline-flex shrink-0 items-center gap-1 rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                isActive
                  ? "border-primary-300 bg-primary-50 text-primary-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              } ${isAvailable ? "" : "cursor-not-allowed opacity-50"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>
    );
  };

  const endSchoolsTableDrag = (pointerId?: number) => {
    const state = schoolsTableDragStateRef.current;
    const scroller = schoolsTableScrollerRef.current;

    if (!state) {
      return;
    }

    if (typeof pointerId === "number" && state.pointerId !== pointerId) {
      return;
    }

    if (scroller) {
      try {
        scroller.releasePointerCapture(state.pointerId);
      } catch {
        // Ignore release failures.
      }
    }

    schoolsTableDragStateRef.current = null;
    setIsSchoolsTableDragging(false);
  };

  const handleSchoolsTablePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const scroller = schoolsTableScrollerRef.current;
    if (!scroller) return;

    // Keep row/table actions clickable; only start drag on non-interactive surface.
    if (isInteractiveTableTarget(event.target)) {
      return;
    }

    if (scroller.scrollWidth <= scroller.clientWidth) return;

    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 2) {
      return;
    }

    schoolsTableDragStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: scroller.scrollLeft,
      button: event.button,
      moved: false,
    };
    setIsSchoolsTableDragging(true);

    try {
      scroller.setPointerCapture(event.pointerId);
    } catch {
      // Ignore capture failures.
    }

    if (event.pointerType === "mouse") {
      event.preventDefault();
    }
  };

  const handleSchoolsTablePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const scroller = schoolsTableScrollerRef.current;
    const state = schoolsTableDragStateRef.current;
    if (!scroller || !state || state.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - state.startX;
    if (Math.abs(deltaX) > 3) {
      state.moved = true;
    }

    scroller.scrollLeft = state.startScrollLeft - deltaX;

    if (state.moved) {
      event.preventDefault();
    }
  };

  const handleSchoolsTableContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const state = schoolsTableDragStateRef.current;
    if (!state) {
      return;
    }

    if (state.button === 2) {
      event.preventDefault();
      endSchoolsTableDrag(state.pointerId);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !shouldShowQuickJump) return;

    const onQuickJumpHotkey = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName.toLowerCase();
        if (tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable) {
          return;
        }
      }

      const shortcutIndex = Number(event.key) - 1;
      if (!Number.isInteger(shortcutIndex) || shortcutIndex < 0 || shortcutIndex >= quickJumpItems.length) {
        return;
      }

      const quickJumpItem = quickJumpItems[shortcutIndex];
      if (!quickJumpItem || !canResolveQuickJumpTarget(quickJumpItem.targetId)) {
        return;
      }

      event.preventDefault();
      handleQuickJump(quickJumpItem);
    };

    window.addEventListener("keydown", onQuickJumpHotkey);
    return () => window.removeEventListener("keydown", onQuickJumpHotkey);
  }, [quickJumpItems, shouldShowQuickJump, handleQuickJump, canResolveQuickJumpTarget]);

  const filteredRecords = useMemo(() => {
    const fromTime = parseDateBoundary(filterDateFrom, "start");
    const toTime = parseDateBoundary(filterDateTo, "end");
    const base = filteredSchoolKeys
      ? scopedRecords.filter((record) =>
          filteredSchoolKeys.has(normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName)),
        )
      : scopedRecords;

    const dateFiltered = base.filter((record) => {
      const updatedAt = new Date(record.lastUpdated ?? 0).getTime();
      if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
        return fromTime === null && toTime === null;
      }
      if (fromTime !== null && updatedAt < fromTime) return false;
      if (toTime !== null && updatedAt > toTime) return false;
      return true;
    });

    return [...dateFiltered].sort((a, b) => compareRecords(a, b, sortColumn, sortDirection));
  }, [filterDateFrom, filterDateTo, scopedRecords, filteredSchoolKeys, sortColumn, sortDirection]);

  const recordBySchoolKey = useMemo(() => {
    const map = new Map<string, SchoolRecord>();

    for (const record of records) {
      const key = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
      if (key === "unknown") continue;

      const existing = map.get(key);
      const existingUpdatedAt = new Date(existing?.lastUpdated ?? 0).getTime();
      const candidateUpdatedAt = new Date(record.lastUpdated ?? 0).getTime();

      if (!existing || candidateUpdatedAt >= existingUpdatedAt) {
        map.set(key, record);
      }
    }

    return map;
  }, [records]);

  const studentStatsBySchoolKey = useMemo(() => {
    const map = new Map<string, { students: number; teachers: Set<string> }>();

    for (const student of students) {
      const key = normalizeSchoolKey(student.school?.schoolCode ?? null, student.school?.name ?? null);
      if (key === "unknown") continue;

      if (!map.has(key)) {
        map.set(key, { students: 0, teachers: new Set<string>() });
      }

      const row = map.get(key);
      if (!row) continue;
      row.students += 1;

      const teacherName = student.teacher?.trim();
      if (teacherName) {
        row.teachers.add(teacherName);
      }
    }

    return map;
  }, [students]);

  const compactSchoolRows = useMemo(
    () =>
      filteredSchoolsByPreset
        .map((summary) => {
          const record = scopedRecordBySchoolKey.get(summary.schoolKey) ?? recordBySchoolKey.get(summary.schoolKey) ?? null;
          return { summary, record };
        })
        .sort((a, b) => {
          const priorityDiff = queuePriorityScore(a.summary) - queuePriorityScore(b.summary);
          if (priorityDiff !== 0) return priorityDiff;

          const missingDiff = b.summary.missingCount - a.summary.missingCount;
          if (missingDiff !== 0) return missingDiff;

          const waitingDiff = b.summary.awaitingReviewCount - a.summary.awaitingReviewCount;
          if (waitingDiff !== 0) return waitingDiff;

          const activityDiff = b.summary.lastActivityTime - a.summary.lastActivityTime;
          if (activityDiff !== 0) return activityDiff;

          return a.summary.schoolName.localeCompare(b.summary.schoolName);
        }),
    [filteredSchoolsByPreset, recordBySchoolKey, scopedRecordBySchoolKey],
  );

  const totalRequirementPages = Math.max(1, Math.ceil(laneFilteredQueueRows.length / REQUIREMENT_PAGE_SIZE));
  const safeRequirementsPage = Math.min(requirementsPage, totalRequirementPages);
  const paginatedRequirementRows = useMemo(() => {
    const start = (safeRequirementsPage - 1) * REQUIREMENT_PAGE_SIZE;
    return laneFilteredQueueRows.slice(start, start + REQUIREMENT_PAGE_SIZE);
  }, [laneFilteredQueueRows, safeRequirementsPage]);

  const totalRecordPages = Math.max(1, Math.ceil(compactSchoolRows.length / RECORD_PAGE_SIZE));
  const safeRecordsPage = Math.min(recordsPage, totalRecordPages);
  const paginatedCompactSchoolRows = useMemo(() => {
    const start = (safeRecordsPage - 1) * RECORD_PAGE_SIZE;
    return compactSchoolRows.slice(start, start + RECORD_PAGE_SIZE);
  }, [compactSchoolRows, safeRecordsPage]);

  const schoolIndicatorSubmissions = useMemo(() => {
    if (!schoolDrawerKey) return [] as IndicatorSubmission[];

    return indicatorSubmissions
      .filter(
        (submission) =>
          normalizeSchoolKey(submission.school?.schoolCode ?? null, submission.school?.name ?? null) === schoolDrawerKey,
      )
      .sort(
        (a, b) =>
          toTime(b.updatedAt, b.submittedAt, b.createdAt) - toTime(a.updatedAt, a.submittedAt, a.createdAt),
      );
  }, [indicatorSubmissions, schoolDrawerKey]);

  const schoolDrawerRecordId = useMemo(() => {
    if (!schoolDrawerKey) return "";
    return (recordBySchoolKey.get(schoolDrawerKey)?.id ?? "").trim();
  }, [recordBySchoolKey, schoolDrawerKey]);

  useEffect(() => {
    if (!schoolDrawerRecordId || !token) {
      setSchoolDrawerSubmissions(null);
      setIsSchoolDrawerSubmissionsLoading(false);
      setSchoolDrawerSubmissionsError("");
      return;
    }

    let active = true;
    const abortController = new AbortController();

    const loadSchoolSubmissions = async () => {
      const now = Date.now();
      const cached = schoolDrawerSubmissionCacheRef.current.get(schoolDrawerRecordId) ?? null;
      const cacheIsFresh = cached && now - cached.fetchedAt <= SCHOOL_DRAWER_SUBMISSION_CACHE_TTL_MS;

      if (cached) {
        setSchoolDrawerSubmissions(cached.rows);
      } else {
        setSchoolDrawerSubmissions(null);
      }

      if (cacheIsFresh && schoolDrawerSubmissionSyncTick === 0) {
        setIsSchoolDrawerSubmissionsLoading(false);
        setSchoolDrawerSubmissionsError("");
        return;
      }

      setIsSchoolDrawerSubmissionsLoading(true);
      setSchoolDrawerSubmissionsError("");

      try {
        const perPage = 100;
        const basePath = `/api/indicators/submissions?per_page=${perPage}&school_id=${encodeURIComponent(schoolDrawerRecordId)}`;
        const firstPayload = await apiRequest<IndicatorSubmissionListResponse>(`${basePath}&page=1`, {
          token,
          signal: abortController.signal,
        });
        const firstRows = Array.isArray(firstPayload.data) ? firstPayload.data : [];
        const lastPage = Math.max(1, Number(firstPayload.meta?.last_page ?? 1));

        const pageRequests: Array<Promise<IndicatorSubmissionListResponse>> = [];
        for (let page = 2; page <= lastPage; page += 1) {
          pageRequests.push(
            apiRequest<IndicatorSubmissionListResponse>(`${basePath}&page=${page}`, {
              token,
              signal: abortController.signal,
            }),
          );
        }

        const extraPayloads = pageRequests.length > 0 ? await Promise.all(pageRequests) : [];
        const allRows = [
          ...firstRows,
          ...extraPayloads.flatMap((payload) => (Array.isArray(payload.data) ? payload.data : [])),
        ].sort(
          (a, b) =>
            toTime(b.updatedAt, b.submittedAt, b.createdAt) - toTime(a.updatedAt, a.submittedAt, a.createdAt),
        );

        if (!active) return;
        schoolDrawerSubmissionCacheRef.current.set(schoolDrawerRecordId, {
          rows: allRows,
          fetchedAt: Date.now(),
        });
        setSchoolDrawerSubmissions(allRows);
      } catch (err) {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (!cached) {
          setSchoolDrawerSubmissions([]);
        }
        setSchoolDrawerSubmissionsError(err instanceof Error ? err.message : "Unable to load school submissions.");
      } finally {
        if (active) {
          setIsSchoolDrawerSubmissionsLoading(false);
        }
      }
    };

    void loadSchoolSubmissions();
    return () => {
      active = false;
      abortController.abort();
    };
  }, [schoolDrawerRecordId, schoolDrawerSubmissionSyncTick, token]);

  const schoolDrawerIndicatorSubmissions = useMemo(
    () => schoolDrawerSubmissions ?? schoolIndicatorSubmissions,
    [schoolDrawerSubmissions, schoolIndicatorSubmissions],
  );

  const schoolIndicatorMatrix = useMemo(() => {
    if (schoolDrawerIndicatorSubmissions.length === 0) {
      return {
        years: [] as string[],
        rows: [] as IndicatorMatrixRow[],
        latestSubmission: null as IndicatorSubmission | null,
      };
    }

    const years = new Set<string>();
    const rowMap = new Map<string, IndicatorMatrixRow>();

    for (const submission of schoolDrawerIndicatorSubmissions) {
      const fallbackYear =
        (submission.academicYear?.name ?? "").trim() ||
        deriveSchoolYearLabel(submission.submittedAt ?? submission.updatedAt ?? submission.createdAt);
      years.add(fallbackYear);

      for (const entry of submission.indicators) {
        const schemaYears = Array.isArray(entry.metric?.inputSchema?.years)
          ? entry.metric.inputSchema?.years ?? []
          : [];
        for (const schemaYear of schemaYears) {
          const normalizedYear = String(schemaYear).trim();
          if (normalizedYear.length > 0) {
            years.add(normalizedYear);
          }
        }

        const metricCode = entry.metric?.code?.trim() || "";
        const metricName = entry.metric?.name?.trim() || metricCode || "Unknown Indicator";
        const metricLabel = indicatorDisplayLabel(metricCode || null, metricName);
        const rowKey = metricCode || entry.metric?.id?.trim() || entry.id;
        const rowSortOrder =
          typeof entry.metric?.sortOrder === "number" && Number.isFinite(entry.metric.sortOrder)
            ? entry.metric.sortOrder
            : Number.MAX_SAFE_INTEGER;

        let row = rowMap.get(rowKey);
        if (!row) {
          row = {
            key: rowKey,
            code: metricCode || "N/A",
            label: metricLabel,
            category: indicatorCategoryLabel(metricCode || null),
            sortOrder: rowSortOrder,
            valuesByYear: {},
          };
          rowMap.set(rowKey, row);
        } else if (row.sortOrder === Number.MAX_SAFE_INTEGER && rowSortOrder !== Number.MAX_SAFE_INTEGER) {
          row.sortOrder = rowSortOrder;
        }

        const targetYears = typedYearValues(entry.targetTypedValue ?? null);
        const actualYears = typedYearValues(entry.actualTypedValue ?? null);
        const entryYears = new Set<string>([
          ...Object.keys(targetYears),
          ...Object.keys(actualYears),
        ]);

        if (entryYears.size === 0) {
          entryYears.add(fallbackYear);
        }

        const hasSingleFallbackYear = entryYears.size === 1 && entryYears.has(fallbackYear);

        for (const year of entryYears) {
          const normalizedYear = year.trim();
          if (normalizedYear.length === 0) continue;

          years.add(normalizedYear);

          if (!row.valuesByYear[normalizedYear]) {
            row.valuesByYear[normalizedYear] = { target: "", actual: "" };
          }

          if (row.valuesByYear[normalizedYear].target.length === 0) {
            const targetValue =
              targetYears[normalizedYear] ||
              (hasSingleFallbackYear
                ? toDisplayValue(entry.targetDisplay) || toDisplayValue(entry.targetValue)
                : "");
            if (targetValue.length > 0) {
              row.valuesByYear[normalizedYear].target = targetValue;
            }
          }

          if (row.valuesByYear[normalizedYear].actual.length === 0) {
            const actualValue =
              actualYears[normalizedYear] ||
              (hasSingleFallbackYear
                ? toDisplayValue(entry.actualDisplay) || toDisplayValue(entry.actualValue)
                : "");
            if (actualValue.length > 0) {
              row.valuesByYear[normalizedYear].actual = actualValue;
            }
          }
        }
      }
    }

    const sortedYears = sortSchoolYears(years);
    const categoryRank = (category: string) => (category === SCHOOL_ACHIEVEMENTS_CATEGORY_LABEL ? 0 : 1);

    const sortedRows = [...rowMap.values()].sort((a, b) => {
      const byCategory = categoryRank(a.category) - categoryRank(b.category);
      if (byCategory !== 0) return byCategory;

      const bySortOrder = a.sortOrder - b.sortOrder;
      if (Number.isFinite(bySortOrder) && bySortOrder !== 0) {
        return bySortOrder;
      }

      return a.label.localeCompare(b.label);
    });

    return {
      years: sortedYears,
      rows: sortedRows,
      latestSubmission: schoolDrawerIndicatorSubmissions[0] ?? null,
    };
  }, [schoolDrawerIndicatorSubmissions]);

  const schoolIndicatorRowsByCategory = useMemo(
    () =>
      schoolIndicatorMatrix.rows.reduce<Array<{ category: string; rows: IndicatorMatrixRow[] }>>((groups, row) => {
        const existing = groups.find((group) => group.category === row.category);
        if (existing) {
          existing.rows.push(row);
          return groups;
        }

        groups.push({ category: row.category, rows: [row] });
        return groups;
      }, []),
    [schoolIndicatorMatrix.rows],
  );

  const schoolIndicatorPackageRows = useMemo<SchoolIndicatorPackageRow[]>(
    () =>
      schoolDrawerIndicatorSubmissions.map((submission) => ({
        id: submission.id,
        schoolYear:
          (submission.academicYear?.name ?? "").trim() ||
          deriveSchoolYearLabel(submission.submittedAt ?? submission.updatedAt ?? submission.createdAt),
        reportingPeriod: submission.reportingPeriod ?? "N/A",
        status: submission.status ?? null,
        submittedAt: submission.submittedAt ?? submission.updatedAt ?? submission.createdAt,
        reviewedAt: submission.reviewedAt ?? null,
        complianceRatePercent:
          typeof submission.summary?.complianceRatePercent === "number" && Number.isFinite(submission.summary.complianceRatePercent)
            ? submission.summary.complianceRatePercent
            : null,
        reviewedBy: submission.reviewedBy?.name?.trim() || "Unassigned",
      })),
    [schoolDrawerIndicatorSubmissions],
  );

  const latestSchoolPackage = useMemo(
    () => schoolIndicatorPackageRows[0] ?? null,
    [schoolIndicatorPackageRows],
  );

  const latestSchoolIndicatorYear = useMemo(
    () => schoolIndicatorMatrix.years[schoolIndicatorMatrix.years.length - 1] ?? "",
    [schoolIndicatorMatrix.years],
  );

  const schoolIndicatorRowKeySet = useMemo(
    () => new Set(schoolIndicatorMatrix.rows.map((row) => row.key)),
    [schoolIndicatorMatrix.rows],
  );

  const missingDrawerIndicatorKeys = useMemo(() => {
    if (!latestSchoolIndicatorYear) return [] as string[];
    return schoolIndicatorMatrix.rows
      .filter((row) => {
        const values = row.valuesByYear[latestSchoolIndicatorYear] ?? { target: "", actual: "" };
        return values.target.trim().length === 0 || values.actual.trim().length === 0;
      })
      .map((row) => row.key);
  }, [latestSchoolIndicatorYear, schoolIndicatorMatrix.rows]);

  const returnedDrawerIndicatorKeys = useMemo(() => {
    const latestSubmission = schoolIndicatorMatrix.latestSubmission;
    if (!latestSubmission) return [] as string[];

    const mappedKeys = latestSubmission.indicators
      .filter((entry) => String(entry.complianceStatus ?? "").toLowerCase().includes("returned"))
      .map((entry) => entry.metric?.code?.trim() || entry.metric?.id?.trim() || entry.id)
      .filter((value): value is string => Boolean(value && value.trim().length > 0));

    return [...new Set(mappedKeys)].filter((key) => schoolIndicatorRowKeySet.has(key));
  }, [schoolIndicatorMatrix.latestSubmission, schoolIndicatorRowKeySet]);

  const missingDrawerIndicatorKeySet = useMemo(
    () => new Set(missingDrawerIndicatorKeys),
    [missingDrawerIndicatorKeys],
  );
  const returnedDrawerIndicatorKeySet = useMemo(
    () => new Set(returnedDrawerIndicatorKeys),
    [returnedDrawerIndicatorKeys],
  );

  const schoolDetail = useMemo<SchoolDetailSnapshot | null>(() => {
    if (!schoolDrawerKey) return null;

    const summary = schoolRequirementByKey.get(schoolDrawerKey);
    const record = recordBySchoolKey.get(schoolDrawerKey);
    const studentStats = studentStatsBySchoolKey.get(schoolDrawerKey);
    const accurateCounts = accurateSyncedCountsBySchoolKey[schoolDrawerKey];

    if (!summary && !record) return null;

    return {
      schoolKey: schoolDrawerKey,
      schoolCode: summary?.schoolCode ?? (record?.schoolId ?? record?.schoolCode ?? "N/A"),
      schoolName: summary?.schoolName ?? record?.schoolName ?? "Unknown School",
      region: summary?.region ?? record?.region ?? "N/A",
      level: record?.level ?? "N/A",
      type: schoolTypeLabel(record?.type),
      address: record?.address ?? record?.district ?? "N/A",
      hasComplianceRecord: summary?.hasComplianceRecord ?? false,
      indicatorStatus: summary?.indicatorStatus ?? null,
      missingCount: summary?.missingCount ?? 0,
      awaitingReviewCount: summary?.awaitingReviewCount ?? 0,
      lastActivityAt: summary?.lastActivityAt ?? record?.lastUpdated ?? null,
      reportedStudents: record?.studentCount ?? 0,
      reportedTeachers: record?.teacherCount ?? 0,
      synchronizedStudents: accurateCounts?.students ?? studentStats?.students ?? 0,
      synchronizedTeachers: accurateCounts?.teachers ?? studentStats?.teachers.size ?? 0,
    };
  }, [schoolDrawerKey, schoolRequirementByKey, recordBySchoolKey, studentStatsBySchoolKey, accurateSyncedCountsBySchoolKey]);

  const schoolDrawerCriticalAlerts = useMemo(() => {
    if (!schoolDetail) return [] as Array<{ id: string; tone: "warning" | "info"; title: string; detail: string }>;

    const alerts: Array<{ id: string; tone: "warning" | "info"; title: string; detail: string }> = [];

    if (!schoolDetail.hasComplianceRecord) {
      alerts.push({
        id: "missing-compliance-record",
        tone: "warning",
        title: "No Compliance Record",
        detail: "School has not submitted a compliance record yet.",
      });
    }

    if (schoolDetail.indicatorStatus === "returned") {
      alerts.push({
        id: "returned-package",
        tone: "warning",
        title: "Package Returned",
        detail: "Latest indicator package was returned for correction.",
      });
    }

    if (schoolDetail.missingCount > 0) {
      alerts.push({
        id: "missing-required-indicators",
        tone: "warning",
        title: "Missing Indicators",
        detail: `${schoolDetail.missingCount} required indicator cells are still missing.`,
      });
    }

    if (schoolDetail.awaitingReviewCount > 0) {
      alerts.push({
        id: "pending-review",
        tone: "info",
        title: "Pending Review",
        detail: `${schoolDetail.awaitingReviewCount} submissions are waiting for monitor review.`,
      });
    }

    if (schoolDetail.reportedStudents !== schoolDetail.synchronizedStudents) {
      alerts.push({
        id: "student-count-mismatch",
        tone: "warning",
        title: "Student Count Mismatch",
        detail: `Reported ${schoolDetail.reportedStudents}, synced ${schoolDetail.synchronizedStudents}.`,
      });
    }

    if (schoolDetail.reportedTeachers !== schoolDetail.synchronizedTeachers) {
      alerts.push({
        id: "teacher-count-mismatch",
        tone: "warning",
        title: "Teacher Count Mismatch",
        detail: `Reported ${schoolDetail.reportedTeachers}, synced ${schoolDetail.synchronizedTeachers}.`,
      });
    }

    if (schoolDrawerSubmissionsError) {
      alerts.push({
        id: "submission-load-issue",
        tone: "warning",
        title: "Submission Sync Issue",
        detail: schoolDrawerSubmissionsError,
      });
    }

    return alerts;
  }, [schoolDetail, schoolDrawerSubmissionsError]);

  const schoolDetailKey = schoolDetail?.schoolKey ?? null;
  const schoolDetailCode = schoolDetail?.schoolCode ?? "";

  useEffect(() => {
    if (!schoolDetailKey) {
      schoolDetailCountsAbortRef.current?.abort();
      schoolDetailCountsAbortRef.current = null;
      setSyncedCountsLoadingSchoolKey(null);
      setSyncedCountsError("");
      return;
    }

    const normalizedSchoolCode = schoolDetailCode.trim();
    if (!/^\d+$/.test(normalizedSchoolCode)) {
      schoolDetailCountsAbortRef.current?.abort();
      schoolDetailCountsAbortRef.current = null;
      setSyncedCountsLoadingSchoolKey(null);
      setSyncedCountsError("");
      return;
    }

    let active = true;
    const readCachedCounts = () => {
      const cached = schoolDetailCountsCacheRef.current.get(schoolDetailKey) ?? null;
      if (!cached) return null;
      if (Date.now() - cached.fetchedAt > SCHOOL_DETAIL_COUNTS_CACHE_TTL_MS) return null;
      return cached;
    };

    const hydrateAccurateSyncedCounts = async (force = false) => {
      const cached = force ? null : readCachedCounts();
      if (cached) {
        setAccurateSyncedCountsBySchoolKey((current) => ({
          ...current,
          [schoolDetailKey]: {
            students: cached.students,
            teachers: cached.teachers,
          },
        }));
        setSyncedCountsLoadingSchoolKey(null);
        setSyncedCountsError("");
        return;
      }

      schoolDetailCountsAbortRef.current?.abort();
      const controller = new AbortController();
      schoolDetailCountsAbortRef.current = controller;
      setSyncedCountsLoadingSchoolKey(schoolDetailKey);
      setSyncedCountsError("");

      try {
        const [studentsResult, teachersResult] = await Promise.all([
          listStudents({ page: 1, perPage: 1, schoolCode: normalizedSchoolCode, signal: controller.signal }),
          listTeachers({ page: 1, perPage: 1, schoolCode: normalizedSchoolCode, signal: controller.signal }),
        ]);

        if (!active || controller.signal.aborted) {
          return;
        }

        const nextCounts = {
          students: Number(studentsResult.meta.total ?? studentsResult.meta.recordCount ?? studentsResult.data.length ?? 0),
          teachers: Number(teachersResult.meta.total ?? teachersResult.meta.recordCount ?? teachersResult.data.length ?? 0),
        };
        schoolDetailCountsCacheRef.current.set(schoolDetailKey, {
          ...nextCounts,
          fetchedAt: Date.now(),
        });
        setAccurateSyncedCountsBySchoolKey((current) => ({
          ...current,
          [schoolDetailKey]: nextCounts,
        }));
      } catch (err) {
        if (!active) {
          return;
        }
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        setSyncedCountsError(err instanceof Error ? err.message : "Unable to refresh synced counts.");
      } finally {
        if (active && schoolDetailCountsAbortRef.current === controller) {
          schoolDetailCountsAbortRef.current = null;
          setSyncedCountsLoadingSchoolKey((current) => (current === schoolDetailKey ? null : current));
        }
      }
    };

    void hydrateAccurateSyncedCounts(false);

    const handleRealtimeCountsRefresh = (event: Event) => {
      const payload = (event as CustomEvent<{ entity?: string; schoolId?: string }>).detail;
      if (!payload) {
        return;
      }

      if (payload.entity !== "students" && payload.entity !== "teachers" && payload.entity !== "dashboard") {
        return;
      }

      if (payload.schoolId && payload.schoolId !== normalizedSchoolCode) {
        return;
      }

      void hydrateAccurateSyncedCounts(true);
    };

    window.addEventListener("cspams:update", handleRealtimeCountsRefresh);

    return () => {
      active = false;
      schoolDetailCountsAbortRef.current?.abort();
      schoolDetailCountsAbortRef.current = null;
      window.removeEventListener("cspams:update", handleRealtimeCountsRefresh);
    };
  }, [schoolDetailKey, schoolDetailCode, listStudents, listTeachers]);

  const activeFilterChips = useMemo<Array<{ id: FilterChipId; label: string }>>(() => {
    const chips: Array<{ id: FilterChipId; label: string }> = [];

    if (search.trim()) chips.push({ id: "search", label: `Search: ${search.trim()}` });
    if (statusFilter !== "all") chips.push({ id: "status", label: `Status: ${statusLabel(statusFilter)}` });
    if (requirementFilter !== "all") chips.push({ id: "requirement", label: `Queue: ${requirementFilterLabel(requirementFilter)}` });
    if (queueLane !== "all") chips.push({ id: "lane", label: `Lane: ${queueLaneLabel(queueLane)}` });
    if (schoolQuickPreset !== "all") {
      const presetLabel = SCHOOL_QUICK_PRESET_OPTIONS.find((option) => option.id === schoolQuickPreset)?.label ?? schoolQuickPreset;
      chips.push({ id: "preset", label: `Preset: ${presetLabel}` });
    }
    if (filterDateFrom || filterDateTo) {
      chips.push({
        id: "date",
        label: `Date: ${filterDateFrom || "Any"} to ${filterDateTo || "Any"}`,
      });
    }
    if (lockedSchoolContextKey) chips.push({ id: "context", label: "Context: Locked School" });
    if (selectedSchoolScope) chips.push({ id: "school", label: `School: ${selectedSchoolScope.code}` });
    if (selectedStudentLookup) chips.push({ id: "student", label: `Student: ${selectedStudentLookup.fullName}` });
    if (selectedTeacherLookup) chips.push({ id: "teacher", label: `Teacher: ${selectedTeacherLookup.name}` });

    return chips;
  }, [
    filterDateFrom,
    filterDateTo,
    lockedSchoolContextKey,
    queueLane,
    requirementFilter,
    schoolQuickPreset,
    search,
    selectedSchoolScope,
    selectedStudentLookup,
    selectedTeacherLookup?.id,
    statusFilter,
  ]);

  useEffect(() => {
    setRequirementsPage(1);
    setRecordsPage(1);
  }, [
    filterDateFrom,
    filterDateTo,
    requirementFilter,
    schoolQuickPreset,
    search,
    selectedSchoolScopeKey,
    selectedStudentLookup?.id,
    selectedTeacherLookup?.id,
    statusFilter,
  ]);

  useEffect(() => {
    if (requirementsPage > totalRequirementPages) {
      setRequirementsPage(totalRequirementPages);
    }
  }, [requirementsPage, totalRequirementPages]);

  useEffect(() => {
    if (recordsPage > totalRecordPages) {
      setRecordsPage(totalRecordPages);
    }
  }, [recordsPage, totalRecordPages]);

  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setRequirementFilter("all");
    setQueueLane("all");
    setSchoolQuickPreset("all");
    setSelectedSchoolScopeKey(lockedSchoolContextKey ?? ALL_SCHOOL_SCOPE);
    setSelectedStudentLookup(null);
    setPendingStudentLookupId(null);
    setSelectedTeacherLookup(null);
    setPendingTeacherLookupId(null);
    setSchoolScopeQuery("");
    setStudentLookupQuery("");
    setTeacherLookupQuery("");
    setSchoolScopeDropdownSlot(null);
  };

  const resetQueueFilters = () => {
    setRequirementFilter("all");
    setQueueLane("all");
  };

  const clearFilterChip = (chipId: FilterChipId) => {
    switch (chipId) {
      case "search":
        setSearch("");
        break;
      case "status":
        setStatusFilter("all");
        break;
      case "requirement":
        setRequirementFilter("all");
        break;
      case "lane":
        setQueueLane("all");
        break;
      case "preset":
        setSchoolQuickPreset("all");
        break;
      case "date":
        setFilterDateFrom("");
        setFilterDateTo("");
        break;
      case "school":
        setSelectedSchoolScopeKey(ALL_SCHOOL_SCOPE);
        setSelectedStudentLookup(null);
        setPendingStudentLookupId(null);
        setSelectedTeacherLookup(null);
        setPendingTeacherLookupId(null);
        setSchoolScopeQuery("");
        setStudentLookupQuery("");
        setTeacherLookupQuery("");
        break;
      case "student":
        setSelectedStudentLookup(null);
        setPendingStudentLookupId(null);
        setStudentLookupQuery("");
        break;
      case "teacher":
        setSelectedTeacherLookup(null);
        setPendingTeacherLookupId(null);
        setTeacherLookupQuery("");
        break;
      case "context":
        clearLockedSchoolContext();
        break;
      default:
        break;
    }
  };

  const openSchoolDrawer = (schoolKey: string) => {
    setSchoolDrawerKey(schoolKey);
    setActiveSchoolDrawerTab("snapshot");
    setExpandedDrawerIndicatorRows({});
    setHighlightedDrawerIndicatorKey(null);
  };

  const closeSchoolDrawer = () => {
    setSchoolDrawerKey(null);
    setHighlightedDrawerIndicatorKey(null);
  };

  const sendReminderForSchool = async (schoolKey: string, schoolName: string, notes?: string | null) => {
    const record = scopedRecordBySchoolKey.get(schoolKey) ?? recordBySchoolKey.get(schoolKey);
    if (!record) {
      pushToast(`Unable to send reminder for ${schoolName}: school record not found.`, "warning");
      return;
    }

    setRemindingSchoolKey(schoolKey);
    try {
      const receipt = await sendReminder(record.id, notes);
      const recipientLabel = receipt.recipientCount === 1 ? "recipient" : "recipients";
      pushToast(`Reminder sent to ${receipt.schoolName} (${receipt.recipientCount} ${recipientLabel}).`, "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : `Unable to send reminder for ${schoolName}.`;
      pushToast(message, "warning");
    } finally {
      setRemindingSchoolKey((current) => (current === schoolKey ? null : current));
    }
  };

  const handleReviewSchool = (summary: SchoolRequirementSummary) => {
    if (summary.missingCount > 0) {
      setRequirementFilter("missing");
    } else if (summary.indicatorStatus === "returned") {
      setRequirementFilter("returned");
    } else if (summary.awaitingReviewCount > 0) {
      setRequirementFilter("waiting");
    } else {
      setRequirementFilter("all");
    }

    setLockedSchoolContextKey(summary.schoolKey);
    setSelectedSchoolScopeKey(summary.schoolKey);
    openSchoolDrawer(summary.schoolKey);
    setActiveTopNavigator("reviews");
    window.setTimeout(() => {
      focusAndScrollTo("monitor-queue-workspace");
    }, 80);
    pushToast(`Review workspace opened for ${summary.schoolName}.`, "info");
  };

  const handleOpenSchool = (summary: SchoolRequirementSummary) => {
    setLockedSchoolContextKey(summary.schoolKey);
    setSelectedSchoolScopeKey(summary.schoolKey);
    setActiveTopNavigator("schools");
    openSchoolDrawer(summary.schoolKey);
    window.setTimeout(() => {
      focusAndScrollTo("monitor-school-records");
    }, 80);
    pushToast(`Opened school details for ${summary.schoolName}.`, "info");
  };

  const handleSendReminder = (summary: SchoolRequirementSummary) => {
    void sendReminderForSchool(summary.schoolKey, summary.schoolName);
  };

  const handleReviewRecord = (record: SchoolRecord) => {
    const schoolKey = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
    if (schoolKey === "unknown") {
      pushToast(`Unable to open review for ${record.schoolName}: school key is missing.`, "warning");
      return;
    }
    const summary = schoolRequirementByKey.get(schoolKey);

    if (summary) {
      handleReviewSchool(summary);
      return;
    }

    setLockedSchoolContextKey(schoolKey);
    setSelectedSchoolScopeKey(schoolKey);
    openSchoolDrawer(schoolKey);
    setActiveTopNavigator("reviews");
    window.setTimeout(() => {
      focusAndScrollTo("monitor-queue-workspace");
    }, 80);
    pushToast(`Review workspace opened for ${record.schoolName}.`, "info");
  };

  const handleOpenSchoolRecord = (record: SchoolRecord) => {
    const schoolKey = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
    if (schoolKey === "unknown") {
      pushToast(`Unable to open school details for ${record.schoolName}: school key is missing.`, "warning");
      return;
    }
    setLockedSchoolContextKey(schoolKey);
    setSelectedSchoolScopeKey(schoolKey);
    setActiveTopNavigator("schools");
    openSchoolDrawer(schoolKey);
    window.setTimeout(() => {
      focusAndScrollTo("monitor-school-records");
    }, 80);
    pushToast(`Opened school details for ${record.schoolName}.`, "info");
  };

  const handleSendReminderRecord = (record: SchoolRecord) => {
    const schoolKey = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
    if (schoolKey === "unknown") {
      pushToast(`Unable to send reminder for ${record.schoolName}: school key is missing.`, "warning");
      return;
    }

    void sendReminderForSchool(schoolKey, record.schoolName);
  };

  const requestAccountActionReason = (actionLabel: string): string | null => {
    const input = window.prompt(`Reason for ${actionLabel}:`, "");
    if (input === null) {
      return null;
    }

    const normalized = input.trim();
    if (normalized.length < 5) {
      pushToast("Please provide a reason with at least 5 characters.", "warning");
      return null;
    }

    return normalized;
  };

  const handleUpdateSchoolHeadAccount = async (
    record: SchoolRecord,
    update: Omit<SchoolHeadAccountStatusUpdatePayload, "reason">,
    actionLabel: string,
  ) => {
    const account = record.schoolHeadAccount;
    if (!account) {
      pushToast(`No School Head account is linked to ${record.schoolName}.`, "warning");
      return;
    }

    const reason = requestAccountActionReason(actionLabel);
    if (!reason) {
      return;
    }

    const actionKey = `${record.id}:${actionLabel}`;
    setAccountActionKey(actionKey);
    try {
      const result = await updateSchoolHeadAccountStatus(record.id, {
        ...update,
        reason,
      });
      pushToast(result.message || `School Head account updated for ${record.schoolName}.`, "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Unable to update School Head account.", "warning");
    } finally {
      setAccountActionKey(null);
    }
  };

  const handleIssueSchoolHeadSetupLink = async (record: SchoolRecord) => {
    const account = record.schoolHeadAccount;
    if (!account) {
      pushToast(`No School Head account is linked to ${record.schoolName}.`, "warning");
      return;
    }

    const accountStatus = String(account.accountStatus ?? "").toLowerCase();
    let reason: string | null = null;
    if (accountStatus !== "pending_setup") {
      reason = requestAccountActionReason("reissuing setup link");
      if (!reason) {
        return;
      }
    }

    const actionKey = `${record.id}:setup-link`;
    setAccountActionKey(actionKey);
    try {
      const receipt = await issueSchoolHeadSetupLink(record.id, reason);
      await revealSetupLink(receipt.setupLink, record.schoolName);
      pushToast(`Setup link ready for ${record.schoolName}.`, "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Unable to issue setup link.", "warning");
    } finally {
      setAccountActionKey(null);
    }
  };

  const clearLockedSchoolContext = () => {
    setLockedSchoolContextKey(null);
    setSelectedSchoolScopeKey(ALL_SCHOOL_SCOPE);
    setSchoolDrawerKey(null);
    pushToast("School context cleared.", "info");
  };

  const handleQueueSchoolFocus = (schoolKey: string) => {
    if (schoolKey === "unknown") return;
    setLockedSchoolContextKey(schoolKey);
    setSelectedSchoolScopeKey(schoolKey);
    openSchoolDrawer(schoolKey);
    setActiveTopNavigator("reviews");
  };

  const handleQueueReviewCompleted = (payload: {
    schoolKey: string;
    schoolName: string;
    submissionId: string;
    action: "validated" | "returned";
  }) => {
    setLastReviewCompletion(payload);
  };

  useEffect(() => {
    if (!lastReviewCompletion) return;

    const currentIndex = laneFilteredQueueRows.findIndex((row) => row.schoolKey === lastReviewCompletion.schoolKey);
    const nextRow =
      currentIndex >= 0
        ? laneFilteredQueueRows[currentIndex + 1] ?? laneFilteredQueueRows[currentIndex - 1] ?? null
        : laneFilteredQueueRows[0] ?? null;

    if (nextRow && nextRow.schoolKey !== lastReviewCompletion.schoolKey) {
      setLockedSchoolContextKey(nextRow.schoolKey);
      setSelectedSchoolScopeKey(nextRow.schoolKey);
      openSchoolDrawer(nextRow.schoolKey);
      pushToast(`Auto-focused next school: ${nextRow.schoolName}.`, "info");
    }

    setLastReviewCompletion(null);
  }, [laneFilteredQueueRows, lastReviewCompletion]);

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  };

  const jumpToDrawerIndicator = (targetKey: string, emptyMessage: string) => {
    if (!targetKey) {
      pushToast(emptyMessage, "info");
      return;
    }

    setActiveSchoolDrawerTab("history");
    const targetId = `school-drawer-indicator-${sanitizeAnchorToken(targetKey)}`;

    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    window.setTimeout(() => {
      const row = document.getElementById(targetId);
      if (!row) {
        pushToast("Indicator row was not found in this package.", "warning");
        return;
      }

      row.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedDrawerIndicatorKey(targetKey);
      window.setTimeout(() => {
        setHighlightedDrawerIndicatorKey((current) => (current === targetKey ? null : current));
      }, 2200);
    }, 120);
  };

  const handleJumpToMissingIndicators = () => {
    const targetKey = missingDrawerIndicatorKeys[0] ?? "";
    jumpToDrawerIndicator(targetKey, "No missing indicators were detected.");
  };

  const handleJumpToReturnedIndicators = () => {
    const fallbackKey =
      returnedDrawerIndicatorKeys[0] ??
      (schoolIndicatorMatrix.latestSubmission?.status === "returned" ? schoolIndicatorMatrix.rows[0]?.key ?? "" : "");
    jumpToDrawerIndicator(fallbackKey, "No returned indicators were found in the latest package.");
  };

  const toggleDrawerIndicatorLabel = (key: string) => {
    setExpandedDrawerIndicatorRows((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const handleMonitorTopNavigate = (id: MonitorTopNavigatorId) => {
    setShowNavigatorManual(false);
    setActiveTopNavigator(id);

    if (typeof window !== "undefined") {
      const targetByNav: Record<MonitorTopNavigatorId, string> = {
        overview: "monitor-overview-metrics",
        schools: "monitor-school-records",
        reviews: "monitor-action-queue",
      };

      const targetId = targetByNav[id];
      if (targetId) {
        window.setTimeout(() => {
          focusAndScrollTo(targetId);
        }, 70);
      }
    }

    if (isMobileViewport) {
      setIsNavigatorVisible(false);
    }
  };

  const focusGlobalSearch = useCallback(() => {
    const input = globalSearchInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  const cycleSchoolFocus = useCallback(
    (direction: 1 | -1) => {
      if (compactSchoolRows.length === 0) {
        pushToast("No school available in the current scope.", "warning");
        return;
      }

      const activeSchoolKey =
        schoolDrawerKey ??
        lockedSchoolContextKey ??
        (selectedSchoolScopeKey !== ALL_SCHOOL_SCOPE ? selectedSchoolScopeKey : null);
      const activeIndex = activeSchoolKey
        ? compactSchoolRows.findIndex((entry) => entry.summary.schoolKey === activeSchoolKey)
        : -1;

      let nextIndex = direction > 0 ? 0 : compactSchoolRows.length - 1;
      if (activeIndex >= 0) {
        nextIndex = activeIndex + direction;
        if (nextIndex < 0) nextIndex = compactSchoolRows.length - 1;
        if (nextIndex >= compactSchoolRows.length) nextIndex = 0;
      }

      const nextSummary = compactSchoolRows[nextIndex]?.summary;
      if (!nextSummary) return;

      setLockedSchoolContextKey(nextSummary.schoolKey);
      setSelectedSchoolScopeKey(nextSummary.schoolKey);
      setShowNavigatorManual(false);
      setActiveTopNavigator("schools");
      openSchoolDrawer(nextSummary.schoolKey);
      window.setTimeout(() => {
        focusAndScrollTo("monitor-school-records");
      }, 60);
    },
    [compactSchoolRows, focusAndScrollTo, lockedSchoolContextKey, openSchoolDrawer, pushToast, schoolDrawerKey, selectedSchoolScopeKey],
  );

  const triggerKeyboardReview = useCallback(() => {
    const activeSummary =
      (schoolDrawerKey ? schoolRequirementByKey.get(schoolDrawerKey) ?? null : null) ??
      (lockedSchoolContextKey ? schoolRequirementByKey.get(lockedSchoolContextKey) ?? null : null) ??
      laneFilteredQueueRows[0] ??
      actionQueueRows[0] ??
      compactSchoolRows[0]?.summary ??
      null;

    if (!activeSummary) {
      pushToast("No school is ready for review right now.", "warning");
      return;
    }

    handleReviewSchool(activeSummary);
  }, [actionQueueRows, compactSchoolRows, handleReviewSchool, laneFilteredQueueRows, lockedSchoolContextKey, pushToast, schoolDrawerKey, schoolRequirementByKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onKeyboardShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName.toLowerCase();
        if (tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable) {
          return;
        }
      }

      if (event.key === "/") {
        event.preventDefault();
        focusGlobalSearch();
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "j") {
        event.preventDefault();
        cycleSchoolFocus(1);
        return;
      }
      if (key === "k") {
        event.preventDefault();
        cycleSchoolFocus(-1);
        return;
      }
      if (key === "r") {
        event.preventDefault();
        triggerKeyboardReview();
      }
    };

    window.addEventListener("keydown", onKeyboardShortcut);
    return () => window.removeEventListener("keydown", onKeyboardShortcut);
  }, [cycleSchoolFocus, focusGlobalSearch, triggerKeyboardReview]);

  const openStudentRecordsFromCard = () => {
    setShowSchoolLearnerRecords(true);
    handleMonitorTopNavigate("schools");

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        focusAndScrollTo("monitor-school-learners");
      }, 50);
    }
  };

  const renderSchoolScopeSelector = (rootClassName = "relative mt-3") => {
    const isOpen = schoolScopeDropdownSlot === "schools";
    const isLockedByContext = Boolean(lockedSchoolContextKey);

    return (
      <div className={rootClassName}>
        <button
          type="button"
          onClick={() => {
            if (isLockedByContext) return;
            setSchoolScopeDropdownSlot((current) => (current === "schools" ? null : "schools"));
          }}
          disabled={isLockedByContext}
          className={`inline-flex w-full items-center justify-between gap-2 border px-2.5 py-1.5 text-left text-xs font-semibold transition ${
            isLockedByContext
              ? "cursor-not-allowed border-primary-200 bg-primary-50 text-primary-700"
              : "border-slate-200 bg-white text-slate-700 hover:border-primary-200 hover:text-primary-700"
          }`}
        >
          <span className="truncate">
            {selectedSchoolScope ? `${selectedSchoolScope.code} - ${selectedSchoolScope.name}` : "All schools"}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isLockedByContext && (
          <p className="mt-1 text-[11px] text-primary-700">
            School context is locked. Clear school context to change this filter.
          </p>
        )}
        {isOpen && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={schoolScopeQuery}
                  onChange={(event) => setSchoolScopeQuery(event.target.value)}
                  placeholder="Type school code or name"
                  className="w-full border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedSchoolScopeKey(ALL_SCHOOL_SCOPE);
                  setSelectedStudentLookup(null);
                  setPendingStudentLookupId(null);
                  setSelectedTeacherLookup(null);
                  setPendingTeacherLookupId(null);
                  setSchoolScopeQuery("");
                  setSchoolScopeDropdownSlot(null);
                }}
                className={`block w-full px-2.5 py-1.5 text-left text-xs transition ${
                  !selectedSchoolScope ? "bg-primary-50 text-primary-800" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                All schools
              </button>
              {filteredSchoolScopeOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    setSelectedSchoolScopeKey(option.key);
                    setSelectedStudentLookup(null);
                    setPendingStudentLookupId(null);
                    setSelectedTeacherLookup(null);
                    setPendingTeacherLookupId(null);
                    setSchoolScopeQuery("");
                    setSchoolScopeDropdownSlot(null);
                  }}
                  className={`block w-full px-2.5 py-1.5 text-left text-xs transition ${
                    selectedSchoolScope?.key === option.key
                      ? "bg-primary-50 text-primary-800"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="font-semibold">{option.code}</span> - {option.name}
                </button>
              ))}
              {filteredSchoolScopeOptions.length === 0 && (
                <p className="px-2.5 py-2 text-xs text-slate-500">No matching school.</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStudentLookupSelector = (rootClassName = "relative mt-3") => {
    const isOpen = schoolScopeDropdownSlot === "students";

    return (
      <div className={rootClassName}>
        <button
          type="button"
          onClick={() => setSchoolScopeDropdownSlot((current) => (current === "students" ? null : "students"))}
          className="inline-flex w-full items-center justify-between gap-2 border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
        >
          <span className="truncate">{selectedStudentLabel}</span>
          <span className="inline-flex items-center gap-1">
            {isStudentLookupSyncing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`} />
          </span>
        </button>
        {isOpen && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={studentLookupQuery}
                  onChange={(event) => setStudentLookupQuery(event.target.value)}
                  placeholder="Type student name, LRN, or school"
                  className="w-full border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedStudentLookup(null);
                  setPendingStudentLookupId(null);
                  setSelectedTeacherLookup(null);
                  setPendingTeacherLookupId(null);
                  setStudentLookupQuery("");
                  setSchoolScopeDropdownSlot(null);
                }}
                className={`block w-full px-2.5 py-1.5 text-left text-xs transition ${
                  !selectedStudentLookup ? "bg-primary-50 text-primary-800" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Show all students
              </button>
              {filteredStudentLookupOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setSelectedStudentLookup(option);
                    setPendingStudentLookupId(null);
                    setSelectedTeacherLookup(null);
                    setPendingTeacherLookupId(null);
                    if (option.schoolKey !== "unknown") {
                      setSelectedSchoolScopeKey(option.schoolKey);
                    }
                    setStudentLookupQuery(option.fullName);
                    setSchoolScopeDropdownSlot(null);
                    openStudentRecordsFromCard();
                  }}
                  className={`block w-full px-2.5 py-1.5 text-left text-xs transition ${
                    selectedStudentLookup?.id === option.id
                      ? "bg-primary-50 text-primary-800"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="font-semibold">{option.fullName}</span>
                  <span className="ml-1 text-slate-500">({option.lrn})</span>
                  <span className="ml-1 text-slate-400">{option.schoolCode} - {option.schoolName}</span>
                </button>
              ))}
              {filteredStudentLookupOptions.length === 0 && (
                <p className="px-2.5 py-2 text-xs text-slate-500">No student found.</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTeacherLookupSelector = (rootClassName = "relative mt-3") => {
    const isOpen = schoolScopeDropdownSlot === "teachers";

    return (
      <div className={rootClassName}>
        <button
          type="button"
          onClick={() => setSchoolScopeDropdownSlot((current) => (current === "teachers" ? null : "teachers"))}
          className="inline-flex w-full items-center justify-between gap-2 border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
        >
          <span className="truncate">{selectedTeacherLabel}</span>
          <span className="inline-flex items-center gap-1">
            {isTeacherLookupSyncing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`} />
          </span>
        </button>
        {isOpen && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={teacherLookupQuery}
                  onChange={(event) => setTeacherLookupQuery(event.target.value)}
                  placeholder="Type teacher name or school"
                  className="w-full border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedTeacherLookup(null);
                  setPendingTeacherLookupId(null);
                  setSelectedStudentLookup(null);
                  setPendingStudentLookupId(null);
                  setTeacherLookupQuery("");
                  setSchoolScopeDropdownSlot(null);
                }}
                className={`block w-full px-2.5 py-1.5 text-left text-xs transition ${
                  !selectedTeacherLookup ? "bg-primary-50 text-primary-800" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Show all teachers
              </button>
              {filteredTeacherLookupOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setSelectedTeacherLookup(option);
                    setPendingTeacherLookupId(null);
                    setSelectedStudentLookup(null);
                    setPendingStudentLookupId(null);
                    if (option.schoolKey !== "unknown") {
                      setSelectedSchoolScopeKey(option.schoolKey);
                    }
                    setTeacherLookupQuery(option.name);
                    setSchoolScopeDropdownSlot(null);
                    openStudentRecordsFromCard();
                  }}
                  className={`block w-full px-2.5 py-1.5 text-left text-xs transition ${
                    selectedTeacherLookup?.id === option.id
                      ? "bg-primary-50 text-primary-800"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="font-semibold">{option.name}</span>
                  <span className="ml-1 text-slate-400">{option.schoolCode} - {option.schoolName}</span>
                </button>
              ))}
              {filteredTeacherLookupOptions.length === 0 && (
                <p className="px-2.5 py-2 text-xs text-slate-500">No teacher found.</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const activeScreenMeta = useMemo(() => {
    switch (activeTopNavigator) {
      case "overview":
        return {
          title: "Overview",
          description: "Division-wide status and trend snapshot.",
          primaryLabel: "Export",
        };
      case "schools":
        return {
          title: "Schools",
          description: "Open school-level records and synchronized totals.",
          primaryLabel: "Open School",
        };
      case "reviews":
      default:
        return {
          title: "Reviews",
          description: "Review pending submissions and complete monitor actions.",
          primaryLabel: "Review",
        };
    }
  }, [activeTopNavigator]);

  const isPrimaryActionDisabled =
    activeTopNavigator === "overview"
      ? filteredRequirementRows.length === 0
      : activeTopNavigator === "schools"
        ? compactSchoolRows.length === 0
        : laneFilteredQueueRows.length === 0 && actionQueueRows.length === 0;

  const handlePrimaryAction = () => {
    if (activeTopNavigator === "overview") {
      if (filteredRequirementRows.length === 0) {
        pushToast("No rows available to export with current filters.", "warning");
        return;
      }

      const rows = filteredRequirementRows.map((row) => [
        row.schoolCode,
        row.schoolName,
        row.region,
        row.schoolStatus ?? "N/A",
        workflowLabel(row.indicatorStatus),
        row.missingCount,
        row.awaitingReviewCount,
        row.lastActivityAt ? formatDateTime(row.lastActivityAt) : "N/A",
      ]);
      const fileDate = new Date().toISOString().slice(0, 10);
      downloadCsvFile(
        `monitor-overview-${fileDate}.csv`,
        [
          "school_code",
          "school_name",
          "region",
          "school_status",
          "indicator_status",
          "missing_count",
          "for_review_count",
          "last_activity",
        ],
        rows,
      );
      pushToast(`Exported ${rows.length} school rows.`, "success");
      return;
    }

    if (activeTopNavigator === "schools") {
      const preferredSchoolKey = lockedSchoolContextKey ?? (selectedSchoolScopeKey !== ALL_SCHOOL_SCOPE ? selectedSchoolScopeKey : null);
      if (preferredSchoolKey) {
        const preferredSummary =
          compactSchoolRows.find((entry) => entry.summary.schoolKey === preferredSchoolKey)?.summary ??
          schoolRequirementByKey.get(preferredSchoolKey);
        if (preferredSummary) {
          handleOpenSchool(preferredSummary);
          return;
        }
      }

      if (compactSchoolRows.length > 0) {
        handleOpenSchool(compactSchoolRows[0].summary);
        return;
      }

      pushToast("No school available to open in the current scope.", "warning");
      return;
    }

    const nextReview = laneFilteredQueueRows[0] ?? actionQueueRows[0] ?? null;
    if (!nextReview) {
      pushToast("No school is queued for review right now.", "warning");
      return;
    }
    handleReviewSchool(nextReview);
  };

  const quickFiltersPanelContent = (
    <>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(13rem,15rem)_minmax(0,1fr)]">
        <label className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as SchoolStatus | "all")}
            className="border-none bg-transparent text-sm font-medium text-slate-700 outline-none"
          >
            <option value="all">All school statuses ({schoolStatusCounts.all})</option>
            <option value="active">Active ({schoolStatusCounts.active})</option>
            <option value="inactive">Inactive ({schoolStatusCounts.inactive})</option>
            <option value="pending">Pending ({schoolStatusCounts.pending})</option>
          </select>
        </label>
        <div className="rounded-sm border border-primary-100 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-700">
          Global search is pinned above. Use <span className="font-semibold">school code, school name, or school head</span>.
        </div>
      </div>

      <div className="mt-3 rounded-sm border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={requirementFilter}
              onChange={(event) => setRequirementFilter(event.target.value as RequirementFilter)}
              className="w-full border-none bg-transparent text-sm font-medium text-slate-700 outline-none"
            >
              {visibleRequirementFilterOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
            <ListChecks className="h-4 w-4 text-slate-400" />
            <select
              value={queueLane}
              onChange={(event) => setQueueLane(event.target.value as QueueLane)}
              className="w-full border-none bg-transparent text-sm font-medium text-slate-700 outline-none"
            >
              <option value="all">All lanes ({queueLaneCounts.all})</option>
              <option value="urgent">Urgent ({queueLaneCounts.urgent})</option>
              <option value="returned">Returned ({queueLaneCounts.returned})</option>
              <option value="for_review">For Review ({queueLaneCounts.for_review})</option>
              <option value="waiting_data">Waiting Data ({queueLaneCounts.waiting_data})</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
            <AlertTriangle className="h-4 w-4 text-slate-400" />
            <select
              value={schoolQuickPreset}
              onChange={(event) => setSchoolQuickPreset(event.target.value as SchoolQuickPreset)}
              className="w-full border-none bg-transparent text-sm font-medium text-slate-700 outline-none"
            >
              {SCHOOL_QUICK_PRESET_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} ({schoolPresetCounts[option.id]})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">Date From</span>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(event) => setFilterDateFrom(event.target.value)}
              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">Date To</span>
            <input
              type="date"
              value={filterDateTo}
              onChange={(event) => setFilterDateTo(event.target.value)}
              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
          </label>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <article className="border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-xs font-semibold text-slate-700">Which school</p>
            {renderSchoolScopeSelector()}
          </article>
          <article className="border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-xs font-semibold text-slate-700">Find a student</p>
            {renderStudentLookupSelector()}
          </article>
          <article className="border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-xs font-semibold text-slate-700">Find a teacher</p>
            {renderTeacherLookupSelector()}
          </article>
        </div>

        {activeTopNavigator === "overview" && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-sm border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-xs font-semibold text-slate-700">Advanced analytics</p>
            <button
              id="monitor-analytics-toggle"
              type="button"
              onClick={() => setShowAdvancedAnalytics((current) => !current)}
              className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              {showAdvancedAnalytics ? "Hide" : "Show"}
            </button>
          </div>
        )}
      </div>

      {activeFilterChips.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Active Filters</p>
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-700 transition hover:bg-primary-100"
            >
              Clear all
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => clearFilterChip(chip.id)}
                className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
              >
                {chip.label}
                <X className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-600">
        Showing <span className="font-semibold text-slate-900">{filteredSchoolsByPreset.length}</span> of{" "}
        <span className="font-semibold text-slate-900">{scopedRequirementRows.length}</span> schools in scope.
        {" "}
        Queue rows: <span className="font-semibold text-slate-900">{laneFilteredQueueRows.length}</span>{" "}
        <span className="text-slate-500">(lane)</span> /{" "}
        <span className="font-semibold text-slate-900">{actionQueueRows.length}</span>{" "}
        <span className="text-slate-500">(all)</span>.
      </p>
    </>
  );

  return (
    <Shell
      title="Division Monitor Dashboard"
      subtitle="Three-screen workflow: Overview, Schools, Reviews."
      actions={
        <div className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-sm border border-white/20 bg-white/10 p-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => void refreshRecords()}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-white text-primary-700 shadow-sm transition hover:bg-white/90"
            aria-label="Refresh records"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <span className="hidden max-w-[17rem] items-center truncate text-[11px] font-medium text-primary-100 sm:inline-flex lg:max-w-[21rem]">
            {syncStatus === "up_to_date" ? "Up to date" : "Updated"}
            {" | "}
            {lastSyncedAt
              ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "Not synced"}
            {syncScope ? ` | ${syncScope}` : ""}
          </span>
        </div>
      }
    >
      {error && (
        <section className="mb-5 border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
          {error}
        </section>
      )}

      <div
        className={`dashboard-left-layout mb-5 min-w-0 lg:grid lg:items-stretch lg:gap-6 lg:transition-[grid-template-columns] lg:duration-[700ms] lg:ease-in-out ${
          isNavigatorCompact ? "lg:grid-cols-[5.25rem_minmax(0,1fr)]" : "lg:grid-cols-[17rem_minmax(0,1fr)]"
        }`}
      >
        <aside className="dashboard-side-rail w-full rounded-sm p-3 transition-[padding] duration-[700ms] ease-in-out lg:w-auto lg:self-stretch lg:min-h-full">
          <div className="dashboard-side-rail-sticky flex min-h-full flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className={`w-full ${showNavigatorHeaderText ? "" : "text-center"}`}>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (isMobileViewport) {
                        setIsNavigatorVisible((current) => !current);
                        return;
                      }
                      setIsNavigatorCompact((current) => !current);
                    }}
                    className={`inline-flex shrink-0 items-center rounded-sm border border-primary-400/40 bg-primary-700/65 text-white transition hover:bg-primary-700 ${
                      showNavigatorHeaderText
                        ? "h-11 w-full justify-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide"
                        : "h-11 w-11 justify-center"
                    }`}
                    aria-label={
                      isMobileViewport
                        ? isNavigatorVisible
                          ? "Hide navigator"
                          : "Show navigator"
                        : isNavigatorCompact
                          ? "Expand navigator"
                          : "Collapse navigator"
                    }
                    title={
                      isMobileViewport
                        ? isNavigatorVisible
                          ? "Hide navigator"
                          : "Show navigator"
                        : isNavigatorCompact
                          ? "Expand navigator"
                          : "Collapse navigator"
                    }
                  >
                    {isMobileViewport ? (
                      isNavigatorVisible ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                    ) : isNavigatorCompact ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronLeft className="h-3.5 w-3.5" />
                    )}
                    {showNavigatorHeaderText && (
                      <span>
                        {isMobileViewport
                          ? isNavigatorVisible
                            ? "Hide Menu"
                            : "Show Menu"
                          : isNavigatorCompact
                            ? "Expand Menu"
                            : "Collapse Menu"}
                      </span>
                    )}
                  </button>
                </div>
                <p
                  className={`overflow-hidden text-[11px] font-medium uppercase tracking-wide text-primary-100 transition-[max-height,opacity,margin] duration-[700ms] ease-in-out ${
                    showNavigatorHeaderText ? "mt-1 max-h-5 opacity-100" : "mt-0 max-h-0 opacity-0"
                  }`}
                >
                  Division Monitor
                </p>
              </div>
            </div>

            <div
              className={`overflow-hidden transition-[max-height,opacity,margin] duration-[700ms] ease-in-out ${
                shouldRenderNavigatorItems ? "mt-4 max-h-[34rem] opacity-100" : "mt-0 max-h-0 opacity-0 pointer-events-none"
              }`}
            >
              <div className={`grid ${isNavigatorCompact ? "gap-2" : "gap-2.5"}`}>
                {MONITOR_TOP_NAVIGATOR_ITEMS.map((item, index) => {
                  const Icon = MONITOR_NAVIGATOR_ICONS[item.id];
                  const isActive = activeTopNavigator === item.id;
                  const meta = navigatorBadges[item.id];
                  const hasPrimaryBadge = typeof meta.primary === "number" && meta.primary > 0;
                  const hasSecondaryBadge = typeof meta.secondary === "number" && meta.secondary > 0;
                  const urgencyTone =
                    meta.urgency === "high" ? "bg-rose-500" : meta.urgency === "medium" ? "bg-amber-400" : "bg-transparent";

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleMonitorTopNavigate(item.id)}
                      className={navigatorButtonClass(isActive, isNavigatorCompact)}
                      title={`${item.label} (Alt+${index + 1})`}
                      aria-current={isActive ? "page" : undefined}
                      aria-label={`Open ${item.label}`}
                    >
                      <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
                        <Icon className="h-4 w-4" />
                        {meta.urgency !== "none" && <span className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${urgencyTone}`} />}
                      </span>
                      {!isNavigatorCompact && <span className="flex-1 truncate text-left">{item.label}</span>}

                      {!isNavigatorCompact && hasPrimaryBadge && (
                        <span className="ml-auto inline-flex items-center gap-1">
                          <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-sm border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">
                            {meta.primary}
                          </span>
                          {item.id === "reviews" && hasSecondaryBadge && (
                            <span className="inline-flex items-center justify-center rounded-sm border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                              R{meta.secondary}
                            </span>
                          )}
                        </span>
                      )}

                      {isNavigatorCompact && hasPrimaryBadge && (
                        <span className="absolute right-1 top-1 inline-flex min-w-[1rem] items-center justify-center rounded-sm border border-primary-200 bg-primary-50 px-1 text-[9px] font-bold text-primary-700">
                          {meta.primary && meta.primary > 99 ? "99+" : meta.primary}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className={`overflow-hidden transition-[max-height,opacity,margin] duration-[700ms] ease-in-out ${
                shouldRenderNavigatorItems ? "mt-3 max-h-24 opacity-100" : "mt-0 max-h-0 opacity-0 pointer-events-none"
              }`}
            >
              <div className={`border-t border-primary-400/30 pt-3 ${isNavigatorCompact ? "flex justify-center" : ""}`}>
                <button
                  type="button"
                  onClick={() => {
                    setShowNavigatorManual((current) => !current);
                    setFocusedSectionId(null);
                    setSchoolDrawerKey(null);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-sm border text-white transition ${
                    showNavigatorManual
                      ? "border-primary-100 bg-primary-700"
                      : "border-primary-400/40 bg-primary-700/65 hover:bg-primary-700"
                  } ${
                    isNavigatorCompact ? "h-11 w-11 justify-center p-0" : "h-11 w-full px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                  }`}
                  title={showNavigatorManual ? "Close User Manual" : "Open User Manual"}
                  aria-label={showNavigatorManual ? "Close user manual" : "Open user manual"}
                >
                  <BookOpenText className="h-3.5 w-3.5" />
                  {!isNavigatorCompact && <span>{showNavigatorManual ? "Back to Data" : "User Manual"}</span>}
                </button>
              </div>
            </div>
          </div>
        </aside>
        <div className="dashboard-main-pane mt-4 min-w-0 lg:mt-0">
          {showNavigatorManual && (
            <section id="monitor-user-manual" className="dashboard-shell mb-5 overflow-hidden rounded-sm border border-slate-200 bg-white animate-fade-slide">
              <div className="min-h-[72vh] p-4 md:p-6 xl:p-8">
                <div className="mx-auto flex h-full w-full max-w-6xl flex-col justify-center gap-6">
                  <header className="text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-700">Division Monitor Dashboard</p>
                    <h2 className="mt-2 text-2xl font-bold text-slate-900 md:text-3xl">User Manual</h2>
                    <p className="mx-auto mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
                      This guide appears in the main workspace so monitors can review process steps clearly before working on live data.
                    </p>
                  </header>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                    <article className="rounded-sm border border-slate-200 bg-slate-50 p-4 md:p-5">
                      <p className="text-sm font-semibold uppercase tracking-wide text-slate-700">Step-by-step Workflow</p>
                      <ol className="mt-3 space-y-3">
                        {MONITOR_NAVIGATOR_MANUAL.map((step, index) => (
                          <li key={step.id} className="rounded-sm border border-slate-200 bg-white p-3">
                            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-primary-100 text-xs font-bold text-primary-700">
                                {index + 1}
                              </span>
                              {step.title}
                            </p>
                            <p className="mt-2 text-sm font-medium text-slate-700">{step.objective}</p>
                            <ul className="mt-2 space-y-1">
                              {step.actions.map((action) => (
                                <li key={`${step.id}-${action}`} className="ml-5 list-disc text-sm text-slate-700">
                                  {action}
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-sm font-semibold text-primary-700">Done when: {step.doneWhen}</p>
                          </li>
                        ))}
                      </ol>
                    </article>

                    <aside className="space-y-4">
                      <article className="rounded-sm border border-slate-200 bg-white p-4 md:p-5">
                        <p className="text-sm font-semibold uppercase tracking-wide text-slate-700">Workflow Status Guide</p>
                        <ul className="mt-3 space-y-2">
                          {MONITOR_MANUAL_STATUS_GUIDE.map((item) => (
                            <li key={item} className="ml-5 list-disc text-sm text-slate-700">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </article>
                      <article className="rounded-sm border border-primary-200 bg-primary-50 p-4 md:p-5">
                        <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Quick Reminders</p>
                        <ul className="mt-3 space-y-2">
                          <li className="ml-5 list-disc text-sm text-primary-700">Review urgent schools first before routine checks.</li>
                          <li className="ml-5 list-disc text-sm text-primary-700">Write clear return notes to reduce repeated revisions.</li>
                          <li className="ml-5 list-disc text-sm text-primary-700">Use school and learner filters before sending reminders.</li>
                        </ul>
                      </article>
                      <button
                        type="button"
                        onClick={() => setShowNavigatorManual(false)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Return to Dashboard Data
                      </button>
                    </aside>
                  </div>
                </div>
              </div>
            </section>
          )}

          {!showNavigatorManual && (
            <section className="dashboard-shell mb-5 rounded-sm border border-slate-200 bg-white p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">{activeScreenMeta.title}</h2>
                  <p className="mt-1 text-xs text-slate-600">{activeScreenMeta.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrimaryAction}
                    disabled={isPrimaryActionDisabled}
                    className="inline-flex items-center gap-1 rounded-sm border border-primary-300/70 bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {activeScreenMeta.primaryLabel}
                  </button>
                  <button
                    id="monitor-submission-filters-toggle"
                    type="button"
                    onClick={() => setShowAdvancedFilters((current) => !current)}
                    className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    <Filter className="h-3.5 w-3.5" />
                    {showAdvancedFilters ? "Hide Filters" : "Filters"}
                  </button>
                </div>
              </div>
            </section>
          )}

          {!showNavigatorManual && (
            <section className="dashboard-shell dashboard-nav-shell z-40 mb-5 rounded-sm border border-slate-200 bg-white/95 p-2 backdrop-blur">
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <label className="relative w-full lg:max-w-lg">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      ref={globalSearchInputRef}
                      type="text"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search school code, school name, or school head"
                      className="w-full rounded-sm border border-slate-200 bg-white py-2 pl-10 pr-20 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                      /
                    </span>
                  </label>
                  <p className="hidden text-[11px] font-medium text-slate-600 lg:block">
                    <span className="font-semibold text-slate-800">/</span> Search ·{" "}
                    <span className="font-semibold text-slate-800">J/K</span> Navigate ·{" "}
                    <span className="font-semibold text-slate-800">R</span> Review
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <span
                    title="Schools in the current scope."
                    className="inline-flex items-center rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                  >
                    Total Schools: {stickySummaryStats.totalSchools}
                  </span>
                  <span
                    title="Submitted packages waiting for monitor review."
                    className="inline-flex items-center rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-700"
                  >
                    Pending: {stickySummaryStats.pending}
                  </span>
                  <span
                    title="Packages returned to school heads for correction."
                    className="inline-flex items-center rounded-sm border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
                  >
                    Returned: {stickySummaryStats.returned}
                  </span>
                  <span
                    title="Schools flagged as high risk (missing or returned)."
                    className="inline-flex items-center rounded-sm border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700"
                  >
                    At Risk: {stickySummaryStats.atRisk}
                  </span>
                  <span
                    title="Most recent dashboard synchronization time."
                    className="inline-flex items-center rounded-sm border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                  >
                    Last Sync: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "N/A"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Presets</span>
                  {SCHOOL_QUICK_PRESET_OPTIONS.map((preset) => {
                    const isActive = schoolQuickPreset === preset.id;
                    const count = schoolPresetCounts[preset.id];

                    return (
                      <button
                        key={`sticky-preset-${preset.id}`}
                        type="button"
                        title={preset.hint}
                        onClick={() => setSchoolQuickPreset(preset.id)}
                        className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] font-semibold transition ${
                          isActive
                            ? "border-primary-300 bg-primary-100 text-primary-800"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <span>{preset.label}</span>
                        <span className="rounded-sm bg-slate-100 px-1 text-[10px] font-bold text-slate-700">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {!showNavigatorManual && showSubmissionFilters && !isMobileViewport && (
            <section
              id="monitor-submission-filters"
              className={`surface-panel dashboard-shell mb-5 rounded-sm p-3 ${sectionFocusClass("monitor-submission-filters")}`}
            >
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Filters</h2>
              {quickFiltersPanelContent}
            </section>
          )}

          {!showNavigatorManual && showSubmissionFilters && isMobileViewport && (
            <>
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(false)}
                className="fixed inset-0 z-[72] bg-slate-900/40"
                aria-label="Close quick filters"
              />
              <section id="monitor-submission-filters" className="fixed inset-x-0 bottom-0 z-[73] max-h-[84vh] overflow-y-auto rounded-t-sm border border-slate-200 bg-white p-4 shadow-2xl animate-fade-slide">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Filters</h2>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedFilters(false)}
                    className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                </div>
                {quickFiltersPanelContent}
              </section>
            </>
          )}

      {!showNavigatorManual && activeTopNavigator === "overview" && (
        <>
          <section className={`surface-panel dashboard-shell mb-5 animate-fade-slide overflow-hidden ${sectionFocusClass("monitor-reports-header")}`}>
            <div id="monitor-reports-header" className="border-b border-slate-200 bg-white px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Overview</h2>
                  <p className="mt-1 text-xs text-slate-600">Summary cards and analytics for division monitoring.</p>
                </div>
                {!isMobileViewport && renderQuickJumpChips(false)}
              </div>
              {isMobileViewport && renderQuickJumpChips(true)}
            </div>
            <div id="monitor-overview-metrics" className={`p-4 ${sectionFocusClass("monitor-overview-metrics")}`}>
              <div className="rounded-sm border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <StatCard label="Needs Action" value={needsActionCount.toLocaleString()} icon={<AlertTriangle className="h-5 w-5" />} tone="warning" />
                  <StatCard label="Returned" value={returnedCount.toLocaleString()} icon={<ArrowDown className="h-5 w-5" />} tone="warning" />
                  <StatCard label="Submitted" value={submittedCount.toLocaleString()} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
                </div>
              </div>
            </div>
          </section>

          {renderAdvancedAnalytics && (
            <section
              className={`surface-panel dashboard-shell overflow-hidden transition-[max-height,opacity,transform,margin] duration-[520ms] ease-in-out ${
                isHidingAdvancedAnalytics
                  ? "mt-0 max-h-0 -translate-y-1 opacity-0 pointer-events-none"
                  : "mt-5 max-h-[2600px] translate-y-0 opacity-100 animate-fade-slide"
              }`}
            >
              <div id="monitor-targets-snapshot" className={`p-4 ${sectionFocusClass("monitor-targets-snapshot")}`}>
                <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                  <div id="monitor-sync-alerts" className={`rounded-sm border border-slate-200 bg-white p-5 ${sectionFocusClass("monitor-sync-alerts")}`}>
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">TARGETS-MET Sync Snapshot</h2>
                      <span className="text-xs text-slate-500">
                        {targetsMet?.generatedAt ? `Generated ${new Date(targetsMet.generatedAt).toLocaleTimeString()}` : "Waiting for data"}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Retention Rate</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet ? `${targetsMet.retentionRatePercent.toFixed(2)}%` : "--"}</p>
                      </div>
                      <div className="border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Dropout Rate</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet ? `${targetsMet.dropoutRatePercent.toFixed(2)}%` : "--"}</p>
                      </div>
                      <div className="border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Completion Rate</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet ? `${targetsMet.completionRatePercent.toFixed(2)}%` : "--"}</p>
                      </div>
                      <div className="border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">At-Risk Learners</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet ? targetsMet.atRiskLearners.toLocaleString() : "--"}</p>
                      </div>
                      <div className="border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Student-Teacher Ratio</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet?.studentTeacherRatio ?? "--"}</p>
                      </div>
                      <div className="border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Student-Classroom Ratio</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet?.studentClassroomRatio ?? "--"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-sm border border-slate-200 bg-white p-5">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Synchronized Alerts</h2>
                    <div className="mt-4 space-y-3">
                      {syncAlerts.slice(0, 4).map((alert) => (
                        <article key={alert.id} className="border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{alert.level}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{alert.title}</p>
                          <p className="mt-1 text-xs text-slate-600">{alert.message}</p>
                        </article>
                      ))}
                      {syncAlerts.length === 0 && <p className="text-xs text-slate-500">No synchronized alerts yet.</p>}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-3">
                  <div id="monitor-status-chart" className={`rounded-sm border border-slate-200 bg-white p-3 ${sectionFocusClass("monitor-status-chart")}`}>
                    <StatusPieChart data={statusDistribution} />
                  </div>
                  <div id="monitor-region-chart" className={`rounded-sm border border-slate-200 bg-white p-3 ${sectionFocusClass("monitor-region-chart")}`}>
                    <RegionBarChart data={regionAggregates} />
                  </div>
                  <div id="monitor-trend-chart" className={`rounded-sm border border-slate-200 bg-white p-3 ${sectionFocusClass("monitor-trend-chart")}`}>
                    <SubmissionTrendChart data={submissionTrend} />
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {!showNavigatorManual && activeTopNavigator === "reviews" && (
        <>
          <section id="monitor-action-queue" className={`dashboard-shell mb-5 rounded-sm p-4 ${sectionFocusClass("monitor-action-queue")}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Reviews</h2>
                <p className="mt-1 text-xs text-slate-600">Single workspace for triage, school context, and review actions.</p>
              </div>
              {!isMobileViewport && renderQuickJumpChips(false)}
            </div>
            {isMobileViewport && renderQuickJumpChips(true)}
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard label="Needs Action" value={needsActionCount.toLocaleString()} icon={<AlertTriangle className="h-5 w-5" />} tone="warning" />
              <StatCard label="Returned" value={returnedCount.toLocaleString()} icon={<ArrowDown className="h-5 w-5" />} tone="warning" />
              <StatCard label="Submitted" value={submittedCount.toLocaleString()} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
            </div>
            {(lockedSchoolContextKey || schoolDrawerKey) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2">
                <p className="text-xs font-semibold text-primary-700">
                  School context locked:{" "}
                  <span className="text-primary-900">
                    {schoolDetail?.schoolName ?? schoolRequirementByKey.get(lockedSchoolContextKey ?? "")?.schoolName ?? "Selected school"}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={clearLockedSchoolContext}
                  className="inline-flex items-center gap-1 rounded-sm border border-primary-300 bg-white px-2 py-1 text-[11px] font-semibold text-primary-700 transition hover:bg-primary-100"
                >
                  <X className="h-3 w-3" />
                  Clear School Context
                </button>
              </div>
            )}
          </section>

          <section id="monitor-requirements-table" className={`surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden ${sectionFocusClass("monitor-requirements-table")}`}>
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">Queue List</h2>
              <p className="mt-1 text-xs text-slate-600">Sorted by priority: Returned, Missing, then For Review. Active lane: {queueLaneLabel(queueLane)}.</p>
            </div>

            {paginatedRequirementRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-5 py-14 text-slate-500">
                <AlertCircle className="h-9 w-9 text-slate-400" />
                <p className="text-sm font-semibold">No Missing, Returned, or For Review schools found.</p>
                <p className="text-xs text-slate-400">Current filters may be hiding results.</p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={resetQueueFilters}
                    className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    Reset queue filters
                  </button>
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-700"
                  >
                    Clear all
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-3 px-4 py-4 md:hidden">
                  {paginatedRequirementRows.map((row) => (
                    <article
                      key={row.schoolKey}
                      className={`rounded-sm border border-slate-200 bg-white p-3 ${
                        lockedSchoolContextKey === row.schoolKey
                          ? "ring-2 ring-primary-200"
                          : isUrgentRequirement(row)
                            ? urgencyRowTone(row)
                            : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{row.schoolName}</p>
                          <p className="text-xs text-slate-500">{row.schoolCode} - {row.region}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${queuePriorityTone(row)}`}>
                            {queuePriorityLabel(row)}
                          </span>
                          <span className="text-xs font-semibold text-slate-700">Missing: {row.missingCount}</span>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${row.hasComplianceRecord ? "bg-primary-100 text-primary-700" : "bg-slate-100 text-slate-700"}`}>
                          {row.hasComplianceRecord ? "Compliance Submitted" : "Compliance Missing"}
                        </span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${workflowTone(row.indicatorStatus)}`}>
                          {workflowLabel(row.indicatorStatus)}
                        </span>
                        <span className="text-slate-600">For Review: {row.awaitingReviewCount}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleReviewSchool(row)}
                          className="inline-flex items-center justify-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2 py-1.5 text-[11px] font-semibold text-primary-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Review
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenSchool(row)}
                          className="inline-flex items-center justify-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700"
                        >
                          <Building2 className="h-3.5 w-3.5" />
                          Open School
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSendReminder(row)}
                          disabled={remindingSchoolKey === row.schoolKey}
                          className="col-span-2 inline-flex items-center justify-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <BellRing className="h-3.5 w-3.5" />
                          {remindingSchoolKey === row.schoolKey ? "Sending..." : "Send Reminder"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="hidden overflow-x-auto px-5 py-4 md:block">
                  <table className="min-w-full">
                    <thead className="table-head-sticky">
                      <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-2 py-2 text-left">School</th>
                        <th className="px-2 py-2 text-left">Region</th>
                        <th className="px-2 py-2 text-center">Compliance</th>
                        <th className="px-2 py-2 text-center">Indicators</th>
                        <th className="px-2 py-2 text-center">Missing</th>
                        <th className="px-2 py-2 text-center">For Review</th>
                        <th className="px-2 py-2 text-center">Priority</th>
                        <th className="px-2 py-2 text-left">Last Activity</th>
                        <th className="px-2 py-2 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedRequirementRows.map((row) => (
                        <tr
                          key={row.schoolKey}
                          className={
                            lockedSchoolContextKey === row.schoolKey
                              ? "bg-primary-50/60"
                              : isUrgentRequirement(row)
                                ? urgencyRowTone(row)
                                : "dashboard-table-row"
                          }
                        >
                          <td className="px-2 py-2">
                            <p className="text-sm font-semibold text-slate-900">{row.schoolName}</p>
                            <p className="text-xs text-slate-500">{row.schoolCode}</p>
                          </td>
                          <td className="px-2 py-2 text-sm text-slate-700">{row.region}</td>
                          <td className="px-2 py-2 text-center">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                                row.hasComplianceRecord
                                  ? "bg-primary-100 text-primary-700 ring-1 ring-primary-300"
                                  : "bg-slate-100 text-slate-600 ring-1 ring-slate-300"
                              }`}
                            >
                              {row.hasComplianceRecord ? "Submitted" : "Missing"}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${workflowTone(
                                row.indicatorStatus,
                              )}`}
                            >
                              {workflowLabel(row.indicatorStatus)}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center text-sm font-semibold text-slate-900">{row.missingCount}</td>
                          <td className="px-2 py-2 text-center text-sm font-semibold text-slate-900">{row.awaitingReviewCount}</td>
                          <td className="px-2 py-2 text-center">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${queuePriorityTone(row)}`}>
                              {queuePriorityLabel(row)}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-sm text-slate-600">
                            {row.lastActivityAt ? formatDateTime(row.lastActivityAt) : "N/A"}
                          </td>
                          <td className="min-w-[18rem] px-2 py-2">
                            <div className="flex flex-nowrap items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleReviewSchool(row)}
                                className="inline-flex items-center gap-1 whitespace-nowrap rounded-sm border border-primary-200 bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Review
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenSchool(row)}
                                className="inline-flex items-center gap-1 whitespace-nowrap rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                              >
                                <Building2 className="h-3.5 w-3.5" />
                                Open School
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSendReminder(row)}
                                disabled={remindingSchoolKey === row.schoolKey}
                                className="inline-flex items-center gap-1 whitespace-nowrap rounded-sm border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                <BellRing className="h-3.5 w-3.5" />
                                {remindingSchoolKey === row.schoolKey ? "Sending..." : "Reminder"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {laneFilteredQueueRows.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-600">
                  Page <span className="font-semibold text-slate-900">{safeRequirementsPage}</span> of{" "}
                  <span className="font-semibold text-slate-900">{totalRequirementPages}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRequirementsPage((current) => Math.max(1, current - 1))}
                    disabled={safeRequirementsPage <= 1}
                    className="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequirementsPage((current) => Math.min(totalRequirementPages, current + 1))}
                    disabled={safeRequirementsPage >= totalRequirementPages}
                    className="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>

          <section
            id="monitor-queue-workspace"
            className={`surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden rounded-sm ${sectionFocusClass("monitor-queue-workspace")}`}
          >
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">Queue Review Workspace</h2>
              <p className="mt-1 text-xs text-slate-600">
                Review submitted packages, indicator matrix, notes, and decisions in one place.
              </p>
            </div>
            {queueWorkspaceSchoolFilterKeys && queueWorkspaceSchoolFilterKeys.size > 0 ? (
              <MonitorIndicatorPanel
                embedded
                schoolFilterKeys={queueWorkspaceSchoolFilterKeys}
                schoolRecords={records}
                onToast={pushToast}
                onSendReminder={sendReminderForSchool}
                onSchoolFocusChange={(schoolKey) => handleQueueSchoolFocus(schoolKey)}
                onReviewCompleted={handleQueueReviewCompleted}
              />
            ) : (
              <div className="px-5 py-8 text-sm text-slate-500">
                Select a school from the queue to start reviewing submissions.
              </div>
            )}
          </section>
        </>
      )}

      {!showNavigatorManual && activeTopNavigator === "schools" && (
        <>
        <section id="monitor-school-radar" className={`dashboard-shell mb-5 rounded-sm border border-slate-200 bg-white p-3 ${sectionFocusClass("monitor-school-radar")}`}>
          <div className="grid gap-3 lg:grid-cols-3">
            <article className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Total Schools</p>
                  <p className="mt-1 text-3xl font-bold leading-none text-slate-900">{totalSchoolsInScope.toLocaleString()}</p>
                </div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-slate-200 bg-white text-primary-700">
                  <Building2 className="h-5 w-5" />
                </span>
              </div>
              {renderSchoolScopeSelector("relative mt-2")}
            </article>

            <article className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Total Students</p>
                  <p className="mt-1 text-3xl font-bold leading-none text-slate-900">
                    {monitorRadarTotals.isLoading ? "..." : monitorRadarTotals.students.toLocaleString()}
                  </p>
                </div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-slate-200 bg-white text-primary-700">
                  <GraduationCap className="h-5 w-5" />
                </span>
              </div>
              {renderStudentLookupSelector("relative mt-2")}
            </article>

            <article className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Total Teachers</p>
                  <p className="mt-1 text-3xl font-bold leading-none text-slate-900">
                    {monitorRadarTotals.isLoading ? "..." : monitorRadarTotals.teachers.toLocaleString()}
                  </p>
                </div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-slate-200 bg-white text-primary-700">
                  <Users className="h-5 w-5" />
                </span>
              </div>
              {renderTeacherLookupSelector("relative mt-2")}
            </article>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              {monitorRadarTotals.error
                ? monitorRadarTotals.error
                : monitorRadarTotals.syncedAt
                  ? `Synced ${new Date(monitorRadarTotals.syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Waiting for sync"}
            </span>
            <span>Totals are read live from students and teachers records.</span>
          </div>
        </section>

        <section id="monitor-school-records" className={`surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden ${sectionFocusClass("monitor-school-records")}`}>
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Schools</h2>
                <p className="mt-1 text-xs text-slate-600">Inspect school profile, records, and latest activity.</p>
              </div>
              {!isMobileViewport && renderQuickJumpChips(false)}
            </div>
            {isMobileViewport && renderQuickJumpChips(true)}
          </div>

          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
                Showing {paginatedCompactSchoolRows.length} of {compactSchoolRows.length} (Needs Attention First)
              </div>
              <div ref={schoolActionsMenuRef} className="relative flex flex-wrap items-center gap-2">
                <input
                  ref={bulkImportInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(event) => void handleBulkImportFileChange(event)}
                />
                <button
                  type="button"
                  onClick={() => setIsSchoolActionsMenuOpen((current) => !current)}
                  className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Actions
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isSchoolActionsMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {isSchoolActionsMenuOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-sm border border-slate-200 bg-white shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSchoolActionsMenuOpen(false);
                        openCreateRecordForm();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Plus className="h-3.5 w-3.5 text-primary-600" />
                      Add School
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSchoolActionsMenuOpen(false);
                        handleOpenBulkImportPicker();
                      }}
                      disabled={isBulkImporting}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <Database className="h-3.5 w-3.5 text-primary-600" />
                      {isBulkImporting ? "Importing..." : "Import CSV"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSchoolActionsMenuOpen(false);
                        void handleToggleArchivedRecords();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-primary-600" />
                      {showArchivedRecords ? "Hide Archived" : "Show Archived"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSchoolActionsMenuOpen(false);
                        setShowSchoolLearnerRecords((current) => !current);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Users className="h-3.5 w-3.5 text-primary-600" />
                      {showSchoolLearnerRecords ? "Hide Learners" : "Show Learners"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {deleteError && (
            <div className="mx-5 mt-4 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
              {deleteError}
            </div>
          )}

          {bulkImportError && (
            <div className="mx-5 mt-4 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
              {bulkImportError}
            </div>
          )}

          {bulkImportSummary && (
            <div className="mx-5 mt-4 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
              Import complete: {bulkImportSummary.created} created, {bulkImportSummary.updated} updated,{" "}
              {bulkImportSummary.restored} restored, {bulkImportSummary.skipped} skipped, {bulkImportSummary.failed} failed.
            </div>
          )}

          {showRecordForm && (
            <section className="mx-5 mt-4 overflow-hidden rounded-sm border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{editingRecordId ? "Edit School Record" : "Add School Record"}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">School Code must be 6 digits. School name, level, type, and address are required. Students, teachers, and status are managed by School Head.</p>
                </div>
                <button
                  type="button"
                  onClick={closeRecordForm}
                  className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <X className="h-3.5 w-3.5" />
                  Close
                </button>
              </div>
              <form className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleRecordSubmit}>
                <div>
                  <label htmlFor="monitor-school-id" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    School Code
                  </label>
                  <input
                    id="monitor-school-id"
                    type="text"
                    value={recordForm.schoolId}
                    onChange={(event) => {
                      const normalizedSchoolId = event.target.value.replace(/\D+/g, "").slice(0, 6);
                      setRecordForm((current) => ({ ...current, schoolId: normalizedSchoolId }));
                      setRecordFormErrors((current) => ({ ...current, schoolId: undefined }));
                    }}
                    placeholder="e.g. 103811"
                    className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
                      recordFormErrors.schoolId ? "border-primary-300" : "border-slate-200"
                    }`}
                  />
                  {recordFormErrors.schoolId && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.schoolId}</p>}
                </div>
                <div>
                  <label htmlFor="monitor-school-name" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    School Name
                  </label>
                  <input
                    id="monitor-school-name"
                    type="text"
                    value={recordForm.schoolName}
                    onChange={(event) => {
                      setRecordForm((current) => ({ ...current, schoolName: event.target.value }));
                      setRecordFormErrors((current) => ({ ...current, schoolName: undefined }));
                    }}
                    className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
                      recordFormErrors.schoolName ? "border-primary-300" : "border-slate-200"
                    }`}
                  />
                  {recordFormErrors.schoolName && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.schoolName}</p>}
                </div>
                <div>
                  <label htmlFor="monitor-level" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Level
                  </label>
                  <input
                    id="monitor-level"
                    type="text"
                    value={recordForm.level}
                    onChange={(event) => {
                      setRecordForm((current) => ({ ...current, level: event.target.value }));
                      setRecordFormErrors((current) => ({ ...current, level: undefined }));
                    }}
                    className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
                      recordFormErrors.level ? "border-primary-300" : "border-slate-200"
                    }`}
                  />
                  {recordFormErrors.level && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.level}</p>}
                </div>
                <div>
                  <label htmlFor="monitor-type" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Type
                  </label>
                  <select
                    id="monitor-type"
                    value={recordForm.type}
                    onChange={(event) => {
                      setRecordForm((current) => ({ ...current, type: event.target.value as "public" | "private" }));
                      setRecordFormErrors((current) => ({ ...current, type: undefined }));
                    }}
                    className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
                      recordFormErrors.type ? "border-primary-300" : "border-slate-200"
                    }`}
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                  {recordFormErrors.type && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.type}</p>}
                </div>
                <div>
                  <label htmlFor="monitor-district" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    District
                  </label>
                  <input
                    id="monitor-district"
                    type="text"
                    value={recordForm.district}
                    onChange={(event) => {
                      setRecordForm((current) => ({ ...current, district: event.target.value }));
                      setRecordFormErrors((current) => ({ ...current, district: undefined }));
                    }}
                    className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
                      recordFormErrors.district ? "border-primary-300" : "border-slate-200"
                    }`}
                  />
                  {recordFormErrors.district && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.district}</p>}
                </div>
                <div>
                  <label htmlFor="monitor-region" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Region
                  </label>
                  <input
                    id="monitor-region"
                    type="text"
                    value={recordForm.region}
                    onChange={(event) => {
                      setRecordForm((current) => ({ ...current, region: event.target.value }));
                      setRecordFormErrors((current) => ({ ...current, region: undefined }));
                    }}
                    placeholder="Leave blank to auto-derive from address"
                    className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
                      recordFormErrors.region ? "border-primary-300" : "border-slate-200"
                    }`}
                  />
                  {recordFormErrors.region && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.region}</p>}
                </div>
                <div className="md:col-span-2 xl:col-span-2">
                  <label htmlFor="monitor-address" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Address
                  </label>
                  <input
                    id="monitor-address"
                    type="text"
                    value={recordForm.address}
                    onChange={(event) => {
                      setRecordForm((current) => ({ ...current, address: event.target.value }));
                      setRecordFormErrors((current) => ({ ...current, address: undefined }));
                    }}
                    className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
                      recordFormErrors.address ? "border-primary-300" : "border-slate-200"
                    }`}
                  />
                  {recordFormErrors.address && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.address}</p>}
                </div>
                {!editingRecordId && (
                  <div className="md:col-span-2 xl:col-span-4 rounded-sm border border-slate-200 bg-slate-50 p-3">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                      <input
                        type="checkbox"
                        checked={recordForm.createSchoolHeadAccount}
                        onChange={(event) =>
                          setRecordForm((current) => ({
                            ...current,
                            createSchoolHeadAccount: event.target.checked,
                          }))
                        }
                        className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary-100"
                      />
                      Create School Head Account
                    </label>
                    {recordForm.createSchoolHeadAccount && (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <label htmlFor="monitor-account-name" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                            Account Name
                          </label>
                          <input
                            id="monitor-account-name"
                            type="text"
                            value={recordForm.schoolHeadAccountName}
                            onChange={(event) => {
                              setRecordForm((current) => ({ ...current, schoolHeadAccountName: event.target.value }));
                              setRecordFormErrors((current) => ({ ...current, schoolHeadAccountName: undefined }));
                            }}
                            className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
                              recordFormErrors.schoolHeadAccountName ? "border-primary-300" : "border-slate-200"
                            }`}
                          />
                          {recordFormErrors.schoolHeadAccountName && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.schoolHeadAccountName}</p>}
                        </div>
                        <div>
                          <label htmlFor="monitor-account-email" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                            Account Email
                          </label>
                          <input
                            id="monitor-account-email"
                            type="email"
                            value={recordForm.schoolHeadAccountEmail}
                            onChange={(event) => {
                              setRecordForm((current) => ({ ...current, schoolHeadAccountEmail: event.target.value }));
                              setRecordFormErrors((current) => ({ ...current, schoolHeadAccountEmail: undefined }));
                            }}
                            className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
                              recordFormErrors.schoolHeadAccountEmail ? "border-primary-300" : "border-slate-200"
                            }`}
                          />
                          {recordFormErrors.schoolHeadAccountEmail && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.schoolHeadAccountEmail}</p>}
                        </div>
                        <p className="md:col-span-2 rounded-sm border border-primary-100 bg-primary-50/70 px-3 py-2 text-xs font-semibold text-primary-800">
                          A one-time setup link (24h expiry) will be generated after save. The account becomes active once the School Head sets a password.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? "Saving..." : editingRecordId ? "Save Changes" : "Create Record"}
                  </button>
                </div>
                {(recordFormError || recordFormMessage) && (
                  <div className="md:col-span-2 xl:col-span-4">
                    {recordFormError && (
                      <p className="rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
                        {recordFormError}
                      </p>
                    )}
                    {recordFormMessage && (
                      <p className="rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
                        {recordFormMessage}
                      </p>
                    )}
                  </div>
                )}
              </form>
            </section>
          )}

          {isLoading && records.length === 0 ? (
            <div className="space-y-3 px-5 py-5">
              <div className="skeleton-line h-4 w-48" />
              <div className="grid gap-2">
                <div className="skeleton-line h-12 w-full" />
                <div className="skeleton-line h-12 w-full" />
                <div className="skeleton-line h-12 w-full" />
                <div className="skeleton-line h-12 w-full" />
              </div>
              <p className="text-xs text-slate-500">Syncing data from the backend...</p>
            </div>
          ) : compactSchoolRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-slate-500">
              <AlertCircle className="h-9 w-9 text-slate-400" />
              <p className="text-sm font-semibold">No records found</p>
              <p className="text-xs text-slate-400">Current filters may be hiding school records.</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={resetQueueFilters}
                  className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Reset queue filters
                </button>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-700"
                >
                  Clear all
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2 px-4 py-4">
                {paginatedCompactSchoolRows.map(({ summary, record }) => {
                  const schoolKey = summary.schoolKey;
                  const rowStatus = summary.schoolStatus ?? "pending";
                  const rowTone = isUrgentRequirement(summary) ? urgencyRowTone(summary) : "bg-white";
                  const updatedLabel = summary.lastActivityAt ?? record?.lastUpdated ?? null;

                  return (
                    <article key={schoolKey} className={`rounded-sm border border-slate-200 p-3 ${rowTone}`}>
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{summary.schoolName}</p>
                          <p className="truncate text-[11px] text-slate-500">
                            {summary.schoolCode} | {summary.region}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            title="Indicator workflow status"
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${workflowTone(summary.indicatorStatus)}`}
                          >
                            {workflowLabel(summary.indicatorStatus)}
                          </span>
                          <span
                            title="School account status"
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(rowStatus)}`}
                          >
                            {statusLabel(rowStatus)}
                          </span>
                          {summary.missingCount > 0 && (
                            <span
                              title="Required fields still missing."
                              className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700"
                            >
                              Missing {summary.missingCount}
                            </span>
                          )}
                          {summary.awaitingReviewCount > 0 && (
                            <span
                              title="Submitted and waiting for monitor review."
                              className="inline-flex rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700"
                            >
                              Pending {summary.awaitingReviewCount}
                            </span>
                          )}
                          {isUrgentRequirement(summary) && (
                            <span
                              title="Needs attention first."
                              className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700"
                            >
                              High Risk
                            </span>
                          )}
                          {!summary.hasComplianceRecord && !summary.hasAnySubmitted && (
                            <span
                              title="No compliance or indicator submission yet."
                              className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700"
                            >
                              No Submission
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            title="Last activity time"
                            className="inline-flex rounded-sm border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600"
                          >
                            {updatedLabel ? formatDateTime(updatedLabel) : "N/A"}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenSchool(summary)}
                            className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            <Building2 className="h-3.5 w-3.5" />
                            Open
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-600">
                  Page <span className="font-semibold text-slate-900">{safeRecordsPage}</span> of{" "}
                  <span className="font-semibold text-slate-900">{totalRecordPages}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRecordsPage((current) => Math.max(1, current - 1))}
                    disabled={safeRecordsPage <= 1}
                    className="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordsPage((current) => Math.min(totalRecordPages, current + 1))}
                    disabled={safeRecordsPage >= totalRecordPages}
                    className="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Next
                  </button>
                </div>
              </div>

              {showArchivedRecords && (
                <section className="border-t border-slate-200 bg-slate-50/60 px-5 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Archived Schools</h3>
                    <button
                      type="button"
                      onClick={() => void loadArchivedRecords()}
                      disabled={isArchivedRecordsLoading}
                      className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {isArchivedRecordsLoading ? "Loading..." : "Refresh"}
                    </button>
                  </div>

                  {isArchivedRecordsLoading ? (
                    <p className="mt-2 text-xs text-slate-600">Loading archived records...</p>
                  ) : archivedRecords.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-600">No archived school records.</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto rounded-sm border border-slate-200 bg-white">
                      <table className="min-w-full">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            <th className="px-3 py-2 text-left">School Code</th>
                            <th className="px-3 py-2 text-left">School Name</th>
                            <th className="px-3 py-2 text-left">Last Updated</th>
                            <th className="px-3 py-2 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {archivedRecords.map((record) => (
                            <tr key={`archived-${record.id}`}>
                              <td className="px-3 py-2 text-xs text-slate-700">{record.schoolId ?? record.schoolCode ?? "N/A"}</td>
                              <td className="px-3 py-2 text-xs text-slate-900">{record.schoolName}</td>
                              <td className="px-3 py-2 text-xs text-slate-600">{formatDateTime(record.lastUpdated)}</td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => void handleRestoreArchivedRecord(record)}
                                  disabled={isSaving}
                                  className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  Restore
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </section>
        <section
          id="monitor-school-learners"
          className={`surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden ${sectionFocusClass("monitor-school-learners")}`}
        >
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Learner Records</h2>
                <p className="mt-1 text-xs text-slate-600">Read-only learner checks by school, student, or teacher.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSchoolLearnerRecords((current) => !current)}
                className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                {showSchoolLearnerRecords ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showSchoolLearnerRecords ? "Hide Learner Records" : "Show Learner Records"}
              </button>
            </div>
          </div>
          {showSchoolLearnerRecords ? (
            <StudentRecordsPanel
              editable={false}
              showSchoolColumn
              schoolFilterKeys={filteredSchoolKeys}
              externalSearchTerm={studentRecordsLookupTerm}
              title="Student Records"
              description="Read-only learner checks and search."
              defaultAcademicYearFilter="all"
            />
          ) : (
            <div className="px-5 py-8 text-sm text-slate-500">
              Learner records are hidden. Use <span className="font-semibold text-slate-700">Show Learner Records</span> to open this panel.
            </div>
          )}
        </section>
        </>
      )}

      {!showNavigatorManual && schoolDrawerKey && activeTopNavigator !== "reviews" && (
        <button
          type="button"
          onClick={closeSchoolDrawer}
          className="fixed inset-0 z-[74] bg-slate-900/25"
          aria-label="Close school detail panel"
        />
      )}

      <aside
        style={
          activeTopNavigator === "reviews"
            ? undefined
            : { top: "var(--shell-sticky-top, 10rem)", height: "calc(100vh - var(--shell-sticky-top, 10rem))" }
        }
        className={
          activeTopNavigator === "reviews"
            ? !showNavigatorManual && schoolDrawerKey
              ? "surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden rounded-sm border border-slate-200 bg-white shadow-sm"
              : "hidden"
            : `fixed right-0 z-[75] w-[min(48rem,100vw)] border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ${
                !showNavigatorManual && schoolDrawerKey ? "translate-x-0" : "translate-x-full"
              }`
        }
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">School Detail</p>
            <p className="text-sm font-semibold text-slate-900">{schoolDetail?.schoolName ?? "No school selected"}</p>
          </div>
          <button
            type="button"
            onClick={closeSchoolDrawer}
            className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={activeTopNavigator === "reviews" ? "p-4" : "h-[calc(100%-3.5rem)] overflow-y-auto p-4"}>
          {schoolDetail ? (
            <div className="space-y-3">
              <article className="rounded-sm border border-slate-200 bg-white p-2.5">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="inline-flex rounded-sm border border-slate-200 bg-slate-50 p-1">
                    {([
                      { id: "snapshot", label: "Snapshot" },
                      { id: "submissions", label: "Submissions" },
                      { id: "history", label: "History" },
                    ] as Array<{ id: SchoolDrawerTab; label: string }>).map((tab) => (
                      <button
                        key={`school-drawer-tab-${tab.id}`}
                        type="button"
                        onClick={() => setActiveSchoolDrawerTab(tab.id)}
                        className={`rounded-sm px-2.5 py-1.5 text-xs font-semibold transition ${
                          activeSchoolDrawerTab === tab.id
                            ? "bg-primary-700 text-white"
                            : "text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={handleJumpToMissingIndicators}
                      disabled={missingDrawerIndicatorKeys.length === 0}
                      className="inline-flex items-center rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Jump to Missing {missingDrawerIndicatorKeys.length > 0 ? `(${missingDrawerIndicatorKeys.length})` : ""}
                    </button>
                    <button
                      type="button"
                      onClick={handleJumpToReturnedIndicators}
                      disabled={returnedDrawerIndicatorKeys.length === 0}
                      className="inline-flex items-center rounded-sm border border-primary-200 bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Jump to Returned {returnedDrawerIndicatorKeys.length > 0 ? `(${returnedDrawerIndicatorKeys.length})` : ""}
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-600">
                  {schoolDetail.schoolCode} | {schoolDetail.level} | {schoolDetail.type}
                </p>
              </article>

              {activeSchoolDrawerTab === "snapshot" && (
                <div className="space-y-3">
                  <article className="rounded-sm border border-slate-200 bg-white p-3">
                    {syncedCountsLoadingSchoolKey === schoolDetail.schoolKey ? (
                      <p className="text-[11px] text-slate-500">Refreshing synced totals...</p>
                    ) : syncedCountsError ? (
                      <p className="text-[11px] text-amber-700">{syncedCountsError}</p>
                    ) : null}
                    <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Compliance</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.hasComplianceRecord ? "Submitted" : "Missing"}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Package</p>
                        <p className="text-sm font-semibold text-slate-900">{workflowLabel(schoolDetail.indicatorStatus)}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Missing</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.missingCount.toLocaleString()}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">For Review</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.awaitingReviewCount.toLocaleString()}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Reported Students</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.reportedStudents.toLocaleString()}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Synced Students</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.synchronizedStudents.toLocaleString()}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Reported Teachers</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.reportedTeachers.toLocaleString()}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Synced Teachers</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.synchronizedTeachers.toLocaleString()}</p>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-sm border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Critical Alerts</p>
                      <p className="text-[11px] text-slate-500">
                        Last activity: {schoolDetail.lastActivityAt ? formatDateTime(schoolDetail.lastActivityAt) : "N/A"}
                      </p>
                    </div>
                    {schoolDrawerCriticalAlerts.length === 0 ? (
                      <div className="mt-2 rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-2 text-xs font-medium text-primary-700">
                        No critical alerts for this school.
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {schoolDrawerCriticalAlerts.map((alert) => (
                          <div
                            key={`school-critical-alert-${alert.id}`}
                            className={`rounded-sm border px-2.5 py-2 ${
                              alert.tone === "warning"
                                ? "border-amber-300 bg-amber-50 text-amber-800"
                                : "border-primary-200 bg-primary-50 text-primary-700"
                            }`}
                          >
                            <p className="text-xs font-semibold">{alert.title}</p>
                            <p className="mt-0.5 text-xs">{alert.detail}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                </div>
              )}

              {activeSchoolDrawerTab === "submissions" && (
                <div className="space-y-3">
                  <article className="rounded-sm border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Latest Package</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">Most recent indicator submission for this school.</p>
                      </div>
                      <div className="text-right text-[11px] text-slate-600">
                        <p>
                          Total packages: <span className="font-semibold text-slate-900">{schoolIndicatorPackageRows.length.toLocaleString()}</span>
                        </p>
                        {isSchoolDrawerSubmissionsLoading && <p className="text-primary-700">Syncing latest submissions...</p>}
                        {!isSchoolDrawerSubmissionsLoading && schoolDrawerSubmissionsError && (
                          <p className="text-rose-600">{schoolDrawerSubmissionsError}</p>
                        )}
                      </div>
                    </div>
                    {latestSchoolPackage ? (
                      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                        <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <p className="text-[11px] text-slate-600">Package</p>
                          <p className="text-sm font-semibold text-slate-900">#{latestSchoolPackage.id}</p>
                        </div>
                        <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <p className="text-[11px] text-slate-600">School Year</p>
                          <p className="text-sm font-semibold text-slate-900">{latestSchoolPackage.schoolYear}</p>
                        </div>
                        <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <p className="text-[11px] text-slate-600">Status</p>
                          <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${workflowTone(latestSchoolPackage.status)}`}>
                            {workflowLabel(latestSchoolPackage.status)}
                          </span>
                        </div>
                        <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <p className="text-[11px] text-slate-600">Compliance</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {latestSchoolPackage.complianceRatePercent === null
                              ? "N/A"
                              : `${latestSchoolPackage.complianceRatePercent.toFixed(2)}%`}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                        No indicator package submitted yet for this school.
                      </div>
                    )}
                  </article>

                  <article className="rounded-sm border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Submission Table</p>
                    {schoolIndicatorPackageRows.length === 0 ? (
                      <div className="mt-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                        No package history found.
                      </div>
                    ) : (
                      <div className="mt-2 overflow-x-auto rounded-sm border border-slate-200">
                        <table className="min-w-[720px] w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                              <th className="border border-slate-300 px-2 py-2 text-left">Package</th>
                              <th className="border border-slate-300 px-2 py-2 text-left">School Year</th>
                              <th className="border border-slate-300 px-2 py-2 text-left">Period</th>
                              <th className="border border-slate-300 px-2 py-2 text-center">Status</th>
                              <th className="border border-slate-300 px-2 py-2 text-right">Compliance</th>
                              <th className="border border-slate-300 px-2 py-2 text-left">Submitted</th>
                              <th className="border border-slate-300 px-2 py-2 text-left">Reviewed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {schoolIndicatorPackageRows.map((row) => (
                              <tr key={`monitor-school-package-${row.id}`} className="bg-white">
                                <td className="border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-900">#{row.id}</td>
                                <td className="border border-slate-300 px-2 py-2 text-xs text-slate-700">{row.schoolYear}</td>
                                <td className="border border-slate-300 px-2 py-2 text-xs text-slate-700">{row.reportingPeriod}</td>
                                <td className="border border-slate-300 px-2 py-2 text-center">
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${workflowTone(row.status)}`}>
                                    {workflowLabel(row.status)}
                                  </span>
                                </td>
                                <td className="border border-slate-300 px-2 py-2 text-right text-xs text-slate-700">
                                  {row.complianceRatePercent === null ? "N/A" : `${row.complianceRatePercent.toFixed(2)}%`}
                                </td>
                                <td className="border border-slate-300 px-2 py-2 text-xs text-slate-700">{row.submittedAt ? formatDateTime(row.submittedAt) : "N/A"}</td>
                                <td className="border border-slate-300 px-2 py-2 text-xs text-slate-700">{row.reviewedAt ? formatDateTime(row.reviewedAt) : "N/A"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </article>
                </div>
              )}

              {activeSchoolDrawerTab === "history" && (
                <article className="rounded-sm border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Indicator History</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Compact view. Hover or expand for full descriptions.</p>
                    </div>
                    <div className="text-right text-[11px] text-slate-600">
                      <p>
                        Latest package: <span className="font-semibold text-slate-900">{schoolIndicatorMatrix.latestSubmission ? `#${schoolIndicatorMatrix.latestSubmission.id}` : "N/A"}</span>
                      </p>
                      <p>
                        Focus year: <span className="font-semibold text-slate-900">{latestSchoolIndicatorYear || "N/A"}</span>
                      </p>
                    </div>
                  </div>

                  {schoolIndicatorMatrix.rows.length === 0 ? (
                    <div className="mt-3 rounded-sm border border-slate-200 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                      {isSchoolDrawerSubmissionsLoading
                        ? "Loading submitted indicators for this school..."
                        : schoolDrawerIndicatorSubmissions.length === 0
                        ? "No indicator package submitted yet for this school."
                        : "Indicator package exists, but no indicator rows were found in the latest submission."}
                    </div>
                  ) : (
                    <div className="mt-3 overflow-x-auto rounded-sm border border-slate-200">
                      <table className="min-w-[1080px] w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                            <th rowSpan={2} className="sticky left-0 z-20 min-w-[270px] border border-slate-300 bg-slate-100 px-2 py-2 text-left">
                              Indicators
                            </th>
                            {schoolIndicatorMatrix.years.map((year) => (
                              <th key={`monitor-indicator-year-${year}`} colSpan={2} className="border border-slate-300 px-2 py-2 text-center">
                                {year}
                              </th>
                            ))}
                          </tr>
                          <tr className="bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                            {schoolIndicatorMatrix.years.map((year) => (
                              <Fragment key={`monitor-indicator-year-columns-${year}`}>
                                <th className="border border-slate-300 px-2 py-2 text-center">Target</th>
                                <th className="border border-slate-300 px-2 py-2 text-center">Actual</th>
                              </Fragment>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {schoolIndicatorRowsByCategory.map((group) => (
                            <Fragment key={`monitor-indicator-category-${group.category}`}>
                              <tr className="bg-primary-50/70">
                                <td
                                  colSpan={schoolIndicatorMatrix.years.length * 2 + 1}
                                  className="border border-slate-300 px-3 py-2 text-xs font-bold uppercase tracking-wide text-primary-800"
                                >
                                  {group.category}
                                </td>
                              </tr>
                              {group.rows.map((row) => {
                                const rowId = `school-drawer-indicator-${sanitizeAnchorToken(row.key)}`;
                                const isExpanded = Boolean(expandedDrawerIndicatorRows[row.key]);
                                const shortLabel = truncateIndicatorDescription(row.label, 46);
                                const isHighlighted = highlightedDrawerIndicatorKey === row.key;
                                const isMissing = missingDrawerIndicatorKeySet.has(row.key);
                                const isReturned = returnedDrawerIndicatorKeySet.has(row.key);

                                return (
                                  <tr
                                    id={rowId}
                                    key={`monitor-indicator-row-${row.key}`}
                                    className={isHighlighted ? "bg-amber-50 transition-colors" : "bg-white"}
                                  >
                                    <td className="sticky left-0 z-10 min-w-[270px] border border-slate-300 bg-white px-2 py-2 align-top">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <button
                                          type="button"
                                          title={row.label}
                                          onClick={() => toggleDrawerIndicatorLabel(row.key)}
                                          className="text-left text-[12px] font-semibold leading-4 text-slate-900 hover:text-primary-700"
                                        >
                                          {isExpanded ? row.label : shortLabel}
                                        </button>
                                        {isMissing && (
                                          <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                            Missing
                                          </span>
                                        )}
                                        {isReturned && (
                                          <span className="inline-flex rounded-full border border-primary-300 bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">
                                            Returned
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => toggleDrawerIndicatorLabel(row.key)}
                                          className="rounded-sm border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100"
                                        >
                                          {isExpanded ? "Less" : "More"}
                                        </button>
                                      </div>
                                      <p className="mt-0.5 text-[10px] text-slate-500">{row.code}</p>
                                    </td>
                                    {schoolIndicatorMatrix.years.map((year) => {
                                      const values = row.valuesByYear[year] ?? { target: "", actual: "" };
                                      return (
                                        <Fragment key={`monitor-indicator-cell-${row.key}-${year}`}>
                                          <td className="border border-slate-300 bg-slate-50/40 px-2 py-2 text-center text-xs text-slate-700">
                                            {values.target || "-"}
                                          </td>
                                          <td className="border border-slate-300 bg-slate-50/40 px-2 py-2 text-center text-xs text-slate-700">
                                            {values.actual || "-"}
                                          </td>
                                        </Fragment>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Select a school to view details.
            </div>
          )}
        </div>
      </aside>

      <div
        style={{ top: "calc(var(--shell-sticky-top, 10rem) + 0.75rem)" }}
        className="pointer-events-none fixed right-4 z-[85] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <article
            key={toast.id}
            className={`pointer-events-auto rounded-sm border px-3 py-2 text-xs font-semibold shadow-lg ${
              toast.tone === "success"
                ? "border-primary-200 bg-primary-50 text-primary-700"
                : toast.tone === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p>{toast.message}</p>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded-sm border border-transparent p-0.5 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </article>
        ))}
      </div>
        </div>
      </div>
    </Shell>
  );
}














