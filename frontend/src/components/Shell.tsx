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
  const { role, logout, isLoggingOut } = useAuth();
  const navigate = useNavigate();
  const signInHref = "#/";

  const roleLabel = role === "school_head" ? "School Head" : "Division Monitor";

  const handleSignOut = async () => {
    if (isLoggingOut) return;
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-page-bg">
      <header className="sticky top-0 z-50 border-b border-primary-200/25 bg-primary-800 shadow-2xl shadow-primary-900/30">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:h-16 sm:flex-nowrap sm:px-6 lg:px-8">
          <a
            href={signInHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-2 sm:gap-3"
          >
            <img src="/depedlogo.png" alt="DepEd logo" className="h-9 w-auto border border-slate-200/90 bg-white px-1.5 py-1 shadow-sm sm:h-11" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-100">CSPAMS</p>
              <p className="hidden text-sm font-bold text-white lg:block">School Management, Monitoring and Evaluation</p>
              <p className="truncate text-xs font-semibold text-primary-100 lg:hidden">Monitoring Dashboard</p>
            </div>
          </a>

          <div className="flex max-w-full items-center justify-end gap-1.5 text-white sm:gap-2">
            <div className="inline-flex items-center gap-1 rounded-sm border border-white/20 bg-white/8 p-1">
              <ActiveSessionsCenter />
              <NotificationCenter />
            </div>
            <span className="hidden h-9 items-center gap-2 rounded-sm border border-white/25 bg-white/12 px-3 text-xs font-semibold text-white shadow-sm sm:inline-flex">
              <CalendarDays className="h-3.5 w-3.5" />
              {new Date().toLocaleDateString()}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isLoggingOut}
              className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-white/28 bg-white/10 px-2 text-xs font-semibold transition hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-70 sm:px-3"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isLoggingOut ? "Signing Out..." : "Sign Out"}</span>
              <span className="sm:hidden">{isLoggingOut ? "..." : "Out"}</span>
            </button>
          </div>
        </div>
        <div className="h-1 w-full bg-primary-300/60" />
        <div className="border-t border-white/12 bg-primary-800/90">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 border border-white/25 bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-100 shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                {roleLabel} Workspace
              </p>
              <h1 className="mt-1 text-xl font-extrabold text-white sm:mt-2 sm:text-2xl">{title}</h1>
              <p className="mt-1 text-xs text-primary-100 sm:text-sm">{subtitle}</p>
            </div>

            <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:justify-end lg:w-auto">
              <div className="min-w-0">{actions}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-3 pb-8 pt-0 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
