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
      wrap: "border-primary-100 bg-primary-50/70",
      icon: "bg-white text-primary",
      label: "text-primary-700",
      accent: "bg-primary-400/80",
    },
    success: {
      wrap: "border-emerald-200 bg-emerald-50/60",
      icon: "bg-white text-emerald-600",
      label: "text-emerald-700",
      accent: "bg-emerald-400/80",
    },
    warning: {
      wrap: "border-amber-200 bg-amber-50/60",
      icon: "bg-white text-amber-600",
      label: "text-amber-700",
      accent: "bg-amber-400/80",
    },
  }[tone];

  return (
    <article className={cn("group relative overflow-hidden rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md", toneMap.wrap)}>
      <div className={cn("absolute left-0 top-0 h-full w-1.5", toneMap.accent)} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn("pl-2 text-xs font-semibold uppercase tracking-wide", toneMap.label)}>{label}</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-900">{value}</p>
        </div>
        <span className={cn("grid h-11 w-11 place-items-center rounded-xl shadow-sm", toneMap.icon)}>{icon}</span>
      </div>
    </article>
  );
}
