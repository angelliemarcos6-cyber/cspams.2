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
  FormSubmission,
  FormSubmissionHistoryEntry,
  SubmissionFormType,
} from "@/types";

type ReviewDecision = "validated" | "returned";

interface FormSubmissionsResponse {
  data: FormSubmission[];
}

interface FormSubmissionResponse {
  data: FormSubmission;
}

interface FormHistoryResponse {
  data: FormSubmissionHistoryEntry[];
}

interface AcademicYearsResponse {
  data: AcademicYearOption[];
}

interface FormGenerationPayload {
  academicYearId: number;
  reportingPeriod?: string | null;
  schoolId?: number | null;
}

interface FormDataContextType {
  submissions: FormSubmission[];
  sf1Submissions: FormSubmission[];
  sf5Submissions: FormSubmission[];
  academicYears: AcademicYearOption[];
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  lastSyncedAt: string | null;
  refreshSubmissions: () => Promise<void>;
  generateSubmission: (formType: SubmissionFormType, payload: FormGenerationPayload) => Promise<FormSubmission>;
  submitSubmission: (formType: SubmissionFormType, id: string) => Promise<FormSubmission>;
  reviewSubmission: (formType: SubmissionFormType, id: string, decision: ReviewDecision, notes?: string) => Promise<FormSubmission>;
  loadHistory: (formType: SubmissionFormType, id: string) => Promise<FormSubmissionHistoryEntry[]>;
}

const FormDataContext = createContext<FormDataContextType | undefined>(undefined);
const AUTO_SYNC_INTERVAL_MS = 15_000;

function formRoute(formType: SubmissionFormType): string {
  return `/api/forms/${formType}`;
}

export function FormDataProvider({ children }: { children: ReactNode }) {
  const { token, logout } = useAuth();

  const [sf1Submissions, setSf1Submissions] = useState<FormSubmission[]>([]);
  const [sf5Submissions, setSf5Submissions] = useState<FormSubmission[]>([]);
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
    setSf1Submissions([]);
    setSf5Submissions([]);
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
        setSf1Submissions([]);
        setSf5Submissions([]);
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
        const [sf1Payload, sf5Payload, yearPayload] = await Promise.all([
          apiRequest<FormSubmissionsResponse>(formRoute("sf1"), { token }),
          apiRequest<FormSubmissionsResponse>(formRoute("sf5"), { token }),
          apiRequest<AcademicYearsResponse>("/api/indicators/academic-years", { token }),
        ]);

        if (requestGeneration !== syncGenerationRef.current) {
          return;
        }

        setSf1Submissions(Array.isArray(sf1Payload.data) ? sf1Payload.data : []);
        setSf5Submissions(Array.isArray(sf5Payload.data) ? sf5Payload.data : []);
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

  const generateSubmission = useCallback(
    async (formType: SubmissionFormType, payload: FormGenerationPayload): Promise<FormSubmission> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequest<FormSubmissionResponse>(`${formRoute(formType)}/generate`, {
          method: "POST",
          token,
          body: {
            academic_year_id: payload.academicYearId,
            reporting_period: payload.reportingPeriod ?? null,
            school_id: payload.schoolId ?? null,
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
    async (formType: SubmissionFormType, id: string): Promise<FormSubmission> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequest<FormSubmissionResponse>(`${formRoute(formType)}/${id}/submit`, {
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
    async (formType: SubmissionFormType, id: string, decision: ReviewDecision, notes?: string): Promise<FormSubmission> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequest<FormSubmissionResponse>(`${formRoute(formType)}/${id}/validate`, {
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

  const loadHistory = useCallback(
    async (formType: SubmissionFormType, id: string): Promise<FormSubmissionHistoryEntry[]> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      try {
        const response = await apiRequest<FormHistoryResponse>(`${formRoute(formType)}/${id}/history`, { token });
        return Array.isArray(response.data) ? response.data : [];
      } catch (err) {
        await handleApiError(err);
        throw err;
      }
    },
    [token, handleApiError],
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
    const syncOnRealtime = (event: Event) => {
      const payload = (event as CustomEvent<{ entity?: string }>).detail;
      if (!payload?.entity) return;
      if (payload.entity === "forms") {
        void syncSubmissions(true);
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
  }, [token, syncSubmissions]);

  const submissions = useMemo(
    () =>
      [...sf1Submissions, ...sf5Submissions].sort((a, b) => {
        const aDate = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const bDate = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return bDate - aDate;
      }),
    [sf1Submissions, sf5Submissions],
  );

  const value = useMemo<FormDataContextType>(
    () => ({
      submissions,
      sf1Submissions,
      sf5Submissions,
      academicYears,
      isLoading,
      isSaving,
      error,
      lastSyncedAt,
      refreshSubmissions,
      generateSubmission,
      submitSubmission,
      reviewSubmission,
      loadHistory,
    }),
    [
      submissions,
      sf1Submissions,
      sf5Submissions,
      academicYears,
      isLoading,
      isSaving,
      error,
      lastSyncedAt,
      refreshSubmissions,
      generateSubmission,
      submitSubmission,
      reviewSubmission,
      loadHistory,
    ],
  );

  return <FormDataContext.Provider value={value}>{children}</FormDataContext.Provider>;
}

export function useFormData() {
  const context = useContext(FormDataContext);
  if (!context) {
    throw new Error("useFormData must be used within FormDataProvider");
  }
  return context;
}
