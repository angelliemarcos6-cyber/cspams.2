import type { ComponentProps } from "react";
import { AlertTriangle, ArrowDown, CheckCircle2 } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { RegionBarChart } from "@/components/charts/RegionBarChart";
import { StatusPieChart } from "@/components/charts/StatusPieChart";
import { SubmissionTrendChart } from "@/components/charts/SubmissionTrendChart";
import { MonitorQuickJumpChips, type MonitorQuickJumpBindings } from "@/pages/monitor/MonitorQuickJumpChips";

interface TargetsMetSummary {
  generatedAt: string | null;
  retentionRatePercent: number;
  dropoutRatePercent: number;
  completionRatePercent: number;
  atRiskLearners: number;
  studentTeacherRatio: string | number | null;
  studentClassroomRatio: string | number | null;
}

interface SyncAlert {
  id: string | number;
  level: string;
  title: string;
  message: string;
}

interface MonitorOverviewSectionProps {
  isMobileViewport: boolean;
  quickJumpBindings: MonitorQuickJumpBindings;
  sectionFocusClass: (targetId: string) => string;
  needsActionCount: number;
  returnedCount: number;
  submittedCount: number;
  renderAdvancedAnalytics: boolean;
  isHidingAdvancedAnalytics: boolean;
  targetsMet: TargetsMetSummary | null;
  syncAlerts: SyncAlert[];
  statusDistribution: ComponentProps<typeof StatusPieChart>["data"];
  regionAggregates: ComponentProps<typeof RegionBarChart>["data"];
  submissionTrend: ComponentProps<typeof SubmissionTrendChart>["data"];
}

export function MonitorOverviewSection({
  isMobileViewport,
  quickJumpBindings,
  sectionFocusClass,
  needsActionCount,
  returnedCount,
  submittedCount,
  renderAdvancedAnalytics,
  isHidingAdvancedAnalytics,
  targetsMet,
  syncAlerts,
  statusDistribution,
  regionAggregates,
  submissionTrend,
}: MonitorOverviewSectionProps) {
  return (
    <>
      <section className={`surface-panel dashboard-shell mb-5 animate-fade-slide overflow-hidden ${sectionFocusClass("monitor-reports-header")}`}>
        <div id="monitor-reports-header" className="border-b border-slate-200 bg-white px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Overview</h2>
              <p className="mt-1 text-xs text-slate-600">Summary cards and analytics for division monitoring.</p>
            </div>
            {!isMobileViewport && <MonitorQuickJumpChips {...quickJumpBindings} mobile={false} />}
          </div>
          {isMobileViewport && <MonitorQuickJumpChips {...quickJumpBindings} mobile />}
        </div>
        <div id="monitor-overview-metrics" className={`p-4 ${sectionFocusClass("monitor-overview-metrics")}`}>
          <div className="rounded-sm border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard label="Needs Action" value={needsActionCount.toLocaleString()} icon={<AlertTriangle className="h-5 w-5" />} tone="warning" />
              <StatCard label="Returned" value={returnedCount.toLocaleString()} icon={<ArrowDown className="h-5 w-5" />} tone="warning" />
              <StatCard label="Submitted" value={submittedCount.toLocaleString()} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
            </div>
          </div>
        </div>
      </section>

      {renderAdvancedAnalytics && (
        <section
          className={`surface-panel dashboard-shell overflow-hidden transition-[max-height,opacity,transform,margin] duration-[240ms] ease-in-out ${
            isHidingAdvancedAnalytics
              ? "mt-0 max-h-0 -translate-y-1 opacity-0 pointer-events-none"
              : "mt-5 max-h-[2600px] translate-y-0 opacity-100 animate-fade-slide"
          }`}
        >
          <div id="monitor-targets-snapshot" className={`p-4 ${sectionFocusClass("monitor-targets-snapshot")}`}>
            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <div id="monitor-sync-alerts" className={`rounded-sm border border-slate-200 bg-white p-5 ${sectionFocusClass("monitor-sync-alerts")}`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">TARGETS-MET Sync Snapshot</h2>
                  <span className="text-xs text-slate-500">
                    {targetsMet?.generatedAt ? `Generated ${new Date(targetsMet.generatedAt).toLocaleTimeString()}` : "Waiting for data"}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Retention Rate</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet ? `${targetsMet.retentionRatePercent.toFixed(2)}%` : "--"}</p>
                  </div>
                  <div className="border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Dropout Rate</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet ? `${targetsMet.dropoutRatePercent.toFixed(2)}%` : "--"}</p>
                  </div>
                  <div className="border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Completion Rate</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet ? `${targetsMet.completionRatePercent.toFixed(2)}%` : "--"}</p>
                  </div>
                  <div className="border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">At-Risk Learners</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet ? targetsMet.atRiskLearners.toLocaleString() : "--"}</p>
                  </div>
                  <div className="border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Student-Teacher Ratio</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet?.studentTeacherRatio ?? "--"}</p>
                  </div>
                  <div className="border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Student-Classroom Ratio</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{targetsMet?.studentClassroomRatio ?? "--"}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-sm border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Synchronized Alerts</h2>
                <div className="mt-4 space-y-3">
                  {syncAlerts.slice(0, 4).map((alert) => (
                    <article key={alert.id} className="border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{alert.level}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{alert.title}</p>
                      <p className="mt-1 text-xs text-slate-600">{alert.message}</p>
                    </article>
                  ))}
                  {syncAlerts.length === 0 && <p className="text-xs text-slate-500">No synchronized alerts yet.</p>}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-3">
              <div id="monitor-status-chart" className={`rounded-sm border border-slate-200 bg-white p-3 ${sectionFocusClass("monitor-status-chart")}`}>
                <StatusPieChart data={statusDistribution} />
              </div>
              <div id="monitor-region-chart" className={`rounded-sm border border-slate-200 bg-white p-3 ${sectionFocusClass("monitor-region-chart")}`}>
                <RegionBarChart data={regionAggregates} />
              </div>
              <div id="monitor-trend-chart" className={`rounded-sm border border-slate-200 bg-white p-3 ${sectionFocusClass("monitor-trend-chart")}`}>
                <SubmissionTrendChart data={submissionTrend} />
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
