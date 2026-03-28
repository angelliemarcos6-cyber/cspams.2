import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonitorDashboard } from "@/pages/MonitorDashboard";
import { useAuth } from "@/context/Auth";
import { useData } from "@/context/Data";
import { useIndicatorData } from "@/context/IndicatorData";
import { useStudentData } from "@/context/StudentData";
import { useTeacherData } from "@/context/TeacherData";
import type { IndicatorDataContextType } from "@/context/IndicatorData";
import type { StudentDataContextType } from "@/context/StudentData";
import type { TeacherDataContextType } from "@/context/TeacherData";

vi.mock("@/context/Auth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/context/Data", () => ({
  useData: vi.fn(),
}));

vi.mock("@/context/IndicatorData", () => ({
  useIndicatorData: vi.fn(),
}));

vi.mock("@/context/StudentData", () => ({
  useStudentData: vi.fn(),
}));

vi.mock("@/context/TeacherData", () => ({
  useTeacherData: vi.fn(),
}));

vi.mock("@/components/Shell", () => ({
  Shell: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
    <div>
      <div>{actions}</div>
      <div>{children}</div>
    </div>
  ),
}));

vi.mock("@/components/DashboardHelpDialog", () => ({
  DashboardHelpDialog: () => null,
}));

vi.mock("@/components/MonitorMfaResetApprovalsDialog", () => ({
  MonitorMfaResetApprovalsDialog: () => null,
}));

vi.mock("@/components/StatCard", () => ({
  StatCard: () => null,
}));

vi.mock("@/components/charts/StatusPieChart", () => ({
  StatusPieChart: () => null,
}));

vi.mock("@/components/charts/RegionBarChart", () => ({
  RegionBarChart: () => null,
}));

vi.mock("@/components/charts/SubmissionTrendChart", () => ({
  SubmissionTrendChart: () => null,
}));

vi.mock("@/components/indicators/MonitorIndicatorPanel", () => ({
  MonitorIndicatorPanel: () => null,
}));

vi.mock("@/components/students/StudentRecordsPanel", () => ({
  StudentRecordsPanel: () => null,
}));

const issueSchoolHeadSetupLinkMock = vi.fn();
const scrollIntoViewMock = vi.fn();

describe("MonitorDashboard School Head delivery flows", () => {
  beforeEach(() => {
    issueSchoolHeadSetupLinkMock.mockReset();
    scrollIntoViewMock.mockReset();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
    issueSchoolHeadSetupLinkMock.mockResolvedValue({
      account: {
        id: "account-1",
        name: "Maria Santos",
        email: "maria@example.com",
        emailVerifiedAt: null,
        lastLoginAt: null,
        accountStatus: "pending_setup",
        mustResetPassword: true,
        flagged: false,
        flaggedAt: null,
        flagReason: null,
        deleteRecordFlagged: false,
        deleteRecordFlaggedAt: null,
        deleteRecordReason: null,
        setupLinkExpiresAt: "2026-03-28T12:00:00.000Z",
      },
      expiresAt: "2026-03-28T12:00:00.000Z",
      delivery: "sent",
      deliveryMessage: "Message queued.",
    });

    vi.mocked(useAuth).mockReturnValue({
      role: "monitor",
      username: "Monitor User",
      user: {
        id: 1,
        name: "Monitor User",
        email: "monitor@cspams.local",
        role: "monitor",
        schoolId: null,
        schoolCode: null,
        schoolName: null,
      },
      authError: "",
      authErrorCode: null,
      accountStatus: null,
      isLoading: false,
      isAuthenticating: false,
      isLoggingOut: false,
      clearAuthError: vi.fn(),
      login: vi.fn(),
      verifyMfa: vi.fn(),
      requestMonitorPasswordReset: vi.fn(),
      resetMonitorPassword: vi.fn(),
      requestMonitorMfaReset: vi.fn(),
      completeMonitorMfaReset: vi.fn(),
      completeAccountSetup: vi.fn(),
      resetRequiredPassword: vi.fn(),
      logout: vi.fn(),
      listActiveSessions: vi.fn(),
      revokeSessionDevice: vi.fn(),
      revokeOtherSessions: vi.fn(),
    });

    vi.mocked(useData).mockReturnValue({
      records: [
        {
          id: "1",
          schoolId: "900001",
          schoolCode: "900001",
          schoolName: "Santiago Elementary",
          level: "Elementary",
          district: "District 1",
          address: "District 1, Santiago City",
          type: "public",
          studentCount: 120,
          teacherCount: 12,
          region: "Region II",
          status: "active",
          submittedBy: "Monitor User",
          lastUpdated: "2026-03-27T09:00:00.000Z",
          deletedAt: null,
          schoolHeadAccount: {
            id: "account-1",
            name: "Maria Santos",
            email: "maria@example.com",
            emailVerifiedAt: null,
            lastLoginAt: null,
            accountStatus: "pending_setup",
            mustResetPassword: true,
            flagged: false,
            flaggedAt: null,
            flagReason: null,
            deleteRecordFlagged: false,
            deleteRecordFlaggedAt: null,
            deleteRecordReason: null,
            setupLinkExpiresAt: "2026-03-28T12:00:00.000Z",
          },
          indicatorLatest: null,
        },
      ],
      recordCount: 1,
      targetsMet: {
        generatedAt: "2026-03-27T09:00:00.000Z",
        schoolsMonitored: 1,
        activeSchools: 1,
        pendingSchools: 0,
        inactiveSchools: 0,
        reportedStudents: 120,
        reportedTeachers: 12,
        trackedLearners: 120,
        enrolledLearners: 120,
        atRiskLearners: 0,
        dropoutLearners: 0,
        completerLearners: 0,
        transfereeLearners: 0,
        studentTeacherRatio: 10,
        studentClassroomRatio: 30,
        enrollmentRatePercent: 100,
        retentionRatePercent: 100,
        dropoutRatePercent: 0,
        completionRatePercent: 0,
        atRiskRatePercent: 0,
        transitionRatePercent: 0,
      },
      syncAlerts: [],
      isLoading: false,
      isSaving: false,
      error: "",
      lastSyncedAt: "2026-03-27T09:00:00.000Z",
      syncScope: "division",
      syncStatus: "updated",
      refreshRecords: vi.fn(),
      addRecord: vi.fn(),
      updateRecord: vi.fn(),
      deleteRecord: vi.fn(),
      previewDeleteRecord: vi.fn(),
      listArchivedRecords: vi.fn(),
      restoreRecord: vi.fn(),
      sendReminder: vi.fn(),
      updateSchoolHeadAccountStatus: vi.fn(),
      issueSchoolHeadAccountActionVerificationCode: vi.fn(),
      issueSchoolHeadSetupLink: issueSchoolHeadSetupLinkMock,
      issueSchoolHeadPasswordResetLink: vi.fn(),
      upsertSchoolHeadAccountProfile: vi.fn(),
      removeSchoolHeadAccount: vi.fn(),
      bulkImportRecords: vi.fn(),
    });

    const indicatorDataMock = {
      submissions: [],
      allSubmissions: [],
      metrics: [],
      academicYears: [],
      isLoading: false,
      isAllSubmissionsLoading: false,
      isSaving: false,
      error: "",
      lastSyncedAt: null,
      refreshSubmissions: vi.fn(),
      refreshAllSubmissions: vi.fn(),
      listSubmissions: vi.fn(),
      listSubmissionsForSchool: vi.fn().mockResolvedValue([]),
      loadAllSubmissions: vi.fn(),
      createSubmission: vi.fn(),
      updateSubmission: vi.fn(),
      submitSubmission: vi.fn(),
      reviewSubmission: vi.fn(),
      loadHistory: vi.fn(),
    } satisfies IndicatorDataContextType;
    vi.mocked(useIndicatorData).mockReturnValue(indicatorDataMock);

    const studentDataMock = {
      students: [],
      isLoading: false,
      isSaving: false,
      error: "",
      lastSyncedAt: null,
      syncScope: "division",
      totalCount: 0,
      dataVersion: 0,
      refreshStudents: vi.fn(),
      queryStudents: vi.fn().mockResolvedValue({
        data: [],
        meta: {
          syncedAt: null,
          scope: "division",
          recordCount: 0,
          currentPage: 1,
          lastPage: 1,
          perPage: 1,
          total: 0,
          from: null,
          to: null,
          hasMorePages: false,
        },
      }),
      listStudentHistory: vi.fn(),
      addStudent: vi.fn(),
      updateStudent: vi.fn(),
      deleteStudent: vi.fn(),
      deleteStudents: vi.fn(),
    } satisfies StudentDataContextType;
    vi.mocked(useStudentData).mockReturnValue(studentDataMock);

    const teacherDataMock = {
      teachers: [],
      teacherSnapshot: [],
      isLoading: false,
      isSaving: false,
      error: "",
      lastSyncedAt: null,
      syncScope: "division",
      totalCount: 0,
      dataVersion: 0,
      refreshTeachers: vi.fn(),
      listTeachers: vi.fn().mockResolvedValue({
        data: [],
        meta: {
          syncedAt: null,
          scope: "division",
          recordCount: 0,
          currentPage: 1,
          lastPage: 1,
          perPage: 1,
          total: 0,
          from: null,
          to: null,
          hasMorePages: false,
        },
      }),
      addTeacher: vi.fn(),
      updateTeacher: vi.fn(),
      deleteTeacher: vi.fn(),
    } satisfies TeacherDataContextType;
    vi.mocked(useTeacherData).mockReturnValue(teacherDataMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses delivery metadata only when sending a School Head setup link", async () => {
    render(<MonitorDashboard />);

    fireEvent.click(screen.getByRole("button", { name: "Open Schools" }));
    fireEvent.click(screen.getByRole("button", { name: "Accounts" }));
    fireEvent.click(screen.getByRole("button", { name: "Send Setup Link" }));

    await waitFor(() => {
      expect(issueSchoolHeadSetupLinkMock).toHaveBeenCalledWith("1", null);
    });

    expect(screen.getByText("Setup link email sent for Santiago Elementary.")).toBeTruthy();
    expect(screen.getByText("Message queued.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /copy link/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reveal link/i })).toBeNull();
  });

  it("uses the same focus-and-scroll behavior for keyboard top navigation", async () => {
    render(<MonitorDashboard />);
    scrollIntoViewMock.mockClear();

    fireEvent.keyDown(window, { key: "2", altKey: true });

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });

    const openSchoolsButtons = screen.getAllByRole("button", { name: "Open Schools" });
    expect(openSchoolsButtons.every((button) => button.getAttribute("aria-current") === "page")).toBe(true);
  });
});
