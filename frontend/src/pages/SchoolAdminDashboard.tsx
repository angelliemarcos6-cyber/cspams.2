import { useMemo, useState, type ComponentType, type FormEvent } from "react";
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
  GraduationCap,
  Plus,
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
import { SchoolFormsPanel } from "@/components/forms/SchoolFormsPanel";
import { SchoolIndicatorPanel } from "@/components/indicators/SchoolIndicatorPanel";
import { StudentRecordsPanel } from "@/components/students/StudentRecordsPanel";
import { useAuth } from "@/context/Auth";
import { useData } from "@/context/Data";
import { useFormData } from "@/context/FormData";
import { useIndicatorData } from "@/context/IndicatorData";
import type { FormSubmission, IndicatorSubmission, SchoolRecord, SchoolRecordPayload, SchoolStatus } from "@/types";
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
  id: "school_record" | "sf1" | "sf5" | "indicators";
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
}


const TOP_NAVIGATOR_ITEMS: TopNavigatorItem[] = [
  { id: "first_glance", label: "Overview" },
  { id: "requirements", label: "Requirements" },
  { id: "compliance", label: "Compliance Record" },
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
    title: "Compliance Record",
    objective: "Encode and submit all compliance data from one module.",
    actions: [
      "Update school profile counts such as students, teachers, and school status.",
      "Generate and submit SF-1/SF-5 and encode compliance indicators.",
    ],
    doneWhen: "School profile, SF forms, and indicator package are all submitted or validated.",
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
    { id: "overview_alerts", label: "Overview Alerts", targetId: "first-glance" },
    { id: "school_info", label: "School Info", targetId: "school-overview" },
    { id: "kpi_cards", label: "KPI Cards", targetId: "overview-metrics" },
    { id: "targets_snapshot", label: "TARGETS-MET", targetId: "targets-snapshot" },
    { id: "sync_alerts", label: "Sync Alerts", targetId: "sync-alerts-panel" },
    { id: "status_chart", label: "Status Distribution", targetId: "status-chart-panel" },
  ],
  requirements: [
    { id: "requirement_cards", label: "Requirement Cards", targetId: "requirement-navigator" },
  ],
  compliance: [
    { id: "compliance_modules", label: "Modules", targetId: "compliance-modules" },
    { id: "compliance_input", label: "School Profile Input", targetId: "compliance-input" },
    { id: "forms_queue", label: "SF-1 / SF-5", targetId: "forms-workflow" },
    { id: "indicators_queue", label: "Indicators", targetId: "indicator-workflow" },
  ],
  records: [
    { id: "student_records", label: "Student Records", targetId: "school-records" },
  ],
};

const EMPTY_FORM: FormState = {
  studentCount: "",
  teacherCount: "",
  status: "active",
};

function statusTone(status: SchoolStatus) {
  if (status === "active") return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300";
  if (status === "pending") return "bg-amber-100 text-amber-700 ring-1 ring-amber-300";
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
  return `flex w-full items-center gap-2 rounded-sm border px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide transition ${
    active
      ? "border-cyan-300/80 bg-cyan-400/20 text-white shadow-[inset_0_0_0_1px_rgba(125,211,252,0.6)]"
      : "border-primary-700/80 bg-primary-900/35 text-primary-100 hover:bg-primary-700/70 hover:text-white"
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

function buildWorkflowDetail(label: string, submission: FormSubmission | IndicatorSubmission | null): string {
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
  const { sf1Submissions, sf5Submissions } = useFormData();
  const { submissions: indicatorSubmissions } = useIndicatorData();

  const [showForm, setShowForm] = useState(false);
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
  const [showNavigatorManual, setShowNavigatorManual] = useState(false);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const activeNavigatorLabel = useMemo(
    () => TOP_NAVIGATOR_ITEMS.find((item) => item.id === activeTopNavigator)?.label ?? "Overview",
    [activeTopNavigator],
  );

  const totalStudents = useMemo(() => records.reduce((total, record) => total + record.studentCount, 0), [records]);
  const totalTeachers = useMemo(() => records.reduce((total, record) => total + record.teacherCount, 0), [records]);
  const activeSchools = useMemo(() => records.filter((record) => record.status === "active").length, [records]);

  const regionAggregates = useMemo(() => buildRegionAggregates(records), [records]);
  const statusDistribution = useMemo(() => buildStatusDistribution(records), [records]);
  const submissionTrend = useMemo(() => buildSubmissionTrend(records), [records]);
  const assignedRecord = records[0] ?? null;
  const schoolName = assignedRecord?.schoolName || user?.schoolName || "Unassigned School";
  const schoolCode = assignedRecord?.schoolCode || user?.schoolCode || "N/A";
  const schoolRegion = assignedRecord?.region || "N/A";
  const latestSf1 = useMemo(() => latestSubmission(sf1Submissions), [sf1Submissions]);
  const latestSf5 = useMemo(() => latestSubmission(sf5Submissions), [sf5Submissions]);
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
        id: "sf1",
        label: "Digital SF-1",
        summary: "Generate and submit SF-1 to monitor.",
        detail: buildWorkflowDetail("SF-1", latestSf1),
        isComplete: isPassedToMonitor(latestSf1?.status),
        navigatorId: "compliance",
      },
      {
        id: "sf5",
        label: "Digital SF-5",
        summary: "Generate and submit SF-5 to monitor.",
        detail: buildWorkflowDetail("SF-5", latestSf5),
        isComplete: isPassedToMonitor(latestSf5?.status),
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
    [assignedRecord, latestIndicators, latestSf1, latestSf5],
  );

  const missingRequirements = useMemo(
    () => requirements.filter((item) => !item.isComplete),
    [requirements],
  );
  const completedRequirements = requirements.length - missingRequirements.length;
  const completionPercent = requirements.length === 0 ? 0 : Math.round((completedRequirements / requirements.length) * 100);
  const activeStep = Math.max(1, TOP_NAVIGATOR_ITEMS.findIndex((item) => item.id === activeTopNavigator) + 1);
  const nextRequirement = missingRequirements[0]?.label ?? "All requirements passed";
  const quickJumpItems = useMemo(
    () => SCHOOL_QUICK_JUMPS[activeTopNavigator] ?? [],
    [activeTopNavigator],
  );

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
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setSaveMessage("");
    setSubmitError("");
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const openForEdit = (record: SchoolRecord) => {
    setEditingId(record.id);
    setForm({
      studentCount: record.studentCount.toString(),
      teacherCount: record.teacherCount.toString(),
      status: record.status,
    });
    setFormErrors({});
    setSaveMessage("");
    setSubmitError("");
    setShowForm(true);
  };

  const openForCreate = () => {
    if (records.length > 0) {
      openForEdit(records[0]);
      return;
    }
    resetForm();
    setShowForm(true);
  };

  const handleRequirementNavigate = (item: RequirementItem) => {
    setActiveTopNavigator(item.navigatorId);

    if (item.id === "school_record") {
      openForCreate();
    }
  };

  const handleTopNavigate = (item: TopNavigatorItem) => {
    setActiveTopNavigator(item.id);
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

  const handleQuickJump = (targetId: string) => {
    scrollToSection(targetId);
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

    setTimeout(() => {
      closeForm();
    }, 900);
  };

  const isComplianceView = activeTopNavigator === "compliance";
  const isComplianceFormVisible = isComplianceView && showForm;

  const handleComplianceAction = () => {
    if (isComplianceFormVisible) {
      closeForm();
      return;
    }

    setActiveTopNavigator("compliance");
    openForCreate();
  };

  return (
    <Shell
      title="School Head Dashboard"
      subtitle="Overview, requirements, compliance, and records."
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
            onClick={handleComplianceAction}
            className={`inline-flex items-center gap-2 rounded-sm px-3 py-2 text-xs font-semibold transition ${
              isComplianceFormVisible
                ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                : "bg-primary text-white hover:bg-primary-600"
            }`}
          >
            {isComplianceFormVisible ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {isComplianceFormVisible ? "Close Input Form" : records.length > 0 ? "Update Compliance Data" : "Input Compliance Data"}
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
        <section className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </section>
      )}

      <div className="dashboard-left-layout mb-5 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-0">
      <aside className="rounded-sm border border-primary-700/80 bg-gradient-to-b from-primary-900 via-primary-800 to-primary-900 p-3 shadow-xl shadow-primary-900/35 lg:sticky lg:top-24 lg:min-h-[calc(100vh-7.5rem)] lg:rounded-t-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-white">Navigator</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsNavigatorVisible((current) => !current)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-primary-400/40 bg-primary-700/65 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-primary-700"
            >
              {isNavigatorVisible ? "Hide Navigator" : "Show Navigator"}
              {isNavigatorVisible ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setShowNavigatorManual((current) => !current)}
              className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white transition ${
                showNavigatorManual
                  ? "border-cyan-300/80 bg-cyan-400/25"
                  : "border-primary-400/40 bg-primary-700/65 hover:bg-primary-700"
              }`}
            >
              <BookOpenText className="h-3.5 w-3.5" />
              User Manual
              {showNavigatorManual ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        {isNavigatorVisible && (
          <>
            <div className="mt-3 grid gap-2">
              {TOP_NAVIGATOR_ITEMS.map((item) => {
                const Icon = SCHOOL_NAVIGATOR_ICONS[item.id];
                return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTopNavigate(item)}
                  className={navigatorButtonClass(activeTopNavigator === item.id)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-primary-100">
              Current view:
              {" "}
              <span className="rounded-sm border border-primary-400/45 bg-primary-700/60 px-2 py-1 font-semibold uppercase tracking-wide text-white">
                {activeNavigatorLabel}
              </span>
            </p>
          </>
        )}
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
                  <p className="mt-2 text-[11px] text-emerald-700">Done when: {step.doneWhen}</p>
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

      <section className="dashboard-workflow-hero mb-5 rounded-sm p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="dashboard-workflow-step inline-flex items-center gap-2 rounded-sm px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary-700">
              Workflow Step {activeStep} of {TOP_NAVIGATOR_ITEMS.length}
            </p>
            <h2 className="mt-2 text-xl font-extrabold text-slate-900">{activeNavigatorLabel}</h2>

            <div className="mt-3 flex flex-wrap gap-2">
              {TOP_NAVIGATOR_ITEMS.map((item, index) => {
                const Icon = SCHOOL_NAVIGATOR_ICONS[item.id];
                const isActive = activeTopNavigator === item.id;
                return (
                  <button
                    key={`workflow-chip-${item.id}`}
                    type="button"
                    onClick={() => handleTopNavigate(item)}
                    className={`dashboard-workflow-chip inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold transition ${
                      isActive
                        ? "border-primary-300 bg-primary-50 text-primary-800"
                        : "border-slate-200 bg-white text-slate-600 hover:border-primary-200 hover:text-primary-700"
                    }`}
                  >
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-slate-100 text-[10px] font-bold text-slate-600">
                      {index + 1}
                    </span>
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            {quickJumpItems.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quick Jump</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {quickJumpItems.map((item) => (
                  <button
                    key={`quick-jump-${item.id}`}
                    type="button"
                    onClick={() => handleQuickJump(item.targetId)}
                    className="rounded-sm border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[24rem]">
            <article className="dashboard-workflow-tile rounded-sm px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Completion</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{completionPercent}%</p>
              <p className="text-xs text-slate-600">{completedRequirements}/{requirements.length}</p>
            </article>
            <article className="dashboard-workflow-tile rounded-sm px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next Action</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{nextRequirement}</p>
            </article>
            <article className="dashboard-workflow-tile rounded-sm px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sync</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{syncStatus === "up_to_date" ? "Up to date" : "Pending update"}</p>
              <p className="text-xs text-slate-600">{lastSyncedAt ? formatDateTime(lastSyncedAt) : "--"}</p>
            </article>
          </div>
        </div>
      </section>

      {activeTopNavigator === "compliance" && (
      <section className="dashboard-shell mb-4 rounded-sm p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Compliance Workflow Navigator</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => scrollToSection("compliance-input")}
            className="rounded-sm border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
          >
            1. School Profile Input
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("forms-workflow")}
            className="rounded-sm border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
          >
            2. SF-1 / SF-5 Forms
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("indicator-workflow")}
            className="rounded-sm border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
          >
            3. Indicators
          </button>
        </div>
      </section>
      )}

      {activeTopNavigator === "first_glance" && (
      <section id="first-glance" className={`dashboard-shell mb-5 rounded-sm p-4 ${sectionFocusClass("first-glance")}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Overview Alerts</h2>
            <p className="mt-1 text-xs text-slate-600">
              Missing requirements: <span className="font-bold text-slate-900">{missingRequirements.length}</span> of{" "}
              <span className="font-bold text-slate-900">{requirements.length}</span>
            </p>
          </div>
          {missingRequirements.length === 0 ? (
            <span className="inline-flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              All monitor requirements are passed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Action needed before monitor review
            </span>
          )}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {missingRequirements.length === 0 ? (
            <article className="border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
              No missing submissions. Keep monitoring sync alerts and update compliance counts when needed.
            </article>
          ) : (
            missingRequirements.map((item) => (
              <article key={item.id} className="border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{item.label}</p>
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
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Requirements</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {requirements.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleRequirementNavigate(item)}
              className={`border px-3 py-3 text-left transition ${
                item.isComplete
                  ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                  : "border-amber-200 bg-amber-50 hover:bg-amber-100"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{item.label}</p>
              <p className="mt-1 text-[11px] text-slate-600">{item.summary}</p>
              <p className={`mt-2 text-xs font-bold ${item.isComplete ? "text-emerald-700" : "text-amber-700"}`}>
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

      <section id="overview-metrics" className={`animate-fade-slide grid gap-4 sm:grid-cols-2 xl:grid-cols-4 ${sectionFocusClass("overview-metrics")}`}>
        <StatCard label="Total Schools" value={records.length.toLocaleString()} icon={<Building2 className="h-5 w-5" />} />
        <StatCard
          label="Total Students"
          value={totalStudents.toLocaleString()}
          icon={<GraduationCap className="h-5 w-5" />}
        />
        <StatCard label="Total Teachers" value={totalTeachers.toLocaleString()} icon={<Users className="h-5 w-5" />} />
        <StatCard
          label="Active Schools"
          value={activeSchools.toLocaleString()}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="success"
        />
      </section>

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

      {activeTopNavigator === "compliance" && (
      <section id="compliance-records" className="grid gap-5">
        <section id="compliance-modules" className={`dashboard-shell rounded-sm p-4 ${sectionFocusClass("compliance-modules")}`}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Compliance Record Modules</h2>
        </section>

        <section id="compliance-input" className={sectionFocusClass("compliance-input")}>
          {showForm ? (
          <section className="surface-panel dashboard-shell animate-fade-slide overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">{editingId ? "Edit School Record" : "Add School Record"}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {editingId ? "Update your latest school compliance figures." : "Encode your school compliance figures."}
              </p>
            </div>

            <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={handleFormSubmit}>
              <div>
                <label htmlFor="studentCount" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Student Count
                </label>
                <div className="relative">
                  <GraduationCap className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                    className="w-full rounded-sm border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                {formErrors.studentCount && <p className="mt-1 text-xs text-red-600">{formErrors.studentCount}</p>}
              </div>

              <div>
                <label htmlFor="teacherCount" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Teacher Count
                </label>
                <div className="relative">
                  <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                    className="w-full rounded-sm border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                {formErrors.teacherCount && <p className="mt-1 text-xs text-red-600">{formErrors.teacherCount}</p>}
              </div>

              <div>
                <p className="mb-1.5 block text-sm font-semibold text-slate-700">Status</p>
                <div className="inline-flex w-full rounded-sm border border-slate-200 bg-slate-50 p-1">
                  {(["active", "inactive", "pending"] as const).map((statusOption) => (
                    <button
                      key={statusOption}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, status: statusOption }))}
                      className={`flex-1 rounded-sm px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                        form.status === statusOption ? "bg-white text-primary shadow-sm" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {statusLabel(statusOption)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2">
                {saveMessage && (
                  <div className="mb-3 inline-flex items-center gap-2 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    {saveMessage}
                  </div>
                )}
                {submitError && (
                  <div className="mb-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
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
                    onClick={closeForm}
                    className="inline-flex items-center gap-2 rounded-sm border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </section>
          ) : (
            <section className="dashboard-shell rounded-sm p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">School Profile Input</h2>
            </section>
          )}
        </section>

        <section id="forms-workflow" className={sectionFocusClass("forms-workflow")}>
          <SchoolFormsPanel />
        </section>

        <section id="indicator-workflow" className={sectionFocusClass("indicator-workflow")}>
          <SchoolIndicatorPanel />
        </section>
      </section>
      )}

      {activeTopNavigator === "records" && (
      <section id="school-records" className={sectionFocusClass("school-records")}>
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




