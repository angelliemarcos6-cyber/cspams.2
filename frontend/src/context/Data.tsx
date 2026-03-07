import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/Auth";
import { apiRequest, isApiError } from "@/lib/api";
import type { SchoolRecord, SchoolRecordPayload } from "@/types";

type SyncScope = "division" | "school" | null;

interface SchoolRecordsResponse {
  data: SchoolRecord[];
  meta?: {
    syncedAt?: string;
    scope?: string;
    recordCount?: number;
  };
}

interface DataContextType {
  records: SchoolRecord[];
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  lastSyncedAt: string | null;
  syncScope: SyncScope;
  refreshRecords: () => Promise<void>;
  addRecord: (record: SchoolRecordPayload) => Promise<void>;
  updateRecord: (id: string, updates: SchoolRecordPayload) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);
const AUTO_SYNC_INTERVAL_MS = 30_000;

function normalizeScope(value: string | undefined): SyncScope {
  if (value === "division" || value === "school") return value;
  return null;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { token, logout } = useAuth();

  const [records, setRecords] = useState<SchoolRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncScope, setSyncScope] = useState<SyncScope>(null);
  const syncInFlightRef = useRef(false);

  const handleApiError = useCallback(
    async (err: unknown) => {
      if (isApiError(err) && err.status === 401) {
        await logout();
        return;
      }

      setError(err instanceof Error ? err.message : "Unexpected server error.");
    },
    [logout],
  );

  const syncRecords = useCallback(
    async (silent = false) => {
      if (syncInFlightRef.current) return;

      if (!token) {
        setRecords([]);
        setError("");
        setLastSyncedAt(null);
        setSyncScope(null);
        return;
      }

      syncInFlightRef.current = true;

      if (!silent) {
        setIsLoading(true);
      }
      setError("");

      try {
        const payload = await apiRequest<SchoolRecordsResponse>("/api/dashboard/records", { token });
        setRecords(payload.data || []);
        setLastSyncedAt(payload.meta?.syncedAt ?? new Date().toISOString());
        setSyncScope(normalizeScope(payload.meta?.scope));
      } catch (err) {
        await handleApiError(err);
      } finally {
        syncInFlightRef.current = false;
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [token, handleApiError],
  );

  const refreshRecords = useCallback(async () => {
    await syncRecords(false);
  }, [syncRecords]);

  const addRecord = useCallback(
    async (record: SchoolRecordPayload) => {
      if (!token) return;

      setIsSaving(true);
      setError("");

      try {
        await apiRequest("/api/dashboard/records", {
          method: "POST",
          token,
          body: record,
        });
        await syncRecords(true);
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncRecords, handleApiError],
  );

  const updateRecord = useCallback(
    async (id: string, updates: SchoolRecordPayload) => {
      if (!token) return;

      setIsSaving(true);
      setError("");

      try {
        await apiRequest(`/api/dashboard/records/${id}`, {
          method: "PUT",
          token,
          body: updates,
        });
        await syncRecords(true);
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncRecords, handleApiError],
  );

  useEffect(() => {
    void syncRecords(false);
  }, [syncRecords]);

  useEffect(() => {
    if (!token) return;

    const interval = window.setInterval(() => {
      void syncRecords(true);
    }, AUTO_SYNC_INTERVAL_MS);

    const syncOnFocus = () => {
      void syncRecords(true);
    };

    window.addEventListener("focus", syncOnFocus);
    window.addEventListener("online", syncOnFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncOnFocus);
      window.removeEventListener("online", syncOnFocus);
    };
  }, [token, syncRecords]);

  const value = useMemo<DataContextType>(
    () => ({
      records,
      isLoading,
      isSaving,
      error,
      lastSyncedAt,
      syncScope,
      refreshRecords,
      addRecord,
      updateRecord,
    }),
    [records, isLoading, isSaving, error, lastSyncedAt, syncScope, refreshRecords, addRecord, updateRecord],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within DataProvider");
  }
  return context;
}
