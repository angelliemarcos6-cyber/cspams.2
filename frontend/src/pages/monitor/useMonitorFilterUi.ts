import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  ALL_SCHOOL_SCOPE,
  type MonitorTopNavigatorId,
  type QueueLane,
  type RequirementFilter,
  type SchoolQuickPreset,
} from "@/pages/monitor/monitorFilters";
import {
  SCHOOL_QUICK_PRESET_OPTIONS,
} from "@/pages/monitor/monitorDashboardConfig";
import { queueLaneLabel, requirementFilterLabel } from "@/pages/monitor/monitorDashboardUiUtils";
import type { ScopeDropdownId } from "@/pages/monitor/useMonitorLookups";
import type { SchoolStatus } from "@/types";
import { statusLabel } from "@/utils/analytics";

type FilterChipId =
  | "search"
  | "status"
  | "requirement"
  | "lane"
  | "preset"
  | "school"
  | "student"
  | "teacher"
  | "date";

interface SelectedSchoolScopeSummary {
  code: string;
}

interface SelectedStudentLookupSummary {
  fullName: string;
}

interface SelectedTeacherLookupSummary {
  name: string;
}

export interface MonitorFilterChip {
  id: FilterChipId;
  label: string;
}

interface UseMonitorFilterUiArgs {
  filtersHydrated: boolean;
  activeTopNavigator: MonitorTopNavigatorId;
  queueLane: QueueLane;
  selectedSchoolScopeKey: string;
  selectedStudentLookupId: string | null;
  selectedTeacherLookupId: string | null;
  filterDateFrom: string;
  filterDateTo: string;
  requirementFilter: RequirementFilter;
  schoolQuickPreset: SchoolQuickPreset;
  effectiveSearch: string;
  statusFilter: SchoolStatus | "all";
  selectedSchoolScope: SelectedSchoolScopeSummary | null;
  selectedStudentLookup: SelectedStudentLookupSummary | null;
  selectedTeacherLookup: SelectedTeacherLookupSummary | null;
  showAdvancedFilters: boolean;
  openScopeDropdownId: ScopeDropdownId | null;
  setShowMoreFilters: Dispatch<SetStateAction<boolean>>;
  setShowAdvancedFilters: Dispatch<SetStateAction<boolean>>;
  resetMonitorFilters: () => void;
  setSchoolScopeQuery: (value: string) => void;
  setStudentLookupQuery: (value: string) => void;
  setTeacherLookupQuery: (value: string) => void;
  setOpenScopeDropdownId: Dispatch<SetStateAction<ScopeDropdownId | null>>;
  setSearch: (value: string) => void;
  setStatusFilter: (value: SchoolStatus | "all") => void;
  setRequirementFilter: (value: RequirementFilter) => void;
  setQueueLane: (value: QueueLane) => void;
  setSchoolQuickPreset: (value: SchoolQuickPreset) => void;
  setFilterDateFrom: (value: string) => void;
  setFilterDateTo: (value: string) => void;
  setSelectedSchoolScopeKey: (value: string) => void;
  setSelectedStudentLookupId: (value: string | null) => void;
  setSelectedTeacherLookupId: (value: string | null) => void;
}

export interface UseMonitorFilterUiResult {
  activeFilterChips: MonitorFilterChip[];
  hiddenAdvancedFilterCount: number;
  clearAllFilters: () => void;
  resetQueueFilters: () => void;
  clearFilterChip: (chipId: FilterChipId) => void;
}

export function useMonitorFilterUi({
  filtersHydrated,
  activeTopNavigator,
  queueLane,
  selectedSchoolScopeKey,
  selectedStudentLookupId,
  selectedTeacherLookupId,
  filterDateFrom,
  filterDateTo,
  requirementFilter,
  schoolQuickPreset,
  effectiveSearch,
  statusFilter,
  selectedSchoolScope,
  selectedStudentLookup,
  selectedTeacherLookup,
  showAdvancedFilters,
  openScopeDropdownId,
  setShowMoreFilters,
  setShowAdvancedFilters,
  resetMonitorFilters,
  setSchoolScopeQuery,
  setStudentLookupQuery,
  setTeacherLookupQuery,
  setOpenScopeDropdownId,
  setSearch,
  setStatusFilter,
  setRequirementFilter,
  setQueueLane,
  setSchoolQuickPreset,
  setFilterDateFrom,
  setFilterDateTo,
  setSelectedSchoolScopeKey,
  setSelectedStudentLookupId,
  setSelectedTeacherLookupId,
}: UseMonitorFilterUiArgs): UseMonitorFilterUiResult {
  const didAutoExpandMoreFiltersRef = useRef(false);

  useEffect(() => {
    if (!filtersHydrated || didAutoExpandMoreFiltersRef.current) {
      return;
    }

    didAutoExpandMoreFiltersRef.current = true;

    const shouldExpand =
      (activeTopNavigator !== "reviews" && queueLane !== "all") ||
      selectedSchoolScopeKey !== ALL_SCHOOL_SCOPE ||
      Boolean(selectedStudentLookupId) ||
      Boolean(selectedTeacherLookupId);

    if (shouldExpand) {
      setShowMoreFilters(true);
    }
  }, [
    activeTopNavigator,
    filtersHydrated,
    queueLane,
    selectedSchoolScopeKey,
    selectedStudentLookupId,
    selectedTeacherLookupId,
    setShowMoreFilters,
  ]);

  useEffect(() => {
    if (!showAdvancedFilters || typeof window === "undefined") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openScopeDropdownId) return;
      setShowAdvancedFilters(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openScopeDropdownId, setShowAdvancedFilters, showAdvancedFilters]);

  const activeFilterChips = useMemo<MonitorFilterChip[]>(() => {
    const chips: MonitorFilterChip[] = [];

    if (effectiveSearch.trim()) chips.push({ id: "search", label: `Search: ${effectiveSearch.trim()}` });
    if (statusFilter !== "all") chips.push({ id: "status", label: `Status: ${statusLabel(statusFilter)}` });
    if (requirementFilter !== "all") {
      chips.push({ id: "requirement", label: `Queue: ${requirementFilterLabel(requirementFilter)}` });
    }
    if (queueLane !== "all") chips.push({ id: "lane", label: `Lane: ${queueLaneLabel(queueLane)}` });
    if (schoolQuickPreset !== "all") {
      const presetLabel =
        SCHOOL_QUICK_PRESET_OPTIONS.find((option) => option.id === schoolQuickPreset)?.label ?? schoolQuickPreset;
      chips.push({ id: "preset", label: `Preset: ${presetLabel}` });
    }
    if (filterDateFrom || filterDateTo) {
      chips.push({
        id: "date",
        label: `Date: ${filterDateFrom || "Any"} to ${filterDateTo || "Any"}`,
      });
    }
    if (selectedSchoolScope) chips.push({ id: "school", label: `School: ${selectedSchoolScope.code}` });
    if (selectedStudentLookup) chips.push({ id: "student", label: `Student: ${selectedStudentLookup.fullName}` });
    if (selectedTeacherLookup) chips.push({ id: "teacher", label: `Teacher: ${selectedTeacherLookup.name}` });

    return chips;
  }, [
    effectiveSearch,
    filterDateFrom,
    filterDateTo,
    queueLane,
    requirementFilter,
    schoolQuickPreset,
    selectedSchoolScope,
    selectedStudentLookup,
    selectedTeacherLookup,
    statusFilter,
  ]);

  const hiddenAdvancedFilterCount = useMemo(
    () =>
      (selectedSchoolScopeKey !== ALL_SCHOOL_SCOPE ? 1 : 0) +
      (selectedStudentLookupId ? 1 : 0) +
      (selectedTeacherLookupId ? 1 : 0) +
      (activeTopNavigator !== "reviews" && queueLane !== "all" ? 1 : 0),
    [
      activeTopNavigator,
      queueLane,
      selectedSchoolScopeKey,
      selectedStudentLookupId,
      selectedTeacherLookupId,
    ],
  );

  const clearAllFilters = useCallback(() => {
    resetMonitorFilters();
    setSchoolScopeQuery("");
    setStudentLookupQuery("");
    setTeacherLookupQuery("");
    setOpenScopeDropdownId(null);
  }, [
    resetMonitorFilters,
    setOpenScopeDropdownId,
    setSchoolScopeQuery,
    setStudentLookupQuery,
    setTeacherLookupQuery,
  ]);

  const resetQueueFilters = useCallback(() => {
    setRequirementFilter("all");
    setQueueLane("all");
  }, [setQueueLane, setRequirementFilter]);

  const clearFilterChip = useCallback(
    (chipId: FilterChipId) => {
      switch (chipId) {
        case "search":
          setSearch("");
          break;
        case "status":
          setStatusFilter("all");
          break;
        case "requirement":
          setRequirementFilter("all");
          break;
        case "lane":
          setQueueLane("all");
          break;
        case "preset":
          setSchoolQuickPreset("all");
          break;
        case "date":
          setFilterDateFrom("");
          setFilterDateTo("");
          break;
        case "school":
          setSelectedSchoolScopeKey(ALL_SCHOOL_SCOPE);
          setSelectedStudentLookupId(null);
          setSelectedTeacherLookupId(null);
          setSchoolScopeQuery("");
          setStudentLookupQuery("");
          setTeacherLookupQuery("");
          break;
        case "student":
          setSelectedStudentLookupId(null);
          setStudentLookupQuery("");
          break;
        case "teacher":
          setSelectedTeacherLookupId(null);
          setTeacherLookupQuery("");
          break;
        default:
          break;
      }
    },
    [
      setFilterDateFrom,
      setFilterDateTo,
      setQueueLane,
      setRequirementFilter,
      setSchoolQuickPreset,
      setSchoolScopeQuery,
      setSearch,
      setSelectedSchoolScopeKey,
      setSelectedStudentLookupId,
      setSelectedTeacherLookupId,
      setStatusFilter,
      setStudentLookupQuery,
      setTeacherLookupQuery,
    ],
  );

  return {
    activeFilterChips,
    hiddenAdvancedFilterCount,
    clearAllFilters,
    resetQueueFilters,
    clearFilterChip,
  };
}
