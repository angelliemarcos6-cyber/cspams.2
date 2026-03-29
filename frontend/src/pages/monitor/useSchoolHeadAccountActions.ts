import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type {
  SchoolHeadAccountActivationResult,
  SchoolHeadAccountActionVerificationCodeResult,
  SchoolHeadAccountPayload,
  SchoolHeadAccountProfileUpsertResult,
  SchoolHeadAccountRemovalResult,
  SchoolHeadAccountStatusUpdatePayload,
  SchoolHeadAccountStatusUpdateResult,
  SchoolHeadPasswordResetLinkResult,
  SchoolHeadSetupLinkResult,
  SchoolRecord,
} from "@/types";

type ToastTone = "success" | "info" | "warning";

export type PendingAccountAction =
  | {
      kind: "status";
      schoolId: string;
      schoolName: string;
      actionLabel: string;
      update: Omit<SchoolHeadAccountStatusUpdatePayload, "reason">;
    }
  | {
      kind: "activate";
      schoolId: string;
      schoolName: string;
      actionLabel: string;
    }
  | {
      kind: "reset_password";
      schoolId: string;
      schoolName: string;
      actionLabel: string;
    }
  | {
      kind: "email_change";
      schoolId: string;
      schoolName: string;
      actionLabel: string;
      payload: SchoolHeadAccountPayload;
    }
  | {
      kind: "remove";
      schoolId: string;
      schoolName: string;
      actionLabel: string;
    };

interface UseSchoolHeadAccountActionsOptions {
  isPanelOpen: boolean;
  isSaving: boolean;
  pushToast: (message: string, tone: ToastTone) => void;
  updateSchoolHeadAccountStatus: (
    schoolId: string,
    payload: SchoolHeadAccountStatusUpdatePayload,
  ) => Promise<SchoolHeadAccountStatusUpdateResult>;
  activateSchoolHeadAccount: (
    schoolId: string,
    payload?: { reason?: string | null },
  ) => Promise<SchoolHeadAccountActivationResult>;
  issueSchoolHeadAccountActionVerificationCode: (
    schoolId: string,
    targetStatus: "suspended" | "locked" | "archived" | "deleted" | "password_reset" | "email_change",
  ) => Promise<SchoolHeadAccountActionVerificationCodeResult>;
  issueSchoolHeadSetupLink: (schoolId: string, reason?: string | null) => Promise<SchoolHeadSetupLinkResult>;
  issueSchoolHeadPasswordResetLink: (
    schoolId: string,
    payload: { reason: string; verificationChallengeId: string; verificationCode: string },
  ) => Promise<SchoolHeadPasswordResetLinkResult>;
  upsertSchoolHeadAccountProfile: (
    schoolId: string,
    payload: SchoolHeadAccountPayload,
  ) => Promise<SchoolHeadAccountProfileUpsertResult>;
  removeSchoolHeadAccount: (
    schoolId: string,
    payload: { reason: string; verificationChallengeId: string; verificationCode: string },
  ) => Promise<SchoolHeadAccountRemovalResult>;
}

export interface SchoolHeadAccountActionsApi {
  editingSchoolHeadAccountSchoolId: string | null;
  schoolHeadAccountDraft: SchoolHeadAccountPayload;
  schoolHeadAccountDraftError: string;
  openAccountRowMenuSchoolId: string | null;
  pendingAccountAction: PendingAccountAction | null;
  pendingAccountReason: string;
  pendingAccountReasonError: string;
  pendingAccountVerificationChallenge: SchoolHeadAccountActionVerificationCodeResult | null;
  pendingAccountVerificationCode: string;
  pendingAccountVerificationError: string;
  pendingActionDescription: string;
  pendingActionRequiresVerification: boolean;
  isPendingAccountVerificationSending: boolean;
  isConfirmPendingAccountActionDisabled: boolean;
  accountActionKey: string | null;
  accountRowMenuRef: MutableRefObject<HTMLDivElement | null>;
  pendingAccountReasonRef: MutableRefObject<HTMLTextAreaElement | null>;
  pendingAccountVerificationCodeRef: MutableRefObject<HTMLInputElement | null>;
  beginEditing: (record: SchoolRecord) => void;
  cancelEditing: () => void;
  updateDraftField: (field: "name" | "email", value: string) => void;
  saveProfile: (record: SchoolRecord) => Promise<void>;
  toggleAccountRowMenu: (schoolId: string) => void;
  openPendingAccountAction: (action: PendingAccountAction) => void;
  closePendingAccountAction: () => void;
  updatePendingAccountReason: (value: string) => void;
  updatePendingVerificationCode: (value: string) => void;
  sendPendingAccountVerificationCode: () => Promise<void>;
  confirmPendingAccountAction: () => Promise<void>;
  handleUpdateSchoolHeadAccount: (
    record: SchoolRecord,
    update: Omit<SchoolHeadAccountStatusUpdatePayload, "reason">,
    actionLabel: string,
  ) => void;
  handleIssueSchoolHeadSetupLink: (record: SchoolRecord) => Promise<void>;
  resetPanelState: () => void;
}

const EMPTY_DRAFT: SchoolHeadAccountPayload = {
  name: "",
  email: "",
};

function normalizeActionVerificationCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

function isDeactivationStatus(value: unknown): value is "suspended" | "locked" | "archived" {
  const normalized = String(value ?? "").toLowerCase();
  return normalized === "suspended" || normalized === "locked" || normalized === "archived";
}

function requiresReason(action: PendingAccountAction | null): boolean {
  if (!action) {
    return false;
  }

  return (
    action.kind === "status"
    || action.kind === "remove"
    || action.kind === "reset_password"
    || action.kind === "email_change"
  );
}

function requiresVerification(action: PendingAccountAction | null): boolean {
  if (!action) {
    return false;
  }

  return (
    action.kind === "remove"
    || action.kind === "reset_password"
    || action.kind === "email_change"
    || (action.kind === "status" && isDeactivationStatus(action.update.accountStatus))
  );
}

function verificationTargetForAction(
  action: PendingAccountAction | null,
): "suspended" | "locked" | "archived" | "deleted" | "password_reset" | "email_change" | null {
  if (!action) {
    return null;
  }

  if (action.kind === "remove") {
    return "deleted";
  }

  if (action.kind === "status" && isDeactivationStatus(action.update.accountStatus)) {
    return String(action.update.accountStatus).toLowerCase() as "suspended" | "locked" | "archived";
  }

  if (action.kind === "reset_password") {
    return "password_reset";
  }

  if (action.kind === "email_change") {
    return "email_change";
  }

  return null;
}

function pendingActionDescription(action: PendingAccountAction | null): string {
  if (!action) {
    return "";
  }

  if (action.kind === "remove") {
    return `Reason and confirmation code required to remove the account for ${action.schoolName}.`;
  }

  if (action.kind === "activate") {
    return `Optional activation note for ${action.schoolName}.`;
  }

  if (action.kind === "status") {
    return isDeactivationStatus(action.update.accountStatus)
      ? `Reason and confirmation code required for ${action.schoolName}.`
      : `Reason required for ${action.schoolName}.`;
  }

  if (action.kind === "reset_password") {
    return `Reason and confirmation code required to send a password reset link for ${action.schoolName}.`;
  }

  return `Reason and confirmation code required to change the School Head email for ${action.schoolName}.`;
}

function announceSchoolHeadAccountDelivery(
  receipt: { delivery?: unknown; deliveryMessage?: string | null },
  schoolName: string,
  linkLabel: "Setup link" | "Password reset link",
  pushToast: (message: string, tone: ToastTone) => void,
): void {
  const normalizedDelivery = String(receipt.delivery ?? "").toLowerCase();
  const deliveryFailed = normalizedDelivery === "failed";

  pushToast(
    deliveryFailed
      ? `${linkLabel} was prepared for ${schoolName}, but email delivery failed.`
      : `${linkLabel} email sent for ${schoolName}.`,
    deliveryFailed ? "warning" : "success",
  );

  const deliveryMessage = receipt.deliveryMessage?.trim();
  if (deliveryMessage) {
    pushToast(deliveryMessage, deliveryFailed ? "warning" : "info");
  }
}

export function useSchoolHeadAccountActions({
  isPanelOpen,
  isSaving,
  pushToast,
  updateSchoolHeadAccountStatus,
  activateSchoolHeadAccount,
  issueSchoolHeadAccountActionVerificationCode,
  issueSchoolHeadSetupLink,
  issueSchoolHeadPasswordResetLink,
  upsertSchoolHeadAccountProfile,
  removeSchoolHeadAccount,
}: UseSchoolHeadAccountActionsOptions): SchoolHeadAccountActionsApi {
  const [editingSchoolHeadAccountSchoolId, setEditingSchoolHeadAccountSchoolId] = useState<string | null>(null);
  const [schoolHeadAccountDraft, setSchoolHeadAccountDraft] = useState<SchoolHeadAccountPayload>(EMPTY_DRAFT);
  const [schoolHeadAccountDraftError, setSchoolHeadAccountDraftError] = useState("");
  const [openAccountRowMenuSchoolId, setOpenAccountRowMenuSchoolId] = useState<string | null>(null);
  const [pendingAccountAction, setPendingAccountAction] = useState<PendingAccountAction | null>(null);
  const [pendingAccountReason, setPendingAccountReason] = useState("");
  const [pendingAccountReasonError, setPendingAccountReasonError] = useState("");
  const [pendingAccountVerificationChallenge, setPendingAccountVerificationChallenge] =
    useState<SchoolHeadAccountActionVerificationCodeResult | null>(null);
  const [pendingAccountVerificationCode, setPendingAccountVerificationCode] = useState("");
  const [pendingAccountVerificationError, setPendingAccountVerificationError] = useState("");
  const [isPendingAccountVerificationSending, setIsPendingAccountVerificationSending] = useState(false);
  const [accountActionKey, setAccountActionKey] = useState<string | null>(null);

  const accountRowMenuRef = useRef<HTMLDivElement | null>(null);
  const pendingAccountReasonRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingAccountVerificationCodeRef = useRef<HTMLInputElement | null>(null);

  const closePendingAccountAction = useCallback(() => {
    setPendingAccountAction(null);
    setPendingAccountReason("");
    setPendingAccountReasonError("");
    setPendingAccountVerificationChallenge(null);
    setPendingAccountVerificationCode("");
    setPendingAccountVerificationError("");
  }, []);

  const resetPanelState = useCallback(() => {
    setEditingSchoolHeadAccountSchoolId(null);
    setSchoolHeadAccountDraft(EMPTY_DRAFT);
    setSchoolHeadAccountDraftError("");
    setOpenAccountRowMenuSchoolId(null);
    closePendingAccountAction();
  }, [closePendingAccountAction]);

  useEffect(() => {
    if (isPanelOpen) {
      return;
    }

    setOpenAccountRowMenuSchoolId(null);
    closePendingAccountAction();
  }, [closePendingAccountAction, isPanelOpen]);

  useEffect(() => {
    if (!openAccountRowMenuSchoolId || typeof window === "undefined") {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const menu = accountRowMenuRef.current;
      if (!menu) {
        setOpenAccountRowMenuSchoolId(null);
        return;
      }
      if (menu.contains(event.target as Node)) {
        return;
      }
      setOpenAccountRowMenuSchoolId(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenAccountRowMenuSchoolId(null);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openAccountRowMenuSchoolId]);

  useEffect(() => {
    if (!pendingAccountAction || typeof window === "undefined") {
      return;
    }

    window.setTimeout(() => {
      pendingAccountReasonRef.current?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePendingAccountAction();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closePendingAccountAction, pendingAccountAction]);

  const openPendingAccountAction = useCallback(
    (action: PendingAccountAction) => {
      setOpenAccountRowMenuSchoolId(null);
      setPendingAccountAction(action);
      setPendingAccountReason("");
      setPendingAccountReasonError("");
      setPendingAccountVerificationChallenge(null);
      setPendingAccountVerificationCode("");
      setPendingAccountVerificationError("");
    },
    [],
  );

  const beginEditing = useCallback((record: SchoolRecord) => {
    const account = record.schoolHeadAccount;
    setEditingSchoolHeadAccountSchoolId(record.id);
    setSchoolHeadAccountDraft({
      name: account?.name ?? "",
      email: account?.email ?? "",
    });
    setSchoolHeadAccountDraftError("");
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingSchoolHeadAccountSchoolId(null);
    setSchoolHeadAccountDraftError("");
  }, []);

  const updateDraftField = useCallback((field: "name" | "email", value: string) => {
    setSchoolHeadAccountDraft((current) => ({
      ...current,
      [field]: value,
    }));
    setSchoolHeadAccountDraftError("");
  }, []);

  const updatePendingAccountReason = useCallback((value: string) => {
    setPendingAccountReason(value);
    setPendingAccountReasonError("");
  }, []);

  const updatePendingVerificationCode = useCallback((value: string) => {
    setPendingAccountVerificationCode(normalizeActionVerificationCode(value));
    setPendingAccountVerificationError("");
  }, []);

  const toggleAccountRowMenu = useCallback((schoolId: string) => {
    setOpenAccountRowMenuSchoolId((current) => (current === schoolId ? null : schoolId));
  }, []);

  const sendPendingAccountVerificationCode = useCallback(async () => {
    const targetStatus = verificationTargetForAction(pendingAccountAction);
    if (!pendingAccountAction || !targetStatus) {
      return;
    }

    setIsPendingAccountVerificationSending(true);
    setPendingAccountVerificationError("");
    setPendingAccountVerificationCode("");

    try {
      const result = await issueSchoolHeadAccountActionVerificationCode(pendingAccountAction.schoolId, targetStatus);
      setPendingAccountVerificationChallenge(result);
      pushToast(result.deliveryMessage || "Confirmation code sent.", "info");

      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          pendingAccountVerificationCodeRef.current?.focus();
        }, 0);
      }
    } catch (err) {
      setPendingAccountVerificationError(err instanceof Error ? err.message : "Unable to send confirmation code.");
    } finally {
      setIsPendingAccountVerificationSending(false);
    }
  }, [issueSchoolHeadAccountActionVerificationCode, pendingAccountAction, pushToast]);

  const confirmPendingAccountAction = useCallback(async () => {
    if (!pendingAccountAction) {
      return;
    }

    const reason = pendingAccountReason.trim();
    if (requiresReason(pendingAccountAction) && reason.length < 5) {
      setPendingAccountReasonError("Please provide a reason with at least 5 characters.");
      return;
    }

    const actionKey = `${pendingAccountAction.schoolId}:${pendingAccountAction.actionLabel}`;
    setAccountActionKey(actionKey);
    setPendingAccountReasonError("");
    setPendingAccountVerificationError("");

    try {
      if (pendingAccountAction.kind === "activate") {
        const result = await activateSchoolHeadAccount(pendingAccountAction.schoolId, {
          reason: reason || undefined,
        });
        pushToast(result.message || `School Head account activated for ${pendingAccountAction.schoolName}.`, "success");
        closePendingAccountAction();
        return;
      }

      if (pendingAccountAction.kind === "status") {
        if (isDeactivationStatus(pendingAccountAction.update.accountStatus)) {
          const challengeId = pendingAccountVerificationChallenge?.challengeId ?? "";
          const code = pendingAccountVerificationCode.trim();

          if (!challengeId) {
            setPendingAccountVerificationError("Send the 6-digit confirmation code first.");
            return;
          }

          if (!/^\d{6}$/.test(code)) {
            setPendingAccountVerificationError("Enter the 6-digit confirmation code.");
            return;
          }

          const result = await updateSchoolHeadAccountStatus(pendingAccountAction.schoolId, {
            ...pendingAccountAction.update,
            reason,
            verificationChallengeId: challengeId,
            verificationCode: code,
          });
          pushToast(result.message || `School Head account updated for ${pendingAccountAction.schoolName}.`, "success");
          closePendingAccountAction();
          return;
        }

        const result = await updateSchoolHeadAccountStatus(pendingAccountAction.schoolId, {
          ...pendingAccountAction.update,
          reason,
        });
        pushToast(result.message || `School Head account updated for ${pendingAccountAction.schoolName}.`, "success");
        closePendingAccountAction();
        return;
      }

      if (pendingAccountAction.kind === "remove") {
        const challengeId = pendingAccountVerificationChallenge?.challengeId ?? "";
        const code = pendingAccountVerificationCode.trim();

        if (!challengeId) {
          setPendingAccountVerificationError("Send the 6-digit confirmation code first.");
          return;
        }

        if (!/^\d{6}$/.test(code)) {
          setPendingAccountVerificationError("Enter the 6-digit confirmation code.");
          return;
        }

        const result = await removeSchoolHeadAccount(pendingAccountAction.schoolId, {
          reason,
          verificationChallengeId: challengeId,
          verificationCode: code,
        });
        pushToast(result.message || `School Head account removed for ${pendingAccountAction.schoolName}.`, "success");
        closePendingAccountAction();
        return;
      }

      if (pendingAccountAction.kind === "reset_password") {
        const challengeId = pendingAccountVerificationChallenge?.challengeId ?? "";
        const code = pendingAccountVerificationCode.trim();

        if (!challengeId) {
          setPendingAccountVerificationError("Send the 6-digit confirmation code first.");
          return;
        }

        if (!/^\d{6}$/.test(code)) {
          setPendingAccountVerificationError("Enter the 6-digit confirmation code.");
          return;
        }

        const receipt = await issueSchoolHeadPasswordResetLink(pendingAccountAction.schoolId, {
          reason,
          verificationChallengeId: challengeId,
          verificationCode: code,
        });
        announceSchoolHeadAccountDelivery(receipt, pendingAccountAction.schoolName, "Password reset link", pushToast);
        closePendingAccountAction();
        return;
      }

      const challengeId = pendingAccountVerificationChallenge?.challengeId ?? "";
      const code = pendingAccountVerificationCode.trim();

      if (!challengeId) {
        setPendingAccountVerificationError("Send the 6-digit confirmation code first.");
        return;
      }

      if (!/^\d{6}$/.test(code)) {
        setPendingAccountVerificationError("Enter the 6-digit confirmation code.");
        return;
      }

      const result = await upsertSchoolHeadAccountProfile(pendingAccountAction.schoolId, {
        ...pendingAccountAction.payload,
        reason,
        verificationChallengeId: challengeId,
        verificationCode: code,
      });
      pushToast(result.message || `School Head account saved for ${pendingAccountAction.schoolName}.`, "success");
      setEditingSchoolHeadAccountSchoolId(null);
      closePendingAccountAction();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to complete account action.";
      if (requiresVerification(pendingAccountAction)) {
        setPendingAccountVerificationError(message);
      } else {
        setPendingAccountReasonError(message);
      }
    } finally {
      setAccountActionKey(null);
    }
  }, [
    closePendingAccountAction,
    issueSchoolHeadPasswordResetLink,
    pendingAccountAction,
    pendingAccountReason,
    pendingAccountVerificationChallenge,
    pendingAccountVerificationCode,
    pushToast,
    removeSchoolHeadAccount,
    activateSchoolHeadAccount,
    updateSchoolHeadAccountStatus,
    upsertSchoolHeadAccountProfile,
  ]);

  const handleUpdateSchoolHeadAccount = useCallback(
    (
      record: SchoolRecord,
      update: Omit<SchoolHeadAccountStatusUpdatePayload, "reason">,
      actionLabel: string,
    ) => {
      const account = record.schoolHeadAccount;
      if (!account) {
        pushToast(`No School Head account is linked to ${record.schoolName}.`, "warning");
        return;
      }

      openPendingAccountAction({
        kind: "status",
        schoolId: record.id,
        schoolName: record.schoolName,
        actionLabel,
        update,
      });
    },
    [openPendingAccountAction, pushToast],
  );

  const handleIssueSchoolHeadSetupLink = useCallback(
    async (record: SchoolRecord) => {
      const account = record.schoolHeadAccount;
      if (!account) {
        pushToast(`No School Head account is linked to ${record.schoolName}.`, "warning");
        return;
      }

      const accountStatus = String(account.accountStatus ?? "").toLowerCase();
      if (accountStatus !== "pending_setup") {
        openPendingAccountAction({
          kind: "reset_password",
          schoolId: record.id,
          schoolName: record.schoolName,
          actionLabel: "Send Password Reset Link",
        });
        return;
      }

      const actionKey = `${record.id}:setup-link`;
      setAccountActionKey(actionKey);
      try {
        const receipt = await issueSchoolHeadSetupLink(record.id, null);
        announceSchoolHeadAccountDelivery(receipt, record.schoolName, "Setup link", pushToast);
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Unable to send setup link.", "warning");
      } finally {
        setAccountActionKey(null);
      }
    },
    [issueSchoolHeadSetupLink, openPendingAccountAction, pushToast],
  );

  const saveProfile = useCallback(
    async (record: SchoolRecord) => {
      const account = record.schoolHeadAccount;
      const name = schoolHeadAccountDraft.name.trim();
      const email = schoolHeadAccountDraft.email.trim();
      if (!name || !email) {
        setSchoolHeadAccountDraftError("Account name and email are required.");
        return;
      }

      const previousEmail = (account?.email ?? "").trim().toLowerCase();
      const nextEmail = email.toLowerCase();
      if (account && previousEmail && previousEmail !== nextEmail) {
        setSchoolHeadAccountDraftError("");
        openPendingAccountAction({
          kind: "email_change",
          schoolId: record.id,
          schoolName: record.schoolName,
          actionLabel: "Confirm Email Change",
          payload: {
            name,
            email: nextEmail,
          },
        });
        return;
      }

      const actionKey = `${record.id}:profile`;
      setAccountActionKey(actionKey);
      setSchoolHeadAccountDraftError("");
      try {
        const result = await upsertSchoolHeadAccountProfile(record.id, {
          name,
          email: nextEmail,
        });
        pushToast(result.message || "School Head account saved.", "success");
        setEditingSchoolHeadAccountSchoolId(null);
      } catch (err) {
        setSchoolHeadAccountDraftError(
          err instanceof Error ? err.message : "Unable to save School Head account.",
        );
      } finally {
        setAccountActionKey(null);
      }
    },
    [openPendingAccountAction, pushToast, schoolHeadAccountDraft.email, schoolHeadAccountDraft.name, upsertSchoolHeadAccountProfile],
  );

  const pendingActionRequiresVerification = requiresVerification(pendingAccountAction);
  const isConfirmPendingAccountActionDisabled = Boolean(
    isSaving
    || isPendingAccountVerificationSending
    || (requiresReason(pendingAccountAction) && pendingAccountReason.trim().length < 5)
    || (
      pendingActionRequiresVerification
      && (!pendingAccountVerificationChallenge || !/^\d{6}$/.test(pendingAccountVerificationCode.trim()))
    )
  );

  return {
    editingSchoolHeadAccountSchoolId,
    schoolHeadAccountDraft,
    schoolHeadAccountDraftError,
    openAccountRowMenuSchoolId,
    pendingAccountAction,
    pendingAccountReason,
    pendingAccountReasonError,
    pendingAccountVerificationChallenge,
    pendingAccountVerificationCode,
    pendingAccountVerificationError,
    pendingActionDescription: pendingActionDescription(pendingAccountAction),
    pendingActionRequiresVerification,
    isPendingAccountVerificationSending,
    isConfirmPendingAccountActionDisabled,
    accountActionKey,
    accountRowMenuRef,
    pendingAccountReasonRef,
    pendingAccountVerificationCodeRef,
    beginEditing,
    cancelEditing,
    updateDraftField,
    saveProfile,
    toggleAccountRowMenu,
    openPendingAccountAction,
    closePendingAccountAction,
    updatePendingAccountReason,
    updatePendingVerificationCode,
    sendPendingAccountVerificationCode,
    confirmPendingAccountAction,
    handleUpdateSchoolHeadAccount,
    handleIssueSchoolHeadSetupLink,
    resetPanelState,
  };
}
