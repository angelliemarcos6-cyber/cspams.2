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
import { apiRequest, isApiError } from "@/lib/api";
import type { SchoolRecord, SchoolRecordPayload } from "@/types";

interface SchoolRecordsResponse {
  data: SchoolRecord[];
}

interface DataContextType {
  records: SchoolRecord[];
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  refreshRecords: () => Promise<void>;
  addRecord: (record: SchoolRecordPayload) => Promise<void>;
  updateRecord: (id: string, updates: SchoolRecordPayload) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const { token, logout } = useAuth();

  const [records, setRecords] = useState<SchoolRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

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

  const refreshRecords = useCallback(async () => {
    if (!token) {
      setRecords([]);
      setError("");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const payload = await apiRequest<SchoolRecordsResponse>("/api/dashboard/records", { token });
      setRecords(payload.data || []);
    } catch (err) {
      await handleApiError(err);
    } finally {
      setIsLoading(false);
    }
  }, [token, handleApiError]);

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
        await refreshRecords();
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, refreshRecords, handleApiError],
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
        await refreshRecords();
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, refreshRecords, handleApiError],
  );

  useEffect(() => {
    void refreshRecords();
  }, [refreshRecords]);

  const value = useMemo<DataContextType>(
    () => ({
      records,
      isLoading,
      isSaving,
      error,
      refreshRecords,
      addRecord,
      updateRecord,
    }),
    [records, isLoading, isSaving, error, refreshRecords, addRecord, updateRecord],
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
