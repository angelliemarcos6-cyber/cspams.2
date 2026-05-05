import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { MonitorQuickFiltersContent } from "@/pages/monitor/MonitorQuickFiltersContent";
import type { MonitorQuickJumpBindings } from "@/pages/monitor/MonitorQuickJumpChips";
import { SchoolScopeSelector } from "@/pages/monitor/SchoolScopeSelector";
import { buildMonitorSchoolDrawerProps } from "@/pages/monitor/buildMonitorSchoolDrawerProps";
import type { ScopeDropdownId } from "@/pages/monitor/useMonitorLookups";

type QuickFiltersProps = ComponentProps<typeof MonitorQuickFiltersContent>;
type SchoolScopeSelectorProps = ComponentProps<typeof SchoolScopeSelector>;
type SchoolDrawerProps = ReturnType<typeof buildMonitorSchoolDrawerProps>;
type SchoolDrawerBuildArgs = Parameters<typeof buildMonitorSchoolDrawerProps>[0];

interface UseMonitorDashboardBindingsArgs {
  quickJumpItems: MonitorQuickJumpBindings["items"];
  getQuickJumpMeta: MonitorQuickJumpBindings["getQuickJumpMeta"];
  onQuickJump: MonitorQuickJumpBindings["onQuickJump"];
  activeTopNavigator: QuickFiltersProps["activeTopNavigator"];
  showMoreFilters: QuickFiltersProps["showMoreFilters"];
  setShowMoreFilters: Dispatch<SetStateAction<boolean>>;
  hiddenAdvancedFilterCount: QuickFiltersProps["hiddenAdvancedFilterCount"];
  statusFilter: QuickFiltersProps["statusFilter"];
  onStatusFilterChange: QuickFiltersProps["onStatusFilterChange"];
  schoolStatusCounts: QuickFiltersProps["schoolStatusCounts"];
  requirementFilter: QuickFiltersProps["requirementFilter"];
  onRequirementFilterChange: QuickFiltersProps["onRequirementFilterChange"];
  visibleRequirementFilterOptions: QuickFiltersProps["visibleRequirementFilterOptions"];
  queueLane: QuickFiltersProps["queueLane"];
  onQueueLaneChange: QuickFiltersProps["onQueueLaneChange"];
  queueLaneCounts: QuickFiltersProps["queueLaneCounts"];
  filterDateFrom: QuickFiltersProps["filterDateFrom"];
  filterDateTo: QuickFiltersProps["filterDateTo"];
  onFilterDateFromChange: QuickFiltersProps["onFilterDateFromChange"];
  onFilterDateToChange: QuickFiltersProps["onFilterDateToChange"];
  isLoading: SchoolScopeSelectorProps["isLoading"];
  schoolScopeQuery: SchoolScopeSelectorProps["query"];
  setSchoolScopeQuery: SchoolScopeSelectorProps["onQueryChange"];
  selectedSchoolScope: SchoolScopeSelectorProps["selectedScope"];
  filteredSchoolScopeOptions: SchoolScopeSelectorProps["filteredOptions"];
  schoolScopeOptions: SchoolScopeSelectorProps["allOptions"];
  handleSelectAllSchools: SchoolScopeSelectorProps["onSelectAll"];
  handleSelectSchoolScope: SchoolScopeSelectorProps["onSelectOption"];
  openScopeDropdownId: ScopeDropdownId | null;
  toggleScopeDropdown: (id: ScopeDropdownId) => void;
  showAdvancedAnalytics: QuickFiltersProps["showAdvancedAnalytics"];
  setShowAdvancedAnalytics: Dispatch<SetStateAction<boolean>>;
  activeFilterChips: QuickFiltersProps["activeFilterChips"];
  clearAllFilters: QuickFiltersProps["onClearAllFilters"];
  clearFilterChip: QuickFiltersProps["onClearFilterChip"];
  schoolDrawerBuildArgs: SchoolDrawerBuildArgs;
}

interface UseMonitorDashboardBindingsResult {
  quickJumpBindings: MonitorQuickJumpBindings;
  quickFiltersProps: QuickFiltersProps;
  schoolDrawerProps: SchoolDrawerProps;
}

export function useMonitorDashboardBindings({
  quickJumpItems,
  getQuickJumpMeta,
  onQuickJump,
  activeTopNavigator,
  showMoreFilters,
  setShowMoreFilters,
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
  isLoading,
  schoolScopeQuery,
  setSchoolScopeQuery,
  selectedSchoolScope,
  filteredSchoolScopeOptions,
  schoolScopeOptions,
  handleSelectAllSchools,
  handleSelectSchoolScope,
  openScopeDropdownId,
  toggleScopeDropdown,
  showAdvancedAnalytics,
  setShowAdvancedAnalytics,
  activeFilterChips,
  clearAllFilters,
  clearFilterChip,
  schoolDrawerBuildArgs,
}: UseMonitorDashboardBindingsArgs): UseMonitorDashboardBindingsResult {
  const quickJumpBindings = {
    items: quickJumpItems,
    getQuickJumpMeta,
    onQuickJump,
  };

  const schoolScopeSelectorSharedProps = {
    isLoading,
    query: schoolScopeQuery,
    selectedScope: selectedSchoolScope,
    filteredOptions: filteredSchoolScopeOptions,
    allOptions: schoolScopeOptions,
    onQueryChange: setSchoolScopeQuery,
    onClearQuery: () => setSchoolScopeQuery(""),
    onSelectAll: handleSelectAllSchools,
    onSelectOption: handleSelectSchoolScope,
  };

  const quickFiltersProps = {
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
    onClearDateRange: () => {
      onFilterDateFromChange("");
      onFilterDateToChange("");
    },
    onToggleShowMoreFilters: () => setShowMoreFilters((current) => !current),
    schoolScopeSelectorProps: {
      ...schoolScopeSelectorSharedProps,
      dropdownId: "schools_filters",
      isOpen: openScopeDropdownId === "schools_filters",
      rootClassName: "relative flex-1",
      onToggle: () => toggleScopeDropdown("schools_filters"),
    },
    showAdvancedAnalytics,
    onToggleAdvancedAnalytics: () => setShowAdvancedAnalytics((current) => !current),
    activeFilterChips,
    onClearAllFilters: clearAllFilters,
    onClearFilterChip: clearFilterChip,
  };

  const schoolDrawerProps = buildMonitorSchoolDrawerProps(schoolDrawerBuildArgs);

  return {
    quickJumpBindings,
    quickFiltersProps,
    schoolDrawerProps,
  };
}
