import { useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/Auth";
import { isApiError } from "@/lib/api";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function MfaResetRequest() {
  const location = useLocation();
  const navigate = useNavigate();
  const { requestMonitorMfaReset, isAuthenticating } = useAuth();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialEmail = query.get("email") ?? "";

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formInputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.45)] outline-none transition placeholder:text-slate-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Enter your monitor email address.");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    if (!password) {
      setError("Enter your current password.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess(null);
    setRequestId(null);
    setExpiresAt(null);

    try {
      const payload = await requestMonitorMfaReset({
        login: normalizedEmail,
        password,
        reason: reason.trim() ? reason : undefined,
      });
      setSuccess(payload.message?.trim() || "MFA reset request submitted. Await approval before completion.");
      setRequestId(Number(payload.requestId));
      setExpiresAt(payload.expiresAt ?? null);
    } catch (err) {
      if (isApiError(err)) {
        setError(err.message);
      } else {
        setError("Unable to submit the MFA reset request. Check your network and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBusy = isSubmitting || isAuthenticating;
  const completeHref =
    requestId !== null
      ? `/mfa-reset/complete?email=${encodeURIComponent(email.trim())}&request_id=${encodeURIComponent(String(requestId))}`
      : "/mfa-reset/complete";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(160deg,#eef4fb_0%,#e5edf7_48%,#dbe6f4_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(100,157,216,0.26),transparent_32%),radial-gradient(circle_at_88%_20%,rgba(4,80,140,0.18),transparent_34%),radial-gradient(circle_at_52%_88%,rgba(47,125,196,0.16),transparent_38%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[-13rem] h-[24rem] w-[24rem] -translate-x-1/2 rounded-full border border-primary-200/45 bg-white/40 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-8 sm:px-6 xl:max-w-2xl">
        <div className="w-full overflow-hidden rounded-none border border-slate-200/85 bg-white/85 shadow-[0_30px_70px_-40px_rgba(2,46,80,0.64)] backdrop-blur-sm">
          <section className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 px-6 py-6 text-white sm:px-8 sm:py-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(191,219,254,0.26),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.16),transparent_50%)]" />
            <div className="relative">
              <div className="flex items-start gap-4">
                <img
                  src="/depedlogo.png"
                  alt="Department of Education logo"
                  className="h-16 w-auto rounded-md bg-white px-2 py-1.5"
                />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-100">
                    CSPAMS
                  </p>
                  <h1 className="mt-1 max-w-md text-2xl font-bold leading-tight text-white">
                    Request MFA Reset
                  </h1>
                  <p className="mt-1 max-w-md text-sm font-medium text-primary-100/90">
                    If you can't access your verification code email, request approval.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white/94 p-5 sm:p-7">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Monitor Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                    setSuccess(null);
                    setRequestId(null);
                  }}
                  placeholder="you@example.com"
                  className={formInputClass}
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Current Password
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError("");
                      setSuccess(null);
                    }}
                    placeholder="Enter current password"
                    className={`${formInputClass} pl-10`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reason" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Reason (optional)
                </label>
                <textarea
                  id="reason"
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setError("");
                  }}
                  placeholder="Example: Lost access to inbox / email delayed."
                  rows={3}
                  className={`${formInputClass} resize-none`}
                />
              </div>

              {error && (
                <p className="rounded-xl border border-primary-200 bg-primary-50 px-3.5 py-2.5 text-sm text-primary-700">
                  {error}
                </p>
              )}

              {success && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
                  <p className="font-semibold">{success}</p>
                  {requestId !== null && (
                    <p className="mt-1 text-xs text-emerald-700">
                      Request ID: <span className="font-semibold text-emerald-800">{requestId}</span>
                      {expiresAt ? ` • Expires: ${new Date(expiresAt).toLocaleString()}` : ""}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-emerald-700">
                    After approval, you'll receive an approval token by email. Then complete the reset to get new backup
                    codes.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_-24px_rgba(2,46,80,0.85)] transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <ShieldCheck className="h-4 w-4" />
                {isBusy ? "Submitting request..." : "Submit request"}
                {!isBusy && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
              <Link to="/" className="font-semibold text-primary-700 hover:text-primary-800">
                Back to sign in
              </Link>
              <button
                type="button"
                onClick={() => navigate(completeHref)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-800"
              >
                Already approved? Complete reset →
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

