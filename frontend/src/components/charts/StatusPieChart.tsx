import { PieChart as PieChartIcon } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface StatusDataItem {
  name: string;
  value: number;
  color: string;
}

interface StatusPieChartProps {
  data: StatusDataItem[];
}

export function StatusPieChart({ data }: StatusPieChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="surface-chart border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">School Status Distribution</h3>
          <p className="text-xs text-slate-500">Active, inactive and pending reporting status</p>
        </div>
        <span className="grid h-8 w-8 place-items-center border border-primary-100 bg-primary-50 text-primary">
          <PieChartIcon className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-3 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={56} outerRadius={84} paddingAngle={2}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [value.toLocaleString(), "Schools"]}
              contentStyle={{ borderRadius: "8px", borderColor: "#cbd5e1" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="-mt-2 grid grid-cols-3 gap-2 text-xs">
        {data.map((entry) => (
          <div key={entry.name} className="border border-slate-200 bg-white/80 px-2 py-1.5">
            <span className="font-semibold text-slate-700">{entry.name}</span>
            <p className="text-slate-500">{entry.value}</p>
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-slate-500">Total schools: <span className="font-semibold text-slate-700">{total}</span></p>
    </div>
  );
}
