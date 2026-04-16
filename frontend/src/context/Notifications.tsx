import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/Auth";
import { apiRequestRaw, COOKIE_SESSION_TOKEN, isApiError } from "@/lib/api";
import type { AppNotification, AppNotificationListMeta } from "@/types";

interface NotificationListResponse {
  data: AppNotification[];
  meta?: AppNotificationListMeta;
}

interface NotificationReadResponse {
  data: AppNotification;
}

interface NotificationReadAllResponse {
  data?: {
    updated?: number;
  };
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  error: string;
  lastSyncedAt: string | null;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);
const AUTO_SYNC_INTERVAL_MS = 20_000;
const DEFAULT_PER_PAGE = 40;

function normalizeMeta(meta: AppNotificationListMeta | undefined, notifications: AppNotification[]): AppNotificationListMeta {
  return {
    currentPage: meta?.currentPage ?? 1,
    lastPage: Math.max(1, meta?.lastPage ?? 1),
    perPage: meta?.perPage ?? DEFAULT_PER_PAGE,
    total: meta?.total ?? notifications.length,
    unreadCount:
      typeof meta?.unreadCount === "number"
        ? meta.unreadCount
        : notifications.filter((entry) => !entry.readAt).length,
  };
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const token = user ? COOKIE_SESSION_TOKEN : "";

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const handleApiError = useCallback(
    (err: unknown) => {
      if (isApiError(err) && (err.status === 401 || err.status === 403)) {
        return; // Auth.tsx heartbeat handles session expiry.
      }

      setError(err instanceof Error ? err.message : "Unexpected server error.");
    },
    [],
  );

  const syncNotifications = useCallback(
    async (silent = false) => {
      if (!token) {
        setNotifications([]);
        setUnreadCount(0);
        setError("");
        setLastSyncedAt(null);
        setIsLoading(false);
        return;
      }

      if (!silent) {
        setIsLoading(true);
      }
      setError("");

      try {
        const response = await apiRequestRaw<NotificationListResponse>(`/api/notifications?per_page=${DEFAULT_PER_PAGE}`, {
          token,
        });
        const rows = Array.isArray(response.data?.data) ? response.data.data : [];
        const meta = normalizeMeta(response.data?.meta, rows);

        setNotifications(rows);
        setUnreadCount(meta.unreadCount);
        setLastSyncedAt(new Date().toISOString());
      } catch (err) {
        handleApiError(err);
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [token, handleApiError],
  );

  const refreshNotifications = useCallback(async () => {
    await syncNotifications(false);
  }, [syncNotifications]);

  const markAsRead = useCallback(
    async (id: string) => {
      if (!token) return;

      try {
        const response = await apiRequestRaw<NotificationReadResponse>(`/api/notifications/${id}/read`, {
          method: "POST",
          token,
        });
        const next = response.data?.data;

        if (next) {
          setNotifications((current) => current.map((entry) => (entry.id === id ? next : entry)));
          setUnreadCount((current) => Math.max(0, current - 1));
        } else {
          await syncNotifications(true);
        }
      } catch (err) {
        handleApiError(err);
      }
    },
    [token, syncNotifications, handleApiError],
  );

  const markAllAsRead = useCallback(async () => {
    if (!token) return;

    try {
      await apiRequestRaw<NotificationReadAllResponse>("/api/notifications/read-all", {
        method: "POST",
        token,
      });
      const nowIso = new Date().toISOString();
      setNotifications((current) =>
        current.map((entry) => (entry.readAt ? entry : { ...entry, readAt: nowIso })),
      );
      setUnreadCount(0);
    } catch (err) {
      handleApiError(err);
    }
  }, [token, handleApiError]);

  useEffect(() => {
    void syncNotifications(false);
  }, [syncNotifications]);

  useEffect(() => {
    if (!token) return;

    const interval = window.setInterval(() => {
      void syncNotifications(true);
    }, AUTO_SYNC_INTERVAL_MS);

    const syncOnFocus = () => {
      void syncNotifications(true);
    };

    const syncOnRealtime = (event: Event) => {
      const payload = (event as CustomEvent<{ entity?: string; eventType?: string }>).detail;
      if (!payload) return;

      if (payload.entity === "indicators" || payload.eventType === "school_records.reminder_sent") {
        void syncNotifications(true);
      }
    };

    window.addEventListener("focus", syncOnFocus);
    window.addEventListener("online", syncOnFocus);
    window.addEventListener("cspams:update", syncOnRealtime);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncOnFocus);
      window.removeEventListener("online", syncOnFocus);
      window.removeEventListener("cspams:update", syncOnRealtime);
    };
  }, [token, syncNotifications]);

  const value = useMemo<NotificationContextType>(
    () => ({
      notifications,
      unreadCount,
      isLoading,
      error,
      lastSyncedAt,
      refreshNotifications,
      markAsRead,
      markAllAsRead,
    }),
    [
      notifications,
      unreadCount,
      isLoading,
      error,
      lastSyncedAt,
      refreshNotifications,
      markAsRead,
      markAllAsRead,
    ],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}
