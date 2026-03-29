import {
  BookOpenText,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import {
  MONITOR_NAVIGATOR_ICONS,
  MONITOR_TOP_NAVIGATOR_ITEMS,
} from "@/pages/monitor/monitorDashboardConfig";
import { navigatorButtonClass } from "@/pages/monitor/monitorDashboardUiUtils";
import type { MonitorTopNavigatorId } from "@/pages/monitor/monitorFilters";

interface MonitorNavigatorBadge {
  primary?: number;
  secondary?: number;
  urgency: "none" | "high" | "medium";
}

interface MonitorSideNavigatorProps {
  activeTopNavigator: MonitorTopNavigatorId;
  navigatorBadges: Record<MonitorTopNavigatorId, MonitorNavigatorBadge>;
  isNavigatorCompact: boolean;
  isNavigatorVisible: boolean;
  isMobileViewport: boolean;
  showNavigatorManual: boolean;
  shouldRenderNavigatorItems: boolean;
  showNavigatorHeaderText: boolean;
  onToggleNavigator: () => void;
  onNavigate: (id: MonitorTopNavigatorId) => void;
  onToggleManual: () => void;
}

export function MonitorSideNavigator({
  activeTopNavigator,
  navigatorBadges,
  isNavigatorCompact,
  isNavigatorVisible,
  isMobileViewport,
  showNavigatorManual,
  shouldRenderNavigatorItems,
  showNavigatorHeaderText,
  onToggleNavigator,
  onNavigate,
  onToggleManual,
}: MonitorSideNavigatorProps) {
  return (
    <aside className="dashboard-side-rail hidden w-full rounded-sm p-3 transition-[padding] duration-[240ms] ease-in-out lg:block lg:w-auto lg:self-stretch lg:min-h-full">
      <div className="dashboard-side-rail-sticky flex min-h-full flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className={`w-full ${showNavigatorHeaderText ? "" : "text-center"}`}>
            <div className="flex items-center">
              <button
                type="button"
                onClick={onToggleNavigator}
                className={`inline-flex shrink-0 items-center rounded-sm border border-primary-400/40 bg-primary-700/65 text-white transition hover:bg-primary-700 ${
                  showNavigatorHeaderText
                    ? "h-11 w-full justify-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide"
                    : "h-11 w-11 justify-center"
                }`}
                aria-label={
                  isMobileViewport
                    ? isNavigatorVisible
                      ? "Hide navigator"
                      : "Show navigator"
                    : isNavigatorCompact
                      ? "Expand navigator"
                      : "Collapse navigator"
                }
                title={
                  isMobileViewport
                    ? isNavigatorVisible
                      ? "Hide navigator"
                      : "Show navigator"
                    : isNavigatorCompact
                      ? "Expand navigator"
                      : "Collapse navigator"
                }
              >
                {isMobileViewport ? (
                  isNavigatorVisible ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                ) : isNavigatorCompact ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronLeft className="h-3.5 w-3.5" />
                )}
                {showNavigatorHeaderText && (
                  <span>
                    {isMobileViewport
                      ? isNavigatorVisible
                        ? "Hide Menu"
                        : "Show Menu"
                      : isNavigatorCompact
                        ? "Expand Menu"
                        : "Collapse Menu"}
                  </span>
                )}
              </button>
            </div>
            <p
              className={`overflow-hidden text-[11px] font-medium uppercase tracking-wide text-primary-100 transition-[max-height,opacity,margin] duration-[240ms] ease-in-out ${
                showNavigatorHeaderText ? "mt-1 max-h-5 opacity-100" : "mt-0 max-h-0 opacity-0"
              }`}
            >
              Division Monitor
            </p>
          </div>
        </div>

        <div
          className={`overflow-hidden transition-[max-height,opacity,margin] duration-[240ms] ease-in-out ${
            shouldRenderNavigatorItems ? "mt-4 max-h-[34rem] opacity-100" : "mt-0 max-h-0 opacity-0 pointer-events-none"
          }`}
        >
          <div className={`grid ${isNavigatorCompact ? "gap-2" : "gap-2.5"}`}>
            {MONITOR_TOP_NAVIGATOR_ITEMS.map((item, index) => {
              const Icon = MONITOR_NAVIGATOR_ICONS[item.id];
              const isActive = activeTopNavigator === item.id;
              const meta = navigatorBadges[item.id];
              const hasPrimaryBadge = typeof meta.primary === "number" && meta.primary > 0;
              const hasSecondaryBadge = typeof meta.secondary === "number" && meta.secondary > 0;
              const urgencyTone =
                meta.urgency === "high" ? "bg-rose-500" : meta.urgency === "medium" ? "bg-amber-400" : "bg-transparent";

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={navigatorButtonClass(isActive, isNavigatorCompact)}
                  title={`${item.label} (Alt+${index + 1})`}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`Open ${item.label}`}
                >
                  <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
                    <Icon className="h-4 w-4" />
                    {meta.urgency !== "none" && (
                      <span className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${urgencyTone}`} />
                    )}
                  </span>
                  {!isNavigatorCompact && <span className="flex-1 truncate text-left">{item.label}</span>}

                  {!isNavigatorCompact && hasPrimaryBadge && (
                    <span className="ml-auto inline-flex items-center gap-1">
                      <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-sm border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">
                        {meta.primary}
                      </span>
                      {item.id === "reviews" && hasSecondaryBadge && (
                        <span className="inline-flex items-center justify-center rounded-sm border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          R{meta.secondary}
                        </span>
                      )}
                    </span>
                  )}

                  {isNavigatorCompact && hasPrimaryBadge && (
                    <span className="absolute right-1 top-1 inline-flex min-w-[1rem] items-center justify-center rounded-sm border border-primary-200 bg-primary-50 px-1 text-[9px] font-bold text-primary-700">
                      {meta.primary && meta.primary > 99 ? "99+" : meta.primary}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className={`overflow-hidden transition-[max-height,opacity,margin] duration-[240ms] ease-in-out ${
            shouldRenderNavigatorItems ? "mt-3 max-h-24 opacity-100" : "mt-0 max-h-0 opacity-0 pointer-events-none"
          }`}
        >
          <div className={`border-t border-primary-400/30 pt-3 ${isNavigatorCompact ? "flex justify-center" : ""}`}>
            <button
              type="button"
              onClick={onToggleManual}
              className={`inline-flex items-center gap-1.5 rounded-sm border text-white transition ${
                showNavigatorManual
                  ? "border-primary-100 bg-primary-700"
                  : "border-primary-400/40 bg-primary-700/65 hover:bg-primary-700"
              } ${
                isNavigatorCompact ? "h-11 w-11 justify-center p-0" : "h-11 w-full px-3 py-2 text-xs font-semibold uppercase tracking-wide"
              }`}
              title={showNavigatorManual ? "Close User Manual" : "Open User Manual"}
              aria-label={showNavigatorManual ? "Close user manual" : "Open user manual"}
            >
              <BookOpenText className="h-3.5 w-3.5" />
              {!isNavigatorCompact && <span>{showNavigatorManual ? "Back to Data" : "User Manual"}</span>}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
