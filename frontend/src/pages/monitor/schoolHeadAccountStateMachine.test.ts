import { describe, expect, it } from "vitest";
import { ACCOUNT_STATUS, ALLOWED_ACTION } from "@/types";
import {
  ACCOUNT_ACTIONS,
  assertActionAllowed,
  resolveAllowedActions,
} from "@/pages/monitor/schoolHeadAccountStateMachine";

describe("schoolHeadAccountStateMachine", () => {
  it("maps every account state to an explicit lifecycle action", () => {
    expect(ACCOUNT_ACTIONS).toEqual({
      [ACCOUNT_STATUS.pendingSetup]: [ALLOWED_ACTION.resendSetupLink],
      [ACCOUNT_STATUS.pendingVerification]: [ALLOWED_ACTION.activateAccount],
      [ACCOUNT_STATUS.active]: [ALLOWED_ACTION.resetPassword],
      [ACCOUNT_STATUS.suspended]: [ALLOWED_ACTION.reactivateAccount],
      [ACCOUNT_STATUS.locked]: [ALLOWED_ACTION.reactivateAccount],
      [ACCOUNT_STATUS.archived]: [ALLOWED_ACTION.restoreAccount],
    });
  });

  it("blocks reset_password for suspended and archived accounts", () => {
    expect(() =>
      assertActionAllowed(ACCOUNT_STATUS.suspended, ALLOWED_ACTION.resetPassword),
    ).toThrow();
    expect(() =>
      assertActionAllowed(ACCOUNT_STATUS.archived, ALLOWED_ACTION.resetPassword),
    ).toThrow();
  });

  it("resolves only the allowed action for each account state", () => {
    expect(resolveAllowedActions(ACCOUNT_STATUS.pendingSetup)).toEqual([ALLOWED_ACTION.resendSetupLink]);
    expect(resolveAllowedActions(ACCOUNT_STATUS.pendingVerification)).toEqual([ALLOWED_ACTION.activateAccount]);
    expect(resolveAllowedActions(ACCOUNT_STATUS.active)).toEqual([ALLOWED_ACTION.resetPassword]);
    expect(resolveAllowedActions(ACCOUNT_STATUS.suspended)).toEqual([ALLOWED_ACTION.reactivateAccount]);
    expect(resolveAllowedActions(ACCOUNT_STATUS.locked)).toEqual([ALLOWED_ACTION.reactivateAccount]);
    expect(resolveAllowedActions(ACCOUNT_STATUS.archived)).toEqual([ALLOWED_ACTION.restoreAccount]);
  });
});
