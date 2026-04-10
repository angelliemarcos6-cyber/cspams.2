import {
  ACCOUNT_STATUS,
  ALLOWED_ACTION,
  SCHOOL_HEAD_ACCOUNT_ACTION_VERIFICATION_TARGET,
  type AccountStatus,
  type AllowedAction,
  type SchoolHeadAccountActionVerificationTarget,
} from "@/types";

function assertNever(value: never, context: string): never {
  throw new Error(`${context}: ${String(value)}`);
}

const ACCOUNT_STATUS_VALUES = Object.values(ACCOUNT_STATUS) as AccountStatus[];

export function isAccountStatus(value: unknown): value is AccountStatus {
  return typeof value === "string" && ACCOUNT_STATUS_VALUES.includes(value as AccountStatus);
}

export function normalizeAccountStatus(value: unknown): AccountStatus | null {
  return isAccountStatus(value) ? value : null;
}

// FSM CHANGE: strict state-to-action map. Missing states fail at compile time.
export const ACCOUNT_ACTIONS = {
  [ACCOUNT_STATUS.pendingSetup]: [ALLOWED_ACTION.resendSetupLink],
  [ACCOUNT_STATUS.pendingVerification]: [ALLOWED_ACTION.activateAccount],
  [ACCOUNT_STATUS.active]: [ALLOWED_ACTION.resetPassword],
  [ACCOUNT_STATUS.suspended]: [ALLOWED_ACTION.reactivateAccount],
  [ACCOUNT_STATUS.locked]: [ALLOWED_ACTION.reactivateAccount],
  [ACCOUNT_STATUS.archived]: [ALLOWED_ACTION.restoreAccount],
} as const satisfies Record<AccountStatus, readonly AllowedAction[]>;

export function resolveAllowedActions(accountStatus: AccountStatus): AllowedAction[] {
  return [...ACCOUNT_ACTIONS[accountStatus]];
}

export function getAccountStatusLabel(accountStatus: AccountStatus): string {
  switch (accountStatus) {
    case ACCOUNT_STATUS.pendingSetup:
      return "Pending Setup";
    case ACCOUNT_STATUS.pendingVerification:
      return "Pending Verification";
    case ACCOUNT_STATUS.active:
      return "Active";
    case ACCOUNT_STATUS.suspended:
      return "Suspended";
    case ACCOUNT_STATUS.locked:
      return "Locked";
    case ACCOUNT_STATUS.archived:
      return "Archived";
    default:
      return assertNever(accountStatus, "Unhandled account status label");
  }
}

export interface AllowedActionConfig {
  actionLabel: string;
  buttonLabel: string;
  loadingLabel: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  confirmLabel: string;
  executionMode: "immediate" | "dialog";
  requiresReason: boolean;
  requiresVerification: boolean;
  verificationTarget: SchoolHeadAccountActionVerificationTarget | null;
  deliveryLabel: "Setup link" | "Password reset link" | null;
  description: (schoolName: string) => string;
}

// FSM CHANGE: single source of truth for every allowed lifecycle action.
export const ALLOWED_ACTION_CONFIG: Record<AllowedAction, AllowedActionConfig> = {
  [ALLOWED_ACTION.resendSetupLink]: {
    actionLabel: "Resend Setup Link",
    buttonLabel: "Send Setup Link",
    loadingLabel: "Sending...",
    reasonLabel: "Reason",
    reasonPlaceholder: "",
    confirmLabel: "Send Setup Link",
    executionMode: "immediate",
    requiresReason: false,
    requiresVerification: false,
    verificationTarget: null,
    deliveryLabel: "Setup link",
    description: (schoolName) => `A new setup link will be sent to ${schoolName}.`,
  },
  [ALLOWED_ACTION.activateAccount]: {
    actionLabel: "Activate Account",
    buttonLabel: "Activate Account",
    loadingLabel: "Activating...",
    reasonLabel: "Activation Note",
    reasonPlaceholder: "Optional note for approval",
    confirmLabel: "Activate Account",
    executionMode: "dialog",
    requiresReason: false,
    requiresVerification: false,
    verificationTarget: null,
    deliveryLabel: null,
    description: (schoolName) => `Optional activation note for ${schoolName}.`,
  },
  [ALLOWED_ACTION.resetPassword]: {
    actionLabel: "Reset Password",
    buttonLabel: "Reset Password",
    loadingLabel: "Sending...",
    reasonLabel: "Reason",
    reasonPlaceholder: "Type a short reason (min 5 characters)",
    confirmLabel: "Send Reset Link",
    executionMode: "dialog",
    requiresReason: true,
    requiresVerification: true,
    verificationTarget: SCHOOL_HEAD_ACCOUNT_ACTION_VERIFICATION_TARGET.passwordReset,
    deliveryLabel: "Password reset link",
    description: (schoolName) =>
      `Reason and confirmation code required to send a password reset link for ${schoolName}.`,
  },
  [ALLOWED_ACTION.reactivateAccount]: {
    actionLabel: "Reactivate Account",
    buttonLabel: "Reactivate Account",
    loadingLabel: "Reactivating...",
    reasonLabel: "Reason",
    reasonPlaceholder: "Type a short reason (min 5 characters)",
    confirmLabel: "Reactivate Account",
    executionMode: "dialog",
    requiresReason: true,
    requiresVerification: false,
    verificationTarget: null,
    deliveryLabel: null,
    description: (schoolName) => `Reason required to reactivate the account for ${schoolName}.`,
  },
  [ALLOWED_ACTION.restoreAccount]: {
    actionLabel: "Restore Account",
    buttonLabel: "Restore Account",
    loadingLabel: "Restoring...",
    reasonLabel: "Reason",
    reasonPlaceholder: "Type a short reason (min 5 characters)",
    confirmLabel: "Restore Account",
    executionMode: "dialog",
    requiresReason: true,
    requiresVerification: true,
    verificationTarget: SCHOOL_HEAD_ACCOUNT_ACTION_VERIFICATION_TARGET.setupRecovery,
    deliveryLabel: "Setup link",
    description: (schoolName) =>
      `Reason and confirmation code required to restore the archived account for ${schoolName} and reissue a setup link.`,
  },
};

export function getAllowedActionConfig(action: AllowedAction): AllowedActionConfig {
  return ALLOWED_ACTION_CONFIG[action];
}

export function getAllowedActionLabel(action: AllowedAction): string {
  return ALLOWED_ACTION_CONFIG[action].actionLabel;
}

export function assertActionAllowed(accountStatus: AccountStatus, action: AllowedAction): void {
  const allowedActions = ACCOUNT_ACTIONS[accountStatus] as readonly AllowedAction[];
  if (!allowedActions.includes(action)) {
    throw new Error(
      `${getAllowedActionLabel(action)} is not allowed while the account is ${getAccountStatusLabel(accountStatus)}.`,
    );
  }
}
