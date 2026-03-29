import {
  MONITOR_NAVIGATOR_ICONS,
  MONITOR_TOP_NAVIGATOR_ITEMS,
} from "@/pages/monitor/monitorDashboardConfig";
import type { MonitorTopNavigatorId } from "@/pages/monitor/monitorFilters";

interface MonitorNavigatorBadge {
  primary?: number;
  secondary?: number;
  urgency: "none" | "high" | "medium";
}

interface MonitorMobileNavigatorProps {
  activeTopNavigator: MonitorTopNavigatorId;
  navigatorBadges: Record<MonitorTopNavigatorId, MonitorNavigatorBadge>;
  onNavigate: (id: MonitorTopNavigatorId) => void;
}

export function MonitorMobileNavigator({
  activeTopNavigator,
  navigatorBadges,
  onNavigate,
}: MonitorMobileNavigatorProps) {
  return (
    <section className="dashboard-shell mb-4 rounded-sm border border-slate-200 bg-white p-2 lg:hidden">
      <div className="grid grid-cols-3 gap-2">
        {MONITOR_TOP_NAVIGATOR_ITEMS.map((item) => {
          const Icon = MONITOR_NAVIGATOR_ICONS[item.id];
          const isActive = activeTopNavigator === item.id;
          const meta = navigatorBadges[item.id];
          const count = typeof meta.primary === "number" && meta.primary > 0 ? meta.primary : null;

          return (
            <button
              key={`monitor-mobile-nav-${item.id}`}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`rounded-sm border px-2 py-2 text-left transition ${
                isActive
                  ? "border-primary-300 bg-primary-50 text-primary-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate text-sm font-semibold">{item.label}</span>
              </div>
              <div className="mt-1 flex items-center gap-1">
                {count !== null && (
                  <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-sm border border-primary-200 bg-white px-1 py-0.5 text-[10px] font-bold text-primary-700">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
                {item.id === "reviews" && typeof meta.secondary === "number" && meta.secondary > 0 && (
                  <span className="inline-flex items-center justify-center rounded-sm border border-amber-200 bg-amber-50 px-1 py-0.5 text-[10px] font-bold text-amber-700">
                    R{meta.secondary}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
