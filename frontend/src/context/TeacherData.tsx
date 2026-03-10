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
import { apiRequestRaw, isApiError } from "@/lib/api";
import type { TeacherRecord, TeacherRecordPayload } from "@/types";

type TeacherSyncScope = "division" | "school" | null;

interface TeacherSyncMeta {
  syncedAt?: string;
  scope?: string;
  recordCount?: number;
}

interface TeacherRecordsResponse {
  data: TeacherRecord[];
  meta?: TeacherSyncMeta;
}

interface TeacherRecordMutationResponse {
  data: TeacherRecord;
  meta?: TeacherSyncMeta;
}

interface TeacherRecordDeleteResponse {
  data: {
    id: string;
  };
  meta?: TeacherSyncMeta;
}

interface TeacherDataContextType {
  teachers: TeacherRecord[];
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  lastSyncedAt: string | null;
  syncScope: TeacherSyncScope;
  refreshTeachers: () => Promise<void>;
  addTeacher: (payload: TeacherRecordPayload) => Promise<void>;
  updateTeacher: (id: string, payload: TeacherRecordPayload) => Promise<void>;
  deleteTeacher: (id: string) => Promise<void>;
}

const TeacherDataContext = createContext<TeacherDataContextType | undefined>(undefined);
const AUTO_SYNC_INTERVAL_MS = 12_000;

function normalizeScope(value: string | undefined): TeacherSyncScope {
  if (value === "division" || value === "school") return value;
  return null;
}

export function TeacherDataProvider({ children }: { children: ReactNode }) {
  const { token, logout } = useAuth();

  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncScope, setSyncScope] = useState<TeacherSyncScope>(null);

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

  const syncTeachers = useCallback(
    async (silent = false) => {
      if (!token) {
        setTeachers([]);
        setIsLoading(false);
        setIsSaving(false);
        setError("");
        setLastSyncedAt(null);
        setSyncScope(null);
        return;
      }

      if (!silent) {
        setIsLoading(true);
      }

      setError("");

      try {
        const response = await apiRequestRaw<TeacherRecordsResponse>("/api/dashboard/teachers", { token });
        const payload = response.data;

        setTeachers(Array.isArray(payload?.data) ? payload.data : []);
        setLastSyncedAt(payload?.meta?.syncedAt ?? new Date().toISOString());
        setSyncScope(normalizeScope(payload?.meta?.scope));
      } catch (err) {
        await handleApiError(err);
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [token, handleApiError],
  );

  const refreshTeachers = useCallback(async () => {
    await syncTeachers(false);
  }, [syncTeachers]);

  const addTeacher = useCallback(
    async (payload: TeacherRecordPayload) => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<TeacherRecordMutationResponse>("/api/dashboard/teachers", {
          method: "POST",
          token,
          body: payload,
        });

        const nextRecord = response.data?.data;
        if (nextRecord) {
          setTeachers((current) => [nextRecord, ...current.filter((item) => item.id !== nextRecord.id)]);
        }

        setLastSyncedAt(response.data?.meta?.syncedAt ?? new Date().toISOString());
        setSyncScope(normalizeScope(response.data?.meta?.scope));
        await syncTeachers(true);
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncTeachers, handleApiError],
  );

  const updateTeacher = useCallback(
    async (id: string, payload: TeacherRecordPayload) => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<TeacherRecordMutationResponse>(`/api/dashboard/teachers/${id}`, {
          method: "PUT",
          token,
          body: payload,
        });

        const nextRecord = response.data?.data;
        if (nextRecord) {
          setTeachers((current) => current.map((item) => (item.id === nextRecord.id ? nextRecord : item)));
        }

        setLastSyncedAt(response.data?.meta?.syncedAt ?? new Date().toISOString());
        setSyncScope(normalizeScope(response.data?.meta?.scope));
        await syncTeachers(true);
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncTeachers, handleApiError],
  );

  const deleteTeacher = useCallback(
    async (id: string) => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<TeacherRecordDeleteResponse>(`/api/dashboard/teachers/${id}`, {
          method: "DELETE",
          token,
        });

        setTeachers((current) => current.filter((item) => item.id !== id));
        setLastSyncedAt(response.data?.meta?.syncedAt ?? new Date().toISOString());
        setSyncScope(normalizeScope(response.data?.meta?.scope));
        await syncTeachers(true);
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncTeachers, handleApiError],
  );

  useEffect(() => {
    void syncTeachers(false);
  }, [syncTeachers]);

  useEffect(() => {
    if (!token) return;

    const interval = window.setInterval(() => {
      void syncTeachers(true);
    }, AUTO_SYNC_INTERVAL_MS);

    const syncOnFocus = () => {
      void syncTeachers(true);
    };
    const syncOnRealtime = (event: Event) => {
      const payload = (event as CustomEvent<{ entity?: string }>).detail;
      if (!payload?.entity) return;
      if (payload.entity === "teachers" || payload.entity === "dashboard" || payload.entity === "students") {
        void syncTeachers(true);
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
  }, [token, syncTeachers]);

  const value = useMemo<TeacherDataContextType>(
    () => ({
      teachers,
      isLoading,
      isSaving,
      error,
      lastSyncedAt,
      syncScope,
      refreshTeachers,
      addTeacher,
      updateTeacher,
      deleteTeacher,
    }),
    [teachers, isLoading, isSaving, error, lastSyncedAt, syncScope, refreshTeachers, addTeacher, updateTeacher, deleteTeacher],
  );

  return <TeacherDataContext.Provider value={value}>{children}</TeacherDataContext.Provider>;
}

export function useTeacherData() {
  const context = useContext(TeacherDataContext);
  if (!context) {
    throw new Error("useTeacherData must be used within TeacherDataProvider");
  }
  return context;
}

