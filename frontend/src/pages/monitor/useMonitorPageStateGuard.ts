import { useEffect, type Dispatch, type SetStateAction } from "react";
import type {
  RequirementFilter,
  SchoolQuickPreset,
} from "@/pages/monitor/monitorFilters";
import type { SchoolStatus } from "@/types";

interface UseMonitorPageStateGuardArgs {
  filterDateFrom: string;
  filterDateTo: string;
  requirementFilter: RequirementFilter;
  schoolQuickPreset: SchoolQuickPreset;
  effectiveSearch: string;
  selectedSchoolScopeKey: string;
  statusFilter: SchoolStatus | "all";
  requirementsPage: number;
  recordsPage: number;
  totalRequirementPages: number;
  totalRecordPages: number;
  visibleRequirementFilterIds: RequirementFilter[];
  setRequirementsPage: Dispatch<SetStateAction<number>>;
  setRecordsPage: Dispatch<SetStateAction<number>>;
  setRequirementFilter: (value: RequirementFilter) => void;
}

export function useMonitorPageStateGuard({
  filterDateFrom,
  filterDateTo,
  requirementFilter,
  schoolQuickPreset,
  effectiveSearch,
  selectedSchoolScopeKey,
  statusFilter,
  requirementsPage,
  recordsPage,
  totalRequirementPages,
  totalRecordPages,
  visibleRequirementFilterIds,
  setRequirementsPage,
  setRecordsPage,
  setRequirementFilter,
}: UseMonitorPageStateGuardArgs) {
  useEffect(() => {
    setRequirementsPage(1);
    setRecordsPage(1);
  }, [
    effectiveSearch,
    filterDateFrom,
    filterDateTo,
    requirementFilter,
    schoolQuickPreset,
    selectedSchoolScopeKey,
    setRecordsPage,
    setRequirementsPage,
    statusFilter,
  ]);

  useEffect(() => {
    if (requirementsPage > totalRequirementPages) {
      setRequirementsPage(totalRequirementPages);
    }
  }, [requirementsPage, setRequirementsPage, totalRequirementPages]);

  useEffect(() => {
    if (recordsPage > totalRecordPages) {
      setRecordsPage(totalRecordPages);
    }
  }, [recordsPage, setRecordsPage, totalRecordPages]);

  useEffect(() => {
    if (visibleRequirementFilterIds.includes(requirementFilter)) {
      return;
    }

    setRequirementFilter("all");
  }, [requirementFilter, setRequirementFilter, visibleRequirementFilterIds]);
}
