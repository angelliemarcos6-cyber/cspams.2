import type { QuickJumpItem } from "@/pages/monitor/monitorDashboardConfig";
import type { MonitorQuickJumpMeta } from "@/pages/monitor/useMonitorQuickJump";

export interface MonitorQuickJumpBindings {
  items: QuickJumpItem[];
  getQuickJumpMeta: (item: QuickJumpItem) => MonitorQuickJumpMeta;
  onQuickJump: (item: QuickJumpItem) => void;
}

interface MonitorQuickJumpChipsProps extends MonitorQuickJumpBindings {
  mobile: boolean;
}

export function MonitorQuickJumpChips({
  items,
  mobile,
  getQuickJumpMeta,
  onQuickJump,
}: MonitorQuickJumpChipsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={mobile ? "mt-2 flex gap-2 overflow-x-auto pb-1" : "flex flex-wrap items-center justify-end gap-2"}>
      {items.map((item, index) => {
        const Icon = item.icon;
        const { isActive, isAvailable } = getQuickJumpMeta(item);
        const shortcutLabel = index < 9 ? `Alt+Shift+${index + 1}` : null;

        return (
          <button
            key={`monitor-quick-jump-${item.id}`}
            type="button"
            onClick={() => onQuickJump(item)}
            disabled={!isAvailable}
            aria-pressed={isActive}
            title={shortcutLabel ? `${item.label} (${shortcutLabel})` : item.label}
            className={`inline-flex shrink-0 items-center gap-1 rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold transition ${
              isActive
                ? "border-primary-300 bg-primary-50 text-primary-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            } ${isAvailable ? "" : "cursor-not-allowed opacity-50"}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
