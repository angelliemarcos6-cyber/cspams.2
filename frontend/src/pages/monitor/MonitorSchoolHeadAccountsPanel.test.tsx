import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  MonitorSchoolHeadAccountsPanel,
  type SchoolHeadAccountsStatusFilter,
} from "@/pages/monitor/MonitorSchoolHeadAccountsPanel";
import { useSchoolHeadAccountActions } from "@/pages/monitor/useSchoolHeadAccountActions";
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

  it("keeps pending setup actions narrow while leaving reset-link actions for active and locked accounts in the menu", () => {
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

    const lockedRecord: SchoolRecord = {
      ...pendingRecord,
      id: "school-4",
      schoolId: "900004",
      schoolCode: "900004",
      schoolName: "Locked School",
      schoolHeadAccount: {
        ...pendingRecord.schoolHeadAccount!,
        id: "account-3",
        accountStatus: "locked",
        lifecycleState: "locked",
        lifecycleStateLabel: "Locked",
        recommendedAction: "send_password_reset_link",
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
            {
              schoolKey: "school-4",
              schoolCode: "900004",
              schoolName: "Locked School",
              record: lockedRecord,
            },
          ]}
          totalCount={3}
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
    const lockedRow = rows.find((row) => row.textContent?.includes("Locked School"));

    expect(pendingRow).not.toBeUndefined();
    expect(activeRow).not.toBeUndefined();
    expect(lockedRow).not.toBeUndefined();
    expect(within(pendingRow!).getByText("Setup link")).not.toBeNull();

    fireEvent.click(within(pendingRow!).getByRole("button", { name: "More actions" }));
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send Password Reset Link" })).toBeNull();
    fireEvent.click(within(pendingRow!).getByRole("button", { name: "More actions" }));

    fireEvent.click(within(activeRow!).getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("button", { name: "Send Password Reset Link" })).not.toBeNull();
    fireEvent.click(within(activeRow!).getByRole("button", { name: "More actions" }));

    fireEvent.click(within(lockedRow!).getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("button", { name: "Send Password Reset Link" })).not.toBeNull();
  });

  it("shows setup-link and temporary-password states distinctly in the Temp Pass column", () => {
    const setupLinkRecord: SchoolRecord = {
      id: "school-5",
      schoolId: "900005",
      schoolCode: "900005",
      schoolName: "Setup Link School",
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
        id: "account-5",
        name: "Setup User",
        email: "setup@cspams.local",
        accountStatus: "pending_setup",
        mustResetPassword: false,
        onboardingFlow: "setup_link",
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

    const tempActiveRecord: SchoolRecord = {
      ...setupLinkRecord,
      id: "school-6",
      schoolId: "900006",
      schoolCode: "900006",
      schoolName: "Temp Active School",
      schoolHeadAccount: {
        ...setupLinkRecord.schoolHeadAccount!,
        id: "account-6",
        email: "temp-active@cspams.local",
        accountStatus: "active",
        mustResetPassword: true,
        onboardingFlow: "temporary_password",
        lifecycleState: "temporary_password_active",
        lifecycleStateLabel: "Temporary password active",
        recommendedAction: "none",
        emailVerifiedAt: "2026-05-01T08:00:00.000Z",
        verifiedAt: "2026-05-01T08:00:00.000Z",
        verifiedByUserId: "1",
        verifiedByName: "Monitor User",
        temporaryPasswordIssuedAt: "2026-05-01T08:00:00.000Z",
        temporaryPasswordExpiresAt: "2026-05-03T08:00:00.000Z",
        temporaryPasswordExpired: false,
        temporaryPasswordDisplay: "Ab3Cd4Ef",
      },
    };

    const tempExpiredRecord: SchoolRecord = {
      ...setupLinkRecord,
      id: "school-7",
      schoolId: "900007",
      schoolCode: "900007",
      schoolName: "Temp Expired School",
      schoolHeadAccount: {
        ...tempActiveRecord.schoolHeadAccount!,
        id: "account-7",
        email: "temp-expired@cspams.local",
        lifecycleState: "temporary_password_expired",
        lifecycleStateLabel: "Temporary password expired",
        recommendedAction: "regenerate_temporary_password",
        temporaryPasswordExpired: true,
        temporaryPasswordDisplay: null,
      },
    };

    render(
      <MonitorSchoolHeadAccountsPanel
        isOpen
        isSaving={false}
        isMobileViewport={false}
        rows={[
          { schoolKey: "school-5", schoolCode: "900005", schoolName: "Setup Link School", record: setupLinkRecord },
          { schoolKey: "school-6", schoolCode: "900006", schoolName: "Temp Active School", record: tempActiveRecord },
          { schoolKey: "school-7", schoolCode: "900007", schoolName: "Temp Expired School", record: tempExpiredRecord },
        ]}
        totalCount={3}
        query=""
        statusFilter="all"
        onlyFlagged={false}
        onlyDeleteFlagged={false}
        onQueryChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onOnlyFlaggedChange={vi.fn()}
        onOnlyDeleteFlaggedChange={vi.fn()}
        onClearFilters={vi.fn()}
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
        actions={buildActions()}
      />,
    );

    const rows = screen.getAllByRole("row");
    const setupRow = rows.find((row) => row.textContent?.includes("Setup Link School"));
    const activeRow = rows.find((row) => row.textContent?.includes("Temp Active School"));
    const expiredRow = rows.find((row) => row.textContent?.includes("Temp Expired School"));

    expect(setupRow).not.toBeUndefined();
    expect(activeRow).not.toBeUndefined();
    expect(expiredRow).not.toBeUndefined();

    expect(within(setupRow!).getByText("Setup link")).not.toBeNull();
    expect(within(activeRow!).getByText("Ab3Cd4Ef")).not.toBeNull();
    expect(within(expiredRow!).getByText("Expired")).not.toBeNull();
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

  it("prioritizes blocked active lifecycle states ahead of active-ready accounts and filters them directly", () => {
    const expiredTempRecord: SchoolRecord = {
      id: "school-20",
      schoolId: "902020",
      schoolCode: "902020",
      schoolName: "Expired Temp Password School",
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
      schoolHeadAccount: {
        id: "account-20",
        name: "Expired Temp User",
        email: "expired-temp@cspams.local",
        accountStatus: "active",
        mustResetPassword: true,
        lifecycleState: "temporary_password_expired",
        lifecycleStateLabel: "Temporary password expired",
        recommendedAction: "regenerate_temporary_password",
        emailVerifiedAt: "2026-05-01T08:00:00.000Z",
        verifiedAt: "2026-05-02T08:00:00.000Z",
        verifiedByUserId: "1",
        verifiedByName: "Monitor User",
        verificationNotes: null,
        setupLinkExpiresAt: null,
        temporaryPasswordIssuedAt: "2026-05-01T08:00:00.000Z",
        temporaryPasswordExpiresAt: "2026-05-03T08:00:00.000Z",
        temporaryPasswordExpired: true,
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

    const resetRequiredRecord: SchoolRecord = {
      ...expiredTempRecord,
      id: "school-21",
      schoolId: "902021",
      schoolCode: "902021",
      schoolName: "Password Reset School",
      schoolHeadAccount: {
        ...expiredTempRecord.schoolHeadAccount!,
        id: "account-21",
        email: "reset-needed@cspams.local",
        lifecycleState: "password_reset_required",
        lifecycleStateLabel: "Password change required",
        recommendedAction: "send_password_reset_link",
        temporaryPasswordIssuedAt: null,
        temporaryPasswordExpiresAt: null,
        temporaryPasswordExpired: false,
      },
    };

    const activeReadyRecord: SchoolRecord = {
      ...expiredTempRecord,
      id: "school-22",
      schoolId: "902022",
      schoolCode: "902022",
      schoolName: "Active Ready School",
      schoolHeadAccount: {
        ...expiredTempRecord.schoolHeadAccount!,
        id: "account-22",
        email: "ready@cspams.local",
        mustResetPassword: false,
        lifecycleState: "active_ready",
        lifecycleStateLabel: "Active",
        recommendedAction: "none",
        temporaryPasswordIssuedAt: null,
        temporaryPasswordExpiresAt: null,
        temporaryPasswordExpired: false,
      },
    };

    const compactSchoolRows: MonitorSchoolRecordsListRow[] = [expiredTempRecord, resetRequiredRecord, activeReadyRecord].map((record) => ({
      summary: {
        schoolKey: record.id,
        schoolCode: record.schoolCode ?? "",
        schoolName: record.schoolName,
        region: record.region,
        schoolStatus: record.status,
        hasComplianceRecord: true,
        indicatorStatus: null,
        hasAnySubmitted: false,
        isComplete: false,
        awaitingReviewCount: 0,
        missingCount: 0,
        lastActivityAt: null,
        lastActivityTime: 0,
      },
      record,
    }));

    const recordBySchoolKey = new Map<string, SchoolRecord>(
      compactSchoolRows.flatMap(({ summary, record }) => (record ? [[summary.schoolKey, record] as const] : [])),
    );

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

    expect(result.current.schoolHeadAccountsPanelProps?.rows.map((row) => row.schoolName)).toEqual([
      "Expired Temp Password School",
      "Password Reset School",
      "Active Ready School",
    ]);

    act(() => {
      result.current.schoolHeadAccountsPanelProps!.onStatusFilterChange("temporary_password_expired");
    });
    expect(result.current.schoolHeadAccountsPanelProps?.rows.map((row) => row.schoolName)).toEqual([
      "Expired Temp Password School",
    ]);

    act(() => {
      result.current.schoolHeadAccountsPanelProps!.onStatusFilterChange("password_reset_required");
    });
    expect(result.current.schoolHeadAccountsPanelProps?.rows.map((row) => row.schoolName)).toEqual([
      "Password Reset School",
    ]);
  });

  it("does not require verification for remove-account-and-school actions without reintroducing note input", () => {
    const { result } = renderHook(() =>
      useSchoolHeadAccountActions({
        isPanelOpen: true,
        isSaving: false,
        pushToast: vi.fn(),
        updateSchoolHeadAccountStatus: vi.fn() as any,
        activateSchoolHeadAccount: vi.fn() as any,
        issueSchoolHeadAccountActionVerificationCode: vi.fn() as any,
        issueSchoolHeadSetupLink: vi.fn() as any,
        issueSchoolHeadPasswordResetLink: vi.fn() as any,
        issueSchoolHeadTemporaryPassword: vi.fn() as any,
        upsertSchoolHeadAccountProfile: vi.fn() as any,
        removeSchoolHeadAccount: vi.fn() as any,
      }),
    );

    act(() => {
      result.current.openPendingAccountAction({
        kind: "remove",
        schoolId: "school-12",
        schoolName: "Delete Me School",
        actionLabel: "Remove account and school",
      });
    });

    expect(result.current.pendingActionDescription).toBe("");
    expect(result.current.pendingActionRequiresVerification).toBe(false);
  });

  it("does not render confirmation-code controls for remove-account-and-school while keeping note input hidden", () => {
    const actions = buildActions();
    actions.pendingAccountAction = {
      kind: "remove",
      schoolId: "school-12",
      schoolName: "Batal Elementary School",
      actionLabel: "Remove account and school",
    };
    actions.pendingActionRequiresVerification = false;
    actions.confirmPendingAccountActionLabel = "Confirm";
    actions.isConfirmPendingAccountActionDisabled = false;

    render(
      <MonitorSchoolHeadAccountsPanel
        isOpen
        isSaving={false}
        isMobileViewport={false}
        rows={[]}
        totalCount={0}
        query=""
        statusFilter="all"
        onlyFlagged={false}
        onlyDeleteFlagged={false}
        onQueryChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onOnlyFlaggedChange={vi.fn()}
        onOnlyDeleteFlaggedChange={vi.fn()}
        onClearFilters={vi.fn()}
        onClose={vi.fn()}
        onOpenSchoolRecord={vi.fn()}
        pendingDeleteSchoolRecord={{
          id: "school-13",
          schoolId: "901013",
          schoolCode: "901013",
          schoolName: "Batal Elementary School",
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
        }}
        pendingDeleteSchoolRecordPreview={{
          id: "school-13",
          schoolId: "901013",
          schoolName: "Batal Elementary School",
          dependencies: {
            students: 0,
            sections: 0,
            indicatorSubmissions: 0,
            histories: 0,
            linkedUsers: 0,
          },
        }}
        pendingDeleteSchoolRecordError=""
        isDeleteSchoolRecordLoading={false}
        onPreviewDeleteSchoolRecord={vi.fn()}
        onClosePendingDeleteSchoolRecord={vi.fn()}
        onConfirmDeleteSchoolRecord={vi.fn()}
        formatDateTime={(value) => value ?? "-"}
        actions={actions}
      />,
    );

    expect(screen.queryByText(/This permanently deletes Batal Elementary School/i)).toBeNull();
    expect(screen.queryByLabelText(/Optional Note/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/Optional note for permanent removal/i)).toBeNull();
    expect(screen.queryByText(/This removes Batal Elementary School from active Schools/i)).toBeNull();
    expect(screen.queryByText(/Confirmation Code/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull();
  });

  it("enables the batch delete trigger only when delete-flagged schools exist", () => {
    const baseProps = {
      isOpen: true,
      isSaving: false,
      isMobileViewport: false,
      rows: [],
      totalCount: 0,
      query: "",
      statusFilter: "all" as const,
      onlyFlagged: false,
      onlyDeleteFlagged: false,
      onQueryChange: vi.fn(),
      onStatusFilterChange: vi.fn(),
      onOnlyFlaggedChange: vi.fn(),
      onOnlyDeleteFlaggedChange: vi.fn(),
      onClearFilters: vi.fn(),
      onClose: vi.fn(),
      onOpenSchoolRecord: vi.fn(),
      pendingDeleteSchoolRecord: null,
      pendingDeleteSchoolRecordPreview: null,
      pendingDeleteSchoolRecordError: "",
      isDeleteSchoolRecordLoading: false,
      onPreviewDeleteSchoolRecord: vi.fn(),
      onClosePendingDeleteSchoolRecord: vi.fn(),
      onConfirmDeleteSchoolRecord: vi.fn(),
      formatDateTime: (value: string | null) => value ?? "-",
      actions: buildActions(),
    };

    const { rerender } = render(
      <MonitorSchoolHeadAccountsPanel
        {...baseProps}
        deleteFlaggedSchoolCount={0}
      />,
    );

    const disabledBatchButtons = screen.getAllByRole("button", { name: "Open batch delete flagged schools" }) as HTMLButtonElement[];
    expect(disabledBatchButtons.every((button) => button.disabled)).toBe(true);

    rerender(
      <MonitorSchoolHeadAccountsPanel
        {...baseProps}
        deleteFlaggedSchoolCount={2}
      />,
    );

    const enabledBatchButtons = screen.getAllByRole("button", { name: "Open batch delete flagged schools" }) as HTMLButtonElement[];
    expect(enabledBatchButtons.some((button) => !button.disabled)).toBe(true);
  });

  it("opens and confirms the batch delete dialog for flagged schools", () => {
    const onOpenPendingBatchDeleteSchoolRecords = vi.fn();
    const onConfirmBatchDeleteSchoolRecords = vi.fn();

    render(
      <MonitorSchoolHeadAccountsPanel
        isOpen
        isSaving={false}
        isMobileViewport={false}
        rows={[]}
        totalCount={0}
        query=""
        statusFilter="all"
        onlyFlagged={false}
        onlyDeleteFlagged={false}
        onQueryChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onOnlyFlaggedChange={vi.fn()}
        onOnlyDeleteFlaggedChange={vi.fn()}
        onClearFilters={vi.fn()}
        onClose={vi.fn()}
        onOpenSchoolRecord={vi.fn()}
        pendingDeleteSchoolRecord={null}
        pendingDeleteSchoolRecordPreview={null}
        pendingDeleteSchoolRecordError=""
        isDeleteSchoolRecordLoading={false}
        onPreviewDeleteSchoolRecord={vi.fn()}
        onClosePendingDeleteSchoolRecord={vi.fn()}
        onConfirmDeleteSchoolRecord={vi.fn()}
        deleteFlaggedSchoolCount={3}
        isBatchDeleteSchoolRecordsPending
        isBatchDeleteSchoolRecordsLoading={false}
        batchDeleteSchoolRecordsError=""
        onOpenPendingBatchDeleteSchoolRecords={onOpenPendingBatchDeleteSchoolRecords}
        onClosePendingBatchDeleteSchoolRecords={vi.fn()}
        onConfirmBatchDeleteSchoolRecords={onConfirmBatchDeleteSchoolRecords}
        formatDateTime={(value) => value ?? "-"}
        actions={buildActions()}
      />,
    );

    const openButtons = screen.getAllByRole("button", { name: "Open batch delete flagged schools" });
    fireEvent.click(openButtons[openButtons.length - 1]!);
    expect(onOpenPendingBatchDeleteSchoolRecords).toHaveBeenCalledTimes(1);

    expect(screen.getByText(/Permanently delete 3 flagged schools/i)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm batch delete flagged schools" }));
    expect(onConfirmBatchDeleteSchoolRecords).toHaveBeenCalledTimes(1);
  });
});
