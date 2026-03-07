export type UserRole = "school_head" | "monitor" | null;

export type SchoolStatus = "active" | "inactive" | "pending";

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
