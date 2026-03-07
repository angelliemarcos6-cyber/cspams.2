import { useMemo, useState, type FormEvent } from "react";
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
  id: "first_glance" | "requirements" | "compliance" | "forms" | "indicators" | "records";
  label: string;
}

interface ManualStep {
  id: string;
  title: string;
  instruction: string;
}

const TOP_NAVIGATOR_ITEMS: TopNavigatorItem[] = [
  { id: "first_glance", label: "First Glance" },
  { id: "requirements", label: "Requirement Navigator" },
  { id: "compliance", label: "Compliance Record" },
  { id: "forms", label: "SF-1 / SF-5" },
  { id: "indicators", label: "Compliance Indicators" },
  { id: "records", label: "School Records" },
];

const SCHOOL_NAVIGATOR_MANUAL: ManualStep[] = [
  {
    id: "first_glance",
    title: "First Glance",
    instruction: "Check missing requirements and sync alerts first before encoding or submitting.",
  },
  {
    id: "requirements",
    title: "Requirement Navigator",
    instruction: "Open each requirement card and complete anything marked as missing.",
  },
  {
    id: "compliance",
    title: "Compliance Record",
    instruction: "Update school counts and status, then save the record for monitor visibility.",
  },
  {
    id: "forms",
    title: "SF-1 / SF-5",
    instruction: "Generate forms, review values, and submit drafts to the monitor for validation.",
  },
  {
    id: "indicators",
    title: "Compliance Indicators",
    instruction: "Encode indicator values, create the package draft, then submit for review.",
  },
  {
    id: "records",
    title: "School Records",
    instruction: "Review the final record table and confirm the latest updates are correct.",
  },
];

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
  return `dashboard-nav-button px-3 py-3 text-left text-xs font-semibold uppercase transition ${
    active ? "dashboard-nav-button-active" : ""
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
  const [showNavigatorManual, setShowNavigatorManual] = useState(false);
  const activeNavigatorLabel = useMemo(
    () => TOP_NAVIGATOR_ITEMS.find((item) => item.id === activeTopNavigator)?.label ?? "First Glance",
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
        navigatorId: "forms",
      },
      {
        id: "sf5",
        label: "Digital SF-5",
        summary: "Generate and submit SF-5 to monitor.",
        detail: buildWorkflowDetail("SF-5", latestSf5),
        isComplete: isPassedToMonitor(latestSf5?.status),
        navigatorId: "forms",
      },
      {
        id: "indicators",
        label: "Indicator Package",
        summary: "Encode indicators and submit to monitor.",
        detail: buildWorkflowDetail("Indicator package", latestIndicators),
        isComplete: isPassedToMonitor(latestIndicators?.status),
        navigatorId: "indicators",
      },
    ],
    [assignedRecord, latestIndicators, latestSf1, latestSf5],
  );

  const missingRequirements = useMemo(
    () => requirements.filter((item) => !item.isComplete),
    [requirements],
  );

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records
      .filter((record) => {
        const matchesSearch =
          query.length === 0 ||
          record.schoolName.toLowerCase().includes(query) ||
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
      subtitle="Start with missing requirements, then submit SF forms and indicators required by the division monitor."
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

      <section className="dashboard-nav-shell mb-5 rounded-sm p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Top Navigator</h2>
            <p className="mt-1 text-xs text-slate-600">Select what you need to do now.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowNavigatorManual((current) => !current)}
            className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition ${
              showNavigatorManual
                ? "border-primary-200 bg-primary-50 text-primary-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <BookOpenText className="h-3.5 w-3.5" />
            User Manual
            {showNavigatorManual ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {TOP_NAVIGATOR_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleTopNavigate(item)}
              className={navigatorButtonClass(activeTopNavigator === item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Current view:
          {" "}
          <span className="rounded-sm border border-slate-200 bg-white px-2 py-1 font-semibold uppercase tracking-wide text-slate-700">
            {activeNavigatorLabel}
          </span>
        </p>
      </section>

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
                  <p className="mt-1 text-xs text-slate-600">{step.instruction}</p>
                </li>
              ))}
            </ol>
          </div>
        </aside>
        </>
      )}

      {activeTopNavigator === "first_glance" && (
      <section id="first-glance" className="dashboard-shell mb-5 rounded-sm p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">First-Glance Alerts</h2>
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
      <section id="requirement-navigator" className="dashboard-shell mb-5 rounded-sm p-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Requirement Navigator</h2>
        <p className="mt-1 text-xs text-slate-600">Open each requirement module and submit what is missing.</p>
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
      <section id="school-overview" className="mb-5 animate-fade-slide grid gap-3 md:grid-cols-3">
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

      <section className="animate-fade-slide grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <section id="targets-snapshot" className="mt-5 animate-fade-slide grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="surface-panel dashboard-shell p-5">
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
        <StatusPieChart data={statusDistribution} />
        <RegionBarChart data={regionAggregates} />
        <SubmissionTrendChart data={submissionTrend} />
      </section>

      {regionAggregates.length > 0 && (
        <section className="mt-5 animate-fade-slide">
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
      <section id="compliance-input">
        {showForm ? (
        <section className="surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden">
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
          <section className="dashboard-shell mt-5 rounded-sm p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Compliance Input</h2>
            <p className="mt-2 text-sm text-slate-600">
              Use the `Update Compliance Data` button above to encode students, teachers, and status for your school.
            </p>
          </section>
        )}
      </section>
      )}

      {activeTopNavigator === "forms" && (
      <section id="forms-workflow">
        <SchoolFormsPanel />
      </section>
      )}

      {activeTopNavigator === "indicators" && (
      <section id="indicator-workflow">
        <SchoolIndicatorPanel />
      </section>
      )}

      {activeTopNavigator === "records" && (
      <section id="school-records" className="surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden rounded-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">School Records</h2>
          <p className="mt-0.5 text-xs text-slate-500">Manage and update synchronized school records.</p>
        </div>

        <div className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search school, region, or submitted by"
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
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>
          </label>

          <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
            Showing {filteredRecords.length} of {records.length}
          </div>
        </div>

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
            <p className="text-xs text-slate-400">Update your school profile or clear filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="table-head-sticky">
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
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
                  <th className="px-5 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="dashboard-table-row">
                    <td className="px-5 py-3.5 align-top">
                      <p className="text-sm font-semibold text-slate-900">{record.schoolName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">Submitted by {record.submittedBy}</p>
                    </td>
                    <td className="px-5 py-3.5 align-top text-sm text-slate-700">{record.region}</td>
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
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openForEdit(record)}
                          className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary hover:bg-primary-50 hover:text-primary"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}
    </Shell>
  );
}


