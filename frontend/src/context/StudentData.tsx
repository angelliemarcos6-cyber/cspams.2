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
import type { StudentRecord, StudentRecordPayload } from "@/types";

type StudentSyncScope = "division" | "school" | null;

interface StudentSyncMeta {
  syncedAt?: string;
  scope?: string;
  recordCount?: number;
}

interface StudentRecordsResponse {
  data: StudentRecord[];
  meta?: StudentSyncMeta;
}

interface StudentRecordMutationResponse {
  data: StudentRecord;
  meta?: StudentSyncMeta;
}

interface StudentRecordDeleteResponse {
  data: {
    id: string;
  };
  meta?: StudentSyncMeta;
}

interface StudentDataContextType {
  students: StudentRecord[];
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  lastSyncedAt: string | null;
  syncScope: StudentSyncScope;
  refreshStudents: () => Promise<void>;
  addStudent: (payload: StudentRecordPayload) => Promise<void>;
  updateStudent: (id: string, payload: StudentRecordPayload) => Promise<void>;
  deleteStudent: (id: string) => Promise<void>;
}

const StudentDataContext = createContext<StudentDataContextType | undefined>(undefined);
const AUTO_SYNC_INTERVAL_MS = 12_000;

function normalizeScope(value: string | undefined): StudentSyncScope {
  if (value === "division" || value === "school") return value;
  return null;
}

export function StudentDataProvider({ children }: { children: ReactNode }) {
  const { token, logout } = useAuth();

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncScope, setSyncScope] = useState<StudentSyncScope>(null);

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

  const syncStudents = useCallback(
    async (silent = false) => {
      if (!token) {
        setStudents([]);
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
        const response = await apiRequestRaw<StudentRecordsResponse>("/api/dashboard/students", { token });
        const payload = response.data;

        setStudents(Array.isArray(payload?.data) ? payload.data : []);
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

  const refreshStudents = useCallback(async () => {
    await syncStudents(false);
  }, [syncStudents]);

  const addStudent = useCallback(
    async (payload: StudentRecordPayload) => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<StudentRecordMutationResponse>("/api/dashboard/students", {
          method: "POST",
          token,
          body: payload,
        });

        const nextRecord = response.data?.data;
        if (nextRecord) {
          setStudents((current) => [nextRecord, ...current.filter((item) => item.id !== nextRecord.id)]);
        }

        setLastSyncedAt(response.data?.meta?.syncedAt ?? new Date().toISOString());
        setSyncScope(normalizeScope(response.data?.meta?.scope));
        await syncStudents(true);
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncStudents, handleApiError],
  );

  const updateStudent = useCallback(
    async (id: string, payload: StudentRecordPayload) => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<StudentRecordMutationResponse>(`/api/dashboard/students/${id}`, {
          method: "PUT",
          token,
          body: payload,
        });

        const nextRecord = response.data?.data;
        if (nextRecord) {
          setStudents((current) => current.map((item) => (item.id === nextRecord.id ? nextRecord : item)));
        }

        setLastSyncedAt(response.data?.meta?.syncedAt ?? new Date().toISOString());
        setSyncScope(normalizeScope(response.data?.meta?.scope));
        await syncStudents(true);
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncStudents, handleApiError],
  );

  const deleteStudent = useCallback(
    async (id: string) => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<StudentRecordDeleteResponse>(`/api/dashboard/students/${id}`, {
          method: "DELETE",
          token,
        });

        setStudents((current) => current.filter((item) => item.id !== id));
        setLastSyncedAt(response.data?.meta?.syncedAt ?? new Date().toISOString());
        setSyncScope(normalizeScope(response.data?.meta?.scope));
        await syncStudents(true);
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncStudents, handleApiError],
  );

  useEffect(() => {
    void syncStudents(false);
  }, [syncStudents]);

  useEffect(() => {
    if (!token) return;

    const interval = window.setInterval(() => {
      void syncStudents(true);
    }, AUTO_SYNC_INTERVAL_MS);

    const syncOnFocus = () => {
      void syncStudents(true);
    };

    window.addEventListener("focus", syncOnFocus);
    window.addEventListener("online", syncOnFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncOnFocus);
      window.removeEventListener("online", syncOnFocus);
    };
  }, [token, syncStudents]);

  const value = useMemo<StudentDataContextType>(
    () => ({
      students,
      isLoading,
      isSaving,
      error,
      lastSyncedAt,
      syncScope,
      refreshStudents,
      addStudent,
      updateStudent,
      deleteStudent,
    }),
    [students, isLoading, isSaving, error, lastSyncedAt, syncScope, refreshStudents, addStudent, updateStudent, deleteStudent],
  );

  return <StudentDataContext.Provider value={value}>{children}</StudentDataContext.Provider>;
}

export function useStudentData() {
  const context = useContext(StudentDataContext);
  if (!context) {
    throw new Error("useStudentData must be used within StudentDataProvider");
  }
  return context;
}
