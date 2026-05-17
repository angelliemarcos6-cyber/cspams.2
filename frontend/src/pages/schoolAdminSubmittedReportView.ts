import { resolveSubmissionItemDisplayValue } from "@/pages/monitor/monitorDrawerViewModelUtils";
import {
  resolveExactSubmissionItemByMetricCode,
  resolveSubmissionSchoolId,
} from "@/utils/submissionRequirements";
import type {
  IndicatorSubmission,
  IndicatorSubmissionItem,
} from "@/types";

export function safeSubmissionTimestamp(value: string | null | undefined): number {
  const timestamp = new Date(value ?? 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function isFinalizedSubmissionStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "submitted" || normalized === "validated";
}

export function submittedReportLineageTimestamp(submission: IndicatorSubmission): number {
  return safeSubmissionTimestamp(submission.submittedAt)
    || safeSubmissionTimestamp(submission.reviewedAt)
    || safeSubmissionTimestamp(submission.updatedAt)
    || safeSubmissionTimestamp(submission.createdAt);
}

export function submittedReportRecencyScore(submission: IndicatorSubmission): number {
  const timestamp = submittedReportLineageTimestamp(submission);
  const version = Number(submission.version ?? 0);
  return (Number.isFinite(timestamp) ? timestamp : 0) * 1_000 + (Number.isFinite(version) ? version : 0);
}

export function compareSelectedYearFinalizedReportSubmissions(
  left: IndicatorSubmission,
  right: IndicatorSubmission,
): number {
  const recencyDelta = submittedReportRecencyScore(right) - submittedReportRecencyScore(left);
  if (recencyDelta !== 0) {
    return recencyDelta;
  }

  const updatedDelta = safeSubmissionTimestamp(right.updatedAt) - safeSubmissionTimestamp(left.updatedAt);
  if (updatedDelta !== 0) {
    return updatedDelta;
  }

  return String(right.id ?? "").localeCompare(String(left.id ?? ""));
}

export function resolvePreferredSubmittedReportAcademicYearId(
  entries: IndicatorSubmission[],
  selectedSchoolId: string,
): string | null {
  const finalizedEntries = entries
    .filter((entry) => isFinalizedSubmissionStatus(entry.status))
    .filter((entry) => (
      selectedSchoolId.length === 0
      || resolveSubmissionSchoolId(entry) === selectedSchoolId
    ))
    .slice()
    .sort(compareSelectedYearFinalizedReportSubmissions);

  return finalizedEntries[0]?.academicYear?.id ?? null;
}

export function resolveSelectedYearReportSubmission(entries: IndicatorSubmission[]): IndicatorSubmission | null {
  const finalizedEntries = entries.filter((entry) => isFinalizedSubmissionStatus(entry.status));
  if (finalizedEntries.length === 0) {
    return null;
  }

  const ranked = finalizedEntries.slice().sort(compareSelectedYearFinalizedReportSubmissions);

  return ranked[0] ?? null;
}

export function resolveSubmittedReportSubmissionForView(
  submission: IndicatorSubmission | null | undefined,
  options: {
    selectedSchoolId: string | null | undefined;
    selectedAcademicYearId: string | null | undefined;
  },
): IndicatorSubmission | null {
  if (!submission || !isFinalizedSubmissionStatus(submission.status)) {
    return null;
  }

  const selectedSchoolId = String(options.selectedSchoolId ?? "").trim();
  if (selectedSchoolId && resolveSubmissionSchoolId(submission) !== selectedSchoolId) {
    return null;
  }

  const selectedAcademicYearId = String(options.selectedAcademicYearId ?? "").trim();
  if (
    selectedAcademicYearId
    && selectedAcademicYearId !== "all"
    && String(submission.academicYear?.id ?? "").trim() !== selectedAcademicYearId
  ) {
    return null;
  }

  return submission;
}

export function submissionRows(submission: IndicatorSubmission | null | undefined): IndicatorSubmissionItem[] {
  if (!submission) {
    return [];
  }

  const directIndicators = Array.isArray(submission.indicators) ? submission.indicators : [];
  if (directIndicators.length > 0) {
    return directIndicators;
  }

  return Array.isArray(submission.items) ? submission.items : [];
}

export function submissionHasRenderableIndicatorDetails(submission: IndicatorSubmission | null | undefined): boolean {
  return submissionRows(submission).some((item) => {
    const metricCode = String(item.metric?.code ?? "").trim();
    const metricName = String(item.metric?.name ?? "").trim();
    return metricCode.length > 0 || metricName.length > 0;
  });
}

export function resolveStableSubmittedReportViewSubmission(
  selectedSubmission: IndicatorSubmission | null | undefined,
  hydratedSubmission: IndicatorSubmission | null | undefined,
  options: {
    selectedSchoolId: string | null | undefined;
    selectedAcademicYearId: string | null | undefined;
  },
): IndicatorSubmission | null {
  const eligibleSelectedSubmission = resolveSubmittedReportSubmissionForView(selectedSubmission, options);
  const eligibleHydratedSubmission = resolveSubmittedReportSubmissionForView(hydratedSubmission, options);

  const preferredSubmission = resolveSelectedYearReportSubmission(
    [eligibleSelectedSubmission, eligibleHydratedSubmission].filter((entry): entry is IndicatorSubmission => Boolean(entry)),
  );

  if (
    eligibleHydratedSubmission
    && preferredSubmission
    && eligibleHydratedSubmission.id === preferredSubmission.id
    && submissionHasRenderableIndicatorDetails(eligibleHydratedSubmission)
  ) {
    return eligibleHydratedSubmission;
  }

  return eligibleSelectedSubmission;
}

export function resolveSubmittedReportIndicatorByMetricCode(
  indicators: IndicatorSubmissionItem[],
  expectedMetricCode: string | null | undefined,
): IndicatorSubmissionItem | null {
  return resolveExactSubmissionItemByMetricCode(indicators, expectedMetricCode);
}

export function buildSubmittedReportBlankStateLines(): [string, string] {
  return [
    "No finalized submitted report package exists yet for the selected academic year.",
    "The report tables are shown for reference. Finalized values will appear here after you submit the package.",
  ];
}

export function buildSubmittedReportSourceContext(
  submission: IndicatorSubmission | null | undefined,
  selectedReportYearLabel: string,
): string[] {
  const lines = [`Viewing finalized submitted report for SY ${selectedReportYearLabel}.`];

  if (!submission?.id) {
    lines.push("Source package: None yet.");
    lines.push("Status: Reference only.");
    return lines;
  }

  const packageId = String(submission.id ?? "").trim();
  const statusLabel = String(submission.statusLabel ?? submission.status ?? "").trim() || "Submitted";
  lines.push(`Source package: #${packageId} (${statusLabel}).`);

  const submittedAtLabel = submission.submittedAt
    ? new Date(submission.submittedAt).toLocaleDateString()
    : null;
  if (submittedAtLabel) {
    lines.push(`Submitted: ${submittedAtLabel}.`);
  }

  return lines;
}

export function resolveIndicatorValue(
  indicator: IndicatorSubmissionItem | null | undefined,
  kind: "target" | "actual",
): string {
  return resolveSubmissionItemDisplayValue(indicator, kind);
}
