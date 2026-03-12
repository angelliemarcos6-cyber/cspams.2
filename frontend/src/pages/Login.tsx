import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, ShieldCheck, UserCog, Radar, ArrowRight, LockKeyhole } from "lucide-react";
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

const ROLE_META: Record<
  LoginRole,
  { label: string; note: string; submit: string; loginHint: string; loginLabel: string; emptyError: string }
> = {
  school_head: {
    label: "School Head",
    note: "",
    submit: "Sign In as School Head",
    loginHint: "School code (6 digits, e.g. 103811)",
    loginLabel: "School Code",
    emptyError: "Enter your 6-digit school code.",
  },
  monitor: {
    label: "Division Monitor",
    note: "",
    submit: "Sign In as Division Monitor",
    loginHint: "Monitor email (e.g. monitor@cspams.local)",
    loginLabel: "Email",
    emptyError: "Enter your monitor email.",
  },
};

export function Login() {
  const navigate = useNavigate();
  const { login, verifyMfa, resetRequiredPassword, isAuthenticating } = useAuth();

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
      if (!/^\d{6}$/.test(mfaCode.trim())) {
        setError("Enter the 6-digit verification code sent to your email.");
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
          code: mfaCode.trim(),
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

        if (requiresReset) {
          clearMfaState();
          setRequiresPasswordReset(true);
          setError("Password reset required. Set a new passcode to continue.");
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

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-page-bg px-4 py-8">
      <div className="login-grid-overlay pointer-events-none absolute inset-0 opacity-35" />

      <div className="login-glass-card relative grid w-full max-w-6xl overflow-hidden border lg:grid-cols-[1.08fr_1fr]">
        <section className="hidden border-r border-white/15 bg-primary-800 p-10 text-white lg:block">
          <div className="flex items-center gap-3">
            <img src="/depedlogo.png" alt="Department of Education logo" className="h-16 w-auto bg-white px-2 py-1.5" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-100">CSPAMS</p>
              <p className="text-lg font-extrabold leading-tight">Centralized Student Performance Analytics and Monitoring System</p>
            </div>
          </div>

          <p className="mt-8 border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-primary-50">
            Worked with TARGET'S MET and SMM&E.
          </p>
        </section>

        <section className="bg-white/90 p-6 sm:p-8 lg:p-10">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <img src="/depedlogo.png" alt="Department of Education logo" className="h-11 w-auto bg-primary-50 px-1.5 py-1" />
            <div>
              <p className="text-sm font-bold text-primary-800">CSPAMS Dashboard</p>
              <p className="text-xs text-slate-600">School Management, Monitoring and Evaluation</p>
            </div>
          </div>

          <div className="mb-5 border border-primary-100 bg-primary-50/60 px-3 py-2.5">
            <p className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
              <LockKeyhole className="h-3.5 w-3.5 text-primary-700" />
              {pendingMfa ? "Verify Sign In" : requiresPasswordReset ? "Reset and Sign In" : "Sign in"}
            </p>
          </div>

          <div className="mb-5 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setActiveRole("school_head");
                setError("");
                clearResetState();
                clearMfaState();
              }}
              className={`border px-3 py-3 text-left transition ${
                activeRole === "school_head"
                  ? "border-primary-300 bg-primary-50 text-primary-800"
                  : "border-slate-200 bg-white text-slate-700 hover:border-primary-200"
              }`}
            >
              <p className="inline-flex items-center gap-2 text-sm font-semibold">
                <UserCog className="h-4 w-4" />
                School Head
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveRole("monitor");
                setError("");
                clearResetState();
                clearMfaState();
              }}
              className={`border px-3 py-3 text-left transition ${
                activeRole === "monitor"
                  ? "border-primary-300 bg-primary-50 text-primary-800"
                  : "border-slate-200 bg-white text-slate-700 hover:border-primary-200"
              }`}
            >
              <p className="inline-flex items-center gap-2 text-sm font-semibold">
                <Radar className="h-4 w-4" />
                Division Monitor
              </p>
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="login-id" className="mb-1.5 block text-sm font-semibold text-slate-700">
                {roleMeta.loginLabel}
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
                  setError("");
                  clearResetState();
                  clearMfaState();
                }}
                placeholder={roleMeta.loginHint}
                inputMode={activeRole === "school_head" ? "numeric" : "text"}
                maxLength={activeRole === "school_head" ? 6 : 255}
                pattern={activeRole === "school_head" ? "\\d{6}" : undefined}
                className="w-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              />
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
                  className="w-full border border-slate-200 bg-white py-2.5 pl-10 pr-11 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode((current) => !current)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={showPasscode ? "Hide passcode" : "Show passcode"}
                >
                  {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {pendingMfa && (
              <div>
                <label htmlFor="mfa-code" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Verification Code
                </label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(event) => {
                    setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                    setError("");
                  }}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  pattern="\d{6}"
                  className="w-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Enter the code sent to your monitor email. Expires at {formatMfaExpiry(pendingMfa.expiresAt)}.
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
                    className="w-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    Minimum 10 characters with letters, numbers, and symbols.
                  </p>
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
                    className="w-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                  />
                </div>
              </>
            )}

            {error && <p className="border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-700">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting || isAuthenticating}
              className="inline-flex w-full items-center justify-center gap-2 bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <ShieldCheck className="h-4 w-4" />
              {isSubmitting || isAuthenticating
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
              {!isSubmitting && !isAuthenticating && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
