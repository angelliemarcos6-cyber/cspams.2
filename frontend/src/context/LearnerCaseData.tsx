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
import type {
  LearnerCase,
  LearnerCaseListMeta,
  LearnerCasePayload,
  LearnerCaseThread,
} from "@/types";

interface LearnerCaseListResponse {
  data: LearnerCase[];
  meta: LearnerCaseListMeta;
}

interface LearnerCaseSingleResponse {
  data: LearnerCase;
}

interface LearnerCaseThreadResponse {
  data: LearnerCaseThread;
}

export interface LearnerCaseFilters {
  severity?: "low" | "medium" | "high" | null;
  status?: "open" | "monitoring" | "resolved" | null;
  issueType?: string | null;
  schoolId?: string | null;
  search?: string | null;
  overdue?: boolean;
  page?: number;
  perPage?: number;
}

interface LearnerCaseContextValue {
  cases: LearnerCase[];
  meta: LearnerCaseListMeta | null;
  loading: boolean;
  error: string | null;
  filters: LearnerCaseFilters;
  setFilters: (filters: LearnerCaseFilters) => void;
  refresh: () => Promise<void>;
  createCase: (payload: LearnerCasePayload) => Promise<LearnerCase>;
  updateCase: (id: string, payload: Partial<LearnerCasePayload>) => Promise<LearnerCase>;
  deleteCase: (id: string) => Promise<void>;
  acknowledgeCase: (id: string) => Promise<LearnerCase>;
  resolveCase: (id: string) => Promise<LearnerCase>;
  addThread: (caseId: string, message: string) => Promise<LearnerCaseThread>;
  fetchCase: (id: string) => Promise<LearnerCase>;
}

const LearnerCaseContext = createContext<LearnerCaseContextValue | null>(null);

export function LearnerCaseDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cases, setCases] = useState<LearnerCase[]>([]);
  const [meta, setMeta] = useState<LearnerCaseListMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LearnerCaseFilters>({});
  const abortRef = useRef<AbortController | null>(null);

  const buildQueryString = useCallback((f: LearnerCaseFilters): string => {
    const params = new URLSearchParams();
    if (f.severity) params.set("severity", f.severity);
    if (f.status) params.set("status", f.status);
    if (f.issueType) params.set("issueType", f.issueType);
    if (f.schoolId) params.set("schoolId", f.schoolId);
    if (f.search?.trim()) params.set("search", f.search.trim());
    if (f.overdue) params.set("overdue", "true");
    if (f.page) params.set("page", String(f.page));
    if (f.perPage) params.set("perPage", String(f.perPage));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const qs = buildQueryString(filters);
      const response = await apiRequest<LearnerCaseListResponse>(
        `/api/cases${qs}`,
        { signal: controller.signal },
      );
      setCases(response.data ?? []);
      setMeta(response.meta ?? null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(isApiError(err) ? err.message : "Failed to load learner cases.");
    } finally {
      setLoading(false);
    }
  }, [user, filters, buildQueryString]);

  useEffect(() => {
    refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  const createCase = useCallback(async (payload: LearnerCasePayload): Promise<LearnerCase> => {
    const response = await apiRequest<LearnerCaseSingleResponse>("/api/cases", {
      method: "POST",
      body: payload,
    });
    const created = response.data;
    setCases((prev) => [created, ...prev]);
    return created;
  }, []);

  const updateCase = useCallback(async (id: string, payload: Partial<LearnerCasePayload>): Promise<LearnerCase> => {
    const response = await apiRequest<LearnerCaseSingleResponse>(`/api/cases/${id}`, {
      method: "PATCH",
      body: payload,
    });
    const updated = response.data;
    setCases((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  }, []);

  const deleteCase = useCallback(async (id: string): Promise<void> => {
    await apiRequest<unknown>(`/api/cases/${id}`, { method: "DELETE" });
    setCases((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const acknowledgeCase = useCallback(async (id: string): Promise<LearnerCase> => {
    const response = await apiRequest<LearnerCaseSingleResponse>(`/api/cases/${id}/acknowledge`, {
      method: "POST",
    });
    const updated = response.data;
    setCases((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  }, []);

  const resolveCase = useCallback(async (id: string): Promise<LearnerCase> => {
    const response = await apiRequest<LearnerCaseSingleResponse>(`/api/cases/${id}/resolve`, {
      method: "POST",
    });
    const updated = response.data;
    setCases((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  }, []);

  const addThread = useCallback(async (caseId: string, message: string): Promise<LearnerCaseThread> => {
    const response = await apiRequest<LearnerCaseThreadResponse>(`/api/cases/${caseId}/threads`, {
      method: "POST",
      body: { message },
    });
    return response.data;
  }, []);

  const fetchCase = useCallback(async (id: string): Promise<LearnerCase> => {
    const response = await apiRequest<LearnerCaseSingleResponse>(`/api/cases/${id}`);
    return response.data;
  }, []);

  const value = useMemo<LearnerCaseContextValue>(
    () => ({
      cases,
      meta,
      loading,
      error,
      filters,
      setFilters,
      refresh,
      createCase,
      updateCase,
      deleteCase,
      acknowledgeCase,
      resolveCase,
      addThread,
      fetchCase,
    }),
    [cases, meta, loading, error, filters, refresh, createCase, updateCase, deleteCase, acknowledgeCase, resolveCase, addThread, fetchCase],
  );

  return (
    <LearnerCaseContext.Provider value={value}>
      {children}
    </LearnerCaseContext.Provider>
  );
}

export function useLearnerCaseData(): LearnerCaseContextValue {
  const ctx = useContext(LearnerCaseContext);
  if (!ctx) {
    throw new Error("useLearnerCaseData must be used within LearnerCaseDataProvider");
  }
  return ctx;
}
