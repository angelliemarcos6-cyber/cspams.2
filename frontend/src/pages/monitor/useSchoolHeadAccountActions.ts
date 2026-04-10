import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  ACCOUNT_STATUS,
  ALLOWED_ACTION,
  SCHOOL_HEAD_ACCOUNT_ACTION_VERIFICATION_TARGET,
  type AccountActionPhase,
  type AccountStatus,
  type AllowedAction,
  type SchoolHeadAccountActionVerificationTarget,
  type SchoolHeadAccountActivationResult,
  type SchoolHeadAccountActionVerificationCodeResult,
  type SchoolHeadAccountPayload,
  type SchoolHeadAccountProfileUpsertResult,
  type SchoolHeadAccountRemovalResult,
  type SchoolHeadAccountRestoreResult,
  type SchoolHeadAccountStatusUpdatePayload,
  type SchoolHeadAccountStatusUpdateResult,
  type SchoolHeadPasswordResetLinkResult,
  type SchoolHeadSetupLinkResult,
  type SchoolRecord,
} from "@/types";
import {
  assertActionAllowed,
  getAllowedActionConfig,
  normalizeAccountStatus,
  resolveAllowedActions,
} from "./schoolHeadAccountStateMachine";

type ToastTone = "success" | "info" | "warning";

interface AccountActionState {
  key: string | null;
  phase: AccountActionPhase;
  message: string;
}

export interface LifecycleActionState {
  disabled: boolean;
  label: string;
  phase: AccountActionPhase;
}

export type PendingAccountAction =
  | {
      kind: "lifecycle";
      schoolId: string;
      schoolName: string;
      accountStatus: AccountStatus;
      action: AllowedAction;
    }
  | {
      kind: "status";
      schoolId: string;
      schoolName: string;
      actionLabel: string;
      update: Omit<SchoolHeadAccountStatusUpdatePayload, "reason">;
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
  findRecordById: (schoolId: string) => SchoolRecord | null;
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
    targetStatus: SchoolHeadAccountActionVerificationTarget,
  ) => Promise<SchoolHeadAccountActionVerificationCodeResult>;
  issueSchoolHeadSetupLink: (schoolId: string, reason?: string | null) => Promise<SchoolHeadSetupLinkResult>;
  recoverSchoolHeadSetupLink: (
    schoolId: string,
    payload: { reason: string; verificationChallengeId: string; verificationCode: string },
  ) => Promise<SchoolHeadAccountRestoreResult>;
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
  pendingAccountReasonLabel: string;
  pendingAccountReasonPlaceholder: string;
  pendingAccountVerificationChallenge: SchoolHeadAccountActionVerificationCodeResult | null;
  pendingAccountVerificationCode: string;
  pendingAccountVerificationError: string;
  pendingActionDescription: string;
  pendingActionRequiresVerification: boolean;
  pendingActionConfirmLabel: string;
  pendingActionPhase: AccountActionPhase;
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
  closePendingAccountAction: () => void;
  updatePendingAccountReason: (value: string) => void;
  updatePendingVerificationCode: (value: string) => void;
  sendPendingAccountVerificationCode: () => Promise<void>;
  confirmPendingAccountAction: () => Promise<void>;
  resolveLifecycleActions: (record: SchoolRecord) => AllowedAction[];
  getLifecycleActionState: (schoolId: string, action: AllowedAction) => LifecycleActionState;
  handleLifecycleAction: (record: SchoolRecord, action: AllowedAction) => Promise<void>;
  getLifecycleActionLabel: (action: AllowedAction) => string;
  openRemoveAccountAction: (record: SchoolRecord) => void;
  handleUpdateSchoolHeadAccount: (
    record: SchoolRecord,
    update: Omit<SchoolHeadAccountStatusUpdatePayload, "reason">,
    actionLabel: string,
  ) => void;
  resetPanelState: () => void;
}

const EMPTY_DRAFT: SchoolHeadAccountPayload = {
  name: "",
  email: "",
};

const EMPTY_ACTION_STATE: AccountActionState = {
  key: null,
  phase: "idle",
  message: "",
};

function assertUnexpectedValue(value: never, context: string): never {
  throw new Error(`${context}: ${String(value)}`);
}

function normalizeActionVerificationCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

function isDeactivationStatus(
  value: unknown,
): value is typeof ACCOUNT_STATUS.suspended | typeof ACCOUNT_STATUS.locked | typeof ACCOUNT_STATUS.archived {
  const normalized = String(value ?? "").toLowerCase();
  return (
    normalized === ACCOUNT_STATUS.suspended
    || normalized === ACCOUNT_STATUS.locked
    || normalized === ACCOUNT_STATUS.archived
  );
}

function buildLifecycleActionKey(schoolId: string, action: AllowedAction): string {
  return `${schoolId}:lifecycle:${action}`;
}

function buildPendingActionKey(action: PendingAccountAction): string {
  switch (action.kind) {
    case "lifecycle":
      return buildLifecycleActionKey(action.schoolId, action.action);
    case "status":
      return `${action.schoolId}:status:${action.actionLabel}`;
    case "email_change":
      return `${action.schoolId}:email-change`;
    case "remove":
      return `${action.schoolId}:remove`;
    default:
      return assertUnexpectedValue(action, "Unhandled pending action key");
  }
}

function requiresReason(action: PendingAccountAction | null): boolean {
  if (!action) {
    return false;
  }

  switch (action.kind) {
    case "lifecycle":
      return getAllowedActionConfig(action.action).requiresReason;
    case "status":
    case "remove":
    case "email_change":
      return true;
    default:
      return assertUnexpectedValue(action, "Unhandled pending action reason rule");
  }
}

function requiresVerification(action: PendingAccountAction | null): boolean {
  if (!action) {
    return false;
  }

  switch (action.kind) {
    case "lifecycle":
      return getAllowedActionConfig(action.action).requiresVerification;
    case "remove":
    case "email_change":
      return true;
    case "status":
      return isDeactivationStatus(action.update.accountStatus);
    default:
      return assertUnexpectedValue(action, "Unhandled pending action verification rule");
  }
}

function verificationTargetForAction(
  action: PendingAccountAction | null,
): SchoolHeadAccountActionVerificationTarget | null {
  if (!action) {
    return null;
  }

  switch (action.kind) {
    case "lifecycle":
      return getAllowedActionConfig(action.action).verificationTarget;
    case "remove":
      return SCHOOL_HEAD_ACCOUNT_ACTION_VERIFICATION_TARGET.deleted;
    case "email_change":
      return SCHOOL_HEAD_ACCOUNT_ACTION_VERIFICATION_TARGET.emailChange;
    case "status":
      return isDeactivationStatus(action.update.accountStatus)
        ? action.update.accountStatus
        : null;
    default:
      return assertUnexpectedValue(action, "Unhandled pending action verification target");
  }
}

function pendingActionDescription(action: PendingAccountAction | null): string {
  if (!action) {
    return "";
  }

  switch (action.kind) {
    case "lifecycle":
      return getAllowedActionConfig(action.action).description(action.schoolName);
    case "remove":
      return `Reason and confirmation code required to remove the account for ${action.schoolName}.`;
    case "status":
      return isDeactivationStatus(action.update.accountStatus)
        ? `Reason and confirmation code required for ${action.schoolName}.`
        : `Reason required for ${action.schoolName}.`;
    case "email_change":
      return `Reason and confirmation code required to change the School Head email for ${action.schoolName}.`;
    default:
      return assertUnexpectedValue(action, "Unhandled pending action description");
  }
}

function pendingActionReasonLabel(action: PendingAccountAction | null): string {
  if (!action) {
    return "Reason";
  }

  switch (action.kind) {
    case "lifecycle":
      return getAllowedActionConfig(action.action).reasonLabel;
    default:
      return "Reason";
  }
}

function pendingActionReasonPlaceholder(action: PendingAccountAction | null): string {
  if (!action) {
    return "Type a short reason (min 5 characters)";
  }

  switch (action.kind) {
    case "lifecycle": {
      const config = getAllowedActionConfig(action.action);
      return config.reasonPlaceholder || "Type a short reason (min 5 characters)";
    }
    default:
      return "Type a short reason (min 5 characters)";
  }
}

function pendingActionConfirmLabel(action: PendingAccountAction | null, phase: AccountActionPhase): string {
  if (!action) {
    return "Confirm";
  }

  switch (action.kind) {
    case "lifecycle": {
      const config = getAllowedActionConfig(action.action);
      return phase === "loading" ? config.loadingLabel : config.confirmLabel;
    }
    default:
      return phase === "loading" ? "Saving..." : "Confirm";
  }
}

function announceSchoolHeadAccountDelivery(
  receipt: { delivery?: unknown; deliveryMessage?: string | null },
  schoolName: string,
  linkLabel: "Setup link" | "Password reset link",
  pushToast: (message: string, tone: ToastTone) => void,
  successMessage?: string,
): void {
  const normalizedDelivery = String(receipt.delivery ?? "").toLowerCase();
  const deliveryFailed = normalizedDelivery === "failed";

  pushToast(
    successMessage
      ?? (deliveryFailed
        ? `${linkLabel} was prepared for ${schoolName}, but email delivery failed.`
        : `${linkLabel} email sent for ${schoolName}.`),
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
  findRecordById,
  updateSchoolHeadAccountStatus,
  activateSchoolHeadAccount,
  issueSchoolHeadAccountActionVerificationCode,
  issueSchoolHeadSetupLink,
  recoverSchoolHeadSetupLink,
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
  const [accountActionState, setAccountActionState] = useState<AccountActionState>(EMPTY_ACTION_STATE);

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
    setAccountActionKey(null);
    setAccountActionState(EMPTY_ACTION_STATE);
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

  // FSM CHANGE: re-check the latest account status before every lifecycle transition or verification request.
  const resolveCurrentLifecycleStatus = useCallback(
    (schoolId: string): AccountStatus => {
      const record = findRecordById(schoolId);
      const account = record?.schoolHeadAccount ?? null;
      if (!record || !account) {
        throw new Error("No School Head account is linked to this school.");
      }

      const accountStatus = normalizeAccountStatus(account.accountStatus);
      if (!accountStatus) {
        throw new Error("School Head account has an unsupported status.");
      }

      return accountStatus;
    },
    [findRecordById],
  );

  const assertLifecycleActionAllowedForSchool = useCallback(
    (schoolId: string, action: AllowedAction): AccountStatus => {
      const accountStatus = resolveCurrentLifecycleStatus(schoolId);
      assertActionAllowed(accountStatus, action);
      return accountStatus;
    },
    [resolveCurrentLifecycleStatus],
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

  // FSM CHANGE: the UI can only render lifecycle actions resolved from the centralized state map.
  const resolveLifecycleActionsForRecord = useCallback((record: SchoolRecord): AllowedAction[] => {
    const account = record.schoolHeadAccount ?? null;
    if (!account) {
      return [];
    }

    const accountStatus = normalizeAccountStatus(account.accountStatus);
    if (!accountStatus) {
      return [];
    }

    return resolveAllowedActions(accountStatus);
  }, []);

  const getLifecycleActionLabel = useCallback((action: AllowedAction): string => {
    return getAllowedActionConfig(action).buttonLabel;
  }, []);

  const getLifecycleActionState = useCallback(
    (schoolId: string, action: AllowedAction): LifecycleActionState => {
      const key = buildLifecycleActionKey(schoolId, action);
      const phase = accountActionState.key === key ? accountActionState.phase : "idle";

      return {
        disabled: isSaving || Boolean(accountActionKey?.startsWith(`${schoolId}:`)),
        label: phase === "loading" ? getAllowedActionConfig(action).loadingLabel : getAllowedActionConfig(action).buttonLabel,
        phase,
      };
    },
    [accountActionKey, accountActionState, isSaving],
  );

  const openPendingAccountAction = useCallback((action: PendingAccountAction) => {
    setOpenAccountRowMenuSchoolId(null);
    setPendingAccountAction(action);
    setPendingAccountReason("");
    setPendingAccountReasonError("");
    setPendingAccountVerificationChallenge(null);
    setPendingAccountVerificationCode("");
    setPendingAccountVerificationError("");
  }, []);

  const executeImmediateLifecycleAction = useCallback(
    async (record: SchoolRecord, action: AllowedAction) => {
      const actionKey = buildLifecycleActionKey(record.id, action);
      setAccountActionKey(actionKey);
      setAccountActionState({
        key: actionKey,
        phase: "loading",
        message: "",
      });

      try {
        assertLifecycleActionAllowedForSchool(record.id, action);

        switch (action) {
          case ALLOWED_ACTION.resendSetupLink: {
            const receipt = await issueSchoolHeadSetupLink(record.id, null);
            announceSchoolHeadAccountDelivery(receipt, record.schoolName, "Setup link", pushToast);
            setAccountActionState({
              key: actionKey,
              phase: "success",
              message: "Setup link sent.",
            });
            return;
          }
          default:
            throw new Error("This account action requires confirmation.");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to complete account action.";
        pushToast(message, "warning");
        setAccountActionState({
          key: actionKey,
          phase: "failure",
          message,
        });
      } finally {
        setAccountActionKey(null);
      }
    },
    [assertLifecycleActionAllowedForSchool, issueSchoolHeadSetupLink, pushToast],
  );

  const handleLifecycleAction = useCallback(
    async (record: SchoolRecord, action: AllowedAction) => {
      try {
        const accountStatus = assertLifecycleActionAllowedForSchool(record.id, action);
        const config = getAllowedActionConfig(action);

        if (config.executionMode === "immediate") {
          await executeImmediateLifecycleAction(record, action);
          return;
        }

        openPendingAccountAction({
          kind: "lifecycle",
          schoolId: record.id,
          schoolName: record.schoolName,
          accountStatus,
          action,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to resolve the next account action.";
        pushToast(message, "warning");
      }
    },
    [assertLifecycleActionAllowedForSchool, executeImmediateLifecycleAction, openPendingAccountAction, pushToast],
  );

  const sendPendingAccountVerificationCode = useCallback(async () => {
    const targetStatus = verificationTargetForAction(pendingAccountAction);
    if (!pendingAccountAction || !targetStatus) {
      return;
    }

    if (pendingAccountAction.kind === "lifecycle") {
      try {
        assertLifecycleActionAllowedForSchool(pendingAccountAction.schoolId, pendingAccountAction.action);
      } catch (err) {
        setPendingAccountVerificationError(
          err instanceof Error ? err.message : "This verification step is no longer valid.",
        );
        return;
      }
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
      const message = err instanceof Error ? err.message : "Unable to send confirmation code.";
      setPendingAccountVerificationError(message);
    } finally {
      setIsPendingAccountVerificationSending(false);
    }
  }, [assertLifecycleActionAllowedForSchool, issueSchoolHeadAccountActionVerificationCode, pendingAccountAction, pushToast]);

  const confirmPendingAccountAction = useCallback(async () => {
    if (!pendingAccountAction) {
      return;
    }

    const reason = pendingAccountReason.trim();
    if (requiresReason(pendingAccountAction) && reason.length < 5) {
      setPendingAccountReasonError("Please provide a reason with at least 5 characters.");
      return;
    }

    const actionKey = buildPendingActionKey(pendingAccountAction);
    setAccountActionKey(actionKey);
    setAccountActionState({
      key: actionKey,
      phase: "loading",
      message: "",
    });
    setPendingAccountReasonError("");
    setPendingAccountVerificationError("");

    try {
      if (pendingAccountAction.kind === "lifecycle") {
        assertLifecycleActionAllowedForSchool(pendingAccountAction.schoolId, pendingAccountAction.action);

        const config = getAllowedActionConfig(pendingAccountAction.action);
        const challengeId = pendingAccountVerificationChallenge?.challengeId?.trim() ?? "";
        const code = pendingAccountVerificationCode.trim();

        if (config.requiresVerification) {
          if (!challengeId) {
            setPendingAccountVerificationError("Send the 6-digit confirmation code first.");
            setAccountActionState(EMPTY_ACTION_STATE);
            return;
          }

          if (!/^\d{6}$/.test(code)) {
            setPendingAccountVerificationError("Enter the 6-digit confirmation code.");
            setAccountActionState(EMPTY_ACTION_STATE);
            return;
          }
        }

        switch (pendingAccountAction.action) {
          case ALLOWED_ACTION.activateAccount: {
            const result = await activateSchoolHeadAccount(pendingAccountAction.schoolId, {
              reason: reason || undefined,
            });
            pushToast(result.message || `School Head account activated for ${pendingAccountAction.schoolName}.`, "success");
            setAccountActionState({
              key: actionKey,
              phase: "success",
              message: result.message || "Account activated.",
            });
            closePendingAccountAction();
            return;
          }
          case ALLOWED_ACTION.resetPassword: {
            const receipt = await issueSchoolHeadPasswordResetLink(pendingAccountAction.schoolId, {
              reason,
              verificationChallengeId: challengeId,
              verificationCode: code,
            });
            announceSchoolHeadAccountDelivery(
              receipt,
              pendingAccountAction.schoolName,
              "Password reset link",
              pushToast,
            );
            setAccountActionState({
              key: actionKey,
              phase: "success",
              message: "Password reset link sent.",
            });
            closePendingAccountAction();
            return;
          }
          case ALLOWED_ACTION.reactivateAccount: {
            const result = await updateSchoolHeadAccountStatus(pendingAccountAction.schoolId, {
              accountStatus: ACCOUNT_STATUS.active,
              reason,
            });
            pushToast(result.message || `School Head account reactivated for ${pendingAccountAction.schoolName}.`, "success");
            setAccountActionState({
              key: actionKey,
              phase: "success",
              message: result.message || "Account reactivated.",
            });
            closePendingAccountAction();
            return;
          }
          case ALLOWED_ACTION.restoreAccount: {
            const result = await recoverSchoolHeadSetupLink(pendingAccountAction.schoolId, {
              reason,
              verificationChallengeId: challengeId,
              verificationCode: code,
            });
            announceSchoolHeadAccountDelivery(
              result,
              pendingAccountAction.schoolName,
              "Setup link",
              pushToast,
              result.message || `Archived account restored for ${pendingAccountAction.schoolName}.`,
            );
            setAccountActionState({
              key: actionKey,
              phase: "success",
              message: result.message || "Account restored.",
            });
            closePendingAccountAction();
            return;
          }
          case ALLOWED_ACTION.resendSetupLink:
            throw new Error("Setup link actions are sent directly from the row action button.");
          default:
            return assertUnexpectedValue(pendingAccountAction.action, "Unhandled lifecycle action");
        }
      }

      if (pendingAccountAction.kind === "status") {
        if (isDeactivationStatus(pendingAccountAction.update.accountStatus)) {
          const challengeId = pendingAccountVerificationChallenge?.challengeId ?? "";
          const code = pendingAccountVerificationCode.trim();

          if (!challengeId) {
            setPendingAccountVerificationError("Send the 6-digit confirmation code first.");
            setAccountActionState(EMPTY_ACTION_STATE);
            return;
          }

          if (!/^\d{6}$/.test(code)) {
            setPendingAccountVerificationError("Enter the 6-digit confirmation code.");
            setAccountActionState(EMPTY_ACTION_STATE);
            return;
          }

          const result = await updateSchoolHeadAccountStatus(pendingAccountAction.schoolId, {
            ...pendingAccountAction.update,
            reason,
            verificationChallengeId: challengeId,
            verificationCode: code,
          });
          pushToast(result.message || `School Head account updated for ${pendingAccountAction.schoolName}.`, "success");
          setAccountActionState({
            key: actionKey,
            phase: "success",
            message: result.message || "Account updated.",
          });
          closePendingAccountAction();
          return;
        }

        const result = await updateSchoolHeadAccountStatus(pendingAccountAction.schoolId, {
          ...pendingAccountAction.update,
          reason,
        });
        pushToast(result.message || `School Head account updated for ${pendingAccountAction.schoolName}.`, "success");
        setAccountActionState({
          key: actionKey,
          phase: "success",
          message: result.message || "Account updated.",
        });
        closePendingAccountAction();
        return;
      }

      if (pendingAccountAction.kind === "remove") {
        const challengeId = pendingAccountVerificationChallenge?.challengeId ?? "";
        const code = pendingAccountVerificationCode.trim();

        if (!challengeId) {
          setPendingAccountVerificationError("Send the 6-digit confirmation code first.");
          setAccountActionState(EMPTY_ACTION_STATE);
          return;
        }

        if (!/^\d{6}$/.test(code)) {
          setPendingAccountVerificationError("Enter the 6-digit confirmation code.");
          setAccountActionState(EMPTY_ACTION_STATE);
          return;
        }

        const result = await removeSchoolHeadAccount(pendingAccountAction.schoolId, {
          reason,
          verificationChallengeId: challengeId,
          verificationCode: code,
        });
        pushToast(result.message || `School Head account removed for ${pendingAccountAction.schoolName}.`, "success");
        setAccountActionState({
          key: actionKey,
          phase: "success",
          message: result.message || "Account removed.",
        });
        closePendingAccountAction();
        return;
      }

      const challengeId = pendingAccountVerificationChallenge?.challengeId ?? "";
      const code = pendingAccountVerificationCode.trim();

      if (!challengeId) {
        setPendingAccountVerificationError("Send the 6-digit confirmation code first.");
        setAccountActionState(EMPTY_ACTION_STATE);
        return;
      }

      if (!/^\d{6}$/.test(code)) {
        setPendingAccountVerificationError("Enter the 6-digit confirmation code.");
        setAccountActionState(EMPTY_ACTION_STATE);
        return;
      }

      const result = await upsertSchoolHeadAccountProfile(pendingAccountAction.schoolId, {
        ...pendingAccountAction.payload,
        reason,
        verificationChallengeId: challengeId,
        verificationCode: code,
      });
      pushToast(result.message || `School Head account saved for ${pendingAccountAction.schoolName}.`, "success");
      setAccountActionState({
        key: actionKey,
        phase: "success",
        message: result.message || "Account saved.",
      });
      setEditingSchoolHeadAccountSchoolId(null);
      closePendingAccountAction();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to complete account action.";
      if (requiresVerification(pendingAccountAction)) {
        setPendingAccountVerificationError(message);
      } else {
        setPendingAccountReasonError(message);
      }
      setAccountActionState({
        key: actionKey,
        phase: "failure",
        message,
      });
    } finally {
      setAccountActionKey(null);
    }
  }, [
    activateSchoolHeadAccount,
    assertLifecycleActionAllowedForSchool,
    closePendingAccountAction,
    pendingAccountAction,
    pendingAccountReason,
    pendingAccountVerificationChallenge,
    pendingAccountVerificationCode,
    pushToast,
    recoverSchoolHeadSetupLink,
    removeSchoolHeadAccount,
    issueSchoolHeadPasswordResetLink,
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

  const openRemoveAccountAction = useCallback(
    (record: SchoolRecord) => {
      const account = record.schoolHeadAccount;
      if (!account) {
        pushToast(`No School Head account is linked to ${record.schoolName}.`, "warning");
        return;
      }

      openPendingAccountAction({
        kind: "remove",
        schoolId: record.id,
        schoolName: record.schoolName,
        actionLabel: "Remove account",
      });
    },
    [openPendingAccountAction, pushToast],
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
      setAccountActionState({
        key: actionKey,
        phase: "loading",
        message: "",
      });
      setSchoolHeadAccountDraftError("");
      try {
        const result = await upsertSchoolHeadAccountProfile(record.id, {
          name,
          email: nextEmail,
        });
        pushToast(result.message || "School Head account saved.", "success");
        setAccountActionState({
          key: actionKey,
          phase: "success",
          message: result.message || "Account saved.",
        });
        setEditingSchoolHeadAccountSchoolId(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to save School Head account.";
        setSchoolHeadAccountDraftError(message);
        setAccountActionState({
          key: actionKey,
          phase: "failure",
          message,
        });
      } finally {
        setAccountActionKey(null);
      }
    },
    [openPendingAccountAction, pushToast, schoolHeadAccountDraft.email, schoolHeadAccountDraft.name, upsertSchoolHeadAccountProfile],
  );

  const pendingActionRequiresVerification = requiresVerification(pendingAccountAction);
  const pendingActionKey = pendingAccountAction ? buildPendingActionKey(pendingAccountAction) : null;
  const pendingActionPhase = pendingActionKey && accountActionState.key === pendingActionKey
    ? accountActionState.phase
    : "idle";
  const isConfirmPendingAccountActionDisabled = Boolean(
    isSaving
    || isPendingAccountVerificationSending
    || pendingActionPhase === "loading"
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
    pendingAccountReasonLabel: pendingActionReasonLabel(pendingAccountAction),
    pendingAccountReasonPlaceholder: pendingActionReasonPlaceholder(pendingAccountAction),
    pendingAccountVerificationChallenge,
    pendingAccountVerificationCode,
    pendingAccountVerificationError,
    pendingActionDescription: pendingActionDescription(pendingAccountAction),
    pendingActionRequiresVerification,
    pendingActionConfirmLabel: pendingActionConfirmLabel(pendingAccountAction, pendingActionPhase),
    pendingActionPhase,
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
    closePendingAccountAction,
    updatePendingAccountReason,
    updatePendingVerificationCode,
    sendPendingAccountVerificationCode,
    confirmPendingAccountAction,
    resolveLifecycleActions: resolveLifecycleActionsForRecord,
    getLifecycleActionState,
    handleLifecycleAction,
    getLifecycleActionLabel,
    openRemoveAccountAction,
    handleUpdateSchoolHeadAccount,
    resetPanelState,
  };
}
