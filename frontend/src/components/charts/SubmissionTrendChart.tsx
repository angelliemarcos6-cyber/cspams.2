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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Recent Submissions</h3>
      <p className="text-xs text-slate-500">Record updates in the last 7 days</p>

      <div className="mt-3 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 10, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="submissionGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#04508C" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#04508C" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value: number) => [value, "Submissions"]} />
            <Area type="monotone" dataKey="count" stroke="#04508C" fill="url(#submissionGradient)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
