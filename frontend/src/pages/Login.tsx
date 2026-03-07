import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, ShieldCheck, UserCog, Radar } from "lucide-react";
import { useAuth } from "@/context/Auth";
import { isApiError } from "@/lib/api";
import type { UserRole } from "@/types";

type LoginRole = Exclude<UserRole, null>;

const ROLE_META: Record<LoginRole, { label: string; note: string; submit: string; loginHint: string }> = {
  school_head: {
    label: "School Administrator",
    note: "Use your School Code or school-head email account.",
    submit: "Sign In as School Administrator",
    loginHint: "School code or email",
  },
  monitor: {
    label: "Division Monitor",
    note: "Use your division monitor account for read-only oversight.",
    submit: "Sign In as Division Monitor",
    loginHint: "Monitor email or name",
  },
};

export function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [activeRole, setActiveRole] = useState<LoginRole>("school_head");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedLoginId = loginId.trim();
    if (!normalizedLoginId) {
      setError("Enter your account ID.");
      return;
    }

    if (!password) {
      setError("Enter your passcode.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await login({
        role: activeRole,
        login: normalizedLoginId,
        password,
      });
      navigate(activeRole === "school_head" ? "/school-admin" : "/monitor");
    } catch (err) {
      if (isApiError(err)) {
        setError(err.message);
      } else {
        setError("Unable to sign in. Check your network and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleMeta = ROLE_META[activeRole];

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-page-bg px-4 py-8">
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-cyan-300/25 blur-3xl" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-primary-100 bg-white shadow-[0_24px_80px_-40px_rgba(4,80,140,0.7)] lg:grid-cols-[1.05fr_1fr]">
        <section className="hidden bg-gradient-to-br from-primary-700 via-primary to-primary-600 p-10 text-white lg:block">
          <img src="/depedlogo.png" alt="Department of Education logo" className="h-20 w-auto rounded bg-white px-2 py-1.5" />
          <h1 className="mt-7 text-3xl font-extrabold leading-tight">CSPAMS Dashboard</h1>
          <p className="mt-2 max-w-sm text-sm text-primary-100">
            School Management, Monitoring and Evaluation synced to the central CSPAMS backend.
          </p>

          <div className="mt-10 space-y-3">
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-100">School Administrator</p>
              <p className="mt-1 text-sm font-semibold">Encodes and updates assigned school records</p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-100">Division Monitor</p>
              <p className="mt-1 text-sm font-semibold">Reviews synchronized records and trends across schools</p>
            </div>
          </div>
        </section>

        <section className="p-6 sm:p-8 lg:p-10">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <img src="/depedlogo.png" alt="Department of Education logo" className="h-12 w-auto rounded bg-primary-50 px-1.5 py-1" />
            <div>
              <p className="text-sm font-bold text-primary-800">CSPAMS Dashboard</p>
              <p className="text-xs text-slate-600">School Management, Monitoring and Evaluation</p>
            </div>
          </div>

          <div className="mb-5 rounded-xl border border-slate-200 bg-slate-100 p-1">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => {
                  setActiveRole("school_head");
                  setError("");
                }}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  activeRole === "school_head" ? "bg-white text-primary shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <UserCog className="h-4 w-4" />
                School Administrator
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveRole("monitor");
                  setError("");
                }}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  activeRole === "monitor" ? "bg-white text-primary shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Radar className="h-4 w-4" />
                Division Monitor
              </button>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="login-id" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Account ID
              </label>
              <input
                id="login-id"
                type="text"
                autoComplete="username"
                value={loginId}
                onChange={(event) => {
                  setLoginId(event.target.value);
                  setError("");
                }}
                placeholder={roleMeta.loginHint}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              />
              <p className="mt-1.5 text-xs text-slate-500">{roleMeta.note}</p>
            </div>

            <div>
              <label htmlFor="passcode" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Passcode
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
                  }}
                  placeholder="Enter passcode"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-11 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode((current) => !current)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={showPasscode ? "Hide passcode" : "Show passcode"}
                >
                  {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <ShieldCheck className="h-4 w-4" />
              {isSubmitting ? "Signing In..." : roleMeta.submit}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
