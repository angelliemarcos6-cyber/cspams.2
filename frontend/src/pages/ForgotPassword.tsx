import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/Auth";
import { isApiError } from "@/lib/api";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function ForgotPassword() {
  const location = useLocation();
  const { requestMonitorPasswordReset, isAuthenticating } = useAuth();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialEmail = query.get("email") ?? "";
  const role = useMemo(
    () => ((query.get("role") ?? "").trim().toLowerCase() === "school_head" ? "school_head" : "monitor"),
    [query],
  );
  const roleLabel = role === "school_head" ? "School Head" : "Monitor";

  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [deliveryNote, setDeliveryNote] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const formInputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.45)] outline-none transition placeholder:text-slate-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError(`Enter your ${roleLabel.toLowerCase()} email address.`);
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSubmitting(true);
    setError("");
    setSuccess(null);
    setDeliveryNote(null);

    try {
      const payload = await requestMonitorPasswordReset(normalizedEmail, role);
      if (controller.signal.aborted) return;
      setSuccess(
        payload.message?.trim() ||
          "If a matching account exists, a password reset link will be sent to the provided email address.",
      );
      const note = payload.deliveryMessage?.trim();
      if (note) {
        setDeliveryNote(note);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (isApiError(err)) {
        setError(err.message);
      } else {
        setError("Unable to request a reset link. Check your network and try again.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSubmitting(false);
      }
    }
  };

  const isBusy = isSubmitting || isAuthenticating;

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
                    Reset {roleLabel} Password
                  </h1>
                  <p className="mt-1 max-w-md text-sm font-medium text-primary-100/90">
                    We will email you a secure reset link.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white/94 p-5 sm:p-7">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  {roleLabel} Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setError("");
                      setSuccess(null);
                      setDeliveryNote(null);
                    }}
                    placeholder="you@example.com"
                    className={`${formInputClass} pl-10`}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  If you don&apos;t receive the email within a few minutes, check spam/junk/promotions.
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
                  {deliveryNote && <p className="mt-1 text-xs text-emerald-700">{deliveryNote}</p>}
                </div>
              )}

              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_-24px_rgba(2,46,80,0.85)] transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <ShieldCheck className="h-4 w-4" />
                {isBusy ? "Sending reset link..." : "Send reset link"}
                {!isBusy && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            <div className="mt-5 flex items-center justify-between gap-3 text-sm">
              <Link to="/" className="font-semibold text-primary-700 hover:text-primary-800">
                Back to sign in
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
