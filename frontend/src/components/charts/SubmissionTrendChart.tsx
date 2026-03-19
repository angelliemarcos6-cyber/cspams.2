import { Activity } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

interface TrendPoint {
  label: string;
  count: number;
}

interface SubmissionTrendChartProps {
  data: TrendPoint[];
}

export function SubmissionTrendChart({ data }: SubmissionTrendChartProps) {
  return (
    <div className="surface-chart border p-4 transition duration-[120ms] hover:shadow-[0_20px_30px_-28px_rgba(2,46,80,0.52)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Recent Submissions</h3>
          <p className="text-xs text-slate-500">Record updates in the last 7 days</p>
        </div>
        <span className="grid h-8 w-8 place-items-center border border-primary-100 bg-primary-50 text-primary shadow-sm">
          <Activity className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-3 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 10, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number) => [value, "Submissions"]}
              contentStyle={{ borderRadius: "8px", borderColor: "#cbd5e1" }}
            />
            <Area type="monotone" dataKey="count" stroke="#04508C" fill="#04508C33" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
