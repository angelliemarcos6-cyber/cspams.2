import { useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
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
  Edit2,
  Filter,
  RefreshCw,
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
import { useAuth } from "@/context/Auth";
import { useData } from "@/context/Data";
import { useIndicatorData } from "@/context/IndicatorData";
import type { IndicatorSubmission, SchoolRecord, SchoolRecordPayload, SchoolStatus } from "@/types";
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
  { id: "first_glance", label: "My Tasks" },
  { id: "compliance", label: "Submission Workspace" },
  { id: "requirements", label: "Returned & Revisions" },
  { id: "records", label: "History & Exports" },
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
    objective: "Start with today’s high-priority items before entering full details.",
    actions: [
      "Check overdue, returned, and pending monitor items first.",
      "Use quick jump chips to open the exact section that needs action.",
    ],
    doneWhen: "You have a clear priority order for what to encode or revise next.",
  },
  {
    id: "compliance",
    title: "Submission Workspace",
    objective: "Encode required information in one focused working surface.",
    actions: [
      "Update school summary fields and then complete indicator tables.",
      "Use Save Draft often, then submit package to monitor when complete.",
    ],
    doneWhen: "School summary and indicator package are updated and saved without errors.",
  },
  {
    id: "requirements",
    title: "Returned & Revisions",
    objective: "Resolve monitor feedback quickly and resubmit with confidence.",
    actions: [
      "Review returned items and monitor notes in the side panel.",
      "Jump directly to the relevant field and fix missing information.",
    ],
    doneWhen: "Returned items are fixed and ready to resubmit.",
  },
  {
    id: "records",
    title: "History & Exports",
    objective: "Track prior submissions and keep proof records ready.",
    actions: [
      "Review student records and historical updates.",
      "Validate status consistency before sharing reports.",
    ],
    doneWhen: "Historical records are accurate and review-ready.",
  },
];

const SCHOOL_MANUAL_STATUS_GUIDE = [
  "Draft: Saved but not yet sent to monitor.",
  "Submitted: Sent to monitor and waiting for review.",
  "Validated: Approved by monitor.",
  "Needs Revision: Returned by monitor for corrections and resubmission.",
];

const SCHOOL_QUICK_JUMPS: Record<TopNavigatorItem["id"], QuickJumpItem[]> = {
  first_glance: [
    { id: "overview_alerts", label: "Today Focus", targetId: "first-glance", icon: AlertTriangle },
    { id: "school_info", label: "School Info", targetId: "school-overview", icon: Building2 },
    { id: "kpi_cards", label: "Task KPIs", targetId: "overview-metrics", icon: LayoutDashboard },
  ],
  compliance: [
    { id: "compliance_input", label: "Summary Inputs", targetId: "compliance-input", icon: Database },
    { id: "indicator_workflow", label: "Indicator Workflow", targetId: "indicator-workflow", icon: ClipboardList },
  ],
  requirements: [
    { id: "requirement_cards", label: "Returned Items", targetId: "requirement-navigator", icon: ListChecks },
  ],
  records: [
    { id: "student_records", label: "History Records", targetId: "school-records", icon: Users },
  ],
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

export function SchoolAdminDashboard() {
  const { user } = useAuth();
  const { records, syncAlerts, isLoading, isSaving, error, lastSyncedAt, syncScope, syncStatus, addRecord, updateRecord, refreshRecords } = useData();
  const { submissions: indicatorSubmissions, academicYears } = useIndicatorData();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saveMessage, setSaveMessage] = useState("");
  const [submitError, setSubmitError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SchoolStatus | "all">("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>("lastUpdated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [activeTopNavigator, setActiveTopNavigator] = useState<TopNavigatorItem["id"]>("first_glance");
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
  const [selectedRequirementId, setSelectedRequirementId] = useState<RequirementItem["id"]>("school_record");

  const assignedRecord = records[0] ?? null;
  const schoolName = assignedRecord?.schoolName || user?.schoolName || "Unassigned School";
  const schoolCode = assignedRecord?.schoolCode || user?.schoolCode || "N/A";
  const schoolRegion = assignedRecord?.region || "N/A";
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
  const contextDeadline = useMemo(() => {
    if (!latestIndicators?.updatedAt && !latestIndicators?.createdAt) {
      return "Not set";
    }
    const dateValue = latestIndicators.updatedAt ?? latestIndicators.createdAt;
    return dateValue ? new Date(dateValue).toLocaleDateString() : "Not set";
  }, [latestIndicators?.createdAt, latestIndicators?.updatedAt]);
  const latestIndicatorUpdatedAt = latestIndicators?.updatedAt ?? latestIndicators?.createdAt ?? null;
  const activeContextSummary = useMemo(() => {
    const pieces = [
      contextAcademicYearId === "all"
        ? "All school years"
        : academicYears.find((year) => year.id === contextAcademicYearId)?.name ?? "Selected school year",
      contextSubmissionType === "all"
        ? "All submission types"
        : contextSubmissionType === "school_record"
          ? "School record"
          : "Indicator package",
      contextWorkflowStatus === "all"
        ? "All statuses"
        : contextWorkflowStatus === "returned"
          ? "Needs Revision"
          : contextWorkflowStatus.charAt(0).toUpperCase() + contextWorkflowStatus.slice(1),
    ];

    return pieces.join(" | ");
  }, [academicYears, contextAcademicYearId, contextSubmissionType, contextWorkflowStatus]);
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
      if (persisted.activeTopNavigator && TOP_NAVIGATOR_ITEMS.some((item) => item.id === persisted.activeTopNavigator)) {
        setActiveTopNavigator(persisted.activeTopNavigator);
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
      setForm({
        studentCount: record.studentCount.toString(),
        teacherCount: record.teacherCount.toString(),
        status: record.status,
      });
      return;
    }

    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  useEffect(() => {
    syncComplianceForm(assignedRecord);
  }, [
    assignedRecord?.id,
    assignedRecord?.studentCount,
    assignedRecord?.teacherCount,
    assignedRecord?.status,
  ]);

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
    setActiveTopNavigator(item.navigatorId);
    if (isMobileViewport) {
      setIsNavigatorVisible(false);
    }
    if (typeof window !== "undefined") {
      const targetId = item.id === "school_record" ? "compliance-input" : "indicator-workflow";
      window.setTimeout(() => scrollToSection(targetId), 60);
    }
  };

  const handleTopNavigate = (item: TopNavigatorItem) => {
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

    return Boolean(document.getElementById(targetId));
  };

  const handleQuickJump = (targetId: string) => {
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

    const students = Number(form.studentCount);
    if (!Number.isFinite(students) || students < 0 || !Number.isInteger(students)) {
      errors.studentCount = "Use a valid non-negative whole number.";
    }

    const teachers = Number(form.teacherCount);
    if (!Number.isFinite(teachers) || teachers < 0 || !Number.isInteger(teachers)) {
      errors.teacherCount = "Use a valid non-negative whole number.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    const payload: SchoolRecordPayload = {
      studentCount: Number(form.studentCount),
      teacherCount: Number(form.teacherCount),
      status: form.status,
    };

    try {
      if (editingId) {
        await updateRecord(editingId, payload);
        setSaveMessage("Record updated successfully.");
      } else {
        await addRecord(payload);
        setSaveMessage("Record submitted successfully.");
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unable to save record.");
      return;
    }
  };

  const handleComplianceAction = () => {
    setActiveTopNavigator("compliance");
    if (typeof window !== "undefined") {
      window.setTimeout(() => scrollToSection("compliance-input"), 60);
    }
  };

  const handleContinuePendingRequirements = () => {
    if (returnedCount > 0) {
      setActiveTopNavigator("requirements");
      return;
    }

    setActiveTopNavigator("compliance");
  };

  const clearTopContext = () => {
    setContextAcademicYearId("all");
    setContextSubmissionType("all");
    setContextWorkflowStatus("all");
    setSearch("");
    setStatusFilter("all");
    setFocusedSectionId(null);
  };

  return (
    <Shell
      title="School Head Dashboard"
      subtitle="My tasks, submission workspace, revisions, and history."
      actions={
        <div className="flex min-w-0 flex-col gap-2 lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshRecords()}
              className="inline-flex h-9 items-center gap-2 rounded-sm border border-white/35 bg-white/95 px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleContinuePendingRequirements}
              className="inline-flex h-9 items-center gap-2 rounded-sm border border-primary-300/50 bg-primary px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-600"
            >
              <ListChecks className="h-3.5 w-3.5" />
              Open Returned & Revisions
            </button>
            <button
              type="button"
              onClick={handleComplianceAction}
              className="inline-flex h-9 items-center gap-2 rounded-sm border border-white/35 bg-white/95 px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Open Submission Workspace
            </button>
          </div>
          <span className="inline-flex max-w-full items-center rounded-sm border border-white/35 bg-white/92 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
            {syncStatus === "up_to_date" ? "Up to date" : "Records updated"}
            {" | "}
            {lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : "Not synced yet"}
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
        <div className="flex min-h-full flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className={`w-full ${showNavigatorHeaderText ? "" : "text-center"}`}>
            <div className={`flex items-center ${showNavigatorHeaderText ? "justify-between" : "justify-center"}`}>
              <h2
                className={`overflow-hidden whitespace-nowrap text-sm font-bold uppercase tracking-wide text-white transition-[max-width,opacity] duration-[700ms] ease-in-out ${
                  showNavigatorHeaderText ? "max-w-[11rem] opacity-100" : "max-w-0 opacity-0"
                }`}
              >
                Navigator
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (isMobileViewport) {
                    setIsNavigatorVisible((current) => !current);
                    return;
                  }
                  setIsNavigatorCompact((current) => !current);
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-primary-400/40 bg-primary-700/65 text-white transition hover:bg-primary-700"
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
        </div>
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
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">School Head Navigator Manual</p>
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
              {SCHOOL_NAVIGATOR_MANUAL.map((step, index) => (
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
                      <li key={`${step.id}-${action}`} className="ml-4 list-disc text-xs text-slate-600">
                        {action}
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
                {SCHOOL_MANUAL_STATUS_GUIDE.map((item) => (
                  <li key={item} className="ml-4 list-disc text-xs text-slate-600">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </aside>
        </>
      )}

      <section className="dashboard-shell sticky top-2 z-20 mb-5 rounded-sm border border-slate-200 bg-white/95">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Top Context Bar</h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Keep one context while switching modes to avoid re-filtering.
              </p>
            </div>
            <button
              type="button"
              onClick={clearTopContext}
              className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Clear all
            </button>
          </div>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">School Year / Period</span>
            <select
              value={contextAcademicYearId}
              onChange={(event) => setContextAcademicYearId(event.target.value)}
              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            >
              <option value="all">All school years (Annual)</option>
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                  {year.isCurrent ? " (Current)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Submission Type</span>
            <select
              value={contextSubmissionType}
              onChange={(event) => setContextSubmissionType(event.target.value as "all" | "school_record" | "indicator_package")}
              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            >
              <option value="all">All submissions</option>
              <option value="school_record">School record</option>
              <option value="indicator_package">Indicator package</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Deadline</span>
            <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{contextDeadline}</div>
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
        </div>
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-600">
          Active context: <span className="font-semibold text-slate-800">{activeContextSummary}</span>
        </p>
      </section>

      {activeTopNavigator === "first_glance" && (
      <section id="first-glance" className={`dashboard-shell mb-5 rounded-sm p-4 ${sectionFocusClass("first-glance")}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">My Tasks</h2>
            <p className="mt-1 text-xs text-slate-600">
              Missing requirements: <span className="font-bold text-slate-900">{missingRequirements.length}</span> of{" "}
              <span className="font-bold text-slate-900">{requirements.length}</span>
            </p>
            {isMobileViewport && renderQuickJumpChips(true)}
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            {missingRequirements.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                No urgent task right now
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Action needed before monitor review
              </span>
            )}
            {!isMobileViewport && renderQuickJumpChips(false)}
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {missingRequirements.length === 0 ? (
            <article className="dashboard-subtle-panel px-3 py-3 text-sm text-slate-700">
              No missing submissions right now.
            </article>
          ) : (
            missingRequirements.map((item) => (
              <article key={item.id} className="dashboard-subtle-panel px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{item.label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{item.summary}</p>
                <p className="mt-1 text-xs text-slate-700">{item.detail}</p>
              </article>
            ))
          )}

          {syncAlerts.slice(0, 2).map((alert) => (
            <article key={alert.id} className="dashboard-subtle-panel px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{alert.level}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{alert.title}</p>
              <p className="mt-1 text-xs text-slate-600">{alert.message}</p>
            </article>
          ))}
        </div>
      </section>
      )}

      {activeTopNavigator === "requirements" && (
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

      {activeTopNavigator === "first_glance" && (
      <>
      <section id="school-overview" className={`mb-5 animate-fade-slide grid gap-3 md:grid-cols-3 ${sectionFocusClass("school-overview")}`}>
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
      </>
      )}

      {activeTopNavigator === "compliance" && (
      <section id="compliance-records" className="grid gap-5">
        <section className="dashboard-shell overflow-hidden rounded-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Submission Workspace</h2>
                <p className="mt-0.5 text-xs text-slate-600">Checklist and summary form on top, full-width compliance indicators below.</p>
              </div>
              {!isMobileViewport && renderQuickJumpChips(false)}
            </div>
            {isMobileViewport && renderQuickJumpChips(true)}
          </div>
          <div className="grid gap-4 p-4 xl:grid-cols-[14rem_minmax(0,1fr)]">
            <aside className="rounded-sm border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Section Checklist</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{workspaceCompletion}% complete</p>
              <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                <div className="h-1.5 rounded-full bg-primary transition-[width] duration-300" style={{ width: `${workspaceCompletion}%` }} />
              </div>
              <div className="mt-3 space-y-2">
                {requirements.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleRequirementNavigate(item)}
                    className={`w-full rounded-sm border px-2.5 py-2 text-left text-xs transition ${
                      item.isComplete
                        ? "border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100"
                        : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    }`}
                  >
                    <p className="font-semibold uppercase tracking-wide">{item.label}</p>
                    <p className="mt-1 text-[11px]">{item.isComplete ? "Passed to monitor" : "Needs action"}</p>
                  </button>
                ))}
              </div>
            </aside>

            <section id="compliance-input" className={sectionFocusClass("compliance-input")}>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
                <section className="surface-panel animate-fade-slide overflow-hidden rounded-sm border border-slate-200 bg-white">
                  {contextSubmissionType !== "indicator_package" ? (
                    <>
                      <div className="border-b border-slate-200 px-5 py-4">
                        <h3 className="text-base font-bold text-slate-900">School Summary Input</h3>
                        <p className="mt-0.5 text-xs text-slate-500">Complete required fields first, then continue to indicators below.</p>
                      </div>
                      <form className="grid gap-4 p-5 md:grid-cols-3" onSubmit={handleFormSubmit}>
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
                            onChange={(event) => {
                              setForm((current) => ({ ...current, studentCount: event.target.value }));
                              setFormErrors((current) => ({ ...current, studentCount: undefined }));
                              setSubmitError("");
                            }}
                            placeholder="0"
                            className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                          />
                          {formErrors.studentCount && <p className="mt-1 text-xs text-primary-700">{formErrors.studentCount}</p>}
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
                            onChange={(event) => {
                              setForm((current) => ({ ...current, teacherCount: event.target.value }));
                              setFormErrors((current) => ({ ...current, teacherCount: undefined }));
                              setSubmitError("");
                            }}
                            placeholder="0"
                            className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                          />
                          {formErrors.teacherCount && <p className="mt-1 text-xs text-primary-700">{formErrors.teacherCount}</p>}
                        </div>

                        <div>
                          <label htmlFor="schoolStatus" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                            Status
                          </label>
                          <select
                            id="schoolStatus"
                            value={form.status}
                            onChange={(event) => {
                              setForm((current) => ({ ...current, status: event.target.value as SchoolStatus }));
                            }}
                            className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                          >
                            <option value="active">{statusLabel("active")}</option>
                            <option value="inactive">{statusLabel("inactive")}</option>
                            <option value="pending">{statusLabel("pending")}</option>
                          </select>
                        </div>

                        <div className="md:col-span-3">
                          {saveMessage && (
                            <div className="mb-3 inline-flex items-center gap-2 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
                              <CheckCircle2 className="h-4 w-4" />
                              {saveMessage}
                            </div>
                          )}
                          {submitError && (
                            <div className="mb-3 rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                              {submitError}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="submit"
                              disabled={isSaving}
                              className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              <Save className="h-4 w-4" />
                              {isSaving ? "Saving..." : editingId ? "Save Changes" : "Save School Record"}
                            </button>
                            <button
                              type="button"
                              onClick={resetForm}
                              className="inline-flex items-center gap-2 rounded-sm border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              <X className="h-4 w-4" />
                              Reset Fields
                            </button>
                          </div>
                        </div>
                      </form>
                    </>
                  ) : (
                    <div className="border-b border-slate-200 px-5 py-4">
                      <h3 className="text-base font-bold text-slate-900">Indicator Package Focus</h3>
                      <p className="mt-0.5 text-xs text-slate-500">School summary form is hidden while submission type is set to indicator package.</p>
                    </div>
                  )}
                </section>

                <aside className="rounded-sm border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Guidance Drawer</p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Monitor Notes</p>
                  <p className="mt-1 text-xs text-slate-700">{latestIndicators?.reviewNotes || "No monitor note for the latest package."}</p>

                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Missing Fields</p>
                  {Object.keys(formErrors).length === 0 ? (
                    <p className="mt-1 text-xs text-slate-600">No missing required fields in school summary.</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {Object.values(formErrors).filter(Boolean).map((entry) => (
                        <li key={entry} className="text-xs text-rose-700">
                          {entry}
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Previous Cycle</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {latestIndicators
                      ? `Latest package #${latestIndicators.id} is ${latestIndicators.statusLabel} with ${latestIndicators.summary.complianceRatePercent.toFixed(2)}% compliance.`
                      : "No previous indicator package yet."}
                  </p>

                  <button
                    type="button"
                    onClick={() => setActiveTopNavigator("requirements")}
                    className="mt-3 inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Open Returned & Revisions
                  </button>
                </aside>
              </div>
            </section>
          </div>

          <div id="indicator-workflow" className={`border-t border-slate-200 ${sectionFocusClass("indicator-workflow")}`}>
            {contextSubmissionType === "school_record" ? (
              <div className="px-5 py-4 text-sm text-slate-600">
                Indicator workflow is hidden while submission type is set to school record.
              </div>
            ) : (
              <SchoolIndicatorPanel
                statusFilter={contextWorkflowStatus}
                academicYearFilter={contextAcademicYearId}
              />
            )}
          </div>
        </section>
      </section>
      )}

      {activeTopNavigator === "records" && (
      <section id="school-records" className={sectionFocusClass("school-records")}>
        <div className="dashboard-shell mb-5 rounded-sm p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">History & Exports</h2>
              <p className="mt-1 text-xs text-slate-600">Review records and prepare export-ready history.</p>
            </div>
            {!isMobileViewport && renderQuickJumpChips(false)}
          </div>
          {isMobileViewport && renderQuickJumpChips(true)}
        </div>
        <StudentRecordsPanel
          editable
          title="Student Records History"
          description="Manage learner records and review historical entries."
        />
      </section>
      )}
      </div>
      </div>
    </Shell>
  );
}



