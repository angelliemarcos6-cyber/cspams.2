import type { ComponentProps } from "react";
import {
  Building2,
  ChevronDown,
  GraduationCap,
  ListChecks,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { FilterBar, type FilterBarOption } from "@/components/shared/FilterBar";
import { SchoolScopeSelector } from "@/pages/monitor/SchoolScopeSelector";
import { StudentLookupSelector } from "@/pages/monitor/StudentLookupSelector";
import { TeacherLookupSelector } from "@/pages/monitor/TeacherLookupSelector";
import type {
  MonitorTopNavigatorId,
  QueueLane,
  RequirementFilter,
} from "@/pages/monitor/monitorFilters";
import type { MonitorFilterChip } from "@/pages/monitor/useMonitorFilterUi";
import type { SchoolStatus } from "@/types";

interface SchoolStatusCounts {
  all: number;
  active: number;
  inactive: number;
  pending: number;
}

interface QueueLaneCounts {
  all: number;
  urgent: number;
  returned: number;
  for_review: number;
  waiting_data: number;
}

interface MonitorQuickFiltersContentProps {
  activeTopNavigator: MonitorTopNavigatorId;
  showMoreFilters: boolean;
  hiddenAdvancedFilterCount: number;
  statusFilter: SchoolStatus | "all";
  onStatusFilterChange: (value: SchoolStatus | "all") => void;
  schoolStatusCounts: SchoolStatusCounts;
  requirementFilter: RequirementFilter;
  onRequirementFilterChange: (value: RequirementFilter) => void;
  visibleRequirementFilterOptions: Array<{ id: RequirementFilter; label: string }>;
  queueLane: QueueLane;
  onQueueLaneChange: (value: QueueLane) => void;
  queueLaneCounts: QueueLaneCounts;
  filterDateFrom: string;
  filterDateTo: string;
  onFilterDateFromChange: (value: string) => void;
  onFilterDateToChange: (value: string) => void;
  onClearDateRange: () => void;
  onToggleShowMoreFilters: () => void;
  schoolScopeSelectorProps: ComponentProps<typeof SchoolScopeSelector>;
  studentLookupSelectorProps: ComponentProps<typeof StudentLookupSelector>;
  teacherLookupSelectorProps: ComponentProps<typeof TeacherLookupSelector>;
  showAdvancedAnalytics: boolean;
  onToggleAdvancedAnalytics: () => void;
  activeFilterChips: MonitorFilterChip[];
  onClearAllFilters: () => void;
  onClearFilterChip: (chip: MonitorFilterChip["id"]) => void;
}

export function MonitorQuickFiltersContent({
  activeTopNavigator,
  showMoreFilters,
  hiddenAdvancedFilterCount,
  statusFilter,
  onStatusFilterChange,
  schoolStatusCounts,
  requirementFilter,
  onRequirementFilterChange,
  visibleRequirementFilterOptions,
  queueLane,
  onQueueLaneChange,
  queueLaneCounts,
  filterDateFrom,
  filterDateTo,
  onFilterDateFromChange,
  onFilterDateToChange,
  onClearDateRange,
  onToggleShowMoreFilters,
  schoolScopeSelectorProps,
  studentLookupSelectorProps,
  teacherLookupSelectorProps,
  showAdvancedAnalytics,
  onToggleAdvancedAnalytics,
  activeFilterChips,
  onClearAllFilters,
  onClearFilterChip,
}: MonitorQuickFiltersContentProps) {
  const statusOptions: FilterBarOption[] = [
    { value: "all", label: `All (${schoolStatusCounts.all})` },
    { value: "active", label: `Active (${schoolStatusCounts.active})` },
    { value: "inactive", label: `Inactive (${schoolStatusCounts.inactive})` },
    { value: "pending", label: `Pending (${schoolStatusCounts.pending})` },
  ];

  const workflowOptions: FilterBarOption[] = visibleRequirementFilterOptions.map((option) => ({
    value: option.id,
    label: option.label,
  }));

  return (
    <>
      <div className="mt-3">
        <FilterBar
          showStatus
          showCategory
          showDateRange
          statusLabel="School Status"
          statusValue={statusFilter}
          statusParamKey="status"
          statusOptions={statusOptions}
          onStatusChange={(value) => onStatusFilterChange(value as SchoolStatus | "all")}
          categoryLabel="Workflow"
          categoryValue={requirementFilter}
          categoryParamKey="workflow"
          categoryOptions={workflowOptions}
          onCategoryChange={(value) => onRequirementFilterChange(value as RequirementFilter)}
          dateFromValue={filterDateFrom}
          dateToValue={filterDateTo}
          dateFromParamKey="from"
          dateToParamKey="to"
          onDateFromChange={onFilterDateFromChange}
          onDateToChange={onFilterDateToChange}
          onClearDateRange={onClearDateRange}
        >
          <div
            className={`grid gap-2 ${
              activeTopNavigator === "reviews" || showMoreFilters ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-1"
            }`}
          >
            {(activeTopNavigator === "reviews" || showMoreFilters) && (
              <label className="inline-flex w-full items-center gap-2 rounded-sm border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600 shadow-sm">
                <ListChecks className="h-3.5 w-3.5 text-slate-400" />
                <select
                  value={queueLane}
                  onChange={(event) => onQueueLaneChange(event.target.value as QueueLane)}
                  className="w-full cursor-pointer border-none bg-transparent text-xs font-semibold text-slate-700 outline-none"
                >
                  <option value="all">All ({queueLaneCounts.all})</option>
                  <option value="urgent">Urgent ({queueLaneCounts.urgent})</option>
                  <option value="returned">Returned ({queueLaneCounts.returned})</option>
                  <option value="for_review">Review ({queueLaneCounts.for_review})</option>
                  <option value="waiting_data">Waiting ({queueLaneCounts.waiting_data})</option>
                </select>
              </label>
            )}

            <button
              type="button"
              onClick={onToggleShowMoreFilters}
              className="inline-flex w-full items-center justify-center gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50/40"
              aria-expanded={showMoreFilters}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
              Advanced
              {hiddenAdvancedFilterCount > 0 && (
                <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-primary-50 px-1 text-[10px] font-bold text-primary-700">
                  {hiddenAdvancedFilterCount}
                </span>
              )}
              <ChevronDown className={`h-3.5 w-3.5 transition ${showMoreFilters ? "rotate-180" : ""}`} />
            </button>
          </div>

          {showMoreFilters && (
            <div className="mt-2 space-y-2">
              <div className="grid gap-2 md:grid-cols-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  <SchoolScopeSelector {...schoolScopeSelectorProps} />
                </div>
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-3.5 w-3.5 text-slate-400" />
                  <StudentLookupSelector {...studentLookupSelectorProps} />
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  <TeacherLookupSelector {...teacherLookupSelectorProps} />
                </div>
              </div>

              {activeTopNavigator === "overview" && (
                <div className="flex items-center justify-between gap-3 rounded-sm border border-slate-200 bg-white px-2.5 py-2">
                  <p className="text-[11px] font-semibold text-slate-700">Analytics</p>
                  <button
                    id="monitor-analytics-toggle"
                    type="button"
                    onClick={onToggleAdvancedAnalytics}
                    className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    {showAdvancedAnalytics ? "Hide" : "Show"}
                  </button>
                </div>
              )}
            </div>
          )}
        </FilterBar>
      </div>

      {activeFilterChips.length > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Active</p>
            <button
              type="button"
              onClick={onClearAllFilters}
              className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700 transition hover:bg-primary-100"
            >
              Clear
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => onClearFilterChip(chip.id)}
                className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
              >
                {chip.label}
                <X className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
