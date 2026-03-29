import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/Auth";
import { isApiError } from "@/lib/api";

export function SetupAccount() {
  const [searchParams] = useSearchParams();
  const { completeAccountSetup, isAuthenticating } = useAuth();

  const initialToken = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!token.trim()) {
      setError("Setup token is required.");
      return;
    }

    if (!password || !confirmPassword) {
      setError("Enter and confirm your new password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Password and confirmation do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const message = await completeAccountSetup({
        token: token.trim(),
        password,
        confirmPassword,
      });
      setSuccessMessage(message);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (isApiError(err)) {
        setError(err.message);
      } else {
        setError("Unable to complete account setup. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-page-bg px-4 py-8">
      <div className="w-full max-w-xl rounded-sm border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary-700">
            <ShieldCheck className="h-4 w-4" />
            Account Setup
          </p>
          <h1 className="mt-2 text-xl font-bold text-slate-900">Set your School Head password</h1>
          <p className="mt-1 text-sm text-slate-600">
            Complete this one-time setup to submit your account for Division Monitor approval.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="setup-token" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Setup Token
            </label>
            <input
              id="setup-token"
              type="text"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste the token from your setup link"
              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
          </div>

          <div>
            <label htmlFor="setup-password" className="mb-1.5 block text-sm font-semibold text-slate-700">
              New Password
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="setup-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter new password"
                className="w-full rounded-sm border border-slate-200 bg-white py-2.5 pl-10 pr-11 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="setup-password-confirm" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Confirm Password
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="setup-password-confirm"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm new password"
                className="w-full rounded-sm border border-slate-200 bg-white py-2.5 pl-10 pr-11 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((current) => !current)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
              {error}
            </p>
          )}
          {successMessage && (
            <div className="rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
              <p className="font-semibold">Setup completed.</p>
              <p className="mt-1">{successMessage}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isAuthenticating}
            className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting || isAuthenticating ? "Completing setup..." : "Complete Setup"}
          </button>

          <p className="text-center text-xs text-slate-500">
            Ready to sign in later?{" "}
            <Link className="font-semibold text-primary-700 hover:text-primary-800" to="/">
              Go to sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
