export type UserRole = "school_admin" | "monitor" | null;

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
