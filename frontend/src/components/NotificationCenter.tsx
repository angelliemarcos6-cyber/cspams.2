import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useNotifications } from "@/context/Notifications";

function formatRelativeTime(value: string | null): string {
  if (!value) return "Just now";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

export function NotificationCenter() {
  const { notifications, unreadCount, isLoading, error, refreshNotifications, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const visibleNotifications = useMemo(() => notifications.slice(0, 8), [notifications]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      void refreshNotifications();
    }
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="relative inline-flex h-9 items-center gap-1.5 border border-white/35 bg-white/12 px-3 text-xs font-semibold text-white transition hover:bg-white/20"
      >
        <Bell className="h-3.5 w-3.5" />
        Notifications
        {unreadCount > 0 && (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-[60] w-[22rem] overflow-hidden rounded-sm border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Notifications</p>
            <button
              type="button"
              onClick={() => void markAllAsRead()}
              disabled={unreadCount === 0}
              className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {isLoading && visibleNotifications.length === 0 ? (
              <p className="px-3 py-4 text-xs text-slate-500">Loading notifications...</p>
            ) : error ? (
              <p className="px-3 py-4 text-xs text-rose-700">{error}</p>
            ) : visibleNotifications.length === 0 ? (
              <p className="px-3 py-4 text-xs text-slate-500">No notifications yet.</p>
            ) : (
              visibleNotifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void markAsRead(notification.id)}
                  className={`block w-full border-b border-slate-100 px-3 py-2 text-left transition last:border-b-0 hover:bg-slate-50 ${
                    notification.readAt ? "bg-white" : "bg-primary-50/40"
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-900">{notification.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{notification.message}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{formatRelativeTime(notification.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
