import type { SchoolStatus } from "@/types";

export type RequirementFilter = "all" | "missing" | "waiting" | "returned" | "submitted" | "validated";
export type QueueLane = "all" | "urgent" | "returned" | "for_review" | "waiting_data";
export type SchoolQuickPreset = "all" | "pending" | "missing" | "returned" | "no_submission" | "high_risk";
export type MonitorTopNavigatorId = "overview" | "schools" | "reviews";

export interface PersistedMonitorFilters {
  search?: string;
  statusFilter?: SchoolStatus | "all";
  requirementFilter?: RequirementFilter;
  queueLane?: QueueLane;
  schoolQuickPreset?: SchoolQuickPreset;
  schoolScopeKey?: string;
  studentLookupId?: string | null;
  teacherLookupId?: string | null;
  teacherLookup?: string | null;
  filterDateFrom?: string;
  filterDateTo?: string;
  activeTopNavigator?: MonitorTopNavigatorId;
}

export interface MonitorFilters {
  search: string;
  statusFilter: SchoolStatus | "all";
  requirementFilter: RequirementFilter;
  queueLane: QueueLane;
  schoolQuickPreset: SchoolQuickPreset;
  selectedSchoolScopeKey: string;
  selectedStudentLookupId: string | null;
  selectedTeacherLookupId: string | null;
  filterDateFrom: string;
  filterDateTo: string;
  activeTopNavigator: MonitorTopNavigatorId;
}

export const ALL_SCHOOL_SCOPE = "__all_schools__";
export const MONITOR_FILTER_STORAGE_KEY = "cspams.monitor.filters.v1";
export const MONITOR_SEARCH_DEBOUNCE_MS = 320;

export const DEFAULT_MONITOR_FILTERS: MonitorFilters = {
  search: "",
  statusFilter: "all",
  requirementFilter: "all",
  queueLane: "all",
  schoolQuickPreset: "all",
  selectedSchoolScopeKey: ALL_SCHOOL_SCOPE,
  selectedStudentLookupId: null,
  selectedTeacherLookupId: null,
  filterDateFrom: "",
  filterDateTo: "",
  activeTopNavigator: "overview",
};

export function isValidRequirementFilter(value: string | null | undefined): value is RequirementFilter {
  return value === "all" || value === "missing" || value === "waiting" || value === "returned" || value === "submitted" || value === "validated";
}

export function isValidQueueLane(value: string | null | undefined): value is QueueLane {
  return value === "all" || value === "urgent" || value === "returned" || value === "for_review" || value === "waiting_data";
}

export function isValidSchoolQuickPreset(value: string | null | undefined): value is SchoolQuickPreset {
  return value === "all" || value === "pending" || value === "missing" || value === "returned" || value === "no_submission" || value === "high_risk";
}

export function isValidSchoolStatusFilter(value: string | null | undefined): value is SchoolStatus | "all" {
  return value === "all" || value === "active" || value === "inactive" || value === "pending";
}

export function resolveMonitorTopNavigator(value: string | null | undefined): MonitorTopNavigatorId | null {
  if (value === "overview" || value === "schools" || value === "reviews") {
    return value;
  }

  if (value === "reports") {
    return "overview";
  }

  if (value === "action_queue" || value === "compliance_review") {
    return "reviews";
  }

  return null;
}

export function normalizeDateInput(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}
