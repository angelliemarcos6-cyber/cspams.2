import type { MonitorSchoolRequirementSummary } from "@/pages/monitor/MonitorSchoolRecordsList";
import {
  normalizeDateInput,
  type QueueLane,
  type RequirementFilter,
  type SchoolQuickPreset,
} from "@/pages/monitor/monitorFilters";

type SchoolRequirementSummary = MonitorSchoolRequirementSummary;
type WorkflowStatus = Exclude<RequirementFilter, "all">;

export function normalizeSchoolKey(schoolCode: string | null | undefined, schoolName: string | null | undefined): string {
  const code = schoolCode?.trim().toLowerCase();
  if (code) return `code:${code}`;

  const name = schoolName?.trim().toLowerCase();
  if (name) return `name:${name}`;

  return "unknown";
}

export function normalizeSearchTerms(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

export function matchesAllSearchTerms(searchableText: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  return terms.every((term) => searchableText.includes(term));
}

export function isPassedToMonitor(status: string | null): boolean {
  return status === "submitted" || status === "validated" || status === "returned";
}

export function isAwaitingReview(status: string | null): boolean {
  return status === "submitted";
}

export function resolveWorkflowStatus(summary: SchoolRequirementSummary): WorkflowStatus {
  if (summary.missingCount > 0) return "missing";
  if (summary.indicatorStatus === "returned") return "returned";
  if (summary.awaitingReviewCount > 0 || summary.indicatorStatus === "submitted") return "waiting";
  if (summary.indicatorStatus === "validated") return "validated";
  if (summary.hasAnySubmitted) return "submitted";
  return "missing";
}

export function parseDateBoundary(value: string | null | undefined, boundary: "start" | "end"): number | null {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;

  const suffix = boundary === "start" ? "T00:00:00" : "T23:59:59.999";
  const parsed = new Date(`${normalized}${suffix}`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function matchesRequirementFilter(summary: SchoolRequirementSummary, filter: RequirementFilter): boolean {
  if (filter === "all") return true;
  return resolveWorkflowStatus(summary) === filter;
}

function isUrgentRequirement(row: SchoolRequirementSummary): boolean {
  return row.missingCount > 0 || row.indicatorStatus === "returned";
}

export function queuePriorityScore(row: SchoolRequirementSummary): number {
  if (row.indicatorStatus === "returned") return 0;
  if (row.missingCount > 0) return 1;
  if (row.awaitingReviewCount > 0) return 2;
  return 3;
}

export function matchesQueueLane(row: SchoolRequirementSummary, lane: QueueLane): boolean {
  if (lane === "all") return true;
  if (lane === "urgent") return row.missingCount > 0 || row.indicatorStatus === "returned";
  if (lane === "returned") return row.indicatorStatus === "returned";
  if (lane === "for_review") return row.awaitingReviewCount > 0;
  return row.missingCount > 0;
}

export function matchesSchoolQuickPreset(row: SchoolRequirementSummary, preset: SchoolQuickPreset): boolean {
  if (preset === "all") return true;
  if (preset === "pending") return row.awaitingReviewCount > 0 || row.indicatorStatus === "submitted";
  if (preset === "missing") return row.missingCount > 0;
  if (preset === "returned") return row.indicatorStatus === "returned";
  if (preset === "no_submission") return !row.hasComplianceRecord && !row.hasAnySubmitted;
  return isUrgentRequirement(row);
}
