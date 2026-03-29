import type { ReactNode } from "react";
import { X } from "lucide-react";

interface MonitorFiltersPanelProps {
  isOpen: boolean;
  isMobileViewport: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function MonitorFiltersPanel({
  isOpen,
  isMobileViewport,
  onClose,
  children,
}: MonitorFiltersPanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        className="fixed inset-0 z-[72] bg-slate-900/40"
        aria-label="Close filters"
      />
      <section
        id="monitor-submission-filters"
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        className={`fixed z-[73] animate-fade-slide border border-slate-200 bg-white p-4 shadow-2xl ${
          isMobileViewport
            ? "inset-x-0 bottom-0 max-h-[84vh] overflow-y-auto rounded-t-sm"
            : "left-1/2 top-24 w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 rounded-sm"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Filters</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
            aria-label="Close filters"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </section>
    </>
  );
}
