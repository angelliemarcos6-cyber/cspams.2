import { useCallback, useEffect, useState, type SetStateAction } from "react";
import type { SchoolStatus } from "@/types";
import {
  ALL_SCHOOL_SCOPE,
  DEFAULT_MONITOR_FILTERS,
  MONITOR_FILTER_STORAGE_KEY,
  MONITOR_SEARCH_DEBOUNCE_MS,
  type MonitorFilters,
  type MonitorTopNavigatorId,
  type PersistedMonitorFilters,
  type QueueLane,
  type RequirementFilter,
  type SchoolQuickPreset,
  isValidQueueLane,
  isValidRequirementFilter,
  isValidSchoolQuickPreset,
  isValidSchoolStatusFilter,
  normalizeDateInput,
  resolveMonitorTopNavigator,
} from "./monitorFilters";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

function hydrateFilters(): MonitorFilters {
  if (typeof window === "undefined") {
    return DEFAULT_MONITOR_FILTERS;
  }

  const params = new URLSearchParams(window.location.search);
  const hasQueryFilters = ["q", "status", "workflow", "lane", "preset", "school", "from", "to", "tab"].some((key) =>
    params.has(key),
  );
  const requestedTab = params.get("tab");

  let persisted: PersistedMonitorFilters | null = null;

  if (hasQueryFilters) {
    persisted = {
      search: params.get("q") ?? "",
      statusFilter: (params.get("status") as SchoolStatus | "all" | null) ?? undefined,
      requirementFilter: (params.get("workflow") as RequirementFilter | null) ?? undefined,
      queueLane: (params.get("lane") as QueueLane | null) ?? undefined,
      schoolQuickPreset: (params.get("preset") as SchoolQuickPreset | null) ?? undefined,
      schoolScopeKey: params.get("school") ?? ALL_SCHOOL_SCOPE,
      filterDateFrom: params.get("from") ?? "",
      filterDateTo: params.get("to") ?? "",
      activeTopNavigator: (params.get("tab") as MonitorTopNavigatorId | null) ?? undefined,
    };
  } else {
    try {
      const raw = localStorage.getItem(MONITOR_FILTER_STORAGE_KEY);
      if (raw) {
        persisted = JSON.parse(raw) as PersistedMonitorFilters;
      }
    } catch {
      persisted = null;
    }
  }

  const nextFilters: MonitorFilters = {
    ...DEFAULT_MONITOR_FILTERS,
    search: persisted?.search?.trim() ?? "",
    selectedSchoolScopeKey: persisted?.schoolScopeKey || ALL_SCHOOL_SCOPE,
    filterDateFrom: normalizeDateInput(persisted?.filterDateFrom),
    filterDateTo: normalizeDateInput(persisted?.filterDateTo),
    activeTopNavigator:
      resolveMonitorTopNavigator(requestedTab ?? persisted?.activeTopNavigator ?? null) ?? DEFAULT_MONITOR_FILTERS.activeTopNavigator,
  };

  if (isValidSchoolStatusFilter(persisted?.statusFilter)) {
    nextFilters.statusFilter = persisted.statusFilter;
  }

  if (isValidRequirementFilter(persisted?.requirementFilter)) {
    nextFilters.requirementFilter = persisted.requirementFilter;
  }

  if (isValidQueueLane(persisted?.queueLane)) {
    nextFilters.queueLane = persisted.queueLane;
  }

  if (isValidSchoolQuickPreset(persisted?.schoolQuickPreset)) {
    nextFilters.schoolQuickPreset = persisted.schoolQuickPreset;
  }

  if (nextFilters.filterDateFrom && nextFilters.filterDateTo && nextFilters.filterDateFrom > nextFilters.filterDateTo) {
    return {
      ...nextFilters,
      filterDateFrom: nextFilters.filterDateTo,
      filterDateTo: nextFilters.filterDateFrom,
    };
  }

  return nextFilters;
}

export interface UseMonitorFiltersResult {
  search: string;
  effectiveSearch: string;
  statusFilter: SchoolStatus | "all";
  filterDateFrom: string;
  filterDateTo: string;
  requirementFilter: RequirementFilter;
  selectedSchoolScopeKey: string;
  filtersHydrated: boolean;
  activeTopNavigator: MonitorTopNavigatorId;
  queueLane: QueueLane;
  schoolQuickPreset: SchoolQuickPreset;
  patchFilters: (patch: Partial<MonitorFilters>) => void;
  setSearch: (value: SetStateAction<string>) => void;
  setStatusFilter: (value: SetStateAction<SchoolStatus | "all">) => void;
  setFilterDateFrom: (value: SetStateAction<string>) => void;
  setFilterDateTo: (value: SetStateAction<string>) => void;
  setRequirementFilter: (value: SetStateAction<RequirementFilter>) => void;
  setSelectedSchoolScopeKey: (value: SetStateAction<string>) => void;
  setActiveTopNavigator: (value: SetStateAction<MonitorTopNavigatorId>) => void;
  setQueueLane: (value: SetStateAction<QueueLane>) => void;
  setSchoolQuickPreset: (value: SetStateAction<SchoolQuickPreset>) => void;
  resetFilters: () => void;
}

export function useMonitorFilters(): UseMonitorFiltersResult {
  const [filters, setFilters] = useState<MonitorFilters>(DEFAULT_MONITOR_FILTERS);
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const debouncedSearch = useDebouncedValue(filters.search, MONITOR_SEARCH_DEBOUNCE_MS);
  const effectiveSearch = filters.search.trim().length === 0 ? "" : debouncedSearch;

  useEffect(() => {
    setFilters(hydrateFilters());
    setFiltersHydrated(true);
  }, []);

  useEffect(() => {
    if (!filters.filterDateFrom || !filters.filterDateTo) {
      return;
    }

    if (filters.filterDateFrom <= filters.filterDateTo) {
      return;
    }

    setFilters((current) => ({
      ...current,
      filterDateFrom: current.filterDateTo,
      filterDateTo: current.filterDateFrom,
    }));
  }, [filters.filterDateFrom, filters.filterDateTo]);

  useEffect(() => {
    if (!filtersHydrated || typeof window === "undefined") {
      return;
    }

    const payload: PersistedMonitorFilters = {
      search: effectiveSearch,
      statusFilter: filters.statusFilter,
      requirementFilter: filters.requirementFilter,
      queueLane: filters.queueLane,
      schoolQuickPreset: filters.schoolQuickPreset,
      schoolScopeKey: filters.selectedSchoolScopeKey,
      filterDateFrom: filters.filterDateFrom,
      filterDateTo: filters.filterDateTo,
      activeTopNavigator: filters.activeTopNavigator,
    };

    try {
      localStorage.setItem(MONITOR_FILTER_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage failures in restricted browser modes.
    }

    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string | null) => {
      if (!value) {
        params.delete(key);
        return;
      }

      params.set(key, value);
    };

    setOrDelete("q", effectiveSearch.trim() ? effectiveSearch.trim() : null);
    setOrDelete("status", filters.statusFilter !== "all" ? filters.statusFilter : null);
    setOrDelete("workflow", filters.requirementFilter !== "all" ? filters.requirementFilter : null);
    setOrDelete("lane", filters.queueLane !== "all" ? filters.queueLane : null);
    setOrDelete("preset", filters.schoolQuickPreset !== "all" ? filters.schoolQuickPreset : null);
    setOrDelete("school", filters.selectedSchoolScopeKey !== ALL_SCHOOL_SCOPE ? filters.selectedSchoolScopeKey : null);
    params.delete("student");
    params.delete("teacher");
    setOrDelete("from", filters.filterDateFrom.trim() ? filters.filterDateFrom.trim() : null);
    setOrDelete("to", filters.filterDateTo.trim() ? filters.filterDateTo.trim() : null);
    setOrDelete(
      "tab",
      filters.activeTopNavigator !== DEFAULT_MONITOR_FILTERS.activeTopNavigator ? filters.activeTopNavigator : null,
    );

    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [
    effectiveSearch,
    filters.activeTopNavigator,
    filters.filterDateFrom,
    filters.filterDateTo,
    filters.queueLane,
    filters.requirementFilter,
    filters.schoolQuickPreset,
    filters.selectedSchoolScopeKey,
    filters.statusFilter,
    filtersHydrated,
  ]);

  const patchFilters = useCallback((patch: Partial<MonitorFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  const updateField = useCallback(
    <Key extends keyof MonitorFilters>(key: Key, value: SetStateAction<MonitorFilters[Key]>) => {
      setFilters((current) => ({
        ...current,
        [key]: typeof value === "function" ? (value as (currentValue: MonitorFilters[Key]) => MonitorFilters[Key])(current[key]) : value,
      }));
    },
    [],
  );

  const resetFilters = useCallback(() => {
    setFilters((current) => ({
      ...DEFAULT_MONITOR_FILTERS,
      activeTopNavigator: current.activeTopNavigator,
    }));
  }, []);

  return {
    search: filters.search,
    effectiveSearch,
    statusFilter: filters.statusFilter,
    filterDateFrom: filters.filterDateFrom,
    filterDateTo: filters.filterDateTo,
    requirementFilter: filters.requirementFilter,
    selectedSchoolScopeKey: filters.selectedSchoolScopeKey,
    filtersHydrated,
    activeTopNavigator: filters.activeTopNavigator,
    queueLane: filters.queueLane,
    schoolQuickPreset: filters.schoolQuickPreset,
    patchFilters,
    setSearch: (value) => updateField("search", value),
    setStatusFilter: (value) => updateField("statusFilter", value),
    setFilterDateFrom: (value) => updateField("filterDateFrom", value),
    setFilterDateTo: (value) => updateField("filterDateTo", value),
    setRequirementFilter: (value) => updateField("requirementFilter", value),
    setSelectedSchoolScopeKey: (value) => updateField("selectedSchoolScopeKey", value),
    setActiveTopNavigator: (value) => updateField("activeTopNavigator", value),
    setQueueLane: (value) => updateField("queueLane", value),
    setSchoolQuickPreset: (value) => updateField("schoolQuickPreset", value),
    resetFilters,
  };
}
