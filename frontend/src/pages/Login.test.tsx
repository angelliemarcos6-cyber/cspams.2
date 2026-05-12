import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("School Code")).toBeTruthy();
    expect(screen.getByPlaceholderText("6-digit school code")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /division monitor/i })[0]!);

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByPlaceholderText("Monitor email")).toBeTruthy();
  });

  it("toggles passcode visibility and preserves forgot-password routing by role", () => {
    render(
      <MemoryRouter>
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
});
