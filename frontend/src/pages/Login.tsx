import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, ShieldCheck, UserCog, Radar, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/Auth";
import { isApiError } from "@/lib/api";
import type { UserRole } from "@/types";

type LoginRole = Exclude<UserRole, null>;

interface PendingMfaChallenge {
  challengeId: string;
  expiresAt: string;
  login: string;
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
  { label: string; note: string; submit: string; loginHint: string; loginLabel: string; emptyError: string }
> = {
  school_head: {
    label: "School Head",
    note: "",
    submit: "Sign In",
    loginHint: "6-digit school code",
    loginLabel: "School Code",
    emptyError: "Enter your 6-digit school code.",
  },
  monitor: {
    label: "Division Monitor",
    note: "",
    submit: "Sign In",
    loginHint: "Monitor email",
    loginLabel: "Email",
    emptyError: "Enter your monitor email.",
  },
};

export function Login() {
  const navigate = useNavigate();
  const { login, verifyMfa, resetRequiredPassword, isAuthenticating } = useAuth();
  const appTagline = "Centralized Student Performance Analytics and Monitoring System";

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

  const roleMeta = ROLE_META[activeRole];

  const clearResetState = () => {
    setRequiresPasswordReset(false);
    setNewPassword("");
    setConfirmPassword("");
  };

  const clearMfaState = () => {
    setPendingMfa(null);
    setMfaCode("");
  };

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
    }

    if (!password) {
      setError("Enter your passcode.");
      return;
    }

    if (requiresPasswordReset && !pendingMfa) {
      if (!newPassword || !confirmPassword) {
        setError("Enter and confirm your new passcode.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("New passcode and confirmation do not match.");
        return;
      }
    }

    setIsSubmitting(true);
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

        if (requiresReset) {
          clearMfaState();
          setRequiresPasswordReset(true);
          setError("Password reset required. Set a new passcode to continue.");
        } else if (requiresSetup) {
          clearMfaState();
          clearResetState();
          setError("Account setup is required. Use your one-time setup link, or request a new one from your Division Monitor.");
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
  const loginFieldIcon =
    activeRole === "school_head" ? <UserCog className="h-4 w-4 text-slate-400" /> : <Radar className="h-4 w-4 text-slate-400" />;
  const formInputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.45)] outline-none transition placeholder:text-slate-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(160deg,#eef4fb_0%,#e5edf7_48%,#dbe6f4_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(100,157,216,0.26),transparent_32%),radial-gradient(circle_at_88%_20%,rgba(4,80,140,0.18),transparent_34%),radial-gradient(circle_at_52%_88%,rgba(47,125,196,0.16),transparent_38%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[-13rem] h-[24rem] w-[24rem] -translate-x-1/2 rounded-full border border-primary-200/45 bg-white/40 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-2xl items-center px-4 py-8 sm:px-6 xl:max-w-3xl 2xl:max-w-6xl">
        <div className="w-full overflow-hidden rounded-none border border-slate-200/85 bg-white/85 shadow-[0_30px_70px_-40px_rgba(2,46,80,0.64)] backdrop-blur-sm 2xl:grid 2xl:grid-cols-[0.95fr_1fr]">
          <section className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 px-6 py-6 text-white sm:px-8 sm:py-7 2xl:flex 2xl:items-center 2xl:px-10 2xl:py-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(191,219,254,0.26),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.16),transparent_50%)]" />
            <div className="relative">
              <div className="flex items-start gap-4">
                <img src="/depedlogo.png" alt="Department of Education logo" className="h-16 w-auto rounded-md bg-white px-2 py-1.5 2xl:h-20" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-100">CSPAMS</p>
                  <h1 className="mt-1 max-w-md text-2xl font-bold leading-tight text-white 2xl:max-w-none 2xl:text-3xl">Sign In Portal</h1>
                  <p className="mt-1 max-w-md text-sm font-medium text-primary-100/90 2xl:max-w-none 2xl:text-base" title={appTagline}>
                    {appTagline}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white/94 p-5 sm:p-7 2xl:border-l 2xl:border-slate-200/85 2xl:p-10">
            <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-2">
              <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Sign In Role</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveRole("school_head");
                    setError("");
                    clearResetState();
                    clearMfaState();
                  }}
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    activeRole === "school_head"
                      ? "border-primary-300 bg-white text-primary-800 shadow-[0_14px_28px_-24px_rgba(2,46,80,0.65)]"
                      : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-white"
                  }`}
                >
                  <p className="inline-flex items-center gap-2 text-sm font-semibold">
                    <UserCog className="h-4 w-4" />
                    School Head
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Use school code</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveRole("monitor");
                    setError("");
                    clearResetState();
                    clearMfaState();
                  }}
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    activeRole === "monitor"
                      ? "border-primary-300 bg-white text-primary-800 shadow-[0_14px_28px_-24px_rgba(2,46,80,0.65)]"
                      : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-white"
                  }`}
                >
                  <p className="inline-flex items-center gap-2 text-sm font-semibold">
                    <Radar className="h-4 w-4" />
                    Division Monitor
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Use monitor email</p>
                </button>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="login-id" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  {roleMeta.loginLabel}
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">{loginFieldIcon}</span>
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
                      setError("");
                      clearResetState();
                      clearMfaState();
                    }}
                    placeholder={roleMeta.loginHint}
                    inputMode={activeRole === "school_head" ? "numeric" : "text"}
                    maxLength={activeRole === "school_head" ? 6 : 255}
                    pattern={activeRole === "school_head" ? "\\d{6}" : undefined}
                    className={`${formInputClass} pl-10`}
                  />
                </div>
                {roleMeta.note && <p className="mt-1.5 text-xs text-slate-500">{roleMeta.note}</p>}
              </div>

              <div>
                <label htmlFor="passcode" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  {requiresPasswordReset ? "Current Passcode" : "Passcode"}
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="passcode"
                    type={showPasscode ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError("");
                      clearMfaState();
                    }}
                    placeholder="Enter passcode"
                    className={`${formInputClass} py-3 pl-10 pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode((current) => !current)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label={showPasscode ? "Hide passcode" : "Show passcode"}
                  >
                    {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {pendingMfa && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/75 p-3.5">
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
                        setError("");
                      }}
                      placeholder="Confirm your new passcode"
                      className={formInputClass}
                    />
                  </div>
                </>
              )}

              {error && <p className="rounded-xl border border-primary-200 bg-primary-50 px-3.5 py-2.5 text-sm text-primary-700">{error}</p>}

              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_-24px_rgba(2,46,80,0.85)] transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
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
      </div>
    </div>
  );
}
