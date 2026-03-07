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
