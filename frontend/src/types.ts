export type UserRole = "school_head" | "monitor" | null;
export type AccountStatus =
  | "active"
  | "pending_setup"
  | "pending_verification"
  | "suspended"
  | "locked"
  | "archived";

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
  schoolHeadAccount?: SchoolHeadAccountSummary | null;
  indicatorLatest?: {
    id: string;
    status: WorkflowStatus | string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  } | null;
}

export interface SchoolHeadAccountPayload {
  name: string;
  email: string;
  reason?: string;
  verificationChallengeId?: string;
  verificationCode?: string;
}

export interface SchoolHeadAccountSummary {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  accountStatus: AccountStatus | string;
  mustResetPassword: boolean;
  verifiedAt?: string | null;
  verifiedByUserId?: string | null;
  verifiedByName?: string | null;
  verificationNotes?: string | null;
  flagged: boolean;
  flaggedAt: string | null;
  flagReason: string | null;
  deleteRecordFlagged: boolean;
  deleteRecordFlaggedAt: string | null;
  deleteRecordReason: string | null;
  setupLinkExpiresAt: string | null;
}

export interface SchoolHeadAccountStatusUpdatePayload {
  accountStatus?: "active" | "suspended" | "locked" | "archived";
  flagged?: boolean;
  deleteRecordFlagged?: boolean;
  reason: string;
  verificationChallengeId?: string;
  verificationCode?: string;
}

export interface SchoolHeadAccountStatusUpdateResult {
  account: SchoolHeadAccountSummary;
  message: string;
}

export interface SchoolHeadAccountActivationResult {
  account: SchoolHeadAccountSummary;
  message: string;
}

export interface SchoolHeadSetupLinkResult {
  account: SchoolHeadAccountSummary;
  expiresAt: string;
  delivery: "sent" | "failed" | string;
  deliveryMessage: string;
}

export interface SchoolHeadPasswordResetLinkResult {
  account: SchoolHeadAccountSummary;
  expiresAt: string;
  delivery: "sent" | "failed" | string;
  deliveryMessage: string;
  enforced: boolean;
  message: string;
}

export interface SchoolHeadAccountActionVerificationCodeResult {
  challengeId: string;
  expiresAt: string;
  delivery: "sent" | "failed" | string;
  deliveryMessage: string;
}

export interface SchoolHeadAccountProfileUpsertResult {
  account: SchoolHeadAccountSummary;
  message?: string | null;
  expiresAt?: string | null;
  delivery?: "sent" | "failed" | string | null;
  deliveryMessage?: string | null;
}

export interface SchoolHeadAccountRemovalResult {
  message: string;
  deletedCount: number;
}

export interface SchoolHeadAccountProvisioningReceipt {
  id: string;
  name: string;
  email: string;
  mustResetPassword: boolean;
  accountStatus: AccountStatus | string;
  setupLinkExpiresAt: string;
  setupLinkDelivery: "sent" | "failed" | string;
  setupLinkDeliveryMessage: string;
}

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Exclude<UserRole, null>;
  accountStatus?: AccountStatus | string;
  lastLoginAt?: string | null;
  schoolId: number | null;
  schoolCode: string | null;
  schoolName: string | null;
  schoolType?: "public" | "private" | string | null;
}

export type ActiveSessionType = "api_token" | "web_session";

export interface ActiveSessionDevice {
  id: string;
  sessionType: ActiveSessionType | string;
  deviceLabel: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string | null;
  lastActiveAt: string | null;
  expiresAt: string | null;
  isCurrent: boolean;
}

export interface SchoolRecordPayload {
  schoolId?: string;
  schoolName?: string;
  level?: string | null;
  studentCount?: number;
  teacherCount?: number;
  region?: string;
  status?: SchoolStatus;
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
  academicYear?: {
    id: string;
    name: string | null;
    isCurrent: boolean;
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

export interface StudentStatusHistoryEntry {
  id: string;
  studentId: string;
  fromStatus: string | null;
  fromStatusLabel: string | null;
  toStatus: string | null;
  toStatusLabel: string | null;
  notes: string | null;
  actor?: {
    id: string;
    name: string;
    email: string;
  };
  changedAt: string | null;
}

export interface StudentStatusHistoryMeta {
  syncedAt: string | null;
  scope: "division" | "school" | null;
  scopeKey: string | null;
  studentId: string;
  studentLrn: string | null;
  recordCount: number;
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
  from: number | null;
  to: number | null;
  hasMorePages: boolean;
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
  targetValue: number | null;
  actualValue: number | null;
  varianceValue: number | null;
  targetTypedValue?: Record<string, unknown> | null;
  actualTypedValue?: Record<string, unknown> | null;
  targetDisplay?: string | null;
  actualDisplay?: string | null;
  complianceStatus: IndicatorComplianceStatus | string;
  remarks: string | null;
}

// NEW 2026 COMPLIANCE UI: BMEF tab replaces TARGETS-MET
// 4-tab layout (School Achievements | Key Performance | BMEF | SMEA)
// Monitor & School Head views updated for DepEd standards
export type IndicatorSubmissionFileType =
  | "bmef"
  | "smea"
  | "fm_qad_001"
  | "fm_qad_002"
  | "fm_qad_003"
  | "fm_qad_004"
  | "fm_qad_008"
  | "fm_qad_009"
  | "fm_qad_010"
  | "fm_qad_011"
  | "fm_qad_034"
  | "fm_qad_041";
export type GroupBWorkspaceResetTarget =
  | "bmef"
  | "smea"
  | "fm_qad_001"
  | "fm_qad_002"
  | "fm_qad_003"
  | "fm_qad_004"
  | "fm_qad_008"
  | "fm_qad_009"
  | "fm_qad_010"
  | "fm_qad_011"
  | "fm_qad_034"
  | "fm_qad_041"
  | "school_achievements_learning_outcomes"
  | "key_performance_indicators";

export interface IndicatorSubmissionFileEntry {
  type: IndicatorSubmissionFileType;
  uploaded: boolean;
  path: string | null;
  originalFilename: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
  downloadUrl: string | null;
  viewUrl?: string | null;
}

export type IndicatorSubmissionFiles = Partial<Record<IndicatorSubmissionFileType, IndicatorSubmissionFileEntry>>;

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
    type?: string | null;
  };
  academicYear?: {
    id: string;
    name: string;
  };
  notes: string | null;
  reviewNotes: string | null;
  summary: IndicatorSubmissionSummary;
  files?: IndicatorSubmissionFiles;
  completion?: {
    hasImetaFormData: boolean;
    hasBmefFile: boolean;
    hasSmeaFile: boolean;
    isComplete: boolean;
    requiredFileTypes?: IndicatorSubmissionFileType[];
    uploadedFileTypes?: IndicatorSubmissionFileType[];
    missingFileTypes?: IndicatorSubmissionFileType[];
  };
  indicators: IndicatorSubmissionItem[];
  items?: IndicatorSubmissionItem[];
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
  mode?: "full_replace" | "partial";
  replace_missing?: boolean;
  indicators: Array<{
    metricId: number;
    metricCode?: string;
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
