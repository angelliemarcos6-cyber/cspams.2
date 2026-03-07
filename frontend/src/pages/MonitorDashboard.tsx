import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Eye,
  Filter,
  GraduationCap,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import { Shell } from "@/components/Shell";
import { StatCard } from "@/components/StatCard";
import { RegionCard } from "@/components/RegionCard";
import { StatusPieChart } from "@/components/charts/StatusPieChart";
import { RegionBarChart } from "@/components/charts/RegionBarChart";
import { SubmissionTrendChart } from "@/components/charts/SubmissionTrendChart";
import { MonitorFormsPanel } from "@/components/forms/MonitorFormsPanel";
import { MonitorIndicatorPanel } from "@/components/indicators/MonitorIndicatorPanel";
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

const MONITOR_TOP_NAVIGATOR_ITEMS: MonitorTopNavigatorItem[] = [
  { id: "first_glance", label: "First Glance" },
  { id: "requirements", label: "Requirement Tracker" },
  { id: "forms", label: "SF-1 / SF-5 Queue" },
  { id: "indicators", label: "Indicators Queue" },
  { id: "records", label: "School Records" },
];

const REQUIREMENT_FILTER_OPTIONS: Array<{ id: RequirementFilter; label: string }> = [
  { id: "all", label: "All schools" },
  { id: "submitted_any", label: "With any submission" },
  { id: "complete", label: "Complete package" },
  { id: "awaiting_review", label: "Awaiting review" },
  { id: "missing", label: "Missing requirements" },
];

function statusTone(status: SchoolStatus) {
  if (status === "active") return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300";
  if (status === "pending") return "bg-amber-100 text-amber-700 ring-1 ring-amber-300";
  return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
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
  const { records, targetsMet, syncAlerts, isLoading, error, lastSyncedAt, syncScope, syncStatus, refreshRecords } = useData();
  const { submissions: formSubmissions } = useFormData();
  const { submissions: indicatorSubmissions } = useIndicatorData();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SchoolStatus | "all">("all");
  const [requirementFilter, setRequirementFilter] = useState<RequirementFilter>("submitted_any");
  const [sortColumn, setSortColumn] = useState<SortColumn>("lastUpdated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [activeTopNavigator, setActiveTopNavigator] = useState<MonitorTopNavigatorId>("first_glance");

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
      const row = ensureRow(record.schoolCode ?? null, record.schoolName, record.region, record.status);
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
        if (!matchesSearch || !matchesStatus) return false;

        if (requirementFilter === "all") return true;
        const key = normalizeSchoolKey(record.schoolCode ?? null, record.schoolName);
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
          <span className="inline-flex items-center gap-2 rounded-sm border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700">
            <Eye className="h-3.5 w-3.5" />
            Read-only monitor mode
          </span>
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

      <section className="mb-5 border border-slate-200 bg-slate-50 p-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Top Navigator</h2>
        <p className="mt-1 text-xs text-slate-600">Switch monitor views without page scrolling.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-5">
          {MONITOR_TOP_NAVIGATOR_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTopNavigator(item.id)}
              className={`border px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide transition ${
                activeTopNavigator === item.id
                  ? "border-primary bg-primary-50 text-primary-800"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-5 border border-slate-200 bg-white p-3">
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
            <div className="surface-panel border border-slate-200 bg-white p-5">
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

            <div className="surface-panel border border-slate-200 bg-white p-5">
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
        <section className="surface-panel mt-5 animate-fade-slide overflow-hidden border border-slate-200">
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
        <section className="surface-panel mt-5 animate-fade-slide overflow-hidden border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">School Records</h2>
            <p className="mt-0.5 text-xs text-slate-500">Search, filter, and inspect all records submitted by school heads.</p>
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
              <p className="text-xs text-slate-400">Try changing filters or wait for new submissions.</p>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50/80">
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
