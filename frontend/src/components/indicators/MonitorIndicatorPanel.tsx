import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  Eye,
  Mail,
  RefreshCw,
  RotateCcw,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import { useAuth } from "@/context/Auth";
import { useIndicatorData } from "@/context/IndicatorData";
import type { FormSubmissionHistoryEntry, IndicatorSubmission, SchoolRecord } from "@/types";

interface MonitorIndicatorPanelProps {
  schoolFilterKeys?: Set<string> | null;
  schoolRecords?: SchoolRecord[];
  onToast?: (message: string, tone?: "success" | "info" | "warning") => void;
  onSendReminder?: (schoolKey: string, schoolName: string, notes?: string | null) => Promise<void>;
  embedded?: boolean;
}

type ReviewStatusFilter = "all" | "submitted" | "returned" | "validated" | "overdue" | "draft";
type SubmissionTypeFilter = "all" | "indicator";
type PriorityFilter = "all" | "normal" | "medium" | "high" | "overdue" | "returned";
type DistrictRegionFilter = "all" | `district:${string}` | `region:${string}`;
type AssignedReviewerFilter = "all" | "unassigned" | string;
type ReviewDecisionAction = "validated" | "returned" | "clarification" | "escalated";
type ReviewSavedView = "needs_action" | "my_queue" | "unassigned" | "overdue_72h" | "returned_today";
type DetailTab = "overview" | "checklist" | "history";
type QueueDensity = "comfortable" | "compact";

interface ReviewQueueRow {
  submission: IndicatorSubmission;
  schoolKey: string;
  schoolName: string;
  schoolCode: string;
  district: string;
  region: string;
  submissionType: "Indicator Package";
  submittedAt: string | null;
  reviewedAt: string | null;
  status: string;
  reviewer: string;
  assignedReviewer: string;
  daysPending: number;
  pendingHours: number;
  priority: Exclude<PriorityFilter, "all">;
  overdue: boolean;
  reviewDurationHours: number | null;
  missingFields: string[];
  evidenceLinks: string[];
  previousSubmission: IndicatorSubmission | null;
  searchableText: string;
}

interface ReviewActionState {
  submission: IndicatorSubmission;
  action: ReviewDecisionAction;
}

interface SchoolMeta {
  district: string;
  region: string;
}

const REVIEW_ASSIGNMENT_STORAGE_KEY = "cspams.monitor.review.assignments.v1";
const UNASSIGNED_REVIEWER_VALUE = "__unassigned__";

function savedViewButtonClass(view: ReviewSavedView, active: boolean): string {
  const base =
    "inline-flex items-center gap-1 rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-100";

  if (view === "needs_action") {
    return active
      ? `${base} border-primary-300 bg-primary-100 text-primary-800`
      : `${base} border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100`;
  }

  if (view === "my_queue") {
    return active
      ? `${base} border-cyan-300 bg-cyan-100 text-cyan-800`
      : `${base} border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100`;
  }

  if (view === "unassigned") {
    return active
      ? `${base} border-slate-400 bg-slate-200 text-slate-800`
      : `${base} border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200`;
  }

  if (view === "overdue_72h") {
    return active
      ? `${base} border-rose-300 bg-rose-100 text-rose-800`
      : `${base} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100`;
  }

  return active
    ? `${base} border-amber-300 bg-amber-100 text-amber-800`
    : `${base} border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100`;
}

function workflowTone(status: string): string {
  if (status === "validated") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (status === "submitted") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (status === "returned") return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
}

function workflowLabel(status: string): string {
  if (status === "submitted") return "For Review";
  if (status === "returned") return "Returned";
  if (status === "validated") return "Validated";
  if (status === "draft") return "Draft";
  return status;
}

function complianceTone(status: string): string {
  return status === "met"
    ? "bg-primary-100 text-primary-700 ring-1 ring-primary-300"
    : "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
}

function priorityTone(priority: Exclude<PriorityFilter, "all">): string {
  if (priority === "overdue") return "bg-rose-100 text-rose-700 ring-1 ring-rose-300";
  if (priority === "high") return "bg-amber-100 text-amber-700 ring-1 ring-amber-300";
  if (priority === "medium") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (priority === "returned") return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-300";
}

function priorityLabel(priority: Exclude<PriorityFilter, "all">): string {
  if (priority === "overdue") return "72h+";
  if (priority === "high") return "48h";
  if (priority === "medium") return "24h";
  if (priority === "returned") return "Returned";
  return "Normal";
}

function formatDateTime(value: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(1)}h`;
}

function formatDays(value: number): string {
  return `${value} day${value === 1 ? "" : "s"}`;
}

function normalizeSchoolKey(schoolCode: string | null | undefined, schoolName: string | null | undefined): string {
  const code = schoolCode?.trim().toLowerCase();
  if (code) return `code:${code}`;

  const name = schoolName?.trim().toLowerCase();
  if (name) return `name:${name}`;

  return "unknown";
}

function normalizeSearchTerms(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

function matchesAllTerms(searchableText: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  return terms.every((term) => searchableText.includes(term));
}

function extractLinks(...segments: Array<string | null | undefined>): string[] {
  const urlRegex = /https?:\/\/[^\s)]+/gi;
  const unique = new Set<string>();

  for (const segment of segments) {
    if (!segment) continue;
    const matches = segment.match(urlRegex);
    if (!matches) continue;

    for (const match of matches) {
      unique.add(match.trim());
    }
  }

  return [...unique];
}

function submissionTime(submission: IndicatorSubmission): number {
  return new Date(submission.submittedAt ?? submission.updatedAt ?? submission.createdAt ?? 0).getTime();
}

function reviewedTime(submission: IndicatorSubmission): number {
  return new Date(submission.reviewedAt ?? 0).getTime();
}

function computePriority(status: string, pendingHours: number): Exclude<PriorityFilter, "all"> {
  if (status === "returned") return "returned";
  if (status !== "submitted") return "normal";

  if (pendingHours >= 72) return "overdue";
  if (pendingHours >= 48) return "high";
  if (pendingHours >= 24) return "medium";
  return "normal";
}

function csvEscape(value: string): string {
  const normalized = value.replace(/"/g, '""');
  return `"${normalized}"`;
}

function downloadCsv(filename: string, csvRows: string[][]): void {
  if (typeof window === "undefined") return;

  const lines = csvRows.map((row) => row.map((value) => csvEscape(value)).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function isToday(value: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function readableActionLabel(action: ReviewDecisionAction): string {
  if (action === "validated") return "Validate";
  if (action === "returned") return "Return for Revision";
  if (action === "clarification") return "Request Clarification";
  return "Escalate";
}

function buildDecisionNotes(action: ReviewDecisionAction, notes: string): string | null {
  const trimmed = notes.trim();

  if (action === "validated") {
    return trimmed || null;
  }

  if (action === "returned") {
    return `Return for revision: ${trimmed}`;
  }

  if (action === "clarification") {
    return trimmed
      ? `Clarification requested: ${trimmed}`
      : "Clarification requested: Please review the flagged indicators and provide updates.";
  }

  return `Escalation raised by monitor: ${trimmed}`;
}

function toExportRows(rows: ReviewQueueRow[]): string[][] {
  const header = [
    "School",
    "District",
    "Region",
    "Submission Type",
    "Period",
    "Submitted At",
    "Status",
    "Days Pending",
    "Priority",
    "Reviewer",
  ];

  const body = rows.map((row) => [
    row.schoolName,
    row.district,
    row.region,
    row.submissionType,
    row.submission.reportingPeriod ?? "N/A",
    row.submittedAt ? formatDateTime(row.submittedAt) : "N/A",
    workflowLabel(row.status),
    String(row.daysPending),
    priorityLabel(row.priority),
    row.assignedReviewer,
  ]);

  return [header, ...body];
}

export function MonitorIndicatorPanel({
  schoolFilterKeys = null,
  schoolRecords = [],
  onToast,
  onSendReminder,
  embedded = false,
}: MonitorIndicatorPanelProps) {
  const { username } = useAuth();
  const {
    submissions,
    isLoading,
    isSaving,
    error,
    lastSyncedAt,
    refreshSubmissions,
    reviewSubmission,
    loadHistory,
  } = useIndicatorData();

  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [historyBySubmissionId, setHistoryBySubmissionId] = useState<Record<string, FormSubmissionHistoryEntry[]>>({});
  const [historyLoadingSubmissionId, setHistoryLoadingSubmissionId] = useState<string | null>(null);
  const [detailSubmissionId, setDetailSubmissionId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter>("all");
  const [districtRegionFilter, setDistrictRegionFilter] = useState<DistrictRegionFilter>("all");
  const [submissionTypeFilter, setSubmissionTypeFilter] = useState<SubmissionTypeFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [assignedReviewerFilter, setAssignedReviewerFilter] = useState<AssignedReviewerFilter>("all");

  const [reviewAssignments, setReviewAssignments] = useState<Record<string, string>>({});
  const [batchReviewer, setBatchReviewer] = useState("");
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>([]);

  const [reviewAction, setReviewAction] = useState<ReviewActionState | null>(null);
  const [reviewActionNotes, setReviewActionNotes] = useState("");
  const [reviewActionError, setReviewActionError] = useState("");
  const [isReviewActionRunning, setIsReviewActionRunning] = useState(false);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [activeSavedView, setActiveSavedView] = useState<ReviewSavedView | null>(null);
  const [queueDensity, setQueueDensity] = useState<QueueDensity>("comfortable");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const filteredRowsRef = useRef<ReviewQueueRow[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(REVIEW_ASSIGNMENT_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Record<string, string>;
      if (!parsed || typeof parsed !== "object") return;

      const sanitized: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string" && value.trim().length > 0) {
          sanitized[key] = value.trim();
        }
      }

      setReviewAssignments(sanitized);
    } catch {
      // Ignore invalid storage payload.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(REVIEW_ASSIGNMENT_STORAGE_KEY, JSON.stringify(reviewAssignments));
    } catch {
      // Ignore storage failures.
    }
  }, [reviewAssignments]);

  useEffect(() => {
    if (batchReviewer.trim().length > 0) return;
    if (username.trim().length === 0) return;
    setBatchReviewer(username.trim());
  }, [batchReviewer, username]);

  const selectedIdSet = useMemo(() => new Set(selectedSubmissionIds), [selectedSubmissionIds]);

  const visibleSubmissions = useMemo(() => {
    if (!schoolFilterKeys) {
      return submissions;
    }

    if (schoolFilterKeys.size === 0) {
      return [];
    }

    return submissions.filter((submission) =>
      schoolFilterKeys.has(
        normalizeSchoolKey(submission.school?.schoolCode ?? null, submission.school?.name ?? null),
      ),
    );
  }, [submissions, schoolFilterKeys]);

  const schoolMetaByKey = useMemo(() => {
    const map = new Map<string, SchoolMeta>();

    for (const record of schoolRecords) {
      const schoolKey = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
      if (schoolKey === "unknown") continue;

      map.set(schoolKey, {
        district: record.district?.trim() || "N/A",
        region: record.region?.trim() || "N/A",
      });
    }

    return map;
  }, [schoolRecords]);

  const previousSubmissionById = useMemo(() => {
    const grouped = new Map<string, IndicatorSubmission[]>();

    for (const submission of submissions) {
      const schoolKey = normalizeSchoolKey(submission.school?.schoolCode ?? null, submission.school?.name ?? null);
      if (schoolKey === "unknown") continue;

      if (!grouped.has(schoolKey)) {
        grouped.set(schoolKey, []);
      }

      grouped.get(schoolKey)?.push(submission);
    }

    const map = new Map<string, IndicatorSubmission | null>();

    for (const group of grouped.values()) {
      group.sort((a, b) => submissionTime(b) - submissionTime(a));

      for (let index = 0; index < group.length; index += 1) {
        const current = group[index];
        const older = group.slice(index + 1);
        const matchingPeriod = older.find((candidate) => candidate.reportingPeriod === current.reportingPeriod) ?? null;
        map.set(current.id, matchingPeriod ?? older[0] ?? null);
      }
    }

    return map;
  }, [submissions]);

  const reviewRows = useMemo<ReviewQueueRow[]>(() => {
    const now = Date.now();

    return visibleSubmissions.map((submission) => {
      const schoolKey = normalizeSchoolKey(submission.school?.schoolCode ?? null, submission.school?.name ?? null);
      const schoolMeta = schoolMetaByKey.get(schoolKey);

      const submittedAtValue = submissionTime(submission);
      const reviewedAtValue = reviewedTime(submission);

      const pendingHours =
        submission.status === "submitted" && submittedAtValue > 0
          ? Math.max(0, (now - submittedAtValue) / (1000 * 60 * 60))
          : 0;

      const priority = computePriority(submission.status, pendingHours);
      const overdue = submission.status === "submitted" && pendingHours >= 72;

      const reviewDurationHours =
        submittedAtValue > 0 && reviewedAtValue > 0
          ? Math.max(0, (reviewedAtValue - submittedAtValue) / (1000 * 60 * 60))
          : null;

      const missingFields: string[] = [];
      if (!submission.reportingPeriod) {
        missingFields.push("Reporting period is missing.");
      }

      if (submission.indicators.length === 0) {
        missingFields.push("No indicator entries submitted.");
      }

      for (const entry of submission.indicators) {
        if (!entry.metric?.code) {
          missingFields.push("Indicator reference is missing for one or more rows.");
          break;
        }
      }

      for (const entry of submission.indicators) {
        if (entry.complianceStatus !== "below_target") continue;
        if ((entry.remarks ?? "").trim().length === 0) {
          missingFields.push(`${entry.metric?.code ?? "Indicator"}: remarks required for below target result.`);
          break;
        }
      }

      const evidenceLinks = extractLinks(
        submission.notes,
        submission.reviewNotes,
        ...submission.indicators.map((entry) => entry.remarks),
      );

      const assignedReviewer =
        reviewAssignments[submission.id]?.trim() ||
        submission.reviewedBy?.name?.trim() ||
        "Unassigned";

      const searchableText = [
        submission.id,
        submission.school?.name ?? "",
        submission.school?.schoolCode ?? "",
        schoolMeta?.district ?? "",
        schoolMeta?.region ?? "",
        submission.reportingPeriod ?? "",
        workflowLabel(submission.status),
        assignedReviewer,
        submission.notes ?? "",
        submission.reviewNotes ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return {
        submission,
        schoolKey,
        schoolName: submission.school?.name?.trim() || "N/A",
        schoolCode: submission.school?.schoolCode?.trim() || "N/A",
        district: schoolMeta?.district ?? "N/A",
        region: schoolMeta?.region ?? "N/A",
        submissionType: "Indicator Package",
        submittedAt: submission.submittedAt,
        reviewedAt: submission.reviewedAt,
        status: submission.status,
        reviewer: submission.reviewedBy?.name?.trim() || "Unassigned",
        assignedReviewer,
        daysPending: submission.status === "submitted" ? Math.floor(pendingHours / 24) : 0,
        pendingHours,
        priority,
        overdue,
        reviewDurationHours,
        missingFields,
        evidenceLinks,
        previousSubmission: previousSubmissionById.get(submission.id) ?? null,
        searchableText,
      };
    });
  }, [visibleSubmissions, schoolMetaByKey, reviewAssignments, previousSubmissionById]);

  const districtRegionOptions = useMemo(() => {
    const districts = new Set<string>();
    const regions = new Set<string>();

    for (const row of reviewRows) {
      if (row.district !== "N/A") districts.add(row.district);
      if (row.region !== "N/A") regions.add(row.region);
    }

    return {
      districts: [...districts].sort((a, b) => a.localeCompare(b)),
      regions: [...regions].sort((a, b) => a.localeCompare(b)),
    };
  }, [reviewRows]);

  const reviewerOptions = useMemo(() => {
    const values = new Set<string>();

    if (username.trim()) {
      values.add(username.trim());
    }

    for (const row of reviewRows) {
      if (row.assignedReviewer !== "Unassigned") {
        values.add(row.assignedReviewer);
      }
      if (row.reviewer !== "Unassigned") {
        values.add(row.reviewer);
      }
    }

    for (const value of Object.values(reviewAssignments)) {
      if (value.trim()) {
        values.add(value.trim());
      }
    }

    return [...values].sort((a, b) => a.localeCompare(b));
  }, [reviewRows, reviewAssignments, username]);

  const searchTerms = useMemo(() => normalizeSearchTerms(search), [search]);

  const filteredRows = useMemo(() => {
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

    return [...reviewRows]
      .filter((row) => {
        if (!matchesAllTerms(row.searchableText, searchTerms)) {
          return false;
        }

        if (statusFilter === "overdue") {
          if (!row.overdue) return false;
        } else if (statusFilter !== "all" && row.status !== statusFilter) {
          return false;
        }

        if (submissionTypeFilter !== "all" && submissionTypeFilter !== "indicator") {
          return false;
        }

        if (districtRegionFilter !== "all") {
          if (districtRegionFilter.startsWith("district:")) {
            const district = districtRegionFilter.slice("district:".length);
            if (row.district !== district) return false;
          }

          if (districtRegionFilter.startsWith("region:")) {
            const region = districtRegionFilter.slice("region:".length);
            if (row.region !== region) return false;
          }
        }

        const submittedAtTime = row.submittedAt ? new Date(row.submittedAt).getTime() : 0;

        if (fromTime !== null) {
          if (submittedAtTime === 0 || submittedAtTime < fromTime) return false;
        }

        if (toTime !== null) {
          if (submittedAtTime === 0 || submittedAtTime > toTime) return false;
        }

        if (priorityFilter !== "all" && row.priority !== priorityFilter) {
          return false;
        }

        if (assignedReviewerFilter !== "all") {
          if (assignedReviewerFilter === "unassigned") {
            if (row.assignedReviewer !== "Unassigned") return false;
          } else if (row.assignedReviewer !== assignedReviewerFilter) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const statusWeight: Record<string, number> = {
          submitted: 0,
          returned: 1,
          validated: 2,
          draft: 3,
        };

        const priorityWeight: Record<Exclude<PriorityFilter, "all">, number> = {
          overdue: 0,
          high: 1,
          medium: 2,
          returned: 3,
          normal: 4,
        };

        const byStatus = (statusWeight[a.status] ?? 9) - (statusWeight[b.status] ?? 9);
        if (byStatus !== 0) return byStatus;

        const byPriority = priorityWeight[a.priority] - priorityWeight[b.priority];
        if (byPriority !== 0) return byPriority;

        return submissionTime(b.submission) - submissionTime(a.submission);
      });
  }, [
    assignedReviewerFilter,
    dateFrom,
    dateTo,
    districtRegionFilter,
    priorityFilter,
    reviewRows,
    searchTerms,
    statusFilter,
    submissionTypeFilter,
  ]);

  useEffect(() => {
    filteredRowsRef.current = filteredRows;
  }, [filteredRows]);

  useEffect(() => {
    setSelectedSubmissionIds((current) =>
      current.filter((id) => filteredRows.some((row) => row.submission.id === id)),
    );
  }, [filteredRows]);

  const selectedRows = useMemo(
    () => filteredRows.filter((row) => selectedIdSet.has(row.submission.id)),
    [filteredRows, selectedIdSet],
  );

  const allVisibleSelected = filteredRows.length > 0 && selectedRows.length === filteredRows.length;

  const kpi = useMemo(() => {
    const forReview = filteredRows.filter((row) => row.status === "submitted").length;
    const returned = filteredRows.filter((row) => row.status === "returned").length;
    const validatedToday = filteredRows.filter((row) => row.status === "validated" && isToday(row.reviewedAt)).length;
    const overdue = filteredRows.filter((row) => row.overdue).length;
    const returnedToday = filteredRows.filter((row) => row.status === "returned" && isToday(row.reviewedAt ?? row.submittedAt)).length;
    const dueIn24h = filteredRows.filter((row) => row.status === "submitted" && row.pendingHours >= 48 && row.pendingHours < 72).length;

    const completedReviewDurations = filteredRows
      .map((row) => row.reviewDurationHours)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    const avgReviewTime =
      completedReviewDurations.length > 0
        ? completedReviewDurations.reduce((sum, value) => sum + value, 0) / completedReviewDurations.length
        : null;

    return {
      forReview,
      returned,
      validatedToday,
      overdue,
      returnedToday,
      dueIn24h,
      avgReviewTime,
    };
  }, [filteredRows]);

  const detailRow = useMemo(
    () => filteredRows.find((row) => row.submission.id === detailSubmissionId)
      ?? reviewRows.find((row) => row.submission.id === detailSubmissionId)
      ?? null,
    [detailSubmissionId, filteredRows, reviewRows],
  );

  const detailHistory = detailSubmissionId ? historyBySubmissionId[detailSubmissionId] ?? [] : [];
  const isDetailHistoryLoading = detailSubmissionId !== null && historyLoadingSubmissionId === detailSubmissionId;

  const ensureHistoryLoaded = async (submissionId: string) => {
    if (historyBySubmissionId[submissionId]) {
      return;
    }

    setHistoryLoadingSubmissionId(submissionId);
    try {
      const history = await loadHistory(submissionId);
      setHistoryBySubmissionId((current) => ({ ...current, [submissionId]: history }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load package history.";
      setActionError(message);
      onToast?.(message, "warning");
    } finally {
      setHistoryLoadingSubmissionId(null);
    }
  };

  const openDetails = (row: ReviewQueueRow) => {
    setDetailSubmissionId(row.submission.id);
    setDetailTab("overview");
    void ensureHistoryLoaded(row.submission.id);
  };

  const closeDetails = () => {
    setDetailSubmissionId(null);
  };

  const detailRowIndex = detailRow ? filteredRows.findIndex((row) => row.submission.id === detailRow.submission.id) : -1;
  const hasNextDetailRow = detailRowIndex >= 0 && detailRowIndex < filteredRows.length - 1;

  const openNextDetailRow = () => {
    if (!hasNextDetailRow) return;
    const nextRow = filteredRows[detailRowIndex + 1];
    if (!nextRow) return;
    openDetails(nextRow);
  };

  const autoFocusNextQueueRow = (completedSubmissionId: string) => {
    const rows = filteredRowsRef.current;
    if (rows.length === 0) {
      setDetailSubmissionId(null);
      return;
    }

    const currentIndex = rows.findIndex((row) => row.submission.id === completedSubmissionId);
    if (currentIndex === -1) {
      openDetails(rows[0]);
      return;
    }

    const candidate = rows[currentIndex + 1] ?? rows[currentIndex - 1] ?? null;
    if (candidate) {
      openDetails(candidate);
      return;
    }

    setDetailSubmissionId(null);
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDistrictRegionFilter("all");
    setSubmissionTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    setPriorityFilter("all");
    setAssignedReviewerFilter("all");
    setActiveSavedView(null);
  };

  const applySavedView = (view: ReviewSavedView) => {
    const today = new Date().toISOString().slice(0, 10);
    const normalizedUser = username.trim();
    setActiveSavedView(view);

    setSearch("");
    setDistrictRegionFilter("all");
    setSubmissionTypeFilter("all");
    setShowAdvancedControls(false);
    setDateFrom("");
    setDateTo("");
    setPriorityFilter("all");

    if (view === "needs_action") {
      setStatusFilter("submitted");
      setAssignedReviewerFilter("all");
      return;
    }

    if (view === "my_queue") {
      setStatusFilter("submitted");
      setAssignedReviewerFilter(normalizedUser.length > 0 ? normalizedUser : "all");
      return;
    }

    if (view === "unassigned") {
      setStatusFilter("submitted");
      setAssignedReviewerFilter("unassigned");
      return;
    }

    if (view === "overdue_72h") {
      setStatusFilter("overdue");
      setPriorityFilter("overdue");
      setAssignedReviewerFilter("all");
      return;
    }

    setStatusFilter("returned");
    setAssignedReviewerFilter("all");
    setDateFrom(today);
    setDateTo(today);
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedSubmissionIds([]);
      return;
    }

    setSelectedSubmissionIds(filteredRows.map((row) => row.submission.id));
  };

  const toggleRowSelection = (submissionId: string) => {
    setSelectedSubmissionIds((current) => {
      if (current.includes(submissionId)) {
        return current.filter((id) => id !== submissionId);
      }
      return [...current, submissionId];
    });
  };

  const openReviewAction = (submission: IndicatorSubmission, action: ReviewDecisionAction) => {
    setReviewAction({ submission, action });
    setReviewActionNotes(action === "clarification" ? "Please review the noted indicators and update the package." : "");
    setReviewActionError("");
  };

  const closeReviewAction = () => {
    if (isReviewActionRunning) return;
    setReviewAction(null);
    setReviewActionNotes("");
    setReviewActionError("");
  };

  const runReviewAction = async () => {
    if (!reviewAction) return;

    const { submission, action } = reviewAction;
    const trimmedNotes = reviewActionNotes.trim();

    if ((action === "returned" || action === "escalated") && trimmedNotes.length === 0) {
      setReviewActionError("Reason or comment is required for return and escalation.");
      return;
    }

    setIsReviewActionRunning(true);
    setActionError("");
    setActionMessage("");

    try {
      const backendDecision = action === "validated" ? "validated" : "returned";
      const payloadNotes = buildDecisionNotes(action, reviewActionNotes);

      await reviewSubmission(submission.id, backendDecision, payloadNotes ?? undefined);
      await ensureHistoryLoaded(submission.id);

      const successMessage = `${readableActionLabel(action)} completed for package #${submission.id}.`;
      setActionMessage(successMessage);
      onToast?.(successMessage, backendDecision === "validated" ? "success" : "warning");

      if (onSendReminder) {
        const schoolKey = normalizeSchoolKey(submission.school?.schoolCode ?? null, submission.school?.name ?? null);
        const schoolName = submission.school?.name ?? "Selected school";

        if (schoolKey !== "unknown") {
          const reminderReason = payloadNotes ? ` Reason: ${payloadNotes}` : "";
          const reminderNote = `Review update (${readableActionLabel(action)}) for package #${submission.id}.${reminderReason}`;

          try {
            await onSendReminder(schoolKey, schoolName, reminderNote);
            onToast?.(`School head notified for ${schoolName}.`, "info");
          } catch (err) {
            const notifyError = err instanceof Error ? err.message : "Unable to send auto-notification.";
            onToast?.(notifyError, "warning");
          }
        }
      }

      setReviewAction(null);
      setReviewActionNotes("");
      setReviewActionError("");

      if (action === "validated" || action === "returned") {
        window.setTimeout(() => {
          autoFocusNextQueueRow(submission.id);
        }, 120);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to complete review action.";
      setReviewActionError(message);
      setActionError(message);
      onToast?.(message, "warning");
    } finally {
      setIsReviewActionRunning(false);
    }
  };

  useEffect(() => {
    if (!detailRow) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName.toLowerCase();
        if (tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable) {
          return;
        }
      }

      const key = event.key.toLowerCase();

      if (key === "n") {
        if (!hasNextDetailRow) return;
        event.preventDefault();
        openNextDetailRow();
        return;
      }

      if (detailRow.status !== "submitted") return;

      if (key === "v") {
        event.preventDefault();
        openReviewAction(detailRow.submission, "validated");
      }

      if (key === "r") {
        event.preventDefault();
        openReviewAction(detailRow.submission, "returned");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailRow, hasNextDetailRow, openNextDetailRow, openReviewAction]);

  const applyBatchReviewer = () => {
    if (selectedRows.length === 0) {
      onToast?.("Select at least one row for batch assignment.", "warning");
      return;
    }

    setReviewAssignments((current) => {
      const next = { ...current };

      for (const row of selectedRows) {
        if (batchReviewer === UNASSIGNED_REVIEWER_VALUE || batchReviewer.trim().length === 0) {
          delete next[row.submission.id];
        } else {
          next[row.submission.id] = batchReviewer.trim();
        }
      }

      return next;
    });

    const message =
      batchReviewer === UNASSIGNED_REVIEWER_VALUE || batchReviewer.trim().length === 0
        ? `Reviewer assignment cleared for ${selectedRows.length} package(s).`
        : `Assigned ${batchReviewer.trim()} to ${selectedRows.length} package(s).`;

    onToast?.(message, "success");
  };

  const sendBatchReminders = async () => {
    if (!onSendReminder) {
      onToast?.("Reminder hook is unavailable in this view.", "warning");
      return;
    }

    if (selectedRows.length === 0) {
      onToast?.("Select at least one row before sending reminders.", "warning");
      return;
    }

    const promptNotes = window.prompt("Reminder summary (optional):", "");
    if (promptNotes === null) {
      return;
    }

    const schoolMap = new Map<string, ReviewQueueRow>();
    for (const row of selectedRows) {
      if (row.schoolKey === "unknown") continue;
      if (!schoolMap.has(row.schoolKey)) {
        schoolMap.set(row.schoolKey, row);
      }
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const row of schoolMap.values()) {
      try {
        const notePrefix = promptNotes.trim().length > 0 ? `${promptNotes.trim()} ` : "";
        const note = `${notePrefix}Pending review package #${row.submission.id} (${row.submission.reportingPeriod ?? "N/A"}).`;
        await onSendReminder(row.schoolKey, row.schoolName, note);
        sentCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    if (sentCount > 0) {
      onToast?.(`Reminder sent to ${sentCount} school(s).`, "success");
    }

    if (failedCount > 0) {
      onToast?.(`${failedCount} reminder(s) could not be sent.`, "warning");
    }
  };

  const exportSelectedRows = () => {
    if (selectedRows.length === 0) {
      onToast?.("Select at least one row before exporting.", "warning");
      return;
    }

    downloadCsv(`review-queue-selected-${new Date().toISOString().slice(0, 10)}.csv`, toExportRows(selectedRows));
    onToast?.(`Exported ${selectedRows.length} selected row(s).`, "success");
  };

  const exportFilteredRows = () => {
    if (filteredRows.length === 0) {
      onToast?.("No filtered rows available for export.", "warning");
      return;
    }

    downloadCsv(`review-queue-filtered-${new Date().toISOString().slice(0, 10)}.csv`, toExportRows(filteredRows));
    onToast?.(`Exported ${filteredRows.length} filtered row(s).`, "success");
  };

  const hasAdvancedFiltersActive =
    districtRegionFilter !== "all" ||
    submissionTypeFilter !== "all" ||
    dateFrom.length > 0 ||
    dateTo.length > 0 ||
    priorityFilter !== "all" ||
    assignedReviewerFilter !== "all";

  const panelClassName = embedded
    ? "overflow-hidden"
    : "surface-panel mt-5 animate-fade-slide overflow-hidden rounded-sm";

  return (
    <section className={panelClassName}>
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Division Review Center</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              End-to-end monitor review queue with SLA controls, decisions, and audit trail.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshSubmissions()}
            className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : "Not synced yet"}
          {schoolFilterKeys ? " - Global school filter is active" : ""}
        </p>
      </div>

      <div className="border-b border-slate-100 px-5 py-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Today's Work</p>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <article className="rounded-sm border border-slate-200 bg-white px-3 py-2">
            <p className="text-[11px] font-medium text-slate-500">For review</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{kpi.forReview}</p>
          </article>
          <article className="rounded-sm border border-slate-200 bg-white px-3 py-2">
            <p className="text-[11px] font-medium text-slate-500">Overdue</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{kpi.overdue}</p>
          </article>
          <article className="rounded-sm border border-slate-200 bg-white px-3 py-2">
            <p className="text-[11px] font-medium text-slate-500">Returned today</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{kpi.returnedToday}</p>
          </article>
          <article className="rounded-sm border border-slate-200 bg-white px-3 py-2">
            <p className="text-[11px] font-medium text-slate-500">Due in 24h</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{kpi.dueIn24h}</p>
          </article>
          <article className="rounded-sm border border-slate-200 bg-white px-3 py-2">
            <p className="text-[11px] font-medium text-slate-500">Avg review time</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{formatHours(kpi.avgReviewTime)}</p>
          </article>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Returned total: <span className="font-semibold text-slate-700">{kpi.returned}</span> | Validated today:{" "}
          <span className="font-semibold text-slate-700">{kpi.validatedToday}</span>
        </p>
      </div>

      <div className="border-b border-slate-100 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Saved Views</span>
          <button
            type="button"
            onClick={() => applySavedView("needs_action")}
            className={savedViewButtonClass("needs_action", activeSavedView === "needs_action")}
          >
            Needs Action
          </button>
          <button
            type="button"
            onClick={() => applySavedView("my_queue")}
            className={savedViewButtonClass("my_queue", activeSavedView === "my_queue")}
          >
            My Queue
          </button>
          <button
            type="button"
            onClick={() => applySavedView("unassigned")}
            className={savedViewButtonClass("unassigned", activeSavedView === "unassigned")}
          >
            Unassigned
          </button>
          <button
            type="button"
            onClick={() => applySavedView("overdue_72h")}
            className={savedViewButtonClass("overdue_72h", activeSavedView === "overdue_72h")}
          >
            Overdue 72h+
          </button>
          <button
            type="button"
            onClick={() => applySavedView("returned_today")}
            className={savedViewButtonClass("returned_today", activeSavedView === "returned_today")}
          >
            Returned Today
          </button>
        </div>
      </div>

      <div className="border-b border-slate-100 px-5 py-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Search</span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="School, code, reviewer, note"
              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ReviewStatusFilter)}
              className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            >
              <option value="all">All</option>
              <option value="submitted">For review</option>
              <option value="returned">Returned</option>
              <option value="validated">Validated</option>
              <option value="overdue">Overdue</option>
            </select>
          </label>

          <div className="flex items-end gap-2">
            <div className="inline-flex rounded-sm border border-slate-300 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setQueueDensity("comfortable")}
                className={`rounded-sm px-2 py-1 text-[11px] font-semibold transition ${
                  queueDensity === "comfortable" ? "bg-primary-50 text-primary-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Comfortable
              </button>
              <button
                type="button"
                onClick={() => setQueueDensity("compact")}
                className={`rounded-sm px-2 py-1 text-[11px] font-semibold transition ${
                  queueDensity === "compact" ? "bg-primary-50 text-primary-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Compact
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvancedControls((current) => !current)}
              className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              {showAdvancedControls ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showAdvancedControls ? "Hide advanced" : "More filters"}
              {hasAdvancedFiltersActive && !showAdvancedControls ? " - active" : ""}
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-600">
          Showing <span className="font-semibold text-slate-900">{filteredRows.length}</span> of{" "}
          <span className="font-semibold text-slate-900">{reviewRows.length}</span> submissions.
        </p>

        {showAdvancedControls && (
          <div className="mt-4 rounded-sm border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-3 lg:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">District / Region</span>
                <select
                  value={districtRegionFilter}
                  onChange={(event) => setDistrictRegionFilter(event.target.value as DistrictRegionFilter)}
                  className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                >
                  <option value="all">All districts and regions</option>
                  {districtRegionOptions.districts.map((district) => (
                    <option key={`district-${district}`} value={`district:${district}`}>
                      District: {district}
                    </option>
                  ))}
                  {districtRegionOptions.regions.map((region) => (
                    <option key={`region-${region}`} value={`region:${region}`}>
                      Region: {region}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Submission Type</span>
                <select
                  value={submissionTypeFilter}
                  onChange={(event) => setSubmissionTypeFilter(event.target.value as SubmissionTypeFilter)}
                  className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                >
                  <option value="all">All types</option>
                  <option value="indicator">Indicator Package</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Date From</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Date To</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
              </label>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Priority</span>
                <select
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
                  className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                >
                  <option value="all">All priorities</option>
                  <option value="normal">Normal</option>
                  <option value="medium">24h</option>
                  <option value="high">48h</option>
                  <option value="overdue">72h+ Overdue</option>
                  <option value="returned">Returned</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Assigned Reviewer</span>
                <select
                  value={assignedReviewerFilter}
                  onChange={(event) => setAssignedReviewerFilter(event.target.value as AssignedReviewerFilter)}
                  className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                >
                  <option value="all">All reviewers</option>
                  <option value="unassigned">Unassigned</option>
                  {reviewerOptions.map((reviewer) => (
                    <option key={`reviewer-filter-${reviewer}`} value={reviewer}>
                      {reviewer}
                    </option>
                  ))}
                </select>
              </label>

              <div className="lg:col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-600">SLA quick picks</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPriorityFilter("medium")}
                    className="rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                  >
                    24h+
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriorityFilter("high")}
                    className="rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                  >
                    48h+
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriorityFilter("overdue")}
                    className="rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                  >
                    72h+
                  </button>
                </div>
              </div>
            </div>

            {selectedRows.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Batch reviewer</label>
                  <div className="inline-flex items-center gap-2">
                    <select
                      value={batchReviewer}
                      onChange={(event) => setBatchReviewer(event.target.value)}
                      className="rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                    >
                      <option value={UNASSIGNED_REVIEWER_VALUE}>Unassigned</option>
                      {reviewerOptions.map((reviewer) => (
                        <option key={`batch-reviewer-${reviewer}`} value={reviewer}>
                          {reviewer}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={applyBatchReviewer}
                      className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Apply
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void sendBatchReminders()}
                  className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Send reminders
                </button>

                <button
                  type="button"
                  onClick={exportSelectedRows}
                  className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export selected
                </button>

                <button
                  type="button"
                  onClick={exportFilteredRows}
                  className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export filtered
                </button>

                <p className="text-xs text-slate-500">{selectedRows.length} selected</p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Select queue rows to enable batch assignment, reminders, and exports.</p>
            )}
          </div>
        )}
      </div>

      <div className="px-5 py-4">
        {actionMessage && (
          <p className="mb-3 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
            {actionMessage}
          </p>
        )}
        {actionError && (
          <p className="mb-3 rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {actionError}
          </p>
        )}
        {error && (
          <p className="mb-3 rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {error}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className={`min-w-full ${queueDensity === "compact" ? "review-queue-table-compact" : ""}`}>
            <thead className="table-head-sticky">
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                    aria-label="Select all"
                  />
                </th>
                <th className="px-2 py-2 text-left">School</th>
                <th className="px-2 py-2 text-left">District</th>
                <th className="px-2 py-2 text-left">Submission Type</th>
                <th className="px-2 py-2 text-left">Period</th>
                <th className="px-2 py-2 text-left">Submitted At</th>
                <th className="px-2 py-2 text-center">Status</th>
                <th className="px-2 py-2 text-center">Days Pending</th>
                <th className="px-2 py-2 text-center">Priority</th>
                <th className="px-2 py-2 text-left">Reviewer</th>
                <th className="px-2 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => {
                const isSelected = selectedIdSet.has(row.submission.id);
                const isSubmitted = row.status === "submitted";
                const rowTone = row.priority === "overdue" ? "bg-rose-50/70" : row.priority === "high" ? "bg-amber-50/45" : "";

                return (
                  <tr key={row.submission.id} className={rowTone}>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRowSelection(row.submission.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                        aria-label={`Select package ${row.submission.id}`}
                      />
                    </td>
                    <td className="px-2 py-2 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">{row.schoolName}</p>
                      <p className="text-xs text-slate-500">{row.schoolCode}</p>
                    </td>
                    <td className="px-2 py-2 text-sm text-slate-700">
                      <p>{row.district}</p>
                      <p className="text-xs text-slate-500">{row.region}</p>
                    </td>
                    <td className="px-2 py-2 text-sm text-slate-700">{row.submissionType}</td>
                    <td className="px-2 py-2 text-sm text-slate-700">{row.submission.reportingPeriod || "N/A"}</td>
                    <td className="px-2 py-2 text-sm text-slate-600">{formatDateTime(row.submittedAt)}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${workflowTone(row.status)}`}>
                        {workflowLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center text-sm text-slate-700">
                      <p className="font-semibold">{formatDays(row.daysPending)}</p>
                      {isSubmitted && (
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${priorityTone(row.priority)}`}>
                          <Clock3 className="mr-1 h-3 w-3" />
                          {priorityLabel(row.priority)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${priorityTone(row.priority)}`}>
                        {priorityLabel(row.priority)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-sm text-slate-700">{row.assignedReviewer}</td>
                    <td className="px-2 py-2 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {isSubmitted && (
                          <>
                            <button
                              type="button"
                              onClick={() => openReviewAction(row.submission, "validated")}
                              disabled={isSaving || isLoading}
                              className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Validate
                            </button>
                            {isSelected && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openReviewAction(row.submission, "returned")}
                                  disabled={isSaving || isLoading}
                                  className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Return
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openReviewAction(row.submission, "clarification")}
                                  disabled={isSaving || isLoading}
                                  className="inline-flex items-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  <AlertCircle className="h-3 w-3" />
                                  Clarify
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openReviewAction(row.submission, "escalated")}
                                  disabled={isSaving || isLoading}
                                  className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  <Send className="h-3 w-3" />
                                  Escalate
                                </button>
                              </>
                            )}
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => openDetails(row)}
                          className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          <Eye className="h-3 w-3" />
                          Details
                        </button>
                        {isSubmitted && !isSelected && (
                          <span className="text-[10px] font-medium text-slate-500">Select row for more actions</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-2 py-8 text-center text-sm text-slate-500">
                    No review queue rows match your current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailRow && (
        <>
          <button
            type="button"
            onClick={closeDetails}
            className="fixed inset-0 z-[72] bg-slate-900/35"
            aria-label="Close submission details"
          />
          <aside className="fixed right-0 top-0 z-[73] h-screen w-[min(52rem,100vw)] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Submission Detail Panel</p>
                  <h3 className="mt-1 text-base font-bold text-slate-900">
                    {detailRow.schoolName} - Package #{detailRow.submission.id}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeDetails}
                  className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="border-b border-slate-200 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDetailTab("overview")}
                  className={`inline-flex rounded-sm border px-2.5 py-1 text-xs font-semibold transition ${
                    detailTab === "overview"
                      ? "border-primary-200 bg-primary-50 text-primary-700"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Overview
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab("checklist")}
                  className={`inline-flex rounded-sm border px-2.5 py-1 text-xs font-semibold transition ${
                    detailTab === "checklist"
                      ? "border-primary-200 bg-primary-50 text-primary-700"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Checklist
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab("history")}
                  className={`inline-flex rounded-sm border px-2.5 py-1 text-xs font-semibold transition ${
                    detailTab === "history"
                      ? "border-primary-200 bg-primary-50 text-primary-700"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  History
                </button>
                <span className="ml-auto text-[11px] text-slate-500">Keyboard: V validate, R return, N next</span>
                {hasNextDetailRow && (
                  <button
                    type="button"
                    onClick={openNextDetailRow}
                    className="inline-flex items-center rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Next Row
                  </button>
                )}
              </div>
            </div>

            {detailTab === "overview" && (
              <>
                <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1.2fr_1fr]">
                  <article className="rounded-sm border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Submission Overview</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <p className="text-xs text-slate-700"><span className="font-semibold">School:</span> {detailRow.schoolName}</p>
                      <p className="text-xs text-slate-700"><span className="font-semibold">Code:</span> {detailRow.schoolCode}</p>
                      <p className="text-xs text-slate-700"><span className="font-semibold">District:</span> {detailRow.district}</p>
                      <p className="text-xs text-slate-700"><span className="font-semibold">Region:</span> {detailRow.region}</p>
                      <p className="text-xs text-slate-700"><span className="font-semibold">Submission Type:</span> {detailRow.submissionType}</p>
                      <p className="text-xs text-slate-700"><span className="font-semibold">Period:</span> {detailRow.submission.reportingPeriod ?? "N/A"}</p>
                      <p className="text-xs text-slate-700"><span className="font-semibold">Submitted:</span> {formatDateTime(detailRow.submittedAt)}</p>
                      <p className="text-xs text-slate-700"><span className="font-semibold">Reviewed:</span> {formatDateTime(detailRow.reviewedAt)}</p>
                      <p className="text-xs text-slate-700"><span className="font-semibold">Status:</span> {workflowLabel(detailRow.status)}</p>
                      <p className="text-xs text-slate-700"><span className="font-semibold">Reviewer:</span> {detailRow.assignedReviewer}</p>
                    </div>
                    {detailRow.submission.notes && (
                      <p className="mt-3 rounded-sm border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700">
                        <span className="font-semibold">School note:</span> {detailRow.submission.notes}
                      </p>
                    )}
                    {detailRow.submission.reviewNotes && (
                      <p className="mt-2 rounded-sm border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700">
                        <span className="font-semibold">Review note:</span> {detailRow.submission.reviewNotes}
                      </p>
                    )}
                  </article>

                  <article className="rounded-sm border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Previous Cycle Comparison</p>
                    {detailRow.previousSubmission ? (
                      <div className="mt-2 space-y-1 text-xs text-slate-700">
                        <p>
                          <span className="font-semibold">Previous Package:</span> #{detailRow.previousSubmission.id}
                        </p>
                        <p>
                          <span className="font-semibold">Previous Period:</span> {detailRow.previousSubmission.reportingPeriod ?? "N/A"}
                        </p>
                        <p>
                          <span className="font-semibold">Previous Compliance:</span>{" "}
                          {detailRow.previousSubmission.summary.complianceRatePercent.toFixed(2)}%
                        </p>
                        <p>
                          <span className="font-semibold">Current Compliance:</span>{" "}
                          {detailRow.submission.summary.complianceRatePercent.toFixed(2)}%
                        </p>
                        <p>
                          <span className="font-semibold">Change:</span>{" "}
                          {(detailRow.submission.summary.complianceRatePercent - detailRow.previousSubmission.summary.complianceRatePercent).toFixed(2)}%
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">No previous cycle package found for comparison.</p>
                    )}
                  </article>
                </div>

                <div className="grid gap-4 px-5 pb-5 lg:grid-cols-2">
                  <article className="rounded-sm border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Missing Fields</p>
                    {detailRow.missingFields.length === 0 ? (
                      <p className="mt-2 text-xs text-primary-700">No missing fields detected in this submission snapshot.</p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {detailRow.missingFields.map((field) => (
                          <li key={field} className="text-xs text-slate-700">
                            - {field}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>

                  <article className="rounded-sm border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Attachment / Evidence Links</p>
                    {detailRow.evidenceLinks.length === 0 ? (
                      <p className="mt-2 text-xs text-slate-500">No evidence links found in notes or indicator remarks.</p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {detailRow.evidenceLinks.map((link) => (
                          <li key={link} className="text-xs">
                            <a href={link} target="_blank" rel="noreferrer" className="text-primary-700 underline">
                              {link}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                </div>
              </>
            )}

            {detailTab === "checklist" && (
              <div className="px-5 py-4">
                <article className="rounded-sm border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Indicator Checklist</p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="table-head-sticky">
                        <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          <th className="px-2 py-2 text-left">Indicator</th>
                          <th className="px-2 py-2 text-right">Target</th>
                          <th className="px-2 py-2 text-right">Actual</th>
                          <th className="px-2 py-2 text-right">Variance</th>
                          <th className="px-2 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detailRow.submission.indicators.map((entry) => (
                          <tr key={entry.id}>
                            <td className="px-2 py-2 text-xs text-slate-700">
                              <p className="font-semibold text-slate-900">{entry.metric?.code || "N/A"}</p>
                              <p className="text-slate-500">{entry.metric?.name || "Unknown metric"}</p>
                            </td>
                            <td className="px-2 py-2 text-right text-xs text-slate-700">{entry.targetDisplay ?? entry.targetValue}</td>
                            <td className="px-2 py-2 text-right text-xs text-slate-700">{entry.actualDisplay ?? entry.actualValue}</td>
                            <td className="px-2 py-2 text-right text-xs text-slate-700">{entry.varianceValue}</td>
                            <td className="px-2 py-2 text-center">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${complianceTone(entry.complianceStatus)}`}>
                                {entry.complianceStatus === "met" ? "Met" : "Below"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>
            )}

            {detailTab === "history" && (
              <div className="px-5 py-4">
                <article className="rounded-sm border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Review Notes + Audit Trail</p>
                  <div className="mt-2 space-y-2">
                    {isDetailHistoryLoading ? (
                      <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">Loading history...</p>
                    ) : detailHistory.length === 0 ? (
                      <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">No history entries found.</p>
                    ) : (
                      detailHistory.map((entry) => (
                        <article key={entry.id} className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                            {entry.action} - {formatDateTime(entry.createdAt)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-600">
                            {entry.fromStatusLabel || "N/A"} -&gt; {entry.toStatusLabel || "N/A"}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-600">
                            {entry.actor?.name ? `By ${entry.actor.name}` : "System action"}
                          </p>
                          {entry.notes && <p className="mt-1 text-xs text-slate-700">{entry.notes}</p>}
                        </article>
                      ))
                    )}
                  </div>
                </article>
              </div>
            )}

            {detailRow.status === "submitted" && (
              <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Quick Decision
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openReviewAction(detailRow.submission, "returned")}
                      disabled={isSaving || isLoading}
                      className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Return
                    </button>
                    <button
                      type="button"
                      onClick={() => openReviewAction(detailRow.submission, "validated")}
                      disabled={isSaving || isLoading}
                      className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Validate
                    </button>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </>
      )}

      {reviewAction && (
        <>
          <button
            type="button"
            onClick={closeReviewAction}
            className="fixed inset-0 z-[80] bg-slate-900/40"
            aria-label="Close review action modal"
          />
          <section className="fixed inset-x-4 top-1/2 z-[81] mx-auto w-[min(42rem,100vw-2rem)] -translate-y-1/2 rounded-sm border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                {readableActionLabel(reviewAction.action)} - Package #{reviewAction.submission.id}
              </h3>
              <button
                type="button"
                onClick={closeReviewAction}
                className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
                disabled={isReviewActionRunning}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 py-4">
              <p className="text-xs text-slate-600">
                School: <span className="font-semibold text-slate-900">{reviewAction.submission.school?.name ?? "N/A"}</span>
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Decision actions update workflow status and trigger audit history. Return and escalate require a reason.
              </p>

              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Reason / Comments</span>
                <textarea
                  value={reviewActionNotes}
                  onChange={(event) => {
                    setReviewActionNotes(event.target.value);
                    setReviewActionError("");
                  }}
                  rows={5}
                  placeholder="Write clear review notes for school head and audit trail..."
                  className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
              </label>

              {reviewActionError && (
                <p className="mt-2 rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  {reviewActionError}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeReviewAction}
                  className="rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  disabled={isReviewActionRunning}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void runReviewAction()}
                  disabled={isReviewActionRunning || isSaving || isLoading}
                  className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isReviewActionRunning ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      Confirm {readableActionLabel(reviewAction.action)}
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </section>
  );
}

