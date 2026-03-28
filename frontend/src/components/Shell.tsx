import { CalendarDays, LogOut, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ActiveSessionsCenter } from "@/components/ActiveSessionsCenter";
import { NotificationCenter } from "@/components/NotificationCenter";
import { useAuth } from "@/context/Auth";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

interface ShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function Shell({ title, subtitle, children, actions }: ShellProps) {
  const { role, logout, isLoggingOut } = useAuth();
  const navigate = useNavigate();
  const headerRef = useRef<HTMLElement | null>(null);
  const [shellCssVars, setShellCssVars] = useState<{ headerHeight: number; stickyTop: number } | null>(null);
  const [signOutError, setSignOutError] = useState("");

  const roleLabel = role === "school_head" ? "School Head" : "Division Monitor";
  const appTagline = "Centralized Student Performance Analytics and Monitoring System";

  const handleSignOut = async () => {
    if (isLoggingOut) return;
    setSignOutError("");

    try {
      await logout({ force: true });
      navigate("/", { replace: true });
    } catch (err) {
      setSignOutError(err instanceof Error ? err.message : "Logout failed. Try again.");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const header = headerRef.current;
    if (!header) return;

    const measure = () => {
      const height = Math.max(0, Math.round(header.getBoundingClientRect().height));
      if (height === 0) return;

      const stickyTop = height + 8;
      setShellCssVars((current) => {
        if (current?.headerHeight === height && current.stickyTop === stickyTop) {
          return current;
        }
        return { headerHeight: height, stickyTop };
      });
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(() => measure());
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const shellStyle: CSSProperties | undefined = shellCssVars
    ? ({
        ["--shell-header-height" as any]: `${shellCssVars.headerHeight}px`,
        ["--shell-sticky-top" as any]: `${shellCssVars.stickyTop}px`,
      } as CSSProperties)
    : undefined;

  return (
    <div className="min-h-screen overflow-x-hidden bg-page-bg" style={shellStyle}>
      <header
        ref={headerRef}
        className="sticky top-0 z-50 border-b border-primary-200/20 bg-gradient-to-r from-primary-900 via-primary-800 to-primary-800 shadow-2xl shadow-primary-900/30"
      >
        <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:min-h-16 sm:flex-nowrap sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate("/", { replace: true })}
            className="flex min-w-0 items-center gap-2 border-0 bg-transparent p-0 text-left sm:gap-3"
          >
            <img
              src="/depedlogo.png"
              alt="DepEd logo"
              className="h-9 w-auto rounded-md border border-slate-200/90 bg-white px-1.5 py-1 shadow-sm sm:h-11"
            />
            <div className="min-w-0 leading-tight">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-100">CSPAMS</p>
              <p
                className="hidden max-w-[42rem] truncate text-sm font-semibold tracking-tight text-white/95 lg:block"
                title={appTagline}
              >
                {appTagline}
              </p>
              <p className="line-clamp-1 text-[11px] font-semibold text-primary-100 lg:hidden" title={appTagline}>
                Student Performance Analytics
              </p>
            </div>
          </button>

          <div className="flex max-w-full items-center justify-end gap-1.5 text-white sm:gap-3">
            <div className="inline-flex h-10 items-center gap-1 rounded-md border border-white/20 bg-white/10 px-1.5 shadow-sm backdrop-blur-sm">
              <ActiveSessionsCenter />
              <NotificationCenter />
            </div>
            <span className="hidden h-10 items-center gap-2 rounded-md border border-white/25 bg-white/10 px-3 text-xs font-semibold text-white shadow-sm md:inline-flex">
              <CalendarDays className="h-3.5 w-3.5" />
              {new Date().toLocaleDateString()}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isLoggingOut}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-white/28 bg-white/10 px-2 text-xs font-semibold shadow-sm transition hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-70 sm:px-3"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isLoggingOut ? "Signing Out..." : "Sign Out"}</span>
              <span className="sm:hidden">{isLoggingOut ? "..." : "Out"}</span>
            </button>
            {signOutError && (
              <span
                className="hidden max-w-[14rem] truncate text-[11px] font-semibold text-red-100 sm:inline"
                title={signOutError}
              >
                {signOutError}
              </span>
            )}
          </div>
        </div>
        <div className="h-1 w-full bg-primary-300/60" />
        <div className="border-t border-white/12 bg-primary-800/90">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-3 py-2.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 border border-white/25 bg-white/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary-100 shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                {roleLabel} Workspace
              </p>
              <h1 className="mt-1 text-lg font-extrabold text-white sm:mt-2 sm:text-2xl">{title}</h1>
              <p className="mt-1 line-clamp-1 text-[11px] text-primary-100 sm:text-sm">{subtitle}</p>
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
