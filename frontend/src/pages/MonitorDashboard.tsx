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
  Search,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import { Shell } from "@/components/Shell";
import { StatCard } from "@/components/StatCard";
import { RegionCard } from "@/components/RegionCard";
import { StatusPieChart } from "@/components/charts/StatusPieChart";
import { RegionBarChart } from "@/components/charts/RegionBarChart";
import { SubmissionTrendChart } from "@/components/charts/SubmissionTrendChart";
import { MonitorIndicatorPanel } from "@/components/indicators/MonitorIndicatorPanel";
import { useData } from "@/context/Data";
import type { SchoolRecord, SchoolStatus } from "@/types";
import {
  buildRegionAggregates,
  buildStatusDistribution,
  buildSubmissionTrend,
  formatDateTime,
  statusLabel,
} from "@/utils/analytics";

type SortColumn = "schoolName" | "region" | "studentCount" | "teacherCount" | "status" | "lastUpdated";
type SortDirection = "asc" | "desc";

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

export function MonitorDashboard() {
  const { records, targetsMet, syncAlerts, isLoading, error, lastSyncedAt, syncScope, syncStatus, refreshRecords } = useData();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SchoolStatus | "all">("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>("lastUpdated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const totalStudents = useMemo(() => records.reduce((total, record) => total + record.studentCount, 0), [records]);
  const totalTeachers = useMemo(() => records.reduce((total, record) => total + record.teacherCount, 0), [records]);
  const activeSchools = useMemo(() => records.filter((record) => record.status === "active").length, [records]);

  const regionAggregates = useMemo(() => buildRegionAggregates(records), [records]);
  const statusDistribution = useMemo(() => buildStatusDistribution(records), [records]);
  const submissionTrend = useMemo(() => buildSubmissionTrend(records), [records]);

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

  return (
    <Shell
      title="Division Monitor Dashboard"
      subtitle="Observe synchronized school submissions, TARGETS-MET indicators, and intervention alerts in one view."
      actions={
        <>
          <button
            type="button"
            onClick={() => void refreshRecords()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <span className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700">
            <Eye className="h-3.5 w-3.5" />
            Read-only monitor mode
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            {syncStatus === "up_to_date" ? "No backend changes" : "Records updated"}
            {" | "}
            {lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : "Not synced yet"}
            {syncScope ? ` (${syncScope})` : ""}
          </span>
        </>
      }
    >
      {error && (
        <section className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </section>
      )}

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
        <div className="surface-panel rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">TARGETS-MET Sync Snapshot</h2>
            <span className="text-xs text-slate-500">
              {targetsMet?.generatedAt ? `Generated ${new Date(targetsMet.generatedAt).toLocaleTimeString()}` : "Waiting for data"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Retention Rate</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet ? `${targetsMet.retentionRatePercent.toFixed(2)}%` : "--"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Dropout Rate</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet ? `${targetsMet.dropoutRatePercent.toFixed(2)}%` : "--"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Completion Rate</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet ? `${targetsMet.completionRatePercent.toFixed(2)}%` : "--"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">At-Risk Learners</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet ? targetsMet.atRiskLearners.toLocaleString() : "--"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Student-Teacher Ratio</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet?.studentTeacherRatio ?? "--"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Student-Classroom Ratio</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet?.studentClassroomRatio ?? "--"}</p>
            </div>
          </div>
        </div>

        <div className="surface-panel rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Synchronized Alerts</h2>
          <div className="mt-4 space-y-3">
            {syncAlerts.slice(0, 4).map((alert) => (
              <article key={alert.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{alert.level}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{alert.title}</p>
                <p className="mt-1 text-xs text-slate-600">{alert.message}</p>
              </article>
            ))}
            {syncAlerts.length === 0 && <p className="text-xs text-slate-500">No synchronized alerts yet.</p>}
          </div>
        </div>
      </section>

      <MonitorIndicatorPanel />

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

      <section className="surface-panel mt-5 animate-fade-slide overflow-hidden rounded-2xl">
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
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
          </div>

          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
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

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
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
    </Shell>
  );
}
