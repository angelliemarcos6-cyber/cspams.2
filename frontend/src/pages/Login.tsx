import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ShieldCheck, GraduationCap, ClipboardList, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/Auth";
import { isApiError } from "@/lib/api";
import type { UserRole } from "@/types";

type LoginRole = Exclude<UserRole, null>;

interface PendingMfaChallenge {
  challengeId: string;
  expiresAt: string;
  login: string;
  delivery?: string;
  deliveryMessage?: string;
}

function formatMfaExpiry(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return "soon";
  }

  return date.toLocaleString();
}

function normalizeMfaCodeInput(rawValue: string): string {
  const compact = rawValue.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  if (compact.length <= 4) {
    return compact;
  }

  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

function isValidMfaInput(code: string): boolean {
  return /^(?:\d{6}|[A-Z0-9]{4}-[A-Z0-9]{4})$/.test(code.trim().toUpperCase());
}

const ROLE_META: Record<
  LoginRole,
  { label: string; note: string; submit: string; emptyError: string }
> = {
  school_head: {
    label: "School Head",
    note: "Use your assigned 6-digit school code.",
    submit: "Sign In",
    emptyError: "Enter your 6-digit school code.",
  },
  monitor: {
    label: "Division Monitor",
    note: "Use your Division Monitor email address.",
    submit: "Sign In",
    emptyError: "Enter your monitor email.",
  },
};

const LOGIN_FIELD_LABEL = "Login ID";
const LOGIN_FIELD_HINT = "Enter school code or monitor email";

export function Login() {
  const navigate = useNavigate();
  const {
    login,
    verifyMfa,
    resetRequiredPassword,
    isAuthenticating,
    authError,
    authErrorCode,
    accountStatus,
    clearAuthError,
  } = useAuth();
  const appTagline = "Centralized School Performance and Monitoring System";

  const [activeRole, setActiveRole] = useState<LoginRole>("school_head");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [pendingMfa, setPendingMfa] = useState<PendingMfaChallenge | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [requiresPasswordReset, setRequiresPasswordReset] = useState(false);
  const [showPasscode, setShowPasscode] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMfaChallengeActive = pendingMfa !== null;

  const roleMeta = ROLE_META[activeRole];
  const forgotPasswordHref = (() => {
    if (activeRole === "school_head") {
      return "/forgot-password?role=school_head";
    }

    const trimmed = loginId.trim();
    if (!trimmed) return "/forgot-password?role=monitor";
    return `/forgot-password?role=monitor&email=${encodeURIComponent(trimmed)}`;
  })();

  const clearResetState = () => {
    setRequiresPasswordReset(false);
    setNewPassword("");
    setConfirmPassword("");
  };

  const clearMfaState = () => {
    setPendingMfa(null);
    setMfaCode("");
  };

  useEffect(() => {
    if (!authError) {
      return;
    }

    if (authErrorCode === 403) {
      const statusMessage =
        accountStatus === "pending_setup"
          ? "Account setup is still pending."
          : accountStatus === "pending_verification"
            ? "Your account setup is complete, but your Division Monitor has not activated it yet."
          : accountStatus === "suspended"
            ? "Your account is suspended."
            : accountStatus === "locked"
              ? "Your account is locked."
              : accountStatus === "archived"
                ? "Your account is archived."
                : authError;

      setError(statusMessage);
      return;
    }

    setError(authError);
  }, [accountStatus, authError, authErrorCode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedLoginId = activeRole === "school_head" ? loginId.replace(/\D/g, "").slice(0, 6) : loginId.trim();
    if (!normalizedLoginId) {
      setError(roleMeta.emptyError);
      return;
    }

    if (activeRole === "school_head" && normalizedLoginId.length !== 6) {
      setError("School code must be exactly 6 digits.");
      return;
    }

    if (activeRole === "monitor" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedLoginId)) {
      setError("Monitor login must be a valid email address.");
      return;
    }

    if (pendingMfa) {
      if (!isValidMfaInput(mfaCode)) {
        setError("Enter a 6-digit verification code or backup code in XXXX-XXXX format.");
        return;
      }
    } else {
      if (!password) {
        setError("Enter your passcode.");
        return;
      }

      if (requiresPasswordReset && (!newPassword || !confirmPassword)) {
        setError("Enter and confirm your new passcode.");
        return;
      }

      if (requiresPasswordReset && newPassword !== confirmPassword) {
        setError("New passcode and confirmation do not match.");
        return;
      }
    }

    setIsSubmitting(true);
    clearAuthError();
    setError("");

    try {
      if (pendingMfa) {
        await verifyMfa({
          role: "monitor",
          login: pendingMfa.login,
          challengeId: pendingMfa.challengeId,
          code: mfaCode.trim().toUpperCase(),
        });
        clearMfaState();
        navigate("/monitor");
        return;
      }

      if (requiresPasswordReset) {
        await resetRequiredPassword({
          role: activeRole,
          login: normalizedLoginId,
          password,
          newPassword,
          confirmPassword,
        });
      } else {
        const result = await login({
          role: activeRole,
          login: normalizedLoginId,
          password,
        });

        if (result.status === "mfa_required") {
          setPendingMfa({
            challengeId: result.challengeId,
            expiresAt: result.expiresAt,
            login: normalizedLoginId.toLowerCase(),
            delivery: result.delivery,
            deliveryMessage: result.deliveryMessage,
          });
          setMfaCode("");
          setError("");
          return;
        }
      }

      navigate(activeRole === "school_head" ? "/school-admin" : "/monitor");
    } catch (err) {
      if (isApiError(err)) {
        const shouldRestartMfa =
          pendingMfa !== null &&
          (err.status === 429 || (err.status === 422 && err.message.toLowerCase().includes("sign in again")));

        if (shouldRestartMfa) {
          clearMfaState();
        }

        const requiresReset =
          pendingMfa === null &&
          err.status === 403 &&
          Boolean((err.payload as { requiresPasswordReset?: boolean } | null)?.requiresPasswordReset);
        const requiresSetup =
          pendingMfa === null &&
          err.status === 403 &&
          Boolean((err.payload as { requiresAccountSetup?: boolean } | null)?.requiresAccountSetup);
        const requiresMonitorApproval =
          pendingMfa === null &&
          err.status === 403 &&
          Boolean((err.payload as { requiresMonitorApproval?: boolean } | null)?.requiresMonitorApproval);

        if (requiresReset) {
          clearMfaState();
          setRequiresPasswordReset(true);
          setError("Password reset required. Set a new passcode to continue.");
        } else if (requiresSetup) {
          clearMfaState();
          clearResetState();
          setError("Account setup is required. Use your one-time setup link, or request a new one from your Division Monitor.");
        } else if (requiresMonitorApproval) {
          clearMfaState();
          clearResetState();
          setError("Your account setup is complete, but your Division Monitor has not activated it yet.");
        } else {
          if (pendingMfa === null) {
            clearResetState();
          }
          setError(err.message);
        }
      } else {
        if (pendingMfa === null) {
          clearResetState();
        }
        setError("Unable to sign in. Check your network and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBusy = isSubmitting || isAuthenticating;
  const formInputClass =
    "w-full rounded-none border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.42)] outline-none transition placeholder:text-slate-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 sm:px-4 sm:py-3.5";

  return (
    <div className="min-h-screen bg-[#eef2f7] px-3 py-4 font-sans sm:px-5 sm:py-8 md:px-6 md:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-4xl items-center justify-center sm:min-h-[calc(100vh-4rem)]">
        <div className="w-full max-w-[620px]">
          <div className="overflow-hidden rounded-none border border-slate-200 bg-white shadow-[0_26px_60px_-42px_rgba(15,23,42,0.38)]">
            <section className="bg-[#0f4f7d] px-5 py-5 text-white sm:px-6 sm:py-6 md:px-8 md:py-7">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
                <img
                  src="/depedlogo.png"
                  alt="Department of Education logo"
                  className="h-16 w-auto rounded-none bg-white px-2 py-1.5 shadow-[0_10px_18px_-16px_rgba(15,23,42,0.7)] sm:h-18 sm:px-2.5 sm:py-2 md:h-20"
                />
                <div className="min-w-0 w-full">
                  <span className="inline-flex rounded-none bg-white/16 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-100 sm:px-3 sm:text-[11px]">
                    CSPAMS
                  </span>
                  <h1 className="font-display mt-2.5 max-w-none text-[1.12rem] leading-[1.25] font-bold text-white sm:mt-3 sm:text-[1.28rem] md:max-w-md md:text-[1.5rem]">
                    {appTagline}
                  </h1>
                </div>
              </div>
            </section>

            <section className="bg-white px-5 py-5 font-sans sm:px-6 sm:py-6 md:px-8 md:py-7">
              <div className="mb-5 rounded-none border border-slate-200 bg-slate-50/70 p-2.5 sm:p-3">
                <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Sign In Role</p>
                <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveRole("school_head");
                    clearAuthError();
                    setError("");
                    clearResetState();
                    clearMfaState();
                  }}
                  disabled={isMfaChallengeActive}
                  className={`rounded-none border px-4 py-3.5 text-left transition sm:py-4 ${
                    activeRole === "school_head"
                      ? "border-primary-300 bg-white text-primary-900 shadow-[0_14px_32px_-24px_rgba(2,46,80,0.58)]"
                      : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-white"
                  } disabled:cursor-not-allowed disabled:opacity-70`}
                  aria-pressed={activeRole === "school_head"}
                >
                  <p className="inline-flex items-center gap-2.5 text-[15px] font-semibold sm:text-base">
                    <GraduationCap className="h-4 w-4" />
                    School Head
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveRole("monitor");
                    clearAuthError();
                    setError("");
                    clearResetState();
                    clearMfaState();
                  }}
                  disabled={isMfaChallengeActive}
                  className={`rounded-none border px-4 py-3.5 text-left transition sm:py-4 ${
                    activeRole === "monitor"
                      ? "border-primary-300 bg-white text-primary-900 shadow-[0_14px_32px_-24px_rgba(2,46,80,0.58)]"
                      : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-white"
                  } disabled:cursor-not-allowed disabled:opacity-70`}
                  aria-pressed={activeRole === "monitor"}
                >
                  <p className="inline-flex items-center gap-2.5 text-[15px] font-semibold sm:text-base">
                    <ClipboardList className="h-4 w-4" />
                    Division Monitor
                  </p>
                </button>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="login-id" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  {LOGIN_FIELD_LABEL}
                </label>
                <input
                  id="login-id"
                  type="text"
                  autoComplete="username"
                  value={loginId}
                  onChange={(event) => {
                    const nextValue =
                      activeRole === "school_head"
                        ? event.target.value.replace(/\D/g, "").slice(0, 6)
                        : event.target.value;
                    setLoginId(nextValue);
                    clearAuthError();
                    setError("");
                    clearResetState();
                    clearMfaState();
                  }}
                  placeholder={LOGIN_FIELD_HINT}
                  inputMode={activeRole === "school_head" ? "numeric" : "text"}
                  maxLength={activeRole === "school_head" ? 6 : 255}
                  pattern={activeRole === "school_head" ? "\\d{6}" : undefined}
                  disabled={isMfaChallengeActive}
                  className={formInputClass}
                />
                {roleMeta.note && <p className="mt-1.5 text-xs text-slate-500">{roleMeta.note}</p>}
              </div>

              <div>
                <label htmlFor="passcode" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  {requiresPasswordReset ? "Current Passcode" : "Passcode"}
                </label>
                <div className="relative">
                  <input
                    id="passcode"
                    type={showPasscode ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      clearAuthError();
                      setError("");
                      clearMfaState();
                    }}
                    placeholder="Enter passcode"
                    disabled={isMfaChallengeActive}
                    className={`${formInputClass} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode((current) => !current)}
                    disabled={isMfaChallengeActive}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-none p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label={showPasscode ? "Hide passcode" : "Show passcode"}
                  >
                    {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {!pendingMfa && (
                  <div className="mt-2 flex justify-end">
                    <Link to={forgotPasswordHref} className="text-xs font-semibold text-primary-700 hover:text-primary-800">
                      {requiresPasswordReset ? "Can't access current passcode? Email reset" : "Forgot password?"}
                    </Link>
                  </div>
                )}
              </div>

              {pendingMfa && (
                <div className="rounded-none border border-amber-200 bg-amber-50/75 p-3.5">
                  <label htmlFor="mfa-code" className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Verification Code
                  </label>
                  <input
                    id="mfa-code"
                    type="text"
                    inputMode="text"
                    autoComplete="one-time-code"
                    value={mfaCode}
                    onChange={(event) => {
                      setMfaCode(normalizeMfaCodeInput(event.target.value));
                      clearAuthError();
                      setError("");
                    }}
                    placeholder="Enter 6-digit or backup code"
                    maxLength={9}
                    pattern="(?:\d{6}|[A-Z0-9]{4}-[A-Z0-9]{4})"
                    className={formInputClass}
                  />
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    Enter the code sent to your monitor email, or a backup code (XXXX-XXXX). Expires at{" "}
                    {formatMfaExpiry(pendingMfa.expiresAt)}.
                  </p>
                  <div className="mt-2 flex justify-end">
                    <Link
                      to={`/mfa-reset?email=${encodeURIComponent(pendingMfa.login)}`}
                      className="text-xs font-semibold text-primary-700 hover:text-primary-800"
                    >
                      Can't access email? Request MFA reset
                    </Link>
                  </div>
                  {pendingMfa.delivery &&
                    pendingMfa.delivery !== "sent" &&
                    typeof pendingMfa.deliveryMessage === "string" &&
                    pendingMfa.deliveryMessage.trim().length > 0 && (
                      <p className="mt-2 text-xs font-semibold text-amber-700">{pendingMfa.deliveryMessage}</p>
                    )}
                </div>
              )}

              {requiresPasswordReset && !pendingMfa && (
                <>
                  <div>
                    <label htmlFor="new-passcode" className="mb-1.5 block text-sm font-semibold text-slate-700">
                      New Passcode
                    </label>
                    <input
                      id="new-passcode"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => {
                        setNewPassword(event.target.value);
                        clearAuthError();
                        setError("");
                      }}
                      placeholder="Create a new passcode"
                      className={formInputClass}
                    />
                    <p className="mt-1.5 text-xs text-slate-500">Minimum 10 characters with letters, numbers, and symbols.</p>
                  </div>
                  <div>
                    <label htmlFor="confirm-passcode" className="mb-1.5 block text-sm font-semibold text-slate-700">
                      Confirm New Passcode
                    </label>
                    <input
                      id="confirm-passcode"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        clearAuthError();
                        setError("");
                      }}
                      placeholder="Confirm your new passcode"
                      className={formInputClass}
                    />
                  </div>
                </>
              )}

              {error && <p className="rounded-none border border-primary-200 bg-primary-50 px-3.5 py-2.5 text-sm text-primary-700">{error}</p>}

              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-none bg-primary px-4 py-3.5 text-sm font-semibold text-white shadow-[0_18px_34px_-24px_rgba(2,46,80,0.85)] transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <ShieldCheck className="h-4 w-4" />
                {isBusy
                  ? pendingMfa
                    ? "Verifying..."
                    : requiresPasswordReset
                      ? "Updating Passcode..."
                      : "Signing In..."
                  : pendingMfa
                    ? "Verify and Sign In"
                    : requiresPasswordReset
                      ? "Update Passcode and Sign In"
                      : roleMeta.submit}
                {!isBusy && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>
            </section>
          </div>
          <div className="mt-6 flex flex-col items-center justify-center gap-1.5 text-center sm:mt-7 sm:flex-row sm:gap-3">
            <span className="text-sm text-slate-600">Powered by:</span>
            <img src="/ama-cc-logo.png" alt="AMA Computer College logo" className="h-auto w-24 sm:w-28 md:w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}
