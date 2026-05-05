import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { MonitorQuickFiltersContent } from "@/pages/monitor/MonitorQuickFiltersContent";
import type { MonitorQuickJumpBindings } from "@/pages/monitor/MonitorQuickJumpChips";
import { SchoolScopeSelector } from "@/pages/monitor/SchoolScopeSelector";
import { StudentLookupSelector } from "@/pages/monitor/StudentLookupSelector";
import { TeacherLookupSelector } from "@/pages/monitor/TeacherLookupSelector";
import { buildMonitorSchoolDrawerProps } from "@/pages/monitor/buildMonitorSchoolDrawerProps";
import type { ScopeDropdownId } from "@/pages/monitor/useMonitorLookups";

type QuickFiltersProps = ComponentProps<typeof MonitorQuickFiltersContent>;
type SchoolScopeSelectorProps = ComponentProps<typeof SchoolScopeSelector>;
type StudentLookupSelectorProps = ComponentProps<typeof StudentLookupSelector>;
type TeacherLookupSelectorProps = ComponentProps<typeof TeacherLookupSelector>;
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
  studentLookupQuery: StudentLookupSelectorProps["query"];
  setStudentLookupQuery: StudentLookupSelectorProps["onQueryChange"];
  selectedStudentLabel: StudentLookupSelectorProps["selectedLabel"];
  isStudentLookupSyncing: StudentLookupSelectorProps["isSyncing"];
  studentLookupPlaceholder: StudentLookupSelectorProps["placeholder"];
  filteredStudentLookupOptions: StudentLookupSelectorProps["filteredOptions"];
  teacherScopedStudentLookupOptions: StudentLookupSelectorProps["allOptions"];
  selectedStudentId: StudentLookupSelectorProps["selectedStudentId"];
  handleClearStudentLookup: StudentLookupSelectorProps["onClearSelection"];
  handleSelectStudentLookup: StudentLookupSelectorProps["onSelectOption"];
  teacherLookupQuery: TeacherLookupSelectorProps["query"];
  setTeacherLookupQuery: TeacherLookupSelectorProps["onQueryChange"];
  selectedTeacherLabel: TeacherLookupSelectorProps["selectedLabel"];
  isTeacherLookupSyncing: TeacherLookupSelectorProps["isSyncing"];
  filteredTeacherLookupOptions: TeacherLookupSelectorProps["filteredOptions"];
  teacherLookupOptions: TeacherLookupSelectorProps["allOptions"];
  selectedTeacherId: TeacherLookupSelectorProps["selectedTeacherId"];
  handleClearTeacherLookup: TeacherLookupSelectorProps["onClearSelection"];
  handleSelectTeacherLookup: TeacherLookupSelectorProps["onSelectOption"];
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
  studentLookupQuery,
  setStudentLookupQuery,
  selectedStudentLabel,
  isStudentLookupSyncing,
  studentLookupPlaceholder,
  filteredStudentLookupOptions,
  teacherScopedStudentLookupOptions,
  selectedStudentId,
  handleClearStudentLookup,
  handleSelectStudentLookup,
  teacherLookupQuery,
  setTeacherLookupQuery,
  selectedTeacherLabel,
  isTeacherLookupSyncing,
  filteredTeacherLookupOptions,
  teacherLookupOptions,
  selectedTeacherId,
  handleClearTeacherLookup,
  handleSelectTeacherLookup,
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

  const studentLookupSelectorSharedProps = {
    selectedLabel: selectedStudentLabel,
    isSyncing: isStudentLookupSyncing,
    query: studentLookupQuery,
    placeholder: studentLookupPlaceholder,
    filteredOptions: filteredStudentLookupOptions,
    allOptions: teacherScopedStudentLookupOptions,
    selectedStudentId,
    onQueryChange: setStudentLookupQuery,
    onClearQuery: () => setStudentLookupQuery(""),
    onClearSelection: handleClearStudentLookup,
    onSelectOption: handleSelectStudentLookup,
  };

  const teacherLookupSelectorSharedProps = {
    selectedLabel: selectedTeacherLabel,
    isSyncing: isTeacherLookupSyncing,
    query: teacherLookupQuery,
    filteredOptions: filteredTeacherLookupOptions,
    allOptions: teacherLookupOptions,
    selectedTeacherId,
    onQueryChange: setTeacherLookupQuery,
    onClearQuery: () => setTeacherLookupQuery(""),
    onClearSelection: handleClearTeacherLookup,
    onSelectOption: handleSelectTeacherLookup,
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
    studentLookupSelectorProps: {
      ...studentLookupSelectorSharedProps,
      dropdownId: "students_filters",
      isOpen: openScopeDropdownId === "students_filters",
      rootClassName: "relative flex-1",
      onToggle: () => toggleScopeDropdown("students_filters"),
    },
    teacherLookupSelectorProps: {
      ...teacherLookupSelectorSharedProps,
      dropdownId: "teachers_filters",
      isOpen: openScopeDropdownId === "teachers_filters",
      rootClassName: "relative flex-1",
      onToggle: () => toggleScopeDropdown("teachers_filters"),
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
