import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  MonitorSchoolHeadAccountsPanel,
  type SchoolHeadAccountsStatusFilter,
} from "@/pages/monitor/MonitorSchoolHeadAccountsPanel";
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
  it("allows deleting a school record even when no School Head account is linked", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Delete school record" }));

    expect(onPreviewDeleteSchoolRecord).toHaveBeenCalledTimes(1);
    expect(onPreviewDeleteSchoolRecord).toHaveBeenCalledWith(record);
  });
});
