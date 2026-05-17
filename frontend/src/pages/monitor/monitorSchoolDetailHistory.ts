import type { MonitorDrawerHistorySummary } from "@/pages/monitor/monitorDrawerTypes";
import { deriveSchoolYearLabel } from "@/pages/monitor/monitorDrawerViewModelUtils";
import type { IndicatorSubmission } from "@/types";
import { compareMonitorPackagePriority } from "@/pages/monitor/monitorSchoolDetailYear";

export function hasRenderableIndicatorRows(submission: IndicatorSubmission | null | undefined): boolean {
  return Array.isArray(submission?.indicators) && submission.indicators.length > 0;
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
      (submission.academicYear?.name ?? "").trim()
      || deriveSchoolYearLabel(submission.submittedAt ?? submission.updatedAt ?? submission.createdAt);
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
    (latestHistorySubmission?.academicYear?.name ?? "").trim()
    || deriveSchoolYearLabel(
      latestHistorySubmission?.submittedAt ?? latestHistorySubmission?.updatedAt ?? latestHistorySubmission?.createdAt,
    );
  const latestRenderableSchoolYear = latestRenderableSubmission
    ? (latestRenderableSubmission.academicYear?.name ?? "").trim()
      || deriveSchoolYearLabel(
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
