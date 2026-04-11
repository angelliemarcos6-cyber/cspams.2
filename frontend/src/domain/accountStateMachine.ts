export const ACCOUNT_STATUS = {
  pendingSetup: "pending_setup",
  pendingVerification: "pending_verification",
  active: "active",
  suspended: "suspended",
  locked: "locked",
  archived: "archived",
} as const;

export type AccountStatus = (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];

export const ACCOUNT_ACTION = {
  sendSetupLink: "send_setup_link",
  activate: "activate",
  resetPassword: "reset_password",
  reactivate: "reactivate",
} as const;

export type AccountAction = (typeof ACCOUNT_ACTION)[keyof typeof ACCOUNT_ACTION];

const ACCOUNT_STATUS_VALUES = Object.values(ACCOUNT_STATUS) as AccountStatus[];

// FSM CHANGE: single source of truth for all allowed lifecycle actions.
export const ACCOUNT_STATE_MACHINE = {
  [ACCOUNT_STATUS.pendingSetup]: [ACCOUNT_ACTION.sendSetupLink],
  [ACCOUNT_STATUS.pendingVerification]: [ACCOUNT_ACTION.activate],
  [ACCOUNT_STATUS.active]: [ACCOUNT_ACTION.resetPassword],
  [ACCOUNT_STATUS.suspended]: [ACCOUNT_ACTION.reactivate],
  [ACCOUNT_STATUS.locked]: [ACCOUNT_ACTION.reactivate],
  [ACCOUNT_STATUS.archived]: [],
} as const satisfies Record<AccountStatus, readonly AccountAction[]>;

function assertNever(value: never, context: string): never {
  throw new Error(`${context}: ${String(value)}`);
}

export function isAccountStatus(value: unknown): value is AccountStatus {
  return typeof value === "string" && ACCOUNT_STATUS_VALUES.includes(value as AccountStatus);
}

export function normalizeAccountStatus(value: unknown): AccountStatus | null {
  return isAccountStatus(value) ? value : null;
}

export function resolveAllowedActions(status: AccountStatus): AccountAction[] {
  return [...ACCOUNT_STATE_MACHINE[status]];
}

export function getAllowedActions(status: string | null | undefined): AccountAction[] {
  const normalized = normalizeAccountStatus(status);
  return normalized ? resolveAllowedActions(normalized) : [];
}

export function assertAccountActionAllowed(
  status: string | null | undefined,
  action: AccountAction,
): AccountStatus {
  const normalized = normalizeAccountStatus(status);

  if (!normalized) {
    throw new Error("Invalid action for current account state");
  }

  const allowedActions = ACCOUNT_STATE_MACHINE[normalized] as readonly AccountAction[];
  if (!allowedActions.includes(action)) {
    throw new Error("Invalid action for current account state");
  }

  return normalized;
}

export function getAccountStatusLabel(status: AccountStatus): string {
  switch (status) {
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
      return assertNever(status, "Unhandled account status");
  }
}

export interface AccountActionUiConfig {
  buttonLabel: string;
  resendLabel: string;
  confirmLabel: string;
  sendingLabel: string;
  successMessage: string;
  requiresDialog: boolean;
  requiresReason: boolean;
  requiresVerification: boolean;
  reasonLabel: string;
  reasonPlaceholder: string;
  cooldownSeconds: number;
  description: (schoolName: string) => string;
}

export const ACCOUNT_ACTION_UI: Record<AccountAction, AccountActionUiConfig> = {
  [ACCOUNT_ACTION.sendSetupLink]: {
    buttonLabel: "Send Setup Link",
    resendLabel: "Resend Setup Link",
    confirmLabel: "Send Setup Link",
    sendingLabel: "Sending...",
    successMessage: "Setup link sent.",
    requiresDialog: false,
    requiresReason: false,
    requiresVerification: false,
    reasonLabel: "Reason",
    reasonPlaceholder: "",
    cooldownSeconds: 60,
    description: (schoolName) => `Send a setup link to ${schoolName}.`,
  },
  [ACCOUNT_ACTION.activate]: {
    buttonLabel: "Activate Account",
    resendLabel: "Activate Account",
    confirmLabel: "Activate Account",
    sendingLabel: "Activating...",
    successMessage: "Account activated.",
    requiresDialog: true,
    requiresReason: false,
    requiresVerification: false,
    reasonLabel: "Activation Note",
    reasonPlaceholder: "Optional note for approval",
    cooldownSeconds: 0,
    description: (schoolName) => `Optional activation note for ${schoolName}.`,
  },
  [ACCOUNT_ACTION.resetPassword]: {
    buttonLabel: "Send Password Reset Link",
    resendLabel: "Resend Password Reset Link",
    confirmLabel: "Send Password Reset Link",
    sendingLabel: "Sending...",
    successMessage: "Password reset link sent.",
    requiresDialog: true,
    requiresReason: true,
    requiresVerification: true,
    reasonLabel: "Reason",
    reasonPlaceholder: "Type a short reason (min 5 characters)",
    cooldownSeconds: 60,
    description: (schoolName) =>
      `Reason and confirmation code required to send a password reset link for ${schoolName}.`,
  },
  [ACCOUNT_ACTION.reactivate]: {
    buttonLabel: "Reactivate Account",
    resendLabel: "Reactivate Account",
    confirmLabel: "Reactivate Account",
    sendingLabel: "Reactivating...",
    successMessage: "Account reactivated.",
    requiresDialog: true,
    requiresReason: true,
    requiresVerification: false,
    reasonLabel: "Reason",
    reasonPlaceholder: "Type a short reason (min 5 characters)",
    cooldownSeconds: 0,
    description: (schoolName) => `Reason required to reactivate the account for ${schoolName}.`,
  },
};

export function getAccountActionUiConfig(action: AccountAction): AccountActionUiConfig {
  return ACCOUNT_ACTION_UI[action];
}
