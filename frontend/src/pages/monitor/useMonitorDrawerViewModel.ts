import { useMemo } from "react";
import type { MonitorSchoolRequirementSummary } from "@/pages/monitor/MonitorSchoolRecordsList";
import type {
  IndicatorMatrixRow,
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
  schoolDrawerCriticalAlerts: SchoolDrawerCriticalAlert[];
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

    if (!summary && !record) return null;

    return {
      schoolKey: schoolDrawerKey,
      schoolCode: summary?.schoolCode ?? (record?.schoolId ?? record?.schoolCode ?? "N/A"),
      schoolName: summary?.schoolName ?? record?.schoolName ?? "Unknown School",
      region: summary?.region ?? record?.region ?? "N/A",
      level: record?.level ?? "N/A",
      type: schoolTypeLabel(record?.type),
      address: record?.address ?? record?.district ?? "N/A",
      hasComplianceRecord: summary?.hasComplianceRecord ?? false,
      indicatorStatus: summary?.indicatorStatus ?? null,
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
    schoolDrawerCriticalAlerts,
  };
}
