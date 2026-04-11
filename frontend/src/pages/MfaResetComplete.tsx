import { useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, ClipboardList, KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/Auth";
import { isApiError } from "@/lib/api";

function normalizeTokenInput(rawValue: string): string {
  const compact = rawValue.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  if (compact.length <= 4) {
    return compact;
  }
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

function isValidToken(value: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value.trim().toUpperCase());
}

export function MfaResetComplete() {
  const location = useLocation();
  const navigate = useNavigate();
  const { completeMonitorMfaReset, isAuthenticating } = useAuth();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const [email, setEmail] = useState(query.get("email") ?? "");
  const [requestId, setRequestId] = useState(query.get("request_id") ?? "");
  const [password, setPassword] = useState("");
  const [approvalToken, setApprovalToken] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formInputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.45)] outline-none transition placeholder:text-slate-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    const parsedRequestId = Number(requestId);
    const normalizedApproval = approvalToken.trim().toUpperCase();

    if (!normalizedEmail) {
      setError("Monitor email is required.");
      return;
    }

    if (!Number.isFinite(parsedRequestId) || parsedRequestId <= 0) {
      setError("Request ID is invalid. Submit a new MFA reset request.");
      return;
    }

    if (!password) {
      setError("Enter your current password.");
      return;
    }

    if (!isValidToken(normalizedApproval)) {
      setError("Approval token must be in XXXX-XXXX format.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess(null);
    setBackupCodes([]);
    setCopied(false);

    try {
      const result = await completeMonitorMfaReset({
        login: normalizedEmail,
        password,
        requestId: parsedRequestId,
        approvalToken: normalizedApproval,
      });
      setSuccess(result.message);
      setBackupCodes(result.backupCodes);
    } catch (err) {
      if (isApiError(err)) {
        setError(err.message);
      } else {
        setError("Unable to complete MFA reset. Check your network and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBusy = isSubmitting || isAuthenticating;

  const copyBackupCodes = async () => {
    if (backupCodes.length === 0 || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

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
                    Complete MFA Reset
                  </h1>
                  <p className="mt-1 max-w-md text-sm font-medium text-primary-100/90">
                    Enter the approval token to generate new backup codes.
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
                  }}
                  className={formInputClass}
                />
              </div>

              <div>
                <label htmlFor="request-id" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Request ID
                </label>
                <input
                  id="request-id"
                  type="text"
                  inputMode="numeric"
                  value={requestId}
                  onChange={(event) => {
                    setRequestId(event.target.value.replace(/[^\d]/g, "").slice(0, 12));
                    setError("");
                  }}
                  placeholder="Example: 12"
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
                <label htmlFor="approval-token" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Approval Token
                </label>
                <input
                  id="approval-token"
                  type="text"
                  autoComplete="one-time-code"
                  value={approvalToken}
                  onChange={(event) => {
                    setApprovalToken(normalizeTokenInput(event.target.value));
                    setError("");
                    setSuccess(null);
                  }}
                  placeholder="XXXX-XXXX"
                  maxLength={9}
                  className={formInputClass}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  The approval token is sent by email after another monitor approves your request.
                </p>
              </div>

              {error && (
                <p className="rounded-xl border border-primary-200 bg-primary-50 px-3.5 py-2.5 text-sm text-primary-700">
                  {error}
                </p>
              )}

              {success && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
                  <p className="font-semibold">{success}</p>
                </div>
              )}

              {backupCodes.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Backup codes</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Store these securely. Each code can be used once.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyBackupCodes()}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <ClipboardList className="h-3.5 w-3.5 text-primary-700" />
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {backupCodes.map((code) => (
                      <div
                        key={code}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-center font-mono text-xs text-slate-800"
                      >
                        {code}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_-24px_rgba(2,46,80,0.85)] transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <ShieldCheck className="h-4 w-4" />
                {isBusy ? "Completing reset..." : "Complete reset"}
                {!isBusy && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
              <Link to="/mfa-reset" className="font-semibold text-primary-700 hover:text-primary-800">
                Back to request
              </Link>
              <button
                type="button"
                onClick={() => navigate("/monitor")}
                disabled={backupCodes.length === 0}
                className="text-xs font-semibold text-slate-600 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Continue to dashboard →
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
