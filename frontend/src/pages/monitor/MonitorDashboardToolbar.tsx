import type { Ref } from "react";
import { Filter, Save, Search } from "lucide-react";
import type { MonitorTopNavigatorId } from "@/pages/monitor/monitorFilters";

interface ActiveScreenMeta {
  title: string;
  description: string;
  primaryLabel: string;
}

interface MonitorDashboardToolbarProps {
  activeTopNavigator: MonitorTopNavigatorId;
  activeScreenMeta: ActiveScreenMeta;
  isPrimaryActionDisabled: boolean;
  onPrimaryAction: () => void;
  showAdvancedFilters: boolean;
  activeFilterCount: number;
  onToggleFilters: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  globalSearchInputRef: Ref<HTMLInputElement>;
}

export function MonitorDashboardToolbar({
  activeTopNavigator,
  activeScreenMeta,
  isPrimaryActionDisabled,
  onPrimaryAction,
  showAdvancedFilters,
  activeFilterCount,
  onToggleFilters,
  search,
  onSearchChange,
  globalSearchInputRef,
}: MonitorDashboardToolbarProps) {
  const showToolbarMetaPanel = activeTopNavigator !== "schools";

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

      {showToolbarMetaPanel ? (
        <section className="dashboard-shell dashboard-shell-visible mb-5 rounded-sm border border-slate-200 bg-white p-2 shadow-sm">
          <div className="dashboard-nav-shell rounded-sm border border-slate-200 bg-slate-50/60 p-3">
            <label className="relative block w-full lg:max-w-lg">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={globalSearchInputRef}
                type="text"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search school code, school name, or school head"
                className="w-full rounded-sm border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              />
            </label>
          </div>
        </section>
      ) : null}
    </>
  );
}
