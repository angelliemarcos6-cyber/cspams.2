export type UserRole = "school_head" | "monitor" | null;

export type SchoolStatus = "active" | "inactive" | "pending";
export type WorkflowStatus = "draft" | "submitted" | "validated" | "returned";
export type IndicatorComplianceStatus = "met" | "below_target";

export interface SchoolRecord {
  id: string;
  schoolName: string;
  studentCount: number;
  teacherCount: number;
  region: string;
  status: SchoolStatus;
  submittedBy: string;
  lastUpdated: string;
}

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Exclude<UserRole, null>;
  schoolId: number | null;
  schoolCode: string | null;
  schoolName: string | null;
}

export interface SchoolRecordPayload {
  schoolName: string;
  studentCount: number;
  teacherCount: number;
  region: string;
  status: SchoolStatus;
}

export interface TargetsMetSnapshot {
  generatedAt: string;
  schoolsMonitored: number;
  activeSchools: number;
  pendingSchools: number;
  inactiveSchools: number;
  reportedStudents: number;
  reportedTeachers: number;
  trackedLearners: number;
  enrolledLearners: number;
  atRiskLearners: number;
  dropoutLearners: number;
  completerLearners: number;
  transfereeLearners: number;
  studentTeacherRatio: number | null;
  studentClassroomRatio: number | null;
  enrollmentRatePercent: number;
  retentionRatePercent: number;
  dropoutRatePercent: number;
  completionRatePercent: number;
  atRiskRatePercent: number;
  transitionRatePercent: number;
}

export type SyncAlertLevel = "success" | "info" | "warning" | "critical";

export interface SyncAlert {
  id: string;
  level: SyncAlertLevel;
  title: string;
  message: string;
  metric: string | null;
  value: number | null;
  threshold: number | null;
}

export interface IndicatorMetric {
  id: string;
  code: string;
  name: string;
  category: string;
}

export interface AcademicYearOption {
  id: string;
  name: string;
  isCurrent: boolean;
}

export interface IndicatorSubmissionItem {
  id: string;
  metric?: IndicatorMetric;
  targetValue: number;
  actualValue: number;
  varianceValue: number;
  complianceStatus: IndicatorComplianceStatus | string;
  remarks: string | null;
}

export interface IndicatorSubmissionSummary {
  totalIndicators: number;
  metIndicators: number;
  belowTargetIndicators: number;
  complianceRatePercent: number;
}

export interface IndicatorSubmission {
  id: string;
  formType: "indicator" | string;
  status: WorkflowStatus | string;
  statusLabel: string;
  reportingPeriod: string | null;
  version: number;
  school?: {
    id: string;
    schoolCode: string;
    name: string;
  };
  academicYear?: {
    id: string;
    name: string;
  };
  notes: string | null;
  reviewNotes: string | null;
  summary: IndicatorSubmissionSummary;
  indicators: IndicatorSubmissionItem[];
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface IndicatorSubmissionPayload {
  academicYearId: number;
  reportingPeriod?: string | null;
  notes?: string | null;
  indicators: Array<{
    metricId: number;
    targetValue: number;
    actualValue: number;
    remarks?: string | null;
  }>;
}
