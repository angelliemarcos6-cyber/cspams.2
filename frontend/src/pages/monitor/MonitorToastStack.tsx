import { X } from "lucide-react";

interface MonitorToast {
  id: number;
  message: string;
  tone: "success" | "info" | "warning";
}

interface MonitorToastStackProps {
  toasts: MonitorToast[];
  onDismiss: (id: number) => void;
}

export function MonitorToastStack({ toasts, onDismiss }: MonitorToastStackProps) {
  return (
    <div
      style={{ top: "calc(var(--shell-sticky-top, 10rem) + 0.75rem)" }}
      className="pointer-events-none fixed right-4 z-[85] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <article
          key={toast.id}
          className={`pointer-events-auto rounded-sm border px-3 py-2 text-xs font-semibold shadow-lg ${
            toast.tone === "success"
              ? "border-primary-200 bg-primary-50 text-primary-700"
              : toast.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-slate-300 bg-white text-slate-700"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p>{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-sm border border-transparent p-0.5 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
