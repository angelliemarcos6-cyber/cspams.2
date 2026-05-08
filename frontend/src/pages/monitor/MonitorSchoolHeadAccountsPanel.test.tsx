import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  MonitorSchoolHeadAccountsPanel,
  type SchoolHeadAccountsStatusFilter,
} from "@/pages/monitor/MonitorSchoolHeadAccountsPanel";
import type { MonitorSchoolRecordsListRow } from "@/pages/monitor/MonitorSchoolRecordsList";
import { useMonitorSchoolHeadAccountsPanelState } from "@/pages/monitor/useMonitorSchoolHeadAccountsPanelState";
import type { SchoolHeadAccountActionsApi } from "@/pages/monitor/useSchoolHeadAccountActions";
import type { SchoolRecord } from "@/types";

function buildActions(): SchoolHeadAccountActionsApi {
  return {
    editingSchoolHeadAccountSchoolId: null,
    schoolHeadAccountDraft: { name: "", email: "" },
    schoolHeadAccountDraftError: "",
    temporaryPasswordReceipt: null,
    openAccountRowMenuSchoolId: null,
    pendingAccountAction: null,
    pendingAccountReason: "",
    pendingAccountReasonError: "",
    pendingAccountVerificationChallenge: null,
    pendingAccountVerificationCode: "",
    pendingAccountVerificationError: "",
    pendingActionDescription: "",
    pendingActionRequiresVerification: false,
    isPendingAccountVerificationSending: false,
    isConfirmPendingAccountActionDisabled: false,
    confirmPendingAccountActionLabel: "Confirm",
    pendingRemoveCountdownSeconds: 0,
    accountActionKey: null,
    accountRowMenuRef: { current: null },
    pendingAccountReasonRef: { current: null },
    pendingAccountVerificationCodeRef: { current: null },
    beginEditing: vi.fn(),
    cancelEditing: vi.fn(),
    updateDraftField: vi.fn(),
    saveProfile: vi.fn(),
    toggleAccountRowMenu: vi.fn(),
    openPendingAccountAction: vi.fn(),
    closePendingAccountAction: vi.fn(),
    updatePendingAccountReason: vi.fn(),
    updatePendingVerificationCode: vi.fn(),
    sendPendingAccountVerificationCode: vi.fn(),
    confirmPendingAccountAction: vi.fn(),
    handleUpdateSchoolHeadAccount: vi.fn(),
    handleIssueSchoolHeadSetupLink: vi.fn(),
    copyTemporaryPasswordReceipt: vi.fn(),
    clearTemporaryPasswordReceipt: vi.fn(),
    resetPanelState: vi.fn(),
  };
}

describe("MonitorSchoolHeadAccountsPanel", () => {
  it("allows archiving a school record even when no School Head account is linked", () => {
    const onPreviewDeleteSchoolRecord = vi.fn();
    const record: SchoolRecord = {
      id: "school-1",
      schoolId: "900001",
      schoolCode: "900001",
      schoolName: "No Account School",
      level: "Elementary",
      district: "District 1",
      address: "District 1",
      type: "public",
      studentCount: 0,
      teacherCount: 0,
      region: "Region II",
      status: "active",
      submittedBy: "Monitor User",
      lastUpdated: "2026-05-08T08:00:00.000Z",
      deletedAt: null,
      schoolHeadAccount: null,
      indicatorLatest: null,
    };

    function Wrapper(): ReactElement {
      const [openAccountRowMenuSchoolId, setOpenAccountRowMenuSchoolId] = useState<string | null>(null);
      const [query, setQuery] = useState("");
      const [statusFilter, setStatusFilter] = useState<SchoolHeadAccountsStatusFilter>("all");
      const [onlyFlagged, setOnlyFlagged] = useState(false);
      const [onlyDeleteFlagged, setOnlyDeleteFlagged] = useState(false);
      const actions = buildActions();
      actions.openAccountRowMenuSchoolId = openAccountRowMenuSchoolId;
      actions.toggleAccountRowMenu = (schoolId: string) => {
        setOpenAccountRowMenuSchoolId((current) => (current === schoolId ? null : schoolId));
      };

      return (
        <MonitorSchoolHeadAccountsPanel
          isOpen
          isSaving={false}
          isMobileViewport={false}
          rows={[
            {
              schoolKey: "school-1",
              schoolCode: "900001",
              schoolName: "No Account School",
              record,
            },
          ]}
          totalCount={1}
          query={query}
          statusFilter={statusFilter}
          onlyFlagged={onlyFlagged}
          onlyDeleteFlagged={onlyDeleteFlagged}
          onQueryChange={setQuery}
          onStatusFilterChange={setStatusFilter}
          onOnlyFlaggedChange={setOnlyFlagged}
          onOnlyDeleteFlaggedChange={setOnlyDeleteFlagged}
          onClearFilters={() => {
            setQuery("");
            setStatusFilter("all");
            setOnlyFlagged(false);
            setOnlyDeleteFlagged(false);
          }}
          onClose={vi.fn()}
          onOpenSchoolRecord={vi.fn()}
          pendingDeleteSchoolRecord={null}
          pendingDeleteSchoolRecordPreview={null}
          pendingDeleteSchoolRecordError=""
          isDeleteSchoolRecordLoading={false}
          onPreviewDeleteSchoolRecord={onPreviewDeleteSchoolRecord}
          onClosePendingDeleteSchoolRecord={vi.fn()}
          onConfirmDeleteSchoolRecord={vi.fn()}
          formatDateTime={(value) => value ?? "-"}
          actions={actions}
        />
      );
    }

    render(<Wrapper />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive school record" }));

    expect(onPreviewDeleteSchoolRecord).toHaveBeenCalledTimes(1);
    expect(onPreviewDeleteSchoolRecord).toHaveBeenCalledWith(record);
  });

  it("keeps pending setup actions narrow while leaving reset-link actions for active accounts in the menu", () => {
    const pendingRecord: SchoolRecord = {
      id: "school-2",
      schoolId: "900002",
      schoolCode: "900002",
      schoolName: "Pending Setup School",
      level: "Elementary",
      district: "District 1",
      address: "District 1",
      type: "public",
      studentCount: 0,
      teacherCount: 0,
      region: "Region II",
      status: "active",
      submittedBy: "Monitor User",
      lastUpdated: "2026-05-08T08:00:00.000Z",
      deletedAt: null,
      schoolHeadAccount: {
        id: "account-1",
        name: "Pending User",
        email: "pending@cspams.local",
        accountStatus: "pending_setup",
        mustResetPassword: false,
        lifecycleState: "pending_setup",
        lifecycleStateLabel: "Pending setup",
        recommendedAction: "send_setup_link",
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

    const activeRecord: SchoolRecord = {
      ...pendingRecord,
      id: "school-3",
      schoolId: "900003",
      schoolCode: "900003",
      schoolName: "Active School",
      schoolHeadAccount: {
        ...pendingRecord.schoolHeadAccount!,
        id: "account-2",
        accountStatus: "active",
        lifecycleState: "active_ready",
        lifecycleStateLabel: "Active",
        recommendedAction: "send_password_reset_link",
        emailVerifiedAt: "2026-05-01T08:00:00.000Z",
        verifiedAt: "2026-05-02T08:00:00.000Z",
        verifiedByName: "Monitor User",
      },
    };

    function Wrapper(): ReactElement {
      const [openAccountRowMenuSchoolId, setOpenAccountRowMenuSchoolId] = useState<string | null>(null);
      const [query, setQuery] = useState("");
      const [statusFilter, setStatusFilter] = useState<SchoolHeadAccountsStatusFilter>("all");
      const [onlyFlagged, setOnlyFlagged] = useState(false);
      const [onlyDeleteFlagged, setOnlyDeleteFlagged] = useState(false);
      const actions = buildActions();
      actions.openAccountRowMenuSchoolId = openAccountRowMenuSchoolId;
      actions.toggleAccountRowMenu = (schoolId: string) => {
        setOpenAccountRowMenuSchoolId((current) => (current === schoolId ? null : schoolId));
      };

      return (
        <MonitorSchoolHeadAccountsPanel
          isOpen
          isSaving={false}
          isMobileViewport={false}
          rows={[
            {
              schoolKey: "school-2",
              schoolCode: "900002",
              schoolName: "Pending Setup School",
              record: pendingRecord,
            },
            {
              schoolKey: "school-3",
              schoolCode: "900003",
              schoolName: "Active School",
              record: activeRecord,
            },
          ]}
          totalCount={2}
          query={query}
          statusFilter={statusFilter}
          onlyFlagged={onlyFlagged}
          onlyDeleteFlagged={onlyDeleteFlagged}
          onQueryChange={setQuery}
          onStatusFilterChange={setStatusFilter}
          onOnlyFlaggedChange={setOnlyFlagged}
          onOnlyDeleteFlaggedChange={setOnlyDeleteFlagged}
          onClearFilters={() => {
            setQuery("");
            setStatusFilter("all");
            setOnlyFlagged(false);
            setOnlyDeleteFlagged(false);
          }}
          onClose={vi.fn()}
          onOpenSchoolRecord={vi.fn()}
          pendingDeleteSchoolRecord={null}
          pendingDeleteSchoolRecordPreview={null}
          pendingDeleteSchoolRecordError=""
          isDeleteSchoolRecordLoading={false}
          onPreviewDeleteSchoolRecord={vi.fn()}
          onClosePendingDeleteSchoolRecord={vi.fn()}
          onConfirmDeleteSchoolRecord={vi.fn()}
          formatDateTime={(value) => value ?? "-"}
          actions={actions}
        />
      );
    }

    render(<Wrapper />);

    const rows = screen.getAllByRole("row");
    const pendingRow = rows.find((row) => row.textContent?.includes("Pending Setup School"));
    const activeRow = rows.find((row) => row.textContent?.includes("Active School"));

    expect(pendingRow).not.toBeUndefined();
    expect(activeRow).not.toBeUndefined();

    fireEvent.click(within(pendingRow!).getByRole("button", { name: "More actions" }));
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send Password Reset Link" })).toBeNull();
    fireEvent.click(within(pendingRow!).getByRole("button", { name: "More actions" }));

    fireEvent.click(within(activeRow!).getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("button", { name: "Send Password Reset Link" })).not.toBeNull();
  });

  it("separates no-account rows from pending-setup rows in the status filter", () => {
    const noAccountRecord: SchoolRecord = {
      id: "school-10",
      schoolId: "901010",
      schoolCode: "901010",
      schoolName: "No Account School",
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
      deletedAt: null,
      schoolHeadAccount: null,
      indicatorLatest: null,
    };

    const pendingSetupRecord: SchoolRecord = {
      ...noAccountRecord,
      id: "school-11",
      schoolId: "901011",
      schoolCode: "901011",
      schoolName: "Pending Setup School",
      schoolHeadAccount: {
        id: "account-11",
        name: "Pending User",
        email: "pending@cspams.local",
        accountStatus: "pending_setup",
        mustResetPassword: false,
        lifecycleState: "pending_setup",
        lifecycleStateLabel: "Pending setup",
        recommendedAction: "send_setup_link",
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
    };

    const compactSchoolRows: MonitorSchoolRecordsListRow[] = [
      {
        summary: {
          schoolKey: "school-10",
          schoolCode: "901010",
          schoolName: "No Account School",
          region: "Region II",
          schoolStatus: "active",
          hasComplianceRecord: true,
          indicatorStatus: null,
          hasAnySubmitted: false,
          isComplete: false,
          awaitingReviewCount: 0,
          missingCount: 1,
          lastActivityAt: null,
          lastActivityTime: 0,
        },
        record: noAccountRecord,
      },
      {
        summary: {
          schoolKey: "school-11",
          schoolCode: "901011",
          schoolName: "Pending Setup School",
          region: "Region II",
          schoolStatus: "active",
          hasComplianceRecord: true,
          indicatorStatus: null,
          hasAnySubmitted: false,
          isComplete: false,
          awaitingReviewCount: 0,
          missingCount: 1,
          lastActivityAt: null,
          lastActivityTime: 0,
        },
        record: pendingSetupRecord,
      },
    ];

    const recordBySchoolKey = new Map<string, SchoolRecord>([
      ["school-10", noAccountRecord],
      ["school-11", pendingSetupRecord],
    ]);

    const { result } = renderHook(() =>
      useMonitorSchoolHeadAccountsPanelState({
        isMobileViewport: false,
        isSaving: false,
        compactSchoolRows,
        recordBySchoolKey,
        pushToast: vi.fn(),
        updateSchoolHeadAccountStatus: vi.fn() as any,
        activateSchoolHeadAccount: vi.fn() as any,
        issueSchoolHeadAccountActionVerificationCode: vi.fn() as any,
        issueSchoolHeadSetupLink: vi.fn() as any,
        issueSchoolHeadPasswordResetLink: vi.fn() as any,
        issueSchoolHeadTemporaryPassword: vi.fn() as any,
        upsertSchoolHeadAccountProfile: vi.fn() as any,
        removeSchoolHeadAccount: vi.fn() as any,
        deleteRecord: vi.fn(async () => {}),
        previewDeleteRecord: vi.fn() as any,
        onOpenSchoolRecord: vi.fn(),
        formatDateTime: (value) => value,
      }),
    );

    act(() => {
      result.current.toggleSchoolHeadAccountsPanel();
    });

    const panelProps = result.current.schoolHeadAccountsPanelProps;
    expect(panelProps).not.toBeNull();

    act(() => {
      panelProps!.onStatusFilterChange("no_account");
    });
    expect(result.current.schoolHeadAccountsPanelProps?.rows.map((row) => row.schoolName)).toEqual(["No Account School"]);

    act(() => {
      result.current.schoolHeadAccountsPanelProps!.onStatusFilterChange("pending_setup");
    });
    expect(result.current.schoolHeadAccountsPanelProps?.rows.map((row) => row.schoolName)).toEqual(["Pending Setup School"]);
  });
});
