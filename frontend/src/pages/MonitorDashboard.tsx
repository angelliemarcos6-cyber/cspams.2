import { useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
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
import { useStudentData } from "@/context/StudentData";
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
type ScopeDropdownSlot = "schools" | "students" | "teachers";

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

const REQUIREMENT_FILTER_OPTIONS: Array<{ id: RequirementFilter; label: string }> = [
  { id: "all", label: "All Schools" },
  { id: "submitted_any", label: "With Any CSPAMS Submission" },
  { id: "complete", label: "Complete CSPAMS Package" },
  { id: "awaiting_review", label: "Pending Monitor Review" },
  { id: "missing", label: "Missing SF / Indicators" },
];

const MONITOR_QUICK_JUMPS: Record<MonitorTopNavigatorId, QuickJumpItem[]> = {
  first_glance: [
    { id: "overview_metrics", label: "Overview Metrics", targetId: "monitor-overview-metrics", icon: LayoutDashboard },
    { id: "targets_snapshot", label: "TARGETS-MET", targetId: "monitor-targets-snapshot", icon: TrendingUp },
    { id: "sync_alerts", label: "Sync Alerts", targetId: "monitor-sync-alerts", icon: AlertCircle },
    { id: "status_chart", label: "Status Distribution", targetId: "monitor-status-chart", icon: ListChecks },
    { id: "submission_trend", label: "Submission Trend", targetId: "monitor-trend-chart", icon: TrendingUp },
  ],
  requirements: [
    { id: "filters", label: "Submission Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "tracker_table", label: "Requirement Tracker", targetId: "monitor-requirements-table", icon: ListChecks },
  ],
  forms: [
    { id: "filters_forms", label: "Submission Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "forms_queue", label: "SF-1 / SF-5 Queue", targetId: "monitor-forms-queue", icon: ClipboardList },
  ],
  indicators: [
    { id: "filters_indicators", label: "Submission Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "indicators_queue", label: "Indicators Queue", targetId: "monitor-indicators-queue", icon: TrendingUp },
  ],
  records: [
    { id: "filters_records", label: "Submission Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "school_records", label: "School Records", targetId: "monitor-school-records", icon: Database },
    { id: "student_records", label: "Learner Records", targetId: "monitor-student-records", icon: Users },
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
  if (status === "returned") return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
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
      ? "border-primary-300/90 bg-primary-600/35 text-white shadow-[inset_0_0_0_1px_rgba(147,197,253,0.4),0_10px_18px_-16px_rgba(4,80,140,0.8)]"
      : "border-primary-400/30 bg-primary-900/45 text-primary-100 hover:border-primary-200/60 hover:bg-primary-700/80 hover:text-white"
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
  const { students } = useStudentData();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SchoolStatus | "all">("all");
  const [requirementFilter, setRequirementFilter] = useState<RequirementFilter>("submitted_any");
  const [selectedSchoolScopeKey, setSelectedSchoolScopeKey] = useState<string>(ALL_SCHOOL_SCOPE);
  const [schoolScopeQuery, setSchoolScopeQuery] = useState("");
  const [schoolScopeDropdownSlot, setSchoolScopeDropdownSlot] = useState<ScopeDropdownSlot | null>(null);
  const [studentLookupQuery, setStudentLookupQuery] = useState("");
  const [teacherLookupQuery, setTeacherLookupQuery] = useState("");
  const [selectedStudentLookup, setSelectedStudentLookup] = useState<StudentLookupOption | null>(null);
  const [selectedTeacherLookup, setSelectedTeacherLookup] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("lastUpdated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [activeTopNavigator, setActiveTopNavigator] = useState<MonitorTopNavigatorId>("first_glance");
  const [isNavigatorVisible, setIsNavigatorVisible] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 768,
  );
  const [showNavigatorManual, setShowNavigatorManual] = useState(false);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
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
    : "Search student name / LRN";
  const selectedTeacherLabel = selectedTeacherLookup ?? "Search teacher name";
  const studentRecordsLookupTerm = selectedStudentLookup
    ? selectedStudentLookup.lrn
    : selectedTeacherLookup ?? "";

  useEffect(() => {
    if (!selectedStudentLookup) return;
    if (studentLookupOptions.some((option) => option.id === selectedStudentLookup.id)) return;
    setSelectedStudentLookup(null);
  }, [selectedStudentLookup, studentLookupOptions]);

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

  const totalStudents = useMemo(
    () => scopedRecords.reduce((total, record) => total + record.studentCount, 0),
    [scopedRecords],
  );
  const totalTeachers = useMemo(
    () => scopedRecords.reduce((total, record) => total + record.teacherCount, 0),
    [scopedRecords],
  );
  const activeSchools = useMemo(
    () => scopedRecords.filter((record) => record.status === "active").length,
    [scopedRecords],
  );

  const regionAggregates = useMemo(() => buildRegionAggregates(scopedRecords), [scopedRecords]);
  const statusDistribution = useMemo(() => buildStatusDistribution(scopedRecords), [scopedRecords]);
  const submissionTrend = useMemo(() => buildSubmissionTrend(scopedRecords), [scopedRecords]);

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

  const filteredRequirementRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return scopedRequirementRows.filter((row) => {
      const matchesSearch =
        query.length === 0 ||
        row.schoolName.toLowerCase().includes(query) ||
        row.schoolCode.toLowerCase().includes(query) ||
        row.region.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || row.schoolStatus === statusFilter;
      const matchesRequirement = matchesRequirementFilter(row, requirementFilter);
      return matchesSearch && matchesStatus && matchesRequirement;
    });
  }, [scopedRequirementRows, search, statusFilter, requirementFilter]);

  const hasDashboardFilters = search.trim().length > 0 || statusFilter !== "all" || requirementFilter !== "all";
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
    }),
    [scopedRequirementRows],
  );
  const completionPercent = requirementCounts.total === 0 ? 0 : Math.round((requirementCounts.complete / requirementCounts.total) * 100);
  const showSubmissionFilters = activeTopNavigator !== "first_glance";
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
    const query = search.trim().toLowerCase();

    return scopedRecords
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
  }, [scopedRecords, search, statusFilter, sortColumn, sortDirection, requirementFilter, schoolRequirementByKey]);

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  };

  const openStudentRecordsFromCard = () => {
    setActiveTopNavigator("records");

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
                  placeholder="Search school code or name"
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
                  placeholder="Search student name or LRN"
                  className="w-full border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedStudentLookup(null);
                  setSelectedTeacherLookup(null);
                  setStudentLookupQuery("");
                  setSchoolScopeDropdownSlot(null);
                }}
                className={`block w-full px-2.5 py-1.5 text-left text-xs transition ${
                  !selectedStudentLookup ? "bg-primary-50 text-primary-800" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Clear student selection
              </button>
              {filteredStudentLookupOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setSelectedStudentLookup(option);
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
                <p className="px-2.5 py-2 text-xs text-slate-500">No student match.</p>
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
                  placeholder="Search teacher name"
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
                  setTeacherLookupQuery("");
                  setSchoolScopeDropdownSlot(null);
                }}
                className={`block w-full px-2.5 py-1.5 text-left text-xs transition ${
                  !selectedTeacherLookup ? "bg-primary-50 text-primary-800" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Clear teacher selection
              </button>
              {filteredTeacherLookupOptions.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setSelectedTeacherLookup(name);
                    setSelectedStudentLookup(null);
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
                <p className="px-2.5 py-2 text-xs text-slate-500">No teacher match.</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Shell
      title="Division Monitor Dashboard"
      subtitle="Overview, requirements, queues, and records."
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
        <section className="mb-5 border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
          {error}
        </section>
      )}

      <div className="dashboard-left-layout mb-5 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-stretch lg:gap-0">
        <aside className="dashboard-side-rail rounded-sm p-3 lg:self-stretch lg:rounded-t-none lg:rounded-br-none">
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
                    ? "border-primary-300/80 bg-primary-100/90"
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

          <section className="dashboard-workflow-hero mb-5 rounded-sm p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                {quickJumpItems.length > 0 && (
                <div className="mt-3">
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
              </div>

              <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[24rem]">
                <article className="dashboard-workflow-tile rounded-sm px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Completion</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{completionPercent}%</p>
                  <p className="text-xs text-slate-600">{requirementCounts.complete}/{requirementCounts.total}</p>
                </article>
                <article className="dashboard-workflow-tile rounded-sm px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Awaiting Review</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{requirementCounts.awaitingReview}</p>
                </article>
                <article className="dashboard-workflow-tile rounded-sm px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Missing Requirements</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{requirementCounts.missing}</p>
                </article>
              </div>
            </div>
          </section>

          {showSubmissionFilters && (
          <section id="monitor-submission-filters" className={`dashboard-shell mb-5 rounded-sm p-3 ${sectionFocusClass("monitor-submission-filters")}`}>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Compliance Submission Filters</h2>
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
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Schools in Scope</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{requirementCounts.total}</p>
              </article>
              <article className="border border-primary-200 bg-primary-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">Any CSPAMS Submission</p>
                <p className="mt-1 text-lg font-bold text-primary-800">{requirementCounts.submittedAny}</p>
              </article>
              <article className="border border-primary-200 bg-primary-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">Complete CSPAMS Package</p>
                <p className="mt-1 text-lg font-bold text-primary-800">{requirementCounts.complete}</p>
              </article>
              <article className="border border-slate-300 bg-slate-100 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Pending Monitor Review</p>
                <p className="mt-1 text-lg font-bold text-slate-800">{requirementCounts.awaitingReview}</p>
              </article>
              <article className="border border-rose-200 bg-rose-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Missing SF / Indicators</p>
                <p className="mt-1 text-lg font-bold text-rose-800">{requirementCounts.missing}</p>
              </article>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <article className="border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Complete Package</p>
                <p className="mt-1 text-xs text-slate-700">Compliance record + SF-1 + SF-5 + Indicators submitted/validated.</p>
              </article>
              <article className="border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pending Review</p>
                <p className="mt-1 text-xs text-slate-700">At least one submission is in submitted status.</p>
              </article>
              <article className="border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Missing</p>
                <p className="mt-1 text-xs text-slate-700">One or more required items are not yet submitted.</p>
              </article>
              <article className="border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Filter Scope</p>
                <p className="mt-1 text-xs text-slate-700">Applies to requirement table and monitor queues.</p>
              </article>
            </div>
          </section>
          )}

      {activeTopNavigator === "first_glance" && (
        <>
          <section id="monitor-overview-metrics" className={`animate-fade-slide grid gap-4 sm:grid-cols-2 xl:grid-cols-4 ${sectionFocusClass("monitor-overview-metrics")}`}>
            <article className="relative border border-primary-100 bg-primary-50/70 p-4">
              <div className="absolute left-0 top-0 h-1.5 w-full bg-primary-400/80" />
              <div className="flex items-start justify-between gap-3 pt-1">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-700">Total Schools</p>
                  <p className="mt-2 text-3xl font-extrabold leading-none text-slate-900">{scopedRecords.length.toLocaleString()}</p>
                </div>
                <span className="grid h-11 w-11 place-items-center border border-slate-100 bg-white text-primary">
                  <Building2 className="h-5 w-5" />
                </span>
              </div>
              {renderSchoolScopeSelector()}
            </article>
            <article className="relative border border-primary-100 bg-primary-50/70 p-4">
              <div className="absolute left-0 top-0 h-1.5 w-full bg-primary-400/80" />
              <div className="flex items-start justify-between gap-3 pt-1">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-700">Total Students</p>
                  <p className="mt-2 text-3xl font-extrabold leading-none text-slate-900">{totalStudents.toLocaleString()}</p>
                </div>
                <span className="grid h-11 w-11 place-items-center border border-slate-100 bg-white text-primary">
                  <GraduationCap className="h-5 w-5" />
                </span>
              </div>
              {renderStudentLookupSelector()}
            </article>
            <article className="relative border border-primary-100 bg-primary-50/70 p-4">
              <div className="absolute left-0 top-0 h-1.5 w-full bg-primary-400/80" />
              <div className="flex items-start justify-between gap-3 pt-1">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-700">Total Teachers</p>
                  <p className="mt-2 text-3xl font-extrabold leading-none text-slate-900">{totalTeachers.toLocaleString()}</p>
                </div>
                <span className="grid h-11 w-11 place-items-center border border-slate-100 bg-white text-primary">
                  <Users className="h-5 w-5" />
                </span>
              </div>
              {renderTeacherLookupSelector()}
            </article>
            <StatCard
              label="Active Schools"
              value={activeSchools.toLocaleString()}
              icon={<TrendingUp className="h-5 w-5" />}
              tone="success"
            />
          </section>

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

      {activeTopNavigator === "requirements" && (
        <section id="monitor-requirements-table" className={`surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden ${sectionFocusClass("monitor-requirements-table")}`}>
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">School Requirement Submission Tracker</h2>
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
                            ? "bg-primary-100 text-primary-700 ring-1 ring-primary-300"
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

      {activeTopNavigator === "forms" && (
        <section id="monitor-forms-queue" className={sectionFocusClass("monitor-forms-queue")}>
          <MonitorFormsPanel schoolFilterKeys={filteredSchoolKeys} />
        </section>
      )}

      {activeTopNavigator === "indicators" && (
        <section id="monitor-indicators-queue" className={sectionFocusClass("monitor-indicators-queue")}>
          <MonitorIndicatorPanel schoolFilterKeys={filteredSchoolKeys} />
        </section>
      )}

      {activeTopNavigator === "records" && (
        <>
        <section id="monitor-school-records" className={`surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden ${sectionFocusClass("monitor-school-records")}`}>
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">School Records</h2>
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
              Showing {filteredRecords.length} of {scopedRecords.length}
            </div>
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
        <section id="monitor-student-records" className={sectionFocusClass("monitor-student-records")}>
          <StudentRecordsPanel
            editable={false}
            showSchoolColumn
            schoolFilterKeys={filteredSchoolKeys}
            externalSearchTerm={studentRecordsLookupTerm}
            title="Synchronized Student Records"
            description="Read-only learner records."
          />
        </section>
        </>
      )}
        </div>
      </div>
    </Shell>
  );
}





