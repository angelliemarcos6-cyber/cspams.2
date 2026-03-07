import { MapPinned } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface RegionCardProps {
  region: string;
  schools: number;
  activeSchools: number;
  students: number;
  teachers: number;
}

export function RegionCard({ region, schools, activeSchools, students, teachers }: RegionCardProps) {
  const inactiveSchools = Math.max(schools - activeSchools, 0);
  const activePercent = schools > 0 ? Math.round((activeSchools / schools) * 100) : 0;

  const chartData = [
    { name: "Active", value: activeSchools, color: "#10b981" },
    { name: "Inactive", value: inactiveSchools, color: "#e2e8f0" },
  ];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MapPinned className="h-4 w-4 text-primary" />
            {region}
          </p>
          <p className="mt-1 text-xs text-slate-500">{activeSchools} of {schools} schools active</p>
        </div>

        <div className="relative h-16 w-16 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="value" innerRadius={21} outerRadius={30} startAngle={90} endAngle={-270}>
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 grid place-items-center text-xs font-bold text-slate-900">{activePercent}%</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
        <div>
          <p className="text-lg font-bold text-slate-900">{schools}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Schools</p>
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900">{students.toLocaleString()}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Students</p>
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900">{teachers.toLocaleString()}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Teachers</p>
        </div>
      </div>
    </article>
  );
}
