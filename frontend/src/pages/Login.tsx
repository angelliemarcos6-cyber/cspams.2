import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, ShieldCheck, UserCog, Radar } from "lucide-react";
import { useAuth } from "@/context/Auth";

type LoginRole = "school_admin" | "monitor";

export function Login() {
  const navigate = useNavigate();
  const { login, hasAdminAccount, registerAdmin, authenticateAdmin } = useAuth();

  const [activeRole, setActiveRole] = useState<LoginRole>("school_admin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      setError("Enter a School ID.");
      return;
    }

    if (activeRole === "monitor") {
      login("monitor", normalizedUsername);
      navigate("/monitor");
      return;
    }

    if (!password) {
      setError("Enter your passcode.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      if (!hasAdminAccount) {
        if (!confirmPassword) {
          setError("Confirm your passcode.");
          return;
        }

        if (password !== confirmPassword) {
          setError("Passcodes do not match.");
          return;
        }

        await registerAdmin(normalizedUsername, password);
        login("school_admin", normalizedUsername);
        navigate("/school-admin");
        return;
      }

      const valid = await authenticateAdmin(normalizedUsername, password);
      if (!valid) {
        setError("Invalid School ID or passcode.");
        return;
      }

      login("school_admin", normalizedUsername);
      navigate("/school-admin");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-page-bg px-4 py-8">
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-cyan-300/25 blur-3xl" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-primary-100 bg-white shadow-[0_24px_80px_-40px_rgba(4,80,140,0.7)] lg:grid-cols-[1.05fr_1fr]">
        <section className="hidden bg-gradient-to-br from-primary-700 via-primary to-primary-600 p-10 text-white lg:block">
          <img src="/depedlogo.png" alt="Department of Education logo" className="h-20 w-auto rounded bg-white px-2 py-1.5" />
          <h1 className="mt-7 text-3xl font-extrabold leading-tight">CSPAMS Dashboard</h1>
          <p className="mt-2 max-w-sm text-sm text-primary-100">
            School Management, Monitoring and Evaluation for School Administrators and Division Monitors.
          </p>

          <div className="mt-10 space-y-3">
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-100">Built In</p>
              <p className="mt-1 text-sm font-semibold">Live analytics cards, chart widgets, and record tables</p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-100">Role Access</p>
              <p className="mt-1 text-sm font-semibold">School Administrator input and Division Monitor read-only oversight</p>
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
                  setActiveRole("school_admin");
                  setError("");
                }}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  activeRole === "school_admin" ? "bg-white text-primary shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <UserCog className="h-4 w-4" />
                School Administrator
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveRole("monitor");
                  setPassword("");
                  setConfirmPassword("");
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
              <label htmlFor="school-id" className="mb-1.5 block text-sm font-semibold text-slate-700">
                School ID
              </label>
              <input
                id="school-id"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setError("");
                }}
                placeholder="Enter School ID"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              />
            </div>

            {activeRole === "school_admin" && (
              <>
                <div>
                  <label htmlFor="passcode" className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Passcode
                  </label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="passcode"
                      type="password"
                      autoComplete={hasAdminAccount ? "current-password" : "new-password"}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setError("");
                      }}
                      placeholder="Enter passcode"
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                    />
                  </div>
                </div>

                {!hasAdminAccount && (
                  <div>
                    <label htmlFor="confirm-passcode" className="mb-1.5 block text-sm font-semibold text-slate-700">
                      Confirm Passcode
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
                      placeholder="Re-enter passcode"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                    />
                  </div>
                )}
              </>
            )}

            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <ShieldCheck className="h-4 w-4" />
              {activeRole === "school_admin"
                ? hasAdminAccount
                  ? "Sign In as School Administrator"
                  : "Create School Administrator Account"
                : "Open Division Monitor Dashboard"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
