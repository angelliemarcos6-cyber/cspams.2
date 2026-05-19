import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { Login } from "@/pages/Login";

const authState = {
  login: vi.fn(),
  verifyMfa: vi.fn(),
  resetRequiredPassword: vi.fn(),
  isAuthenticating: false,
  authError: "",
  authErrorCode: null,
  accountStatus: null,
  clearAuthError: vi.fn(),
};

vi.mock("@/context/Auth", () => ({
  useAuth: () => authState,
}));

describe("Login", () => {
  beforeEach(() => {
    authState.login.mockReset();
    authState.verifyMfa.mockReset();
    authState.resetRequiredPassword.mockReset();
    authState.clearAuthError.mockReset();
    authState.isAuthenticating = false;
    authState.authError = "";
    authState.authErrorCode = null;
    authState.accountStatus = null;
  });

  it("shows school head by default and updates labels when switching roles", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Login ID")).toBeTruthy();
    expect(screen.getByPlaceholderText("Enter school code or monitor email")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /division monitor/i })[0]!);

    expect(screen.getByLabelText("Login ID")).toBeTruthy();
    expect(screen.getByPlaceholderText("Enter school code or monitor email")).toBeTruthy();
  });

  it("toggles passcode visibility and preserves forgot-password routing by role", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>,
    );

    const passcodeInput = screen.getByLabelText("Passcode");
    expect(passcodeInput.getAttribute("type")).toBe("password");

    fireEvent.click(screen.getAllByRole("button", { name: /show passcode/i })[0]!);
    expect(passcodeInput.getAttribute("type")).toBe("text");

    const initialForgotLinks = screen.getAllByRole("link", { name: /forgot password/i });
    expect(initialForgotLinks.some((link) => link.getAttribute("href") === "/forgot-password?role=school_head")).toBe(true);

    fireEvent.click(screen.getAllByRole("button", { name: /division monitor/i })[0]!);
    const switchedForgotLinks = screen.getAllByRole("link", { name: /forgot password/i });
    expect(switchedForgotLinks.some((link) => link.getAttribute("href") === "/forgot-password?role=monitor")).toBe(true);
  });

  it("shows a deployment-oriented message when the API cannot be reached during login", async () => {
    authState.login.mockRejectedValueOnce(new ApiError("NetworkError when attempting to fetch resource.", 0, null));

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /division monitor/i })[0]!);
    fireEvent.change(screen.getByLabelText("Login ID"), { target: { value: "cspamsmonitor@gmail.com" } });
    fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "Demo@123456" } });
    fireEvent.submit(screen.getAllByRole("button", { name: /sign in/i })[0]!.closest("form")!);

    expect(
      await screen.findByText(/Unable to reach the CSPAMS API at .* Check the deployed API URL and network access\./i),
    ).toBeTruthy();
  });

  it("shows a monitor MFA delivery message when credentials are accepted but email delivery fails", async () => {
    authState.login.mockRejectedValueOnce(new ApiError(
      "Unable to send verification code. Please try again or contact your administrator.",
      503,
      { errorCode: "mfa_delivery_failed" },
    ));

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /division monitor/i })[0]!);
    fireEvent.change(screen.getByLabelText("Login ID"), { target: { value: "cspamsmonitor@gmail.com" } });
    fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "Demo@123456" } });
    fireEvent.submit(screen.getAllByRole("button", { name: /sign in/i })[0]!.closest("form")!);

    expect(
      await screen.findByText("Your monitor credentials were accepted, but the verification code email could not be delivered. Check mail configuration or try again."),
    ).toBeTruthy();
  });
});
