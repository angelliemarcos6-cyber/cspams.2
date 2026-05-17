import { useMemo } from "react";
import { SUBMISSION_FILE_DEFINITION_BY_TYPE } from "@/constants/submissionFiles";
import type { MonitorSchoolRequirementSummary } from "@/pages/monitor/MonitorSchoolRecordsList";
import type {
  IndicatorMatrixRow,
  MonitorDrawerHistorySummary,
  MonitorDrawerKpiReportRow,
  MonitorDrawerSchoolAchievementReportRow,
  MonitorDrawerSnapshotSummary,
  MonitorDrawerYearDetail,
  MonitorDrawerChecklistItem,
  MonitorDrawerYearOption,
  SchoolDetailSnapshot,
  SchoolDrawerCriticalAlert,
  SchoolIndicatorMatrix,
  SchoolIndicatorPackageRow,
  SchoolIndicatorRowGroup,
} from "@/pages/monitor/monitorDrawerTypes";
import {
  KEY_PERFORMANCE_CATEGORY_LABEL,
  resolveSubmissionItemDisplayValue,
  SCHOOL_ACHIEVEMENTS_CATEGORY_LABEL,
  deriveSchoolYearLabel,
  indicatorCategoryLabel,
  indicatorDisplayLabel,
  schoolTypeLabel,
  sortSchoolYears,
  typedYearValues,
} from "@/pages/monitor/monitorDrawerViewModelUtils";
import {
  getSubmissionUploadedFileTypes,
  resolveSubmissionRequirementProfile,
} from "@/utils/submissionRequirements";
import {
  buildSubmittedReportBlankStateLines,
  buildSubmittedReportSourceContext,
  resolveIndicatorValue,
  resolveSelectedYearReportSubmission,
  resolveSubmittedReportIndicatorByMetricCode,
  submissionRows,
} from "@/pages/schoolAdminSubmittedReportView";
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
  schoolDrawerSnapshotSummary: MonitorDrawerSnapshotSummary | null;
  schoolDrawerYearDetail: MonitorDrawerYearDetail | null;
  schoolDrawerHistorySummary: MonitorDrawerHistorySummary | null;
  schoolDrawerCriticalAlerts: SchoolDrawerCriticalAlert[];
}

function toSubmissionActivityTime(submission: IndicatorSubmission | null | undefined): number {
  return new Date(
    submission?.submittedAt
    ?? submission?.updatedAt
    ?? submission?.createdAt
    ?? 0,
  ).getTime();
}

function isMonitorRelevantPackageStatus(status: string | null | undefined): boolean {
  const normalizedStatus = String(status ?? "").trim().toLowerCase();
  return normalizedStatus === "submitted" || normalizedStatus === "validated" || normalizedStatus === "returned";
}

function compareMonitorPackagePriority(left: IndicatorSubmission, right: IndicatorSubmission): number {
  const recencyDelta = toSubmissionActivityTime(right) - toSubmissionActivityTime(left);
  if (recencyDelta !== 0) {
    return recencyDelta;
  }

  const versionDelta = Number(right.version ?? 0) - Number(left.version ?? 0);
  if (versionDelta !== 0) {
    return versionDelta;
  }

  return String(right.id ?? "").localeCompare(String(left.id ?? ""));
}

function hasRenderableIndicatorRows(submission: IndicatorSubmission | null | undefined): boolean {
  return Array.isArray(submission?.indicators) && submission!.indicators.length > 0;
}

function resolveMonitorSubmissionSchoolYearLabel(submission: IndicatorSubmission | null | undefined): string {
  return (submission?.academicYear?.name ?? "").trim()
    || deriveSchoolYearLabel(submission?.submittedAt ?? submission?.updatedAt ?? submission?.createdAt);
}

function normalizeWorkflowStatus(status: string | null | undefined): string | null {
  const normalizedStatus = String(status ?? "").trim().toLowerCase();
  return normalizedStatus || null;
}

function hasDisplayValue(value: string): boolean {
  return value.trim().length > 0 && value.trim() !== "-";
}

function resolveChecklistTone(statusLabel: MonitorDrawerChecklistItem["statusLabel"]): MonitorDrawerChecklistItem["tone"] {
  if (statusLabel === "Missing" || statusLabel === "Returned") {
    return "warning";
  }
  if (statusLabel === "For Review") {
    return "info";
  }
  return "success";
}

export function buildMonitorDrawerSnapshotSummary(
  yearDetail: MonitorDrawerYearDetail | null,
): MonitorDrawerSnapshotSummary | null {
  if (!yearDetail) {
    return null;
  }

  return {
    currentIssueLabel: yearDetail.currentIssueLabel,
    currentIssueTone: yearDetail.currentIssueTone,
    selectedYearLabel: yearDetail.selectedYearLabel,
    checklistCompleteCount: yearDetail.checklistCompleteCount,
    checklistMissingCount: yearDetail.checklistMissingCount,
  };
}

export function buildMonitorDrawerYearDetail(
  schoolDetail: SchoolDetailSnapshot | null,
  selectedSchoolDrawerYear: string | null,
  schoolDrawerSubmissions: IndicatorSubmission[],
  schoolIndicatorRows: IndicatorMatrixRow[],
): MonitorDrawerYearDetail | null {
  if (!schoolDetail) {
    return null;
  }

  const availableYears = sortSchoolYears(
    schoolDrawerSubmissions.map((submission) => resolveMonitorSubmissionSchoolYearLabel(submission)),
  ).reverse();
  const effectiveSelectedYear = selectedSchoolDrawerYear && availableYears.includes(selectedSchoolDrawerYear)
    ? selectedSchoolDrawerYear
    : availableYears[0] ?? null;
  const selectedYearSubmissions = effectiveSelectedYear
    ? schoolDrawerSubmissions.filter((submission) => resolveMonitorSubmissionSchoolYearLabel(submission) === effectiveSelectedYear)
    : [];
  const sortedSelectedYearSubmissions = selectedYearSubmissions.slice().sort(compareMonitorPackagePriority);
  const latestYearSubmission = sortedSelectedYearSubmissions[0] ?? null;
  const selectedYearFinalizedSubmission = resolveSelectedYearReportSubmission(sortedSelectedYearSubmissions);
  const selectedYearWorkflowStatus = normalizeWorkflowStatus(
    sortedSelectedYearSubmissions.find((submission) => isMonitorRelevantPackageStatus(submission.status))?.status
    ?? latestYearSubmission?.status,
  );
  const currentYearRows = schoolIndicatorRows.filter((row) => Object.prototype.hasOwnProperty.call(row.valuesByYear, effectiveSelectedYear ?? ""));
  const reportRows = currentYearRows.length > 0 ? currentYearRows : schoolIndicatorRows;

  const finalizedSubmissionRows = submissionRows(selectedYearFinalizedSubmission);
  const latestYearIndicatorRows = submissionRows(latestYearSubmission);
  const indicatorsByCode = new Map(
    selectedYearFinalizedSubmission
      ? finalizedSubmissionRows
        .map((indicator) => [String(indicator.metric?.code ?? "").trim(), indicator] as const)
        .filter(([metricCode]) => metricCode.length > 0)
      : [],
  );

  const schoolAchievementRows = reportRows
    .filter((row) => row.category === SCHOOL_ACHIEVEMENTS_CATEGORY_LABEL)
    .map<MonitorDrawerSchoolAchievementReportRow>((row) => ({
      key: row.key,
      label: row.label,
      value: indicatorsByCode.has(row.code)
        ? resolveIndicatorValue(resolveSubmittedReportIndicatorByMetricCode(finalizedSubmissionRows, row.code), "actual")
        : "-",
    }));

  const kpiRows = reportRows
    .filter((row) => row.category === KEY_PERFORMANCE_CATEGORY_LABEL)
    .map<MonitorDrawerKpiReportRow>((row) => {
      const indicator = resolveSubmittedReportIndicatorByMetricCode(finalizedSubmissionRows, row.code);
      return {
        key: row.key,
        label: row.label,
        target: indicator ? resolveIndicatorValue(indicator, "target") : "-",
        actual: indicator ? resolveIndicatorValue(indicator, "actual") : "-",
        status: String(indicator?.complianceStatus ?? "-").trim() || "-",
      };
    });

  const sectionDefinitions = [
    { id: "school_achievements", label: "School Achievements", category: SCHOOL_ACHIEVEMENTS_CATEGORY_LABEL },
    { id: "key_performance", label: "Key Performance", category: KEY_PERFORMANCE_CATEGORY_LABEL },
  ] as const;
  const latestYearIndicators = latestYearIndicatorRows;
  const checklistItems: MonitorDrawerChecklistItem[] = [];

  for (const section of sectionDefinitions) {
    const categoryRows = currentYearRows.filter((row) => row.category === section.category);
    const indicators = latestYearIndicators.filter((indicator) => indicatorCategoryLabel(indicator.metric?.code ?? null) === section.category);
    const isSchoolAchievements = section.category === SCHOOL_ACHIEVEMENTS_CATEGORY_LABEL;
    const isComplete = categoryRows.length > 0 && categoryRows.every((row) => {
      const indicator = resolveSubmittedReportIndicatorByMetricCode(indicators, row.code);
      if (!indicator) {
        return false;
      }

      if (isSchoolAchievements) {
        return hasDisplayValue(resolveIndicatorValue(indicator, "actual"));
      }

      return hasDisplayValue(resolveIndicatorValue(indicator, "target")) && hasDisplayValue(resolveIndicatorValue(indicator, "actual"));
    });

    let statusLabel: MonitorDrawerChecklistItem["statusLabel"] = isComplete ? "Complete" : "Missing";
    if (isComplete && selectedYearWorkflowStatus === "returned") {
      statusLabel = "Returned";
    } else if (isComplete && selectedYearWorkflowStatus === "submitted") {
      statusLabel = "For Review";
    }

    checklistItems.push({
      id: section.id,
      label: section.label,
      statusLabel,
      tone: resolveChecklistTone(statusLabel),
      detail: isComplete
        ? section.category === SCHOOL_ACHIEVEMENTS_CATEGORY_LABEL
          ? "Section values are available for this year."
          : "Targets and actual values are available for this year."
        : "Section data is still incomplete for this year.",
      kind: "section",
    });
  }

  const requirementProfile = resolveSubmissionRequirementProfile(schoolDetail.schoolTypeRaw);
  const uploadedFileTypes = new Set(getSubmissionUploadedFileTypes(latestYearSubmission));
  for (const type of requirementProfile.requiredFileTypes) {
    const definition = SUBMISSION_FILE_DEFINITION_BY_TYPE[type];
    let statusLabel: MonitorDrawerChecklistItem["statusLabel"] = uploadedFileTypes.has(type) ? "Uploaded" : "Missing";
    if (uploadedFileTypes.has(type) && selectedYearWorkflowStatus === "returned") {
      statusLabel = "Returned";
    } else if (uploadedFileTypes.has(type) && selectedYearWorkflowStatus === "submitted") {
      statusLabel = "For Review";
    }

    checklistItems.push({
      id: type,
      label: definition.shortLabel,
      statusLabel,
      tone: resolveChecklistTone(statusLabel),
      detail: uploadedFileTypes.has(type) ? "File is present for the selected year." : "File is still missing for the selected year.",
      kind: "file",
    });
  }

  const checklistCompleteCount = checklistItems.filter((item) => item.statusLabel === "Complete" || item.statusLabel === "Uploaded").length;
  const checklistMissingCount = checklistItems.length - checklistCompleteCount;

  let currentIssueLabel = "No submission activity yet for this year.";
  let currentIssueTone: MonitorDrawerYearDetail["currentIssueTone"] = "info";
  if (selectedYearWorkflowStatus === "returned") {
    currentIssueLabel = "Returned items need correction.";
    currentIssueTone = "warning";
  } else if (selectedYearWorkflowStatus === "submitted") {
    currentIssueLabel = "Awaiting monitor review.";
    currentIssueTone = "info";
  } else if (selectedYearWorkflowStatus === "validated") {
    currentIssueLabel = "Submission validated.";
    currentIssueTone = "success";
  } else if (checklistMissingCount > 0) {
    currentIssueLabel = `${checklistMissingCount} checklist item${checklistMissingCount === 1 ? "" : "s"} still missing.`;
    currentIssueTone = "warning";
  } else if (latestYearSubmission) {
    currentIssueLabel = "Current year submission progress is available.";
    currentIssueTone = "success";
  }

  const reportSourceContext = buildSubmittedReportSourceContext(
    selectedYearFinalizedSubmission,
    effectiveSelectedYear ?? "N/A",
  );

  return {
    selectedYearLabel: effectiveSelectedYear,
    availableYears: availableYears.map<MonitorDrawerYearOption>((year) => ({ id: year, label: year })),
    currentIssueLabel,
    currentIssueTone,
    checklistItems,
    checklistCompleteCount,
    checklistMissingCount,
    selectedYearLatestSubmissionId: latestYearSubmission?.id ?? null,
    selectedYearLatestStatus: latestYearSubmission?.status ?? null,
    finalizedReportSubmission: selectedYearFinalizedSubmission,
    reportSourceContext,
    reportBlankStateLines: buildSubmittedReportBlankStateLines(),
    schoolAchievementRows,
    kpiRows,
  };
}

export function buildMonitorDrawerHistorySummary(
  schoolDrawerSubmissions: IndicatorSubmission[],
): MonitorDrawerHistorySummary | null {
  const sortedSubmissions = schoolDrawerSubmissions.slice().sort(compareMonitorPackagePriority);
  const latestHistorySubmission = sortedSubmissions[0] ?? null;
  const latestRenderableSubmission = sortedSubmissions.find((submission) => hasRenderableIndicatorRows(submission)) ?? null;
  const schoolYears = new Set<string>();

  for (const submission of sortedSubmissions) {
    const schoolYear =
      (submission.academicYear?.name ?? "").trim() ||
      deriveSchoolYearLabel(submission.submittedAt ?? submission.updatedAt ?? submission.createdAt);
    if (schoolYear) {
      schoolYears.add(schoolYear);
    }
  }

  const packagesWithRenderableRowsCount = sortedSubmissions.filter((submission) => hasRenderableIndicatorRows(submission)).length;
  const packagesWithoutRenderableRowsCount = Math.max(0, sortedSubmissions.length - packagesWithRenderableRowsCount);

  if (sortedSubmissions.length === 0) {
    return {
      historyPackageCount: 0,
      historySchoolYearCount: 0,
      latestHistoryPackageId: null,
      latestHistorySchoolYear: null,
      latestRenderableSubmissionId: null,
      latestRenderableSchoolYear: null,
      packagesWithRenderableRowsCount: 0,
      packagesWithoutRenderableRowsCount: 0,
      historyAvailabilityLabel: "No package history yet",
      historyExplanation: "No package history exists yet for this school.",
      historyFallbackReason: "No package history exists yet for this school.",
    };
  }

  const latestHistorySchoolYear =
    (latestHistorySubmission?.academicYear?.name ?? "").trim() ||
    deriveSchoolYearLabel(
      latestHistorySubmission?.submittedAt ?? latestHistorySubmission?.updatedAt ?? latestHistorySubmission?.createdAt,
    );
  const latestRenderableSchoolYear = latestRenderableSubmission
    ? (latestRenderableSubmission.academicYear?.name ?? "").trim() ||
      deriveSchoolYearLabel(
        latestRenderableSubmission.submittedAt ?? latestRenderableSubmission.updatedAt ?? latestRenderableSubmission.createdAt,
      )
    : null;

  let historyAvailabilityLabel = "Historical indicator detail available";
  let historyExplanation = "Showing the most recent package with renderable indicator rows, plus older year values where available.";
  let historyFallbackReason: string | null = null;

  if (!latestRenderableSubmission) {
    historyAvailabilityLabel = "Packages exist without indicator detail";
    historyExplanation = "Packages exist for this school, but none contain renderable indicator rows for history view.";
    historyFallbackReason = "Packages exist, but none contain indicator rows for history rendering.";
  } else if (latestHistorySubmission && latestRenderableSubmission.id !== latestHistorySubmission.id) {
    historyAvailabilityLabel = "Latest package differs from history source";
    historyExplanation = `Latest package #${latestHistorySubmission.id} has no renderable indicator rows. Showing package #${latestRenderableSubmission.id} as the most recent history source with indicator detail.`;
    historyFallbackReason = "Latest package has no indicator rows. Showing the most recent package with historical indicator detail.";
  }

  return {
    historyPackageCount: sortedSubmissions.length,
    historySchoolYearCount: schoolYears.size,
    latestHistoryPackageId: latestHistorySubmission?.id ?? null,
    latestHistorySchoolYear: latestHistorySchoolYear || null,
    latestRenderableSubmissionId: latestRenderableSubmission?.id ?? null,
    latestRenderableSchoolYear: latestRenderableSchoolYear || null,
    packagesWithRenderableRowsCount,
    packagesWithoutRenderableRowsCount,
    historyAvailabilityLabel,
    historyExplanation,
    historyFallbackReason,
  };
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
    if (schoolDrawerSubmissions.length === 0) {
      return {
        years: [],
        rows: [],
        latestSubmission: null,
      };
    }

    const years = new Set<string>();
    const rowMap = new Map<string, IndicatorMatrixRow>();

    for (const submission of schoolDrawerSubmissions) {
      const fallbackYear =
        (submission.academicYear?.name ?? "").trim() ||
        deriveSchoolYearLabel(submission.submittedAt ?? submission.updatedAt ?? submission.createdAt);
      years.add(fallbackYear);

      for (const entry of submission.indicators) {
        const schemaYears = Array.isArray(entry.metric?.inputSchema?.years)
          ? entry.metric.inputSchema?.years ?? []
          : [];
        for (const schemaYear of schemaYears) {
          const normalizedYear = String(schemaYear).trim();
          if (normalizedYear.length > 0) {
            years.add(normalizedYear);
          }
        }

        const metricCode = entry.metric?.code?.trim() || "";
        const metricName = entry.metric?.name?.trim() || metricCode || "Unknown Indicator";
        const metricLabel = indicatorDisplayLabel(metricCode || null, metricName);
        const rowKey = metricCode || entry.metric?.id?.trim() || entry.id;
        const rowSortOrder =
          typeof entry.metric?.sortOrder === "number" && Number.isFinite(entry.metric.sortOrder)
            ? entry.metric.sortOrder
            : Number.MAX_SAFE_INTEGER;

        let row = rowMap.get(rowKey);
        if (!row) {
          row = {
            key: rowKey,
            code: metricCode || "N/A",
            label: metricLabel,
            category: indicatorCategoryLabel(metricCode || null),
            sortOrder: rowSortOrder,
            valuesByYear: {},
          };
          rowMap.set(rowKey, row);
        } else if (row.sortOrder === Number.MAX_SAFE_INTEGER && rowSortOrder !== Number.MAX_SAFE_INTEGER) {
          row.sortOrder = rowSortOrder;
        }

        const targetYears = typedYearValues(entry.targetTypedValue ?? null);
        const actualYears = typedYearValues(entry.actualTypedValue ?? null);
        const entryYears = new Set<string>([
          ...Object.keys(targetYears),
          ...Object.keys(actualYears),
        ]);

        if (entryYears.size === 0) {
          entryYears.add(fallbackYear);
        }

        const hasSingleFallbackYear = entryYears.size === 1 && entryYears.has(fallbackYear);

        for (const year of entryYears) {
          const normalizedYear = year.trim();
          if (normalizedYear.length === 0) continue;

          years.add(normalizedYear);

          if (!row.valuesByYear[normalizedYear]) {
            row.valuesByYear[normalizedYear] = { target: "", actual: "" };
          }

          if (row.valuesByYear[normalizedYear].target.length === 0) {
            const targetValue =
              targetYears[normalizedYear] ||
              (hasSingleFallbackYear
                ? resolveSubmissionItemDisplayValue(entry, "target").replace(/^-$/, "")
                : "");
            if (targetValue.length > 0) {
              row.valuesByYear[normalizedYear].target = targetValue;
            }
          }

          if (row.valuesByYear[normalizedYear].actual.length === 0) {
            const actualValue =
              actualYears[normalizedYear] ||
              (hasSingleFallbackYear
                ? resolveSubmissionItemDisplayValue(entry, "actual").replace(/^-$/, "")
                : "");
            if (actualValue.length > 0) {
              row.valuesByYear[normalizedYear].actual = actualValue;
            }
          }
        }
      }
    }

    const sortedYears = sortSchoolYears(years);
    const categoryRank = (category: string) => (category === SCHOOL_ACHIEVEMENTS_CATEGORY_LABEL ? 0 : 1);

    const sortedRows = [...rowMap.values()].sort((a, b) => {
      const byCategory = categoryRank(a.category) - categoryRank(b.category);
      if (byCategory !== 0) return byCategory;

      const bySortOrder = a.sortOrder - b.sortOrder;
      if (Number.isFinite(bySortOrder) && bySortOrder !== 0) {
        return bySortOrder;
      }

      return a.label.localeCompare(b.label);
    });

    return {
      years: sortedYears,
      rows: sortedRows,
      latestSubmission: schoolDrawerSubmissions[0] ?? null,
    };
  }, [
    schoolDrawerSubmissions,
  ]);

  const schoolIndicatorRowsByCategory = useMemo(
    () =>
      schoolIndicatorMatrix.rows.reduce<SchoolIndicatorRowGroup[]>((groups, row) => {
        const existing = groups.find((group) => group.category === row.category);
        if (existing) {
          existing.rows.push(row);
          return groups;
        }

        groups.push({ category: row.category, rows: [row] });
        return groups;
      }, []),
    [schoolIndicatorMatrix.rows],
  );

  const schoolIndicatorPackageRows = useMemo<SchoolIndicatorPackageRow[]>(
    () =>
      schoolDrawerSubmissions.map((submission) => ({
        id: submission.id,
      schoolYear:
          (submission.academicYear?.name ?? "").trim() ||
          deriveSchoolYearLabel(submission.submittedAt ?? submission.updatedAt ?? submission.createdAt),
        reportingPeriod: submission.reportingPeriod ?? "N/A",
        status: submission.status ?? null,
        submittedAt: submission.submittedAt ?? submission.updatedAt ?? submission.createdAt,
        reviewedAt: submission.reviewedAt ?? null,
        updatedAt: submission.updatedAt ?? null,
        complianceRatePercent:
          typeof submission.summary?.complianceRatePercent === "number" && Number.isFinite(submission.summary.complianceRatePercent)
            ? submission.summary.complianceRatePercent
            : null,
        reviewedBy: submission.reviewedBy?.name?.trim() || "Unassigned",
      })),
    [schoolDrawerSubmissions],
  );

  const latestSchoolPackage = useMemo(
    () => schoolIndicatorPackageRows[0] ?? null,
    [schoolIndicatorPackageRows],
  );

  const latestSchoolIndicatorYear = useMemo(
    () => schoolIndicatorMatrix.years[schoolIndicatorMatrix.years.length - 1] ?? "",
    [schoolIndicatorMatrix.years],
  );

  const effectiveSelectedSchoolDrawerYear = useMemo(() => {
    const availableYears = sortSchoolYears(
      schoolDrawerSubmissions.map((submission) => resolveMonitorSubmissionSchoolYearLabel(submission)),
    ).reverse();
    if (selectedSchoolDrawerYear && availableYears.includes(selectedSchoolDrawerYear)) {
      return selectedSchoolDrawerYear;
    }
    return availableYears[0] ?? "";
  }, [schoolDrawerSubmissions, selectedSchoolDrawerYear]);

  const schoolIndicatorRowKeySet = useMemo(
    () => new Set(schoolIndicatorMatrix.rows.map((row) => row.key)),
    [schoolIndicatorMatrix.rows],
  );

  const missingDrawerIndicatorKeys = useMemo(() => {
    if (!effectiveSelectedSchoolDrawerYear) return [] as string[];

    return schoolIndicatorMatrix.rows
      .filter((row) => {
        const values = row.valuesByYear[effectiveSelectedSchoolDrawerYear] ?? { target: "", actual: "" };
        return values.target.trim().length === 0 || values.actual.trim().length === 0;
      })
      .map((row) => row.key);
  }, [effectiveSelectedSchoolDrawerYear, schoolIndicatorMatrix.rows]);

  const returnedDrawerIndicatorKeys = useMemo(() => {
    const latestSubmission = schoolDrawerSubmissions
      .filter((submission) => resolveMonitorSubmissionSchoolYearLabel(submission) === effectiveSelectedSchoolDrawerYear)
      .slice()
      .sort(compareMonitorPackagePriority)[0] ?? null;
    if (!latestSubmission) return [] as string[];

    const mappedKeys = latestSubmission.indicators
      .filter((entry) => String(entry.complianceStatus ?? "").toLowerCase().includes("returned"))
      .map((entry) => entry.metric?.code?.trim() || entry.metric?.id?.trim() || entry.id)
      .filter((value): value is string => Boolean(value && value.trim().length > 0));

    return [...new Set(mappedKeys)].filter((key) => schoolIndicatorRowKeySet.has(key));
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
    if (!schoolDrawerKey) return null;

    const summary = schoolRequirementByKey.get(schoolDrawerKey);
    const record = recordBySchoolKey.get(schoolDrawerKey);
    const studentStats = studentStatsBySchoolKey.get(schoolDrawerKey);
    const accurateCounts = accurateSyncedCountsBySchoolKey[schoolDrawerKey];
    const requirementProfile = resolveSubmissionRequirementProfile(record?.type);

    if (!summary && !record) return null;

    return {
      schoolKey: schoolDrawerKey,
      schoolCode: summary?.schoolCode ?? (record?.schoolId ?? record?.schoolCode ?? "N/A"),
      schoolName: summary?.schoolName ?? record?.schoolName ?? "Unknown School",
      region: summary?.region ?? record?.region ?? "N/A",
      level: record?.level ?? "N/A",
      type: schoolTypeLabel(record?.type),
      schoolTypeRaw: record?.type ?? null,
      requirementModeLabel:
        summary?.requirementModeLabel
        ?? (requirementProfile.schoolType === "private"
          ? "Active package requirements: FM-QAD uploads only."
          : "Active package requirements: BMEF and SMEA."),
      activePackageLabel:
        summary?.activePackageLabel
        ?? (requirementProfile.schoolType === "private" ? "FM-QAD uploads only" : "BMEF and SMEA"),
      address: record?.address ?? record?.district ?? "N/A",
      hasComplianceRecord: summary?.hasComplianceRecord ?? false,
      indicatorStatus: summary?.indicatorStatus ?? null,
      hasActivePackageSubmission: summary?.hasActivePackageSubmission ?? false,
      missingCount: summary?.missingCount ?? 0,
      awaitingReviewCount: summary?.awaitingReviewCount ?? 0,
      lastActivityAt: summary?.lastActivityAt ?? record?.lastUpdated ?? null,
      reportedStudents: record?.studentCount ?? 0,
      reportedTeachers: record?.teacherCount ?? 0,
      synchronizedStudents: accurateCounts?.students ?? studentStats?.students ?? 0,
      synchronizedTeachers: accurateCounts?.teachers ?? studentStats?.teachers.size ?? 0,
    };
  }, [
    accurateSyncedCountsBySchoolKey,
    recordBySchoolKey,
    schoolDrawerKey,
    schoolRequirementByKey,
    schoolTypeLabel,
    studentStatsBySchoolKey,
  ]);

  const schoolDrawerYearDetail = useMemo(
    () => buildMonitorDrawerYearDetail(schoolDetail, effectiveSelectedSchoolDrawerYear, schoolDrawerSubmissions, schoolIndicatorMatrix.rows),
    [effectiveSelectedSchoolDrawerYear, schoolDetail, schoolDrawerSubmissions, schoolIndicatorMatrix.rows],
  );

  const schoolDrawerSnapshotSummary = useMemo(
    () => buildMonitorDrawerSnapshotSummary(schoolDrawerYearDetail),
    [schoolDrawerYearDetail],
  );

  const schoolDrawerHistorySummary = useMemo(
    () => buildMonitorDrawerHistorySummary(schoolDrawerSubmissions),
    [schoolDrawerSubmissions],
  );

  const schoolDrawerCriticalAlerts = useMemo<SchoolDrawerCriticalAlert[]>(() => {
    if (!schoolDetail) return [];

    const alerts: SchoolDrawerCriticalAlert[] = [];

    if (!schoolDetail.hasComplianceRecord) {
      alerts.push({
        id: "missing-compliance-record",
        tone: "warning",
        title: "No Compliance Record",
        detail: "School has not submitted a compliance record yet.",
      });
    }

    if (schoolDetail.indicatorStatus === "returned") {
      alerts.push({
        id: "returned-package",
        tone: "warning",
        title: "Package Returned",
        detail: "Latest indicator package was returned for correction.",
      });
    }

    if (schoolDetail.missingCount > 0) {
      alerts.push({
        id: "missing-required-indicators",
        tone: "warning",
        title: "Missing Indicators",
        detail: `${schoolDetail.missingCount} required indicator cells are still missing.`,
      });
    }

    if (schoolDetail.awaitingReviewCount > 0) {
      alerts.push({
        id: "pending-review",
        tone: "info",
        title: "Pending Review",
        detail: `${schoolDetail.awaitingReviewCount} submissions are waiting for monitor review.`,
      });
    }

    if (schoolDetail.reportedStudents !== schoolDetail.synchronizedStudents) {
      alerts.push({
        id: "student-count-mismatch",
        tone: "warning",
        title: "Student Count Mismatch",
        detail: `Reported ${schoolDetail.reportedStudents}, synced ${schoolDetail.synchronizedStudents}.`,
      });
    }

    if (schoolDetail.reportedTeachers !== schoolDetail.synchronizedTeachers) {
      alerts.push({
        id: "teacher-count-mismatch",
        tone: "warning",
        title: "Teacher Count Mismatch",
        detail: `Reported ${schoolDetail.reportedTeachers}, synced ${schoolDetail.synchronizedTeachers}.`,
      });
    }

    if (schoolDrawerSubmissionsError) {
      alerts.push({
        id: "submission-load-issue",
        tone: "warning",
        title: "Submission Sync Issue",
        detail: schoolDrawerSubmissionsError,
      });
    }

    return alerts;
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
    schoolDrawerSnapshotSummary,
    schoolDrawerYearDetail,
    schoolDrawerHistorySummary,
    schoolDrawerCriticalAlerts,
  };
}
