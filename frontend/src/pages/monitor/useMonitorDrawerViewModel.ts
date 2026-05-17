import { useMemo } from "react";
import type { MonitorSchoolRequirementSummary } from "@/pages/monitor/MonitorSchoolRecordsList";
import type {
  MonitorDrawerHistorySummary,
  MonitorDrawerYearDetail,
  SchoolDetailSnapshot,
  SchoolDrawerCriticalAlert,
  SchoolIndicatorMatrix,
  SchoolIndicatorPackageRow,
  SchoolIndicatorRowGroup,
} from "@/pages/monitor/monitorDrawerTypes";
import {
  sortSchoolYears,
} from "@/pages/monitor/monitorDrawerViewModelUtils";
import {
  buildMonitorDrawerYearDetail,
  resolveMonitorSchoolDetailYearSelection,
} from "@/pages/monitor/monitorSchoolDetailYear";
import { buildMonitorDrawerHistorySummary } from "@/pages/monitor/monitorSchoolDetailHistory";
import {
  buildMonitorSchoolDetailAlerts,
  buildMonitorSchoolDetailSnapshot,
} from "@/pages/monitor/monitorSchoolDetailAlerts";
import {
  buildMonitorSchoolIndicatorMatrix,
  buildMonitorSchoolIndicatorPackageRows,
  deriveMissingMonitorDrawerIndicatorKeys,
  deriveReturnedMonitorDrawerIndicatorKeys,
  groupMonitorSchoolIndicatorRowsByCategory,
  resolveLatestMonitorSchoolIndicatorYear,
} from "@/pages/monitor/monitorSchoolDetailMatrix";
import type { IndicatorSubmission, SchoolRecord } from "@/types";

interface UseMonitorDrawerViewModelArgs {
  schoolDrawerKey: string | null;
  selectedSchoolDrawerYear: string | null;
  schoolDrawerSubmissions: IndicatorSubmission[];
  schoolDrawerSubmissionsError: string;
  schoolRequirementByKey: Map<string, MonitorSchoolRequirementSummary>;
  recordBySchoolKey: Map<string, SchoolRecord>;
  studentStatsBySchoolKey: Map<string, { students: number; teachers: Set<string> }>;
  accurateSyncedCountsBySchoolKey: Record<string, { students: number; teachers: number }>;
}

export interface UseMonitorDrawerViewModelResult {
  schoolIndicatorMatrix: SchoolIndicatorMatrix;
  schoolIndicatorRowsByCategory: SchoolIndicatorRowGroup[];
  schoolIndicatorPackageRows: SchoolIndicatorPackageRow[];
  latestSchoolPackage: SchoolIndicatorPackageRow | null;
  latestSchoolIndicatorYear: string;
  missingDrawerIndicatorKeys: string[];
  returnedDrawerIndicatorKeys: string[];
  missingDrawerIndicatorKeySet: Set<string>;
  returnedDrawerIndicatorKeySet: Set<string>;
  schoolDetail: SchoolDetailSnapshot | null;
  schoolDrawerYearDetail: MonitorDrawerYearDetail | null;
  schoolDrawerHistorySummary: MonitorDrawerHistorySummary | null;
  schoolDrawerCriticalAlerts: SchoolDrawerCriticalAlert[];
}

export function useMonitorDrawerViewModel({
  schoolDrawerKey,
  selectedSchoolDrawerYear,
  schoolDrawerSubmissions,
  schoolDrawerSubmissionsError,
  schoolRequirementByKey,
  recordBySchoolKey,
  studentStatsBySchoolKey,
  accurateSyncedCountsBySchoolKey,
}: UseMonitorDrawerViewModelArgs): UseMonitorDrawerViewModelResult {
  const schoolIndicatorMatrix = useMemo<SchoolIndicatorMatrix>(() => {
    return buildMonitorSchoolIndicatorMatrix(schoolDrawerSubmissions);
  }, [schoolDrawerSubmissions]);

  const schoolIndicatorRowsByCategory = useMemo(
    () => groupMonitorSchoolIndicatorRowsByCategory(schoolIndicatorMatrix.rows),
    [schoolIndicatorMatrix.rows],
  );

  const schoolIndicatorPackageRows = useMemo<SchoolIndicatorPackageRow[]>(
    () => buildMonitorSchoolIndicatorPackageRows(schoolDrawerSubmissions),
    [schoolDrawerSubmissions],
  );

  const latestSchoolPackage = useMemo(
    () => schoolIndicatorPackageRows[0] ?? null,
    [schoolIndicatorPackageRows],
  );

  const latestSchoolIndicatorYear = useMemo(
    () => resolveLatestMonitorSchoolIndicatorYear(schoolIndicatorMatrix.years),
    [schoolIndicatorMatrix.years],
  );

  const effectiveSelectedSchoolDrawerYear = useMemo(() => {
    return resolveMonitorSchoolDetailYearSelection(
      schoolDrawerSubmissions,
      selectedSchoolDrawerYear,
    ).effectiveSelectedYear ?? "";
  }, [schoolDrawerSubmissions, selectedSchoolDrawerYear]);

  const schoolIndicatorRowKeySet = useMemo(
    () => new Set(schoolIndicatorMatrix.rows.map((row) => row.key)),
    [schoolIndicatorMatrix.rows],
  );

  const missingDrawerIndicatorKeys = useMemo(() => {
    return deriveMissingMonitorDrawerIndicatorKeys(
      schoolIndicatorMatrix.rows,
      effectiveSelectedSchoolDrawerYear,
    );
  }, [effectiveSelectedSchoolDrawerYear, schoolIndicatorMatrix.rows]);

  const returnedDrawerIndicatorKeys = useMemo(() => {
    return deriveReturnedMonitorDrawerIndicatorKeys(
      schoolDrawerSubmissions,
      effectiveSelectedSchoolDrawerYear,
      schoolIndicatorRowKeySet,
    );
  }, [effectiveSelectedSchoolDrawerYear, schoolDrawerSubmissions, schoolIndicatorRowKeySet]);

  const missingDrawerIndicatorKeySet = useMemo(
    () => new Set(missingDrawerIndicatorKeys),
    [missingDrawerIndicatorKeys],
  );

  const returnedDrawerIndicatorKeySet = useMemo(
    () => new Set(returnedDrawerIndicatorKeys),
    [returnedDrawerIndicatorKeys],
  );

  const schoolDetail = useMemo<SchoolDetailSnapshot | null>(() => {
    return buildMonitorSchoolDetailSnapshot({
      schoolDrawerKey,
      schoolRequirementByKey,
      recordBySchoolKey,
      studentStatsBySchoolKey,
      accurateSyncedCountsBySchoolKey,
    });
  }, [
    accurateSyncedCountsBySchoolKey,
    recordBySchoolKey,
    schoolDrawerKey,
    schoolRequirementByKey,
    studentStatsBySchoolKey,
  ]);

  const schoolDrawerYearDetail = useMemo(
    () => buildMonitorDrawerYearDetail(schoolDetail, effectiveSelectedSchoolDrawerYear, schoolDrawerSubmissions, schoolIndicatorMatrix.rows),
    [effectiveSelectedSchoolDrawerYear, schoolDetail, schoolDrawerSubmissions, schoolIndicatorMatrix.rows],
  );

  const schoolDrawerHistorySummary = useMemo(
    () => buildMonitorDrawerHistorySummary(schoolDrawerSubmissions),
    [schoolDrawerSubmissions],
  );

  const schoolDrawerCriticalAlerts = useMemo<SchoolDrawerCriticalAlert[]>(() => {
    return buildMonitorSchoolDetailAlerts(schoolDetail, schoolDrawerSubmissionsError);
  }, [schoolDetail, schoolDrawerSubmissionsError]);

  return {
    schoolIndicatorMatrix,
    schoolIndicatorRowsByCategory,
    schoolIndicatorPackageRows,
    latestSchoolPackage,
    latestSchoolIndicatorYear,
    missingDrawerIndicatorKeys,
    returnedDrawerIndicatorKeys,
    missingDrawerIndicatorKeySet,
    returnedDrawerIndicatorKeySet,
    schoolDetail,
    schoolDrawerYearDetail,
    schoolDrawerHistorySummary,
    schoolDrawerCriticalAlerts,
  };
}
