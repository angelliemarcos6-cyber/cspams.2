import type { IndicatorSubmission } from "@/types";

export interface SchoolDetailSnapshot {
  schoolKey: string;
  schoolCode: string;
  schoolName: string;
  region: string;
  level: string;
  type: string;
  address: string;
  hasComplianceRecord: boolean;
  indicatorStatus: string | null;
  missingCount: number;
  awaitingReviewCount: number;
  lastActivityAt: string | null;
  reportedStudents: number;
  reportedTeachers: number;
  synchronizedStudents: number;
  synchronizedTeachers: number;
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
