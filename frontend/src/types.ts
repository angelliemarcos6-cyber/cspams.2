export type UserRole = "school_head" | "monitor" | null;
export type AccountStatus = "active" | "suspended" | "locked" | "archived";

export type SchoolStatus = "active" | "inactive" | "pending";
export type WorkflowStatus = "draft" | "submitted" | "validated" | "returned";
export type IndicatorComplianceStatus = "met" | "below_target";
export type MetricDataType = "number" | "currency" | "yes_no" | "enum" | "yearly_matrix" | "text";

export interface MetricInputSchema {
  comparison?: "greater_or_equal" | "less_or_equal" | "equal" | "info_only" | string;
  options?: string[];
  years?: string[];
  valueType?: "number" | "integer" | "percentage" | "yes_no" | string;
  currency?: string;
}

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
  deletedAt?: string | null;
}

export interface SchoolHeadAccountPayload {
  name: string;
  email: string;
  password?: string | null;
  mustResetPassword?: boolean;
}

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Exclude<UserRole, null>;
  accountStatus?: AccountStatus | string;
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
  schoolHeadAccount?: SchoolHeadAccountPayload | null;
}

export interface SchoolRecordDeletePreview {
  id: string;
  schoolId: string;
  schoolName: string;
  dependencies: {
    students: number;
    sections: number;
    indicatorSubmissions: number;
    histories: number;
    linkedUsers: number;
  };
}

export interface SchoolReminderReceipt {
  schoolId: string;
  schoolName: string;
  recipientCount: number;
  recipientEmails: string[];
  remindedAt: string;
}

export interface SchoolBulkImportRowPayload {
  schoolId: string;
  schoolName: string;
  level: string;
  type: "public" | "private";
  address: string;
  district?: string | null;
  region?: string | null;
  status?: SchoolStatus;
  studentCount: number;
  teacherCount: number;
}

export interface SchoolBulkImportResult {
  created: number;
  updated: number;
  restored: number;
  skipped: number;
  failed: number;
  results: Array<{
    row: number;
    schoolId: string;
    schoolName?: string;
    action: "created" | "updated" | "restored" | "skipped" | "failed";
    message?: string;
  }>;
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

export interface TeacherRecord {
  id: string;
  school?: {
    id: string;
    schoolCode: string | null;
    name: string | null;
  };
  name: string;
  sex: "male" | "female" | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TeacherRecordPayload {
  name: string;
  sex?: "male" | "female" | null;
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
  framework: string;
  dataType: MetricDataType | string;
  inputSchema?: MetricInputSchema | null;
  unit?: string | null;
  sortOrder?: number;
  isAutoCalculated?: boolean;
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
  targetTypedValue?: Record<string, unknown> | null;
  actualTypedValue?: Record<string, unknown> | null;
  targetDisplay?: string | null;
  actualDisplay?: string | null;
  complianceStatus: IndicatorComplianceStatus | string;
  remarks: string | null;
}

export interface IndicatorTypedValuePayload {
  value?: string | number | boolean | null;
  amount?: number | string | null;
  currency?: string | null;
  values?: Record<string, string | number | boolean | null>;
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
  createdBy?: {
    id: string;
    name: string;
    email: string;
  };
  submittedBy?: {
    id: string;
    name: string;
    email: string;
  };
  reviewedBy?: {
    id: string;
    name: string;
    email: string;
  };
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
    targetValue?: number;
    actualValue?: number;
    target?: IndicatorTypedValuePayload;
    actual?: IndicatorTypedValuePayload;
    remarks?: string | null;
  }>;
}

export interface FormSubmissionHistoryEntry {
  id: string;
  formType: string;
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

export interface AppNotification {
  id: string;
  type: string;
  eventType: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string | null;
  data: Record<string, unknown>;
}

export interface AppNotificationListMeta {
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
  unreadCount: number;
}
