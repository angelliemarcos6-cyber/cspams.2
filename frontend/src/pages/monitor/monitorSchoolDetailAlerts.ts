import type { MonitorSchoolRequirementSummary } from "@/pages/monitor/MonitorSchoolRecordsList";
import type { SchoolDetailSnapshot, SchoolDrawerCriticalAlert } from "@/pages/monitor/monitorDrawerTypes";
import { schoolTypeLabel } from "@/pages/monitor/monitorDrawerViewModelUtils";
import { resolveSubmissionRequirementProfile } from "@/utils/submissionRequirements";
import type { SchoolRecord } from "@/types";

interface BuildMonitorSchoolDetailSnapshotArgs {
  schoolDrawerKey: string | null;
  schoolRequirementByKey: Map<string, MonitorSchoolRequirementSummary>;
  recordBySchoolKey: Map<string, SchoolRecord>;
  studentStatsBySchoolKey: Map<string, { students: number; teachers: Set<string> }>;
  accurateSyncedCountsBySchoolKey: Record<string, { students: number; teachers: number }>;
}

export function buildMonitorSchoolDetailSnapshot({
  schoolDrawerKey,
  schoolRequirementByKey,
  recordBySchoolKey,
  studentStatsBySchoolKey,
  accurateSyncedCountsBySchoolKey,
}: BuildMonitorSchoolDetailSnapshotArgs): SchoolDetailSnapshot | null {
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
}

export function buildMonitorSchoolDetailAlerts(
  schoolDetail: SchoolDetailSnapshot | null,
  schoolDrawerSubmissionsError: string,
): SchoolDrawerCriticalAlert[] {
  if (!schoolDetail) {
    return [];
  }

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
}
