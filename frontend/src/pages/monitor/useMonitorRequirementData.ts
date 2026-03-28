import { useMemo } from "react";
import type { MonitorSchoolRecordsListRow, MonitorSchoolRequirementSummary } from "@/pages/monitor/MonitorSchoolRecordsList";
import type { MonitorTopNavigatorId, QueueLane, RequirementFilter, SchoolQuickPreset } from "@/pages/monitor/monitorFilters";
import type { SchoolRecord, SchoolStatus } from "@/types";
import {
  isAwaitingReview,
  isPassedToMonitor,
  matchesAllSearchTerms,
  matchesQueueLane,
  matchesRequirementFilter,
  matchesSchoolQuickPreset,
  normalizeSchoolKey,
  normalizeSearchTerms,
  parseDateBoundary,
  queuePriorityScore,
  resolveWorkflowStatus,
} from "@/pages/monitor/monitorRequirementRules";

type SchoolRequirementSummary = MonitorSchoolRequirementSummary;

interface UseMonitorRequirementDataArgs {
  records: SchoolRecord[];
  scopedRecords: SchoolRecord[];
  scopedSchoolKeys: Set<string> | null;
  selectedSchoolScopeKey: string;
  hasSelectedSchoolScope: boolean;
  selectedStudentLookupSchoolKey: string | null;
  hasSelectedStudentLookup: boolean;
  selectedTeacherSchoolKeys: Set<string> | null;
  hasSelectedTeacherLookup: boolean;
  filterDateFrom: string;
  filterDateTo: string;
  requirementFilter: RequirementFilter;
  statusFilter: SchoolStatus | "all";
  schoolQuickPreset: SchoolQuickPreset;
  queueLane: QueueLane;
  effectiveSearch: string;
  activeTopNavigator: MonitorTopNavigatorId;
  requirementsPage: number;
  recordsPage: number;
  requirementPageSize: number;
  recordPageSize: number;
  allSchoolScopeKey: string;
  requirementFilterOptions: Array<{ id: RequirementFilter; label: string }>;
}

export interface UseMonitorRequirementDataResult {
  schoolRequirementRows: SchoolRequirementSummary[];
  scopedRequirementRows: SchoolRequirementSummary[];
  schoolRequirementByKey: Map<string, SchoolRequirementSummary>;
  recordBySchoolKey: Map<string, SchoolRecord>;
  scopedRecordBySchoolKey: Map<string, SchoolRecord>;
  workflowStatusCounts: Record<RequirementFilter, number>;
  schoolStatusCounts: Record<SchoolStatus | "all", number>;
  visibleRequirementFilterIds: RequirementFilter[];
  visibleRequirementFilterOptions: Array<{ id: RequirementFilter; label: string }>;
  filteredRequirementRows: SchoolRequirementSummary[];
  filteredSchoolKeys: Set<string> | null;
  requirementCounts: {
    total: number;
    submittedAny: number;
    complete: number;
    awaitingReview: number;
    missing: number;
    returned: number;
  };
  needsActionCount: number;
  actionQueueRows: SchoolRequirementSummary[];
  queueLaneCounts: Record<QueueLane, number>;
  laneFilteredQueueRows: SchoolRequirementSummary[];
  schoolPresetCounts: Record<SchoolQuickPreset, number>;
  filteredSchoolsByPreset: SchoolRequirementSummary[];
  stickySummaryStats: {
    totalSchools: number;
    pending: number;
    missing: number;
    returned: number;
    atRisk: number;
  };
  queueWorkspaceSchoolFilterKeys: Set<string> | null;
  compactSchoolRows: MonitorSchoolRecordsListRow[];
  totalRequirementPages: number;
  safeRequirementsPage: number;
  paginatedRequirementRows: SchoolRequirementSummary[];
  totalRecordPages: number;
  safeRecordsPage: number;
  paginatedCompactSchoolRows: MonitorSchoolRecordsListRow[];
}

function buildRecordBySchoolKey(records: SchoolRecord[]): Map<string, SchoolRecord> {
  const map = new Map<string, SchoolRecord>();

  for (const record of records) {
    const key = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
    if (key === "unknown") continue;

    const existing = map.get(key);
    const existingUpdatedAt = new Date(existing?.lastUpdated ?? 0).getTime();
    const candidateUpdatedAt = new Date(record.lastUpdated ?? 0).getTime();

    if (!existing || candidateUpdatedAt >= existingUpdatedAt) {
      map.set(key, record);
    }
  }

  return map;
}

export function useMonitorRequirementData({
  records,
  scopedRecords,
  scopedSchoolKeys,
  selectedSchoolScopeKey,
  hasSelectedSchoolScope,
  selectedStudentLookupSchoolKey,
  hasSelectedStudentLookup,
  selectedTeacherSchoolKeys,
  hasSelectedTeacherLookup,
  filterDateFrom,
  filterDateTo,
  requirementFilter,
  statusFilter,
  schoolQuickPreset,
  queueLane,
  effectiveSearch,
  activeTopNavigator,
  requirementsPage,
  recordsPage,
  requirementPageSize,
  recordPageSize,
  allSchoolScopeKey,
  requirementFilterOptions,
}: UseMonitorRequirementDataArgs): UseMonitorRequirementDataResult {
  const schoolRequirementRows = useMemo<SchoolRequirementSummary[]>(() => {
    const rows = new Map<string, SchoolRequirementSummary>();

    const ensureRow = (
      schoolCode: string | null | undefined,
      schoolName: string | null | undefined,
      region: string | null | undefined,
      schoolStatus: SchoolStatus | null = null,
    ) => {
      const key = normalizeSchoolKey(schoolCode, schoolName);
      if (key === "unknown") return null;

      const normalizedCode = schoolCode?.trim() || "N/A";
      const normalizedName = schoolName?.trim() || normalizedCode || "Unknown School";
      const normalizedRegion = region?.trim() || "N/A";

      let row = rows.get(key);
      if (!row) {
        row = {
          schoolKey: key,
          schoolCode: normalizedCode,
          schoolName: normalizedName,
          region: normalizedRegion,
          schoolStatus,
          hasComplianceRecord: false,
          indicatorStatus: null,
          hasAnySubmitted: false,
          isComplete: false,
          awaitingReviewCount: 0,
          missingCount: 2,
          lastActivityAt: null,
          lastActivityTime: 0,
        };
        rows.set(key, row);
      } else {
        if (row.schoolCode === "N/A" && normalizedCode !== "N/A") {
          row.schoolCode = normalizedCode;
        }
        if ((row.schoolName === "Unknown School" || row.schoolName === "N/A") && normalizedName !== "Unknown School") {
          row.schoolName = normalizedName;
        }
        if (row.region === "N/A" && normalizedRegion !== "N/A") {
          row.region = normalizedRegion;
        }
        if (!row.schoolStatus && schoolStatus) {
          row.schoolStatus = schoolStatus;
        }
      }

      return row;
    };

    const setLastActivity = (row: SchoolRequirementSummary, ...dates: Array<string | null | undefined>) => {
      const activityTimes = dates
        .map((value) => new Date(value ?? 0).getTime())
        .filter((value) => Number.isFinite(value) && value > 0);
      const activityTime = activityTimes.length > 0 ? Math.max(...activityTimes) : 0;

      if (activityTime > row.lastActivityTime) {
        row.lastActivityTime = activityTime;
        row.lastActivityAt = new Date(activityTime).toISOString();
      }
    };

    for (const record of records) {
      const row = ensureRow(record.schoolId ?? record.schoolCode ?? null, record.schoolName, record.region, record.status);
      if (!row) continue;

      row.hasComplianceRecord = true;
      row.schoolStatus = record.status;
      setLastActivity(row, record.lastUpdated);

      const indicatorLatest = record.indicatorLatest ?? null;
      if (indicatorLatest) {
        row.indicatorStatus = indicatorLatest.status ?? null;
        setLastActivity(row, indicatorLatest.updatedAt, indicatorLatest.submittedAt, indicatorLatest.createdAt);
      }
    }

    return [...rows.values()]
      .map((row) => {
        const indicatorSubmitted = isPassedToMonitor(row.indicatorStatus);
        const missingCount = (row.hasComplianceRecord ? 0 : 1) + (indicatorSubmitted ? 0 : 1);
        const awaitingReviewCount = isAwaitingReview(row.indicatorStatus) ? 1 : 0;

        return {
          ...row,
          hasAnySubmitted: row.hasComplianceRecord || indicatorSubmitted,
          isComplete: missingCount === 0,
          missingCount,
          awaitingReviewCount,
        };
      })
      .sort((a, b) => a.schoolName.localeCompare(b.schoolName));
  }, [records]);

  const scopedRequirementRows = useMemo(() => {
    if (!scopedSchoolKeys) {
      return schoolRequirementRows;
    }

    return schoolRequirementRows.filter((row) => scopedSchoolKeys.has(row.schoolKey));
  }, [schoolRequirementRows, scopedSchoolKeys]);

  const schoolRequirementByKey = useMemo(
    () => new Map(scopedRequirementRows.map((row) => [row.schoolKey, row])),
    [scopedRequirementRows],
  );

  const recordBySchoolKey = useMemo(() => buildRecordBySchoolKey(records), [records]);
  const scopedRecordBySchoolKey = useMemo(() => buildRecordBySchoolKey(scopedRecords), [scopedRecords]);

  const workflowStatusCounts = useMemo<Record<RequirementFilter, number>>(() => {
    const counts: Record<RequirementFilter, number> = {
      all: scopedRequirementRows.length,
      missing: 0,
      waiting: 0,
      returned: 0,
      submitted: 0,
      validated: 0,
    };

    for (const row of scopedRequirementRows) {
      counts[resolveWorkflowStatus(row)] += 1;
    }

    return counts;
  }, [resolveWorkflowStatus, scopedRequirementRows]);

  const schoolStatusCounts = useMemo<Record<SchoolStatus | "all", number>>(() => {
    const counts: Record<SchoolStatus | "all", number> = {
      all: scopedRequirementRows.length,
      active: 0,
      inactive: 0,
      pending: 0,
    };

    for (const row of scopedRequirementRows) {
      if (row.schoolStatus === "active") {
        counts.active += 1;
      } else if (row.schoolStatus === "inactive") {
        counts.inactive += 1;
      } else if (row.schoolStatus === "pending") {
        counts.pending += 1;
      }
    }

    return counts;
  }, [scopedRequirementRows]);

  const visibleRequirementFilterIds = useMemo<RequirementFilter[]>(() => {
    if (activeTopNavigator === "reviews") {
      return ["all", "missing", "waiting", "returned"];
    }

    if (activeTopNavigator === "overview") {
      return ["all", "waiting", "returned", "submitted", "validated"];
    }

    return ["all", "missing", "waiting", "returned", "submitted", "validated"];
  }, [activeTopNavigator]);

  const visibleRequirementFilterOptions = useMemo(
    () =>
      requirementFilterOptions
        .filter((option) => visibleRequirementFilterIds.includes(option.id))
        .map((option) => ({
          id: option.id,
          label: `${option.label} (${workflowStatusCounts[option.id]})`,
        })),
    [requirementFilterOptions, visibleRequirementFilterIds, workflowStatusCounts],
  );

  const searchTerms = useMemo(() => normalizeSearchTerms(effectiveSearch), [effectiveSearch]);
  const shouldBuildRequirementSearchIndex = searchTerms.length > 0;

  const requirementSearchTextByKey = useMemo(() => {
    if (!shouldBuildRequirementSearchIndex) {
      return null;
    }

    const index = new Map<string, string>();

    for (const row of scopedRequirementRows) {
      const record = scopedRecordBySchoolKey.get(row.schoolKey);
      const searchableText = [
        row.schoolName,
        row.schoolCode,
        row.region,
        record?.level ?? "",
        record?.type ?? "",
        record?.address ?? record?.district ?? "",
        record?.submittedBy ?? "",
        record?.schoolHeadAccount?.name ?? "",
        record?.schoolHeadAccount?.email ?? "",
      ]
        .join(" ")
        .toLowerCase();

      index.set(row.schoolKey, searchableText);
    }

    return index;
  }, [scopedRecordBySchoolKey, scopedRequirementRows, shouldBuildRequirementSearchIndex]);

  const filteredRequirementRows = useMemo(() => {
    const fromTime = parseDateBoundary(filterDateFrom, "start");
    const toTime = parseDateBoundary(filterDateTo, "end");
    const hasSearchTerms = searchTerms.length > 0;
    const results: SchoolRequirementSummary[] = [];

    for (const row of scopedRequirementRows) {
      if (selectedStudentLookupSchoolKey && row.schoolKey !== selectedStudentLookupSchoolKey) {
        continue;
      }

      if (selectedTeacherSchoolKeys && !selectedTeacherSchoolKeys.has(row.schoolKey)) {
        continue;
      }

      if (statusFilter !== "all" && row.schoolStatus !== statusFilter) {
        continue;
      }

      if (!matchesRequirementFilter(row, requirementFilter)) {
        continue;
      }

      if (fromTime !== null && (row.lastActivityTime <= 0 || row.lastActivityTime < fromTime)) {
        continue;
      }

      if (toTime !== null && (row.lastActivityTime <= 0 || row.lastActivityTime > toTime)) {
        continue;
      }

      if (hasSearchTerms) {
        const searchableText = requirementSearchTextByKey?.get(row.schoolKey) ?? "";
        if (!matchesAllSearchTerms(searchableText, searchTerms)) {
          continue;
        }
      }

      results.push(row);
    }

    return results;
  }, [
    filterDateFrom,
    filterDateTo,
    requirementFilter,
    requirementSearchTextByKey,
    scopedRequirementRows,
    searchTerms,
    selectedStudentLookupSchoolKey,
    selectedTeacherSchoolKeys,
    statusFilter,
  ]);

  const hasDashboardFilters =
    searchTerms.length > 0 ||
    statusFilter !== "all" ||
    requirementFilter !== "all" ||
    schoolQuickPreset !== "all" ||
    hasSelectedSchoolScope ||
    filterDateFrom.length > 0 ||
    filterDateTo.length > 0 ||
    hasSelectedStudentLookup ||
    hasSelectedTeacherLookup;

  const filteredSchoolKeys = useMemo(() => {
    if (!hasDashboardFilters && !scopedSchoolKeys) {
      return null;
    }

    const scopeRows =
      schoolQuickPreset === "all"
        ? filteredRequirementRows
        : filteredRequirementRows.filter((row) => matchesSchoolQuickPreset(row, schoolQuickPreset));

    return new Set(scopeRows.map((row) => row.schoolKey));
  }, [filteredRequirementRows, hasDashboardFilters, schoolQuickPreset, scopedSchoolKeys]);

  const requirementCounts = useMemo(() => {
    const counts = {
      total: scopedRequirementRows.length,
      submittedAny: 0,
      complete: 0,
      awaitingReview: 0,
      missing: 0,
      returned: 0,
    };

    for (const row of scopedRequirementRows) {
      if (row.hasAnySubmitted) counts.submittedAny += 1;
      if (row.isComplete) counts.complete += 1;
      if (row.awaitingReviewCount > 0) counts.awaitingReview += 1;
      if (row.missingCount > 0) counts.missing += 1;
      if (row.indicatorStatus === "returned") counts.returned += 1;
    }

    return counts;
  }, [scopedRequirementRows]);

  const needsActionCount = useMemo(
    () =>
      scopedRequirementRows.filter(
        (row) => row.missingCount > 0 || row.awaitingReviewCount > 0 || row.indicatorStatus === "returned",
      ).length,
    [scopedRequirementRows],
  );

  const actionQueueRows = useMemo(
    () =>
      filteredRequirementRows
        .filter((row) => row.missingCount > 0 || row.awaitingReviewCount > 0 || row.indicatorStatus === "returned")
        .sort((a, b) => {
          const priorityDiff = queuePriorityScore(a) - queuePriorityScore(b);
          if (priorityDiff !== 0) return priorityDiff;

          const missingDiff = b.missingCount - a.missingCount;
          if (missingDiff !== 0) return missingDiff;

          const waitingDiff = b.awaitingReviewCount - a.awaitingReviewCount;
          if (waitingDiff !== 0) return waitingDiff;

          const activityDiff = b.lastActivityTime - a.lastActivityTime;
          if (activityDiff !== 0) return activityDiff;

          return a.schoolName.localeCompare(b.schoolName);
        }),
    [filteredRequirementRows],
  );

  const queueLaneCounts = useMemo(() => {
    const counts: Record<QueueLane, number> = {
      all: actionQueueRows.length,
      urgent: 0,
      returned: 0,
      for_review: 0,
      waiting_data: 0,
    };

    for (const row of actionQueueRows) {
      if (matchesQueueLane(row, "urgent")) counts.urgent += 1;
      if (matchesQueueLane(row, "returned")) counts.returned += 1;
      if (matchesQueueLane(row, "for_review")) counts.for_review += 1;
      if (matchesQueueLane(row, "waiting_data")) counts.waiting_data += 1;
    }

    return counts;
  }, [actionQueueRows]);

  const laneFilteredQueueRows = useMemo(
    () => actionQueueRows.filter((row) => matchesQueueLane(row, queueLane)),
    [actionQueueRows, queueLane],
  );

  const schoolPresetCounts = useMemo<Record<SchoolQuickPreset, number>>(() => {
    const counts: Record<SchoolQuickPreset, number> = {
      all: filteredRequirementRows.length,
      pending: 0,
      missing: 0,
      returned: 0,
      no_submission: 0,
      high_risk: 0,
    };

    for (const row of filteredRequirementRows) {
      if (matchesSchoolQuickPreset(row, "pending")) counts.pending += 1;
      if (matchesSchoolQuickPreset(row, "missing")) counts.missing += 1;
      if (matchesSchoolQuickPreset(row, "returned")) counts.returned += 1;
      if (matchesSchoolQuickPreset(row, "no_submission")) counts.no_submission += 1;
      if (matchesSchoolQuickPreset(row, "high_risk")) counts.high_risk += 1;
    }

    return counts;
  }, [filteredRequirementRows]);

  const filteredSchoolsByPreset = useMemo(
    () => filteredRequirementRows.filter((row) => matchesSchoolQuickPreset(row, schoolQuickPreset)),
    [filteredRequirementRows, schoolQuickPreset],
  );

  const stickySummaryStats = useMemo(
    () => ({
      totalSchools: schoolPresetCounts.all,
      pending: schoolPresetCounts.pending,
      missing: schoolPresetCounts.missing,
      returned: schoolPresetCounts.returned,
      atRisk: schoolPresetCounts.high_risk,
    }),
    [
      schoolPresetCounts.all,
      schoolPresetCounts.high_risk,
      schoolPresetCounts.missing,
      schoolPresetCounts.pending,
      schoolPresetCounts.returned,
    ],
  );

  const queueWorkspaceSchoolFilterKeys = useMemo(() => {
    if (selectedSchoolScopeKey !== allSchoolScopeKey) {
      return new Set([selectedSchoolScopeKey]);
    }

    return filteredSchoolKeys;
  }, [allSchoolScopeKey, filteredSchoolKeys, selectedSchoolScopeKey]);

  const compactSchoolRows = useMemo(
    () =>
      filteredSchoolsByPreset
        .map((summary) => {
          const record = scopedRecordBySchoolKey.get(summary.schoolKey) ?? recordBySchoolKey.get(summary.schoolKey) ?? null;
          return { summary, record };
        })
        .sort((a, b) => {
          const priorityDiff = queuePriorityScore(a.summary) - queuePriorityScore(b.summary);
          if (priorityDiff !== 0) return priorityDiff;

          const missingDiff = b.summary.missingCount - a.summary.missingCount;
          if (missingDiff !== 0) return missingDiff;

          const waitingDiff = b.summary.awaitingReviewCount - a.summary.awaitingReviewCount;
          if (waitingDiff !== 0) return waitingDiff;

          const activityDiff = b.summary.lastActivityTime - a.summary.lastActivityTime;
          if (activityDiff !== 0) return activityDiff;

          return a.summary.schoolName.localeCompare(b.summary.schoolName);
        }),
    [filteredSchoolsByPreset, recordBySchoolKey, scopedRecordBySchoolKey],
  );

  const totalRequirementPages = Math.max(1, Math.ceil(laneFilteredQueueRows.length / requirementPageSize));
  const safeRequirementsPage = Math.min(requirementsPage, totalRequirementPages);

  const paginatedRequirementRows = useMemo(() => {
    const start = (safeRequirementsPage - 1) * requirementPageSize;
    return laneFilteredQueueRows.slice(start, start + requirementPageSize);
  }, [laneFilteredQueueRows, requirementPageSize, safeRequirementsPage]);

  const totalRecordPages = Math.max(1, Math.ceil(compactSchoolRows.length / recordPageSize));
  const safeRecordsPage = Math.min(recordsPage, totalRecordPages);

  const paginatedCompactSchoolRows = useMemo(() => {
    const start = (safeRecordsPage - 1) * recordPageSize;
    return compactSchoolRows.slice(start, start + recordPageSize);
  }, [compactSchoolRows, recordPageSize, safeRecordsPage]);

  return {
    schoolRequirementRows,
    scopedRequirementRows,
    schoolRequirementByKey,
    recordBySchoolKey,
    scopedRecordBySchoolKey,
    workflowStatusCounts,
    schoolStatusCounts,
    visibleRequirementFilterIds,
    visibleRequirementFilterOptions,
    filteredRequirementRows,
    filteredSchoolKeys,
    requirementCounts,
    needsActionCount,
    actionQueueRows,
    queueLaneCounts,
    laneFilteredQueueRows,
    schoolPresetCounts,
    filteredSchoolsByPreset,
    stickySummaryStats,
    queueWorkspaceSchoolFilterKeys,
    compactSchoolRows,
    totalRequirementPages,
    safeRequirementsPage,
    paginatedRequirementRows,
    totalRecordPages,
    safeRecordsPage,
    paginatedCompactSchoolRows,
  };
}
