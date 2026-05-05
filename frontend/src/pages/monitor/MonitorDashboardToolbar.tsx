import type { Ref } from "react";
import { Filter, RefreshCw, Save, Search } from "lucide-react";
import type { SchoolQuickPreset } from "@/pages/monitor/monitorFilters";

interface ActiveScreenMeta {
  title: string;
  description: string;
  primaryLabel: string;
}

interface StickySummaryStats {
  totalSchools: number;
  pending: number;
  missing: number;
  returned: number;
  atRisk: number;
}

interface MonitorDashboardToolbarProps {
  activeScreenMeta: ActiveScreenMeta;
  isPrimaryActionDisabled: boolean;
  onPrimaryAction: () => void;
  showAdvancedFilters: boolean;
  activeFilterCount: number;
  onToggleFilters: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  globalSearchInputRef: Ref<HTMLInputElement>;
  schoolQuickPreset: SchoolQuickPreset;
  onSelectSchoolQuickPreset: (value: SchoolQuickPreset) => void;
  stickySummaryStats: StickySummaryStats;
  schoolPresetCounts: Record<SchoolQuickPreset, number>;
  onRefresh: () => void;
  isDashboardSyncing: boolean;
  dashboardLastSyncedAt: string | null;
}

export function MonitorDashboardToolbar({
  activeScreenMeta,
  isPrimaryActionDisabled,
  onPrimaryAction,
  showAdvancedFilters,
  activeFilterCount,
  onToggleFilters,
  search,
  onSearchChange,
  globalSearchInputRef,
  schoolQuickPreset,
  onSelectSchoolQuickPreset,
  stickySummaryStats,
  schoolPresetCounts,
  onRefresh,
  isDashboardSyncing,
  dashboardLastSyncedAt,
}: MonitorDashboardToolbarProps) {
  return (
    <>
      <section className="dashboard-shell mb-5 rounded-sm border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">{activeScreenMeta.title}</h2>
            <p className="mt-1 text-xs text-slate-600">{activeScreenMeta.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onPrimaryAction}
              disabled={isPrimaryActionDisabled}
              className="inline-flex items-center gap-1 rounded-sm border border-primary-300/70 bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {activeScreenMeta.primaryLabel}
            </button>
            <button
              id="monitor-submission-filters-toggle"
              type="button"
              onClick={onToggleFilters}
              aria-expanded={showAdvancedFilters}
              className={`inline-flex items-center gap-1 rounded-sm border px-3 py-2 text-xs font-semibold transition ${
                activeFilterCount > 0
                  ? "border-primary-200 bg-primary-50 text-primary-800 hover:bg-primary-100"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              {showAdvancedFilters ? "Close Filters" : "Filters"}
              {activeFilterCount > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-white px-1 text-[10px] font-bold text-primary-700">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </section>

      <section className="dashboard-shell dashboard-shell-visible mb-5 rounded-sm">
        <div className="dashboard-nav-shell border-b border-slate-200 bg-white/95 p-2 backdrop-blur">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative w-full lg:max-w-lg">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={globalSearchInputRef}
                  type="text"
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Search school code, school name, or school head"
                  className="w-full rounded-sm border border-slate-200 bg-white py-2 pl-10 pr-20 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                  /
                </span>
              </label>
              <p className="hidden text-[11px] font-medium text-slate-600 lg:block">
                <span className="font-semibold text-slate-800">/</span> Search ·{" "}
                <span className="font-semibold text-slate-800">J/K</span> Navigate ·{" "}
                <span className="font-semibold text-slate-800">R</span> Review
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <button
                type="button"
                title="Schools in the current scope."
                onClick={() => onSelectSchoolQuickPreset("all")}
                className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition ${
                  schoolQuickPreset === "all"
                    ? "border-slate-300 bg-slate-100 text-slate-900"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                Schools: {stickySummaryStats.totalSchools}
              </button>
              <button
                type="button"
                title="Submitted packages waiting for monitor review."
                onClick={() => onSelectSchoolQuickPreset("pending")}
                className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition ${
                  schoolQuickPreset === "pending"
                    ? "border-primary-300 bg-primary-100 text-primary-800"
                    : "border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100"
                }`}
              >
                Pending: {stickySummaryStats.pending}
              </button>
              <button
                type="button"
                title="Schools missing a compliance record or indicator submission."
                onClick={() => onSelectSchoolQuickPreset("missing")}
                className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition ${
                  schoolQuickPreset === "missing"
                    ? "border-indigo-300 bg-indigo-100 text-indigo-800"
                    : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                }`}
              >
                Missing: {stickySummaryStats.missing}
              </button>
              <button
                type="button"
                title="Packages returned to school heads for correction."
                onClick={() => onSelectSchoolQuickPreset("returned")}
                className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition ${
                  schoolQuickPreset === "returned"
                    ? "border-amber-300 bg-amber-100 text-amber-800"
                    : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}
              >
                Returned: {stickySummaryStats.returned}
              </button>
              <button
                type="button"
                title="Schools with missing or returned requirements."
                onClick={() => onSelectSchoolQuickPreset("high_risk")}
                className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition ${
                  schoolQuickPreset === "high_risk"
                    ? "border-rose-300 bg-rose-100 text-rose-800"
                    : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                }`}
              >
                High Risk: {stickySummaryStats.atRisk}
              </button>
              <button
                type="button"
                title="Schools with no compliance or indicator submission yet."
                onClick={() => onSelectSchoolQuickPreset("no_submission")}
                className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition ${
                  schoolQuickPreset === "no_submission"
                    ? "border-slate-400 bg-slate-200 text-slate-900"
                    : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                No Submission: {schoolPresetCounts.no_submission}
              </button>
              <button
                type="button"
                title="Refresh dashboard data."
                onClick={onRefresh}
                disabled={isDashboardSyncing}
                className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isDashboardSyncing ? "animate-spin" : ""}`} />
                {isDashboardSyncing
                  ? "Syncing..."
                  : dashboardLastSyncedAt
                    ? `Sync: ${new Date(dashboardLastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "Sync: N/A"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
