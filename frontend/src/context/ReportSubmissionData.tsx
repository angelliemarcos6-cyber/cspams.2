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
import type { ReportSubmission, ReportStatus, ReportType } from "@/types";

interface ReportSubmissionListResponse {
  data: ReportSubmission[];
}

interface ReportSubmissionSingleResponse {
  data: ReportSubmission;
}

export interface ReportSubmissionFilters {
  schoolId?: string | null;
  reportType?: ReportType | null;
  status?: ReportStatus | null;
  academicYearId?: string | null;
}

interface ReportSubmissionContextValue {
  submissions: ReportSubmission[];
  loading: boolean;
  error: string | null;
  filters: ReportSubmissionFilters;
  setFilters: (filters: ReportSubmissionFilters) => void;
  refresh: () => Promise<void>;
  uploadReport: (
    reportType: ReportType,
    academicYearId: string,
    file: File,
  ) => Promise<ReportSubmission>;
  replaceReport: (submissionId: string, file: File) => Promise<ReportSubmission>;
  approveReport: (submissionId: string, notes?: string) => Promise<ReportSubmission>;
  getDownloadUrl: (submissionId: string) => string;
}

const ReportSubmissionContext = createContext<ReportSubmissionContextValue | null>(null);

export function ReportSubmissionDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<ReportSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportSubmissionFilters>({});
  const abortRef = useRef<AbortController | null>(null);

  const buildQueryString = useCallback((f: ReportSubmissionFilters): string => {
    const params = new URLSearchParams();
    if (f.schoolId) params.set("schoolId", f.schoolId);
    if (f.reportType) params.set("reportType", f.reportType);
    if (f.status) params.set("status", f.status);
    if (f.academicYearId) params.set("academicYearId", f.academicYearId);
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
      const response = await apiRequest<ReportSubmissionListResponse>(
        `/api/submissions/reports${qs}`,
        { signal: controller.signal },
      );
      setSubmissions(response.data ?? []);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(isApiError(err) ? err.message : "Failed to load report submissions.");
    } finally {
      setLoading(false);
    }
  }, [user, filters, buildQueryString]);

  useEffect(() => {
    refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  const uploadReport = useCallback(
    async (reportType: ReportType, academicYearId: string, file: File): Promise<ReportSubmission> => {
      const formData = new FormData();
      formData.append("reportType", reportType);
      formData.append("academicYearId", academicYearId);
      formData.append("file", file);

      const response = await apiRequest<ReportSubmissionSingleResponse>(
        "/api/submissions/reports",
        {
          method: "POST",
          body: formData,
          extraHeaders: {}, // Let browser set Content-Type for multipart
        },
      );
      const created = response.data;
      setSubmissions((prev) => {
        const exists = prev.some((s) => s.id === created.id);
        return exists
          ? prev.map((s) => (s.id === created.id ? created : s))
          : [created, ...prev];
      });
      return created;
    },
    [],
  );

  const replaceReport = useCallback(
    async (submissionId: string, file: File): Promise<ReportSubmission> => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiRequest<ReportSubmissionSingleResponse>(
        `/api/submissions/reports/${submissionId}/replace`,
        {
          method: "POST",
          body: formData,
          extraHeaders: {},
        },
      );
      const updated = response.data;
      setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? updated : s)));
      return updated;
    },
    [],
  );

  const approveReport = useCallback(
    async (submissionId: string, notes?: string): Promise<ReportSubmission> => {
      const response = await apiRequest<ReportSubmissionSingleResponse>(
        `/api/submissions/reports/${submissionId}/approve`,
        {
          method: "POST",
          body: notes ? { notes } : {},
        },
      );
      const updated = response.data;
      setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? updated : s)));
      return updated;
    },
    [],
  );

  const getDownloadUrl = useCallback(
    (submissionId: string): string => {
      const base =
        typeof window !== "undefined"
          ? `${window.location.protocol}//${window.location.hostname}:8000`
          : "http://127.0.0.1:8000";
      return `${base}/api/submissions/reports/${submissionId}/download`;
    },
    [],
  );

  const value = useMemo<ReportSubmissionContextValue>(
    () => ({
      submissions,
      loading,
      error,
      filters,
      setFilters,
      refresh,
      uploadReport,
      replaceReport,
      approveReport,
      getDownloadUrl,
    }),
    [submissions, loading, error, filters, refresh, uploadReport, replaceReport, approveReport, getDownloadUrl],
  );

  return (
    <ReportSubmissionContext.Provider value={value}>
      {children}
    </ReportSubmissionContext.Provider>
  );
}

export function useReportSubmissionData(): ReportSubmissionContextValue {
  const ctx = useContext(ReportSubmissionContext);
  if (!ctx) {
    throw new Error("useReportSubmissionData must be used within ReportSubmissionDataProvider");
  }
  return ctx;
}
