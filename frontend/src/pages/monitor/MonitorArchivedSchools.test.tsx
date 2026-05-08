import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonitorArchivedSchools } from "@/pages/monitor/MonitorArchivedSchools";
import type { SchoolRecord } from "@/types";

describe("MonitorArchivedSchools", () => {
  it("shows linked archived school head details from archived-school context", () => {
    const archivedWithAccount: SchoolRecord = {
      id: "school-archived-1",
      schoolId: "901100",
      schoolCode: "901100",
      schoolName: "Archived With Account",
      level: "Elementary",
      district: "District 1",
      address: "District 1",
      type: "public",
      studentCount: 0,
      teacherCount: 0,
      region: "Region II",
      status: "active",
      submittedBy: "Monitor User",
      lastUpdated: "2026-05-09T08:00:00.000Z",
      deletedAt: "2026-05-09T09:00:00.000Z",
      schoolHeadAccount: {
        id: "account-archived-1",
        name: "Archived School Head",
        email: "archived-head@cspams.local",
        accountStatus: "archived",
        mustResetPassword: false,
        lifecycleState: "archived",
        lifecycleStateLabel: "Archived",
        recommendedAction: "none",
        emailVerifiedAt: null,
        verifiedAt: null,
        verifiedByUserId: null,
        verifiedByName: null,
        verificationNotes: null,
        setupLinkExpiresAt: null,
        temporaryPasswordIssuedAt: null,
        temporaryPasswordExpiresAt: null,
        temporaryPasswordExpired: false,
        lastLoginAt: null,
        flagged: false,
        flaggedAt: null,
        flagReason: null,
        deleteRecordFlagged: false,
        deleteRecordFlaggedAt: null,
        deleteRecordReason: null,
      },
      indicatorLatest: null,
    };

    const archivedWithoutAccount: SchoolRecord = {
      ...archivedWithAccount,
      id: "school-archived-2",
      schoolId: "901101",
      schoolCode: "901101",
      schoolName: "Archived Without Account",
      schoolHeadAccount: null,
    };

    render(
      <MonitorArchivedSchools
        show
        archivedRecords={[archivedWithAccount, archivedWithoutAccount]}
        isLoading={false}
        isSaving={false}
        onRefresh={vi.fn()}
        onRestore={vi.fn()}
        formatDateTime={(value) => value}
      />,
    );

    expect(screen.getByText("School Head")).not.toBeNull();
    expect(screen.getByText("Archived School Head")).not.toBeNull();
    expect(screen.getByText("archived-head@cspams.local")).not.toBeNull();
    expect(screen.getByText("archived")).not.toBeNull();
    expect(screen.getByText("No account")).not.toBeNull();
  });
});
