import type {
  IndicatorMatrixRow,
  SchoolIndicatorMatrix,
  SchoolIndicatorPackageRow,
  SchoolIndicatorRowGroup,
} from "@/pages/monitor/monitorDrawerTypes";
import {
  KEY_PERFORMANCE_CATEGORY_LABEL,
  SCHOOL_ACHIEVEMENTS_CATEGORY_LABEL,
  deriveSchoolYearLabel,
  indicatorCategoryLabel,
  indicatorDisplayLabel,
  resolveSubmissionItemDisplayValue,
  sortSchoolYears,
  typedYearValues,
} from "@/pages/monitor/monitorDrawerViewModelUtils";
import { compareMonitorPackagePriority, resolveMonitorSubmissionSchoolYearLabel } from "@/pages/monitor/monitorSchoolDetailYear";
import type { IndicatorSubmission } from "@/types";

export function buildMonitorSchoolIndicatorMatrix(
  schoolDrawerSubmissions: IndicatorSubmission[],
): SchoolIndicatorMatrix {
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
}

export function groupMonitorSchoolIndicatorRowsByCategory(
  rows: IndicatorMatrixRow[],
): SchoolIndicatorRowGroup[] {
  return rows.reduce<SchoolIndicatorRowGroup[]>((groups, row) => {
    const existing = groups.find((group) => group.category === row.category);
    if (existing) {
      existing.rows.push(row);
      return groups;
    }

    groups.push({ category: row.category, rows: [row] });
    return groups;
  }, []);
}

export function buildMonitorSchoolIndicatorPackageRows(
  schoolDrawerSubmissions: IndicatorSubmission[],
): SchoolIndicatorPackageRow[] {
  return schoolDrawerSubmissions.map((submission) => ({
    id: submission.id,
    schoolYear: resolveMonitorSubmissionSchoolYearLabel(submission),
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
  }));
}

export function resolveLatestMonitorSchoolIndicatorYear(years: string[]): string {
  return years[years.length - 1] ?? "";
}

export function deriveMissingMonitorDrawerIndicatorKeys(
  rows: IndicatorMatrixRow[],
  selectedYear: string,
): string[] {
  if (!selectedYear) {
    return [];
  }

  return rows
    .filter((row) => {
      const values = row.valuesByYear[selectedYear] ?? { target: "", actual: "" };
      return values.target.trim().length === 0 || values.actual.trim().length === 0;
    })
    .map((row) => row.key);
}

export function deriveReturnedMonitorDrawerIndicatorKeys(
  schoolDrawerSubmissions: IndicatorSubmission[],
  selectedYear: string,
  rowKeySet: Set<string>,
): string[] {
  const latestSubmission = schoolDrawerSubmissions
    .filter((submission) => resolveMonitorSubmissionSchoolYearLabel(submission) === selectedYear)
    .slice()
    .sort(compareMonitorPackagePriority)[0] ?? null;
  if (!latestSubmission) {
    return [];
  }

  const mappedKeys = latestSubmission.indicators
    .filter((entry) => String(entry.complianceStatus ?? "").toLowerCase().includes("returned"))
    .map((entry) => entry.metric?.code?.trim() || entry.metric?.id?.trim() || entry.id)
    .filter((value): value is string => Boolean(value && value.trim().length > 0));

  return [...new Set(mappedKeys)].filter((key) => rowKeySet.has(key));
}
