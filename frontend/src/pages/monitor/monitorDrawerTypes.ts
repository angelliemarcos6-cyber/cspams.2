import type { IndicatorSubmission } from "@/types";

export interface SchoolDetailSnapshot {
  schoolKey: string;
  schoolCode: string;
  schoolName: string;
  region: string;
  level: string;
  type: string;
  schoolTypeRaw: string | null;
  requirementModeLabel: string;
  activePackageLabel: string;
  address: string;
  hasComplianceRecord: boolean;
  indicatorStatus: string | null;
  hasActivePackageSubmission: boolean;
  missingCount: number;
  awaitingReviewCount: number;
  lastActivityAt: string | null;
  reportedStudents: number;
  reportedTeachers: number;
  synchronizedStudents: number;
  synchronizedTeachers: number;
}

export interface MonitorDrawerSnapshotSummary {
  requirementModeLabel: string;
  activePackageLabel: string;
  summaryHeadline: string;
  currentIssueLabel: string;
  currentIssueTone: "warning" | "info" | "success";
  needsAction: boolean;
}

export interface MonitorDrawerSubmissionSummary {
  requirementModeLabel: string;
  activePackageLabel: string;
  monitorRelevantPackageStatus: string | null;
  latestActivityStatus: string | null;
  latestMonitorRelevantSubmissionId: string | null;
  latestPackageSchoolYear: string | null;
  latestPackageReportingPeriod: string | null;
  latestPackageSubmittedAt: string | null;
  latestPackageReviewedAt: string | null;
  latestPackageComplianceRatePercent: number | null;
  latestActivitySubmissionId: string | null;
  latestActivitySchoolYear: string | null;
  latestActivityAt: string | null;
  submissionLineageLabel: string;
  submissionStateExplanation: string;
  needsMonitorAction: boolean;
}

export interface IndicatorMatrixRowCell {
  target: string;
  actual: string;
}

export interface IndicatorMatrixRow {
  key: string;
  code: string;
  label: string;
  category: string;
  sortOrder: number;
  valuesByYear: Record<string, IndicatorMatrixRowCell>;
}

export interface SchoolIndicatorPackageRow {
  id: string;
  schoolYear: string;
  reportingPeriod: string;
  status: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  updatedAt: string | null;
  complianceRatePercent: number | null;
  reviewedBy: string;
}

export interface SchoolDrawerCriticalAlert {
  id: string;
  tone: "warning" | "info";
  title: string;
  detail: string;
}

export interface SchoolIndicatorMatrix {
  years: string[];
  rows: IndicatorMatrixRow[];
  latestSubmission: IndicatorSubmission | null;
}

export interface SchoolIndicatorRowGroup {
  category: string;
  rows: IndicatorMatrixRow[];
}
