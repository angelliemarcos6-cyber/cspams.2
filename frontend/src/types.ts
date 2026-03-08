export type UserRole = "school_head" | "monitor" | null;

export type SchoolStatus = "active" | "inactive" | "pending";
export type WorkflowStatus = "draft" | "submitted" | "validated" | "returned";
export type IndicatorComplianceStatus = "met" | "below_target";

export interface SchoolRecord {
  id: string;
  schoolId?: string | null;
  schoolCode?: string | null;
  schoolName: string;
  level?: string | null;
  district?: string | null;
  address?: string | null;
  type?: string | null;
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
  schoolId?: string;
  schoolName?: string;
  level?: string | null;
  studentCount: number;
  teacherCount: number;
  region?: string;
  status: SchoolStatus;
  district?: string | null;
  address?: string | null;
  type?: "public" | "private" | null;
}

export type StudentEnrollmentStatus =
  | "enrolled"
  | "at_risk"
  | "transferee"
  | "returning"
  | "dropped_out"
  | "on_hold"
  | "completer"
  | "graduated";

export interface StudentRecord {
  id: string;
  school?: {
    id: string;
    schoolCode: string | null;
    name: string | null;
  };
  lrn: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fullName: string;
  sex: "male" | "female" | null;
  birthDate: string | null;
  age: number | null;
  status: StudentEnrollmentStatus | string;
  statusLabel: string;
  riskLevel: "none" | "low" | "medium" | "high" | string;
  section: string | null;
  teacher: string | null;
  currentLevel: string | null;
  trackedFromLevel: string | null;
  lastStatusAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface StudentRecordPayload {
  lrn: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  sex?: "male" | "female" | null;
  birthDate?: string | null;
  status: StudentEnrollmentStatus;
  riskLevel?: "none" | "low" | "medium" | "high" | null;
  section?: string | null;
  teacher?: string | null;
  currentLevel?: string | null;
  trackedFromLevel?: string | null;
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

export type SubmissionFormType = "sf1" | "sf5";

export interface FormSubmission {
  id: string;
  formType: SubmissionFormType | string;
  status: WorkflowStatus | string;
  statusLabel: string | null;
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
  summary?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  validationNotes: string | null;
  generatedAt: string | null;
  submittedAt: string | null;
  validatedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface FormSubmissionHistoryEntry {
  id: string;
  formType: SubmissionFormType | string;
  submissionId: string;
  action: string;
  fromStatus: string | null;
  fromStatusLabel: string | null;
  toStatus: string | null;
  toStatusLabel: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  actor?: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string | null;
}
