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
import { SchoolIndicatorPanel } from "@/components/indicators/SchoolIndicatorPanel";
import { StudentRecordsPanel } from "@/components/students/StudentRecordsPanel";
import { useAuth } from "@/context/Auth";
import { useData } from "@/context/Data";
import { useIndicatorData } from "@/context/IndicatorData";
import type { IndicatorSubmission, SchoolRecord, SchoolRecordPayload, SchoolStatus } from "@/types";
import {
  buildRegionAggregates,
  buildStatusDistribution,
  buildSubmissionTrend,
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
  { id: "first_glance", label: "Overview" },
  { id: "requirements", label: "Requirements" },
  { id: "compliance", label: "Compliance Records" },
  { id: "records", label: "School Records" },
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
    title: "Overview",
    objective: "Identify urgent tasks before encoding new data.",
    actions: [
      "Review missing requirements and sync alerts.",
      "Prioritize any module marked as missing or returned.",
    ],
    doneWhen: "No urgent alert remains and you know the next module to open.",
  },
  {
    id: "requirements",
    title: "Requirements",
    objective: "Use one screen to track all required submissions.",
    actions: [
      "Open each requirement tile and check if status is passed or missing.",
      "Jump directly to the related module for missing items.",
    ],
    doneWhen: "All tiles show passed to monitor, or only pending review items remain.",
  },
  {
    id: "compliance",
    title: "Compliance Records",
    objective: "Encode and submit all compliance data from one module.",
    actions: [
      "Update SCHOOL'S ACHIEVEMENTS AND LEARNING OUTCOMES entries for each school year.",
      "Encode and submit compliance indicators.",
    ],
    doneWhen: "SCHOOL'S ACHIEVEMENTS AND LEARNING OUTCOMES entries and indicator package are submitted or validated.",
  },
  {
    id: "records",
    title: "School Records",
    objective: "Confirm final synchronized data before ending session.",
    actions: [
      "Search or filter to verify your latest update row.",
      "Check last updated timestamp and status consistency.",
    ],
    doneWhen: "Table reflects latest values and no mismatch is visible.",
  },
];

const SCHOOL_MANUAL_STATUS_GUIDE = [
  "Draft: Saved but not yet sent to monitor.",
  "Submitted: Sent to monitor and waiting for review.",
  "Validated: Approved by monitor.",
  "Returned: Needs correction and resubmission.",
];

const SCHOOL_QUICK_JUMPS: Record<TopNavigatorItem["id"], QuickJumpItem[]> = {
  first_glance: [
    { id: "overview_alerts", label: "Overview Alerts", targetId: "first-glance", icon: AlertTriangle },
    { id: "school_info", label: "School Info", targetId: "school-overview", icon: Building2 },
    { id: "kpi_cards", label: "Overview Status", targetId: "overview-metrics", icon: LayoutDashboard },
    { id: "advanced_analytics", label: "Advanced Analytics", targetId: "school-analytics-toggle", icon: TrendingUp },
  ],
  requirements: [
    { id: "requirement_cards", label: "Requirement Cards", targetId: "requirement-navigator", icon: ListChecks },
  ],
  compliance: [
    { id: "compliance_input", label: "All Compliance Inputs", targetId: "compliance-input", icon: Database },
  ],
  records: [
    { id: "student_records", label: "Student Records", targetId: "school-records", icon: Users },
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

function navigatorButtonClass(active: boolean): string {
  return `relative flex h-11 w-full items-center gap-2.5 rounded-sm border-l-4 border-r border-y px-3 text-left text-xs font-semibold uppercase leading-none tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-100/80 focus-visible:ring-offset-1 focus-visible:ring-offset-primary-900 ${
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
  const { records, targetsMet, syncAlerts, isLoading, isSaving, error, lastSyncedAt, syncScope, syncStatus, addRecord, updateRecord, refreshRecords } = useData();
  const { submissions: indicatorSubmissions } = useIndicatorData();

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
  const [isNavigatorVisible, setIsNavigatorVisible] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 768));
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < SCHOOL_MOBILE_BREAKPOINT,
  );
  const [showNavigatorManual, setShowNavigatorManual] = useState(false);
  const [showAdvancedAnalytics, setShowAdvancedAnalytics] = useState(false);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);

  const regionAggregates = useMemo(() => buildRegionAggregates(records), [records]);
  const statusDistribution = useMemo(() => buildStatusDistribution(records), [records]);
  const submissionTrend = useMemo(() => buildSubmissionTrend(records), [records]);
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
        primary: missingRequirements.length,
        urgency: missingRequirements.length > 0 ? "high" : "none",
      },
      compliance: {
        primary: pendingCount,
        secondary: returnedCount,
        urgency: returnedCount > 0 ? "high" : pendingCount > 0 ? "medium" : "none",
      },
      records: { urgency: "none" },
    }),
    [missingRequirements.length, pendingCount, returnedCount],
  );
  const shouldRenderNavigatorItems = isMobileViewport ? isNavigatorVisible : true;
  const showNavigatorHeaderText = isNavigatorVisible;

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
      };
      if (persisted.activeTopNavigator && TOP_NAVIGATOR_ITEMS.some((item) => item.id === persisted.activeTopNavigator)) {
        setActiveTopNavigator(persisted.activeTopNavigator);
      }
      if (typeof persisted.isNavigatorVisible === "boolean") {
        setIsNavigatorVisible(persisted.isNavigatorVisible);
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
        JSON.stringify({ activeTopNavigator, isNavigatorVisible }),
      );
    } catch {
      // Ignore storage failures.
    }
  }, [activeTopNavigator, isNavigatorVisible]);

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
    if (targetId === "school-analytics-toggle") {
      return true;
    }

    if (typeof document === "undefined") {
      return true;
    }

    return Boolean(document.getElementById(targetId));
  };

  const handleQuickJump = (targetId: string) => {
    if (targetId === "school-analytics-toggle") {
      if (!showAdvancedAnalytics) {
        setShowAdvancedAnalytics(true);
      }

      window.setTimeout(() => {
        scrollToSection("targets-snapshot");
      }, 80);
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

          return (
            <button
              key={`quick-jump-${item.id}`}
              type="button"
              onClick={() => handleQuickJump(item.targetId)}
              disabled={!isAvailable}
              aria-pressed={isActive}
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
    if (missingRequirements.length > 0) {
      setActiveTopNavigator("requirements");
      return;
    }

    setActiveTopNavigator("records");
  };

  return (
    <Shell
      title="School Head Dashboard"
      subtitle="Overview, requirements, compliance records, and school records."
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
              Continue Pending Requirements
            </button>
            <button
              type="button"
              onClick={handleComplianceAction}
              className="inline-flex h-9 items-center gap-2 rounded-sm border border-white/35 bg-white/95 px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Go to Compliance Inputs
            </button>
          </div>
          <span className="inline-flex max-w-full items-center rounded-sm border border-white/35 bg-white/92 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
            {syncStatus === "up_to_date" ? "Up to date" : "Records updated"}
            {" • "}
            {lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : "Not synced yet"}
            {syncScope ? ` • ${syncScope}` : ""}
          </span>
        </div>
      }
    >
      {error && (
        <section className="mb-5 border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
          {error}
        </section>
      )}

      <div className="dashboard-left-layout mb-5 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-stretch lg:gap-0">
      <aside className="dashboard-side-rail ml-3 rounded-sm p-3 transition-[padding] duration-[700ms] ease-in-out lg:self-stretch lg:rounded-t-none lg:rounded-br-none">
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
                onClick={() => setIsNavigatorVisible((current) => !current)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-primary-400/40 bg-primary-700/65 text-white transition hover:bg-primary-700"
                aria-label={isNavigatorVisible ? "Hide navigator" : "Show navigator"}
                title={isNavigatorVisible ? "Hide navigator" : "Show navigator"}
              >
                {isNavigatorVisible ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
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
            shouldRenderNavigatorItems ? "mt-3 max-h-[28rem] opacity-100" : "mt-0 max-h-0 opacity-0 pointer-events-none"
          }`}
        >
          <div className="grid gap-2">
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
                  className={navigatorButtonClass(isActive)}
                  title={`${item.label} (Alt+${index + 1})`}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`Open ${item.label}`}
                >
                  <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
                    <Icon className="h-4 w-4" />
                    {meta.urgency !== "none" && <span className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${urgencyTone}`} />}
                  </span>
                  <span className="flex-1 truncate text-left">{item.label}</span>
                  {hasPrimaryBadge && (
                    <span className="ml-auto inline-flex items-center gap-1">
                      <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-sm border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">
                        {meta.primary}
                      </span>
                      {item.id === "compliance" && hasSecondaryBadge && (
                        <span className="inline-flex items-center justify-center rounded-sm border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          R{meta.secondary}
                        </span>
                      )}
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
          <div className="border-t border-primary-400/30 pt-3">
              <button
                type="button"
                onClick={() => setShowNavigatorManual((current) => !current)}
                className={`inline-flex w-full items-center justify-center gap-1.5 rounded-sm border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white transition ${
                  showNavigatorManual
                    ? "border-primary-300/80 bg-primary-100/90"
                    : "border-primary-400/40 bg-primary-700/65 hover:bg-primary-700"
                }`}
              >
                <BookOpenText className="h-3.5 w-3.5" />
                Help
                {showNavigatorManual ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
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
                {SCHOOL_MANUAL_STATUS_GUIDE.map((item) => (
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

      {activeTopNavigator === "first_glance" && (
      <section id="first-glance" className={`dashboard-shell mb-5 rounded-sm p-4 ${sectionFocusClass("first-glance")}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Overview Alerts</h2>
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
                All monitor requirements are passed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Action needed before monitor review
              </span>
            )}
            {!isMobileViewport && renderQuickJumpChips(false)}
            <button
              id="school-analytics-toggle"
              type="button"
              onClick={() => setShowAdvancedAnalytics((current) => !current)}
              className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              {showAdvancedAnalytics ? "Hide Analytics" : "Show Analytics"}
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {missingRequirements.length === 0 ? (
            <article className="border border-primary-200 bg-primary-50 px-3 py-3 text-sm text-primary-700">
              No missing submissions. Keep monitoring sync alerts and update compliance counts when needed.
            </article>
          ) : (
            missingRequirements.map((item) => (
              <article key={item.id} className="border border-slate-300 bg-slate-100 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{item.label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{item.summary}</p>
                <p className="mt-1 text-xs text-slate-700">{item.detail}</p>
              </article>
            ))
          )}

          {syncAlerts.slice(0, 2).map((alert) => (
            <article key={alert.id} className="border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{alert.level}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{alert.title}</p>
              <p className="mt-1 text-xs text-slate-600">{alert.message}</p>
            </article>
          ))}
        </div>
      </section>
      )}

      {activeTopNavigator === "requirements" && (
      <section id="requirement-navigator" className={`dashboard-shell mb-5 rounded-sm p-3 ${sectionFocusClass("requirement-navigator")}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Requirements</h2>
          {!isMobileViewport && renderQuickJumpChips(false)}
        </div>
        {isMobileViewport && renderQuickJumpChips(true)}
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {requirements.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleRequirementNavigate(item)}
              className={`border px-3 py-3 text-left transition ${
                item.isComplete
                  ? "border-primary-200 bg-primary-50 hover:bg-primary-100"
                  : "border-slate-300 bg-slate-100 hover:bg-slate-200"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{item.label}</p>
              <p className="mt-1 text-[11px] text-slate-600">{item.summary}</p>
              <p className={`mt-2 text-xs font-bold ${item.isComplete ? "text-primary-700" : "text-slate-700"}`}>
                {item.isComplete ? "Passed to monitor" : "Missing / needs action"}
              </p>
            </button>
          ))}
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
        <StatCard label="Pending" value={pendingCount.toLocaleString()} icon={<AlertCircle className="h-5 w-5" />} />
        <StatCard label="Returned" value={returnedCount.toLocaleString()} icon={<ArrowDown className="h-5 w-5" />} tone="warning" />
        <StatCard label="Submitted" value={submittedCount.toLocaleString()} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
      </section>

      {showAdvancedAnalytics && (
      <>
      <section id="targets-snapshot" className={`mt-5 animate-fade-slide grid gap-4 xl:grid-cols-[1.4fr_1fr] ${sectionFocusClass("targets-snapshot")}`}>
        <div id="sync-alerts-panel" className={`surface-panel dashboard-shell p-5 ${sectionFocusClass("sync-alerts-panel")}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">TARGETS-MET Snapshot</h2>
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
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Sync Alerts for Action</h2>
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
        <div id="status-chart-panel" className={sectionFocusClass("status-chart-panel")}>
          <StatusPieChart data={statusDistribution} />
        </div>
        <div id="region-chart-panel" className={sectionFocusClass("region-chart-panel")}>
          <RegionBarChart data={regionAggregates} />
        </div>
        <div id="trend-chart-panel" className={sectionFocusClass("trend-chart-panel")}>
          <SubmissionTrendChart data={submissionTrend} />
        </div>
      </section>

      {regionAggregates.length > 0 && (
        <section id="regional-breakdown" className={`mt-5 animate-fade-slide ${sectionFocusClass("regional-breakdown")}`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Regional Breakdown</h2>
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

      {activeTopNavigator === "compliance" && (
      <section id="compliance-records" className="grid gap-5">
        <section id="compliance-input" className={sectionFocusClass("compliance-input")}>
          <section className="surface-panel dashboard-shell animate-fade-slide overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">All Compliance Inputs</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Keep this section open and update school summary inputs before submitting indicators below.
                  </p>
                </div>
                {!isMobileViewport && renderQuickJumpChips(false)}
              </div>
              {isMobileViewport && renderQuickJumpChips(true)}
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
                  <div className="mb-3 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
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

            <div id="indicator-workflow" className={`border-t border-slate-200 ${sectionFocusClass("indicator-workflow")}`}>
              <SchoolIndicatorPanel />
            </div>
          </section>
        </section>
      </section>
      )}

      {activeTopNavigator === "records" && (
      <section id="school-records" className={sectionFocusClass("school-records")}>
        <div className="dashboard-shell mb-5 rounded-sm p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">School Records</h2>
              <p className="mt-1 text-xs text-slate-600">Manage learner records for your assigned school.</p>
            </div>
            {!isMobileViewport && renderQuickJumpChips(false)}
          </div>
          {isMobileViewport && renderQuickJumpChips(true)}
        </div>
        <StudentRecordsPanel
          editable
          title="Student Records"
          description="Manage learner records."
        />
      </section>
      )}
      </div>
      </div>
    </Shell>
  );
}
