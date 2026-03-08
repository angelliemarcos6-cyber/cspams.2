import { useMemo, useState, type ComponentType, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpenText,
  Building2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Database,
  Edit2,
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
import { MonitorFormsPanel } from "@/components/forms/MonitorFormsPanel";
import { MonitorIndicatorPanel } from "@/components/indicators/MonitorIndicatorPanel";
import { StudentRecordsPanel } from "@/components/students/StudentRecordsPanel";
import { useData } from "@/context/Data";
import { useFormData } from "@/context/FormData";
import { useIndicatorData } from "@/context/IndicatorData";
import type { FormSubmission, IndicatorSubmission, SchoolRecord, SchoolStatus } from "@/types";
import {
  buildRegionAggregates,
  buildStatusDistribution,
  buildSubmissionTrend,
  formatDateTime,
  statusLabel,
} from "@/utils/analytics";

type SortColumn = "schoolName" | "region" | "studentCount" | "teacherCount" | "status" | "lastUpdated";
type SortDirection = "asc" | "desc";
type RequirementFilter = "all" | "submitted_any" | "complete" | "awaiting_review" | "missing";
type MonitorTopNavigatorId = "first_glance" | "requirements" | "forms" | "indicators" | "records";

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
  sf1Status: string | null;
  sf5Status: string | null;
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

type NavigatorIcon = ComponentType<{ className?: string }>;

interface ViewMeta {
  summary: string;
  focus: string;
}

const MONITOR_TOP_NAVIGATOR_ITEMS: MonitorTopNavigatorItem[] = [
  { id: "first_glance", label: "Overview" },
  { id: "requirements", label: "Requirements" },
  { id: "forms", label: "Forms Queue" },
  { id: "indicators", label: "Indicators Queue" },
  { id: "records", label: "School Records" },
];

const MONITOR_NAVIGATOR_ICONS: Record<MonitorTopNavigatorItem["id"], NavigatorIcon> = {
  first_glance: LayoutDashboard,
  requirements: ListChecks,
  forms: ClipboardList,
  indicators: TrendingUp,
  records: Database,
};

const MONITOR_NAVIGATOR_MANUAL: ManualStep[] = [
  {
    id: "first_glance",
    title: "Overview",
    objective: "Detect division-level issues at the start of every review session.",
    actions: [
      "Check totals, TARGETS-MET snapshot, and synchronized alerts.",
      "Identify schools or indicators that need immediate follow-up.",
    ],
    doneWhen: "You have a clear list of schools/modules needing attention.",
  },
  {
    id: "requirements",
    title: "Requirements",
    objective: "Track which schools have submitted or are still missing requirements.",
    actions: [
      "Use status and requirement filters to isolate missing schools.",
      "Prioritize rows with high missing count or awaiting review count.",
    ],
    doneWhen: "You have filtered target schools for validation or follow-up.",
  },
  {
    id: "forms",
    title: "SF-1 / SF-5 Queue",
    objective: "Review and resolve SF-1/SF-5 submissions efficiently.",
    actions: [
      "Open each submitted form and verify required values and consistency.",
      "Validate complete entries or return with clear correction notes.",
    ],
    doneWhen: "No pending submitted forms remain without a decision.",
  },
  {
    id: "indicators",
    title: "Indicators Queue",
    objective: "Ensure indicator package accuracy before approval.",
    actions: [
      "Review indicator values, compliance rates, and remarks.",
      "Validate correct packages or return with specific action notes.",
    ],
    doneWhen: "All reviewed indicator packages are either validated or returned with notes.",
  },
  {
    id: "records",
    title: "School Records",
    objective: "Audit final synchronized school-level records.",
    actions: [
      "Search/filter records by school, region, and status.",
      "Confirm timestamps and status align with the latest submissions.",
    ],
    doneWhen: "Record table matches expected latest school submissions.",
  },
];

const MONITOR_MANUAL_STATUS_GUIDE = [
  "Submitted: Waiting for monitor validation decision.",
  "Validated: Approved and closed.",
  "Returned: Sent back to school head for correction.",
  "Missing: Requirement not yet submitted by school.",
];

const MONITOR_VIEW_META: Record<MonitorTopNavigatorId, ViewMeta> = {
  first_glance: {
    summary: "Start with overall submission health and synchronized alerts across all schools.",
    focus: "Use this view to prioritize where monitor action is needed first.",
  },
  requirements: {
    summary: "Track compliance package status by school and quickly identify missing requirements.",
    focus: "Filter for missing or awaiting-review schools, then follow up.",
  },
  forms: {
    summary: "Review Digital SF-1 and SF-5 queues submitted by school heads.",
    focus: "Validate complete forms or return with clear correction notes.",
  },
  indicators: {
    summary: "Review indicator submissions and compliance metrics before approval.",
    focus: "Confirm data consistency and finalize validation decisions.",
  },
  records: {
    summary: "Maintain master school records and inspect synchronized learner data.",
    focus: "Use CRUD for school records, while student records remain read-only.",
  },
};

const REQUIREMENT_FILTER_OPTIONS: Array<{ id: RequirementFilter; label: string }> = [
  { id: "all", label: "All schools" },
  { id: "submitted_any", label: "With any submission" },
  { id: "complete", label: "Complete package" },
  { id: "awaiting_review", label: "Awaiting review" },
  { id: "missing", label: "Missing requirements" },
];

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

function workflowTone(status: string | null) {
  if (status === "validated") return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300";
  if (status === "submitted") return "bg-cyan-100 text-cyan-700 ring-1 ring-cyan-300";
  if (status === "returned") return "bg-amber-100 text-amber-700 ring-1 ring-amber-300";
  if (status === "draft") return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
  return "bg-slate-100 text-slate-600 ring-1 ring-slate-300";
}

function workflowLabel(status: string | null): string {
  if (!status) return "Missing";
  if (status === "submitted") return "Submitted";
  if (status === "validated") return "Validated";
  if (status === "returned") return "Returned";
  if (status === "draft") return "Draft";
  return status;
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
  switch (filter) {
    case "submitted_any":
      return summary.hasAnySubmitted;
    case "complete":
      return summary.isComplete;
    case "awaiting_review":
      return summary.awaitingReviewCount > 0;
    case "missing":
      return summary.missingCount > 0;
    default:
      return true;
  }
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
  const { submissions: formSubmissions } = useFormData();
  const { submissions: indicatorSubmissions } = useIndicatorData();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SchoolStatus | "all">("all");
  const [requirementFilter, setRequirementFilter] = useState<RequirementFilter>("submitted_any");
  const [sortColumn, setSortColumn] = useState<SortColumn>("lastUpdated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [activeTopNavigator, setActiveTopNavigator] = useState<MonitorTopNavigatorId>("first_glance");
  const [isNavigatorVisible, setIsNavigatorVisible] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 768,
  );
  const [showNavigatorManual, setShowNavigatorManual] = useState(false);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [recordForm, setRecordForm] = useState<MonitorRecordFormState>(EMPTY_MONITOR_RECORD_FORM);
  const [recordFormError, setRecordFormError] = useState("");
  const [recordFormMessage, setRecordFormMessage] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const activeNavigatorLabel = useMemo(
    () => MONITOR_TOP_NAVIGATOR_ITEMS.find((item) => item.id === activeTopNavigator)?.label ?? "Overview",
    [activeTopNavigator],
  );

  const resetRecordForm = () => {
    setEditingRecordId(null);
    setRecordForm(EMPTY_MONITOR_RECORD_FORM);
    setRecordFormError("");
    setRecordFormMessage("");
  };

  const openCreateRecordForm = () => {
    resetRecordForm();
    setActiveTopNavigator("records");
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
    setActiveTopNavigator("records");
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

  const totalStudents = useMemo(() => records.reduce((total, record) => total + record.studentCount, 0), [records]);
  const totalTeachers = useMemo(() => records.reduce((total, record) => total + record.teacherCount, 0), [records]);
  const activeSchools = useMemo(() => records.filter((record) => record.status === "active").length, [records]);

  const regionAggregates = useMemo(() => buildRegionAggregates(records), [records]);
  const statusDistribution = useMemo(() => buildStatusDistribution(records), [records]);
  const submissionTrend = useMemo(() => buildSubmissionTrend(records), [records]);

  const sf1Submissions = useMemo(
    () => formSubmissions.filter((submission) => String(submission.formType).toLowerCase() === "sf1"),
    [formSubmissions],
  );
  const sf5Submissions = useMemo(
    () => formSubmissions.filter((submission) => String(submission.formType).toLowerCase() === "sf5"),
    [formSubmissions],
  );

  const latestSf1BySchool = useMemo(() => latestBySchool<FormSubmission>(sf1Submissions), [sf1Submissions]);
  const latestSf5BySchool = useMemo(() => latestBySchool<FormSubmission>(sf5Submissions), [sf5Submissions]);
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
          sf1Status: null,
          sf5Status: null,
          indicatorStatus: null,
          hasAnySubmitted: false,
          isComplete: false,
          awaitingReviewCount: 0,
          missingCount: 4,
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

    for (const submission of latestSf1BySchool.values()) {
      const row = ensureRow(submission.school?.schoolCode, submission.school?.name, null);
      if (!row) continue;

      row.sf1Status = submission.status ?? null;
      setLastActivity(row, submission.updatedAt, submission.submittedAt, submission.createdAt);
    }

    for (const submission of latestSf5BySchool.values()) {
      const row = ensureRow(submission.school?.schoolCode, submission.school?.name, null);
      if (!row) continue;

      row.sf5Status = submission.status ?? null;
      setLastActivity(row, submission.updatedAt, submission.submittedAt, submission.createdAt);
    }

    for (const submission of latestIndicatorBySchool.values()) {
      const row = ensureRow(submission.school?.schoolCode, submission.school?.name, null);
      if (!row) continue;

      row.indicatorStatus = submission.status ?? null;
      setLastActivity(row, submission.updatedAt, submission.submittedAt, submission.createdAt);
    }

    return [...rows.values()]
      .map((row) => {
        const sf1Submitted = isPassedToMonitor(row.sf1Status);
        const sf5Submitted = isPassedToMonitor(row.sf5Status);
        const indicatorSubmitted = isPassedToMonitor(row.indicatorStatus);
        const missingCount =
          (row.hasComplianceRecord ? 0 : 1) +
          (sf1Submitted ? 0 : 1) +
          (sf5Submitted ? 0 : 1) +
          (indicatorSubmitted ? 0 : 1);
        const awaitingReviewCount =
          (isAwaitingReview(row.sf1Status) ? 1 : 0) +
          (isAwaitingReview(row.sf5Status) ? 1 : 0) +
          (isAwaitingReview(row.indicatorStatus) ? 1 : 0);

        return {
          ...row,
          hasAnySubmitted: row.hasComplianceRecord || sf1Submitted || sf5Submitted || indicatorSubmitted,
          isComplete: missingCount === 0,
          missingCount,
          awaitingReviewCount,
        };
      })
      .sort((a, b) => a.schoolName.localeCompare(b.schoolName));
  }, [records, latestSf1BySchool, latestSf5BySchool, latestIndicatorBySchool]);

  const schoolRequirementByKey = useMemo(
    () => new Map(schoolRequirementRows.map((row) => [row.schoolKey, row])),
    [schoolRequirementRows],
  );

  const filteredRequirementRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return schoolRequirementRows.filter((row) => {
      const matchesSearch =
        query.length === 0 ||
        row.schoolName.toLowerCase().includes(query) ||
        row.schoolCode.toLowerCase().includes(query) ||
        row.region.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || row.schoolStatus === statusFilter;
      const matchesRequirement = matchesRequirementFilter(row, requirementFilter);
      return matchesSearch && matchesStatus && matchesRequirement;
    });
  }, [schoolRequirementRows, search, statusFilter, requirementFilter]);

  const filteredSchoolKeys = useMemo(() => {
    if (search.trim().length === 0 && statusFilter === "all" && requirementFilter === "all") {
      return null;
    }
    return new Set(filteredRequirementRows.map((row) => row.schoolKey));
  }, [filteredRequirementRows, search, statusFilter, requirementFilter]);

  const requirementCounts = useMemo(
    () => ({
      total: schoolRequirementRows.length,
      submittedAny: schoolRequirementRows.filter((row) => row.hasAnySubmitted).length,
      complete: schoolRequirementRows.filter((row) => row.isComplete).length,
      awaitingReview: schoolRequirementRows.filter((row) => row.awaitingReviewCount > 0).length,
      missing: schoolRequirementRows.filter((row) => row.missingCount > 0).length,
    }),
    [schoolRequirementRows],
  );
  const completionPercent = requirementCounts.total === 0 ? 0 : Math.round((requirementCounts.complete / requirementCounts.total) * 100);
  const activeViewMeta = MONITOR_VIEW_META[activeTopNavigator];
  const activeStep = Math.max(1, MONITOR_TOP_NAVIGATOR_ITEMS.findIndex((item) => item.id === activeTopNavigator) + 1);
  const showSubmissionFilters = activeTopNavigator !== "first_glance";

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
        if (!matchesSearch || !matchesStatus) return false;

        if (requirementFilter === "all") return true;
        const key = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
        const summary = schoolRequirementByKey.get(key);
        return summary ? matchesRequirementFilter(summary, requirementFilter) : false;
      })
      .sort((a, b) => compareRecords(a, b, sortColumn, sortDirection));
  }, [records, search, statusFilter, sortColumn, sortDirection, requirementFilter, schoolRequirementByKey]);

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  };

  return (
    <Shell
      title="Division Monitor Dashboard"
      subtitle="Observe synchronized school submissions, review requirement compliance, and validate packages from one navigator."
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
            onClick={openCreateRecordForm}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-600"
          >
            <Plus className="h-3.5 w-3.5" />
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
        <section className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </section>
      )}

      <div className="dashboard-left-layout mb-5 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-0">
        <aside className="rounded-sm border border-primary-700/80 bg-gradient-to-b from-primary-900 via-primary-800 to-primary-900 p-3 shadow-xl shadow-primary-900/35 lg:rounded-t-none">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-white">Navigator</h2>
              <p className="mt-1 text-xs text-primary-100">Select what you need to review now.</p>
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
                {MONITOR_TOP_NAVIGATOR_ITEMS.map((item) => {
                  const Icon = MONITOR_NAVIGATOR_ICONS[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTopNavigator(item.id)}
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
                      <p className="mt-2 text-[11px] text-emerald-700">Done when: {step.doneWhen}</p>
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

          <section className="dashboard-workflow-hero mb-5 rounded-sm p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <p className="dashboard-workflow-step inline-flex items-center gap-2 rounded-sm px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary-700">
                  Workflow Step {activeStep} of {MONITOR_TOP_NAVIGATOR_ITEMS.length}
                </p>
                <h2 className="mt-2 text-xl font-extrabold text-slate-900">{activeNavigatorLabel}</h2>
                <p className="mt-1 text-sm text-slate-600">{activeViewMeta.summary}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{activeViewMeta.focus}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {MONITOR_TOP_NAVIGATOR_ITEMS.map((item, index) => {
                    const Icon = MONITOR_NAVIGATOR_ICONS[item.id];
                    const isActive = activeTopNavigator === item.id;
                    return (
                      <button
                        key={`monitor-workflow-chip-${item.id}`}
                        type="button"
                        onClick={() => setActiveTopNavigator(item.id)}
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
              </div>

              <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[24rem]">
                <article className="dashboard-workflow-tile rounded-sm px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Completion</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{completionPercent}%</p>
                  <p className="text-xs text-slate-600">{requirementCounts.complete}/{requirementCounts.total} schools complete</p>
                </article>
                <article className="dashboard-workflow-tile rounded-sm px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Awaiting Review</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{requirementCounts.awaitingReview}</p>
                  <p className="text-xs text-slate-600">Schools with submitted items pending decision</p>
                </article>
                <article className="dashboard-workflow-tile rounded-sm px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Missing Requirements</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{requirementCounts.missing}</p>
                  <p className="text-xs text-slate-600">Prioritize these schools for follow-up</p>
                </article>
              </div>
            </div>
          </section>

          {showSubmissionFilters && (
          <section className="dashboard-shell mb-5 rounded-sm p-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Submission Filters</h2>
            <p className="mt-1 text-xs text-slate-600">Filter schools by status and by submitted requirements.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search school, region, code, or submitted by"
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

              <label className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
                <Filter className="h-4 w-4 text-slate-400" />
                <select
                  value={requirementFilter}
                  onChange={(event) => setRequirementFilter(event.target.value as RequirementFilter)}
                  className="border-none bg-transparent text-sm font-medium text-slate-700 outline-none"
                >
                  {REQUIREMENT_FILTER_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <article className="border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tracked Schools</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{requirementCounts.total}</p>
              </article>
              <article className="border border-cyan-200 bg-cyan-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">With Submission</p>
                <p className="mt-1 text-lg font-bold text-cyan-800">{requirementCounts.submittedAny}</p>
              </article>
              <article className="border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Complete Package</p>
                <p className="mt-1 text-lg font-bold text-emerald-800">{requirementCounts.complete}</p>
              </article>
              <article className="border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Awaiting Review</p>
                <p className="mt-1 text-lg font-bold text-amber-800">{requirementCounts.awaitingReview}</p>
              </article>
              <article className="border border-rose-200 bg-rose-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Missing Requirements</p>
                <p className="mt-1 text-lg font-bold text-rose-800">{requirementCounts.missing}</p>
              </article>
            </div>
          </section>
          )}

      {activeTopNavigator === "first_glance" && (
        <>
          <section className="animate-fade-slide grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total Schools"
              value={records.length.toLocaleString()}
              icon={<Building2 className="h-5 w-5" />}
            />
            <StatCard
              label="Total Students"
              value={totalStudents.toLocaleString()}
              icon={<GraduationCap className="h-5 w-5" />}
            />
            <StatCard
              label="Total Teachers"
              value={totalTeachers.toLocaleString()}
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              label="Active Schools"
              value={activeSchools.toLocaleString()}
              icon={<TrendingUp className="h-5 w-5" />}
              tone="success"
            />
          </section>

          <section className="mt-5 animate-fade-slide grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <div className="surface-panel dashboard-shell p-5">
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
            <StatusPieChart data={statusDistribution} />
            <RegionBarChart data={regionAggregates} />
            <SubmissionTrendChart data={submissionTrend} />
          </section>

          {regionAggregates.length > 0 && (
            <section className="mt-5 animate-fade-slide">
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

      {activeTopNavigator === "requirements" && (
        <section className="surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">School Requirement Submission Tracker</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Track which schools already submitted required packages and which still need follow-up.
            </p>
          </div>

          <div className="overflow-x-auto px-5 py-4">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  <th className="px-2 py-2 text-left">School</th>
                  <th className="px-2 py-2 text-left">Region</th>
                  <th className="px-2 py-2 text-center">Compliance</th>
                  <th className="px-2 py-2 text-center">SF-1</th>
                  <th className="px-2 py-2 text-center">SF-5</th>
                  <th className="px-2 py-2 text-center">Indicators</th>
                  <th className="px-2 py-2 text-center">Missing</th>
                  <th className="px-2 py-2 text-center">Awaiting Review</th>
                  <th className="px-2 py-2 text-left">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequirementRows.map((row) => (
                  <tr key={row.schoolKey}>
                    <td className="px-2 py-2">
                      <p className="text-sm font-semibold text-slate-900">{row.schoolName}</p>
                      <p className="text-xs text-slate-500">{row.schoolCode}</p>
                    </td>
                    <td className="px-2 py-2 text-sm text-slate-700">{row.region}</td>
                    <td className="px-2 py-2 text-center">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                          row.hasComplianceRecord
                            ? "bg-cyan-100 text-cyan-700 ring-1 ring-cyan-300"
                            : "bg-slate-100 text-slate-600 ring-1 ring-slate-300"
                        }`}
                      >
                        {row.hasComplianceRecord ? "Submitted" : "Missing"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${workflowTone(row.sf1Status)}`}>
                        {workflowLabel(row.sf1Status)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${workflowTone(row.sf5Status)}`}>
                        {workflowLabel(row.sf5Status)}
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
                  </tr>
                ))}
                {filteredRequirementRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-2 py-8 text-center text-sm text-slate-500">
                      No schools match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTopNavigator === "forms" && <MonitorFormsPanel schoolFilterKeys={filteredSchoolKeys} />}

      {activeTopNavigator === "indicators" && <MonitorIndicatorPanel schoolFilterKeys={filteredSchoolKeys} />}

      {activeTopNavigator === "records" && (
        <>
        <section className="surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">School Records</h2>
            <p className="mt-0.5 text-xs text-slate-500">Manage school master records with full details and compliance counts.</p>
          </div>

          <div className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search school ID, name, level, type, address, or region"
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

          {deleteError && (
            <div className="mx-5 mt-4 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
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
                      <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                        {recordFormError}
                      </p>
                    )}
                    {recordFormMessage && (
                      <p className="rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
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
              <p className="text-xs text-slate-400">Try changing filters or wait for new submissions.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                    <th className="px-5 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.map((record) => (
                    <tr key={record.id} className="dashboard-table-row">
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
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditRecordForm(record)}
                            className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary hover:bg-primary-50 hover:text-primary"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteRecord(record)}
                            disabled={deletingRecordId === record.id}
                            className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {deletingRecordId === record.id ? "Deleting..." : "Delete"}
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
        <StudentRecordsPanel
          editable={false}
          showSchoolColumn
          title="Synchronized Student Records"
          description="Read-only learner records submitted by school heads."
        />
        </>
      )}
        </div>
      </div>
    </Shell>
  );
}

