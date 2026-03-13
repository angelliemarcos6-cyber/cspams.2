import { useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpenText,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Download,
  Edit2,
  Filter,
  RefreshCw,
  CalendarDays,
  FilterX,
  Save,
  Search,
  LayoutDashboard,
  ListChecks,
  ClipboardList,
  Database,
  Users,
  X,
} from "lucide-react";
import { Shell } from "@/components/Shell";
import { StatCard } from "@/components/StatCard";
import { SchoolIndicatorPanel } from "@/components/indicators/SchoolIndicatorPanel";
import { StudentRecordsPanel } from "@/components/students/StudentRecordsPanel";
import { TeacherRecordsPanel } from "@/components/teachers/TeacherRecordsPanel";
import { useAuth } from "@/context/Auth";
import { useData } from "@/context/Data";
import { useIndicatorData } from "@/context/IndicatorData";
import { useStudentData } from "@/context/StudentData";
import { useTeacherData } from "@/context/TeacherData";
import type { IndicatorSubmission, SchoolRecord, SchoolRecordPayload, SchoolStatus, StudentRecord, TeacherRecord } from "@/types";
import {
  formatDateTime,
  statusLabel,
} from "@/utils/analytics";

type SortColumn = "schoolName" | "region" | "studentCount" | "teacherCount" | "status" | "lastUpdated";
type SortDirection = "asc" | "desc";

interface FormState {
  studentCount: string;
  teacherCount: string;
  status: SchoolStatus;
}

interface RequirementItem {
  id: "school_record" | "indicators";
  label: string;
  summary: string;
  detail: string;
  isComplete: boolean;
  navigatorId: TopNavigatorItem["id"];
}

interface TopNavigatorItem {
  id: "first_glance" | "requirements" | "compliance" | "records";
  label: string;
}

interface ManualStep {
  id: string;
  title: string;
  objective: string;
  actions: string[];
  doneWhen: string;
}

type NavigatorIcon = ComponentType<{ className?: string }>;

interface QuickJumpItem {
  id: string;
  label: string;
  targetId: string;
  icon: NavigatorIcon;
}


const TOP_NAVIGATOR_ITEMS: TopNavigatorItem[] = [
  { id: "compliance", label: "Workspace" },
  { id: "requirements", label: "Revisions" },
  { id: "records", label: "Reports" },
];

const SCHOOL_NAVIGATOR_ICONS: Record<TopNavigatorItem["id"], NavigatorIcon> = {
  first_glance: LayoutDashboard,
  requirements: ListChecks,
  compliance: ClipboardList,
  records: Database,
};

const SCHOOL_NAVIGATOR_MANUAL: ManualStep[] = [
  {
    id: "first_glance",
    title: "My Tasks",
    objective: "Start with the highest-priority tasks for today.",
    actions: [
      "Check overdue, returned, and for-review items first.",
      "Use quick-jump chips to open the exact section that needs action.",
    ],
    doneWhen: "You have a clear order of what to encode or revise next.",
  },
  {
    id: "compliance",
    title: "Submission Workspace",
    objective: "Encode required data in one focused workspace.",
    actions: [
      "Update School Summary first, then complete indicator tables.",
      "Use Save Draft often, then submit when all required items are complete.",
    ],
    doneWhen: "School Summary and indicators are complete and saved without errors.",
  },
  {
    id: "requirements",
    title: "Returned & Revisions",
    objective: "Fix returned items quickly and resubmit with confidence.",
    actions: [
      "Review each returned item and read monitor notes carefully.",
      "Jump to the related field, apply corrections, and validate your updates.",
    ],
    doneWhen: "Returned items are corrected and ready to submit again.",
  },
  {
    id: "records",
    title: "History & Exports",
    objective: "Review previous submissions and keep records ready for reporting.",
    actions: [
      "Check student and teacher history for consistency.",
      "Confirm status updates before sharing reports or evidence.",
    ],
    doneWhen: "Historical records are accurate and easy to verify.",
  },
];

const SCHOOL_MANUAL_STATUS_GUIDE = [
  "Draft: Saved but not yet sent.",
  "Submitted: Sent to monitor and waiting for review.",
  "Validated: Approved by monitor and closed.",
  "Needs Revision: Returned by monitor; update and submit again.",
];


const SCHOOL_QUICK_JUMPS: Record<TopNavigatorItem["id"], QuickJumpItem[]> = {
  first_glance: [
    { id: "overview_alerts", label: "Today Focus", targetId: "first-glance", icon: AlertTriangle },
    { id: "school_info", label: "School Info", targetId: "school-overview", icon: Building2 },
    { id: "kpi_cards", label: "Task KPIs", targetId: "overview-metrics", icon: LayoutDashboard },
  ],
  compliance: [
    { id: "overview_alerts", label: "Today Focus", targetId: "first-glance", icon: AlertTriangle },
    { id: "school_info", label: "School Info", targetId: "school-overview", icon: Building2 },
    { id: "kpi_cards", label: "Task KPIs", targetId: "overview-metrics", icon: LayoutDashboard },
    { id: "compliance_input", label: "Summary Inputs", targetId: "compliance-input", icon: Database },
    { id: "indicator_workflow", label: "Indicator Workflow", targetId: "indicator-workflow", icon: ClipboardList },
  ],
  requirements: [
    { id: "requirement_cards", label: "Returned Items", targetId: "requirement-navigator", icon: ListChecks },
  ],
  records: [
    { id: "reports_summary", label: "Reports Summary", targetId: "school-records", icon: LayoutDashboard },
    { id: "student_records", label: "Student History", targetId: "student-records-history", icon: Users },
    { id: "teacher_records", label: "Teacher History", targetId: "teacher-records-history", icon: BookOpenText },
  ],
};

const SCHOOL_QUICK_JUMP_TARGETS: Record<
  string,
  { navigatorId: TopNavigatorItem["id"]; submissionSection?: RequirementItem["id"] }
> = {
  "first-glance": { navigatorId: "compliance" },
  "school-overview": { navigatorId: "compliance" },
  "overview-metrics": { navigatorId: "compliance" },
  "requirement-navigator": { navigatorId: "requirements" },
  "compliance-input": { navigatorId: "compliance", submissionSection: "school_record" },
  "indicator-workflow": { navigatorId: "compliance", submissionSection: "indicators" },
  "school-records": { navigatorId: "records" },
  "student-records-history": { navigatorId: "records" },
  "teacher-records-history": { navigatorId: "records" },
};

const EMPTY_FORM: FormState = {
  studentCount: "",
  teacherCount: "",
  status: "active",
};
const SCHOOL_NAV_STORAGE_KEY = "cspams.schoolhead.nav.v1";
const SCHOOL_MOBILE_BREAKPOINT = 768;

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

function latestSubmission<T extends { updatedAt: string | null; createdAt: string | null }>(entries: T[]): T | null {
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => {
    const aDate = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const bDate = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    return bDate - aDate;
  });

  return sorted[0] ?? null;
}

function isPassedToMonitor(status: string | null | undefined): boolean {
  return status === "submitted" || status === "validated";
}

function buildWorkflowDetail(label: string, submission: IndicatorSubmission | null): string {
  if (!submission) {
    return `No ${label} package yet.`;
  }

  if (submission.status === "validated") {
    return `${label} is validated by monitor.`;
  }

  if (submission.status === "submitted") {
    return `${label} is submitted and waiting for monitor review.`;
  }

  if (submission.status === "returned") {
    return `${label} was returned by monitor. Update and resubmit.`;
  }

  return `${label} is still draft and not yet submitted.`;
}

function submissionStatusLabel(status: string | null | undefined): "Draft" | "Needs Revision" | "Submitted" | "Validated" | "Overdue" {
  if (status === "validated") return "Validated";
  if (status === "submitted") return "Submitted";
  if (status === "returned") return "Needs Revision";
  if (status === "overdue") return "Overdue";
  return "Draft";
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function toIsoOrRaw(value: string | null): string {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString();
}

function downloadCsv(filename: string, csvRows: string[][]): void {
  if (typeof window === "undefined") return;

  const lines = csvRows.map((row) => row.map((value) => csvEscape(value)).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function fileToken(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "school";
}

function timestampToken(date = new Date()): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());

  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function buildStudentExportRows(records: StudentRecord[]): string[][] {
  const header = [
    "School Code",
    "School Name",
    "LRN",
    "First Name",
    "Middle Name",
    "Last Name",
    "Full Name",
    "Sex",
    "Birth Date",
    "Age",
    "Status",
    "Risk Level",
    "Section",
    "Teacher",
    "Current Level",
    "Tracked From Level",
    "Last Status At",
    "Created At",
    "Updated At",
  ];

  const body = records.map((record) => [
    toCsvValue(record.school?.schoolCode ?? ""),
    toCsvValue(record.school?.name ?? ""),
    toCsvValue(record.lrn),
    toCsvValue(record.firstName),
    toCsvValue(record.middleName ?? ""),
    toCsvValue(record.lastName),
    toCsvValue(record.fullName),
    toCsvValue(record.sex ?? ""),
    toCsvValue(record.birthDate ?? ""),
    toCsvValue(record.age ?? ""),
    toCsvValue(record.statusLabel),
    toCsvValue(record.riskLevel),
    toCsvValue(record.section ?? ""),
    toCsvValue(record.teacher ?? ""),
    toCsvValue(record.currentLevel ?? ""),
    toCsvValue(record.trackedFromLevel ?? ""),
    toCsvValue(toIsoOrRaw(record.lastStatusAt)),
    toCsvValue(toIsoOrRaw(record.createdAt)),
    toCsvValue(toIsoOrRaw(record.updatedAt)),
  ]);

  return [header, ...body];
}

function buildTeacherExportRows(records: TeacherRecord[]): string[][] {
  const header = [
    "School Code",
    "School Name",
    "Teacher Name",
    "Sex",
    "Created At",
    "Updated At",
  ];

  const body = records.map((record) => [
    toCsvValue(record.school?.schoolCode ?? ""),
    toCsvValue(record.school?.name ?? ""),
    toCsvValue(record.name),
    toCsvValue(record.sex ?? ""),
    toCsvValue(toIsoOrRaw(record.createdAt)),
    toCsvValue(toIsoOrRaw(record.updatedAt)),
  ]);

  return [header, ...body];
}

export function SchoolAdminDashboard() {
  const { user } = useAuth();
  const { records, isLoading, isSaving, error, lastSyncedAt, syncScope, syncStatus, addRecord, updateRecord, refreshRecords } = useData();
  const { submissions: indicatorSubmissions, academicYears } = useIndicatorData();
  const { listStudents, totalCount: syncedStudentCount } = useStudentData();
  const { listTeachers, totalCount: syncedTeacherCount } = useTeacherData();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saveMessage, setSaveMessage] = useState("");
  const [submitError, setSubmitError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SchoolStatus | "all">("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>("lastUpdated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [activeTopNavigator, setActiveTopNavigator] = useState<TopNavigatorItem["id"]>("compliance");
  const [isNavigatorCompact, setIsNavigatorCompact] = useState(false);
  const [isNavigatorVisible, setIsNavigatorVisible] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 768));
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < SCHOOL_MOBILE_BREAKPOINT,
  );
  const [showNavigatorManual, setShowNavigatorManual] = useState(false);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [contextAcademicYearId, setContextAcademicYearId] = useState("all");
  const [contextSubmissionType, setContextSubmissionType] = useState<"all" | "school_record" | "indicator_package">("all");
  const [contextWorkflowStatus, setContextWorkflowStatus] = useState<"all" | "draft" | "submitted" | "returned" | "validated" | "overdue">("all");
  const [showContextMoreFilters, setShowContextMoreFilters] = useState(false);
  const [selectedRequirementId, setSelectedRequirementId] = useState<RequirementItem["id"]>("school_record");
  const [activeSubmissionSection, setActiveSubmissionSection] = useState<RequirementItem["id"]>("school_record");
  const [recordsExportMessage, setRecordsExportMessage] = useState("");
  const [recordsExportError, setRecordsExportError] = useState("");
  const [isExportingRecords, setIsExportingRecords] = useState(false);

  const assignedRecord = records[0] ?? null;
  const schoolName = assignedRecord?.schoolName || user?.schoolName || "Unassigned School";
  const schoolCode = assignedRecord?.schoolCode || user?.schoolCode || "N/A";
  const schoolRegion = assignedRecord?.region || "N/A";
  const exportToken = useMemo(
    () => fileToken((schoolCode && schoolCode !== "N/A" ? schoolCode : schoolName) || "school"),
    [schoolCode, schoolName],
  );
  const latestIndicators = useMemo(() => latestSubmission(indicatorSubmissions), [indicatorSubmissions]);

  const requirements = useMemo<RequirementItem[]>(
    () => [
      {
        id: "school_record",
        label: "School Compliance Record",
        summary: "Encode students, teachers, and school status.",
        detail: assignedRecord
          ? `Last updated ${formatDateTime(assignedRecord.lastUpdated)}.`
          : "No compliance record submitted yet.",
        isComplete: Boolean(assignedRecord),
        navigatorId: "compliance",
      },
      {
        id: "indicators",
        label: "Compliance Indicators",
        summary: "Encode required school indicators and submit to monitor.",
        detail: buildWorkflowDetail("Indicator package", latestIndicators),
        isComplete: isPassedToMonitor(latestIndicators?.status),
        navigatorId: "compliance",
      },
    ],
    [assignedRecord, latestIndicators],
  );

  const missingRequirements = useMemo(
    () => requirements.filter((item) => !item.isComplete),
    [requirements],
  );
  const submissionStatuses = useMemo(
    () => [
      assignedRecord ? "submitted" : "missing",
      latestIndicators?.status ?? "missing",
    ],
    [assignedRecord, latestIndicators?.status],
  );
  const pendingCount = useMemo(
    () => submissionStatuses.filter((status) => status === "submitted").length,
    [submissionStatuses],
  );
  const returnedCount = useMemo(
    () => submissionStatuses.filter((status) => status === "returned").length,
    [submissionStatuses],
  );
  const submittedCount = useMemo(
    () => submissionStatuses.filter((status) => status === "submitted" || status === "validated").length,
    [submissionStatuses],
  );
  const returnedSubmissions = useMemo(
    () => indicatorSubmissions.filter((submission) => submission.status === "returned"),
    [indicatorSubmissions],
  );
  const workspaceCompletion = useMemo(() => {
    if (requirements.length === 0) return 0;
    const complete = requirements.filter((item) => item.isComplete).length;
    return Math.round((complete / requirements.length) * 100);
  }, [requirements]);
  const selectedRequirement = useMemo(
    () => requirements.find((item) => item.id === selectedRequirementId) ?? requirements[0] ?? null,
    [requirements, selectedRequirementId],
  );
  const summaryErrorItems = useMemo(
    () =>
      (Object.entries(formErrors) as Array<[keyof FormState, string | undefined]>)
        .filter(([, value]) => Boolean(value))
        .map(([field, message]) => ({ field, message: message ?? "" })),
    [formErrors],
  );
  const contextDeadline = useMemo(() => {
    if (!latestIndicators?.updatedAt && !latestIndicators?.createdAt) {
      return "Not set";
    }
    const dateValue = latestIndicators.updatedAt ?? latestIndicators.createdAt;
    return dateValue ? new Date(dateValue).toLocaleDateString() : "Not set";
  }, [latestIndicators?.createdAt, latestIndicators?.updatedAt]);
  const latestIndicatorUpdatedAt = latestIndicators?.updatedAt ?? latestIndicators?.createdAt ?? null;
  const currentAcademicYearOption = useMemo(
    () => academicYears.find((year) => year.isCurrent) ?? academicYears[0] ?? null,
    [academicYears],
  );
  const selectedAcademicYearLabel = useMemo(() => {
    if (contextAcademicYearId === "all") return "All school years";
    return academicYears.find((year) => year.id === contextAcademicYearId)?.name ?? "Selected year";
  }, [academicYears, contextAcademicYearId]);
  const selectedSubmissionTypeLabel = useMemo(() => {
    if (contextSubmissionType === "all") return "All submission types";
    return contextSubmissionType === "school_record" ? "School record" : "Indicator package";
  }, [contextSubmissionType]);
  const selectedWorkflowStatusLabel = useMemo(() => {
    if (contextWorkflowStatus === "all") return "All statuses";
    if (contextWorkflowStatus === "returned") return "Needs Revision";
    return contextWorkflowStatus.charAt(0).toUpperCase() + contextWorkflowStatus.slice(1);
  }, [contextWorkflowStatus]);
  const hasContextOverrides =
    contextAcademicYearId !== "all" || contextSubmissionType !== "all" || contextWorkflowStatus !== "all";
  const activeContextCount = useMemo(
    () =>
      Number(contextAcademicYearId !== "all") +
      Number(contextSubmissionType !== "all") +
      Number(contextWorkflowStatus !== "all"),
    [contextAcademicYearId, contextSubmissionType, contextWorkflowStatus],
  );
  const quickJumpItems = useMemo(
    () => SCHOOL_QUICK_JUMPS[activeTopNavigator] ?? [],
    [activeTopNavigator],
  );
  const shouldShowQuickJump = quickJumpItems.length > 1;
  const navigatorBadges = useMemo<
    Record<TopNavigatorItem["id"], { primary?: number; secondary?: number; urgency: "none" | "high" | "medium" }>
  >(
    () => ({
      first_glance: {
        primary: missingRequirements.length,
        urgency: missingRequirements.length > 0 ? "high" : "none",
      },
      requirements: {
        primary: returnedCount,
        urgency: returnedCount > 0 ? "high" : "none",
      },
      compliance: {
        primary: missingRequirements.length,
        secondary: pendingCount,
        urgency: returnedCount > 0 ? "high" : pendingCount > 0 ? "medium" : "none",
      },
      records: { urgency: "none" },
    }),
    [missingRequirements.length, pendingCount, returnedCount],
  );
  const shouldRenderNavigatorItems = isMobileViewport ? isNavigatorVisible : true;
  const showNavigatorHeaderText = isMobileViewport ? isNavigatorVisible : !isNavigatorCompact;

  const fetchAllStudentsForExport = useCallback(async (): Promise<StudentRecord[]> => {
    const allRows: StudentRecord[] = [];
    let currentPage = 1;

    while (true) {
      const result = await listStudents({ page: currentPage, perPage: 200 });
      allRows.push(...result.data);

      if (!result.meta.hasMorePages || currentPage >= result.meta.lastPage) {
        break;
      }

      currentPage += 1;
    }

    return allRows;
  }, [listStudents]);

  const fetchAllTeachersForExport = useCallback(async (): Promise<TeacherRecord[]> => {
    const allRows: TeacherRecord[] = [];
    let currentPage = 1;

    while (true) {
      const result = await listTeachers({ page: currentPage, perPage: 200 });
      allRows.push(...result.data);

      if (!result.meta.hasMorePages || currentPage >= result.meta.lastPage) {
        break;
      }

      currentPage += 1;
    }

    return allRows;
  }, [listTeachers]);

  const handleExportStudentsCsv = useCallback(async () => {
    setRecordsExportMessage("");
    setRecordsExportError("");
    setIsExportingRecords(true);

    try {
      const studentRows = await fetchAllStudentsForExport();
      if (studentRows.length === 0) {
        setRecordsExportError("No student records available to export.");
        return;
      }

      const filename = `student-records-${exportToken}-${timestampToken()}.csv`;
      downloadCsv(filename, buildStudentExportRows(studentRows));
      setRecordsExportMessage(
        `Exported ${studentRows.length} student record${studentRows.length === 1 ? "" : "s"} to CSV.`,
      );
    } catch (err) {
      setRecordsExportError(err instanceof Error ? err.message : "Unable to export student records.");
    } finally {
      setIsExportingRecords(false);
    }
  }, [exportToken, fetchAllStudentsForExport]);

  const handleExportTeachersCsv = useCallback(async () => {
    setRecordsExportMessage("");
    setRecordsExportError("");
    setIsExportingRecords(true);

    try {
      const teacherRows = await fetchAllTeachersForExport();
      if (teacherRows.length === 0) {
        setRecordsExportError("No teacher records available to export.");
        return;
      }

      const filename = `teacher-records-${exportToken}-${timestampToken()}.csv`;
      downloadCsv(filename, buildTeacherExportRows(teacherRows));
      setRecordsExportMessage(
        `Exported ${teacherRows.length} teacher record${teacherRows.length === 1 ? "" : "s"} to CSV.`,
      );
    } catch (err) {
      setRecordsExportError(err instanceof Error ? err.message : "Unable to export teacher records.");
    } finally {
      setIsExportingRecords(false);
    }
  }, [exportToken, fetchAllTeachersForExport]);

  useEffect(() => {
    if (contextSubmissionType !== "all" && !showContextMoreFilters) {
      setShowContextMoreFilters(true);
    }
  }, [contextSubmissionType, showContextMoreFilters]);

  useEffect(() => {
    if (requirements.length === 0) return;
    if (requirements.some((item) => item.id === selectedRequirementId)) return;
    setSelectedRequirementId(requirements[0].id);
  }, [requirements, selectedRequirementId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncViewport = () => {
      setIsMobileViewport(window.innerWidth < SCHOOL_MOBILE_BREAKPOINT);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(SCHOOL_NAV_STORAGE_KEY);
      if (!raw) return;
      const persisted = JSON.parse(raw) as {
        activeTopNavigator?: TopNavigatorItem["id"];
        isNavigatorVisible?: boolean;
        isNavigatorCompact?: boolean;
      };
      if (persisted.activeTopNavigator) {
        const mappedNavigator = persisted.activeTopNavigator === "first_glance" ? "compliance" : persisted.activeTopNavigator;
        if (TOP_NAVIGATOR_ITEMS.some((item) => item.id === mappedNavigator)) {
          setActiveTopNavigator(mappedNavigator);
        }
      }
      if (typeof persisted.isNavigatorVisible === "boolean") {
        setIsNavigatorVisible(persisted.isNavigatorVisible);
      }
      if (typeof persisted.isNavigatorCompact === "boolean") {
        setIsNavigatorCompact(persisted.isNavigatorCompact);
      }
    } catch {
      // Ignore invalid saved navigator preferences.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        SCHOOL_NAV_STORAGE_KEY,
        JSON.stringify({ activeTopNavigator, isNavigatorVisible, isNavigatorCompact }),
      );
    } catch {
      // Ignore storage failures.
    }
  }, [activeTopNavigator, isNavigatorVisible, isNavigatorCompact]);

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
      const shortcutItem = TOP_NAVIGATOR_ITEMS[shortcutIndex];
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

  const syncComplianceForm = (record: SchoolRecord | null) => {
    if (record) {
      setEditingId(record.id);
      setForm((current) => ({
        ...current,
        status: record.status,
      }));
      return;
    }

    setEditingId(null);
    setForm((current) => ({
      ...current,
      status: EMPTY_FORM.status,
    }));
  };

  useEffect(() => {
    syncComplianceForm(assignedRecord);
  }, [
    assignedRecord?.id,
    assignedRecord?.status,
  ]);

  useEffect(() => {
    const nextStudentCount = syncedStudentCount.toString();
    const nextTeacherCount = syncedTeacherCount.toString();

    setForm((current) => {
      if (current.studentCount === nextStudentCount && current.teacherCount === nextTeacherCount) {
        return current;
      }

      return {
        ...current,
        studentCount: nextStudentCount,
        teacherCount: nextTeacherCount,
      };
    });

    setFormErrors((current) => {
      if (!current.studentCount && !current.teacherCount) {
        return current;
      }

      return {
        ...current,
        studentCount: undefined,
        teacherCount: undefined,
      };
    });
  }, [syncedStudentCount, syncedTeacherCount]);

  useEffect(() => {
    setSubmitError("");
    setSaveMessage("");
    setFormErrors({});
  }, [activeSubmissionSection]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records
      .filter((record) => {
        const matchesSearch =
          query.length === 0 ||
          record.schoolName.toLowerCase().includes(query) ||
          (record.schoolId ?? record.schoolCode ?? "").toLowerCase().includes(query) ||
          (record.level ?? "").toLowerCase().includes(query) ||
          (record.address ?? record.district ?? "").toLowerCase().includes(query) ||
          record.region.toLowerCase().includes(query) ||
          record.submittedBy.toLowerCase().includes(query);
        const matchesStatus = statusFilter === "all" || record.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => compareRecords(a, b, sortColumn, sortDirection));
  }, [records, search, statusFilter, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  };

  const resetForm = () => {
    syncComplianceForm(assignedRecord);
    setFormErrors({});
    setSaveMessage("");
    setSubmitError("");
  };

  const handleRequirementNavigate = (item: RequirementItem) => {
    setShowNavigatorManual(false);
    setActiveTopNavigator(item.navigatorId);
    setActiveSubmissionSection(item.id);
    if (isMobileViewport) {
      setIsNavigatorVisible(false);
    }
    if (typeof window !== "undefined") {
      const targetId = item.id === "school_record" ? "compliance-input" : "indicator-workflow";
      window.setTimeout(() => scrollToSection(targetId), 60);
    }
  };

  const handleTopNavigate = (item: TopNavigatorItem) => {
    setShowNavigatorManual(false);
    setActiveTopNavigator(item.id);
    if (isMobileViewport) {
      setIsNavigatorVisible(false);
    }
  };

  const clearFocusAfterDelay = (targetId: string) => {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      setFocusedSectionId((current) => (current === targetId ? null : current));
    }, 3000);
  };

  const scrollToSection = (sectionId: string) => {
    if (typeof document === "undefined") return;
    const section = document.getElementById(sectionId);
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    setFocusedSectionId(sectionId);
    clearFocusAfterDelay(sectionId);
  };

  const sectionFocusClass = (sectionId: string) => (focusedSectionId === sectionId ? "dashboard-focus-glow" : "");

  const canResolveQuickJumpTarget = (targetId: string): boolean => {
    if (typeof document === "undefined") {
      return true;
    }

    if (document.getElementById(targetId)) {
      return true;
    }

    const targetConfig = SCHOOL_QUICK_JUMP_TARGETS[targetId];
    if (!targetConfig) {
      return false;
    }

    if (targetConfig.navigatorId !== activeTopNavigator) {
      return true;
    }

    if (
      targetConfig.navigatorId === "compliance" &&
      targetConfig.submissionSection &&
      targetConfig.submissionSection !== activeSubmissionSection
    ) {
      return true;
    }

    return false;
  };

  const handleQuickJump = (targetId: string) => {
    const targetConfig = SCHOOL_QUICK_JUMP_TARGETS[targetId];
    if (targetConfig) {
      setShowNavigatorManual(false);
      setActiveTopNavigator(targetConfig.navigatorId);
      if (targetConfig.navigatorId === "compliance" && targetConfig.submissionSection) {
        setActiveSubmissionSection(targetConfig.submissionSection);
      }
      if (isMobileViewport) {
        setIsNavigatorVisible(false);
      }
      if (typeof window !== "undefined") {
        window.setTimeout(() => scrollToSection(targetId), 80);
      }
      return;
    }

    scrollToSection(targetId);
  };

  const renderQuickJumpChips = (mobile: boolean) => {
    if (!shouldShowQuickJump) {
      return null;
    }

    return (
      <div className={mobile ? "mt-2 flex gap-2 overflow-x-auto pb-1" : "flex flex-wrap items-center justify-end gap-2"}>
        {quickJumpItems.map((item) => {
          const Icon = item.icon;
          const isActive = focusedSectionId === item.targetId;
          const isAvailable = canResolveQuickJumpTarget(item.targetId);
          const quickJumpIndex = quickJumpItems.findIndex((candidate) => candidate.id === item.id);
          const shortcutLabel = quickJumpIndex >= 0 && quickJumpIndex < 9 ? `Alt+Shift+${quickJumpIndex + 1}` : null;

          return (
            <button
              key={`quick-jump-${item.id}`}
              type="button"
              onClick={() => handleQuickJump(item.targetId)}
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
      handleQuickJump(quickJumpItem.targetId);
    };

    window.addEventListener("keydown", onQuickJumpHotkey);
    return () => window.removeEventListener("keydown", onQuickJumpHotkey);
  }, [quickJumpItems, shouldShowQuickJump, handleQuickJump, canResolveQuickJumpTarget]);

  const validateForm = () => {
    const errors: Partial<Record<keyof FormState, string>> = {};

    const students = syncedStudentCount;
    if (!Number.isFinite(students) || students < 0 || !Number.isInteger(students)) {
      errors.studentCount = "Use a valid non-negative whole number.";
    }

    const teachers = syncedTeacherCount;
    if (!Number.isFinite(teachers) || teachers < 0 || !Number.isInteger(teachers)) {
      errors.teacherCount = "Use a valid non-negative whole number.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const focusSummaryField = (field: keyof FormState) => {
    if (typeof document === "undefined") return;

    const fieldId = field === "status" ? "schoolStatus" : field;
    const element = document.getElementById(fieldId) as HTMLInputElement | HTMLSelectElement | null;
    if (!element) return;
    element.focus();
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const persistSummary = async (mode: "draft" | "submit") => {
    if (!validateForm()) {
      setSubmitError("Please fix the required fields before proceeding.");
      return false;
    }

    const payload: SchoolRecordPayload = {
      studentCount: syncedStudentCount,
      teacherCount: syncedTeacherCount,
      status: form.status,
    };

    try {
      if (editingId) {
        await updateRecord(editingId, payload);
      } else {
        await addRecord(payload);
      }

      setSubmitError("");
      setSaveMessage(mode === "draft" ? "Draft saved." : returnedCount > 0 ? "Resubmission saved." : "Submission saved.");
      return true;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unable to save record.");
      return false;
    }
  };

  const handleSaveDraft = async () => {
    await persistSummary("draft");
  };

  const handleSubmitOrResubmit = async () => {
    await persistSummary("submit");
  };

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleSubmitOrResubmit();
  };

  const clearTopContext = () => {
    setContextAcademicYearId("all");
    setContextSubmissionType("all");
    setContextWorkflowStatus("all");
    setShowContextMoreFilters(false);
    setSearch("");
    setStatusFilter("all");
    setFocusedSectionId(null);
  };

  const clearContextField = (field: "year" | "type" | "status") => {
    if (field === "year") {
      setContextAcademicYearId("all");
      return;
    }

    if (field === "type") {
      setContextSubmissionType("all");
      return;
    }

    setContextWorkflowStatus("all");
  };

  const applyContextPreset = (preset: "current_year" | "needs_revision" | "indicator_focus" | "all_submission") => {
    if (preset === "current_year") {
      if (currentAcademicYearOption) {
        setContextAcademicYearId(currentAcademicYearOption.id);
      }
      return;
    }

    if (preset === "needs_revision") {
      setContextWorkflowStatus("returned");
      return;
    }

    if (preset === "indicator_focus") {
      setContextSubmissionType("indicator_package");
      setShowContextMoreFilters(true);
      return;
    }

    setContextAcademicYearId("all");
    setContextSubmissionType("all");
    setContextWorkflowStatus("all");
    setShowContextMoreFilters(false);
  };

  const isContextPresetActive = (preset: "current_year" | "needs_revision" | "indicator_focus" | "all_submission") => {
    if (preset === "current_year") {
      return Boolean(currentAcademicYearOption && contextAcademicYearId === currentAcademicYearOption.id);
    }
    if (preset === "needs_revision") {
      return contextWorkflowStatus === "returned";
    }
    if (preset === "indicator_focus") {
      return contextSubmissionType === "indicator_package";
    }
    return !hasContextOverrides;
  };
  const isIndicatorWorkspaceActive = activeTopNavigator === "compliance" && activeSubmissionSection === "indicators";

  return (
    <Shell
      title="School Head Dashboard"
      subtitle="Unified workspace for queue, submissions, revisions, and reports."
      actions={
        <div className="inline-flex min-w-0 items-center gap-2 rounded-sm border border-white/20 bg-white/10 p-1.5">
          <button
            type="button"
            onClick={() => void refreshRecords()}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-white text-primary-700 shadow-sm transition hover:bg-white/90"
            aria-label="Refresh records"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <span className="inline-flex max-w-[17rem] items-center truncate text-[11px] font-medium text-primary-100 lg:max-w-[21rem]">
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
        <section className="mb-5 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </section>
      )}

      <div
        className={`dashboard-left-layout mb-5 lg:grid lg:items-stretch lg:gap-0 lg:transition-[grid-template-columns] lg:duration-[700ms] lg:ease-in-out ${
          isNavigatorCompact ? "lg:grid-cols-[5.25rem_minmax(0,1fr)]" : "lg:grid-cols-[17rem_minmax(0,1fr)]"
        }`}
      >
      <aside className="dashboard-side-rail ml-3 rounded-sm p-3 transition-[padding] duration-[700ms] ease-in-out lg:self-stretch lg:min-h-full lg:rounded-none">
        <div className="flex min-h-full flex-col lg:sticky lg:top-2">
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
              School Head
            </p>
          </div>
        </div>
        <div
          className={`overflow-hidden transition-[max-height,opacity,margin] duration-[700ms] ease-in-out ${
            shouldRenderNavigatorItems ? "mt-4 max-h-[34rem] opacity-100" : "mt-0 max-h-0 opacity-0 pointer-events-none"
          }`}
        >
          <div className={`grid ${isNavigatorCompact ? "gap-2" : "gap-2.5"}`}>
              {TOP_NAVIGATOR_ITEMS.map((item, index) => {
                const Icon = SCHOOL_NAVIGATOR_ICONS[item.id];
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
                  onClick={() => handleTopNavigate(item)}
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
                      {item.id === "compliance" && hasSecondaryBadge && (
                        <span className="inline-flex items-center justify-center rounded-sm border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          P{meta.secondary}
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
                }}
                className={`inline-flex items-center gap-1.5 rounded-sm border text-white transition ${
                  showNavigatorManual
                    ? "border-primary-100 bg-primary-700"
                    : "border-primary-400/40 bg-primary-700/65 hover:bg-primary-700"
                } ${
                  isNavigatorCompact ? "h-8 w-8 justify-center p-0" : "w-full px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
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
      <div className="dashboard-main-pane mt-4 lg:mt-0 lg:pl-5">

      {showNavigatorManual && (
        <section id="school-head-user-manual" className="dashboard-shell mb-5 overflow-hidden rounded-sm border border-slate-200 bg-white animate-fade-slide">
          <div className="min-h-[72vh] p-4 md:p-6 xl:p-8">
            <div className="mx-auto flex h-full w-full max-w-6xl flex-col justify-center gap-6">
              <header className="text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-700">School Head Dashboard</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900 md:text-3xl">User Manual</h2>
                <p className="mx-auto mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
                  This guide is shown inside the main workspace so Head Teachers can read instructions clearly before encoding data.
                </p>
              </header>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                <article className="rounded-sm border border-slate-200 bg-slate-50 p-4 md:p-5">
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-700">Step-by-step Workflow</p>
                  <ol className="mt-3 space-y-3">
                    {SCHOOL_NAVIGATOR_MANUAL.map((step, index) => (
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
                      {SCHOOL_MANUAL_STATUS_GUIDE.map((item) => (
                        <li key={item} className="ml-5 list-disc text-sm text-slate-700">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </article>
                  <article className="rounded-sm border border-primary-200 bg-primary-50 p-4 md:p-5">
                    <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Quick Reminders</p>
                    <ul className="mt-3 space-y-2">
                      <li className="ml-5 list-disc text-sm text-primary-700">Complete required fields before optional details.</li>
                      <li className="ml-5 list-disc text-sm text-primary-700">Save Draft first, then submit only after checking errors.</li>
                      <li className="ml-5 list-disc text-sm text-primary-700">Use monitor notes directly to speed up revisions.</li>
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

      {!showNavigatorManual && activeTopNavigator !== "compliance" && (
      <section className="dashboard-shell sticky top-2 z-20 mb-5 rounded-sm border border-slate-200 bg-white/95">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Context</h2>
              {activeContextCount > 0 && (
                <span className="inline-flex items-center rounded-sm border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  {activeContextCount} active
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
                {contextDeadline === "Not set" ? "No due date" : contextDeadline}
              </span>
              <button
                type="button"
                onClick={clearTopContext}
                disabled={!hasContextOverrides}
                className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FilterX className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-100 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => applyContextPreset("current_year")}
              className={`rounded-sm border px-2.5 py-1 text-xs font-semibold transition ${
                isContextPresetActive("current_year")
                  ? "border-primary-300 bg-primary-50 text-primary-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Current
            </button>
            <button
              type="button"
              onClick={() => applyContextPreset("needs_revision")}
              className={`rounded-sm border px-2.5 py-1 text-xs font-semibold transition ${
                isContextPresetActive("needs_revision")
                  ? "border-primary-300 bg-primary-50 text-primary-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Revision
            </button>
            <button
              type="button"
              onClick={() => applyContextPreset("indicator_focus")}
              className={`rounded-sm border px-2.5 py-1 text-xs font-semibold transition ${
                isContextPresetActive("indicator_focus")
                  ? "border-primary-300 bg-primary-50 text-primary-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Indicators
            </button>
            <button
              type="button"
              onClick={() => applyContextPreset("all_submission")}
              className={`rounded-sm border px-2.5 py-1 text-xs font-semibold transition ${
                isContextPresetActive("all_submission")
                  ? "border-primary-300 bg-primary-50 text-primary-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              All
            </button>
          </div>
        </div>

        <div className="px-4 py-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Year</span>
              <select
                value={contextAcademicYearId}
                onChange={(event) => setContextAcademicYearId(event.target.value)}
                className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              >
                <option value="all">All years</option>
                {academicYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                    {year.isCurrent ? " (Current)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Status</span>
              <select
                value={contextWorkflowStatus}
                onChange={(event) =>
                  setContextWorkflowStatus(event.target.value as "all" | "draft" | "submitted" | "returned" | "validated" | "overdue")
                }
                className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="returned">Needs Revision</option>
                <option value="validated">Validated</option>
                <option value="overdue">Overdue</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setShowContextMoreFilters((current) => !current)}
                className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-sm border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 xl:w-auto"
                aria-expanded={showContextMoreFilters}
                aria-controls="school-head-context-more-filters"
              >
                {showContextMoreFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showContextMoreFilters ? "Less" : "More"}
              </button>
            </div>
          </div>

          <div
            id="school-head-context-more-filters"
            className={`overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out ${
              showContextMoreFilters ? "mt-2 max-h-32 opacity-100" : "mt-0 max-h-0 opacity-0 pointer-events-none"
            }`}
          >
            <div className="grid gap-2 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Type</span>
                <select
                  value={contextSubmissionType}
                  onChange={(event) => setContextSubmissionType(event.target.value as "all" | "school_record" | "indicator_package")}
                  className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                >
                  <option value="all">All types</option>
                  <option value="school_record">School record</option>
                  <option value="indicator_package">Indicator package</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        {hasContextOverrides && (
          <div className="border-t border-slate-100 px-4 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {contextAcademicYearId !== "all" && (
                <button
                  type="button"
                  onClick={() => clearContextField("year")}
                  className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
                >
                  {selectedAcademicYearLabel}
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {contextSubmissionType !== "all" && (
                <button
                  type="button"
                  onClick={() => clearContextField("type")}
                  className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
                >
                  {selectedSubmissionTypeLabel}
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {contextWorkflowStatus !== "all" && (
                <button
                  type="button"
                  onClick={() => clearContextField("status")}
                  className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
                >
                  {selectedWorkflowStatusLabel}
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </section>
      )}

      {!showNavigatorManual && activeTopNavigator === "requirements" && (
      <section id="requirement-navigator" className={`dashboard-shell mb-5 overflow-hidden rounded-sm ${sectionFocusClass("requirement-navigator")}`}>
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Returned & Revisions</h2>
              <p className="mt-0.5 text-xs text-slate-600">Resolve monitor feedback quickly from one place.</p>
            </div>
            {!isMobileViewport && renderQuickJumpChips(false)}
          </div>
          {isMobileViewport && renderQuickJumpChips(true)}
        </div>
        <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <div className="grid gap-2 md:grid-cols-2">
              {requirements.map((item) => {
                const isSelected = selectedRequirement?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedRequirementId(item.id)}
                    className={`rounded-sm border px-3 py-3 text-left transition ${
                      isSelected
                        ? "border-primary-300 bg-primary-50"
                        : item.isComplete
                          ? "border-primary-200 bg-white hover:bg-primary-50"
                          : "border-rose-200 bg-rose-50 hover:bg-rose-100"
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{item.label}</p>
                    <p className="mt-1 text-[11px] text-slate-600">{item.summary}</p>
                    <p className={`mt-2 text-xs font-bold ${item.isComplete ? "text-primary-700" : "text-rose-700"}`}>
                      {item.isComplete ? "Passed to monitor" : "Needs action"}
                    </p>
                  </button>
                );
              })}
            </div>
            <div className="rounded-sm border border-slate-200 bg-white p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Returned Queue</h3>
              {returnedSubmissions.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No returned indicator packages right now.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {returnedSubmissions.slice(0, 6).map((submission) => (
                    <article key={submission.id} className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Package #{submission.id}</p>
                      <p className="mt-0.5 text-xs text-slate-700">{submission.reviewNotes || "No monitor note provided."}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
          <aside className="rounded-sm border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Detail Drawer</h3>
            {selectedRequirement ? (
              <>
                <p className="mt-2 text-sm font-semibold text-slate-900">{selectedRequirement.label}</p>
                <p className="mt-1 text-xs text-slate-700">{selectedRequirement.detail}</p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Monitor Notes</p>
                <p className="mt-1 text-xs text-slate-600">{latestIndicators?.reviewNotes || "No notes available for the latest package."}</p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Previous Cycle Comparison</p>
                <p className="mt-1 text-xs text-slate-600">
                  {latestIndicators
                    ? `Last package updated ${latestIndicatorUpdatedAt ? formatDateTime(latestIndicatorUpdatedAt) : "N/A"} with ${latestIndicators.summary.complianceRatePercent.toFixed(2)}% compliance.`
                    : "No prior package yet."}
                </p>
                <button
                  type="button"
                  onClick={() => handleRequirementNavigate(selectedRequirement)}
                  className="mt-3 inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
                >
                  Open in Submission Workspace
                </button>
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-600">Select a requirement to view details.</p>
            )}
          </aside>
        </div>
      </section>
      )}

      {!showNavigatorManual && activeTopNavigator === "compliance" && (
      <section id="compliance-records" className="grid gap-5">
        <section id="first-glance" className={`space-y-5 ${sectionFocusClass("first-glance")}`}>
          <section id="school-overview" className={`animate-fade-slide grid gap-3 md:grid-cols-3 ${sectionFocusClass("school-overview")}`}>
            <article className="dashboard-subtle-panel px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Assigned School</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{schoolName}</p>
            </article>
            <article className="dashboard-subtle-panel px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">School Code</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{schoolCode}</p>
            </article>
            <article className="dashboard-subtle-panel px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Region</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{schoolRegion}</p>
            </article>
          </section>

          <section id="overview-metrics" className={`animate-fade-slide grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${sectionFocusClass("overview-metrics")}`}>
            <StatCard label="For Review" value={pendingCount.toLocaleString()} icon={<AlertCircle className="h-5 w-5" />} />
            <StatCard label="Needs Revision" value={returnedCount.toLocaleString()} icon={<ArrowDown className="h-5 w-5" />} tone="warning" />
            <StatCard label="Validated / Submitted" value={submittedCount.toLocaleString()} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
          </section>
        </section>

        <section className="dashboard-shell overflow-hidden rounded-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Submission Workspace</h2>
              <p className="mt-0.5 text-xs text-slate-500">Complete school record and indicators in one focused view.</p>
            </div>
          </div>

          <div className="grid gap-4 p-3 2xl:grid-cols-[14rem_minmax(0,1fr)]">
            <aside className="h-fit rounded-sm border border-slate-200 bg-slate-50 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Checklist</p>
                <p className="text-xs font-semibold text-slate-900">{workspaceCompletion}%</p>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-slate-200">
                <div className="h-1.5 rounded-full bg-primary transition-[width] duration-300" style={{ width: `${workspaceCompletion}%` }} />
              </div>
              <div className="mt-2.5 space-y-1.5">
                {requirements.map((item) => {
                  const status =
                    item.id === "school_record"
                      ? assignedRecord
                        ? "Submitted"
                        : "Draft"
                      : submissionStatusLabel(latestIndicators?.status);
                  const isActive = activeSubmissionSection === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSubmissionSection(item.id)}
                      className={`w-full rounded-sm border px-2 py-1.5 text-left text-[11px] transition ${
                        isActive
                          ? "border-primary-300 bg-primary-50"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold leading-4 text-slate-700">{item.label}</p>
                        <span className="rounded-sm border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                          {status}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500" title={item.summary}>{item.summary}</p>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="min-w-0 space-y-4">
              {activeSubmissionSection === "school_record" ? (
                <section id="compliance-input" className={sectionFocusClass("compliance-input")}>
                  <section className="surface-panel animate-fade-slide overflow-hidden rounded-sm border border-slate-200 bg-white">
                    <div className="border-b border-slate-200 px-3 py-2.5">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">School Summary</h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Required fields first
                        <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold text-slate-600" title="Optional details are available under Show advanced.">
                          i
                        </span>
                      </p>
                    </div>

                    {(summaryErrorItems.length > 0 || submitError || saveMessage) && (
                      <div className="mx-4 mt-4 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2">
                        {summaryErrorItems.length > 0 ? (
                          <>
                            <p className="text-xs font-semibold text-rose-700">Fix these fields:</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {summaryErrorItems.map((item) => (
                                <button
                                  key={`jump-${item.field}`}
                                  type="button"
                                  onClick={() => focusSummaryField(item.field)}
                                  className="rounded-sm border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                                >
                                  {item.message}
                                </button>
                              ))}
                            </div>
                          </>
                        ) : submitError ? (
                          <p className="text-xs font-semibold text-rose-700">{submitError}</p>
                        ) : (
                          <p className="text-xs font-semibold text-primary-700">{saveMessage}</p>
                        )}
                      </div>
                    )}

                    <form className="grid gap-3 p-3 md:grid-cols-3" onSubmit={handleFormSubmit}>
                      <div>
                        <label htmlFor="studentCount" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Students
                        </label>
                        <input
                          id="studentCount"
                          type="number"
                          min={0}
                          step={1}
                          value={form.studentCount}
                          readOnly
                          placeholder="0"
                          className="w-full rounded-sm border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none"
                        />
                      </div>

                      <div>
                        <label htmlFor="teacherCount" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Teachers
                        </label>
                        <input
                          id="teacherCount"
                          type="number"
                          min={0}
                          step={1}
                          value={form.teacherCount}
                          readOnly
                          placeholder="0"
                          className="w-full rounded-sm border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none"
                        />
                      </div>

                      <div>
                        <label htmlFor="schoolStatus" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Status
                        </label>
                        <select
                          id="schoolStatus"
                          value={form.status}
                          onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as SchoolStatus }))}
                          className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                        >
                          <option value="active">{statusLabel("active")}</option>
                          <option value="inactive">{statusLabel("inactive")}</option>
                          <option value="pending">{statusLabel("pending")}</option>
                        </select>
                      </div>

                    </form>
                  </section>

                  <div className="sticky bottom-2 mt-4 rounded-sm border border-slate-200 bg-white px-3 py-2 shadow-sm">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveDraft()}
                        disabled={isSaving}
                        className="rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Save Draft
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSubmitOrResubmit()}
                        disabled={isSaving}
                        className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {returnedCount > 0 ? "Submit / Resubmit" : "Submit"}
                      </button>
                    </div>
                  </div>
                </section>
              ) : (
                <section id="indicator-workflow" className={sectionFocusClass("indicator-workflow")}>
                  <SchoolIndicatorPanel
                    statusFilter={contextWorkflowStatus}
                    academicYearFilter={contextAcademicYearId}
                  />
                </section>
              )}
            </section>

          </div>
        </section>
      </section>
      )}

      {!showNavigatorManual && activeTopNavigator === "records" && (
      <section id="school-records" className={sectionFocusClass("school-records")}>
        <div className="dashboard-shell mb-5 rounded-sm p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">History & Exports</h2>
              <p className="mt-1 text-xs text-slate-600">Review records and prepare export-ready history.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleExportStudentsCsv()}
                disabled={isExportingRecords}
                className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Download className="h-3.5 w-3.5" />
                {isExportingRecords ? "Exporting..." : "Export Students CSV"}
              </button>
              <button
                type="button"
                onClick={() => void handleExportTeachersCsv()}
                disabled={isExportingRecords}
                className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Download className="h-3.5 w-3.5" />
                {isExportingRecords ? "Exporting..." : "Export Teachers CSV"}
              </button>
              {!isMobileViewport && renderQuickJumpChips(false)}
            </div>
          </div>
          {recordsExportError ? (
            <p className="mt-3 rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {recordsExportError}
            </p>
          ) : recordsExportMessage ? (
            <p className="mt-3 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
              {recordsExportMessage}
            </p>
          ) : null}
          {isMobileViewport && renderQuickJumpChips(true)}
        </div>
        <div id="student-records-history" className={sectionFocusClass("student-records-history")}>
          <StudentRecordsPanel
            editable
            title="Student Records History"
            description="Manage learner records and review historical entries."
          />
        </div>
        <div id="teacher-records-history" className={`mt-5 ${sectionFocusClass("teacher-records-history")}`}>
          <TeacherRecordsPanel
            editable
            title="Teacher Records History"
            description="Manage teacher records for student assignment."
          />
        </div>
      </section>
      )}
      </div>
      </div>
    </Shell>
  );
}




