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
  AcademicYearOption,
  IndicatorMetric,
  IndicatorSubmission,
  IndicatorSubmissionPayload,
} from "@/types";

type ReviewDecision = "validated" | "returned";

interface IndicatorSubmissionsResponse {
  data: IndicatorSubmission[];
}

interface IndicatorMetricsResponse {
  data: IndicatorMetric[];
}

interface IndicatorAcademicYearsResponse {
  data: AcademicYearOption[];
}

interface IndicatorSubmissionResponse {
  data: IndicatorSubmission;
}

interface IndicatorDataContextType {
  submissions: IndicatorSubmission[];
  metrics: IndicatorMetric[];
  academicYears: AcademicYearOption[];
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  lastSyncedAt: string | null;
  refreshSubmissions: () => Promise<void>;
  createSubmission: (payload: IndicatorSubmissionPayload) => Promise<IndicatorSubmission>;
  submitSubmission: (id: string) => Promise<IndicatorSubmission>;
  reviewSubmission: (id: string, decision: ReviewDecision, notes?: string) => Promise<IndicatorSubmission>;
}

const IndicatorDataContext = createContext<IndicatorDataContextType | undefined>(undefined);
const AUTO_SYNC_INTERVAL_MS = 15_000;

export function IndicatorDataProvider({ children }: { children: ReactNode }) {
  const { token, logout } = useAuth();

  const [submissions, setSubmissions] = useState<IndicatorSubmission[]>([]);
  const [metrics, setMetrics] = useState<IndicatorMetric[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const syncInFlightRef = useRef(false);
  const previousTokenRef = useRef<string>("");
  const syncGenerationRef = useRef(0);

  useEffect(() => {
    if (previousTokenRef.current === token) {
      return;
    }

    previousTokenRef.current = token;
    syncGenerationRef.current += 1;
    syncInFlightRef.current = false;
    setSubmissions([]);
    setMetrics([]);
    setAcademicYears([]);
    setIsLoading(false);
    setIsSaving(false);
    setError("");
    setLastSyncedAt(null);
  }, [token]);

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

  const syncSubmissions = useCallback(
    async (silent = false) => {
      if (syncInFlightRef.current) return;

      if (!token) {
        setSubmissions([]);
        setMetrics([]);
        setAcademicYears([]);
        setIsLoading(false);
        setIsSaving(false);
        setError("");
        setLastSyncedAt(null);
        return;
      }

      syncInFlightRef.current = true;
      const requestGeneration = syncGenerationRef.current;

      if (!silent) {
        setIsLoading(true);
      }
      setError("");

      try {
        const [submissionPayload, metricPayload, yearPayload] = await Promise.all([
          apiRequest<IndicatorSubmissionsResponse>("/api/indicators/submissions", { token }),
          apiRequest<IndicatorMetricsResponse>("/api/indicators/metrics", { token }),
          apiRequest<IndicatorAcademicYearsResponse>("/api/indicators/academic-years", { token }),
        ]);

        if (requestGeneration !== syncGenerationRef.current) {
          return;
        }

        setSubmissions(Array.isArray(submissionPayload.data) ? submissionPayload.data : []);
        setMetrics(Array.isArray(metricPayload.data) ? metricPayload.data : []);
        setAcademicYears(Array.isArray(yearPayload.data) ? yearPayload.data : []);
        setLastSyncedAt(new Date().toISOString());
      } catch (err) {
        if (requestGeneration !== syncGenerationRef.current) {
          return;
        }
        await handleApiError(err);
      } finally {
        if (requestGeneration === syncGenerationRef.current) {
          syncInFlightRef.current = false;
          if (!silent) {
            setIsLoading(false);
          }
        }
      }
    },
    [token, handleApiError],
  );

  const refreshSubmissions = useCallback(async () => {
    await syncSubmissions(false);
  }, [syncSubmissions]);

  const createSubmission = useCallback(
    async (payload: IndicatorSubmissionPayload): Promise<IndicatorSubmission> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequest<IndicatorSubmissionResponse>("/api/indicators/submissions", {
          method: "POST",
          token,
          body: {
            academic_year_id: payload.academicYearId,
            reporting_period: payload.reportingPeriod ?? null,
            notes: payload.notes ?? null,
            indicators: payload.indicators.map((entry) => ({
              metric_id: entry.metricId,
              target_value: entry.targetValue,
              actual_value: entry.actualValue,
              remarks: entry.remarks ?? null,
            })),
          },
        });

        await syncSubmissions(true);
        return response.data;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncSubmissions, handleApiError],
  );

  const submitSubmission = useCallback(
    async (id: string): Promise<IndicatorSubmission> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequest<IndicatorSubmissionResponse>(`/api/indicators/submissions/${id}/submit`, {
          method: "POST",
          token,
        });

        await syncSubmissions(true);
        return response.data;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncSubmissions, handleApiError],
  );

  const reviewSubmission = useCallback(
    async (id: string, decision: ReviewDecision, notes?: string): Promise<IndicatorSubmission> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequest<IndicatorSubmissionResponse>(`/api/indicators/submissions/${id}/review`, {
          method: "POST",
          token,
          body: {
            decision,
            notes: notes?.trim() || null,
          },
        });

        await syncSubmissions(true);
        return response.data;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncSubmissions, handleApiError],
  );

  useEffect(() => {
    void syncSubmissions(false);
  }, [syncSubmissions]);

  useEffect(() => {
    if (!token) return;

    const interval = window.setInterval(() => {
      void syncSubmissions(true);
    }, AUTO_SYNC_INTERVAL_MS);

    const syncOnFocus = () => {
      void syncSubmissions(true);
    };

    window.addEventListener("focus", syncOnFocus);
    window.addEventListener("online", syncOnFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncOnFocus);
      window.removeEventListener("online", syncOnFocus);
    };
  }, [token, syncSubmissions]);

  const value = useMemo<IndicatorDataContextType>(
    () => ({
      submissions,
      metrics,
      academicYears,
      isLoading,
      isSaving,
      error,
      lastSyncedAt,
      refreshSubmissions,
      createSubmission,
      submitSubmission,
      reviewSubmission,
    }),
    [
      submissions,
      metrics,
      academicYears,
      isLoading,
      isSaving,
      error,
      lastSyncedAt,
      refreshSubmissions,
      createSubmission,
      submitSubmission,
      reviewSubmission,
    ],
  );

  return <IndicatorDataContext.Provider value={value}>{children}</IndicatorDataContext.Provider>;
}

export function useIndicatorData() {
  const context = useContext(IndicatorDataContext);
  if (!context) {
    throw new Error("useIndicatorData must be used within IndicatorDataProvider");
  }
  return context;
}
