import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: "primary" | "success" | "warning";
}

export function StatCard({ label, value, icon, tone = "primary" }: StatCardProps) {
  const toneMap = {
    primary: {
      wrap: "border-primary-100 bg-primary-50/75 shadow-[0_14px_26px_-24px_rgba(2,46,80,0.45)]",
      icon: "bg-white text-primary shadow-sm",
      label: "text-primary-700",
      accent: "bg-primary-400/80",
    },
    success: {
      wrap: "border-emerald-200 bg-emerald-50/65 shadow-[0_14px_26px_-24px_rgba(5,150,105,0.42)]",
      icon: "bg-white text-emerald-600 shadow-sm",
      label: "text-emerald-700",
      accent: "bg-emerald-400/80",
    },
    warning: {
      wrap: "border-amber-200 bg-amber-50/65 shadow-[0_14px_26px_-24px_rgba(217,119,6,0.4)]",
      icon: "bg-white text-amber-600 shadow-sm",
      label: "text-amber-700",
      accent: "bg-amber-400/80",
    },
  }[tone];

  return (
    <article
      className={cn(
        "group relative overflow-hidden border p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_28px_-24px_rgba(2,46,80,0.55)]",
        toneMap.wrap,
      )}
    >
      <div className={cn("absolute left-0 top-0 h-1.5 w-full", toneMap.accent)} />
      <div className="pointer-events-none absolute right-0 top-0 h-16 w-16 -translate-y-6 translate-x-6 rounded-full bg-white/45 blur-2xl" />
      <div className="flex items-start justify-between gap-3 pt-1">
        <div>
          <p className={cn("text-[11px] font-semibold uppercase tracking-[0.12em]", toneMap.label)}>{label}</p>
          <p className="mt-2 text-3xl font-extrabold leading-none text-slate-900">{value}</p>
        </div>
        <span className={cn("grid h-11 w-11 place-items-center border border-slate-100 bg-white", toneMap.icon)}>{icon}</span>
      </div>
    </article>
  );
}
