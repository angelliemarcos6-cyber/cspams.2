import { CalendarDays, LogOut, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ActiveSessionsCenter } from "@/components/ActiveSessionsCenter";
import { NotificationCenter } from "@/components/NotificationCenter";
import { useAuth } from "@/context/Auth";
import type { ReactNode } from "react";

interface ShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function Shell({ title, subtitle, children, actions }: ShellProps) {
  const { role, username, logout, isLoggingOut } = useAuth();
  const navigate = useNavigate();
  const signInHref = "#/";

  const roleLabel = role === "school_head" ? "School Head" : "Division Monitor";

  const handleSignOut = async () => {
    if (isLoggingOut) return;
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-page-bg">
      <header className="sticky top-0 z-50 border-b border-primary-200/25 bg-primary-800 shadow-2xl shadow-primary-900/30">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a
            href={signInHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 pl-3"
          >
            <img src="/depedlogo.png" alt="DepEd logo" className="h-11 w-auto border border-slate-200/90 bg-white px-1.5 py-1 shadow-sm" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-100">CSPAMS</p>
              <p className="text-sm font-bold text-white">School Management, Monitoring and Evaluation</p>
            </div>
          </a>

          <div className="flex items-center gap-2 text-white">
            <div className="hidden rounded-sm border border-white/20 bg-white/8 px-3 py-1.5 text-xs shadow-sm sm:block">
              <p className="font-semibold">{roleLabel}</p>
              <p className="text-primary-100">{username}</p>
            </div>
            <div className="inline-flex items-center gap-1 rounded-sm border border-white/20 bg-white/8 p-1">
              <ActiveSessionsCenter />
              <NotificationCenter />
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isLoggingOut}
              className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-white/28 bg-white/10 px-3 text-xs font-semibold transition hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <LogOut className="h-3.5 w-3.5" />
              {isLoggingOut ? "Signing Out..." : "Sign Out"}
            </button>
          </div>
        </div>
        <div className="h-1 w-full bg-primary-300/60" />
        <div className="border-t border-white/12 bg-primary-800/90">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="pl-3">
              <p className="inline-flex items-center gap-2 border border-white/25 bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-100 shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                {roleLabel} Workspace
              </p>
              <h1 className="mt-2 text-2xl font-extrabold text-white">{title}</h1>
              <p className="mt-1 text-sm text-primary-100">{subtitle}</p>
            </div>

            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:flex-nowrap lg:w-auto">
              <div className="min-w-0">{actions}</div>
              <span className="inline-flex h-9 items-center gap-2 rounded-sm border border-white/25 bg-white/12 px-3 text-xs font-semibold text-white shadow-sm">
                <CalendarDays className="h-3.5 w-3.5" />
                {new Date().toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-8 pt-0 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
