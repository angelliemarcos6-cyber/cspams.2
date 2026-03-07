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
      wrap: "border-primary-100 bg-primary-50/60",
      icon: "bg-white text-primary",
      label: "text-primary-700",
    },
    success: {
      wrap: "border-emerald-200 bg-emerald-50/60",
      icon: "bg-white text-emerald-600",
      label: "text-emerald-700",
    },
    warning: {
      wrap: "border-amber-200 bg-amber-50/60",
      icon: "bg-white text-amber-600",
      label: "text-amber-700",
    },
  }[tone];

  return (
    <article className={cn("rounded-2xl border p-4 shadow-sm", toneMap.wrap)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn("text-xs font-semibold uppercase tracking-wide", toneMap.label)}>{label}</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-900">{value}</p>
        </div>
        <span className={cn("grid h-11 w-11 place-items-center rounded-xl", toneMap.icon)}>{icon}</span>
      </div>
    </article>
  );
}