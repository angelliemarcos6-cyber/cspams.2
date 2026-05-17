import { useMemo } from "react";
import type { MonitorSchoolRequirementSummary } from "@/pages/monitor/MonitorSchoolRecordsList";
import type {
  IndicatorMatrixRow,
  MonitorDrawerHistorySummary,
  MonitorDrawerSnapshotSummary,
  MonitorDrawerSubmissionSummary,
  SchoolDetailSnapshot,
  SchoolDrawerCriticalAlert,
  SchoolIndicatorMatrix,
  SchoolIndicatorPackageRow,
  SchoolIndicatorRowGroup,
} from "@/pages/monitor/monitorDrawerTypes";
import {
  resolveSubmissionItemDisplayValue,
  SCHOOL_ACHIEVEMENTS_CATEGORY_LABEL,
  deriveSchoolYearLabel,
  indicatorCategoryLabel,
  indicatorDisplayLabel,
  schoolTypeLabel,
  sortSchoolYears,
  typedYearValues,
} from "@/pages/monitor/monitorDrawerViewModelUtils";
import { resolveSubmissionRequirementProfile } from "@/utils/submissionRequirements";
import type { IndicatorSubmission, SchoolRecord } from "@/types";

interface UseMonitorDrawerViewModelArgs {
  schoolDrawerKey: string | null;
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
  schoolDrawerSubmissionSummary: MonitorDrawerSubmissionSummary | null;
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

export function buildMonitorDrawerSnapshotSummary(
  schoolDetail: SchoolDetailSnapshot | null,
): MonitorDrawerSnapshotSummary | null {
  if (!schoolDetail) {
    return null;
  }

  const requirementProfile = resolveSubmissionRequirementProfile(schoolDetail.schoolTypeRaw);
  const activePackageLabel = schoolDetail.activePackageLabel || (
    requirementProfile.schoolType === "private" ? "FM-QAD uploads only" : "BMEF and SMEA"
  );
  const requirementModeLabel = schoolDetail.requirementModeLabel || (
    requirementProfile.schoolType === "private"
      ? "Active package requirements: FM-QAD uploads only."
      : "Active package requirements: BMEF and SMEA."
  );

  if (!schoolDetail.hasComplianceRecord) {
    return {
      requirementModeLabel,
      activePackageLabel,
      summaryHeadline: `Compliance is still missing. Active ${requirementProfile.schoolType} package is ${schoolDetail.indicatorStatus ? schoolDetail.indicatorStatus : "not submitted"} and needs School Head action.`,
      currentIssueLabel: "Compliance record still missing.",
      currentIssueTone: "warning",
      needsAction: true,
    };
  }

  if (schoolDetail.indicatorStatus === "returned") {
    return {
      requirementModeLabel,
      activePackageLabel,
      summaryHeadline: `Compliance is submitted. Active ${requirementProfile.schoolType} package was returned for correction and needs School Head action.`,
      currentIssueLabel: "Returned package needs correction.",
      currentIssueTone: "warning",
      needsAction: true,
    };
  }

  if (schoolDetail.awaitingReviewCount > 0 || schoolDetail.indicatorStatus === "submitted") {
    return {
      requirementModeLabel,
      activePackageLabel,
      summaryHeadline: `Compliance is submitted. Active ${requirementProfile.schoolType} package is awaiting monitor review.`,
      currentIssueLabel: "Awaiting monitor review.",
      currentIssueTone: "info",
      needsAction: false,
    };
  }

  if (schoolDetail.missingCount > 0) {
    return {
      requirementModeLabel,
      activePackageLabel,
      summaryHeadline: `Compliance is submitted. Active ${requirementProfile.schoolType} package is not yet submitted. ${schoolDetail.missingCount} requirement${schoolDetail.missingCount === 1 ? "" : "s"} remain missing.`,
      currentIssueLabel: `${schoolDetail.missingCount} requirement${schoolDetail.missingCount === 1 ? "" : "s"} still missing.`,
      currentIssueTone: "warning",
      needsAction: true,
    };
  }

  if (schoolDetail.indicatorStatus === "validated") {
    return {
      requirementModeLabel,
      activePackageLabel,
      summaryHeadline: `Compliance and the active ${requirementProfile.schoolType} package are complete and monitor-validated.`,
      currentIssueLabel: "No immediate issue.",
      currentIssueTone: "success",
      needsAction: false,
    };
  }

  return {
    requirementModeLabel,
    activePackageLabel,
    summaryHeadline: `Compliance is submitted. Active ${requirementProfile.schoolType} package status is ${schoolDetail.indicatorStatus ? schoolDetail.indicatorStatus : "not submitted"}.`,
    currentIssueLabel: "Review current package status.",
    currentIssueTone: "info",
    needsAction: false,
  };
}

export function buildMonitorDrawerSubmissionSummary(
  schoolDetail: SchoolDetailSnapshot | null,
  schoolDrawerSubmissions: IndicatorSubmission[],
): MonitorDrawerSubmissionSummary | null {
  if (!schoolDetail) {
    return null;
  }

  const sortedSubmissions = schoolDrawerSubmissions.slice().sort(compareMonitorPackagePriority);
  const latestActivitySubmission = sortedSubmissions[0] ?? null;
  const latestMonitorRelevantSubmission =
    sortedSubmissions.find((submission) => isMonitorRelevantPackageStatus(submission.status)) ?? null;

  const latestActivityStatus = latestActivitySubmission?.status ?? null;
  const monitorRelevantStatus = latestMonitorRelevantSubmission?.status ?? null;

  const submissionLineageLabel = latestMonitorRelevantSubmission
    ? `Monitor-facing package context is driven by package #${latestMonitorRelevantSubmission.id}.`
    : latestActivitySubmission
      ? `Latest activity is package #${latestActivitySubmission.id}, but no monitor-relevant package has been submitted yet.`
      : "No indicator package activity is available yet for this school.";

  let submissionStateExplanation = "";
  if (!latestActivitySubmission) {
    submissionStateExplanation = "No package activity yet. Monitor is waiting for the School Head to start the active package.";
  } else if (
    latestActivitySubmission
    && latestMonitorRelevantSubmission
    && latestActivitySubmission.id !== latestMonitorRelevantSubmission.id
    && String(latestActivityStatus ?? "").trim().toLowerCase() === "draft"
  ) {
    submissionStateExplanation = `Latest activity is a draft (${latestActivitySubmission.academicYear?.name ?? "Unknown school year"}), but the actionable monitor package is still #${latestMonitorRelevantSubmission.id} (${String(monitorRelevantStatus ?? "not submitted").toLowerCase()}).`;
  } else if (!latestMonitorRelevantSubmission) {
    submissionStateExplanation = "Recent activity exists, but the school has not yet produced a submitted, returned, or validated active package for monitor action.";
  } else if (String(monitorRelevantStatus ?? "").trim().toLowerCase() === "returned") {
    submissionStateExplanation = "The latest monitor-relevant package was returned for correction. Monitor is waiting for School Head revisions.";
  } else if (String(monitorRelevantStatus ?? "").trim().toLowerCase() === "submitted") {
    submissionStateExplanation = "The latest monitor-relevant package is submitted and awaiting monitor review.";
  } else if (String(monitorRelevantStatus ?? "").trim().toLowerCase() === "validated") {
    submissionStateExplanation = "The latest monitor-relevant package is validated. Review history remains available for context.";
  } else {
    submissionStateExplanation = "Review the current package lineage and status for this school.";
  }

  return {
    requirementModeLabel: schoolDetail.requirementModeLabel,
    activePackageLabel: schoolDetail.activePackageLabel,
    monitorRelevantPackageStatus: monitorRelevantStatus,
    latestActivityStatus,
    latestMonitorRelevantSubmissionId: latestMonitorRelevantSubmission?.id ?? null,
    latestPackageSchoolYear: latestMonitorRelevantSubmission?.academicYear?.name?.trim() || null,
    latestPackageReportingPeriod: latestMonitorRelevantSubmission?.reportingPeriod ?? null,
    latestPackageSubmittedAt:
      latestMonitorRelevantSubmission?.submittedAt
      ?? latestMonitorRelevantSubmission?.updatedAt
      ?? latestMonitorRelevantSubmission?.createdAt
      ?? null,
    latestPackageReviewedAt: latestMonitorRelevantSubmission?.reviewedAt ?? null,
    latestPackageComplianceRatePercent:
      typeof latestMonitorRelevantSubmission?.summary?.complianceRatePercent === "number"
      && Number.isFinite(latestMonitorRelevantSubmission.summary.complianceRatePercent)
        ? latestMonitorRelevantSubmission.summary.complianceRatePercent
        : null,
    latestActivitySubmissionId: latestActivitySubmission?.id ?? null,
    latestActivitySchoolYear: latestActivitySubmission?.academicYear?.name?.trim() || null,
    latestActivityAt:
      latestActivitySubmission?.updatedAt
      ?? latestActivitySubmission?.submittedAt
      ?? latestActivitySubmission?.createdAt
      ?? null,
    submissionLineageLabel,
    submissionStateExplanation,
    needsMonitorAction:
      String(monitorRelevantStatus ?? "").trim().toLowerCase() === "submitted"
      || schoolDetail.awaitingReviewCount > 0,
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

  const schoolIndicatorRowKeySet = useMemo(
    () => new Set(schoolIndicatorMatrix.rows.map((row) => row.key)),
    [schoolIndicatorMatrix.rows],
  );

  const missingDrawerIndicatorKeys = useMemo(() => {
    if (!latestSchoolIndicatorYear) return [] as string[];

    return schoolIndicatorMatrix.rows
      .filter((row) => {
        const values = row.valuesByYear[latestSchoolIndicatorYear] ?? { target: "", actual: "" };
        return values.target.trim().length === 0 || values.actual.trim().length === 0;
      })
      .map((row) => row.key);
  }, [latestSchoolIndicatorYear, schoolIndicatorMatrix.rows]);

  const returnedDrawerIndicatorKeys = useMemo(() => {
    const latestSubmission = schoolIndicatorMatrix.latestSubmission;
    if (!latestSubmission) return [] as string[];

    const mappedKeys = latestSubmission.indicators
      .filter((entry) => String(entry.complianceStatus ?? "").toLowerCase().includes("returned"))
      .map((entry) => entry.metric?.code?.trim() || entry.metric?.id?.trim() || entry.id)
      .filter((value): value is string => Boolean(value && value.trim().length > 0));

    return [...new Set(mappedKeys)].filter((key) => schoolIndicatorRowKeySet.has(key));
  }, [schoolIndicatorMatrix.latestSubmission, schoolIndicatorRowKeySet]);

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

  const schoolDrawerSnapshotSummary = useMemo(
    () => buildMonitorDrawerSnapshotSummary(schoolDetail),
    [schoolDetail],
  );

  const schoolDrawerSubmissionSummary = useMemo(
    () => buildMonitorDrawerSubmissionSummary(schoolDetail, schoolDrawerSubmissions),
    [schoolDetail, schoolDrawerSubmissions],
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
    schoolDrawerSubmissionSummary,
    schoolDrawerHistorySummary,
    schoolDrawerCriticalAlerts,
  };
}
