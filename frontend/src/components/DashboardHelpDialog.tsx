import { useEffect } from "react";
import { CircleHelp, X } from "lucide-react";

type DashboardHelpVariant = "monitor" | "school_head";

interface DashboardHelpDialogProps {
  open: boolean;
  variant: DashboardHelpVariant;
  onClose: () => void;
}

export function DashboardHelpDialog({ open, variant, onClose }: DashboardHelpDialogProps) {
  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isMonitor = variant === "monitor";
  const title = isMonitor ? "Account Setup & Email Delivery" : "Account Setup & Sign-in Help";
  const subtitle = isMonitor
    ? "How setup links, reset links, and verification codes work."
    : "How to activate your account and regain access.";

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        className="fixed inset-0 z-[96] bg-slate-900/40"
        aria-label="Close help dialog"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Dashboard help"
        className="fixed z-[97] inset-x-4 bottom-4 max-h-[84vh] w-[calc(100vw-2rem)] overflow-y-auto rounded-sm border border-slate-200 bg-white p-4 shadow-2xl animate-fade-slide sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-32 sm:w-[min(46rem,calc(100vw-2rem))] sm:-translate-x-1/2"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary-700">
              <CircleHelp className="h-4 w-4" />
              Quick Guide
            </p>
            <h2 className="mt-1 text-base font-extrabold text-slate-900">{title}</h2>
            <p className="mt-1 text-xs text-slate-600">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
            aria-label="Close"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {isMonitor ? (
            <>
              <article className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  Reset Link (School Head setup)
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                  <li>
                    Open <span className="font-semibold text-slate-900">Schools</span>, select a school, then open{" "}
                    <span className="font-semibold text-slate-900">Accounts</span>.
                  </li>
                  <li>
                    Click <span className="font-semibold text-slate-900">Reset Link</span> to email a{" "}
                    <span className="font-semibold text-slate-900">one-time setup link</span> (it never sends a
                    password).
                  </li>
                  <li>
                    If email fails, you can copy the setup link and share it through a secure channel.
                  </li>
                  <li>Setup links expire; just re-issue if needed.</li>
                </ul>
              </article>

              <article className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  Sensitive actions require a confirmation code
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                  <li>
                    Suspending/locking/archiving a School Head account asks for a{" "}
                    <span className="font-semibold text-slate-900">6-digit confirmation code</span>.
                  </li>
                  <li>
                    Click <span className="font-semibold text-slate-900">Send code</span>, then check your monitor
                    email inbox/spam.
                  </li>
                  <li>Enter the 6-digit code before it expires, then confirm the action.</li>
                </ul>
              </article>

              <article className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Email troubleshooting</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                  <li>
                    Use real recipient emails (seeded <span className="font-semibold">@cspams.local</span> addresses
                    will never receive mail).
                  </li>
                  <li>
                    If you see <span className="font-semibold text-slate-900">logged</span>, the backend is configured
                    to write emails to logs instead of sending.
                  </li>
                  <li>
                    If you see <span className="font-semibold text-slate-900">failed</span>, the provider rejected the
                    message; check Render logs and verify credentials.
                  </li>
                  <li>
                    For Gmail SMTP, <span className="font-semibold text-slate-900">MAIL_PASSWORD</span> must be a{" "}
                    <span className="font-semibold text-slate-900">Google App Password</span> (not your normal Gmail
                    password).
                  </li>
                </ul>
              </article>

              <article className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Forgot your monitor password?</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                  <li>
                    On the <span className="font-semibold text-slate-900">Sign In</span> page, choose{" "}
                    <span className="font-semibold text-slate-900">Division Monitor</span>.
                  </li>
                  <li>
                    Click <span className="font-semibold text-slate-900">Forgot password?</span> to request a reset
                    link by email.
                  </li>
                  <li>Open the email and set a new password, then sign in again.</li>
                </ul>
              </article>

              <article className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Can't access MFA email?</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                  <li>
                    On the MFA code screen, click{" "}
                    <span className="font-semibold text-slate-900">Can't access email? Request MFA reset</span>.
                  </li>
                  <li>
                    Submit the request, then ask another monitor to approve it via{" "}
                    <span className="font-semibold text-slate-900">Schools → More → MFA Reset Requests</span>.
                  </li>
                  <li>
                    Complete the reset using the approval token, then store the new{" "}
                    <span className="font-semibold text-slate-900">backup codes</span> securely.
                  </li>
                </ul>
              </article>
            </>
          ) : (
            <>
              <article className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Activate your account</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                  <li>
                    Your Division Monitor sends you a{" "}
                    <span className="font-semibold text-slate-900">one-time setup link</span> by email.
                  </li>
                  <li>Open the link and set your password. This activates your account.</li>
                  <li>After setup, sign in using your 6-digit school code and your new password.</li>
                </ul>
              </article>

              <article className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Forgot your password?</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                  <li>CSPAMS does not have a public forgot-password email button for School Heads.</li>
                  <li>
                    Ask your Division Monitor to use{" "}
                    <span className="font-semibold text-slate-900">Reset Link</span> to send you a new setup link.
                  </li>
                </ul>
              </article>

              <article className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Not receiving email?</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                  <li>Check spam/junk/promotions folders.</li>
                  <li>Confirm your email address in CSPAMS is correct.</li>
                  <li>If emails still don't arrive, tell your Division Monitor - email delivery may be misconfigured.</li>
                </ul>
              </article>
            </>
          )}
        </div>
      </section>
    </>
  );
}
