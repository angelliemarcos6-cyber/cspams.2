import { useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
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
import { RegionCard } from "@/components/RegionCard";
import { StatusPieChart } from "@/components/charts/StatusPieChart";
import { RegionBarChart } from "@/components/charts/RegionBarChart";
import { SubmissionTrendChart } from "@/components/charts/SubmissionTrendChart";
import { MonitorIndicatorPanel } from "@/components/indicators/MonitorIndicatorPanel";
import { StudentRecordsPanel } from "@/components/students/StudentRecordsPanel";
import { useData } from "@/context/Data";
import { useIndicatorData } from "@/context/IndicatorData";
import { useStudentData } from "@/context/StudentData";
import type { IndicatorSubmission, SchoolRecord, SchoolStatus } from "@/types";
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
type MonitorTopNavigatorId = "action_queue" | "schools" | "compliance_review" | "student_records" | "reports";
type ScopeDropdownSlot = "schools" | "students" | "teachers";
type FilterChipId = "search" | "status" | "requirement" | "school" | "student" | "teacher";
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
  address: string;
  studentCount: string;
  teacherCount: string;
  status: SchoolStatus;
}

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

interface PersistedMonitorFilters {
  search?: string;
  statusFilter?: SchoolStatus | "all";
  requirementFilter?: RequirementFilter;
  schoolScopeKey?: string;
  studentLookupId?: string | null;
  teacherLookup?: string | null;
  activeTopNavigator?: MonitorTopNavigatorId;
}


const MONITOR_TOP_NAVIGATOR_ITEMS: MonitorTopNavigatorItem[] = [
  { id: "action_queue", label: "Action Queue" },
  { id: "schools", label: "Schools" },
  { id: "compliance_review", label: "Review" },
  { id: "student_records", label: "Students" },
  { id: "reports", label: "Reports" },
];

const MONITOR_NAVIGATOR_ICONS: Record<MonitorTopNavigatorItem["id"], NavigatorIcon> = {
  action_queue: ListChecks,
  schools: Building2,
  compliance_review: ClipboardList,
  student_records: Users,
  reports: LayoutDashboard,
};

const MONITOR_NAVIGATOR_MANUAL: ManualStep[] = [
  {
    id: "action_queue",
    title: "Action Queue",
    objective: "Handle schools that need immediate monitor action.",
    actions: [
      "Check Missing, Returned, and Waiting rows first.",
      "Use Review, Open School, or Send Reminder on each row.",
    ],
    doneWhen: "No urgent rows remain unassigned for action.",
  },
  {
    id: "schools",
    title: "Schools",
    objective: "Inspect school profile, status, and latest activity in one place.",
    actions: [
      "Review school profile and activity updates.",
      "Use row actions for follow-up without leaving the page.",
    ],
    doneWhen: "School details and latest updates are verified.",
  },
  {
    id: "compliance_review",
    title: "Compliance Review",
    objective: "Validate or return compliance submissions.",
    actions: [
      "Review pending packages and decide validate or return.",
      "Write clear notes when returning a submission.",
    ],
    doneWhen: "No pending submissions remain without a validation decision.",
  },
  {
    id: "student_records",
    title: "Student Records",
    objective: "Run read-only learner checks with quick search.",
    actions: [
      "Search learners by name or LRN.",
      "Confirm school and teacher assignments are synchronized.",
    ],
    doneWhen: "Learner records match expected school submissions.",
  },
  {
    id: "reports",
    title: "Reports",
    objective: "Check history and optional analytics only when needed.",
    actions: [
      "Review sync history and KPI snapshot.",
      "Open analytics only when deeper trend checking is required.",
    ],
    doneWhen: "History checks are complete and issues are documented.",
  },
];

const MONITOR_MANUAL_STATUS_GUIDE = [
  "Missing: Requirement not yet submitted by school.",
  "Waiting: Submitted and waiting for monitor review.",
  "Returned: Sent back to school head for correction.",
  "Submitted: School package has been sent to monitor.",
  "Validated: Approved and closed.",
];

const REQUIREMENT_FILTER_OPTIONS: Array<{ id: RequirementFilter; label: string }> = [
  { id: "all", label: "All statuses" },
  { id: "missing", label: "Missing" },
  { id: "waiting", label: "Waiting" },
  { id: "returned", label: "Returned" },
  { id: "submitted", label: "Submitted" },
  { id: "validated", label: "Validated" },
];

const MONITOR_QUICK_JUMPS: Record<MonitorTopNavigatorId, QuickJumpItem[]> = {
  action_queue: [
    { id: "filters_queue", label: "Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "queue_list", label: "Queue List", targetId: "monitor-requirements-table", icon: ListChecks },
  ],
  schools: [
    { id: "filters_schools", label: "Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "school_records", label: "School List", targetId: "monitor-school-records", icon: Building2 },
  ],
  compliance_review: [
    { id: "filters_review", label: "Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "indicators_queue", label: "Review Queue", targetId: "monitor-indicators-queue", icon: ClipboardList },
  ],
  student_records: [
    { id: "filters_students", label: "Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "student_records", label: "Learner List", targetId: "monitor-student-records", icon: Users },
  ],
  reports: [
    { id: "reports_summary", label: "Reports Summary", targetId: "monitor-overview-metrics", icon: LayoutDashboard },
    { id: "reports_analytics", label: "Show Analytics", targetId: "monitor-analytics-toggle", icon: TrendingUp },
  ],
};

const EMPTY_MONITOR_RECORD_FORM: MonitorRecordFormState = {
  schoolId: "",
  schoolName: "",
  level: "Elementary",
  type: "public",
  address: "",
  studentCount: "",
  teacherCount: "",
  status: "active",
};

const ALL_SCHOOL_SCOPE = "__all_schools__";
const MONITOR_FILTER_STORAGE_KEY = "cspams.monitor.filters.v1";
const SEARCH_DEBOUNCE_MS = 320;
const REQUIREMENT_PAGE_SIZE = 10;
const RECORD_PAGE_SIZE = 10;
const MOBILE_BREAKPOINT = 768;

function statusTone(status: SchoolStatus) {
  if (status === "active") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (status === "pending") return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
  return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
}

function schoolTypeLabel(value: string | null | undefined): string {
  if (!value) return "N/A";
  const normalized = value.toLowerCase();
  if (normalized === "public") return "Public";
  if (normalized === "private") return "Private";
  return value;
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
  if (status === "submitted") return "Waiting";
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

function isValidSchoolStatusFilter(value: string | null | undefined): value is SchoolStatus | "all" {
  return value === "all" || value === "active" || value === "inactive" || value === "pending";
}

function isValidMonitorTopNavigator(value: string | null | undefined): value is MonitorTopNavigatorId {
  return value === "action_queue" || value === "schools" || value === "compliance_review" || value === "student_records" || value === "reports";
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
  return `relative flex w-full items-center rounded-sm border-l-4 border-r border-y text-left text-xs font-semibold uppercase tracking-wide transition ${
    compact ? "justify-center px-2.5 py-2.5" : "gap-2.5 px-3 py-2.5"
  } ${
    active
      ? "border-l-primary-100 border-r-primary-300/90 border-y-primary-300/90 bg-primary-700 text-white shadow-[inset_0_0_0_1px_rgba(147,197,253,0.4),0_10px_18px_-16px_rgba(4,80,140,0.8)]"
      : "border-l-transparent border-r-primary-400/30 border-y-primary-400/30 bg-primary-900/45 text-primary-100 hover:border-r-primary-200/60 hover:border-y-primary-200/60 hover:bg-primary-700/80 hover:text-white"
  }`;
}

function normalizeSchoolKey(schoolCode: string | null | undefined, schoolName: string | null | undefined): string {
  const code = schoolCode?.trim().toLowerCase();
  if (code) return `code:${code}`;

  const name = schoolName?.trim().toLowerCase();
  if (name) return `name:${name}`;

  return "unknown";
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

export function MonitorDashboard() {
  const { records, targetsMet, syncAlerts, isLoading, isSaving, error, lastSyncedAt, syncScope, syncStatus, refreshRecords, addRecord, updateRecord, deleteRecord } = useData();
  const { submissions: indicatorSubmissions } = useIndicatorData();
  const { students } = useStudentData();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const [statusFilter, setStatusFilter] = useState<SchoolStatus | "all">("all");
  const [requirementFilter, setRequirementFilter] = useState<RequirementFilter>("all");
  const [selectedSchoolScopeKey, setSelectedSchoolScopeKey] = useState<string>(ALL_SCHOOL_SCOPE);
  const [schoolScopeQuery, setSchoolScopeQuery] = useState("");
  const [schoolScopeDropdownSlot, setSchoolScopeDropdownSlot] = useState<ScopeDropdownSlot | null>(null);
  const [studentLookupQuery, setStudentLookupQuery] = useState("");
  const [teacherLookupQuery, setTeacherLookupQuery] = useState("");
  const [selectedStudentLookup, setSelectedStudentLookup] = useState<StudentLookupOption | null>(null);
  const [selectedTeacherLookup, setSelectedTeacherLookup] = useState<string | null>(null);
  const [pendingStudentLookupId, setPendingStudentLookupId] = useState<string | null>(null);
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("lastUpdated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [activeTopNavigator, setActiveTopNavigator] = useState<MonitorTopNavigatorId>("action_queue");
  const [isNavigatorCompact, setIsNavigatorCompact] = useState(false);
  const [isNavigatorVisible, setIsNavigatorVisible] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 768,
  );
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < MOBILE_BREAKPOINT,
  );
  const [showNavigatorManual, setShowNavigatorManual] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showAdvancedAnalytics, setShowAdvancedAnalytics] = useState(false);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [requirementsPage, setRequirementsPage] = useState(1);
  const [recordsPage, setRecordsPage] = useState(1);
  const [schoolDrawerKey, setSchoolDrawerKey] = useState<string | null>(null);
  const [toasts, setToasts] = useState<DashboardToast[]>([]);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [recordForm, setRecordForm] = useState<MonitorRecordFormState>(EMPTY_MONITOR_RECORD_FORM);
  const [recordFormError, setRecordFormError] = useState("");
  const [recordFormMessage, setRecordFormMessage] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);

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
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const hasQueryFilters = ["q", "status", "workflow", "school", "student", "teacher", "tab"].some((key) =>
      params.has(key),
    );

    let persisted: PersistedMonitorFilters | null = null;

    if (hasQueryFilters) {
      persisted = {
        search: params.get("q") ?? "",
        statusFilter: (params.get("status") as SchoolStatus | "all" | null) ?? undefined,
        requirementFilter: (params.get("workflow") as RequirementFilter | null) ?? undefined,
        schoolScopeKey: params.get("school") ?? ALL_SCHOOL_SCOPE,
        studentLookupId: params.get("student"),
        teacherLookup: params.get("teacher"),
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
      if (persisted.schoolScopeKey) {
        setSelectedSchoolScopeKey(persisted.schoolScopeKey);
      }
      if (persisted.teacherLookup) {
        setSelectedTeacherLookup(persisted.teacherLookup);
        setTeacherLookupQuery(persisted.teacherLookup);
      }
      if (persisted.studentLookupId) {
        setPendingStudentLookupId(persisted.studentLookupId);
      }
      if (isValidMonitorTopNavigator(persisted.activeTopNavigator)) {
        setActiveTopNavigator(persisted.activeTopNavigator);
      }
    }

    setFiltersHydrated(true);
  }, []);

  useEffect(() => {
    if (!filtersHydrated || typeof window === "undefined") return;

    const payload: PersistedMonitorFilters = {
      search,
      statusFilter,
      requirementFilter,
      schoolScopeKey: selectedSchoolScopeKey,
      studentLookupId: selectedStudentLookup?.id ?? pendingStudentLookupId ?? null,
      teacherLookup: selectedTeacherLookup,
      activeTopNavigator,
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
    setOrDelete("school", selectedSchoolScopeKey !== ALL_SCHOOL_SCOPE ? selectedSchoolScopeKey : null);
    setOrDelete("student", selectedStudentLookup?.id ?? pendingStudentLookupId ?? null);
    setOrDelete("teacher", selectedTeacherLookup ?? null);
    setOrDelete("tab", activeTopNavigator !== "action_queue" ? activeTopNavigator : null);

    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [
    activeTopNavigator,
    filtersHydrated,
    pendingStudentLookupId,
    requirementFilter,
    search,
    selectedSchoolScopeKey,
    selectedStudentLookup?.id,
    selectedTeacherLookup,
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

  const resetRecordForm = () => {
    setEditingRecordId(null);
    setRecordForm(EMPTY_MONITOR_RECORD_FORM);
    setRecordFormError("");
    setRecordFormMessage("");
  };

  const openCreateRecordForm = () => {
    resetRecordForm();
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
      address: record.address ?? record.district ?? "",
      studentCount: String(record.studentCount ?? 0),
      teacherCount: String(record.teacherCount ?? 0),
      status: record.status,
    });
    setRecordFormError("");
    setRecordFormMessage("");
    setDeleteError("");
    setShowRecordForm(true);
    setActiveTopNavigator("schools");
  };

  const validateRecordForm = (): boolean => {
    const schoolId = recordForm.schoolId.trim();
    const schoolName = recordForm.schoolName.trim();
    const level = recordForm.level.trim();
    const address = recordForm.address.trim();
    const studentCount = Number(recordForm.studentCount);
    const teacherCount = Number(recordForm.teacherCount);

    if (!schoolId || !schoolName || !level || !address) {
      setRecordFormError("School ID, school name, level, and address are required.");
      return false;
    }

    if (!Number.isFinite(studentCount) || studentCount < 0 || !Number.isInteger(studentCount)) {
      setRecordFormError("Student count must be a non-negative whole number.");
      return false;
    }

    if (!Number.isFinite(teacherCount) || teacherCount < 0 || !Number.isInteger(teacherCount)) {
      setRecordFormError("Teacher count must be a non-negative whole number.");
      return false;
    }

    return true;
  };

  const handleRecordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRecordFormError("");
    setRecordFormMessage("");
    setDeleteError("");

    if (!validateRecordForm()) {
      return;
    }

    const payload = {
      schoolId: recordForm.schoolId.trim(),
      schoolName: recordForm.schoolName.trim(),
      level: recordForm.level.trim(),
      type: recordForm.type,
      address: recordForm.address.trim(),
      district: recordForm.address.trim(),
      region: "Santiago City, Isabela",
      studentCount: Number(recordForm.studentCount),
      teacherCount: Number(recordForm.teacherCount),
      status: recordForm.status,
    };

    try {
      if (editingRecordId) {
        await updateRecord(editingRecordId, payload);
        setRecordFormMessage("School record updated.");
      } else {
        await addRecord(payload);
        setRecordFormMessage("School record created.");
      }

      setTimeout(() => {
        closeRecordForm();
      }, 800);
    } catch (err) {
      setRecordFormError(err instanceof Error ? err.message : "Unable to save school record.");
    }
  };

  const handleDeleteRecord = async (record: SchoolRecord) => {
    setDeleteError("");
    setRecordFormMessage("");

    const schoolName = record.schoolName || "this school";
    const confirmed = window.confirm(`Delete ${schoolName}? This also removes related submissions and student records.`);
    if (!confirmed) {
      return;
    }

    setDeletingRecordId(record.id);
    try {
      await deleteRecord(record.id);
      if (editingRecordId === record.id) {
        closeRecordForm();
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Unable to delete school record.");
    } finally {
      setDeletingRecordId(null);
    }
  };

  const schoolScopeOptions = useMemo<SchoolScopeOption[]>(() => {
    const optionsByKey = new Map<string, SchoolScopeOption>();

    for (const record of records) {
      const key = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
      if (key === "unknown") continue;

      if (optionsByKey.has(key)) continue;

      optionsByKey.set(key, {
        key,
        code: (record.schoolId ?? record.schoolCode ?? "").trim() || "N/A",
        name: record.schoolName?.trim() || "Unknown School",
      });
    }

    return [...optionsByKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  const selectedSchoolScope = useMemo(
    () => schoolScopeOptions.find((option) => option.key === selectedSchoolScopeKey) ?? null,
    [selectedSchoolScopeKey, schoolScopeOptions],
  );

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

  const studentLookupOptions = useMemo<StudentLookupOption[]>(
    () =>
      scopedStudentPool
        .map((student) => ({
          id: student.id,
          lrn: student.lrn,
          fullName: student.fullName,
          schoolKey: normalizeSchoolKey(student.school?.schoolCode ?? null, student.school?.name ?? null),
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [scopedStudentPool],
  );

  const filteredStudentLookupOptions = useMemo(() => {
    const query = studentLookupQuery.trim().toLowerCase();
    if (!query) return studentLookupOptions;

    return studentLookupOptions.filter(
      (option) =>
        option.fullName.toLowerCase().includes(query) ||
        option.lrn.toLowerCase().includes(query),
    );
  }, [studentLookupOptions, studentLookupQuery]);

  const teacherLookupOptions = useMemo(
    () =>
      [...new Set(
        scopedStudentPool
          .map((student) => student.teacher?.trim() ?? "")
          .filter((value) => value.length > 0),
      )].sort((a, b) => a.localeCompare(b)),
    [scopedStudentPool],
  );

  const filteredTeacherLookupOptions = useMemo(() => {
    const query = teacherLookupQuery.trim().toLowerCase();
    if (!query) return teacherLookupOptions;
    return teacherLookupOptions.filter((name) => name.toLowerCase().includes(query));
  }, [teacherLookupOptions, teacherLookupQuery]);

  const selectedStudentLabel = selectedStudentLookup
    ? `${selectedStudentLookup.fullName} - ${selectedStudentLookup.lrn}`
    : "Find student (name or LRN)";
  const selectedTeacherLabel = selectedTeacherLookup ?? "Find teacher";
  const studentRecordsLookupTerm = selectedStudentLookup
    ? selectedStudentLookup.lrn
    : selectedTeacherLookup ?? "";

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
    if (!selectedTeacherLookup) return;
    if (teacherLookupOptions.includes(selectedTeacherLookup)) return;
    setSelectedTeacherLookup(null);
  }, [selectedTeacherLookup, teacherLookupOptions]);

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
    if (activeTopNavigator === "action_queue") {
      return ["all", "missing", "waiting", "returned"];
    }

    if (activeTopNavigator === "compliance_review" || activeTopNavigator === "reports") {
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

  const filteredRequirementRows = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();

    return scopedRequirementRows.filter((row) => {
      const record = scopedRecordBySchoolKey.get(row.schoolKey);
      const searchableText = [
        row.schoolName,
        row.schoolCode,
        row.region,
        record?.level ?? "",
        record?.type ?? "",
        record?.address ?? record?.district ?? "",
        record?.submittedBy ?? "",
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        query.length === 0 ||
        searchableText.includes(query);
      const matchesStatus = statusFilter === "all" || row.schoolStatus === statusFilter;
      const matchesRequirement = matchesRequirementFilter(row, requirementFilter);
      return matchesSearch && matchesStatus && matchesRequirement;
    });
  }, [scopedRequirementRows, scopedRecordBySchoolKey, debouncedSearch, statusFilter, requirementFilter]);

  const hasDashboardFilters = debouncedSearch.trim().length > 0 || statusFilter !== "all" || requirementFilter !== "all";
  const filteredSchoolKeys = useMemo(() => {
    if (!hasDashboardFilters && !scopedSchoolKeys) {
      return null;
    }

    return new Set(filteredRequirementRows.map((row) => row.schoolKey));
  }, [filteredRequirementRows, hasDashboardFilters, scopedSchoolKeys]);

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
      filteredRequirementRows.filter(
        (row) => row.missingCount > 0 || row.awaitingReviewCount > 0 || row.indicatorStatus === "returned",
      ),
    [filteredRequirementRows],
  );
  const showSubmissionFilters = !isMobileViewport || showAdvancedFilters;
  const returnedCount = requirementCounts.returned;
  const submittedCount = requirementCounts.submittedAny;
  const shouldRenderNavigatorItems = isMobileViewport ? isNavigatorVisible : true;
  const navigatorBadges = useMemo<
    Record<MonitorTopNavigatorId, { primary?: number; secondary?: number; urgency: "none" | "high" | "medium" }>
  >(
    () => ({
      action_queue: {
        primary: needsActionCount,
        urgency: requirementCounts.missing > 0 ? "high" : needsActionCount > 0 ? "medium" : "none",
      },
      schools: { urgency: "none" },
      compliance_review: {
        primary: requirementCounts.awaitingReview,
        secondary: requirementCounts.returned,
        urgency: requirementCounts.returned > 0 ? "high" : requirementCounts.awaitingReview > 0 ? "medium" : "none",
      },
      student_records: { urgency: "none" },
      reports: { urgency: "none" },
    }),
    [needsActionCount, requirementCounts.awaitingReview, requirementCounts.missing, requirementCounts.returned],
  );
  const quickJumpItems = useMemo(
    () => MONITOR_QUICK_JUMPS[activeTopNavigator] ?? [],
    [activeTopNavigator],
  );

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

  const filteredRecords = useMemo(() => {
    const base = filteredSchoolKeys
      ? scopedRecords.filter((record) =>
          filteredSchoolKeys.has(normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName)),
        )
      : scopedRecords;

    return [...base].sort((a, b) => compareRecords(a, b, sortColumn, sortDirection));
  }, [scopedRecords, filteredSchoolKeys, sortColumn, sortDirection]);

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

  const totalRequirementPages = Math.max(1, Math.ceil(actionQueueRows.length / REQUIREMENT_PAGE_SIZE));
  const safeRequirementsPage = Math.min(requirementsPage, totalRequirementPages);
  const paginatedRequirementRows = useMemo(() => {
    const start = (safeRequirementsPage - 1) * REQUIREMENT_PAGE_SIZE;
    return actionQueueRows.slice(start, start + REQUIREMENT_PAGE_SIZE);
  }, [actionQueueRows, safeRequirementsPage]);

  const totalRecordPages = Math.max(1, Math.ceil(filteredRecords.length / RECORD_PAGE_SIZE));
  const safeRecordsPage = Math.min(recordsPage, totalRecordPages);
  const paginatedRecords = useMemo(() => {
    const start = (safeRecordsPage - 1) * RECORD_PAGE_SIZE;
    return filteredRecords.slice(start, start + RECORD_PAGE_SIZE);
  }, [filteredRecords, safeRecordsPage]);

  const schoolDetail = useMemo<SchoolDetailSnapshot | null>(() => {
    if (!schoolDrawerKey) return null;

    const summary = schoolRequirementByKey.get(schoolDrawerKey);
    const record = recordBySchoolKey.get(schoolDrawerKey);
    const studentStats = studentStatsBySchoolKey.get(schoolDrawerKey);

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
      synchronizedStudents: studentStats?.students ?? 0,
      synchronizedTeachers: studentStats?.teachers.size ?? 0,
    };
  }, [schoolDrawerKey, schoolRequirementByKey, recordBySchoolKey, studentStatsBySchoolKey]);

  const activeFilterChips = useMemo<Array<{ id: FilterChipId; label: string }>>(() => {
    const chips: Array<{ id: FilterChipId; label: string }> = [];

    if (search.trim()) chips.push({ id: "search", label: `Search: ${search.trim()}` });
    if (statusFilter !== "all") chips.push({ id: "status", label: `Status: ${statusLabel(statusFilter)}` });
    if (requirementFilter !== "all") chips.push({ id: "requirement", label: `Queue: ${requirementFilterLabel(requirementFilter)}` });
    if (selectedSchoolScope) chips.push({ id: "school", label: `School: ${selectedSchoolScope.code}` });
    if (selectedStudentLookup) chips.push({ id: "student", label: `Student: ${selectedStudentLookup.fullName}` });
    if (selectedTeacherLookup) chips.push({ id: "teacher", label: `Teacher: ${selectedTeacherLookup}` });

    return chips;
  }, [
    requirementFilter,
    search,
    selectedSchoolScope,
    selectedStudentLookup,
    selectedTeacherLookup,
    statusFilter,
  ]);

  useEffect(() => {
    setRequirementsPage(1);
    setRecordsPage(1);
  }, [
    search,
    statusFilter,
    requirementFilter,
    selectedSchoolScopeKey,
    selectedStudentLookup?.id,
    selectedTeacherLookup,
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
    setRequirementFilter("all");
    setSelectedSchoolScopeKey(ALL_SCHOOL_SCOPE);
    setSelectedStudentLookup(null);
    setPendingStudentLookupId(null);
    setSelectedTeacherLookup(null);
    setSchoolScopeQuery("");
    setStudentLookupQuery("");
    setTeacherLookupQuery("");
    setSchoolScopeDropdownSlot(null);
  };

  const resetQueueFilters = () => {
    setRequirementFilter("all");
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
      case "school":
        setSelectedSchoolScopeKey(ALL_SCHOOL_SCOPE);
        break;
      case "student":
        setSelectedStudentLookup(null);
        setPendingStudentLookupId(null);
        setStudentLookupQuery("");
        break;
      case "teacher":
        setSelectedTeacherLookup(null);
        setTeacherLookupQuery("");
        break;
      default:
        break;
    }
  };

  const openSchoolDrawer = (schoolKey: string) => {
    setSchoolDrawerKey(schoolKey);
  };

  const closeSchoolDrawer = () => {
    setSchoolDrawerKey(null);
  };

  const handleReviewSchool = (summary: SchoolRequirementSummary) => {
    setSelectedSchoolScopeKey(summary.schoolKey);
    setSelectedStudentLookup(null);
    setSelectedTeacherLookup(null);
    setSchoolScopeDropdownSlot(null);

    if (summary.missingCount > 0) {
      setRequirementFilter("missing");
    } else if (summary.indicatorStatus === "returned") {
      setRequirementFilter("returned");
    } else if (summary.awaitingReviewCount > 0) {
      setRequirementFilter("waiting");
    } else {
      setRequirementFilter("all");
    }

    setActiveTopNavigator("compliance_review");
    pushToast(`Review opened for ${summary.schoolName}.`, "info");
  };

  const handleOpenSchool = (summary: SchoolRequirementSummary) => {
    setSelectedSchoolScopeKey(summary.schoolKey);
    openSchoolDrawer(summary.schoolKey);
    pushToast(`Opened school details for ${summary.schoolName}.`, "info");
  };

  const handleSendReminder = (summary: SchoolRequirementSummary) => {
    pushToast(`Reminder sent to ${summary.schoolName}.`, "success");
  };

  const handleReviewRecord = (record: SchoolRecord) => {
    const schoolKey = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
    if (schoolKey === "unknown") return;
    const summary = schoolRequirementByKey.get(schoolKey);

    if (summary) {
      handleReviewSchool(summary);
      return;
    }

    setSelectedSchoolScopeKey(schoolKey);
    setActiveTopNavigator("compliance_review");
    pushToast(`Review opened for ${record.schoolName}.`, "info");
  };

  const handleOpenSchoolRecord = (record: SchoolRecord) => {
    const schoolKey = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
    if (schoolKey === "unknown") return;
    setSelectedSchoolScopeKey(schoolKey);
    openSchoolDrawer(schoolKey);
    pushToast(`Opened school details for ${record.schoolName}.`, "info");
  };

  const handleSendReminderRecord = (record: SchoolRecord) => {
    pushToast(`Reminder sent to ${record.schoolName}.`, "success");
  };

  const handleContinuePendingRequirements = () => {
    if (requirementCounts.missing > 0) {
      setRequirementFilter("missing");
      setActiveTopNavigator("action_queue");
      return;
    }

    if (requirementCounts.returned > 0) {
      setRequirementFilter("returned");
      setActiveTopNavigator("compliance_review");
      return;
    }

    if (requirementCounts.awaitingReview > 0) {
      setRequirementFilter("waiting");
      setActiveTopNavigator("compliance_review");
      return;
    }

    setRequirementFilter("all");
    setActiveTopNavigator("schools");
  };

  const nextStep = useMemo(() => {
    if (requirementCounts.missing > 0) {
      return {
        label: "Open Action Queue",
        detail: "Review schools with missing submissions and send follow-up.",
        action: "action_queue_missing" as const,
      };
    }

    if (requirementCounts.returned > 0) {
      return {
        label: "Open Compliance Review",
        detail: "Review returned submissions and wait for corrected resubmissions.",
        action: "compliance_returned" as const,
      };
    }

    if (requirementCounts.awaitingReview > 0) {
      return {
        label: "Open Compliance Review",
        detail: "Validate pending indicator packages.",
        action: "compliance_pending" as const,
      };
    }

    return {
      label: "Open Schools",
      detail: "Audit synchronized school and learner records for final checks.",
      action: "schools" as const,
    };
  }, [requirementCounts.awaitingReview, requirementCounts.missing, requirementCounts.returned]);

  const handleNextStepAction = () => {
    if (nextStep.action === "action_queue_missing") {
      setRequirementFilter("missing");
      setActiveTopNavigator("action_queue");
      return;
    }

    if (nextStep.action === "compliance_returned") {
      setRequirementFilter("returned");
      setActiveTopNavigator("compliance_review");
      return;
    }

    if (nextStep.action === "compliance_pending") {
      setRequirementFilter("waiting");
      setActiveTopNavigator("compliance_review");
      return;
    }

    setRequirementFilter("all");
    setActiveTopNavigator("schools");
  };

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  };

  const openStudentRecordsFromCard = () => {
    setActiveTopNavigator("student_records");

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        focusAndScrollTo("monitor-student-records");
      }, 50);
    }
  };

  const renderSchoolScopeSelector = () => {
    const isOpen = schoolScopeDropdownSlot === "schools";

    return (
      <div className="relative mt-3">
        <button
          type="button"
          onClick={() => setSchoolScopeDropdownSlot((current) => (current === "schools" ? null : "schools"))}
          className="inline-flex w-full items-center justify-between gap-2 border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
        >
          <span className="truncate">
            {selectedSchoolScope ? `${selectedSchoolScope.code} - ${selectedSchoolScope.name}` : "All schools"}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`} />
        </button>
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

  const renderStudentLookupSelector = () => {
    const isOpen = schoolScopeDropdownSlot === "students";

    return (
      <div className="relative mt-3">
        <button
          type="button"
          onClick={() => setSchoolScopeDropdownSlot((current) => (current === "students" ? null : "students"))}
          className="inline-flex w-full items-center justify-between gap-2 border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
        >
          <span className="truncate">{selectedStudentLabel}</span>
          <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`} />
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
                  placeholder="Type student name or LRN"
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

  const renderTeacherLookupSelector = () => {
    const isOpen = schoolScopeDropdownSlot === "teachers";

    return (
      <div className="relative mt-3">
        <button
          type="button"
          onClick={() => setSchoolScopeDropdownSlot((current) => (current === "teachers" ? null : "teachers"))}
          className="inline-flex w-full items-center justify-between gap-2 border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
        >
          <span className="truncate">{selectedTeacherLabel}</span>
          <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`} />
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
                  placeholder="Type teacher name"
                  className="w-full border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedTeacherLookup(null);
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
              {filteredTeacherLookupOptions.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setSelectedTeacherLookup(name);
                    setSelectedStudentLookup(null);
                    setPendingStudentLookupId(null);
                    setTeacherLookupQuery(name);
                    setSchoolScopeDropdownSlot(null);
                    openStudentRecordsFromCard();
                  }}
                  className={`block w-full px-2.5 py-1.5 text-left text-xs transition ${
                    selectedTeacherLookup === name
                      ? "bg-primary-50 text-primary-800"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="font-semibold">{name}</span>
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

  const quickFiltersPanelContent = (
    <>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find school by name, code, address, level, or region"
            className="w-full rounded-sm border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
          />
        </div>

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

        <label className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={requirementFilter}
            onChange={(event) => setRequirementFilter(event.target.value as RequirementFilter)}
            className="border-none bg-transparent text-sm font-medium text-slate-700 outline-none"
          >
            {visibleRequirementFilterOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <article className="border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-slate-700">Which school</p>
          {renderSchoolScopeSelector()}
        </article>
        <article className="border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-slate-700">Find a student</p>
          {renderStudentLookupSelector()}
        </article>
        <article className="border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-slate-700">Find a teacher</p>
          {renderTeacherLookupSelector()}
        </article>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
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
        {activeFilterChips.length > 0 && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
          >
            Clear all
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-600">
        Showing <span className="font-semibold text-slate-900">{filteredRequirementRows.length}</span> of{" "}
        <span className="font-semibold text-slate-900">{scopedRequirementRows.length}</span> schools in scope.
        {" "}
        Queue rows: <span className="font-semibold text-slate-900">{actionQueueRows.length}</span>.
      </p>
    </>
  );

  return (
    <Shell
      title="Division Monitor Dashboard"
      subtitle="Action queue, schools, compliance review, student records, and reports."
      actions={
        <>
          <button
            type="button"
            onClick={() => void refreshRecords()}
            className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleContinuePendingRequirements}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-600"
          >
            <ListChecks className="h-3.5 w-3.5" />
            Continue Pending Requirements
          </button>
          <button
            type="button"
            onClick={openCreateRecordForm}
            className="inline-flex items-center gap-2 rounded-sm border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <Database className="h-3.5 w-3.5" />
            Add School Record
          </button>
          <span className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            {syncStatus === "up_to_date" ? "No backend changes" : "Records updated"}
            {" | "}
            {lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : "Not synced yet"}
            {syncScope ? ` (${syncScope})` : ""}
          </span>
        </>
      }
    >
      {error && (
        <section className="mb-5 border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
          {error}
        </section>
      )}

      <div className={`dashboard-left-layout mb-5 lg:grid lg:items-stretch lg:gap-0 ${isNavigatorCompact ? "lg:grid-cols-[5.25rem_minmax(0,1fr)]" : "lg:grid-cols-[17rem_minmax(0,1fr)]"}`}>
        <aside className="dashboard-side-rail rounded-sm p-3 lg:self-stretch lg:min-h-full lg:rounded-none">
          <div className="flex min-h-full flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className={isNavigatorCompact ? "w-full text-center" : ""}>
                <div className={`flex items-center ${isNavigatorCompact ? "justify-center" : "gap-2"}`}>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-white">Navigator</h2>
                  <button
                    type="button"
                    onClick={() => {
                      if (isMobileViewport) {
                        setIsNavigatorVisible((current) => !current);
                        return;
                      }
                      setIsNavigatorCompact((current) => !current);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-primary-400/40 bg-primary-700/65 text-white transition hover:bg-primary-700"
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
                  </button>
                </div>
                {!isNavigatorCompact && (
                  <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-primary-100">Division Monitor</p>
                )}
              </div>
            </div>

            {shouldRenderNavigatorItems && (
              <div className={`mt-4 grid ${isNavigatorCompact ? "gap-2" : "gap-2.5"}`}>
                {MONITOR_TOP_NAVIGATOR_ITEMS.map((item) => {
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
                      onClick={() => setActiveTopNavigator(item.id)}
                      className={navigatorButtonClass(isActive, isNavigatorCompact)}
                      title={item.label}
                    >
                      <span className="relative inline-flex h-4 w-4 items-center justify-center">
                        <Icon className="h-4 w-4" />
                        {meta.urgency !== "none" && <span className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${urgencyTone}`} />}
                      </span>
                      {!isNavigatorCompact && <span className="truncate">{item.label}</span>}

                      {!isNavigatorCompact && hasPrimaryBadge && (
                        <span className="ml-auto inline-flex items-center gap-1">
                          <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-sm border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">
                            {meta.primary}
                          </span>
                          {item.id === "compliance_review" && hasSecondaryBadge && (
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
            )}

            {shouldRenderNavigatorItems && (
              <div className={`mt-3 border-t border-primary-400/30 pt-3 ${isNavigatorCompact ? "flex justify-center" : ""}`}>
                <button
                  type="button"
                  onClick={() => setShowNavigatorManual((current) => !current)}
                  className={`inline-flex items-center gap-1.5 rounded-sm border border-primary-400/40 bg-primary-700/65 text-white transition hover:bg-primary-700 ${
                    isNavigatorCompact ? "h-8 w-8 justify-center p-0" : "w-full px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
                  }`}
                  title="User Manual"
                  aria-label="Open user manual"
                >
                  <BookOpenText className="h-3.5 w-3.5" />
                  {!isNavigatorCompact && <span>Help</span>}
                </button>
              </div>
            )}
          </div>
        </aside>
        <div className="dashboard-main-pane mt-4 lg:mt-0 lg:pl-5">
          {showNavigatorManual && (
            <>
            <button
              type="button"
              onClick={() => setShowNavigatorManual(false)}
              className="fixed inset-0 z-[65] bg-slate-900/20"
              aria-label="Close manual overlay"
            />
            <aside className="fixed right-4 top-24 z-[70] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-sm border border-slate-200 bg-white shadow-2xl animate-fade-slide">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Monitor Navigator Manual</p>
                <button
                  type="button"
                  onClick={() => setShowNavigatorManual(false)}
                  className="inline-flex items-center rounded-sm border border-slate-200 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
                  aria-label="Close manual"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="max-h-[72vh] overflow-y-auto p-3">
                <ol className="grid gap-2">
                  {MONITOR_NAVIGATOR_MANUAL.map((step, index) => (
                    <li key={step.id} className="dashboard-subtle-panel p-2.5">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-primary-100 text-[10px] text-primary-700">
                          {index + 1}
                        </span>
                        {step.title}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-700">Goal: {step.objective}</p>
                      <ul className="mt-1 space-y-1">
                        {step.actions.map((action) => (
                          <li key={`${step.id}-${action}`} className="text-xs text-slate-600">
                            - {action}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[11px] text-primary-700">Done when: {step.doneWhen}</p>
                    </li>
                  ))}
                </ol>
                <article className="dashboard-subtle-panel mt-3 p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Workflow Status Guide</p>
                  <ul className="mt-1 space-y-1">
                    {MONITOR_MANUAL_STATUS_GUIDE.map((item) => (
                      <li key={item} className="text-xs text-slate-600">
                        - {item}
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            </aside>
            </>
          )}

          <aside className="fixed bottom-4 right-4 z-[60] w-[min(24rem,calc(100vw-1rem))] border border-primary-200 bg-white p-3 shadow-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">Next Step</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{nextStep.label}</p>
            <p className="mt-1 text-xs text-slate-600">{nextStep.detail}</p>
            <button
              type="button"
              onClick={handleNextStepAction}
              className="mt-3 inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-600"
            >
              Continue
            </button>
          </aside>

          <section className="dashboard-workflow-hero mb-5 rounded-sm p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                {quickJumpItems.length > 0 && (
                  <div className="mt-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quick Jump</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {quickJumpItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={`monitor-quick-jump-${item.id}`}
                            type="button"
                            onClick={() => focusAndScrollTo(item.targetId)}
                            className="dashboard-quick-jump-btn rounded-sm"
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {activeTopNavigator === "reports" && (
                    <button
                      id="monitor-analytics-toggle"
                      type="button"
                      onClick={() => setShowAdvancedAnalytics((current) => !current)}
                      className="dashboard-quick-jump-btn rounded-sm"
                    >
                      {showAdvancedAnalytics ? "Hide Advanced Analytics" : "Show Advanced Analytics"}
                    </button>
                  )}
                  {isMobileViewport && (
                    <button
                      id="monitor-submission-filters-toggle"
                      type="button"
                      onClick={() => setShowAdvancedFilters((current) => !current)}
                      className="dashboard-quick-jump-btn rounded-sm"
                    >
                      {showAdvancedFilters ? "Hide Filters" : "Show Filters"}
                    </button>
                  )}
                </div>
              </div>

            </div>
          </section>

          {showSubmissionFilters && !isMobileViewport && (
            <section id="monitor-submission-filters" className={`dashboard-shell mb-5 rounded-sm p-3 ${sectionFocusClass("monitor-submission-filters")}`}>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Global Filter Bar</h2>
              <p className="mt-1 text-xs text-slate-600">Use one search and filter set across all monitor pages.</p>
              {quickFiltersPanelContent}
            </section>
          )}

          {showSubmissionFilters && isMobileViewport && (
            <>
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(false)}
                className="fixed inset-0 z-[72] bg-slate-900/40"
                aria-label="Close quick filters"
              />
              <section className="fixed inset-x-0 bottom-0 z-[73] max-h-[84vh] overflow-y-auto rounded-t-sm border border-slate-200 bg-white p-4 shadow-2xl animate-fade-slide">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Global Filter Bar</h2>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedFilters(false)}
                    className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-600">Use one search and filter set across all monitor pages.</p>
                {quickFiltersPanelContent}
              </section>
            </>
          )}

          {isMobileViewport && !showAdvancedFilters && activeFilterChips.length > 0 && (
            <section className="dashboard-shell mb-5 rounded-sm border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Active Filters</p>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700"
                >
                  Clear all
                </button>
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {activeFilterChips.map((chip) => (
                  <button
                    key={`mobile-chip-${chip.id}`}
                    type="button"
                    onClick={() => clearFilterChip(chip.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                  >
                    {chip.label}
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </section>
          )}

      {activeTopNavigator === "reports" && (
        <>
          <section id="monitor-overview-metrics" className={`animate-fade-slide grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${sectionFocusClass("monitor-overview-metrics")}`}>
            <StatCard label="Needs Action" value={needsActionCount.toLocaleString()} icon={<AlertTriangle className="h-5 w-5" />} tone="warning" />
            <StatCard label="Returned" value={returnedCount.toLocaleString()} icon={<ArrowDown className="h-5 w-5" />} tone="warning" />
            <StatCard label="Submitted" value={submittedCount.toLocaleString()} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
          </section>

          {showAdvancedAnalytics && (
            <>
          <section id="monitor-targets-snapshot" className={`mt-5 animate-fade-slide grid gap-4 xl:grid-cols-[1.4fr_1fr] ${sectionFocusClass("monitor-targets-snapshot")}`}>
            <div id="monitor-sync-alerts" className={`surface-panel dashboard-shell p-5 ${sectionFocusClass("monitor-sync-alerts")}`}>
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

            <div className="surface-panel dashboard-shell p-5">
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
          </section>

          <section className="mt-5 animate-fade-slide grid gap-4 xl:grid-cols-3">
            <div id="monitor-status-chart" className={sectionFocusClass("monitor-status-chart")}>
              <StatusPieChart data={statusDistribution} />
            </div>
            <div id="monitor-region-chart" className={sectionFocusClass("monitor-region-chart")}>
              <RegionBarChart data={regionAggregates} />
            </div>
            <div id="monitor-trend-chart" className={sectionFocusClass("monitor-trend-chart")}>
              <SubmissionTrendChart data={submissionTrend} />
            </div>
          </section>

          {regionAggregates.length > 0 && (
            <section id="monitor-regional-cards" className={`mt-5 animate-fade-slide ${sectionFocusClass("monitor-regional-cards")}`}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Regional Monitoring Cards</h2>
                <span className="text-xs text-slate-500">{regionAggregates.length} region entries</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {regionAggregates.map((region) => (
                  <RegionCard
                    key={region.region}
                    region={region.region}
                    schools={region.schools}
                    activeSchools={region.activeSchools}
                    students={region.students}
                    teachers={region.teachers}
                  />
                ))}
              </div>
            </section>
          )}
            </>
          )}
        </>
      )}

      {activeTopNavigator === "action_queue" && (
        <>
          <section id="monitor-action-queue" className={`dashboard-shell mb-5 rounded-sm p-4 ${sectionFocusClass("monitor-action-queue")}`}>
            <h2 className="text-base font-bold text-slate-900">Action Queue</h2>
            <p className="mt-1 text-xs text-slate-600">Missing, Returned, and Waiting schools.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard label="Needs Action" value={needsActionCount.toLocaleString()} icon={<AlertTriangle className="h-5 w-5" />} tone="warning" />
              <StatCard label="Returned" value={returnedCount.toLocaleString()} icon={<ArrowDown className="h-5 w-5" />} tone="warning" />
              <StatCard label="Submitted" value={submittedCount.toLocaleString()} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
            </div>
          </section>

          <section id="monitor-requirements-table" className={`surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden ${sectionFocusClass("monitor-requirements-table")}`}>
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">Queue List</h2>
            </div>

            {paginatedRequirementRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-5 py-14 text-slate-500">
                <AlertCircle className="h-9 w-9 text-slate-400" />
                <p className="text-sm font-semibold">No Missing, Returned, or Waiting schools found.</p>
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
                    <article key={row.schoolKey} className={`rounded-sm border border-slate-200 bg-white p-3 ${isUrgentRequirement(row) ? urgencyRowTone(row) : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{row.schoolName}</p>
                          <p className="text-xs text-slate-500">{row.schoolCode} - {row.region}</p>
                        </div>
                        <span className="text-xs font-semibold text-slate-700">Missing: {row.missingCount}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${row.hasComplianceRecord ? "bg-primary-100 text-primary-700" : "bg-slate-100 text-slate-700"}`}>
                          {row.hasComplianceRecord ? "Compliance Submitted" : "Compliance Missing"}
                        </span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${workflowTone(row.indicatorStatus)}`}>
                          {workflowLabel(row.indicatorStatus)}
                        </span>
                        <span className="text-slate-600">Waiting: {row.awaitingReviewCount}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
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
                          className="inline-flex items-center justify-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-700"
                        >
                          <BellRing className="h-3.5 w-3.5" />
                          Send Reminder
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
                        <th className="px-2 py-2 text-center">Waiting</th>
                        <th className="px-2 py-2 text-left">Last Activity</th>
                        <th className="px-2 py-2 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedRequirementRows.map((row) => (
                        <tr key={row.schoolKey} className={`${isUrgentRequirement(row) ? urgencyRowTone(row) : "dashboard-table-row"}`}>
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
                          <td className="px-2 py-2 text-sm text-slate-600">
                            {row.lastActivityAt ? formatDateTime(row.lastActivityAt) : "N/A"}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleReviewSchool(row)}
                                className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Review
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenSchool(row)}
                                className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                              >
                                <Building2 className="h-3.5 w-3.5" />
                                Open School
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSendReminder(row)}
                                className="inline-flex items-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700"
                              >
                                <BellRing className="h-3.5 w-3.5" />
                                Send Reminder
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

            {actionQueueRows.length > 0 && (
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
        </>
      )}

      {activeTopNavigator === "compliance_review" && (
        <section id="monitor-indicators-queue" className={sectionFocusClass("monitor-indicators-queue")}>
          <MonitorIndicatorPanel schoolFilterKeys={filteredSchoolKeys} onToast={pushToast} />
        </section>
      )}

      {activeTopNavigator === "schools" && (
        <>
        <section id="monitor-school-records" className={`surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden ${sectionFocusClass("monitor-school-records")}`}>
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">Schools</h2>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
            <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
              Showing {paginatedRecords.length} of {filteredRecords.length}
            </div>
            <p className="text-xs text-slate-500">Global filters are applied to this list.</p>
          </div>

          {deleteError && (
            <div className="mx-5 mt-4 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
              {deleteError}
            </div>
          )}

          {showRecordForm && (
            <section className="mx-5 mt-4 overflow-hidden rounded-sm border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{editingRecordId ? "Edit School Record" : "Add School Record"}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">School ID, school name, level, type, and address are required.</p>
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
                    School ID
                  </label>
                  <input
                    id="monitor-school-id"
                    type="text"
                    value={recordForm.schoolId}
                    onChange={(event) => setRecordForm((current) => ({ ...current, schoolId: event.target.value }))}
                    className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div>
                  <label htmlFor="monitor-school-name" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    School Name
                  </label>
                  <input
                    id="monitor-school-name"
                    type="text"
                    value={recordForm.schoolName}
                    onChange={(event) => setRecordForm((current) => ({ ...current, schoolName: event.target.value }))}
                    className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div>
                  <label htmlFor="monitor-level" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Level
                  </label>
                  <input
                    id="monitor-level"
                    type="text"
                    value={recordForm.level}
                    onChange={(event) => setRecordForm((current) => ({ ...current, level: event.target.value }))}
                    className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div>
                  <label htmlFor="monitor-type" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Type
                  </label>
                  <select
                    id="monitor-type"
                    value={recordForm.type}
                    onChange={(event) => setRecordForm((current) => ({ ...current, type: event.target.value as "public" | "private" }))}
                    className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <div className="md:col-span-2 xl:col-span-4">
                  <label htmlFor="monitor-address" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Address
                  </label>
                  <input
                    id="monitor-address"
                    type="text"
                    value={recordForm.address}
                    onChange={(event) => setRecordForm((current) => ({ ...current, address: event.target.value }))}
                    className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div>
                  <label htmlFor="monitor-students" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Students
                  </label>
                  <input
                    id="monitor-students"
                    type="number"
                    min={0}
                    step={1}
                    value={recordForm.studentCount}
                    onChange={(event) => setRecordForm((current) => ({ ...current, studentCount: event.target.value }))}
                    className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div>
                  <label htmlFor="monitor-teachers" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Teachers
                  </label>
                  <input
                    id="monitor-teachers"
                    type="number"
                    min={0}
                    step={1}
                    value={recordForm.teacherCount}
                    onChange={(event) => setRecordForm((current) => ({ ...current, teacherCount: event.target.value }))}
                    className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div>
                  <label htmlFor="monitor-status" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Status
                  </label>
                  <select
                    id="monitor-status"
                    value={recordForm.status}
                    onChange={(event) => setRecordForm((current) => ({ ...current, status: event.target.value as SchoolStatus }))}
                    className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
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
          ) : filteredRecords.length === 0 ? (
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
              <div className="space-y-3 px-4 py-4 md:hidden">
                {paginatedRecords.map((record) => {
                  const schoolKey = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
                  const summary = schoolRequirementByKey.get(schoolKey);
                  const urgent = summary ? isUrgentRequirement(summary) : false;

                  return (
                    <article key={record.id} className={`rounded-sm border border-slate-200 bg-white p-3 ${urgent && summary ? urgencyRowTone(summary) : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{record.schoolName}</p>
                          <p className="text-xs text-slate-500">{record.schoolId ?? record.schoolCode ?? "N/A"} - {record.region}</p>
                        </div>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${statusTone(record.status)}`}>
                          {statusLabel(record.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">{record.address ?? record.district ?? "N/A"}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Students: <span className="font-semibold text-slate-900">{record.studentCount.toLocaleString()}</span> | Teachers:{" "}
                        <span className="font-semibold text-slate-900">{record.teacherCount.toLocaleString()}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Updated {formatDateTime(record.lastUpdated)}</p>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handleReviewRecord(record)}
                          className="inline-flex items-center justify-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2 py-1.5 text-[11px] font-semibold text-primary-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Review
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenSchoolRecord(record)}
                          className="inline-flex items-center justify-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700"
                        >
                          <Building2 className="h-3.5 w-3.5" />
                          Open School
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSendReminderRecord(record)}
                          className="inline-flex items-center justify-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-700"
                        >
                          <BellRing className="h-3.5 w-3.5" />
                          Send Reminder
                        </button>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditRecordForm(record)}
                          className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteRecord(record)}
                          disabled={deletingRecordId === record.id}
                          className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {deletingRecordId === record.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full">
                  <thead className="table-head-sticky">
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      <th className="px-5 py-3 text-left">School ID</th>
                      <th className="px-5 py-3 text-left">
                        <button
                          type="button"
                          onClick={() => handleSort("schoolName")}
                          className="inline-flex items-center gap-1.5 hover:text-slate-900"
                        >
                          School
                          <SortIndicator active={sortColumn === "schoolName"} direction={sortDirection} />
                        </button>
                      </th>
                      <th className="px-5 py-3 text-left">
                        <button
                          type="button"
                          onClick={() => handleSort("region")}
                          className="inline-flex items-center gap-1.5 hover:text-slate-900"
                        >
                          Region
                          <SortIndicator active={sortColumn === "region"} direction={sortDirection} />
                        </button>
                      </th>
                      <th className="px-5 py-3 text-left">Level</th>
                      <th className="px-5 py-3 text-left">Type</th>
                      <th className="px-5 py-3 text-left">Address</th>
                      <th className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleSort("studentCount")}
                          className="ml-auto inline-flex items-center gap-1.5 hover:text-slate-900"
                        >
                          Students
                          <SortIndicator active={sortColumn === "studentCount"} direction={sortDirection} />
                        </button>
                      </th>
                      <th className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleSort("teacherCount")}
                          className="ml-auto inline-flex items-center gap-1.5 hover:text-slate-900"
                        >
                          Teachers
                          <SortIndicator active={sortColumn === "teacherCount"} direction={sortDirection} />
                        </button>
                      </th>
                      <th className="px-5 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleSort("status")}
                          className="mx-auto inline-flex items-center gap-1.5 hover:text-slate-900"
                        >
                          Status
                          <SortIndicator active={sortColumn === "status"} direction={sortDirection} />
                        </button>
                      </th>
                      <th className="px-5 py-3 text-left">
                        <button
                          type="button"
                          onClick={() => handleSort("lastUpdated")}
                          className="inline-flex items-center gap-1.5 hover:text-slate-900"
                        >
                          Last Updated
                          <SortIndicator active={sortColumn === "lastUpdated"} direction={sortDirection} />
                        </button>
                      </th>
                      <th className="px-5 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedRecords.map((record) => {
                      const schoolKey = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
                      const summary = schoolRequirementByKey.get(schoolKey);
                      const urgent = summary ? isUrgentRequirement(summary) : false;

                      return (
                        <tr key={record.id} className={urgent && summary ? urgencyRowTone(summary) : "dashboard-table-row"}>
                          <td className="px-5 py-3.5 align-top">
                            <p className="text-sm font-semibold text-slate-900">{record.schoolId ?? record.schoolCode ?? "N/A"}</p>
                          </td>
                          <td className="px-5 py-3.5 align-top">
                            <p className="text-sm font-semibold text-slate-900">{record.schoolName}</p>
                            <p className="mt-0.5 text-xs text-slate-500">Submitted by {record.submittedBy}</p>
                          </td>
                          <td className="px-5 py-3.5 align-top text-sm text-slate-700">{record.region}</td>
                          <td className="px-5 py-3.5 align-top text-sm text-slate-700">{record.level ?? "N/A"}</td>
                          <td className="px-5 py-3.5 align-top text-sm text-slate-700">{schoolTypeLabel(record.type)}</td>
                          <td className="px-5 py-3.5 align-top text-sm text-slate-700">{record.address ?? record.district ?? "N/A"}</td>
                          <td className="px-5 py-3.5 text-right text-sm font-semibold text-slate-900">
                            {record.studentCount.toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5 text-right text-sm font-semibold text-slate-900">
                            {record.teacherCount.toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${statusTone(record.status)}`}>
                              {statusLabel(record.status)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-slate-600">{formatDateTime(record.lastUpdated)}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleReviewRecord(record)}
                                className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Review
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenSchoolRecord(record)}
                                className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                              >
                                <Building2 className="h-3.5 w-3.5" />
                                Open School
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSendReminderRecord(record)}
                                className="inline-flex items-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700"
                              >
                                <BellRing className="h-3.5 w-3.5" />
                                Send Reminder
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditRecordForm(record)}
                                className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-primary hover:bg-primary-50 hover:text-primary"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteRecord(record)}
                                disabled={deletingRecordId === record.id}
                                className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {deletingRecordId === record.id ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
            </>
          )}
        </section>
        </>
      )}

      {activeTopNavigator === "student_records" && (
        <section id="monitor-student-records" className={sectionFocusClass("monitor-student-records")}>
          <StudentRecordsPanel
            editable={false}
            showSchoolColumn
            schoolFilterKeys={filteredSchoolKeys}
            externalSearchTerm={studentRecordsLookupTerm}
            title="Student Records"
            description="Read-only learner checks and search."
          />
        </section>
      )}

      {schoolDrawerKey && (
        <button
          type="button"
          onClick={closeSchoolDrawer}
          className="fixed inset-0 z-[74] bg-slate-900/25"
          aria-label="Close school detail panel"
        />
      )}

      <aside
        className={`fixed right-0 top-24 z-[75] h-[calc(100vh-6rem)] w-[min(27rem,100vw)] border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ${
          schoolDrawerKey ? "translate-x-0" : "translate-x-full"
        }`}
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

        <div className="h-[calc(100%-3.5rem)] overflow-y-auto p-4">
          {schoolDetail ? (
            <div className="space-y-3">
              <article className="rounded-sm border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold text-slate-700">School Code</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">{schoolDetail.schoolCode}</p>
                <p className="mt-2 text-xs text-slate-600">{schoolDetail.level} | {schoolDetail.type}</p>
                <p className="mt-1 text-xs text-slate-600">{schoolDetail.region}</p>
                <p className="mt-1 text-xs text-slate-600">{schoolDetail.address}</p>
              </article>

              <article className="rounded-sm border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold text-slate-700">Requirement Status</p>
                <div className="mt-2 space-y-2 text-xs text-slate-700">
                  <p>
                    Compliance record:{" "}
                    <span className="font-semibold text-slate-900">
                      {schoolDetail.hasComplianceRecord ? "Submitted" : "Missing"}
                    </span>
                  </p>
                  <p>
                    Indicator package:{" "}
                    <span className="font-semibold text-slate-900">{workflowLabel(schoolDetail.indicatorStatus)}</span>
                  </p>
                  <p>
                    Missing requirements: <span className="font-semibold text-slate-900">{schoolDetail.missingCount}</span>
                  </p>
                  <p>
                    Waiting: <span className="font-semibold text-slate-900">{schoolDetail.awaitingReviewCount}</span>
                  </p>
                  <p>
                    Last activity:{" "}
                    <span className="font-semibold text-slate-900">
                      {schoolDetail.lastActivityAt ? formatDateTime(schoolDetail.lastActivityAt) : "N/A"}
                    </span>
                  </p>
                </div>
              </article>

              <article className="rounded-sm border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold text-slate-700">Counts</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-slate-600">Reported Students</p>
                    <p className="font-semibold text-slate-900">{schoolDetail.reportedStudents.toLocaleString()}</p>
                  </div>
                  <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-slate-600">Reported Teachers</p>
                    <p className="font-semibold text-slate-900">{schoolDetail.reportedTeachers.toLocaleString()}</p>
                  </div>
                  <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-slate-600">Synced Students</p>
                    <p className="font-semibold text-slate-900">{schoolDetail.synchronizedStudents.toLocaleString()}</p>
                  </div>
                  <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-slate-600">Synced Teachers</p>
                    <p className="font-semibold text-slate-900">{schoolDetail.synchronizedTeachers.toLocaleString()}</p>
                  </div>
                </div>
              </article>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Select a school to view details.
            </div>
          )}
        </div>
      </aside>

      <div className="pointer-events-none fixed right-4 top-24 z-[85] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
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





