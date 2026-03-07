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
import { apiRequest, apiRequestRaw, isApiError } from "@/lib/api";
import type { SchoolRecord, SchoolRecordPayload } from "@/types";

type SyncScope = "division" | "school" | null;
type SyncStatus = "idle" | "updated" | "up_to_date" | "error";

interface SchoolRecordsResponse {
  data: SchoolRecord[];
  meta?: {
    syncedAt?: string;
    scope?: string;
    scopeKey?: string;
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
  syncStatus: SyncStatus;
  refreshRecords: () => Promise<void>;
  addRecord: (record: SchoolRecordPayload) => Promise<void>;
  updateRecord: (id: string, updates: SchoolRecordPayload) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);
const AUTO_SYNC_INTERVAL_MS = 12_000;

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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const syncInFlightRef = useRef(false);
  const etagRef = useRef<string>("");
  const previousTokenRef = useRef<string>("");
  const syncGenerationRef = useRef(0);

  useEffect(() => {
    if (previousTokenRef.current === token) {
      return;
    }

    previousTokenRef.current = token;
    syncGenerationRef.current += 1;
    syncInFlightRef.current = false;
    etagRef.current = "";
    setRecords([]);
    setError("");
    setLastSyncedAt(null);
    setSyncScope(null);
    setSyncStatus("idle");
  }, [token]);

  const handleApiError = useCallback(
    async (err: unknown) => {
      if (isApiError(err) && err.status === 401) {
        await logout();
        return;
      }

      setError(err instanceof Error ? err.message : "Unexpected server error.");
      setSyncStatus("error");
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
        setSyncStatus("idle");
        etagRef.current = "";
        return;
      }

      syncInFlightRef.current = true;
      const requestGeneration = syncGenerationRef.current;

      if (!silent) {
        setIsLoading(true);
      }
      setError("");

      try {
        const response = await apiRequestRaw<SchoolRecordsResponse>("/api/dashboard/records", {
          token,
          extraHeaders: etagRef.current ? { "If-None-Match": etagRef.current } : undefined,
        });

        const nextEtag = response.headers.get("X-Sync-Etag") || response.headers.get("ETag");
        if (nextEtag) {
          etagRef.current = nextEtag.replace(/^W\//, "").replace(/"/g, "");
        }

        if (requestGeneration !== syncGenerationRef.current) {
          return;
        }

        const scopeFromHeaders = normalizeScope(response.headers.get("X-Sync-Scope") || undefined);

        if (response.status === 304) {
          setLastSyncedAt(response.headers.get("X-Synced-At") || new Date().toISOString());
          if (scopeFromHeaders) {
            setSyncScope(scopeFromHeaders);
          }
          setSyncStatus("up_to_date");
          return;
        }

        const payload = response.data;
        setRecords(Array.isArray(payload?.data) ? payload.data : []);
        setLastSyncedAt(payload?.meta?.syncedAt ?? new Date().toISOString());
        setSyncScope(normalizeScope(payload?.meta?.scope) ?? scopeFromHeaders);
        setSyncStatus("updated");
      } catch (err) {
        if (requestGeneration !== syncGenerationRef.current) {
          return;
        }
        await handleApiError(err);
      } finally {
        if (requestGeneration === syncGenerationRef.current) {
          syncInFlightRef.current = false;
        }
        if (!silent && requestGeneration === syncGenerationRef.current) {
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
        setSyncStatus("updated");
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
        setSyncStatus("updated");
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
      syncStatus,
      refreshRecords,
      addRecord,
      updateRecord,
    }),
    [records, isLoading, isSaving, error, lastSyncedAt, syncScope, syncStatus, refreshRecords, addRecord, updateRecord],
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
