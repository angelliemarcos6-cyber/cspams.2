import { BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import type { RegionAggregate } from "@/utils/analytics";

interface RegionBarChartProps {
  data: RegionAggregate[];
}

export function RegionBarChart({ data }: RegionBarChartProps) {
  return (
    <div className="surface-chart border p-4 transition duration-[120ms] hover:shadow-[0_20px_30px_-28px_rgba(2,46,80,0.52)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Regional Capacity Snapshot</h3>
          <p className="text-xs text-slate-500">Students and teachers per region</p>
        </div>
        <span className="grid h-8 w-8 place-items-center border border-primary-100 bg-primary-50 text-primary shadow-sm">
          <BarChart3 className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-3 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="region" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={55} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ borderRadius: "8px", borderColor: "#cbd5e1" }} />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Bar dataKey="students" fill="#04508C" radius={[6, 6, 0, 0]} />
            <Bar dataKey="teachers" fill="#649DD8" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
