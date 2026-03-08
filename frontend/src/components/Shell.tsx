import { CalendarDays, LogOut, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/Auth";
import type { ReactNode } from "react";

interface ShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function Shell({ title, subtitle, children, actions }: ShellProps) {
  const { role, username, logout } = useAuth();
  const navigate = useNavigate();

  const roleLabel = role === "school_head" ? "School Head" : "Division Monitor";

  const handleSignOut = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-page-bg">
      <header className="sticky top-0 z-50 border-b border-primary-200/25 bg-gradient-to-r from-primary-800 via-primary to-primary-700 shadow-lg shadow-primary-900/25">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img src="/depedlogo.png" alt="DepEd logo" className="h-11 w-auto rounded-sm bg-white px-1.5 py-1" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-100">CSPAMS</p>
              <p className="text-sm font-bold text-white">School Management, Monitoring and Evaluation</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-white">
            <div className="hidden rounded-sm bg-white/10 px-3 py-1.5 text-xs sm:block">
              <p className="font-semibold">{roleLabel}</p>
              <p className="text-primary-100">{username}</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-sm border border-white/35 bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
        <div className="border-t border-white/12 bg-primary-800/70 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <p className="inline-flex items-center gap-2 rounded-sm border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-100">
                <ShieldCheck className="h-3.5 w-3.5" />
                {roleLabel} Workspace
              </p>
              <h1 className="mt-2 text-2xl font-extrabold text-white">{title}</h1>
              <p className="mt-1 text-sm text-primary-100">{subtitle}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <span className="inline-flex items-center gap-2 rounded-sm border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-white">
                <CalendarDays className="h-3.5 w-3.5" />
                {new Date().toLocaleDateString()}
              </span>
              {actions}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-6 pt-0 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
